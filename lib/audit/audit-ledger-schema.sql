-- ============================================================================
-- NEXUS Audit Ledger PostgreSQL Schema
-- ============================================================================
-- Merkle chain audit trail for 21 CFR Part 11 compliance
-- Zero PHI storage - only hashes and metadata
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- ENUMS & TYPES
-- ============================================================================

CREATE TYPE execution_tier AS ENUM ('CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ');
CREATE TYPE decision_type AS ENUM (
    'INCLUDE', 'EXCLUDE', 'REVIEW', 'SERIOUS', 'EXCLUDE_NON_CLINICAL',
    'IRRELEVANT_NON_PRODUCT', 'MANUAL_REVIEW_REQUIRED',
    'SIGNAL_DETECTED', 'NO_SIGNAL', 'FURTHER_INVESTIGATION', 'CLOSE_CASE',
    'CERTAIN', 'PROBABLE', 'POSSIBLE', 'UNLIKELY', 'CONDITIONAL', 'UNASSESSABLE'
);
CREATE TYPE entry_status AS ENUM ('PENDING', 'COMMITTED', 'FAILED', 'REVOKED');
CREATE TYPE dlq_stage AS ENUM (
    'INGESTION', 'PRODUCT_FILTER', 'SLM_EXTRACTION',
    'LEDGER_COMMIT', 'HITL_REVIEW', 'SUBMISSION'
);
CREATE TYPE dlq_resolution AS ENUM (
    'RETRY_SUCCESS', 'MANUAL_FIX', 'DATA_CORRECTION',
    'MAX_RETRIES_EXCEEDED', 'FALSE_POSITIVE', 'WONT_FIX'
);

-- ============================================================================
-- TENANTS TABLE
-- ============================================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(500),
    contact_email VARCHAR(255),
    encryption_key_id VARCHAR(255), -- KMS key for tenant encryption
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_name ON tenants(name);
CREATE INDEX idx_tenants_active ON tenants(is_active);

-- ============================================================================
-- USERS / AGENTS TABLE
-- ============================================================================

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'agent-4-screening'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    model_name VARCHAR(255),
    model_hash VARCHAR(64),
    supported_tiers execution_tier[],
    max_concurrent INTEGER DEFAULT 10,
    estimated_latency_ms INTEGER,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_agent_id ON agents(agent_id);
CREATE INDEX idx_agents_active ON agents(is_active);

-- ============================================================================
-- MAIN AUDIT LEDGER TABLE (Merkle Chain)
-- ============================================================================

CREATE TABLE audit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tenant isolation
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

    -- Trace correlation
    trace_id VARCHAR(64) NOT NULL,
    span_id VARCHAR(64) NOT NULL,
    parent_span_id VARCHAR(64),
    correlation_id VARCHAR(64),

    -- Agent & execution context
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    execution_tier execution_tier NOT NULL,
    model_name VARCHAR(255),
    model_hash VARCHAR(64),
    temperature NUMERIC(3,2) DEFAULT 0.0,
    seed INTEGER DEFAULT 42,
    grammar_version VARCHAR(50),

    -- Input/Output hashes (no PHI)
    prompt_hash VARCHAR(64) NOT NULL,      -- SHA-256 of input
    output_hash VARCHAR(64) NOT NULL,      -- SHA-256 of output
    entry_hash VARCHAR(64) NOT NULL,       -- Merkle entry hash
    previous_hash VARCHAR(64),             -- Previous entry in chain

    -- Decision & confidence
    decision decision_type NOT NULL,
    confidence NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),

    -- Medical coding
    meddra_pts TEXT[],                     -- Array of MedDRA PT codes
    seriousness_flag BOOLEAN DEFAULT false,

    -- Execution metadata
    latency_ms INTEGER,
    tokens_used INTEGER,
    execution_metadata JSONB DEFAULT '{}',

    -- Cryptographic integrity
    signature_algorithm VARCHAR(50) DEFAULT 'HMAC-SHA256',
    signature_hash VARCHAR(128),           -- HMAC of entry
    signing_key_id VARCHAR(255),

    -- Chain linkage
    chain_index BIGSERIAL,                 -- Monotonic chain position
    merkle_root VARCHAR(64),               -- Merkle tree root for batch
    merkle_proof JSONB,                    -- Inclusion proof

    -- Status & lifecycle
    status entry_status DEFAULT 'PENDING',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    committed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,

    -- Partitioning by tenant + date
    partition_date DATE GENERATED ALWAYS AS (created_at::date) STORED
) PARTITION BY LIST (tenant_id);

-- Create default partition for new tenants
CREATE TABLE audit_ledger_default PARTITION OF audit_ledger DEFAULT;

-- Indexes
CREATE INDEX idx_audit_ledger_tenant ON audit_ledger (tenant_id);
CREATE INDEX idx_audit_ledger_trace ON audit_ledger (trace_id);
CREATE INDEX idx_audit_ledger_correlation ON audit_ledger (correlation_id);
CREATE INDEX idx_audit_ledger_agent ON audit_ledger (agent_id);
CREATE INDEX idx_audit_ledger_created ON audit_ledger (created_at DESC);
CREATE INDEX idx_audit_ledger_chain ON audit_ledger (chain_index);
CREATE INDEX idx_audit_ledger_decision ON audit_ledger (decision);
CREATE INDEX idx_audit_ledger_status ON audit_ledger (status);
CREATE INDEX idx_audit_ledger_partition ON audit_ledger (partition_date);

-- Composite indexes for common queries
CREATE INDEX idx_audit_tenant_trace ON audit_ledger (tenant_id, trace_id);
CREATE INDEX idx_audit_tenant_created ON audit_ledger (tenant_id, created_at DESC);
CREATE INDEX idx_audit_agent_created ON audit_ledger (agent_id, created_at DESC);

-- GIN index for JSONB metadata queries
CREATE INDEX idx_audit_metadata ON audit_ledger USING GIN (execution_metadata);

-- ============================================================================
-- MERKLE TREE TABLE (for batch verification)
-- ============================================================================

CREATE TABLE merkle_trees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    tree_id VARCHAR(64) NOT NULL UNIQUE,           -- e.g., 'batch-2024-01-15-001'
    root_hash VARCHAR(64) NOT NULL,
    leaf_count INTEGER NOT NULL,
    leaf_hashes VARCHAR(64)[],                     -- Array of leaf hashes
    tree_depth INTEGER,
    algorithm VARCHAR(50) DEFAULT 'SHA-256',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_merkle_tenant ON merkle_trees (tenant_id);
CREATE INDEX idx_merkle_created ON merkle_trees (created_at DESC);
CREATE INDEX idx_merkle_tree_id ON merkle_trees (tree_id);

-- ============================================================================
-- DEAD LETTER QUEUE TABLE
-- ============================================================================

CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    trace_id VARCHAR(64) NOT NULL,

    stage dlq_stage NOT NULL,
    error_code VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,

    payload_ref VARCHAR(255) NOT NULL,       -- Redis key of failed payload
    payload_hash VARCHAR(64),                -- Hash of failed payload

    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,

    resolved BOOLEAN DEFAULT false,
    resolution dlq_resolution,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dlq_tenant ON dead_letter_queue (tenant_id);
CREATE INDEX idx_dlq_trace ON dead_letter_queue (trace_id);
CREATE INDEX idx_dlq_stage ON dead_letter_queue (stage);
CREATE INDEX idx_dlq_resolved ON dead_letter_queue (resolved);
CREATE INDEX idx_dlq_next_retry ON dead_letter_queue (next_retry_at) WHERE resolved = false;
CREATE INDEX idx_dlq_created ON dead_letter_queue (created_at DESC);

-- ============================================================================
-- HITL REVIEW TABLE
-- ============================================================================

CREATE TABLE hitl_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    trace_id VARCHAR(64) NOT NULL,
    audit_ledger_id UUID REFERENCES audit_ledger(id) ON DELETE SET NULL,

    reviewer_id UUID,                          -- User who reviewed
    reviewer_role VARCHAR(100),                -- e.g., 'safety_physician', 'qa_specialist'

    original_decision decision_type NOT NULL,
    reviewer_decision decision_type,
    reviewer_confidence NUMERIC(5,4),

    rationale TEXT,
    notes TEXT,

    attachments JSONB DEFAULT '[]',            -- Array of {type, url, description}

    status VARCHAR(50) DEFAULT 'PENDING',      -- PENDING, APPROVED, REJECTED, ESCALATED
    priority VARCHAR(20) DEFAULT 'NORMAL',     -- LOW, NORMAL, HIGH, URGENT

    sla_due_at TIMESTAMPTZ,                    -- SLA deadline
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hitl_tenant ON hitl_reviews (tenant_id);
CREATE INDEX idx_hitl_trace ON hitl_reviews (trace_id);
CREATE INDEX idx_hitl_reviewer ON hitl_reviews (reviewer_id);
CREATE INDEX idx_hitl_status ON hitl_reviews (status);
CREATE INDEX idx_hitl_priority ON hitl_reviews (priority);
CREATE INDEX idx_hitl_sla ON hitl_reviews (sla_due_at) WHERE status = 'PENDING';
CREATE INDEX idx_hitl_created ON hitl_reviews (created_at DESC);

-- ============================================================================
-- SUBMISSIONS TABLE (Regulatory gateway)
-- ============================================================================

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    trace_id VARCHAR(64) NOT NULL,
    case_id VARCHAR(100) NOT NULL,

    submission_type VARCHAR(50) NOT NULL,      -- E2B_R3, E2B_R2, CIOMS, FDA_3500A
    destination VARCHAR(100) NOT NULL,         -- FDA, EMA, PMDA, HC, etc.
    gateway VARCHAR(50),                       -- AS2, ESG, EVWEB, etc.

    payload_hash VARCHAR(64) NOT NULL,
    payload_size_bytes INTEGER,
    payload_version VARCHAR(20),               -- E2B version

    status VARCHAR(50) DEFAULT 'DRAFT',        -- DRAFT, QUEUED, SENT, ACKNOWLEDGED, REJECTED, ERROR
    gateway_message_id VARCHAR(255),
    acknowledgment_hash VARCHAR(64),

    error_code VARCHAR(100),
    error_message TEXT,

    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_submissions_tenant ON submissions (tenant_id);
CREATE INDEX idx_submissions_trace ON submissions (trace_id);
CREATE INDEX idx_submissions_case ON submissions (case_id);
CREATE INDEX idx_submissions_status ON submissions (status);
CREATE INDEX idx_submissions_destination ON submissions (destination);
CREATE INDEX idx_submissions_created ON submissions (created_at DESC);

-- ============================================================================
-- COMPLIANCE / AUDIT LOG (for the audit system itself)
-- ============================================================================

CREATE TABLE compliance_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID,                              -- Who performed the action
    action VARCHAR(100) NOT NULL,              -- e.g., 'REVOKE_ENTRY', 'REVIEW_APPROVE', 'DLQ_RETRY'
    resource_type VARCHAR(50) NOT NULL,        -- 'audit_ledger', 'dlq', 'hitl_review', 'submission'
    resource_id UUID NOT NULL,

    before_state JSONB,
    after_state JSONB,

    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_tenant ON compliance_audit_log (tenant_id);
CREATE INDEX idx_compliance_resource ON compliance_audit_log (resource_type, resource_id);
CREATE INDEX idx_compliance_created ON compliance_audit_log (created_at DESC);
CREATE INDEX idx_compliance_user ON compliance_audit_log (user_id);

-- ============================================================================
-- VERSIONS / DEPLOYMENTS TABLE
-- ============================================================================

CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    version VARCHAR(50) NOT NULL,              -- e.g., 'v1.2.3'
    git_commit VARCHAR(64),                    -- Git SHA
    git_tag VARCHAR(100),

    components JSONB NOT NULL,                 -- {agent-4: "v1.2.3", agent-9: "v1.1.0", ...}
    config_hash VARCHAR(64),                   -- Hash of config at deployment

    deployed_by UUID,                          -- User who deployed
    environment VARCHAR(50) DEFAULT 'production', -- staging, production

    status VARCHAR(20) DEFAULT 'SUCCESS',      -- SUCCESS, FAILED, ROLLED_BACK
    rollback_from UUID REFERENCES deployments(id),

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    rollback_at TIMESTAMPTZ,

    notes TEXT
);

CREATE INDEX idx_deployments_tenant ON deployments (tenant_id);
CREATE INDEX idx_deployments_version ON deployments (version);
CREATE INDEX idx_deployments_env ON deployments (environment);
CREATE INDEX idx_deployments_status ON deployments (status);
CREATE INDEX idx_deployments_completed ON deployments (completed_at DESC);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dlq_updated_at BEFORE UPDATE ON dead_letter_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hitl_updated_at BEFORE UPDATE ON hitl_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Partition maintenance function
CREATE OR REPLACE FUNCTION create_tenant_partition(p_tenant_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
BEGIN
    partition_name := 'audit_ledger_' || replace(p_tenant_id::text, '-', '_')
                      || '_' || to_char(p_start_date, 'YYYY_MM');

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_ledger
        FOR VALUES IN (%L)
        WITH (autovacuum_enabled = true)',
        partition_name, p_tenant_id);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (trace_id)',
        'idx_' || partition_name || '_trace', partition_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at DESC)',
        'idx_' || partition_name || '_created', partition_name);
END;
$$ LANGUAGE plpgsql;

-- Auto-create partitions for new tenants
CREATE OR REPLACE FUNCTION on_tenant_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_tenant_partition(NEW.id, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_insert_trigger
    AFTER INSERT ON tenants
    FOR EACH ROW EXECUTE FUNCTION on_tenant_insert();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Dashboard view: recent audit activity
CREATE VIEW v_audit_dashboard AS
SELECT
    a.tenant_id,
    t.name AS tenant_name,
    a.trace_id,
    a.correlation_id,
    ag.agent_id,
    a.execution_tier,
    a.decision,
    a.confidence,
    a.status,
    a.seriousness_flag,
    a.created_at,
    a.committed_at,
    a.latency_ms
FROM audit_ledger a
JOIN tenants t ON a.tenant_id = t.id
JOIN agents ag ON a.agent_id = ag.id
WHERE a.created_at > NOW() - INTERVAL '7 days';

-- DLQ monitoring view
CREATE VIEW v_dlq_monitoring AS
SELECT
    d.tenant_id,
    t.name AS tenant_name,
    d.stage,
    d.error_code,
    COUNT(*) AS count,
    MIN(d.created_at) AS oldest_entry,
    MAX(d.created_at) AS newest_entry,
    COUNT(*) FILTER (WHERE d.resolved = false) AS pending_count,
    COUNT(*) FILTER (WHERE d.resolved = true) AS resolved_count
FROM dead_letter_queue d
JOIN tenants t ON d.tenant_id = t.id
GROUP BY d.tenant_id, t.name, d.stage, d.error_code;

-- HITL workload view
CREATE VIEW v_hitl_workload AS
SELECT
    h.tenant_id,
    t.name AS tenant_name,
    h.status,
    h.priority,
    COUNT(*) AS count,
    AVG(EXTRACT(EPOCH FROM (h.completed_at - h.started_at))) AS avg_review_seconds,
    COUNT(*) FILTER (WHERE h.sla_due_at < NOW() AND h.status = 'PENDING') AS overdue_count
FROM hitl_reviews h
JOIN tenants t ON h.tenant_id = t.id
WHERE h.created_at > NOW() - INTERVAL '30 days'
GROUP BY h.tenant_id, t.name, h.status, h.priority;

-- Agent performance view
CREATE VIEW v_agent_performance AS
SELECT
    a.tenant_id,
    t.name AS tenant_name,
    ag.agent_id,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE a.status = 'COMMITTED') AS successful,
    COUNT(*) FILTER (WHERE a.status = 'FAILED') AS failed,
    ROUND(AVG(a.latency_ms)::numeric, 2) AS avg_latency_ms,
    ROUND(AVG(a.confidence)::numeric, 4) AS avg_confidence,
    COUNT(*) FILTER (WHERE a.seriousness_flag) AS serious_count,
    MAX(a.created_at) AS last_execution
FROM audit_ledger a
JOIN tenants t ON a.tenant_id = t.id
JOIN agents ag ON a.agent_id = ag.id
WHERE a.created_at > NOW() - INTERVAL '24 hours'
GROUP BY a.tenant_id, t.name, ag.agent_id;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) FOR MULTI-TENANT ISOLATION
-- ============================================================================

ALTER TABLE audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_audit_log ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation_audit ON audit_ledger
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_dlq ON dead_letter_queue
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_hitl ON hitl_reviews
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_submissions ON submissions
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_compliance ON compliance_audit_log
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- GRANTS (adjust roles as needed)
-- ============================================================================

-- Read-only role for dashboards
CREATE ROLE nexus_readonly;
GRANT SELECT ON audit_ledger, dead_letter_queue, hitl_reviews, submissions,
    agents, tenants, merkle_trees, deployments
TO nexus_readonly;
GRANT SELECT ON v_audit_dashboard, v_dlq_monitoring, v_hitl_workload, v_agent_performance
TO nexus_readonly;

-- Write role for agents
CREATE ROLE nexus_agent;
GRANT INSERT, UPDATE ON audit_ledger, dead_letter_queue, hitl_reviews, submissions,
    compliance_audit_log
TO nexus_agent;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA PUBLIC TO nexus_agent;

-- Admin role
CREATE ROLE nexus_admin;
GRANT ALL ON ALL TABLES IN SCHEMA PUBLIC TO nexus_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA PUBLIC TO nexus_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA PUBLIC TO nexus_admin;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Default tenant
INSERT INTO tenants (id, name, display_name, contact_email, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default Tenant',
    'admin@nexus.example.com',
    '{"timezone": "UTC", "retention_days": 90}'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Core agents
INSERT INTO agents (agent_id, name, description, version, model_name, model_hash,
                    supported_tiers, max_concurrent, estimated_latency_ms) VALUES
('agent-1-literature-duplicates', 'Literature Duplicates Detector',
 'Detects duplicate literature records across PubMed, Embase, and local databases using SimHash, MinHash, and exact matching',
 '1.0.0', 'deterministic', 'simhash-minhash-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 10, 5000),

('agent-2-icsr-duplicates', 'ICSR Duplicates Detector',
 'Detects duplicate ICSR cases (E2B R3) using patient, drug, event, and regulatory identifier matching',
 '1.0.0', 'deterministic', 'icsr-dedup-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 5, 8000),

('agent-3-followup-generator', 'Follow-up Generator',
 'Generates structured follow-up requests for incomplete ICSR cases per ICH E2B R3',
 '1.0.0', 'deterministic', 'followup-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 20, 2000),

('agent-4-screening', 'Literature Screening Agent',
 'Performs literature safety screening with product matching, adverse event extraction, and human review routing',
 '1.0.0', 'qwen2.5-14b-instruct-q4_k_m', 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
 ARRAY['CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ'], 5, 10000),

('agent-5-action-taken', 'Action Taken Assessor',
 'Assesses action taken with suspect drug per ICH E2B R3 and correlates with dechallenge/rechallenge',
 '1.0.0', 'deterministic', 'action-taken-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 20, 1500),

('agent-6-dechallenge', 'Dechallenge Assessor',
 'Assesses dechallenge (improvement after drug stop) per ICH E2D with temporal analysis',
 '1.0.0', 'deterministic', 'dechallenge-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 20, 1500),

('agent-7-rechallenge', 'Rechallenge Assessor',
 'Assesses rechallenge (recurrence after drug re-administration) per ICH E2D',
 '1.0.0', 'deterministic', 'rechallenge-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 20, 1500),

('agent-8-medical-history', 'Medical History Extractor',
 'Extracts structured medical history from case narratives with MedDRA coding',
 '1.0.0', 'deterministic', 'medhist-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 10, 5000),

('agent-9-causality', 'Causality Assessment Agent',
 'Performs deterministic causality assessment using Bradford Hill criteria per ICH E2D',
 '1.0.0', 'deterministic', 'bradford-hill-v1',
 ARRAY['LOCAL', 'HEURISTIC'], 3, 30000)

ON CONFLICT (agent_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    model_name = EXCLUDED.model_name,
    model_hash = EXCLUDED.model_hash,
    supported_tiers = EXCLUDED.supported_tiers,
    max_concurrent = EXCLUDED.max_concurrent,
    estimated_latency_ms = EXCLUDED.estimated_latency_ms,
    updated_at = NOW();

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Cleanup old partitions (run monthly via pg_cron)
CREATE OR REPLACE FUNCTION drop_old_partitions(p_older_than DATE DEFAULT CURRENT_DATE - INTERVAL '13 months')
RETURNS INT AS $$
DECLARE
    partition_name TEXT;
    dropped_count INT := 0;
BEGIN
    FOR partition_name IN
        SELECT inhrelid::regclass::text
        FROM pg_inherits
        JOIN pg_class ON inhrelid = pg_class.oid
        WHERE inhparent = 'audit_ledger'::regclass
        AND pg_class.relname LIKE 'audit_ledger_%'
        AND to_date(substring(pg_class.relname FROM 'audit_ledger_[0-9a-z_]+_([0-9]{4}_[0-9]{2})'), 'YYYY_MM') < p_older_than
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
        dropped_count := dropped_count + 1;
    END LOOP;
    RETURN dropped_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old DLQ entries (run weekly)
CREATE OR REPLACE FUNCTION cleanup_old_dlq(p_older_than DATE DEFAULT CURRENT_DATE - INTERVAL '90 days')
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM dead_letter_queue
    WHERE resolved = true
    AND resolved_at < p_older_than
    RETURNING 1 INTO deleted_count;

    RETURN COALESCE(deleted_count, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Usage notes:
-- 1. Run this script on a fresh PostgreSQL 14+ database
-- 2. Enable pg_cron for partition maintenance: SELECT cron.schedule('0 2 1 * *', 'SELECT drop_old_partitions();');
-- 3. Schedule DLQ cleanup: SELECT cron.schedule('0 3 * * 0', 'SELECT cleanup_old_dlq();');
-- 4. Configure pg_hba.conf for tenant isolation or use application-level RLS
-- 5. Set up pg_stat_statements for query performance monitoring
-- 6. Configure pg_audit for compliance logging if required