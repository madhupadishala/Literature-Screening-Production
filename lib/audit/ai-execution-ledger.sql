-- ai-execution-ledger.sql
-- Per-Tenant Merkle Audit Ledger with Global Anchoring
-- Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
-- Zero PHI Storage: Only hashes and metadata persisted
-- Migration: 001_create_ai_execution_ledger

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";          -- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";         -- Alternative UUID
CREATE EXTENSION IF NOT EXISTS "btree_gin";         -- GIN indexes for arrays
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- Trigram indexes

-- ============================================================================
-- TENANT TABLE (Referenced by RLS policies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name);

-- ============================================================================
-- AI EXECUTION LEDGER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_execution_ledger (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation (RLS enforced)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

    -- Distributed tracing identifiers
    trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
    span_id UUID NOT NULL DEFAULT gen_random_uuid(),
    correlation_id TEXT,                         -- Cross-system correlation ID

    -- Execution metadata
    agent_name VARCHAR(128) NOT NULL,            -- e.g., 'product-gate', 'slm-screener', 'nllb-translator'
    execution_tier VARCHAR(16) NOT NULL          -- CLOUD | LOCAL | HEURISTIC | DLQ
        CHECK (execution_tier IN ('CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ')),
    model_name VARCHAR(255),                     -- e.g., 'qwen2.5-14b-instruct-q4_k_m'
    model_hash CHAR(64),                         -- SHA-256 of model GGUF file
    temperature NUMERIC(3,1) NOT NULL DEFAULT 0.0
        CHECK (temperature = 0.0),               -- Enforce determinism
    seed BIGINT NOT NULL DEFAULT 42,             -- Fixed seed for reproducibility
    grammar_version VARCHAR(64),                 -- GBNF grammar git tag/hash

    -- ZDR Enforcement: ONLY hashes stored, ZERO raw PHI/PII
    prompt_hash CHAR(64) NOT NULL,               -- SHA-256 of input prompt
    output_hash CHAR(64) NOT NULL,               -- SHA-256 of raw model output
    redaction_summary JSONB,                     -- { pii_types: [], chars_redacted: N }

    -- Structured extraction results (no PHI)
    decision VARCHAR(32) NOT NULL
        CHECK (decision IN (
            'PRODUCT_MATCH', 'IRRELEVANT_NON_PRODUCT', 'EXCLUDE_NON_CLINICAL',
            'INCLUDE', 'EXCLUDE', 'REVIEW', 'SERIOUS',
            'MANUAL_REVIEW_REQUIRED', 'AUTO_APPROVED', 'OVERRIDE'
        )),
    confidence NUMERIC(3,2) NOT NULL
        CHECK (confidence >= 0.0 AND confidence <= 1.0),
    meddra_pts TEXT[],                           -- Array of MedDRA PT codes
    seriousness_flag BOOLEAN NOT NULL DEFAULT FALSE,

    -- Per-Tenant Merkle Chain Integrity
    prev_entry_hash CHAR(64) NOT NULL,           -- Hash of previous entry for this tenant
    entry_hash CHAR(64) NOT NULL,                -- SHA-256 of this entry's immutable content

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_prompt_hash CHECK (prompt_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT valid_output_hash CHECK (output_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT valid_prev_hash CHECK (prev_entry_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT valid_entry_hash CHECK (entry_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT valid_model_hash CHECK (model_hash IS NULL OR model_hash ~ '^[a-f0-9]{64}$')
);

-- ============================================================================
-- INDEXES FOR AUDIT QUERIES
-- ============================================================================

-- Tenant + time range (most common audit query)
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_tenant_created
    ON ai_execution_ledger (tenant_id, created_at DESC);

-- Trace lookup
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_trace_id
    ON ai_execution_ledger (trace_id);

-- Correlation ID for cross-system tracing
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_correlation_id
    ON ai_execution_ledger (correlation_id);

-- Execution tier filtering
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_execution_tier
    ON ai_execution_ledger (execution_tier);

-- Decision filtering
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_decision
    ON ai_execution_ledger (decision);

-- Model hash for integrity verification
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_model_hash
    ON ai_execution_ledger (model_hash);

-- Merkle chain verification
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_chain
    ON ai_execution_ledger (tenant_id, prev_entry_hash, entry_hash);

-- MedDRA PT array queries
CREATE INDEX IF NOT EXISTS idx_ai_execution_ledger_meddra_pts
    ON ai_execution_ledger USING GIN (meddra_pts);

-- ============================================================================
-- GLOBAL MERKLE ANCHORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS global_merkle_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anchor_hour TIMESTAMPTZ NOT NULL UNIQUE,     -- Hour boundary (e.g., '2026-11-08 14:00:00+00')
    global_root_hash CHAR(64) NOT NULL,          -- SHA-256 of all tenant roots concatenated
    tenant_roots JSONB NOT NULL,                 -- { "tenant-uuid": "tenant-root-hash", ... }
    anchored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_global_root_hash CHECK (global_root_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_global_merkle_anchors_anchor_hour
    ON global_merkle_anchors (anchor_hour DESC);

-- ============================================================================
-- HUMAN REVIEW OVERRIDES TABLE (21 CFR Part 11 Electronic Signatures)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_human_review (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to original execution
    trace_id UUID NOT NULL
        REFERENCES ai_execution_ledger(trace_id) ON DELETE RESTRICT,

    -- Reviewer identity
    reviewer_id VARCHAR(255) NOT NULL,           -- e.g., 'safety.scientist@company.com'
    reviewer_role VARCHAR(64) NOT NULL,          -- e.g., 'safety_scientist', 'medical_reviewer', 'qa_manager'
    reviewer_signature_hash CHAR(64) NOT NULL,   -- HMAC-SHA256 of review content

    -- Override details
    original_decision VARCHAR(32) NOT NULL,
    overridden_decision VARCHAR(32) NOT NULL,
    rationale TEXT NOT NULL,                     -- Required justification

    -- Electronic signature metadata (21 CFR Part 11)
    signature_meaning VARCHAR(255) NOT NULL,     -- e.g., 'Reviewed and approved safety assessment'
    signature_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_reviewer_sig_hash CHECK (reviewer_signature_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT valid_original_decision CHECK (original_decision IN (
        'PRODUCT_MATCH', 'IRRELEVANT_NON_PRODUCT', 'EXCLUDE_NON_CLINICAL',
        'INCLUDE', 'EXCLUDE', 'REVIEW', 'SERIOUS',
        'MANUAL_REVIEW_REQUIRED', 'AUTO_APPROVED'
    )),
    CONSTRAINT valid_overridden_decision CHECK (overridden_decision IN (
        'PRODUCT_MATCH', 'IRRELEVANT_NON_PRODUCT', 'EXCLUDE_NON_CLINICAL',
        'INCLUDE', 'EXCLUDE', 'REVIEW', 'SERIOUS',
        'MANUAL_REVIEW_REQUIRED', 'AUTO_APPROVED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_ai_human_review_trace_id
    ON ai_human_review (trace_id);
CREATE INDEX IF NOT EXISTS idx_ai_human_review_reviewer
    ON ai_human_review (reviewer_id, signature_timestamp DESC);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on ai_execution_ledger
ALTER TABLE ai_execution_ledger ENABLE ROW LEVEL SECURITY;

-- Policy: Tenants can only see their own data
CREATE POLICY tenant_isolation_select ON ai_execution_ledger
    FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_insert ON ai_execution_ledger
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- No UPDATE/DELETE allowed (append-only ledger)
-- Explicitly deny UPDATE
CREATE POLICY tenant_isolation_update ON ai_execution_ledger
    FOR UPDATE
    USING (FALSE);

CREATE POLICY tenant_isolation_delete ON ai_execution_ledger
    FOR DELETE
    USING (FALSE);

-- Enable RLS on global_merkle_anchors (global, read-only for tenants)
ALTER TABLE global_merkle_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_anchors_select ON global_merkle_anchors
    FOR SELECT
    USING (TRUE);  -- All tenants can verify global anchors

CREATE POLICY global_anchors_insert ON global_merkle_anchors
    FOR INSERT
    WITH CHECK (current_setting('app.current_tenant_id') = 'system');  -- Only system service

-- Enable RLS on ai_human_review
ALTER TABLE ai_human_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY human_review_tenant_isolation ON ai_human_review
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM ai_execution_ledger l
            WHERE l.trace_id = ai_human_review.trace_id
            AND l.tenant_id = current_setting('app.current_tenant_id')::UUID
        )
    );

-- ============================================================================
-- TRIGGER FUNCTION: COMPUTE ENTRY HASH
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_entry_hash()
RETURNS TRIGGER AS $$
DECLARE
    canonical_content TEXT;
    computed_hash CHAR(64);
BEGIN
    -- Build canonical string from immutable fields in deterministic order
    -- This MUST match the application-side hash computation exactly
    canonical_content := NEW.tenant_id::TEXT || '|' ||
                         NEW.trace_id::TEXT || '|' ||
                         NEW.span_id::TEXT || '|' ||
                         COALESCE(NEW.correlation_id, '') || '|' ||
                         NEW.agent_name || '|' ||
                         NEW.execution_tier || '|' ||
                         COALESCE(NEW.model_name, '') || '|' ||
                         COALESCE(NEW.model_hash, '') || '|' ||
                         NEW.temperature::TEXT || '|' ||
                         NEW.seed::TEXT || '|' ||
                         COALESCE(NEW.grammar_version, '') || '|' ||
                         NEW.prompt_hash || '|' ||
                         NEW.output_hash || '|' ||
                         COALESCE(NEW.redaction_summary::TEXT, '') || '|' ||
                         NEW.decision || '|' ||
                         NEW.confidence::TEXT || '|' ||
                         COALESCE(NEW.meddra_pts, '{}')::TEXT || '|' ||
                         NEW.seriousness_flag::TEXT || '|' ||
                         NEW.prev_entry_hash || '|' ||
                         NEW.created_at::TEXT;

    -- Compute SHA-256
    computed_hash := encode(sha256(canonical_content::BYTEA), 'hex');

    -- Verify provided hash matches computed hash
    IF NEW.entry_hash IS NOT NULL AND NEW.entry_hash <> computed_hash THEN
        RAISE EXCEPTION 'Entry hash mismatch: computed=%, provided=%', computed_hash, NEW.entry_hash;
    END IF;

    -- Set the computed hash
    NEW.entry_hash := computed_hash;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS trigger_compute_entry_hash ON ai_execution_ledger;
CREATE TRIGGER trigger_compute_entry_hash
    BEFORE INSERT ON ai_execution_ledger
    FOR EACH ROW
    EXECUTE FUNCTION compute_entry_hash();

-- ============================================================================
-- FUNCTION: GET LATEST ENTRY HASH FOR TENANT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_latest_entry_hash(p_tenant_id UUID)
RETURNS CHAR(64) AS $$
DECLARE
    v_hash CHAR(64);
BEGIN
    SELECT entry_hash INTO v_hash
    FROM ai_execution_ledger
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Return genesis hash if no entries exist
    IF v_hash IS NULL THEN
        RETURN repeat('0', 64);  -- GENESIS_HASH = 64 zeros
    END IF;

    RETURN v_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: VERIFY TENANT CHAIN INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_tenant_chain(
    p_tenant_id UUID,
    p_from_date TIMESTAMPTZ,
    p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
    entry_id UUID,
    trace_id UUID,
    created_at TIMESTAMPTZ,
    expected_prev_hash CHAR(64),
    actual_prev_hash CHAR(64),
    expected_entry_hash CHAR(64),
    actual_entry_hash CHAR(64),
    chain_valid BOOLEAN
) AS $$
DECLARE
    v_previous_hash CHAR(64) := repeat('0', 64);
    v_entry RECORD;
BEGIN
    FOR v_entry IN
        SELECT id, trace_id, created_at, prev_entry_hash, entry_hash,
               tenant_id, agent_name, execution_tier, model_name, model_hash,
               temperature, seed, grammar_version, prompt_hash, output_hash,
               redaction_summary, decision, confidence, meddra_pts, seriousness_flag
        FROM ai_execution_ledger
        WHERE tenant_id = p_tenant_id
          AND created_at >= p_from_date
          AND created_at <= p_to_date
        ORDER BY created_at ASC
    LOOP
        -- Build canonical content for verification (same as trigger)
        DECLARE
            canonical_content TEXT;
            computed_hash CHAR(64);
        BEGIN
            canonical_content := v_entry.tenant_id::TEXT || '|' ||
                                 v_entry.trace_id::TEXT || '|' ||
                                 v_entry.span_id::TEXT || '|' ||
                                 COALESCE(v_entry.correlation_id, '') || '|' ||
                                 v_entry.agent_name || '|' ||
                                 v_entry.execution_tier || '|' ||
                                 COALESCE(v_entry.model_name, '') || '|' ||
                                 COALESCE(v_entry.model_hash, '') || '|' ||
                                 v_entry.temperature::TEXT || '|' ||
                                 v_entry.seed::TEXT || '|' ||
                                 COALESCE(v_entry.grammar_version, '') || '|' ||
                                 v_entry.prompt_hash || '|' ||
                                 v_entry.output_hash || '|' ||
                                 COALESCE(v_entry.redaction_summary::TEXT, '') || '|' ||
                                 v_entry.decision || '|' ||
                                 v_entry.confidence::TEXT || '|' ||
                                 COALESCE(v_entry.meddra_pts, '{}')::TEXT || '|' ||
                                 v_entry.seriousness_flag::TEXT || '|' ||
                                 v_entry.prev_entry_hash || '|' ||
                                 v_entry.created_at::TEXT;

            computed_hash := encode(sha256(canonical_content::BYTEA), 'hex');

            RETURN QUERY SELECT
                v_entry.id,
                v_entry.trace_id,
                v_entry.created_at,
                v_previous_hash,
                v_entry.prev_entry_hash,
                computed_hash,
                v_entry.entry_hash,
                (v_entry.prev_entry_hash = v_previous_hash AND v_entry.entry_hash = computed_hash);

            -- Update for next iteration
            v_previous_hash := v_entry.entry_hash;
        END;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: GENERATE HOURLY GLOBAL MERKLE ANCHOR
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_hourly_merkle_anchor(p_anchor_hour TIMESTAMPTZ DEFAULT date_trunc('hour', NOW()))
RETURNS UUID AS $$
DECLARE
    v_global_root_hash CHAR(64);
    v_tenant_roots JSONB;
    v_anchor_id UUID;
BEGIN
    -- Get latest root hash for each tenant
    SELECT jsonb_object_agg(t.tenant_id, t.latest_hash)
    INTO v_tenant_roots
    FROM (
        SELECT l.tenant_id, l.entry_hash AS latest_hash
        FROM ai_execution_ledger l
        INNER JOIN (
            SELECT tenant_id, MAX(created_at) AS max_created
            FROM ai_execution_ledger
            WHERE created_at < p_anchor_hour + INTERVAL '1 hour'
            GROUP BY tenant_id
        ) latest ON l.tenant_id = latest.tenant_id AND l.created_at = latest.max_created
        WHERE l.tenant_id IN (SELECT id FROM tenants WHERE active = TRUE)
    ) t;

    -- Compute global Merkle root: SHA-256 of sorted tenant hashes
    -- Deterministic ordering: sort by tenant_id
    SELECT encode(sha256(string_agg(tenant_hash, '' ORDER BY tenant_id)::BYTEA), 'hex')
    INTO v_global_root_hash
    FROM (
        SELECT (kv->>'tenant_id') AS tenant_id, kv->>'hash' AS tenant_hash
        FROM jsonb_each(v_tenant_roots) AS kv
    ) sub;

    -- Insert anchor (upsert on anchor_hour)
    INSERT INTO global_merkle_anchors (anchor_hour, global_root_hash, tenant_roots)
    VALUES (p_anchor_hour, v_global_root_hash, v_tenant_roots)
    ON CONFLICT (anchor_hour) DO UPDATE SET
        global_root_hash = EXCLUDED.global_root_hash,
        tenant_roots = EXCLUDED.tenant_roots,
        anchored_at = NOW()
    RETURNING id INTO v_anchor_id;

    RETURN v_anchor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: EXPORT AUDIT TRAIL FOR REGULATORY SUBMISSION
-- ============================================================================

CREATE OR REPLACE FUNCTION export_audit_trail(
    p_tenant_id UUID,
    p_from_date TIMESTAMPTZ,
    p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
    entry_json JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT jsonb_build_object(
        'entry', jsonb_build_object(
            'id', l.id,
            'trace_id', l.trace_id,
            'span_id', l.span_id,
            'correlation_id', l.correlation_id,
            'agent_name', l.agent_name,
            'execution_tier', l.execution_tier,
            'model_name', l.model_name,
            'model_hash', l.model_hash,
            'temperature', l.temperature,
            'seed', l.seed,
            'grammar_version', l.grammar_version,
            'prompt_hash', l.prompt_hash,
            'output_hash', l.output_hash,
            'redaction_summary', l.redaction_summary,
            'decision', l.decision,
            'confidence', l.confidence,
            'meddra_pts', l.meddra_pts,
            'seriousness_flag', l.seriousness_flag,
            'prev_entry_hash', l.prev_entry_hash,
            'entry_hash', l.entry_hash,
            'created_at', l.created_at
        ),
        'human_reviews', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'reviewer_id', r.reviewer_id,
                'reviewer_role', r.reviewer_role,
                'original_decision', r.original_decision,
                'overridden_decision', r.overridden_decision,
                'rationale', r.rationale,
                'signature_meaning', r.signature_meaning,
                'signature_timestamp', r.signature_timestamp
            ))
            FROM ai_human_review r
            WHERE r.trace_id = l.trace_id
        ), '[]'::JSONB)
    )
    FROM ai_execution_ledger l
    WHERE l.tenant_id = p_tenant_id
      AND l.created_at >= p_from_date
      AND l.created_at <= p_to_date
    ORDER BY l.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Application role gets insert/select on ledger, select on anchors/reviews
-- GRANT SELECT, INSERT ON ai_execution_ledger TO nexus_app;
-- GRANT SELECT ON global_merkle_anchors TO nexus_app;
-- GRANT SELECT, INSERT ON ai_human_review TO nexus_app;
-- GRANT EXECUTE ON FUNCTION get_latest_entry_hash(UUID) TO nexus_app;
-- GRANT EXECUTE ON FUNCTION verify_tenant_chain(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO nexus_app;
-- GRANT EXECUTE ON FUNCTION generate_hourly_merkle_anchor(TIMESTAMPTZ) TO nexus_app;
-- GRANT EXECUTE ON FUNCTION export_audit_trail(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO nexus_app;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_execution_ledger IS
'Per-tenant append-only Merkle audit ledger for AI executions. Zero PHI storage - only hashes and metadata. Complies with 21 CFR Part 11, EU GVP Module VI, GAMP 5.';

COMMENT ON COLUMN ai_execution_ledger.prompt_hash IS 'SHA-256 of input prompt (redacted). ZDR: no raw text stored.';
COMMENT ON COLUMN ai_execution_ledger.output_hash IS 'SHA-256 of raw model output. ZDR: no raw text stored.';
COMMENT ON COLUMN ai_execution_ledger.prev_entry_hash IS 'Hash of previous entry for this tenant (Merkle chain).';
COMMENT ON COLUMN ai_execution_ledger.entry_hash IS 'SHA-256 of this entry''s immutable content + prev_entry_hash.';
COMMENT ON COLUMN ai_execution_ledger.temperature IS 'Must be 0.0 for deterministic execution. Enforced by CHECK constraint.';

COMMENT ON TABLE global_merkle_anchors IS
'Hourly global Merkle root anchoring all tenant chains. Provides cross-tenant integrity verification and regulatory audit anchor.';

COMMENT ON TABLE ai_human_review IS
'21 CFR Part 11 compliant human review overrides with electronic signatures. Linked to original execution via trace_id.';

COMMENT ON FUNCTION compute_entry_hash() IS
'BEFORE INSERT trigger computing SHA-256 of canonical entry content + prev_entry_hash. Enforces deterministic hashing.';

COMMENT ON FUNCTION verify_tenant_chain() IS
'Traverses tenant entries sequentially, recomputing every SHA-256 link. Returns chain validity report.';