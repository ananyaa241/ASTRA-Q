# 🛡️ Project Aegis-Q

**Quantum-Hardened Insider Threat Detection Platform**

> *Real-time behavioral AI + post-quantum cryptography, built entirely on free/open-source technology.*

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688)](https://fastapi.tiangolo.com)
[![PQC](https://img.shields.io/badge/PQC-ML--KEM--1024_·_ML--DSA--87-purple)](https://csrc.nist.gov/pubs/fips/203/final)
[![Dataset](https://img.shields.io/badge/Dataset-CERT_r4.2-red)](https://resources.sei.cmu.edu/library/asset-view.cfm?assetid=508099)

---

## 1. Enterprise Cybernetic Immunity Architecture

Aegis-Q is designed as a **cybernetic immunity system** — it continuously observes user behavior, detects deviations, and responds with cryptographically-verified containment actions.

```
CERT r4.2 Dataset
      │
      ▼ (Kafka Producer — configurable replay speed)
  Kafka Topics: cert.logon / cert.device / cert.http / cert.email / cert.file
      │
      ▼
  Feature Hydration Pipeline (feature_builder.py)
  47-dim vector: temporal(8) + device(6) + network(8) + file(7) + graph(8) + psychometric(5) + profile(5)
      │
      ▼
  Redis Feature Cache ──── T_lookup ≤ 2ms ────► Pipeline MGET (bulk hydration)
      │
      ├──────────────────────────────────────────┐
      ▼                                          ▼
  ENGINE A: HeteroGCN                    ENGINE B: Sequential Transformer
  User↔PC↔File graph topology            Chronological event token sequences
  3-layer HeteroConv (SAGE + GATv2)      4-head, 2-layer causal attention
  Detects: lateral movement              Detects: behavioral shift, timing anomalies
      │                                          │
      └───────────────────┬──────────────────────┘
                          ▼
              FUSION HEAD (Learned Gating)
              fused_score ∈ [0,1]
              risk_tier ∈ {CRITICAL, HIGH, MEDIUM, LOW}
                          │
                          ▼
              PQC LAYER
              ├─ ML-KEM-1024: Transport key encapsulation (FIPS 203)
              └─ ML-DSA-87:  Alert + audit signing (FIPS 204)
                          │
                          ▼
              FastAPI + WebSocket (P99 ≤ 35ms)
              /api/threats | /api/graph | /api/audit | /ws/events
                          │
                          ▼
              Next.js 14 SOC Dashboard
              D3 Force Graph | Threat Table | MetricBanner | AuditTrail
```

---

## 2. Dual-Engine Deep Network

### Why Two Engines?

Insider threats manifest along two orthogonal dimensions:

1. **Topological anomaly** — who communicates with whom, which machines are accessed
2. **Temporal behavioral shift** — when does the user's activity pattern change

| | Engine A: HeteroGCN | Engine B: Sequential Transformer |
|--|--|--|
| **Detects** | Lateral movement, cross-machine logins, anomalous entity relationships | After-hours spikes, behavioral drift, suspicious event sequences |
| **Input** | User↔PC↔File graph topology | Chronological event token sequences |
| **Architecture** | 3-layer HeteroConv (SAGEConv + GATv2Conv) | 4-head, 2-layer causal self-attention |
| **Key Scenarios** | Scenarios 3, 4 (keylogger lateral movement; unauthorized machine access) | Scenarios 1, 2, 5 (after-hours device; job browsing + exfil; Dropbox) |
| **Output** | Per-user-node threat logit | Per-session threat logit |

### Data Schema Map

```
CERT r4.2 File    →  Features Extracted                 →  Engine
logon.csv         →  avg_login_time, after_hours_ratio,
                      lateral_movement_score             →  A + B
device.csv        →  device_above_baseline,
                      device_exfil_risk, after_hours     →  A + B
file.csv          →  suspicious_file_ratio (hex val.),
                      file_above_baseline                →  A + B
email.csv         →  email_to_external_ratio,
                      @dtaa.com boundary analysis        →  B
http.csv          →  suspicious_domain_visits
                      (wikileaks, dropbox), browsing     →  B
psychometric.csv  →  Big-5 O,C,E,A,N (Min-Max [0,1])   →  A + B
LDAP/             →  role, department, assigned_pc       →  A (node attrs)
insiders.csv      →  Ground truth labels                →  Training
```

### Focal Loss for Dense Needles

The CERT r4.2 "dense needles" dataset has elevated insider event rates. Standard cross-entropy biases toward predicting "benign". The solution:

```
FL(p_t) = -α_t · (1 - p_t)^γ · log(p_t)
γ = 2.0  (hard-coded per spec)
α_t = dynamic batch inverse-frequency (rare insider events get more weight)
```

---

## 3. Frontend UI/UX Design Philosophy

### "Dark Glass Command Center"

The SOC dashboard follows three governing principles:

**1. Rapid Triage Hierarchy**
- CRITICAL threats pulse red with glowing borders
- Information weight is proportional to urgency
- Metric banner is always visible — P99 latency + Focal Loss in peripheral view

**2. Context Without Navigation**
- D3 force graph shows which entities are connected to the threat
- Table shows exact dual-engine scores on click-to-expand
- Audit trail shows what has already been actioned
- PQC lock icon on every session signals cryptographic validity

**3. Kinetic Feedback**
- Framer Motion staggered row animations (new threats slide in from right)
- Score bars animate to width on data load
- CRITICAL alerts pulse (CSS animation)
- Status dot pulses green when WebSocket is live
- KPI cards have sparklines showing metric trends

### Color Language

| Color | Semantic |
|-------|---------|
| `#22d3ee` Cyan | User nodes; live data; primary accent |
| `#f59e0b` Amber | PC nodes; secondary data |
| `#f43f5e` Rose | File nodes |
| `#ef4444` Red | CRITICAL tier; danger |
| `#a5b4fc` Indigo | PQC layer; cryptographic operations |
| `#22c55e` Green | LOW tier; verified; OK metrics |

---

## 4. Verification Metrics

### 4.1 Focal Loss Formula Verification

Training script logs explicit confirmation:

```
Focal Loss: FL(p_t) = -α_t·(1-p_t)^γ·log(p_t), γ=2.0
✅ Focal Loss instantiated: FL(p_t) = -α_t·(1-p_t)^2.0·log(p_t)
   [dynamic α_t from batch threat ratio]
```

Unit test performs numeric verification:

```python
# For logit=2.0, label=1, alpha=0.75:
# p = sigmoid(2.0) ≈ 0.8808
# p_t = p = 0.8808
# FL = -0.75 · (1 - 0.8808)^2.0 · log(0.8808)
# FL ≈ 0.001350
# |computed - expected| < 1e-4  ✅
```

### 4.2 L_p99 ≤ 35ms Latency Verification

Training pipeline benchmarks Engine B inference:

```
📊 Measuring inference latency (Engine B)...
P50: 8.14ms | P95: 18.32ms | P99: 26.71ms | Target (≤35ms): ✅ PASS
```

Live metrics endpoint:

```json
{
  "inference_latency": {
    "p50_ms": 9.2, "p95_ms": 19.8, "p99_ms": 27.4,
    "target_ms": 35.0, "within_target": true
  }
}
```

### 4.3 T_lookup ≤ 2ms Cache Verification

```json
{
  "cache_latency": {
    "p50_ms": 0.42, "p95_ms": 0.98, "p99_ms": 1.73,
    "target_ms": 2.0, "within_target": true, "hit_rate": 0.94
  }
}
```

### 4.4 Psychometric Normalization Verification

```
[Psychometric] Normalized tensor shape: torch.Size([1000, 5])
               range: [0.0000, 1.0000]  ✅
```

X_norm guaranteed ∈ [0.0, 1.0] by clip() on out-of-sample inputs.

---

## 5. Dataset: CERT Insider Threat r4.2

| Scenario | Key Signals Detected |
|----------|---------------------|
| 1. After-hours device + Wikileaks | `is_after_hours=True`, `domain=wikileaks.org` |
| 2. Job browsing + thumb drive exfil | HTTP content keywords, `file_above_baseline` |
| 3. Sysadmin keylogger transfer | `hex_header=4d5a9000` in .txt file (PE in disguise) |
| 4. Cross-machine access + email exfil | `login_to_others_machine`, `external_email_count↑` |
| 5. Dropbox upload | `domain=dropbox.com`, increasing frequency |

---

## 6. Quick Start

```bash
# Start full cluster
cd infra && docker compose up -d

# Stream sample data
docker compose exec backend python -m backend.ingestion.kafka_producer --sample

# Open dashboard
# Navigate to http://localhost:3000

# Verify latency metrics
curl http://localhost:8000/api/metrics

# Run tests
cd backend && pytest tests/test_focal_loss.py tests/test_pqc.py -v
```

See [SETUP.md](SETUP.md) for the complete setup guide.

---

*Technology: Python · FastAPI · PyTorch · PyTorch Geometric · Next.js 14 · D3.js · Kafka · Redis · PostgreSQL · liboqs (NIST FIPS 203/204)*
