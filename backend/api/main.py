"""
Aegis-Q FastAPI Application
==============================
Main FastAPI application with:
  - Async database connection pool (SQLAlchemy + asyncpg)
  - Redis feature cache integration
  - PQC signing infrastructure initialization
  - WebSocket support for real-time threat streaming
  - P99 latency tracking middleware
  - Health check endpoint
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.cache.redis_cache import FeatureCache
from backend.pqc.dsa import MLDSA87, get_dsa, load_dsa_keypair, save_dsa_keypair
from backend.pqc.kem import MLKEM1024, get_kem, load_keypair, save_keypair
from backend.pqc.audit_log import get_audit_logger, AuditActionType
from backend.api.routers import threats, graph, audit, ws
from backend.api.middleware.pqc_middleware import PQCHeaderMiddleware

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://aegis:aegis_secret@localhost:5432/aegisq"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
PQC_KEY_DIR = os.getenv("PQC_KEY_DIR", "./pqc_keys")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

# ─────────────────────────────────────────────────────────────────
# Database Engine
# ─────────────────────────────────────────────────────────────────
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


# ─────────────────────────────────────────────────────────────────
# Global State
# ─────────────────────────────────────────────────────────────────
feature_cache: FeatureCache = FeatureCache(REDIS_URL)
_latency_samples: list[float] = []


# ─────────────────────────────────────────────────────────────────
# Lifespan (startup/shutdown)
# ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all services on startup, clean up on shutdown."""
    logger.info("🚀 Aegis-Q starting up...")

    # Connect Redis
    await feature_cache.connect()
    logger.info("✅ Redis feature cache connected")

    # Initialize PQC keys
    dsa = get_dsa()
    kem = get_kem()
    audit_logger = get_audit_logger()

    try:
        dsa_keypair = load_dsa_keypair("aegis")
        kem_keypair = load_keypair("aegis")
        logger.info("✅ PQC keys loaded from disk")
    except FileNotFoundError:
        logger.warning("⚠️  PQC keys not found — generating new key pair")
        dsa_keypair = dsa.generate_keypair()
        kem_keypair = kem.generate_keypair()
        save_dsa_keypair(dsa_keypair, "aegis")
        save_keypair(kem_keypair, "aegis")
        logger.info("✅ New PQC keys generated and saved")

    audit_logger.set_keypair(dsa_keypair)

    # Store in app state for router access
    app.state.feature_cache = feature_cache
    app.state.dsa = dsa
    app.state.dsa_keypair = dsa_keypair
    app.state.kem = kem
    app.state.kem_keypair = kem_keypair
    app.state.audit_logger = audit_logger
    app.state.get_db = get_db

    # Log system start audit event
    async with async_session_maker() as db:
        try:
            await audit_logger.log(
                action_type=AuditActionType.SYSTEM_START,
                actor="SYSTEM",
                payload={"version": "1.0.0", "pqc_mode": os.getenv("PQC_MODE", "placeholder")},
                db=db,
            )
        except Exception as e:
            logger.warning(f"Could not write startup audit log: {e}")

    logger.info("✅ Aegis-Q fully operational")
    yield

    # Shutdown
    logger.info("🛑 Aegis-Q shutting down...")
    await feature_cache.disconnect()
    await engine.dispose()
    logger.info("✅ Cleanup complete")


# ─────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aegis-Q",
    description="Quantum-Hardened Insider Threat Detection Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://aegis-frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PQC Provenance Headers — injects X-PQC-KEM / X-PQC-DSA on all API responses
app.add_middleware(PQCHeaderMiddleware)


# ─────────────────────────────────────────────────────────────────
# Latency Tracking Middleware
# ─────────────────────────────────────────────────────────────────
@app.middleware("http")
async def latency_tracker(request: Request, call_next):
    """Track per-request latency for P99 monitoring."""
    t0 = time.perf_counter()
    response = await call_next(request)
    latency_ms = (time.perf_counter() - t0) * 1000

    _latency_samples.append(latency_ms)
    if len(_latency_samples) > 10000:
        _latency_samples[:] = _latency_samples[-5000:]

    response.headers["X-Response-Time-Ms"] = f"{latency_ms:.2f}"

    # Alert if P99 would exceed 35ms
    if len(_latency_samples) >= 100:
        p99 = sorted(_latency_samples)[int(len(_latency_samples) * 0.99)]
        if p99 > 35.0:
            logger.warning(
                f"[Latency] P99={p99:.2f}ms exceeds 35ms target "
                f"(path={request.url.path})"
            )

    return response


# ─────────────────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────────────────
app.include_router(threats.router, prefix="/api/threats", tags=["Threats"])
app.include_router(graph.router, prefix="/api/graph", tags=["Graph"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(ws.router, prefix="/ws", tags=["WebSocket"])


# ─────────────────────────────────────────────────────────────────
# Health & Metrics
# ─────────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """System health check."""
    cache_stats = feature_cache.get_latency_stats()
    return {
        "status": "healthy",
        "service": "aegis-q",
        "version": "1.0.0",
        "cache_p99_ms": cache_stats.get("p99", 0),
        "cache_hit_rate": cache_stats.get("hit_rate", 0),
    }


@app.get("/api/metrics", tags=["System"])
async def get_metrics():
    """
    Inference and cache latency metrics.
    Includes P99 end-to-end latency verification against ≤ 35ms target.
    """
    cache_stats = feature_cache.get_latency_stats()

    if _latency_samples:
        sorted_samples = sorted(_latency_samples)
        n = len(sorted_samples)
        p99_e2e = sorted_samples[int(n * 0.99)]
        p95_e2e = sorted_samples[int(n * 0.95)]
        p50_e2e = sorted_samples[int(n * 0.50)]
    else:
        p99_e2e = p95_e2e = p50_e2e = 0.0

    return {
        "inference_latency": {
            "p50_ms": round(p50_e2e, 2),
            "p95_ms": round(p95_e2e, 2),
            "p99_ms": round(p99_e2e, 2),
            "target_ms": 35.0,
            "within_target": p99_e2e <= 35.0,
            "samples": len(_latency_samples),
        },
        "cache_latency": {
            "p50_ms": round(cache_stats.get("p50", 0), 3),
            "p95_ms": round(cache_stats.get("p95", 0), 3),
            "p99_ms": round(cache_stats.get("p99", 0), 3),
            "target_ms": 2.0,
            "within_target": cache_stats.get("p99", 0) <= 2.0,
            "hit_rate": round(cache_stats.get("hit_rate", 0), 3),
        },
        "pqc": {
            "kem_algorithm": "ML-KEM-1024",
            "dsa_algorithm": "ML-DSA-87",
            "mode": os.getenv("PQC_MODE", "placeholder"),
        },
    }
