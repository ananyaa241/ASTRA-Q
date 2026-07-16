# Astra-Q — Git Upload & Clone Guide

> Complete instructions to push Project Astra-Q to GitHub and clone it on a new machine.

---

## Part 1 — First-Time Upload to GitHub

### Step 1: Create a New Repository on GitHub

1. Go to [https://github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name:** `Astra-Q`
   - **Description:** `Quantum-Hardened Insider Threat Detection Platform`
   - **Visibility:** Private *(recommended — contains security architecture)*
   - ✅ **Do NOT** initialize with README, .gitignore, or license (you already have them)
3. Click **Create repository**
4. Copy the remote URL shown — it will look like:
   ```
   https://github.com/YOUR_USERNAME/Astra-Q.git
   ```

---

### Step 2: Initialize Git in the Project

Open a terminal in the project root (`C:\Users\Sushanth Bandari\Desktop\aegis q`) and run:

```powershell
# Initialize a git repository
git init

# Set default branch to main
git branch -M main
```

---

### Step 3: Verify .gitignore is Working

Before staging anything, confirm large/sensitive files are excluded:

```powershell
# This should NOT list: dataset/, .venv/, node_modules/, .env, pqc_keys/, *.pt
git status --short

# Explicitly check a few paths
git check-ignore -v dataset/r4.2/logon.csv
git check-ignore -v backend/.venv
git check-ignore -v frontend/node_modules
git check-ignore -v pqc_keys/
```

If any of those paths show up as **not ignored**, check that [`.gitignore`](.gitignore) was saved correctly.

---

### Step 4: Stage All Project Files

```powershell
# Stage everything (respects .gitignore automatically)
git add .

# Review what will be committed — scan for anything unexpected
git status
```

> ⚠️ **Before committing**, make sure you do NOT see:
> - `dataset/r4.2/*.csv` (large CERT files)
> - `backend/.venv/` (Python virtual environment)
> - `frontend/node_modules/` (npm packages)
> - `pqc_keys/` (private cryptographic keys)
> - `backend/.env` (secrets)
> - `models/*.pt` (large model weights)

---

### Step 5: Create the Initial Commit

```powershell
git commit -m "feat: initial Astra-Q implementation

- Dual-engine AI: HeteroGCN (Engine A) + Transformer (Engine B)
- Focal Loss FL(p_t) = -α_t·(1-p_t)²·log(p_t), γ=2.0
- PQC layer: ML-KEM-1024 (transport) + ML-DSA-87 (signing)
- FastAPI backend with P99 ≤ 35ms latency middleware
- Redis feature cache with T_lookup ≤ 2ms
- Next.js 14 SOC dashboard: D3 graph, Threat Table, Audit Trail
- Docker Compose full-stack deployment
- 27 pytest tests covering Focal Loss, PQC, and cache latency"
```

---

### Step 6: Add the Remote and Push

```powershell
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/Astra-Q.git

# Push to GitHub
git push -u origin main
```

If prompted, sign in with your GitHub credentials (or use a Personal Access Token if you have 2FA enabled).

---

### Step 7: Verify on GitHub

1. Open `https://github.com/YOUR_USERNAME/Astra-Q`
2. Confirm you see the project structure:
   ```
   Astra-Q/
   ├── backend/
   ├── frontend/
   ├── infra/
   ├── README.md
   ├── SETUP.md
   ├── .gitignore
   └── .env.example     ← template only, no secrets
   ```
3. Confirm `dataset/`, `.venv/`, `node_modules/`, and `pqc_keys/` are **absent**

---

## Part 2 — Cloning on a New Machine

### Step 1: Clone the Repository

```bash
# HTTPS (recommended for most users)
git clone https://github.com/YOUR_USERNAME/Astra-Q.git

# SSH (if you have SSH keys set up)
git clone git@github.com:YOUR_USERNAME/Astra-Q.git

cd Astra-Q
```

---

### Step 2: Add the Dataset

The CERT r4.2 dataset is **not included** in the repo (too large). Copy it manually:

```bash
# Create the dataset directory
mkdir -p dataset/r4.2
mkdir -p dataset/answers

# Copy from your original machine or download from CMU SEI:
# https://resources.sei.cmu.edu/library/asset-view.cfm?assetid=508099
# Then place files here:
#   dataset/r4.2/logon.csv
#   dataset/r4.2/device.csv
#   dataset/r4.2/http.csv
#   dataset/r4.2/email.csv
#   dataset/r4.2/file.csv
#   dataset/r4.2/psychometric.csv
#   dataset/r4.2/LDAP/
#   dataset/answers/insiders.csv
```

---

### Step 3: Configure Environment

```bash
# Copy the template and fill in values
cp .env.example backend/.env

# Edit backend/.env with your local settings
# (DB URL, Redis URL, Kafka address, etc.)
```

For the frontend:
```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> frontend/.env.local
```

---

### Step 4: Set Up Backend (Python)

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate (Linux / macOS / WSL)
source .venv/bin/activate

# Install PyTorch first (CPU build)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install all dependencies
pip install -r requirements.txt

# Optional: PyTorch Geometric (for Engine A HeteroGCN)
pip install torch_geometric

cd ..
```

---

### Step 5: Set Up Frontend (Node.js)

```bash
cd frontend
npm install
cd ..
```

---

### Step 6: Start Infrastructure Services

```bash
cd infra

# Start Kafka, Redis, PostgreSQL (and optionally backend + frontend containers)
docker compose up -d

# Wait ~20 seconds for Kafka to be ready, then verify
docker compose ps
```

---

### Step 7: Run the Application

```bash
# Terminal 1 — Backend API
cd backend
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev

# Terminal 3 — Kafka dataset stream (sample mode)
cd backend
python -m backend.ingestion.kafka_producer --sample
```

Open **http://localhost:3000** in your browser.

---

### Step 8: Run Tests (Verify Installation)

```bash
cd backend

# No services required — runs immediately
pytest tests/test_focal_loss.py tests/test_pqc.py -v

# With Redis running
pytest tests/test_cache_latency.py -v

# Full suite with coverage
pytest --cov=backend --cov-report=term-missing -v
```

---

## Part 3 — Ongoing Workflow

### Push Changes

```bash
# Stage modified files
git add .

# Commit with a descriptive message
git commit -m "fix: correct async generator call in router get_db()"

# Push to GitHub
git push
```

### Pull Latest Changes on Another Machine

```bash
git pull origin main
```

### Create a Feature Branch

```bash
git checkout -b feature/add-kafka-consumer
# ... make changes ...
git add .
git commit -m "feat: add Kafka consumer for aegis.threats topic"
git push -u origin feature/add-kafka-consumer
```

---

## Important: What Is NOT in the Repository

| Path | Reason | How to Restore |
|------|---------|----------------|
| `dataset/r4.2/` | Large files (up to 14GB) | Download from CMU SEI |
| `dataset/answers/` | Same as above | Same source |
| `backend/.venv/` | Auto-generated | `pip install -r requirements.txt` |
| `frontend/node_modules/` | Auto-generated | `npm install` |
| `pqc_keys/` | **Private crypto keys** | Auto-generated on first run |
| `backend/.env` | **Contains secrets** | Copy from `.env.example` |
| `models/*.pt` | Large binary weights | Run `python -m backend.training.train` |
| `.next/` | Next.js build cache | `npm run build` |

---

## Recommended Repository Settings (GitHub)

After pushing, go to **Settings → Branches** and:

- ✅ Set `main` as the default branch
- ✅ Enable **Branch protection rules** on `main`:
  - Require pull request reviews before merging
  - Require status checks to pass before merging

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Value |
|-------------|-------|
| `DATABASE_URL` | Your production DB URL |
| `REDIS_URL` | Your production Redis URL |
| `PQC_MODE` | `production` (when liboqs is available) |

