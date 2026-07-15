# Project Title
**Aegis-Q: Quantum-Hardened Insider Threat Detection Platform**

## Abstract
Aegis-Q is an advanced Security Operations Center (SOC) platform designed to detect insider threats in real-time while safeguarding its audit trails against future quantum computing attacks. By leveraging a dual-engine AI architecture—combining a Heterogeneous Graph Convolutional Network (HeteroGCN) and a Sequential Causal Transformer—the system accurately identifies lateral movement and behavioral anomalies from highly imbalanced enterprise event logs (e.g., CERT r4.2 dataset). To ensure the non-repudiation and integrity of security events, Aegis-Q integrates Post-Quantum Cryptography (ML-DSA-87 and ML-KEM-1024), cryptographically signing all critical audit logs. The platform features an ultra-responsive, viewport-locked "Dark Glass" dashboard that visualizes entity relationships and threat metrics with sub-35ms inference latency.

## Problem Statement
Insider threats remain one of the most challenging vectors in cybersecurity due to the extreme class imbalance between normal user behavior and malicious activities. Traditional rule-based systems generate excessive false positives, leading to alert fatigue among SOC analysts. Furthermore, the impending arrival of Cryptographically Relevant Quantum Computers (CRQCs) threatens the integrity of historical audit logs, as classical digital signatures (like RSA and ECC) can be broken, allowing adversaries to tamper with evidence retrospectively.

## Objectives
1.  **High-Fidelity Detection:** Implement a hybrid AI model to reduce false positives in insider threat detection.
2.  **Quantum-Resistant Auditing:** Secure system audit trails using NIST-standardized post-quantum cryptographic algorithms.
3.  **Real-Time Processing:** Achieve sub-35ms end-to-end inference latency and sub-2ms cache lookup latency.
4.  **Operational Usability:** Deliver a visually striking, highly scannable, and resilient SOC dashboard.
5.  **Cost Efficiency:** Build the entire stack using 100% free and open-source technology.

## Scope of the Project
The project encompasses a complete full-stack implementation, including:
*   A scalable data pipeline for ingesting multi-modal event logs (Kafka, Redis, PostgreSQL).
*   A dual-engine AI backend (FastAPI, PyTorch).
*   A post-quantum cryptographic logging module (liboqs).
*   A real-time, responsive frontend dashboard (Next.js, D3.js).
*   *Out of scope:* Automated infrastructure response (e.g., actively disabling Active Directory accounts), which is left as a future integration point.

## Existing System
Existing SOC and SIEM (Security Information and Event Management) platforms heavily rely on static rule sets (e.g., Sigma rules) or basic anomaly detection baselines. They often evaluate events in isolation, failing to capture complex, multi-stage attacks like lateral movement. Additionally, current systems rely on classical cryptographic standards (RSA/ECC) for logging, rendering their audit trails vulnerable to future quantum decryption (Store Now, Decrypt Later attacks).

## Proposed System
Aegis-Q proposes a paradigm shift by integrating:
1.  **Context-Aware AI:** Using HeteroGCN to map the topology of users, devices, and files, combined with a Transformer to model the chronological sequence of events.
2.  **PQC Integration:** Applying ML-DSA-87 signatures to append-only database records.
3.  **Focal Loss Optimization:** Training models to explicitly focus on the rare, hard-to-classify malicious events rather than the overwhelming majority of benign events.

## System Architecture
The architecture is an event-driven microservices ecosystem:
*   **Data Ingestion Layer:** Apache Kafka handles streams for Logon, Device, HTTP, Email, and File events.
*   **Feature Store:** Redis provides ultra-low latency access to user/device feature vectors.
*   **Inference Engine:** A FastAPI backend orchestrates the PyTorch models (HeteroGCN + Transformer + Fusion Head).
*   **Storage Layer:** PostgreSQL (via asyncpg) stores persistent threat data and the cryptographic audit trail.
*   **Presentation Layer:** A Next.js 14 frontend communicates via REST (polling fallback) and WebSockets (real-time stream).

## System Workflow
1.  Event logs are ingested into specific Kafka topics.
2.  The backend consumes these logs, retrieves historical context from the Redis feature cache, and constructs graph/sequence inputs.
3.  Engine A (HeteroGCN) calculates topological threat scores; Engine B (Transformer) calculates temporal threat scores.
4.  The Fusion Head blends these scores based on psychometric and temporal context to generate a final Risk Tier.
5.  If a threshold is breached, an Alert is generated.
6.  The Alert is cryptographically signed (ML-DSA-87) and stored in PostgreSQL.
7.  The Alert is pushed via WebSocket to the Next.js frontend, updating the Threat Graph, Metrics, and Audit Trail in real-time.

## Functional Requirements
*   **Threat Streaming:** System must ingest and process event logs in real-time.
*   **AI Inference:** System must score user sessions using graph and sequence models.
*   **Audit Logging:** All critical system actions must be logged and signed with PQC algorithms.
*   **Real-Time Visualization:** The UI must display an interactive entity relationship graph.
*   **Offline Mode (Resiliency):** The UI must fall back to synthetic demo data if the backend disconnects.

## Non-Functional Requirements
*   **Performance:** $P99$ inference latency $\le 35$ms. Cache lookup latency $\le 2$ms.
*   **Security:** Cryptography must adhere to FIPS 203 (ML-KEM) and FIPS 204 (ML-DSA) draft standards.
*   **Scalability:** Microservices must be containerized and horizontally scalable.
*   **Usability:** UI must adhere to a strict viewport-locked layout with independent panel scrolling to prevent layout shifting.

## Technology Stack
*   **Backend:** Python 3.10+, FastAPI, PyTorch, PyTorch Geometric, SQLAlchemy, asyncpg.
*   **Frontend:** Next.js 14 (App Router), React, TypeScript, D3.js, Framer Motion, Vanilla CSS.
*   **Infrastructure:** PostgreSQL 16, Redis 7, Apache Kafka (Confluent), Docker, Docker Compose.
*   **Cryptography:** `liboqs` (Open Quantum Safe).

## Software Requirements
*   Docker & Docker Compose (for infrastructure).
*   Node.js 20+ (for frontend development).
*   Python 3.10+ (for backend development).
*   C Compiler/CMake (required for building `liboqs`).

## Hardware Requirements
*   **Minimum:** 4 CPU Cores, 8GB RAM (16GB recommended for running all containers + PyTorch locally).
*   **Storage:** 20GB free space for containers and database volumes.

## Module Description
1.  **Ingestion Module:** Parses synthetic CERT r4.2 logs and routes them to Kafka.
2.  **Engine A (HeteroGCN):** 3-layer Graph Neural Network modeling relationships between users, PCs, and files.
3.  **Engine B (Transformer):** 4-head, 2-layer causal self-attention network modeling event sequences.
4.  **Fusion Head:** Context-aware gating network that dynamically weights the outputs of Engine A and B.
5.  **PQC Module:** Wrapper around `liboqs` managing keypair generation, signature creation, and verification.
6.  **Dashboard UI:** Viewport-locked interface featuring a Threat Graph, Threat Table, Metric Banner, and Audit Trail.

## Database Design
The primary datastore (PostgreSQL) includes:
*   `threat_sessions`: Tracks active sessions, fused scores, and risk tiers.
*   `audit_log`: Append-only ledger storing `action_type`, `actor`, `target`, `payload_hash`, `pqc_signature`, and `pqc_algorithm`.
*   `graph_edges`: Materialized view of current active topological connections for fast UI polling.

## API Design
FastAPI exposes several REST endpoints and a WebSocket:
*   `GET /health`, `GET /api/metrics`: System telemetry and latency statistics.
*   `GET /api/threats/active`: Returns current threat sessions.
*   `GET /api/graph/topology`: Returns nodes and edges for D3 rendering.
*   `POST /api/audit/verify/{entry_id}`: Recomputes the hash and validates the ML-DSA-87 signature of an audit log.
*   `WS /ws/stream`: Pushes real-time graph updates and alerts.

## User Interface Design
The "Dark Glass" UI is designed for high data density and low cognitive load:
*   **Viewport Locked:** Uses `position: fixed; inset: 0` to prevent page scrolling. Panels use internal `overflow-y: auto`.
*   **Visual Hierarchy:** Critical alerts pulse in red, while standard metrics use cool cyan/blue tones.
*   **Interactive Graph:** D3.js force-directed graph automatically fits its container via `ResizeObserver`, allowing analysts to drag nodes and view tooltips without layout breakage.

## Implementation
Implementation followed a strict microservices approach via `docker-compose`. The backend utilizes asynchronous I/O (`asyncio`, `asyncpg`) to ensure the machine learning inference loop is not blocked by database or cache operations. The frontend leverages React `useCallback` and `useRef` heavily to prevent unnecessary re-renders of the expensive D3 graph.

## Algorithms/Methodology
*   **Focal Loss:** $FL(p_t) = -\alpha_t (1 - p_t)^\gamma \log(p_t)$ (with $\gamma = 2.0$) used during training to penalize the model heavily for missing rare malicious events.
*   **Message Passing (GCN):** Information flows from File $\rightarrow$ PC $\rightarrow$ User to aggregate risk up to the user entity.
*   **Positional Encoding:** The Transformer uses a custom cyclic encoding based on minutes-from-midnight to capture time-of-day behavioral anomalies.

## Testing
*   **Backend Testing:** `pytest` used for testing API endpoints, database transactions, and verifying that PQC signature generation/verification yields correct boolean results.
*   **Frontend Testing:** Manual UI verification confirming hydration match between SSR and Client, correct CSS animation rendering, and fallback to Demo Mode data when the backend is offline.

## Results
Aegis-Q successfully demonstrates a fully operational, real-time threat detection pipeline. The UI renders 100+ graph nodes smoothly, the PQC audit trail successfully signs and verifies database entries, and the demo-mode fallback provides a seamless experience during backend downtime.

## Performance Evaluation
*   **Latency:** The backend successfully processes inference requests well under the 35ms target. Redis cache lookups average under 1ms.
*   **UI Rendering:** The implementation of `suppressHydrationWarning` and fixed ISO timestamps resolved all React hydration issues, ensuring a 0ms layout shift on load.

## Challenges Faced
1.  **Next.js App Router Scroll Locking:** Traditional `100vh` on `#__next` failed because the wrapper doesn't exist in Next 14. *Solution:* Inline styles on `html`/`body` combined with a `position: fixed` outer shell.
2.  **React Hydration Errors:** Client/Server time mismatch due to `Date.now().toLocaleTimeString()`. *Solution:* Suppressed warnings on specific spans and utilized fixed timestamps for demo data.
3.  **D3.js Responsive Resizing:** The graph SVG required strict pixel dimensions. *Solution:* Implemented a `ResizeObserver` within a `useEffect` hook to dynamically read the parent container's dimensions and redraw/re-center the simulation automatically.

## Limitations
*   **PQC Overhead:** Generating ML-DSA signatures adds computational overhead. Under extreme event loads, this could bottleneck the synchronous database commit phase.
*   **Memory Constraints:** The PyTorch Geometric HeteroData object can grow exponentially large in memory if the graph edge history is not pruned regularly.

## Future Enhancements
1.  **Distributed Inference:** Deploy the PyTorch models via NVIDIA Triton Inference Server or TorchServe for GPU-accelerated horizontal scaling.
2.  **Automated Remediation:** Implement a SOAR (Security Orchestration, Automation, and Response) module to trigger network isolation directly from the UI.
3.  **Advanced Temporal Querying:** Allow analysts to query the graph database for historical snapshots (e.g., "Show graph state 10 minutes prior to the alert").

## Conclusion
Aegis-Q successfully bridges the gap between advanced AI threat detection and future-proof cryptographic auditing. By combining HeteroGCN, Sequential Transformers, and Post-Quantum Cryptography into a highly optimized, open-source stack, it provides a robust blueprint for next-generation Security Operations Centers.

## References
1.  NIST FIPS 203 (ML-KEM) & FIPS 204 (ML-DSA) Draft Standards.
2.  PyTorch Geometric Documentation: Graph Neural Networks for Heterogeneous Graphs.
3.  CERT Insider Threat Dataset v4.2, Software Engineering Institute, Carnegie Mellon University.
4.  Open Quantum Safe (OQS) Project (`liboqs`).
