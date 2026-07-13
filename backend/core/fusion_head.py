"""
Aegis-Q Fusion Head
=====================
Combines threat scores from Engine A (HeteroGCN) and Engine B (Sequential
Transformer) into a unified, ranked threat assessment.

Fusion Strategy:
  - Learned gating: α(context) weighted blend of GCN and Transformer scores
  - Context features: psychometric Big-5 + temporal features
  - Output: fused_score ∈ (0, 1), risk_tier ∈ {CRITICAL, HIGH, MEDIUM, LOW}
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from typing import Dict, Tuple


RISK_TIERS = {
    "CRITICAL": (0.85, 1.00),
    "HIGH":     (0.65, 0.85),
    "MEDIUM":   (0.40, 0.65),
    "LOW":      (0.00, 0.40),
}


class LearnedGatingFusion(nn.Module):
    """
    Context-aware gating network to dynamically weight Engine A and B scores.

    Gate formula:
        g = σ(W · [gcn_emb || transformer_emb || context_features])
        fused_logit = g * gcn_logit + (1 - g) * transformer_logit
    """

    def __init__(
        self,
        gcn_embedding_dim: int = 64,
        transformer_embedding_dim: int = 128,
        context_dim: int = 10,   # psychometric(5) + temporal(5)
    ) -> None:
        super().__init__()

        in_dim = gcn_embedding_dim + transformer_embedding_dim + context_dim

        self.gate_net = nn.Sequential(
            nn.Linear(in_dim, 64),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

        # Ensemble calibration layer
        self.calibration = nn.Sequential(
            nn.Linear(2, 16),
            nn.GELU(),
            nn.Linear(16, 1),
        )

    def forward(
        self,
        gcn_logit: Tensor,         # (N,)
        transformer_logit: Tensor,  # (N,)
        gcn_embedding: Tensor,      # (N, 64)
        transformer_embedding: Tensor,  # (N, 128)
        context_features: Tensor,   # (N, 10) psychometric + temporal
    ) -> Tuple[Tensor, Tensor]:
        """
        Returns:
            fused_logit: (N,) raw logit
            gate_weight: (N,) transparency — how much weight on GCN vs. Transformer
        """
        combined = torch.cat(
            [gcn_embedding, transformer_embedding, context_features], dim=-1
        )
        gate = self.gate_net(combined).squeeze(-1)  # (N,) ∈ (0, 1)

        # Gated fusion of raw logits
        score_pair = torch.stack([gcn_logit, transformer_logit], dim=-1)  # (N, 2)
        fused_logit = self.calibration(score_pair).squeeze(-1)  # (N,)

        return fused_logit, gate


class ThreatRanker(nn.Module):
    """
    Full fusion pipeline: receives dual-engine outputs and produces ranked
    threat assessments with risk tier classification.
    """

    def __init__(
        self,
        gcn_embedding_dim: int = 64,
        transformer_embedding_dim: int = 128,
        context_dim: int = 10,
    ) -> None:
        super().__init__()
        self.fusion = LearnedGatingFusion(
            gcn_embedding_dim, transformer_embedding_dim, context_dim
        )

    def forward(
        self,
        gcn_logit: Tensor,
        transformer_logit: Tensor,
        gcn_embedding: Tensor,
        transformer_embedding: Tensor,
        context_features: Tensor,
    ) -> Dict[str, Tensor]:
        """
        Returns dict with fused_score, gcn_score, transformer_score, gate, risk_tier_id
        """
        fused_logit, gate = self.fusion(
            gcn_logit, transformer_logit,
            gcn_embedding, transformer_embedding, context_features,
        )

        gcn_score = torch.sigmoid(gcn_logit)
        transformer_score = torch.sigmoid(transformer_logit)
        fused_score = torch.sigmoid(fused_logit)

        return {
            "fused_score": fused_score,
            "gcn_score": gcn_score,
            "transformer_score": transformer_score,
            "gate_weight": gate,
            "fused_logit": fused_logit,
        }

    @staticmethod
    def score_to_tier(score: float) -> str:
        """Map a fused score ∈ [0, 1] to a risk tier string."""
        for tier, (low, high) in RISK_TIERS.items():
            if low <= score <= high:
                return tier
        return "LOW"

    @staticmethod
    def batch_scores_to_tiers(scores: Tensor) -> list[str]:
        return [ThreatRanker.score_to_tier(float(s)) for s in scores]

    def get_num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
