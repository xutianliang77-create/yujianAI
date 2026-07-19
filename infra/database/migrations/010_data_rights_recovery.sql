-- Recover interrupted data-rights work without repeating a destructive deletion.
ALTER TABLE data_subject_requests
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

UPDATE data_subject_requests SET processing_started_at = now()
  WHERE status = 'processing' AND processing_started_at IS NULL;

CREATE INDEX IF NOT EXISTS data_subject_requests_processing_idx
  ON data_subject_requests (processing_started_at, created_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS data_rights_evidence_receipts (
  request_id text PRIMARY KEY REFERENCES data_subject_requests(request_id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  action text NOT NULL CHECK (action IN ('delete')),
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_rights_evidence_receipts_tenant_idx
  ON data_rights_evidence_receipts (tenant_id, created_at);
