"""
Astra-Q Engine B: Sequential Transformer
==========================================
Causal transformer that models chronological event token sequences to detect
behavioral anomalies and temporal attack patterns.

Design:
  - 4-head, 2-layer causal (masked) self-attention
  - Input: Event token sequences (logon/device/http/email/file events)
  - Positional encoding: Learned + sinusoidal minutes-from-midnight bias
  - Output: Per-user session threat logit

Token Vocabulary:
  Event types are tokenized as categorical IDs. Continuous features
  (minutes from midnight, file size, etc.) are embedded via linear projection
  and added to token embeddings.
"""

from __future__ import annotations

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from typing import Optional, Tuple


# ─────────────────────────────────────────────────────────────────
# Token Vocabulary
# ─────────────────────────────────────────────────────────────────
EVENT_VOCAB = {
    "<PAD>":    0,
    "<BOS>":    1,   # Begin Of Sequence
    "<EOS>":    2,   # End Of Sequence
    "LOGON":    3,
    "LOGOFF":   4,
    "UNLOCK":   5,
    "DEV_CONNECT": 6,
    "DEV_DISCONNECT": 7,
    "HTTP":     8,
    "EMAIL_SEND": 9,
    "EMAIL_RECV": 10,
    "FILE_COPY": 11,
    "AFTER_HOURS": 12,   # Synthetic modifier token
    "WEEKEND":  13,
    "EXTERNAL": 14,      # External recipient/domain
    "ANOMALY":  15,      # Hex-validated suspicious file
    "<UNK>":    16,
}
VOCAB_SIZE = len(EVENT_VOCAB)
MAX_SEQ_LEN = 512    # Maximum events in a session window
D_MODEL = 128        # Transformer model dimension
N_HEADS = 4
N_LAYERS = 2
D_FF = 512           # Feed-forward expansion
DROPOUT = 0.1


class TemporalPositionalEncoding(nn.Module):
    """
    Hybrid positional encoding:
      - Sinusoidal base (sequence position)
      - Learned temporal bias (minutes from midnight, normalized)

    The temporal component allows the model to learn that events at 3AM
    have different contextual importance than 9AM events.
    """

    def __init__(self, d_model: int, max_len: int = MAX_SEQ_LEN) -> None:
        super().__init__()
        self.d_model = d_model

        # Sinusoidal encoding (fixed)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float)
            * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)

        # Learned temporal projection: minutes_from_midnight → d_model
        self.temporal_proj = nn.Sequential(
            nn.Linear(1, d_model // 4),
            nn.GELU(),
            nn.Linear(d_model // 4, d_model),
        )
        self.dropout = nn.Dropout(DROPOUT)

    def forward(
        self,
        x: Tensor,
        minutes_from_midnight: Optional[Tensor] = None,
    ) -> Tensor:
        """
        Args:
            x: (B, T, D) token embeddings
            minutes_from_midnight: (B, T) normalized to [0, 1] (0=midnight, 1=23:59)

        Returns:
            (B, T, D) with positional information added
        """
        seq_len = x.size(1)
        pos_enc = self.pe[:, :seq_len, :]  # (1, T, D)

        if minutes_from_midnight is not None:
            # Normalize to [0, 1] if not already
            mfm = minutes_from_midnight.float()
            if mfm.max() > 1.0:
                mfm = mfm / 1440.0  # 1440 minutes in a day
            temp_enc = self.temporal_proj(mfm.unsqueeze(-1))  # (B, T, D)
            pos_enc = pos_enc + 0.1 * temp_enc  # Additive with scaling

        return self.dropout(x + pos_enc)


class CausalSelfAttention(nn.Module):
    """Multi-head causal (masked) self-attention."""

    def __init__(self, d_model: int = D_MODEL, n_heads: int = N_HEADS) -> None:
        super().__init__()
        assert d_model % n_heads == 0
        self.n_heads = n_heads
        self.d_head = d_model // n_heads

        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(DROPOUT)

    def forward(
        self,
        x: Tensor,
        key_padding_mask: Optional[Tensor] = None,
    ) -> Tensor:
        B, T, D = x.shape

        # QKV projection
        qkv = self.qkv_proj(x).reshape(B, T, 3, self.n_heads, self.d_head)
        qkv = qkv.permute(2, 0, 3, 1, 4)  # (3, B, H, T, D_h)
        q, k, v = qkv.unbind(0)

        # Scaled dot-product with causal mask
        scale = self.d_head ** -0.5
        attn = torch.matmul(q, k.transpose(-2, -1)) * scale  # (B, H, T, T)

        # Causal mask (lower-triangular)
        causal_mask = torch.triu(
            torch.ones(T, T, device=x.device, dtype=torch.bool), diagonal=1
        )
        attn = attn.masked_fill(causal_mask.unsqueeze(0).unsqueeze(0), float("-inf"))

        # Key padding mask (PAD tokens)
        if key_padding_mask is not None:
            attn = attn.masked_fill(
                key_padding_mask.unsqueeze(1).unsqueeze(2), float("-inf")
            )

        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)

        # Aggregate values
        out = torch.matmul(attn, v)  # (B, H, T, D_h)
        out = out.transpose(1, 2).reshape(B, T, D)
        return self.out_proj(out)


class TransformerBlock(nn.Module):
    """Pre-norm transformer block: LayerNorm → Attention → LayerNorm → FFN."""

    def __init__(self, d_model: int = D_MODEL) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, N_HEADS)
        self.norm2 = nn.LayerNorm(d_model)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, D_FF),
            nn.GELU(),
            nn.Dropout(DROPOUT),
            nn.Linear(D_FF, d_model),
            nn.Dropout(DROPOUT),
        )

    def forward(
        self,
        x: Tensor,
        key_padding_mask: Optional[Tensor] = None,
    ) -> Tensor:
        x = x + self.attn(self.norm1(x), key_padding_mask)
        x = x + self.ffn(self.norm2(x))
        return x


class SequentialTransformer(nn.Module):
    """
    Engine B: Causal transformer for behavioral sequence modeling.

    Processes chronological event token sequences per user session and
    outputs a per-session threat logit based on the final token representation.

    Architecture:
      Token Embedding + Temporal Positional Encoding
      → 2× Transformer Block (causal attention)
      → CLS token pooling OR last-valid-token extraction
      → MLP threat head
    """

    def __init__(
        self,
        vocab_size: int = VOCAB_SIZE,
        d_model: int = D_MODEL,
        n_layers: int = N_LAYERS,
        max_seq_len: int = MAX_SEQ_LEN,
        dropout: float = DROPOUT,
    ) -> None:
        super().__init__()
        self.d_model = d_model

        # Token embedding
        self.token_embedding = nn.Embedding(
            vocab_size, d_model, padding_idx=EVENT_VOCAB["<PAD>"]
        )
        nn.init.normal_(self.token_embedding.weight, mean=0, std=d_model ** -0.5)

        # Positional encoding (sinusoidal + temporal)
        self.pos_encoding = TemporalPositionalEncoding(d_model, max_seq_len)

        # Transformer layers
        self.layers = nn.ModuleList(
            [TransformerBlock(d_model) for _ in range(n_layers)]
        )
        self.final_norm = nn.LayerNorm(d_model)

        # Threat head: final token → threat logit
        self.threat_head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, 1),
        )

        self.dropout_emb = nn.Dropout(dropout)

    def forward(
        self,
        tokens: Tensor,
        minutes_from_midnight: Optional[Tensor] = None,
        attention_mask: Optional[Tensor] = None,
        return_embeddings: bool = False,
    ) -> Tensor | Tuple[Tensor, Tensor]:
        """
        Args:
            tokens: (B, T) integer token IDs
            minutes_from_midnight: (B, T) temporal context
            attention_mask: (B, T) bool mask, True = pad position
            return_embeddings: If True, also return (B, D) session embeddings

        Returns:
            threat_logits: (B,) raw logits per session
            embeddings (optional): (B, D_model)
        """
        B, T = tokens.shape
        pad_mask = tokens == EVENT_VOCAB["<PAD>"]  # (B, T)

        if attention_mask is not None:
            pad_mask = pad_mask | attention_mask

        # Embed tokens
        x = self.token_embedding(tokens) * math.sqrt(self.d_model)  # (B, T, D)
        x = self.pos_encoding(x, minutes_from_midnight)
        x = self.dropout_emb(x)

        # Transformer layers
        for layer in self.layers:
            x = layer(x, key_padding_mask=pad_mask)

        x = self.final_norm(x)  # (B, T, D)

        # Pool: use last non-pad token per sequence
        seq_lengths = (~pad_mask).sum(dim=1).clamp(min=1) - 1  # (B,)
        session_emb = x[torch.arange(B, device=x.device), seq_lengths]  # (B, D)

        threat_logits = self.threat_head(session_emb).squeeze(-1)  # (B,)

        if return_embeddings:
            return threat_logits, session_emb
        return threat_logits

    def get_num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def build_seq_transformer(device: str = "cpu", **kwargs) -> SequentialTransformer:
    """Factory function with sensible defaults."""
    model = SequentialTransformer(**kwargs).to(device)
    n_params = model.get_num_parameters()
    print(f"[SequentialTransformer] Built model with {n_params:,} trainable parameters")
    return model


# ─────────────────────────────────────────────────────────────────
# Event Tokenizer
# ─────────────────────────────────────────────────────────────────
class EventTokenizer:
    """Converts raw event records to integer token sequences."""

    EVENT_TYPE_MAP = {
        "logon":         EVENT_VOCAB["LOGON"],
        "logoff":        EVENT_VOCAB["LOGOFF"],
        "unlock":        EVENT_VOCAB["UNLOCK"],
        "connect":       EVENT_VOCAB["DEV_CONNECT"],
        "disconnect":    EVENT_VOCAB["DEV_DISCONNECT"],
        "http":          EVENT_VOCAB["HTTP"],
        "email_send":    EVENT_VOCAB["EMAIL_SEND"],
        "email_recv":    EVENT_VOCAB["EMAIL_RECV"],
        "file":          EVENT_VOCAB["FILE_COPY"],
    }

    def __init__(self, max_seq_len: int = MAX_SEQ_LEN) -> None:
        self.max_seq_len = max_seq_len
        self.pad_id = EVENT_VOCAB["<PAD>"]
        self.bos_id = EVENT_VOCAB["<BOS>"]
        self.eos_id = EVENT_VOCAB["<EOS>"]

    def tokenize_session(
        self,
        events: list[dict],
    ) -> Tuple[list[int], list[float]]:
        """
        Convert a chronological list of events to token IDs + temporal context.

        Args:
            events: List of dicts with keys: event_type, minutes_from_midnight,
                    is_after_hours, is_weekend, is_external, is_suspicious_file

        Returns:
            (token_ids, minutes_from_midnight) both of length ≤ max_seq_len
        """
        tokens = [self.bos_id]
        times = [0.0]

        for ev in events[: self.max_seq_len - 2]:  # -2 for BOS/EOS
            etype = ev.get("event_type", "").lower()
            tok = self.EVENT_TYPE_MAP.get(etype, EVENT_VOCAB["<UNK>"])
            tokens.append(tok)
            times.append(float(ev.get("minutes_from_midnight", 0)))

            # Append modifier tokens for contextual enrichment
            if ev.get("is_after_hours"):
                tokens.append(EVENT_VOCAB["AFTER_HOURS"])
                times.append(times[-1])
            if ev.get("is_weekend"):
                tokens.append(EVENT_VOCAB["WEEKEND"])
                times.append(times[-1])
            if ev.get("is_external"):
                tokens.append(EVENT_VOCAB["EXTERNAL"])
                times.append(times[-1])
            if ev.get("is_suspicious_file"):
                tokens.append(EVENT_VOCAB["ANOMALY"])
                times.append(times[-1])

        tokens.append(self.eos_id)
        times.append(times[-1] if times else 0.0)

        # Truncate to max_seq_len
        return tokens[: self.max_seq_len], times[: self.max_seq_len]

    def pad_batch(
        self,
        batch_tokens: list[list[int]],
        batch_times: list[list[float]],
    ) -> Tuple[Tensor, Tensor, Tensor]:
        """
        Pad a batch of token sequences to the same length.

        Returns:
            tokens_tensor: (B, T_max)
            times_tensor: (B, T_max)
            attention_mask: (B, T_max) bool, True = pad
        """
        max_len = max(len(t) for t in batch_tokens)
        B = len(batch_tokens)

        tokens_padded = torch.full((B, max_len), self.pad_id, dtype=torch.long)
        times_padded = torch.zeros(B, max_len, dtype=torch.float)
        mask = torch.ones(B, max_len, dtype=torch.bool)

        for i, (toks, times) in enumerate(zip(batch_tokens, batch_times)):
            L = len(toks)
            tokens_padded[i, :L] = torch.tensor(toks, dtype=torch.long)
            times_padded[i, :L] = torch.tensor(times, dtype=torch.float)
            mask[i, :L] = False  # Not padding

        return tokens_padded, times_padded, mask

