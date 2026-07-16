"""Astra-Q API: WebSocket Real-Time Event Stream"""
from __future__ import annotations

import asyncio
import json
import logging
import os
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
            "message": "Connected to Astra-Q real-time stream",
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
    """ Streams synthetic threat events for demo/testing. """
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

    try:
        import aiokafka
        KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        consumer = aiokafka.AIOKafkaConsumer(
            "aegis.threats",
            bootstrap_servers=KAFKA_BROKER,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest"
        )
        await consumer.start()
        try:
            async for msg in consumer:
                await websocket.send_json(msg.value)
        finally:
            await consumer.stop()
        return
    except (ImportError, Exception) as e:
        logger.error(f"[WS] Critical: Kafka unavailable or aiokafka not installed ({e}). Production mode strictly requires real Kafka stream.")
        raise RuntimeError("Kafka real-time feed must be used in production.") from e

    # Synthetic fallback loop removed.


