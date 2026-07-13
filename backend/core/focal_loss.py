"""
Aegis-Q Focal Loss Implementation
==================================
Implements the exact formula from the specification:

    FL(p_t) = -α_t · (1 - p_t)^γ · log(p_t)

With:
  - γ = 2.0  (focusing parameter — hard-coded per spec)
  - α_t = dynamically balanced per batch threat ratio

Reference: Lin et al., "Focal Loss for Dense Object Detection" (2017)
           Applied here to the "dense needles" insider threat scenario.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class FocalLoss(nn.Module):
    """
    Focal Loss for extreme class imbalance (insider threat vs. benign).

    FL(p_t) = -α_t * (1 - p_t)^γ * log(p_t)

    Args:
        gamma: Focusing parameter (default=2.0 per spec)
        alpha: Class weight for positive class. If None, computed dynamically
               from batch threat ratio each forward pass.
        reduction: 'mean' | 'sum' | 'none'
        eps: Numerical stability floor for log computation
    """

    GAMMA: float = 2.0  # Fixed per specification

    def __init__(
        self,
        gamma: float = 2.0,
        alpha: Optional[float] = None,
        reduction: str = "mean",
        eps: float = 1e-7,
    ) -> None:
        super().__init__()
        assert gamma == self.GAMMA, (
            f"Spec requires γ=2.0, got γ={gamma}. "
            "Override GAMMA class attribute if intentional."
        )
        self.gamma = gamma
        self.alpha = alpha  # None → dynamic batch balancing
        self.reduction = reduction
        self.eps = eps

    def _dynamic_alpha(self, targets: torch.Tensor) -> torch.Tensor:
        """
        Compute α_t dynamically from batch threat ratio.

        α_positive = n_negative / (n_positive + n_negative)   ← inverse frequency
        α_negative = 1 - α_positive

        This ensures rare malicious events receive proportionally higher weight.
        """
        n_pos = targets.sum().clamp(min=1.0)
        n_neg = (1 - targets).sum().clamp(min=1.0)
        alpha_pos = n_neg / (n_pos + n_neg)  # inverse frequency weighting
        alpha_neg = n_pos / (n_pos + n_neg)

        # Build per-sample alpha tensor
        alpha_t = torch.where(targets == 1, alpha_pos, alpha_neg)
        return alpha_t

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
    ) -> torch.Tensor:
        """
        Compute Focal Loss.

        Args:
            logits: Raw model outputs, shape (N,) or (N, 1) — NOT sigmoid'd
            targets: Binary labels {0, 1}, shape (N,)

        Returns:
            Scalar loss (or per-sample if reduction='none')
        """
        if logits.dim() > 1:
            logits = logits.squeeze(-1)
        targets = targets.float()

        # Compute probabilities
        probs = torch.sigmoid(logits)  # p_hat ∈ (0, 1)

        # p_t: probability assigned to the TRUE class
        #   For y=1: p_t = p
        #   For y=0: p_t = 1 - p
        p_t = torch.where(targets == 1, probs, 1.0 - probs)
        p_t = p_t.clamp(min=self.eps, max=1.0 - self.eps)

        # Determine α_t
        if self.alpha is not None:
            alpha_t = torch.where(
                targets == 1,
                torch.tensor(self.alpha, device=logits.device),
                torch.tensor(1.0 - self.alpha, device=logits.device),
            )
        else:
            alpha_t = self._dynamic_alpha(targets)

        # ──────────────────────────────────────────────────────────
        # Core Formula: FL(p_t) = -α_t · (1 - p_t)^γ · log(p_t)
        # ──────────────────────────────────────────────────────────
        modulating_factor = (1.0 - p_t) ** self.gamma
        focal_loss = -alpha_t * modulating_factor * torch.log(p_t)

        if self.reduction == "mean":
            return focal_loss.mean()
        elif self.reduction == "sum":
            return focal_loss.sum()
        else:
            return focal_loss


class BinaryFocalWithLogitsLoss(FocalLoss):
    """
    Numerically stable variant using log-sum-exp.
    Equivalent to FocalLoss but uses BCE-with-logits internally
    for improved numerical stability on extreme predictions.
    """

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
    ) -> torch.Tensor:
        if logits.dim() > 1:
            logits = logits.squeeze(-1)
        targets = targets.float()

        # Binary cross entropy component (numerically stable)
        bce_loss = F.binary_cross_entropy_with_logits(
            logits, targets, reduction="none"
        )

        # p_t from logits
        probs = torch.sigmoid(logits)
        p_t = torch.where(targets == 1, probs, 1.0 - probs).clamp(
            min=self.eps, max=1.0 - self.eps
        )

        # α_t
        if self.alpha is not None:
            alpha_t = torch.where(
                targets == 1,
                torch.tensor(self.alpha, device=logits.device),
                torch.tensor(1.0 - self.alpha, device=logits.device),
            )
        else:
            alpha_t = self._dynamic_alpha(targets)

        # FL(p_t) = α_t · (1 - p_t)^γ · BCE(logit, y)
        focal_loss = alpha_t * (1.0 - p_t) ** self.gamma * bce_loss

        if self.reduction == "mean":
            return focal_loss.mean()
        elif self.reduction == "sum":
            return focal_loss.sum()
        return focal_loss


def get_focal_loss(stable: bool = True, **kwargs) -> FocalLoss:
    """Factory function. Returns numerically stable variant by default."""
    cls = BinaryFocalWithLogitsLoss if stable else FocalLoss
    return cls(gamma=FocalLoss.GAMMA, **kwargs)
