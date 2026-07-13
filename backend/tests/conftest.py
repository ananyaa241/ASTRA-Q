"""
Pytest fixtures shared across the Aegis-Q test suite.
"""
import pytest
import torch


@pytest.fixture(scope="session")
def device():
    return "cuda" if torch.cuda.is_available() else "cpu"


@pytest.fixture
def sample_logit_batch():
    """A mixed batch: 5% positives (insider threat rate simulation)."""
    torch.manual_seed(42)
    n = 200
    logits = torch.randn(n)
    labels = torch.zeros(n)
    labels[:10] = 1.0  # 5% positives
    return logits, labels


@pytest.fixture
def balanced_batch():
    torch.manual_seed(7)
    logits = torch.randn(64)
    labels = (torch.rand(64) > 0.5).float()
    return logits, labels
