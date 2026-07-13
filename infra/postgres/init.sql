-- ============================================================
-- Project Aegis-Q: PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────────
-- Users & Entities
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    employee_name   TEXT,
    role            TEXT,
    department      TEXT,
    email           TEXT,
    pc_assigned     TEXT,
    -- Big 5 Psychometric (normalized [0.0, 1.0])
    psych_O         FLOAT CHECK (psych_O BETWEEN 0.0 AND 1.0),
    psych_C         FLOAT CHECK (psych_C BETWEEN 0.0 AND 1.0),
    psych_E         FLOAT CHECK (psych_E BETWEEN 0.0 AND 1.0),
    psych_A         FLOAT CHECK (psych_A BETWEEN 0.0 AND 1.0),
    psych_N         FLOAT CHECK (psych_N BETWEEN 0.0 AND 1.0),
    is_terminated   BOOLEAN DEFAULT FALSE,
    termination_date DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machines (
    pc_id           TEXT PRIMARY KEY,
    is_shared       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Event Tables (partitioned by event_type for query efficiency)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id        TEXT,
    event_type      TEXT NOT NULL,  -- logon | device | http | email | file
    event_time      TIMESTAMPTZ NOT NULL,
    user_id         TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    pc_id           TEXT REFERENCES machines(pc_id) ON DELETE SET NULL,
    -- Temporal features
    minutes_from_midnight  INT,
    is_after_hours         BOOLEAN DEFAULT FALSE,
    is_weekend             BOOLEAN DEFAULT FALSE,
    -- Type-specific payload (JSONB for flexibility)
    payload         JSONB,
    -- Anomaly features
    is_flagged      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_time ON events (user_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_flagged ON events (is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_time ON events (event_time DESC);

-- ─────────────────────────────────────────────────────────────────
-- Threat Scores (AI inference outputs)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_scores (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id      TEXT NOT NULL,
    user_id         TEXT REFERENCES users(user_id) ON DELETE CASCADE,
    scored_at       TIMESTAMPTZ DEFAULT NOW(),
    -- Engine scores
    gcn_score       FLOAT NOT NULL CHECK (gcn_score BETWEEN 0.0 AND 1.0),
    transformer_score FLOAT NOT NULL CHECK (transformer_score BETWEEN 0.0 AND 1.0),
    fused_score     FLOAT NOT NULL CHECK (fused_score BETWEEN 0.0 AND 1.0),
    risk_tier       TEXT NOT NULL CHECK (risk_tier IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    -- Feature snapshot
    feature_vector  FLOAT[],
    -- Matched scenarios
    scenario_hints  TEXT[],
    -- Inference metadata
    inference_latency_ms  FLOAT,
    model_version   TEXT DEFAULT 'v1.0.0'
);

CREATE INDEX IF NOT EXISTS idx_threat_scores_user ON threat_scores (user_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_scores_tier ON threat_scores (risk_tier, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_scores_fused ON threat_scores (fused_score DESC);

-- ─────────────────────────────────────────────────────────────────
-- PQC Audit Trail (append-only, cryptographically signed)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_trail (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    -- Action metadata
    action_type     TEXT NOT NULL,  -- ALERT_GENERATED | CONTAINMENT_TRIGGERED | MODEL_RETRAIN | KEY_ROTATION
    actor           TEXT,           -- analyst ID or 'SYSTEM'
    target_user     TEXT,
    target_session  TEXT,
    -- Action payload
    action_payload  JSONB,
    -- PQC Cryptographic proof
    payload_hash    TEXT NOT NULL,  -- SHA3-512 of canonicalized payload
    pqc_signature   TEXT NOT NULL,  -- ML-DSA-87 signature (base64)
    signing_key_fp  TEXT NOT NULL,  -- Key fingerprint (SHA3-256 of pubkey)
    pqc_algorithm   TEXT DEFAULT 'ML-DSA-87',
    -- Verification status
    is_verified     BOOLEAN DEFAULT FALSE,
    verified_at     TIMESTAMPTZ
);

-- Prevent any UPDATE/DELETE on audit_trail (append-only enforcement via rule)
CREATE RULE no_audit_update AS ON UPDATE TO audit_trail DO INSTEAD NOTHING;
CREATE RULE no_audit_delete AS ON DELETE TO audit_trail DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_trail (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_trail (actor);

-- ─────────────────────────────────────────────────────────────────
-- Graph Topology Snapshot (materialized for fast UI queries)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS graph_nodes (
    node_id         TEXT PRIMARY KEY,
    node_type       TEXT NOT NULL CHECK (node_type IN ('USER', 'PC', 'FILE', 'EMAIL_DOMAIN')),
    label           TEXT,
    threat_score    FLOAT DEFAULT 0.0,
    properties      JSONB,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    source_id       TEXT REFERENCES graph_nodes(node_id),
    target_id       TEXT REFERENCES graph_nodes(node_id),
    edge_type       TEXT NOT NULL,  -- logon | copied | emailed | accessed
    weight          FLOAT DEFAULT 1.0,
    is_anomalous    BOOLEAN DEFAULT FALSE,
    last_seen       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges (source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges (target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_anomalous ON graph_edges (is_anomalous) WHERE is_anomalous = TRUE;

-- ─────────────────────────────────────────────────────────────────
-- PQC Key Registry
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pqc_key_registry (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key_type        TEXT NOT NULL CHECK (key_type IN ('ML-KEM-1024', 'ML-DSA-87')),
    public_key      TEXT NOT NULL,
    fingerprint     TEXT NOT NULL UNIQUE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    rotated_at      TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────
-- Ingestion Checkpoint (for resumable streaming)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
    source_file     TEXT PRIMARY KEY,
    last_offset     BIGINT DEFAULT 0,
    last_event_time TIMESTAMPTZ,
    total_rows      BIGINT DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Initial checkpoint records
INSERT INTO ingestion_checkpoints (source_file, last_offset) VALUES
    ('logon.csv', 0),
    ('device.csv', 0),
    ('email.csv', 0),
    ('file.csv', 0),
    ('http.csv', 0)
ON CONFLICT DO NOTHING;
