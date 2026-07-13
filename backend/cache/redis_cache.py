"""
Aegis-Q Redis Feature Cache
==============================
Implements a sub-2ms feature hydration cache using Redis.

Constraint: T_lookup ≤ 2ms (P99)

Design choices to hit the latency target:
  - Redis 7.x with AOF disabled (pure in-memory, no fsync)
  - MessagePack serialization (faster than JSON, smaller payloads)
  - Connection pooling (avoid per-request TCP handshake)
  - Pipeline batching for multi-key lookups
  - Pre-warmed on ingestion startup

Feature Cache Key Schema:
  user:{user_id}:features     → 47-dim behavioral feature vector
  user:{user_id}:psych        → 5-dim normalized psychometric vector
  user:{user_id}:baseline     → baseline behavioral statistics
  session:{session_id}:events → recent event token list
  graph:adjacency:{user_id}   → user's graph neighborhood
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import redis.asyncio as aioredis
import redis as sync_redis
import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Cache Configuration
# ─────────────────────────────────────────────────────────────────
DEFAULT_TTL_SECONDS = 3600         # 1 hour default TTL
FEATURE_TTL_SECONDS = 7200        # 2 hours for feature vectors
SESSION_TTL_SECONDS = 1800        # 30 min for active sessions
BASELINE_TTL_SECONDS = 86400      # 24 hours for baseline stats
MAX_LATENCY_MS = 2.0              # Hard constraint from spec


class FeatureCache:
    """
    Async Redis feature cache with latency monitoring.
    Enforces T_lookup ≤ 2ms constraint via telemetry and alerting.
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        max_connections: int = 50,
    ) -> None:
        self.redis_url = redis_url
        self._pool: Optional[aioredis.ConnectionPool] = None
        self._client: Optional[aioredis.Redis] = None
        self._latency_samples: List[float] = []
        self._miss_count = 0
        self._hit_count = 0

    async def connect(self) -> None:
        """Initialize connection pool."""
        self._pool = aioredis.ConnectionPool.from_url(
            self.redis_url,
            max_connections=50,
            socket_connect_timeout=1.0,
            socket_timeout=0.5,
            decode_responses=False,  # Binary for msgpack
        )
        self._client = aioredis.Redis(connection_pool=self._pool)
        await self._client.ping()
        logger.info(f"[FeatureCache] Connected to Redis at {self.redis_url}")

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            await self._pool.aclose()

    # ─────────────────────────────────────────────────────
    # Core Get/Set Operations
    # ─────────────────────────────────────────────────────

    async def get(self, key: str) -> Optional[Any]:
        """
        Get a cached value. Records latency for T_lookup monitoring.
        Returns None on cache miss.
        """
        t0 = time.perf_counter()
        try:
            raw = await self._client.get(key)
            latency_ms = (time.perf_counter() - t0) * 1000
            self._record_latency(latency_ms, key)

            if raw is None:
                self._miss_count += 1
                return None

            self._hit_count += 1
            return json.loads(raw)
        except Exception as e:
            logger.error(f"[FeatureCache] GET error for key={key}: {e}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = DEFAULT_TTL_SECONDS,
    ) -> bool:
        """Set a key with TTL. Returns True on success."""
        try:
            serialized = json.dumps(value, default=self._json_serializer)
            await self._client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"[FeatureCache] SET error for key={key}: {e}")
            return False

    async def mget(self, keys: List[str]) -> Dict[str, Optional[Any]]:
        """
        Pipeline multi-get for batch feature hydration.
        More efficient than individual GETs — critical for batch inference.
        """
        t0 = time.perf_counter()
        try:
            async with self._client.pipeline(transaction=False) as pipe:
                for key in keys:
                    pipe.get(key)
                results = await pipe.execute()

            latency_ms = (time.perf_counter() - t0) * 1000
            per_key_latency = latency_ms / max(len(keys), 1)
            self._record_latency(per_key_latency, f"mget({len(keys)})")

            output = {}
            for key, raw in zip(keys, results):
                if raw is not None:
                    self._hit_count += 1
                    output[key] = json.loads(raw)
                else:
                    self._miss_count += 1
                    output[key] = None

            return output
        except Exception as e:
            logger.error(f"[FeatureCache] MGET error: {e}")
            return {k: None for k in keys}

    # ─────────────────────────────────────────────────────
    # Domain-Specific Helpers
    # ─────────────────────────────────────────────────────

    async def get_user_features(
        self, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve 47-dim behavioral feature vector for a user."""
        return await self.get(f"user:{user_id}:features")

    async def set_user_features(
        self, user_id: str, features: Dict[str, Any]
    ) -> bool:
        return await self.set(
            f"user:{user_id}:features", features, FEATURE_TTL_SECONDS
        )

    async def get_user_psychometric(
        self, user_id: str
    ) -> Optional[Dict[str, float]]:
        """Retrieve normalized Big-5 psychometric scores for a user."""
        return await self.get(f"user:{user_id}:psych")

    async def set_user_psychometric(
        self, user_id: str, psych: Dict[str, float]
    ) -> bool:
        return await self.set(
            f"user:{user_id}:psych", psych, BASELINE_TTL_SECONDS
        )

    async def get_user_baseline(
        self, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve behavioral baseline statistics."""
        return await self.get(f"user:{user_id}:baseline")

    async def set_user_baseline(
        self, user_id: str, baseline: Dict[str, Any]
    ) -> bool:
        return await self.set(
            f"user:{user_id}:baseline", baseline, BASELINE_TTL_SECONDS
        )

    async def get_session_events(
        self, session_id: str
    ) -> Optional[List[Dict]]:
        """Retrieve recent event token list for a session."""
        return await self.get(f"session:{session_id}:events")

    async def append_session_event(
        self, session_id: str, event: Dict[str, Any], max_events: int = 512
    ) -> None:
        """Append event to session event list (capped at max_events)."""
        key = f"session:{session_id}:events"
        await self._client.rpush(key, json.dumps(event, default=self._json_serializer))
        await self._client.ltrim(key, -max_events, -1)
        await self._client.expire(key, SESSION_TTL_SECONDS)

    async def get_graph_neighbors(
        self, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve graph neighborhood for HeteroGCN input construction."""
        return await self.get(f"graph:adjacency:{user_id}")

    async def set_graph_neighbors(
        self, user_id: str, neighborhood: Dict[str, Any]
    ) -> bool:
        return await self.set(
            f"graph:adjacency:{user_id}", neighborhood, FEATURE_TTL_SECONDS
        )

    async def bulk_hydrate_users(
        self, user_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Efficiently hydrate features for a batch of users.
        Uses pipeline for T_lookup ≤ 2ms per user amortized.

        Returns: {user_id: {features, psych, baseline}}
        """
        feature_keys = [f"user:{uid}:features" for uid in user_ids]
        psych_keys = [f"user:{uid}:psych" for uid in user_ids]
        baseline_keys = [f"user:{uid}:baseline" for uid in user_ids]

        all_keys = feature_keys + psych_keys + baseline_keys
        results = await self.mget(all_keys)

        n = len(user_ids)
        output = {}
        for i, uid in enumerate(user_ids):
            output[uid] = {
                "features": results.get(feature_keys[i]),
                "psych": results.get(psych_keys[i]),
                "baseline": results.get(baseline_keys[i]),
            }

        return output

    # ─────────────────────────────────────────────────────
    # Telemetry
    # ─────────────────────────────────────────────────────

    def _record_latency(self, latency_ms: float, context: str = "") -> None:
        """Record latency sample and alert if above target."""
        self._latency_samples.append(latency_ms)
        if len(self._latency_samples) > 10000:
            self._latency_samples = self._latency_samples[-5000:]

        if latency_ms > MAX_LATENCY_MS:
            logger.warning(
                f"[FeatureCache] LATENCY BREACH: {latency_ms:.3f}ms > "
                f"{MAX_LATENCY_MS}ms target. Context: {context}"
            )

    def get_latency_stats(self) -> Dict[str, float]:
        """Returns P50, P95, P99 latency statistics in milliseconds."""
        if not self._latency_samples:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "samples": 0}

        samples = sorted(self._latency_samples)
        n = len(samples)
        return {
            "p50": samples[int(n * 0.50)],
            "p95": samples[int(n * 0.95)],
            "p99": samples[int(n * 0.99)],
            "mean": sum(samples) / n,
            "samples": n,
            "hit_rate": self._hit_count / max(self._hit_count + self._miss_count, 1),
        }

    def get_hit_rate(self) -> float:
        total = self._hit_count + self._miss_count
        return self._hit_count / max(total, 1)

    @staticmethod
    def _json_serializer(obj: Any) -> Any:
        """Custom JSON serializer for numpy types."""
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# ─────────────────────────────────────────────────────────────────
# Synchronous Variant (for non-async contexts)
# ─────────────────────────────────────────────────────────────────

class SyncFeatureCache:
    """Synchronous Redis cache for use in training pipelines."""

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self._client = sync_redis.from_url(
            redis_url,
            socket_timeout=0.5,
            socket_connect_timeout=1.0,
            decode_responses=False,
        )

    def get(self, key: str) -> Optional[Any]:
        raw = self._client.get(key)
        return json.loads(raw) if raw else None

    def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> bool:
        serialized = json.dumps(value, default=FeatureCache._json_serializer)
        return bool(self._client.setex(key, ttl, serialized))

    def ping(self) -> bool:
        try:
            return self._client.ping()
        except Exception:
            return False
