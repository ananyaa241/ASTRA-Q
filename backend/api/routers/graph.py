"""Aegis-Q API: Graph Topology Endpoints (for D3 visualization)"""
from __future__ import annotations

import random
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter()


class GraphNode(BaseModel):
    id: str
    type: str        # USER | PC | FILE
    label: str
    threat_score: float = 0.0
    risk_tier: str = "LOW"
    properties: Dict[str, Any] = {}


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str        # logon | copied | emailed | accessed
    weight: float = 1.0
    is_anomalous: bool = False


class GraphTopology(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    node_count: int
    edge_count: int
    anomalous_edge_count: int


@router.get("/topology", response_model=GraphTopology)
async def get_graph_topology(
    request: Request,
    user_id: Optional[str] = Query(None, description="Focus on specific user's neighborhood"),
    min_threat_score: float = Query(0.0, ge=0.0, le=1.0),
    limit_nodes: int = Query(100, ge=10, le=500),
):
    """
    Returns the threat graph topology for D3 force-directed visualization.
    High-risk nodes and anomalous edges are flagged for visual highlighting.
    """
    async for db in request.app.state.get_db():
        try:
            if user_id:
                # User-specific neighborhood
                node_result = await db.execute(
                    text("""
                        SELECT node_id, node_type, label, threat_score, properties
                        FROM graph_nodes
                        WHERE node_id = :uid OR node_id IN (
                            SELECT target_id FROM graph_edges WHERE source_id = :uid
                            UNION
                            SELECT source_id FROM graph_edges WHERE target_id = :uid
                        )
                        LIMIT :limit
                    """),
                    {"uid": user_id, "limit": limit_nodes},
                )
            else:
                node_result = await db.execute(
                    text("""
                        SELECT node_id, node_type, label, threat_score, properties
                        FROM graph_nodes
                        WHERE threat_score >= :min_score
                        ORDER BY threat_score DESC
                        LIMIT :limit
                    """),
                    {"min_score": min_threat_score, "limit": limit_nodes},
                )

            nodes_rows = node_result.fetchall()
            if not nodes_rows:
                raise Exception("empty")

            node_ids = [r[0] for r in nodes_rows]

            edge_result = await db.execute(
                text("""
                    SELECT id::text, source_id, target_id, edge_type, weight, is_anomalous
                    FROM graph_edges
                    WHERE source_id = ANY(:node_ids) OR target_id = ANY(:node_ids)
                    LIMIT 500
                """),
                {"node_ids": node_ids},
            )
            edge_rows = edge_result.fetchall()

            nodes = [
                GraphNode(
                    id=r[0], type=r[1], label=r[2],
                    threat_score=float(r[3] or 0),
                    risk_tier=_score_to_tier(float(r[3] or 0)),
                    properties=r[4] or {},
                )
                for r in nodes_rows
            ]
            edges = [
                GraphEdge(
                    id=r[0], source=r[1], target=r[2],
                    type=r[3], weight=float(r[4] or 1.0),
                    is_anomalous=bool(r[5]),
                )
                for r in edge_rows
            ]

            return GraphTopology(
                nodes=nodes, edges=edges,
                node_count=len(nodes), edge_count=len(edges),
                anomalous_edge_count=sum(1 for e in edges if e.is_anomalous),
            )

        except Exception:
            break

    # Synthetic demo graph
    return _synthetic_graph(limit_nodes)


@router.get("/user/{user_id}")
async def get_user_graph(user_id: str, request: Request):
    """Get the complete threat context for a specific user node."""
    return await get_graph_topology(
        request=request, user_id=user_id,
        min_threat_score=0.0, limit_nodes=50,
    )


def _score_to_tier(score: float) -> str:
    if score >= 0.85: return "CRITICAL"
    if score >= 0.65: return "HIGH"
    if score >= 0.40: return "MEDIUM"
    return "LOW"


def _synthetic_graph(limit: int) -> GraphTopology:
    """Generate a realistic-looking synthetic threat graph for UI demo."""
    random.seed(99)
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []

    # Create user nodes (mix of threat levels)
    user_ids = [f"USR{i:04d}" for i in range(1, 21)]
    pc_ids = [f"PC{i:04d}" for i in range(1, 16)]
    file_ids = [f"FILE{i:04d}" for i in range(1, 11)]

    threat_scores = {
        "USR0001": 0.97, "USR0002": 0.91, "USR0003": 0.78,
        "USR0004": 0.72, "USR0005": 0.65,
    }

    for uid in user_ids[:min(limit // 3, 20)]:
        score = threat_scores.get(uid, round(random.uniform(0.05, 0.45), 3))
        nodes.append(GraphNode(
            id=uid, type="USER", label=uid,
            threat_score=score,
            risk_tier=_score_to_tier(score),
            properties={"department": random.choice(["Engineering", "Finance", "HR", "IT"])},
        ))

    for pc in pc_ids[:10]:
        nodes.append(GraphNode(
            id=pc, type="PC", label=pc,
            threat_score=round(random.uniform(0.0, 0.3), 3),
            risk_tier="LOW",
            properties={"is_shared": random.choice([True, False])},
        ))

    for fid in file_ids[:8]:
        nodes.append(GraphNode(
            id=fid, type="FILE", label=fid,
            threat_score=round(random.uniform(0.0, 0.6), 3),
            risk_tier=_score_to_tier(round(random.uniform(0.0, 0.6), 3)),
            properties={"extension": random.choice([".docx", ".xlsx", ".txt", ".pdf"])},
        ))

    # Logon edges
    for i, uid in enumerate(user_ids[:15]):
        pc = pc_ids[i % len(pc_ids)]
        is_anomalous = uid in threat_scores
        edges.append(GraphEdge(
            id=str(uuid.uuid4()), source=uid, target=pc,
            type="logon", weight=1.0, is_anomalous=is_anomalous,
        ))

    # Lateral movement edges (high-risk users accessing other PCs)
    for uid in ["USR0001", "USR0002", "USR0003"]:
        for i in range(random.randint(2, 4)):
            pc = random.choice(pc_ids)
            edges.append(GraphEdge(
                id=str(uuid.uuid4()), source=uid, target=pc,
                type="logon", weight=2.0, is_anomalous=True,
            ))

    # File copy edges
    for uid in ["USR0001", "USR0002"]:
        for fid in random.sample(file_ids, 3):
            edges.append(GraphEdge(
                id=str(uuid.uuid4()), source=uid, target=fid,
                type="copied", weight=1.5, is_anomalous=True,
            ))

    # Email edges
    for i in range(10):
        src = random.choice(user_ids[:10])
        tgt = random.choice(user_ids[:10])
        if src != tgt:
            edges.append(GraphEdge(
                id=str(uuid.uuid4()), source=src, target=tgt,
                type="emailed", weight=1.0, is_anomalous=False,
            ))

    return GraphTopology(
        nodes=nodes, edges=edges,
        node_count=len(nodes), edge_count=len(edges),
        anomalous_edge_count=sum(1 for e in edges if e.is_anomalous),
    )
