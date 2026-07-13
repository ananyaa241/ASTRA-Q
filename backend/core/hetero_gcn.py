"""
Aegis-Q Engine A: Heterogeneous Graph Convolutional Network (HeteroGCN)
=========================================================================
Processes user-machine-file relational topologies to detect lateral movement
and anomalous access patterns.

Graph Schema:
  Node Types:
    - 'user'  : Employee entities (features: behavioral + psychometric)
    - 'pc'    : Machine endpoints (features: shared flag, access frequency)
    - 'file'  : File entities (features: content type, copy frequency)

  Edge Types:
    - (user, logon, pc)    : User authenticated onto machine
    - (user, copied, file) : User copied file to removable media
    - (user, emailed, user): Email sender→recipient relationship
    - (pc, hosted, file)   : File was accessed on this PC

Architecture: 3-layer HeteroConv with residual connections + attention pooling
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from typing import Dict, Tuple, Optional

try:
    from torch_geometric.nn import HeteroConv, SAGEConv, GATv2Conv, Linear
    from torch_geometric.data import HeteroData
    PYGEOMETRIC_AVAILABLE = True
except ImportError:
    PYGEOMETRIC_AVAILABLE = False
    # Fallback stubs for environments without PyG
    class HeteroConv: pass
    class SAGEConv(nn.Module):
        def __init__(self, in_ch, out_ch, **kw): super().__init__()
    class GATv2Conv(nn.Module):
        def __init__(self, **kw): super().__init__()


# ─────────────────────────────────────────────────────────────────
# Node Feature Dimensions
# ─────────────────────────────────────────────────────────────────
NODE_FEATURE_DIMS = {
    "user": 52,   # 47 behavioral + 5 psychometric (normalized)
    "pc":   8,    # shared_flag, access_count, unique_users, after_hours_ratio, ...
    "file": 12,   # content_type_embedding(8) + copy_freq + size_bucket + ...
}

HIDDEN_DIM = 128
OUT_DIM = 64   # User node embedding output dimension


class HeteroGCNLayer(nn.Module):
    """Single HeteroConv layer with message passing per edge type."""

    def __init__(self, in_dims: Dict[str, int], out_dim: int) -> None:
        super().__init__()

        if not PYGEOMETRIC_AVAILABLE:
            raise RuntimeError(
                "torch_geometric not available. Install with: "
                "pip install torch_geometric"
            )

        # One conv per edge type
        self.conv = HeteroConv(
            {
                ("user", "logon", "pc"): SAGEConv(
                    (in_dims["user"], in_dims["pc"]), out_dim, normalize=True
                ),
                ("user", "copied", "file"): SAGEConv(
                    (in_dims["user"], in_dims["file"]), out_dim, normalize=True
                ),
                ("user", "emailed", "user"): GATv2Conv(
                    in_channels=in_dims["user"],
                    out_channels=out_dim // 4,
                    heads=4,
                    dropout=0.1,
                    add_self_loops=False,
                ),
                ("pc", "hosted", "file"): SAGEConv(
                    (in_dims["pc"], in_dims["file"]), out_dim, normalize=True
                ),
                # Reverse edges for bidirectional message passing
                ("pc", "rev_logon", "user"): SAGEConv(
                    (in_dims["pc"], in_dims["user"]), out_dim, normalize=True
                ),
                ("file", "rev_copied", "user"): SAGEConv(
                    (in_dims["file"], in_dims["user"]), out_dim, normalize=True
                ),
            },
            aggr="sum",
        )

        # Per-type normalization
        self.norms = nn.ModuleDict(
            {nt: nn.LayerNorm(out_dim) for nt in ["user", "pc", "file"]}
        )

    def forward(
        self,
        x_dict: Dict[str, Tensor],
        edge_index_dict: Dict[Tuple, Tensor],
    ) -> Dict[str, Tensor]:
        out = self.conv(x_dict, edge_index_dict)
        # LayerNorm + activation per node type
        return {
            nt: F.gelu(self.norms[nt](feat))
            for nt, feat in out.items()
            if nt in self.norms
        }


class HeteroGCN(nn.Module):
    """
    3-layer Heterogeneous GCN for insider threat lateral movement detection.

    Architecture:
      Input projection → Layer 1 → Residual → Layer 2 → Residual → Layer 3
      → User node pooling → MLP head → Threat logit
    """

    def __init__(
        self,
        node_feature_dims: Dict[str, int] = NODE_FEATURE_DIMS,
        hidden_dim: int = HIDDEN_DIM,
        out_dim: int = OUT_DIM,
        dropout: float = 0.2,
    ) -> None:
        super().__init__()

        self.hidden_dim = hidden_dim
        self.out_dim = out_dim
        self.dropout_rate = dropout

        # Input projections (node type specific)
        self.input_projs = nn.ModuleDict(
            {
                nt: nn.Sequential(
                    nn.Linear(dim, hidden_dim),
                    nn.LayerNorm(hidden_dim),
                    nn.GELU(),
                )
                for nt, dim in node_feature_dims.items()
            }
        )

        # 3 GCN layers with residual connections
        layer_dims = {"user": hidden_dim, "pc": hidden_dim, "file": hidden_dim}
        self.gcn_layers = nn.ModuleList(
            [HeteroGCNLayer(layer_dims, hidden_dim) for _ in range(3)]
        )

        # Residual projection (same dim → no projection needed)
        self.dropout = nn.Dropout(dropout)

        # Output MLP head (user nodes only)
        self.user_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, out_dim),
            nn.LayerNorm(out_dim),
        )

        # Final threat score logit
        self.threat_logit = nn.Linear(out_dim, 1)

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(
        self,
        x_dict: Dict[str, Tensor],
        edge_index_dict: Dict[Tuple, Tensor],
        return_embeddings: bool = False,
    ) -> Tensor | Tuple[Tensor, Tensor]:
        """
        Args:
            x_dict: Node feature dict {'user': (N_u, D_u), 'pc': ..., 'file': ...}
            edge_index_dict: Edge index dict per edge type
            return_embeddings: If True, also return (N_u, out_dim) user embeddings

        Returns:
            threat_logits: (N_u,) raw threat scores for each user node
            embeddings (optional): (N_u, out_dim)
        """
        # Project all node types to hidden_dim
        h = {nt: self.input_projs[nt](feat) for nt, feat in x_dict.items()}

        # 3-layer message passing with residual connections
        for i, layer in enumerate(self.gcn_layers):
            h_new = layer(h, edge_index_dict)
            # Residual add for user nodes (always present)
            h = {
                nt: self.dropout(h_new.get(nt, h[nt])) + h[nt]
                for nt in h.keys()
            }

        # Extract user node embeddings and compute threat score
        user_emb = self.user_head(h["user"])         # (N_u, out_dim)
        threat_logits = self.threat_logit(user_emb).squeeze(-1)  # (N_u,)

        if return_embeddings:
            return threat_logits, user_emb
        return threat_logits

    def get_num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def build_hetero_gcn(
    device: str = "cpu",
    **kwargs,
) -> HeteroGCN:
    """Factory function with sensible defaults."""
    model = HeteroGCN(**kwargs).to(device)
    n_params = model.get_num_parameters()
    print(f"[HeteroGCN] Built model with {n_params:,} trainable parameters")
    return model
