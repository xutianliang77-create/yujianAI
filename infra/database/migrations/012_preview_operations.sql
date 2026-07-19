-- M3 Preview entitlement, backup/restore evidence and support operations.
-- One-time support tokens are stored only as SHA-256 hashes.

INSERT INTO price_plans (plan_id, currency, effective_from, allowances, overage_unit_prices, created_at)
VALUES ('preview-v1', 'CNY', '2026-07-19T00:00:00Z',
        '{"tokenRequestsPerMinute":60,"participantMinutesPerMonth":10000,"agentMinutesPerMonth":0,"includedRecordingMinutes":0}'::jsonb,
        '{}'::jsonb, '2026-07-19T00:00:00Z')
ON CONFLICT (plan_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS environment_entitlements (
  entitlement_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  project_id text NOT NULL REFERENCES projects(project_id),
  environment_id text NOT NULL REFERENCES environments(environment_id) UNIQUE,
  plan_id text NOT NULL REFERENCES price_plans(plan_id),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'expired')),
  features jsonb NOT NULL CHECK (jsonb_typeof(features) = 'array' AND jsonb_array_length(features) BETWEEN 1 AND 7),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  updated_at timestamptz NOT NULL,
  CHECK (valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS environment_entitlements_active_idx
  ON environment_entitlements (status, valid_until);

CREATE TABLE IF NOT EXISTS control_plane_backup_runs (
  backup_run_id text PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('planned', 'running', 'verified', 'failed')),
  snapshot_at timestamptz,
  artifact_uri text,
  artifact_sha256 text,
  encryption_key_ref text NOT NULL,
  schema_migration text NOT NULL,
  rpo_seconds integer NOT NULL CHECK (rpo_seconds >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS control_plane_restore_drills (
  restore_drill_id text PRIMARY KEY,
  backup_run_id text NOT NULL REFERENCES control_plane_backup_runs(backup_run_id),
  status text NOT NULL CHECK (status IN ('planned', 'running', 'verified', 'failed')),
  isolated boolean NOT NULL DEFAULT true,
  production_overwrite boolean NOT NULL DEFAULT false,
  rto_milliseconds bigint,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  CHECK (production_overwrite = false),
  CHECK (rto_milliseconds IS NULL OR rto_milliseconds >= 0)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  project_id text NOT NULL REFERENCES projects(project_id),
  environment_id text NOT NULL REFERENCES environments(environment_id),
  severity text NOT NULL CHECK (severity IN ('p0', 'p1', 'p2', 'p3')),
  category text NOT NULL CHECK (category IN ('availability', 'quality', 'billing', 'security', 'deployment')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 3 AND 256 AND summary !~ '[[:cntrl:]]'),
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('open', 'in-progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_idempotency_idx
  ON support_tickets (environment_id, idempotency_key);
CREATE INDEX IF NOT EXISTS support_tickets_scope_idx
  ON support_tickets (tenant_id, project_id, environment_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_bundle_artifacts (
  bundle_id text PRIMARY KEY,
  ticket_id text NOT NULL REFERENCES support_tickets(ticket_id),
  artifact_uri text NOT NULL CHECK (artifact_uri ~ '^(s3|gs|https)://' AND position('?' in artifact_uri) = 0 AND position('#' in artifact_uri) = 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^sha256:[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  redaction_policy_version text NOT NULL,
  contains_media boolean NOT NULL DEFAULT false CHECK (contains_media = false),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS support_access_grants (
  grant_id text PRIMARY KEY,
  ticket_id text NOT NULL REFERENCES support_tickets(ticket_id),
  operator_subject text NOT NULL,
  permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'array' AND jsonb_array_length(permissions) = 1),
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS support_access_grants_active_idx
  ON support_access_grants (ticket_id, expires_at)
  WHERE revoked_at IS NULL;
