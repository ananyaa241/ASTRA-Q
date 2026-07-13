"""Test: Focal Loss formula correctness"""
import math
import pytest
import torch
from backend.core.focal_loss import FocalLoss, BinaryFocalWithLogitsLoss, get_focal_loss


class TestFocalLossFormula:
    """Verify FL(p_t) = -α_t · (1-p_t)^γ · log(p_t) with γ=2.0."""

    def test_gamma_fixed_at_2(self):
        fl = FocalLoss(gamma=2.0)
        assert fl.gamma == 2.0

    def test_gamma_enforcement(self):
        with pytest.raises(AssertionError):
            FocalLoss(gamma=1.5)

    def test_formula_manual_verification(self):
        """Manually verify FL = -α_t·(1-p_t)^γ·log(p_t) for known inputs."""
        fl = FocalLoss(gamma=2.0, alpha=0.75, reduction="none")
        # Single positive prediction: logit=2.0 → p≈0.88
        logit = torch.tensor([2.0])
        label = torch.tensor([1.0])

        loss = fl(logit, label)

        p = torch.sigmoid(logit).item()
        p_t = p  # y=1, so p_t = p
        alpha_t = 0.75
        gamma = 2.0
        expected = -alpha_t * ((1 - p_t) ** gamma) * math.log(p_t)

        assert abs(loss.item() - expected) < 1e-4, (
            f"Formula mismatch: got {loss.item():.6f}, expected {expected:.6f}"
        )

    def test_formula_negative_class(self):
        """Verify FL for negative class: p_t = 1 - p."""
        fl = FocalLoss(gamma=2.0, alpha=0.75, reduction="none")
        logit = torch.tensor([-1.0])
        label = torch.tensor([0.0])

        loss = fl(logit, label)

        p = torch.sigmoid(logit).item()
        p_t = 1 - p  # y=0, so p_t = 1 - p
        alpha_t = 1.0 - 0.75  # alpha for negative class
        gamma = 2.0
        expected = -alpha_t * ((1 - p_t) ** gamma) * math.log(p_t + 1e-7)

        assert abs(loss.item() - expected) < 1e-3

    def test_dynamic_alpha_balancing(self):
        """Dynamic α_t should weight rare positives more heavily."""
        fl = FocalLoss(gamma=2.0, alpha=None, reduction="none")
        # 1 positive, 9 negatives → rare positive should get α ≈ 0.9
        logits = torch.zeros(10)
        labels = torch.zeros(10)
        labels[0] = 1.0  # One insider in a batch of 10

        losses = fl(logits, labels)
        # Positive sample should have higher loss contribution than negative
        assert losses[0].item() > losses[1].item(), (
            "Positive (insider) sample should receive higher focal loss weight"
        )

    def test_focal_vs_bce(self):
        """Focal loss should be ≤ BCE for easy samples (high confidence)."""
        fl = FocalLoss(gamma=2.0, alpha=0.5)
        bce = torch.nn.BCEWithLogitsLoss()

        # Easy positive sample (high logit)
        logits = torch.tensor([3.0])
        labels = torch.tensor([1.0])

        focal = fl(logits, labels)
        bce_val = bce(logits, labels)

        # Focal loss down-weights easy samples
        assert focal.item() < bce_val.item(), (
            "Focal loss should < BCE for easy (high-confidence) samples"
        )

    def test_stable_variant_numerics(self):
        """BinaryFocalWithLogitsLoss should not produce NaN or Inf."""
        fl = get_focal_loss(stable=True)
        logits = torch.tensor([100.0, -100.0, 0.0, 2.5, -3.1])
        labels = torch.tensor([1.0, 0.0, 1.0, 0.0, 1.0])
        loss = fl(logits, labels)
        assert torch.isfinite(loss), f"Loss is not finite: {loss.item()}"
        assert loss.item() >= 0, f"Loss should be non-negative, got {loss.item()}"

    def test_reduction_modes(self):
        fl_mean = FocalLoss(gamma=2.0, alpha=0.5, reduction="mean")
        fl_sum = FocalLoss(gamma=2.0, alpha=0.5, reduction="sum")
        fl_none = FocalLoss(gamma=2.0, alpha=0.5, reduction="none")

        logits = torch.randn(8)
        labels = torch.randint(0, 2, (8,)).float()

        loss_none = fl_none(logits, labels)
        assert loss_none.shape == (8,)
        assert abs(fl_mean(logits, labels).item() - loss_none.mean().item()) < 1e-5
        assert abs(fl_sum(logits, labels).item() - loss_none.sum().item()) < 1e-5

    def test_imbalanced_dataset_behavior(self):
        """Simulate dense-needles scenario: 5% positive rate."""
        fl = get_focal_loss(stable=True)
        n = 200
        n_pos = 10  # 5% insider threat rate

        logits = torch.randn(n)
        labels = torch.zeros(n)
        labels[:n_pos] = 1.0

        loss = fl(logits, labels)
        assert torch.isfinite(loss), "Loss must be finite on imbalanced batch"
        assert loss.item() > 0
