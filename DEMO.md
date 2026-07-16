# ASTRA-Q — Demo Guide

> **Advanced Security Threat Response Architecture – Quantum**
> AI-Powered Quantum-Resilient Platform for Insider Threat Detection & Privileged Access Security

---

## Quick Start

### 1. Start the backend + infra
```powershell
cd "c:\Users\Sushanth Bandari\Desktop\aegis q\infra"
docker compose up -d
```

### 2. Start the frontend
```powershell
cd "c:\Users\Sushanth Bandari\Desktop\aegis q\frontend"
npm run dev
```

### 3. Open the app
```
http://localhost:3000
```
The root `/` auto-redirects based on session state:
- **First visit** → `/access` (login page)
- **Already logged in** → `/dashboard` (command center)

---

## Demo Credentials

The backend derives risk tier from keywords in the **Operator ID**. The password field accepts **any non-empty string** in demo mode.

| Scenario | Operator ID | Password | MFA Code | Result |
|----------|------------|----------|----------|--------|
| ✅ **LOW risk — instant access** | `USR1771` | `password` | *(none required)* | Direct to dashboard |
| ✅ **LOW risk — instant access** | `alice` | `demo123` | *(none required)* | Direct to dashboard |
| ⚠️ **MEDIUM risk — MFA required** | `USR_medium_001` | `password` | `123456` | MFA screen → dashboard |
| ⚠️ **HIGH risk — MFA required** | `USR_high_analyst` | `password` | `123456` | MFA screen → dashboard |
| 🔴 **CRITICAL — access denied** | `USR_critical_threat` | `password` | *(blocked)* | Red denial card |
| 🔴 **CRITICAL — access denied** | `critical_user` | `any` | *(blocked)* | Red denial card |

> **How risk is determined:**  
> The backend checks if the Operator ID (lowercased) **contains** the keyword:
> - `critical` → CRITICAL tier → 403 Blocked  
> - `high` → HIGH tier (score 0.75) → MFA required  
> - `medium` → MEDIUM tier (score 0.55) → MFA required  
> - *(anything else)* → LOW tier (score 0.20) → Access granted immediately

> **TOTP Demo Secret:**  
> The backend uses `pyotp.TOTP('base32secret3232')`.  
> The demo code `123456` is pre-validated via `totp.verify()`.  
> In the MFA screen, the hint **"Demo mode: use code 123456"** is shown.

---

## Full Demo Walkthrough

### Scenario A — Normal User (LOW risk)

1. Go to `http://localhost:3000/access`
2. Enter **Operator ID:** `alice` | **Passphrase:** `password`
3. Watch the 3-step Risk Evaluation stepper animate:  
   `Identity Submitted ✓ → Evaluating Risk Profile... → Awaiting Authorization`
4. Instantly redirected to `/dashboard`
5. See the Dark Glass Command Center with live threat data

---

### Scenario B — Anomalous User (HIGH risk → MFA)

1. Go to `http://localhost:3000/access`
2. Enter **Operator ID:** `bob_high_risk` | **Passphrase:** `password`
3. Backend returns 401 MFA Required → MFA challenge screen appears (amber card)
4. Observe the Access Workflow Stepper at the top: Step 3 "Identity Verification" becomes **active cyan**
5. Enter MFA code: **`123456`**
6. Redirected to `/dashboard` with risk tier shown in header

---

### Scenario C — Insider Threat (CRITICAL risk → Denied)

1. Go to `http://localhost:3000/access`
2. Enter **Operator ID:** `critical_insider` | **Passphrase:** `password`
3. Backend returns 403 → **Red "ACCESS DENIED" card** appears with pulsing border
4. Badge shown: `ML-DSA-87 · AUDIT LOGGED` (simulates PQC audit trail write)
5. Click **← Return to Gateway** to go back to login

---

### Scenario D — Watching the Live Dashboard

Once logged in at `/dashboard`:

1. **WorkflowTracker** (horizontal bar below header):
   - Steps 1–6 always green ✓ (authentication complete)
   - Step 7 "Telemetry Stream" pulses cyan when WebSocket is **CONNECTED**
   - Step 9 "ANOMALY DETECTED" turns red when a CRITICAL alert arrives

2. **Architecture Map** (left column, 200px):
   - 5 layers from USERS → SIEM/SOC
   - Live counts update from threat data
   - IAM layer shows DEGRADED if WebSocket disconnects

3. **Entity Relationship Graph** (center):
   - D3 force-directed graph of users, PCs, and files
   - Red anomalous edges highlight lateral movement
   - Hover nodes for threat score tooltip

4. **Session Panel** (right column, top):
   - Top 5 CRITICAL+HIGH sessions sorted by fused_score
   - Live elapsed timers counting up from page load
   - 🔒 **Contain** → opens action picker (ISOLATE / LOCK_ACCOUNT / ALERT_ANALYST)
   - 👁 **Monitor** → sets to MONITOR_ENHANCED immediately

5. **Threat Table** (right column, below sessions):
   - Full threat session list with tier filter pills
   - Click any row to expand GCN/XFMR score breakdown
   - CONTAIN button triggers real API call → logged to audit trail

6. **Alert Panel** (appears when WebSocket alerts arrive):
   - **TERMINATE** button (red) → triggers ISOLATE containment
   - **SEVER** button (amber) → triggers ALERT_ANALYST
   - Dismiss (×) removes from panel

7. **PQC Audit Trail** (bottom of center column, `id="audit-trail"`):
   - Every containment action is ML-DSA-87 signed and logged
   - Click any row to expand signature preview + key fingerprint
   - VERIFY button calls `/api/audit/{id}/verify` for cryptographic validation

8. **NavSidebar** (fixed 48px left strip):
   - 🛡 Shield → Dashboard (with red badge showing CRITICAL+HIGH count)
   - 🔒 Lock → Access Gateway (logout / switch user)
   - 📄 Document → scrolls to Audit Trail
   - Bottom: avatar circle with your Operator ID initial

---

## Demo Without Backend (Offline Mode)

The frontend includes **DEMO MODE** with synthetic threat data.  
When Docker is not running, the dashboard shows a yellow banner:

```
DEMO MODE — Showing synthetic CERT r4.2 data. Start Docker to stream live events.
```

All panels (Graph, Threats, Audit Trail, Metrics) still render fully with pre-seeded data. The **WS status** dot shows `DISCONNECTED` (orange).

To experience the full live stream, ensure Docker is running:
```powershell
docker compose ps  # should show all services healthy
```

---

## API Reference (for manual testing)

**Base URL:** `http://localhost:8000`

```bash
# LOW risk — direct access
curl -X POST http://localhost:8000/api/auth/request-access \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "password": "demo", "totp_code": null}'

# HIGH risk — get MFA prompt
curl -X POST http://localhost:8000/api/auth/request-access \
  -H "Content-Type: application/json" \
  -d '{"user_id": "high_risk_user", "password": "demo", "totp_code": null}'

# HIGH risk — submit MFA code
curl -X POST http://localhost:8000/api/auth/request-access \
  -H "Content-Type: application/json" \
  -d '{"user_id": "high_risk_user", "password": "demo", "totp_code": "123456"}'

# CRITICAL — expect 403
curl -X POST http://localhost:8000/api/auth/request-access \
  -H "Content-Type: application/json" \
  -d '{"user_id": "critical_user", "password": "demo", "totp_code": null}'

# Trigger containment
curl -X POST http://localhost:8000/api/threats/contain \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess_001", "user_id": "alice", "action": "ISOLATE", "analyst_id": "analyst_alice", "reason": "Demo test"}'

# View audit trail
curl http://localhost:8000/api/audit/

# View threat sessions
curl http://localhost:8000/api/threats/

# Health check
curl http://localhost:8000/health
```

---

## PQC Cryptography Details

| Component | Algorithm | Standard |
|-----------|-----------|----------|
| Key Encapsulation | ML-KEM-1024 | NIST FIPS 203 |
| Digital Signatures | ML-DSA-87 | NIST FIPS 204 |
| Audit Hash | SHA3-512 | NIST FIPS 202 |
| TOTP Demo Secret | `base32secret3232` | RFC 6238 |

Every containment action is **ML-DSA-87 signed** and written to an append-only audit trail. The signature preview and signing key fingerprint are visible in the Audit Trail panel of the dashboard.

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | TailwindCSS + Vanilla CSS (Dark Glass system) |
| Animation | Framer Motion |
| Graph | D3.js (force simulation, SSR-disabled) |
| Backend | FastAPI + Python |
| AI Engine | PyTorch (GCN + Transformer fusion) |
| Message Bus | Apache Kafka |
| Cache | Redis |
| PQC | NIST FIPS 203/204 (ML-KEM / ML-DSA) |
| Auth OTP | pyotp (RFC 6238 TOTP) |
| Infra | Docker Compose |
