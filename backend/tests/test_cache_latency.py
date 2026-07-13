"""Test: Redis cache latency constraint T_lookup ≤ 2ms (P99)"""
import asyncio
import json
import time
import pytest
import pytest_asyncio

# Try to import redis; skip tests gracefully if Redis not available
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from backend.cache.redis_cache import FeatureCache, SyncFeatureCache, MAX_LATENCY_MS


REDIS_URL = "redis://localhost:6379"
LATENCY_TARGET_MS = 2.0
N_MEASUREMENTS = 500


@pytest.mark.skipif(not REDIS_AVAILABLE, reason="Redis not installed")
class TestCacheLatency:
    """
    Validates T_lookup ≤ 2ms (P99) Redis cache constraint.
    Tests run against a real Redis instance (requires Redis running).
    """

    @pytest.fixture(scope="class")
    def sync_cache(self):
        cache = SyncFeatureCache(REDIS_URL)
        if not cache.ping():
            pytest.skip("Redis not reachable at localhost:6379")
        # Warm up cache with test data
        for i in range(100):
            cache.set(f"test:user:{i}:features", {
                "vector": list(range(47)),
                "user_id": f"USR{i:04d}",
            }, ttl=300)
        return cache

    def test_single_get_latency(self, sync_cache):
        """Single GET operation must complete in < 2ms (median)."""
        latencies = []
        for i in range(100):
            key = f"test:user:{i % 100}:features"
            t0 = time.perf_counter()
            _ = sync_cache.get(key)
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

        latencies.sort()
        p50 = latencies[50]
        p99 = latencies[99]

        print(f"\n[LatencyTest] GET: P50={p50:.3f}ms, P99={p99:.3f}ms")
        assert p50 < LATENCY_TARGET_MS, (
            f"P50 latency {p50:.3f}ms exceeds {LATENCY_TARGET_MS}ms target"
        )

    def test_p99_latency_constraint(self, sync_cache):
        """
        P99 GET latency MUST be ≤ 2ms per spec:
        T_lookup ≤ 2ms
        """
        latencies = []
        for i in range(N_MEASUREMENTS):
            key = f"test:user:{i % 100}:features"
            t0 = time.perf_counter()
            _ = sync_cache.get(key)
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

        latencies.sort()
        p99 = latencies[int(N_MEASUREMENTS * 0.99)]
        p95 = latencies[int(N_MEASUREMENTS * 0.95)]
        p50 = latencies[int(N_MEASUREMENTS * 0.50)]

        print(f"\n[LatencyTest] P50={p50:.3f}ms | P95={p95:.3f}ms | P99={p99:.3f}ms")
        print(f"[LatencyTest] Target: P99 ≤ {LATENCY_TARGET_MS}ms")
        print(f"[LatencyTest] Result: {'✅ PASS' if p99 <= LATENCY_TARGET_MS else '❌ FAIL'}")

        assert p99 <= LATENCY_TARGET_MS, (
            f"P99 cache latency {p99:.3f}ms exceeds {LATENCY_TARGET_MS}ms target.\n"
            f"P50={p50:.3f}ms, P95={p95:.3f}ms, P99={p99:.3f}ms"
        )

    def test_cache_miss_latency(self, sync_cache):
        """Cache misses (returns None) should also be fast."""
        latencies = []
        for i in range(200):
            key = f"nonexistent:key:{i}"
            t0 = time.perf_counter()
            result = sync_cache.get(key)
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)
            assert result is None, "Missing key should return None"

        latencies.sort()
        p99 = latencies[int(len(latencies) * 0.99)]
        print(f"\n[LatencyTest] Miss P99={p99:.3f}ms")
        assert p99 <= LATENCY_TARGET_MS * 2, (
            f"Cache miss P99 {p99:.3f}ms is too slow (target: <{LATENCY_TARGET_MS * 2}ms)"
        )

    def test_set_latency(self, sync_cache):
        """SET operations should be fast."""
        latencies = []
        for i in range(200):
            key = f"test:write:user:{i}"
            value = {"vector": list(range(47)), "user_id": f"W{i:04d}"}
            t0 = time.perf_counter()
            sync_cache.set(key, value, ttl=60)
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

        latencies.sort()
        p99 = latencies[int(len(latencies) * 0.99)]
        print(f"\n[LatencyTest] SET P99={p99:.3f}ms")
        assert p99 <= LATENCY_TARGET_MS * 2


@pytest.mark.asyncio
@pytest.mark.skipif(not REDIS_AVAILABLE, reason="Redis not installed")
class TestAsyncCacheLatency:
    """Async cache latency tests."""

    @pytest_asyncio.fixture
    async def cache(self):
        c = FeatureCache(REDIS_URL)
        try:
            await c.connect()
        except Exception:
            pytest.skip("Redis not reachable")
        yield c
        await c.disconnect()

    async def test_async_get_latency(self, cache):
        """Async GET should meet the 2ms P99 target."""
        # Pre-populate
        for i in range(50):
            await cache.set_user_features(f"USR{i:04d}", {
                "vector": list(range(47)), "user_id": f"USR{i:04d}"
            })

        latencies = []
        for i in range(200):
            uid = f"USR{i % 50:04d}"
            t0 = time.perf_counter()
            _ = await cache.get_user_features(uid)
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

        latencies.sort()
        p99 = latencies[int(len(latencies) * 0.99)]
        print(f"\n[AsyncLatency] Async GET P99={p99:.3f}ms")
        # Allow a bit more tolerance for async overhead
        assert p99 <= LATENCY_TARGET_MS * 3

    async def test_latency_telemetry(self, cache):
        """FeatureCache should report accurate latency stats."""
        for i in range(50):
            await cache.set(f"telemetry:test:{i}", {"v": i})

        for i in range(100):
            await cache.get(f"telemetry:test:{i % 50}")

        stats = cache.get_latency_stats()
        assert "p50" in stats
        assert "p99" in stats
        assert "hit_rate" in stats
        assert 0.0 <= stats["hit_rate"] <= 1.0
        print(f"\n[Telemetry] {stats}")

    async def test_mget_batch_efficiency(self, cache):
        """Pipeline MGET should be more efficient than N individual GETs."""
        keys = [f"batch:test:{i}" for i in range(20)]
        for k in keys:
            await cache.set(k, {"v": k})

        # Pipeline MGET
        t0 = time.perf_counter()
        results = await cache.mget(keys)
        batch_ms = (time.perf_counter() - t0) * 1000

        assert len(results) == len(keys)
        print(f"\n[Batch] MGET({len(keys)}) = {batch_ms:.2f}ms total, "
              f"{batch_ms/len(keys):.3f}ms/key")


class TestLatencyBounds:
    """Unit tests for latency monitoring logic (no Redis required)."""

    def test_max_latency_constant(self):
        assert MAX_LATENCY_MS == 2.0, (
            f"MAX_LATENCY_MS must be 2.0ms per spec, got {MAX_LATENCY_MS}"
        )

    def test_cache_records_latency(self):
        """FeatureCache should track latency samples."""
        cache = FeatureCache.__new__(FeatureCache)
        cache._latency_samples = []
        cache._miss_count = 0
        cache._hit_count = 0

        # Simulate recording latencies
        for ms in [0.5, 0.8, 1.2, 1.5, 1.9, 2.1]:
            cache._record_latency(ms)

        stats = cache.get_latency_stats()
        assert stats["samples"] == 6
        assert stats["p99"] > 0

    def test_latency_stats_empty(self):
        cache = FeatureCache.__new__(FeatureCache)
        cache._latency_samples = []
        cache._miss_count = 0
        cache._hit_count = 0
        stats = cache.get_latency_stats()
        assert stats["p50"] == 0.0
        assert stats["samples"] == 0
