"""
Aegis-Q Psychometric Normalization
====================================
Min-Max normalization for Big-5 personality traits (O, C, E, A, N).

Formula per spec:
    X_norm = (X - X_min) / (X_max - X_min)

Constrains all trait values to [0.0, 1.0] before neural network embedding.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from typing import Dict, Optional, Tuple
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

TRAIT_COLUMNS = ["O", "C", "E", "A", "N"]
TRAIT_FULL_NAMES = {
    "O": "Openness",
    "C": "Conscientiousness",
    "E": "Extraversion",
    "A": "Agreeableness",
    "N": "Neuroticism",
}


@dataclass
class TraitBounds:
    """Fitted Min-Max bounds per trait."""

    trait_min: Dict[str, float] = field(default_factory=dict)
    trait_max: Dict[str, float] = field(default_factory=dict)
    is_fitted: bool = False

    def validate(self) -> None:
        for trait in TRAIT_COLUMNS:
            if trait not in self.trait_min or trait not in self.trait_max:
                raise ValueError(f"Missing bounds for trait '{trait}'")
            if self.trait_min[trait] >= self.trait_max[trait]:
                raise ValueError(
                    f"trait_min[{trait}]={self.trait_min[trait]} >= "
                    f"trait_max[{trait}]={self.trait_max[trait]}"
                )


class PsychometricNormalizer:
    """
    Fits and applies Min-Max normalization to Big-5 psychometric scores.

    X_norm = (X - X_min) / (X_max - X_min)

    Output range: [0.0, 1.0] guaranteed (clipped for out-of-sample safety).
    """

    def __init__(self) -> None:
        self._bounds = TraitBounds()

    def fit(self, df: pd.DataFrame) -> "PsychometricNormalizer":
        """
        Fit normalizer bounds from the psychometric.csv DataFrame.

        Args:
            df: DataFrame with columns [employee_name, user_id, O, C, E, A, N]
        """
        missing = [c for c in TRAIT_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"Missing trait columns: {missing}")

        for trait in TRAIT_COLUMNS:
            col = df[trait].dropna()
            self._bounds.trait_min[trait] = float(col.min())
            self._bounds.trait_max[trait] = float(col.max())
            logger.info(
                f"[Psychometric] Trait {trait} ({TRAIT_FULL_NAMES[trait]}): "
                f"min={self._bounds.trait_min[trait]:.4f}, "
                f"max={self._bounds.trait_max[trait]:.4f}"
            )

        self._bounds.is_fitted = True
        self._bounds.validate()
        return self

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fit and return normalized DataFrame."""
        self.fit(df)
        return self.transform(df)

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Apply Min-Max normalization. Returns copy with normalized trait columns.
        """
        if not self._bounds.is_fitted:
            raise RuntimeError("Call fit() before transform()")

        result = df.copy()
        for trait in TRAIT_COLUMNS:
            x_min = self._bounds.trait_min[trait]
            x_max = self._bounds.trait_max[trait]
            denom = x_max - x_min

            # X_norm = (X - X_min) / (X_max - X_min)
            normalized = (result[trait] - x_min) / denom

            # Clip to [0.0, 1.0] for out-of-distribution safety
            result[trait] = normalized.clip(lower=0.0, upper=1.0)

        return result

    def transform_user(self, user_traits: Dict[str, float]) -> Dict[str, float]:
        """
        Normalize a single user's trait dictionary.

        Args:
            user_traits: {"O": 45.0, "C": 72.0, "E": 38.0, "A": 60.0, "N": 25.0}

        Returns:
            Normalized dict with values in [0.0, 1.0]
        """
        if not self._bounds.is_fitted:
            raise RuntimeError("Call fit() before transform_user()")

        normalized = {}
        for trait in TRAIT_COLUMNS:
            val = user_traits.get(trait, 0.0)
            x_min = self._bounds.trait_min[trait]
            x_max = self._bounds.trait_max[trait]
            norm_val = (val - x_min) / (x_max - x_min)
            normalized[trait] = float(np.clip(norm_val, 0.0, 1.0))

        return normalized

    def to_tensor(
        self,
        df: pd.DataFrame,
        device: str = "cpu",
    ) -> torch.Tensor:
        """
        Return normalized Big-5 traits as a (N, 5) float tensor.
        Column order: [O, C, E, A, N]
        """
        normalized_df = self.transform(df)
        values = normalized_df[TRAIT_COLUMNS].values.astype(np.float32)
        return torch.tensor(values, dtype=torch.float32).to(device)

    def get_bounds(self) -> TraitBounds:
        return self._bounds

    def __repr__(self) -> str:
        if not self._bounds.is_fitted:
            return "PsychometricNormalizer(unfitted)"
        return (
            f"PsychometricNormalizer(fitted, bounds={{"
            + ", ".join(
                f"{t}: [{self._bounds.trait_min[t]:.2f}, {self._bounds.trait_max[t]:.2f}]"
                for t in TRAIT_COLUMNS
            )
            + "})"
        )


def load_and_normalize_psychometric(
    csv_path: str,
    device: str = "cpu",
) -> Tuple[pd.DataFrame, torch.Tensor, PsychometricNormalizer]:
    """
    Load psychometric.csv and return normalized DataFrame + tensor.

    Returns:
        (normalized_df, trait_tensor, fitted_normalizer)
    """
    df = pd.read_csv(csv_path)
    logger.info(f"[Psychometric] Loaded {len(df)} employee records from {csv_path}")

    normalizer = PsychometricNormalizer()
    normalized_df = normalizer.fit_transform(df)
    trait_tensor = normalizer.to_tensor(normalized_df, device=device)

    logger.info(
        f"[Psychometric] Normalized tensor shape: {trait_tensor.shape}, "
        f"range: [{trait_tensor.min():.4f}, {trait_tensor.max():.4f}]"
    )

    return normalized_df, trait_tensor, normalizer
