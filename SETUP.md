# Aegis-Q Setup Guide

> **Quantum-Hardened Insider Threat Detection Platform**  
> CERT Insider Threat Dataset r4.2 · Dual-Engine AI · ML-KEM-1024 · ML-DSA-87

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | ≥ 24.0 | Runs all services (Kafka, Redis, PostgreSQL) |
| Docker Compose | ≥ 2.20 | Cluster orchestration |
| Python | ≥ 3.11 | Backend runtime |
| Node.js | ≥ 20 LTS | Frontend runtime |
| Git | any | Repository cloning |

**Windows users:** WSL2 with Docker Desktop integration is strongly recommended for the PQC (liboqs) build.

---

## Option A — Full Docker Cluster (Recommended)

### 1. Clone & Navigate

```bash
# The workspace is already at:
cd "C:\Users\Sushanth Bandari\Desktop\aegis q"
```

### 2. Boot the Complete Cluster

```bash
cd infra
docker compose up -d
```

This starts:
- **Zookeeper + Kafka** (port 9092) — event streaming
- **Redis 7.2** (port 6379) — feature cache (T_lookup ≤ 2ms)
- **PostgreSQL 16** (port 5433) — persistent store + audit trail
- **Kafka topic init** — creates all 7 topics
- **FastAPI backend** (port 8000)
- **Next.js frontend** (port 3000)

### 3. Verify Services

```bash
# Check all services are healthy
docker compose ps

# View backend logs
docker compose logs -f backend

# Verify API
curl http://localhost:8000/health

# View frontend
open http://localhost:3000   # or navigate in browser
```

### 4. Start the Kafka Dataset Stream

```bash
# In a new terminal — streams CERT r4.2 in sample mode (fast)
docker compose exec backend python -m backend.ingestion.kafka_producer --sample

# Full dataset stream (large files — may take hours)
docker compose exec backend python -m backend.ingestion.kafka_producer
```

---

## Option B — Local Development (No Docker)

### Step 1: Start Infrastructure Services

Using Docker for just the data services:
```bash
cd infra

# Start only data infrastructure (no app containers)
docker compose up -d zookeeper kafka kafka-init redis postgres
```

Wait ~20s for Kafka to be ready.

### Step 2: Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate (WSL / Mac / Linux)
source .venv/bin/activate

# Install PyTorch (CPU) first
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install all dependencies
pip install -r requirements.txt

# Optional: Install PyTorch Geometric
pip install torch_geometric

# Optional: Install liboqs for real PQC (requires CMake + build tools)
# On Windows: run in WSL2
# sudo apt-get install cmake libssl-dev build-essential
# pip install liboqs-python
```

### Step 3: Configure Environment

Create `backend/.env` (do NOT commit real secrets):
```env
# Set `POSTGRES_PASSWORD` in a local `.env` or use a secrets manager.
POSTGRES_PASSWORD=
DATABASE_URL=postgresql+asyncpg://aegis:${POSTGRES_PASSWORD}@localhost:5433/aegisq
REDIS_URL=redis://localhost:6379
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
DATASET_PATH=../dataset/r4.2
PQC_KEY_DIR=./pqc_keys
PQC_MODE=placeholder
LOG_LEVEL=INFO
REPLAY_SPEED=inf
SAMPLE_MODE=true
```

### Step 4: Initialize PostgreSQL Schema

```bash
# Run schema init (if not using Docker init)
psql -U aegis -d aegisq -h localhost -p 5433 -f ../infra/postgres/init.sql
```

### Step 5: Run the Backend

```bash
cd backend

# Development server with hot reload
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload

# Verify
curl http://localhost:8000/health
curl http://localhost:8000/api/metrics
```

### Step 6: Start the Kafka Producer (in new terminal)

```bash
cd backend

# Sample mode (quick — uses first 10k rows per file)
python -m backend.ingestion.kafka_producer --sample

# Full stream (production — large files)
python -m backend.ingestion.kafka_producer
```

### Step 7: Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set environment (create .env.local)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> .env.local

# Start dev server
npm run dev
```

Navigate to: **http://localhost:3000**

---

## Provision demo TOTP secrets (development)

1. Copy `infra/.env.example` to `infra/.env` and set `AEGIS_KEK` if you want encrypted secrets.
2. Start the infra (see Option A step 2).
3. Provision demo secrets inside the backend container:

```powershell
cd infra
docker compose exec backend python -m backend.scripts.provision_demo_secrets
```

Or run locally (if you have the venv and dependencies installed):

```powershell
Set-Location '..\'
python backend\scripts\provision_demo_secrets.py
```

This writes per-user TOTP secrets under `backend/pqc_keys/`. If `AEGIS_KEK` is set the secrets are encrypted, otherwise plaintext fallback files are created for development.


## Option C — Training the AI Models

### Run Training (Engine B — Sequential Transformer)

```bash
cd backend

# Sample mode (quick test — ~2 min)
python -m backend.training.train \
  --dataset ../dataset/r4.2 \
  --answers ../dataset/answers \
  --output ./models \
  --epochs 5 \
  --batch-size 16 \
  --sample

# Full training
python -m backend.training.train \
  --dataset ../dataset/r4.2 \
  --answers ../dataset/answers \
  --output ./models \
  --epochs 20 \
  --batch-size 32 \
  --device cpu
```

Training output includes:
- Focal Loss formula confirmation log: `FL(p_t) = -α_t·(1-p_t)^γ·log(p_t)`
- P99 latency benchmark vs. ≤35ms target
- JSON training report at `./models/training_report.json`

---

## Running Tests

```bash
cd backend

# All tests (unit — no services required)
pytest tests/test_focal_loss.py tests/test_pqc.py -v

# Cache latency tests (requires Redis running)
pytest tests/test_cache_latency.py -v

# Full suite with coverage
pytest --cov=backend --cov-report=term-missing -v
```

---

## Service Port Reference

| Service | Port | URL |
|---------|------|-----|
| Next.js Frontend | 3000 | http://localhost:3000 |
| FastAPI Backend | 8000 | http://localhost:8000 |
| API Docs (Swagger) | 8000 | http://localhost:8000/docs |
| Kafka Broker | 9092 | localhost:9092 |
| Redis | 6379 | redis://localhost:6379 |
| PostgreSQL | 5433 | postgresql://localhost:5433/aegisq |

---

## Key Commands Cheatsheet

```bash
# Start all services
docker compose -f infra/docker-compose.yml up -d

# Stop all services
docker compose -f infra/docker-compose.yml down

# View backend logs
docker compose -f infra/docker-compose.yml logs -f backend

# Check API metrics (latency verification)
curl http://localhost:8000/api/metrics | python -m json.tool

# Run sample stream
docker compose exec backend python -m backend.ingestion.kafka_producer --sample

# Run tests
cd backend && pytest tests/ -v

# Check PQC key generation
ls backend/pqc_keys/
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Kafka not ready | Wait 30s after `docker compose up`; run `docker compose logs kafka` |
| Redis connection refused | Ensure `docker compose up redis` completed; check port 6379 |
| liboqs import error | System runs in placeholder PQC mode — fully functional, non-production |
| torch_geometric missing | Run `pip install torch_geometric` separately after torch install |
| Large file OOM (http.csv ~14GB) | Use `--sample` flag; ensure 16GB+ RAM for full ingestion |
| Frontend 404 on API calls | Ensure backend is running on port 8000; check `.env.local` |
