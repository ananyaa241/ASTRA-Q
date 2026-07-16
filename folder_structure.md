# Folder Structure

## Project Root

```text
.
├── README.md
├── SETUP.md
├── start.md
├── gitupload.md
├── report.md
├── pytest.ini
├── folder_structure.md
├── backend/
│   ├── __init__.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── api/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   └── middleware/
│   │       ├── __init__.py
│   │       └── pqc_middleware.py
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── audit.py
│   │       ├── graph.py
│   │       ├── threats.py
│   │       └── ws.py
│   ├── cache/
│   │   ├── __init__.py
│   │   └── redis_cache.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── focal_loss.py
│   │   ├── fusion_head.py
│   │   ├── hetero_gcn.py
│   │   ├── psychometric_norm.py
│   │   └── seq_transformer.py
│   ├── ingestion/
│   │   ├── __init__.py
│   │   ├── cert_reader.py
│   │   ├── feature_builder.py
│   │   ├── file_validator.py
│   │   └── kafka_producer.py
│   ├── pqc/
│   │   ├── __init__.py
│   │   ├── audit_log.py
│   │   ├── dsa.py
│   │   └── kem.py
│   ├── pqc_keys/
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_cache_latency.py
│       ├── test_focal_loss.py
│       └── test_pqc.py
│   └── training/
│       ├── __init__.py
│       └── train.py
├── frontend/
│   ├── Dockerfile
│   ├── next-env.d.ts
│   ├── next.config.js
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── public/
│   └── src/
│       ├── app/
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/
│       │   ├── AlertPanel/
│       │   ├── AuditTrail/
│       │   ├── MetricBanner/
│       │   ├── ThreatGraph/
│       │   └── ThreatTable/
│       ├── hooks/
│       │   ├── useThreatData.ts
│       │   └── useWebSocket.ts
│       └── lib/
│           ├── api.ts
│           └── types.ts
├── dataset/
│   ├── answers/
│   │   ├── insiders.csv
│   │   ├── license.txt
│   │   ├── readme.txt
│   │   ├── scenarios.txt
│   │   └── r4.2-1/
│   │   └── r4.2-2/
│   │   └── r4.2-3/
│   └── r4.2/
│       ├── device.csv
│       ├── email.csv
│       ├── file.csv
│       ├── http.csv
│       ├── logon.csv
│       ├── psychometric.csv
│       ├── license.txt
│       ├── readme.txt
│       └── LDAP/
├── infra/
│   ├── docker-compose.yml
│   ├── kafka/
│   │   └── topics.sh
│   └── postgres/
│       └── init.sql
├── models/
│   └── best_transformer.pt
├── src/
└── .gitignore
```

## Notes

- Generated folders such as `.git`, `.pytest_cache`, `.next`, `node_modules`, and virtual environments are present in the workspace but are environment/build artifacts and not part of the source project structure.
- The repository’s main application code is organized under `backend/` and `frontend/`.
