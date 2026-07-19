-- M6 private deployment acceptance and governed remote assistance.

ALTER TABLE support_access_grants
  ADD COLUMN IF NOT EXISTS approval_receipt_ref text;

ALTER TABLE support_access_grants
  DROP CONSTRAINT IF EXISTS support_access_grants_remote_approval_check;
ALTER TABLE support_access_grants
  ADD CONSTRAINT support_access_grants_remote_approval_check CHECK (
    CASE
      WHEN permissions ?| ARRAY['remote.inspect','remote.execute']
        THEN approval_receipt_ref ~ '^(evidence|https|s3|oss)://[^?#[:space:]]+$'
      ELSE approval_receipt_ref IS NULL
    END
  );

CREATE TABLE IF NOT EXISTS customer_acceptance_reports (
  report_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  environment_id text NOT NULL REFERENCES environments(environment_id),
  release_digest text NOT NULL CHECK (release_digest ~ '^sha256:[0-9a-f]{64}$'),
  report_digest text NOT NULL UNIQUE CHECK (report_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_uri text NOT NULL CHECK (artifact_uri ~ '^(s3|gs|oss|https)://' AND position('?' in artifact_uri) = 0 AND position('#' in artifact_uri) = 0),
  outcome text NOT NULL CHECK (outcome IN ('passed','failed','incomplete')),
  check_summary jsonb NOT NULL CHECK (jsonb_typeof(check_summary) = 'object'),
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_acceptance_reports_scope_idx
  ON customer_acceptance_reports (tenant_id, environment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS remote_assistance_events (
  event_id text PRIMARY KEY,
  grant_id text NOT NULL REFERENCES support_access_grants(grant_id),
  event_type text NOT NULL CHECK (event_type IN ('started','command-allowed','command-denied','ended','expired')),
  command_class text CHECK (command_class IS NULL OR command_class IN ('read-only-inspection','configuration-change','service-restart')),
  command_digest text CHECK (command_digest IS NULL OR command_digest ~ '^sha256:[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('allowed','denied','succeeded','failed')),
  occurred_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX IF NOT EXISTS remote_assistance_events_grant_idx
  ON remote_assistance_events (grant_id, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS remote_assistance_sessions (
  session_id text PRIMARY KEY,
  grant_id text NOT NULL UNIQUE REFERENCES support_access_grants(grant_id),
  ticket_id text NOT NULL REFERENCES support_tickets(ticket_id),
  session_token_hash text NOT NULL UNIQUE CHECK (session_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  operator_subject text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('remote.inspect','remote.execute')),
  approval_receipt_ref text NOT NULL CHECK (approval_receipt_ref ~ '^(evidence|https|s3|oss)://[^?#[:space:]]+$'),
  expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS remote_assistance_sessions_active_idx
  ON remote_assistance_sessions (expires_at) WHERE ended_at IS NULL;
