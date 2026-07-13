"""Aegis-Q API: WebSocket Real-Time Event Stream"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections for broadcast."""

    def __init__(self) -> None:
        self._active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.add(ws)
        logger.info(f"[WS] Client connected. Total: {len(self._active)}")

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        logger.info(f"[WS] Client disconnected. Total: {len(self._active)}")

    async def broadcast(self, message: dict) -> None:
        """Broadcast message to all connected clients."""
        dead = set()
        for ws in list(self._active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self._active -= dead


manager = ConnectionManager()


@router.websocket("/events")
async def websocket_events(websocket: WebSocket):
    """
    Real-time WebSocket stream of threat events and scoring updates.
    Clients receive:
      - type: "threat_update" — new threat score computed
      - type: "alert" — high-severity alert
      - type: "audit" — new audit entry
      - type: "metrics" — latency stats update
      - type: "heartbeat" — keep-alive ping
    """
    await manager.connect(websocket)
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "Connected to Aegis-Q real-time stream",
        })

        # Start synthetic event stream (demo mode)
        # In production, this reads from Kafka aegis.threats topic
        await _stream_synthetic_events(websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"[WS] Error: {e}")
        manager.disconnect(websocket)


async def _stream_synthetic_events(websocket: WebSocket) -> None:
    """
    Streams synthetic threat events for demo/testing.
    Replace with Kafka consumer in production.
    """
    users = [f"USR{i:04d}" for i in range(1, 21)]
    scenarios = [
        "After-hours thumb drive activity",
        "Wikileaks upload detected",
        "Keylogger hex signature in file.csv",
        "Lateral movement: cross-machine logon",
        "Dropbox data upload",
        "Mass external email detected",
        "Job site browsing spike",
    ]
    tiers = ["LOW", "LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "CRITICAL"]

    event_count = 0
    while True:
        event_count += 1

        # Generate synthetic threat update
        tier = random.choices(tiers, weights=[30, 30, 20, 10, 6, 3, 1])[0]
        score_ranges = {
            "CRITICAL": (0.88, 0.99), "HIGH": (0.65, 0.87),
            "MEDIUM": (0.40, 0.64), "LOW": (0.05, 0.39),
        }
        lo, hi = score_ranges[tier]
        fused = round(random.uniform(lo, hi), 4)

        message = {
            "type": "threat_update",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_id": f"session-{uuid.uuid4().hex[:8]}",
            "user_id": random.choice(users),
            "fused_score": fused,
            "gcn_score": round(random.uniform(lo, hi), 4),
            "transformer_score": round(random.uniform(lo, hi), 4),
            "risk_tier": tier,
            "scenario": random.choice(scenarios),
            "inference_latency_ms": round(random.uniform(8, 32), 2),
            "pqc_signed": True,
        }

        try:
            await websocket.send_json(message)
        except Exception:
            break

        # High-severity alerts pulse more frequently
        if tier in ("CRITICAL", "HIGH") and random.random() > 0.5:
            alert_msg = {
                "type": "alert",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "severity": tier,
                "user_id": message["user_id"],
                "session_id": message["session_id"],
                "description": f"🚨 {tier} threat detected: {message['scenario']}",
                "score": fused,
            }
            try:
                await websocket.send_json(alert_msg)
            except Exception:
                break

        # Metrics update every 10 events
        if event_count % 10 == 0:
            metrics_msg = {
                "type": "metrics",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "p99_latency_ms": round(random.uniform(18, 32), 2),
                "cache_p99_ms": round(random.uniform(0.3, 1.8), 3),
                "cache_hit_rate": round(random.uniform(0.87, 0.99), 3),
                "events_per_second": round(random.uniform(120, 450), 1),
                "focal_loss": round(random.uniform(0.012, 0.085), 4),
            }
            try:
                await websocket.send_json(metrics_msg)
            except Exception:
                break

        # Heartbeat every 30 events
        if event_count % 30 == 0:
            try:
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                break

        # Variable delay to simulate realistic event velocity
        await asyncio.sleep(random.uniform(0.5, 2.0))
