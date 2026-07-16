"""
Aegis-Q Training Loop
=======================
Complete training pipeline for the dual-engine AI system (Engine A + Engine B)
using Focal Loss for the dense-needles insider threat detection task.

Verification Outputs:
  - Logs confirmed FL formula application: FL(p_t) = -α_t(1-p_t)^γ log(p_t)
  - Reports P99 inference latency against ≤35ms target
  - Saves model checkpoints with training metrics
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import torch
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, random_split

from backend.core.focal_loss import get_focal_loss, FocalLoss
from backend.core.psychometric_norm import load_and_normalize_psychometric
from backend.core.fusion_head import ThreatRanker
from backend.core.seq_transformer import build_seq_transformer, EventTokenizer
from backend.ingestion.cert_reader import CERTDatasetReader

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────────────
class CERTThreatDataset(Dataset):
    """
    PyTorch Dataset wrapping CERT r4.2 event sequences.
    Returns: (token_ids, times, label) per session window.
    """

    def __init__(
        self,
        sessions: List[Dict],
        tokenizer: EventTokenizer,
        max_seq_len: int = 512,
    ) -> None:
        self.sessions = sessions
        self.tokenizer = tokenizer
        self.max_seq_len = max_seq_len

    def __len__(self) -> int:
        return len(self.sessions)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        session = self.sessions[idx]
        events = session.get("events", [])
        label = int(session.get("label", 0))  # 1 = insider, 0 = benign

        tokens, times = self.tokenizer.tokenize_session(events)

        # Pad to max_seq_len
        pad_len = self.max_seq_len - len(tokens)
        tokens += [0] * pad_len  # PAD token
        times += [0.0] * pad_len

        return (
            torch.tensor(tokens[:self.max_seq_len], dtype=torch.long),
            torch.tensor(times[:self.max_seq_len], dtype=torch.float),
            torch.tensor(label, dtype=torch.float),
        )


def collate_fn(batch):
    tokens, times, labels = zip(*batch)
    return torch.stack(tokens), torch.stack(times), torch.stack(labels)


# ─────────────────────────────────────────────────────────────────
# Training Utilities
# ─────────────────────────────────────────────────────────────────
def _compute_metrics(
    logits: torch.Tensor,
    labels: torch.Tensor,
    threshold: float = 0.5,
) -> Dict[str, float]:
    preds = (torch.sigmoid(logits) >= threshold).float()
    tp = ((preds == 1) & (labels == 1)).sum().item()
    fp = ((preds == 1) & (labels == 0)).sum().item()
    fn = ((preds == 0) & (labels == 1)).sum().item()
    tn = ((preds == 0) & (labels == 0)).sum().item()

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-7)
    accuracy = (tp + tn) / max(tp + fp + fn + tn, 1)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": accuracy,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def _measure_inference_latency(
    model: torch.nn.Module,
    sample_batch: Tuple,
    n_warmup: int = 20,
    n_samples: int = 200,
    device: str = "cpu",
) -> Dict[str, float]:
    """
    Measure P99 inference latency for the Transformer engine.
    Validates L_p99 ≤ 35ms constraint from spec.
    """
    tokens, times, _ = sample_batch
    tokens = tokens.to(device)
    times = times.to(device)

    model.eval()
    latencies = []

    # Warm-up
    with torch.no_grad():
        for _ in range(n_warmup):
            _ = model(tokens[:1], times[:1])

    # Measurement
    with torch.no_grad():
        for i in range(n_samples):
            t0 = time.perf_counter()
            _ = model(tokens[:1], times[:1])
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

    latencies.sort()
    n = len(latencies)
    return {
        "p50_ms": latencies[int(n * 0.50)],
        "p95_ms": latencies[int(n * 0.95)],
        "p99_ms": latencies[int(n * 0.99)],
        "mean_ms": sum(latencies) / n,
        "within_target": latencies[int(n * 0.99)] <= 35.0,
    }


# ─────────────────────────────────────────────────────────────────
# Main Training Loop
# ─────────────────────────────────────────────────────────────────
def train(
    dataset_path: str,
    answers_path: str,
    output_dir: str = "./models",
    n_epochs: int = 10,
    batch_size: int = 32,
    lr: float = 3e-4,
    device: str = "cpu",
    sample: bool = False,
) -> Dict[str, Any]:
    """
    Train the Sequential Transformer (Engine B) with Focal Loss.

    Returns:
        training_report: dict with loss history, latency metrics, and FL proof
    """
    logger.info("=" * 70)
    logger.info("AEGIS-Q TRAINING LOOP v1.0")
    logger.info(f"Focal Loss: FL(p_t) = -α_t·(1-p_t)^γ·log(p_t), γ={FocalLoss.GAMMA}")
    logger.info(f"Device: {device} | Epochs: {n_epochs} | Batch: {batch_size}")
    logger.info("=" * 70)

    # ── Load Data ────────────────────────────────────────────────
    reader = CERTDatasetReader(dataset_path)
    tokenizer = EventTokenizer()

    logger.info("Building session windows from CERT r4.2 dataset...")
    sessions = _build_session_windows(reader, answers_path, sample=sample)
    logger.info(f"Total sessions: {len(sessions)} | "
                f"Positive (insider): {sum(s['label'] for s in sessions)} | "
                f"Negative: {sum(1 - s['label'] for s in sessions)}")

    if not sessions:
        logger.error("No sessions built — check dataset path")
        return {}

    # ── Dataset Split ────────────────────────────────────────────
    dataset = CERTThreatDataset(sessions, tokenizer)
    n_train = int(0.8 * len(dataset))
    n_val = len(dataset) - n_train
    train_ds, val_ds = random_split(
        dataset, [n_train, n_val],
        generator=torch.Generator().manual_seed(42)
    )

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        collate_fn=collate_fn, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        collate_fn=collate_fn, num_workers=0
    )

    # ── Model & Loss ─────────────────────────────────────────────
    model = build_seq_transformer(device=device)
    model.to(device)

    # FOCAL LOSS — γ=2.0, dynamic α_t per spec
    criterion = get_focal_loss(stable=True)
    logger.info(
        f"✅ Focal Loss instantiated: "
        f"FL(p_t) = -α_t·(1-p_t)^{criterion.gamma:.1f}·log(p_t) "
        f"[dynamic α_t from batch threat ratio]"
    )

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=n_epochs)

    os.makedirs(output_dir, exist_ok=True)
    training_history = []
    best_f1 = 0.0
    sample_batch = None

    # ── Training Loop ────────────────────────────────────────────
    for epoch in range(1, n_epochs + 1):
        model.train()
        epoch_losses = []
        epoch_logits = []
        epoch_labels = []

        for batch_tokens, batch_times, batch_labels in train_loader:
            batch_tokens = batch_tokens.to(device)
            batch_times = batch_times.to(device)
            batch_labels = batch_labels.to(device)

            if sample_batch is None:
                sample_batch = (batch_tokens, batch_times, batch_labels)

            optimizer.zero_grad()
            logits = model(batch_tokens, batch_times)

            # ──────────────────────────────────────────────────────
            # FOCAL LOSS: FL(p_t) = -α_t · (1 - p_t)^γ · log(p_t)
            # γ = 2.0 (fixed per spec)
            # α_t = dynamic batch inverse-frequency (per spec)
            # ──────────────────────────────────────────────────────
            loss = criterion(logits, batch_labels)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            epoch_losses.append(loss.item())
            epoch_logits.append(logits.detach())
            epoch_labels.append(batch_labels.detach())

        scheduler.step()

        # ── Validation ──────────────────────────────────────────
        model.eval()
        val_losses = []
        val_logits = []
        val_labels = []

        with torch.no_grad():
            for batch_tokens, batch_times, batch_labels in val_loader:
                batch_tokens = batch_tokens.to(device)
                batch_times = batch_times.to(device)
                batch_labels = batch_labels.to(device)

                logits = model(batch_tokens, batch_times)
                loss = criterion(logits, batch_labels)
                val_losses.append(loss.item())
                val_logits.append(logits)
                val_labels.append(batch_labels)

        all_val_logits = torch.cat(val_logits)
        all_val_labels = torch.cat(val_labels)
        metrics = _compute_metrics(all_val_logits, all_val_labels)

        avg_train_loss = np.mean(epoch_losses)
        avg_val_loss = np.mean(val_losses)

        logger.info(
            f"Epoch [{epoch:02d}/{n_epochs}] "
            f"Train Loss: {avg_train_loss:.4f} | "
            f"Val Loss: {avg_val_loss:.4f} | "
            f"F1: {metrics['f1']:.4f} | "
            f"Recall: {metrics['recall']:.4f} | "
            f"Precision: {metrics['precision']:.4f}"
        )

        training_history.append({
            "epoch": epoch,
            "train_loss": float(avg_train_loss),
            "val_loss": float(avg_val_loss),
            **{k: float(v) for k, v in metrics.items()},
        })

        if metrics["f1"] > best_f1:
            best_f1 = metrics["f1"]
            torch.save(model.state_dict(), f"{output_dir}/best_transformer.pt")
            logger.info(f"  ✅ New best model saved (F1={best_f1:.4f})")

    # ── Latency Benchmark ─────────────────────────────────────────
    if sample_batch is not None:
        logger.info("\n📊 Measuring inference latency (Engine B)...")
        latency_stats = _measure_inference_latency(model, sample_batch, device=device)
        logger.info(
            f"  P50: {latency_stats['p50_ms']:.2f}ms | "
            f"P95: {latency_stats['p95_ms']:.2f}ms | "
            f"P99: {latency_stats['p99_ms']:.2f}ms | "
            f"Target (≤35ms): {'✅ PASS' if latency_stats['within_target'] else '❌ FAIL'}"
        )
    else:
        latency_stats = {}

    # ── Training Report ───────────────────────────────────────────
    report = {
        "focal_loss_formula": "FL(p_t) = -α_t * (1 - p_t)^γ * log(p_t)",
        "gamma": FocalLoss.GAMMA,
        "alpha_mode": "dynamic (batch inverse-frequency)",
        "training_history": training_history,
        "best_f1": best_f1,
        "latency_benchmark": latency_stats,
        "latency_target_met": latency_stats.get("within_target", False),
        "model_path": f"{output_dir}/best_transformer.pt",
    }

    report_path = f"{output_dir}/training_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    logger.info(f"\n✅ Training complete. Report saved to {report_path}")

    return report


def _build_session_windows(
    reader: CERTDatasetReader,
    answers_path: str,
    sample: bool = False,
    window_days: int = 7,
) -> List[Dict]:
    """
    Build per-user session windows from CERT r4.2 events.
    Labels windows using ground truth insider labels from insiders.csv.
    """
    from collections import defaultdict

    # Load ground truth labels
    try:
        insiders_df = reader.load_insiders(answers_path)
        insider_users = set(insiders_df["user"].tolist())
        logger.info(f"Loaded {len(insider_users)} labeled insider users")
    except Exception as e:
        logger.warning(f"Could not load insiders.csv: {e}")
        insider_users = set()

    # Collect events per user
    user_events: Dict[str, List] = defaultdict(list)

    for event in reader.stream_logon(sample=sample):
        user_events[event["user_id"]].append(event)

    for event in reader.stream_device(sample=sample):
        user_events[event["user_id"]].append(event)

    for event in reader.stream_file(sample=sample):
        user_events[event["user_id"]].append(event)

    # Build sessions
    sessions = []
    for user_id, events in user_events.items():
        label = 1 if user_id in insider_users else 0
        # Sort by event_time
        events_sorted = sorted(events, key=lambda e: str(e.get("event_time", "")))
        sessions.append({
            "user_id": user_id,
            "events": events_sorted,
            "label": label,
        })

    logger.info(f"Built {len(sessions)} user sessions")
    return sessions


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Aegis-Q Training")
    parser.add_argument("--dataset", default="./dataset/r4.2")
    parser.add_argument("--answers", default="./dataset/answers")
    parser.add_argument("--output", default="./models")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--sample", action="store_true")

    args = parser.parse_args()
    train(
        dataset_path=args.dataset,
        answers_path=args.answers,
        output_dir=args.output,
        n_epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        device=args.device,
        sample=args.sample,
    )
