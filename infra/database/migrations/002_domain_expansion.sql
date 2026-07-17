-- M2-M7 durable domain tables. Secrets and full phone numbers remain outside this schema.

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS source_ip_hash text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS trace_id text;

CREATE TABLE IF NOT EXISTS tenant_members (
  member_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  subject text NOT NULL,
  roles jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL,
  UNIQUE (tenant_id, subject)
);

CREATE TABLE IF NOT EXISTS region_policies (
  region_policy_id text PRIMARY KEY,
  allowed_regions jsonb NOT NULL,
  preferred_regions jsonb NOT NULL,
  residency_tags jsonb NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS room_policies (
  room_policy_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  empty_timeout_seconds integer NOT NULL,
  max_participants integer NOT NULL,
  max_publishers integer NOT NULL,
  enabled_codecs jsonb NOT NULL,
  recording_enabled boolean NOT NULL,
  metadata_size_limit integer NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_bindings (
  binding_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  capability text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  region text,
  secret_ref text NOT NULL,
  data_policy text NOT NULL,
  timeout_ms integer NOT NULL,
  cost_policy text,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  artifact_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  project_id text NOT NULL REFERENCES projects(project_id),
  image text NOT NULL,
  digest text NOT NULL,
  runtime text NOT NULL,
  entrypoint text NOT NULL,
  sbom_uri text,
  signature_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, image, digest)
);

CREATE TABLE IF NOT EXISTS agent_deployments (
  deployment_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  artifact_id text NOT NULL REFERENCES agent_artifacts(artifact_id),
  desired_replicas integer NOT NULL,
  observed_replicas integer NOT NULL,
  generation bigint NOT NULL,
  status text NOT NULL,
  canary_percent integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_dispatches (
  dispatch_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  deployment_id text NOT NULL REFERENCES agent_deployments(deployment_id),
  room_name text NOT NULL,
  status text NOT NULL,
  deadline_at timestamptz NOT NULL,
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL,
  accepted_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  failure_category text
);

CREATE TABLE IF NOT EXISTS sip_trunks (
  trunk_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  direction text NOT NULL,
  provider text NOT NULL,
  region text NOT NULL,
  numbers jsonb NOT NULL,
  credential_ref text NOT NULL,
  allowed_destinations jsonb NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sip_calls (
  call_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  trunk_id text REFERENCES sip_trunks(trunk_id),
  provider_call_id text,
  room_name text NOT NULL,
  participant_sid text,
  direction text NOT NULL,
  remote_number_hash text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (environment_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ingress_jobs (
  ingress_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  provider_ingress_id text,
  room_name text NOT NULL,
  input_type text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (environment_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS egress_jobs (
  egress_id text PRIMARY KEY,
  environment_id text NOT NULL REFERENCES environments(environment_id),
  provider_egress_id text,
  room_name text NOT NULL,
  output_type text NOT NULL,
  object_uri text,
  retention_expires_at timestamptz,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (environment_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS price_plans (
  plan_id text PRIMARY KEY,
  currency text NOT NULL,
  effective_from timestamptz NOT NULL,
  allowances jsonb NOT NULL,
  overage_unit_prices jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  invoice_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  billing_period text NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  total_fen bigint NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, billing_period)
);

CREATE TABLE IF NOT EXISTS billing_invoice_lines (
  line_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(invoice_id),
  usage_metric text NOT NULL,
  quantity numeric NOT NULL,
  unit_price_fen bigint NOT NULL,
  amount_fen bigint NOT NULL,
  usage_window_start timestamptz NOT NULL,
  usage_window_end timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_adjustments (
  adjustment_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(invoice_id),
  kind text NOT NULL CHECK (kind IN ('credit', 'debit')),
  amount_fen bigint NOT NULL CHECK (amount_fen >= 0),
  reason text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS data_subject_requests (
  request_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  subject_id text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  evidence_uri text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz
);

ALTER TABLE data_subject_requests ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS data_subject_requests_idempotency_idx
  ON data_subject_requests (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_dispatch_deadline_idx ON agent_dispatches (environment_id, deadline_at) WHERE status IN ('queued', 'starting', 'running');
CREATE INDEX IF NOT EXISTS media_jobs_status_idx ON ingress_jobs (environment_id, status);
CREATE INDEX IF NOT EXISTS egress_jobs_status_idx ON egress_jobs (environment_id, status);
