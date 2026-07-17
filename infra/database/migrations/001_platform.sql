CREATE TABLE IF NOT EXISTS tenants (
  tenant_id text PRIMARY KEY,
  display_name text NOT NULL,
  status text NOT NULL,
  data_residency_policy text NOT NULL,
  plan_id text NOT NULL,
  billing_account_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL,
  default_region_policy_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL,
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS environments (
  environment_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  project_id text NOT NULL REFERENCES projects(project_id),
  name text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  endpoint text NOT NULL,
  region_policy_id text NOT NULL,
  quota_policy_id text NOT NULL,
  retention_policy_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_policies (
  quota_policy_id text PRIMARY KEY,
  max_rooms integer NOT NULL,
  max_participants_per_room integer NOT NULL,
  max_concurrent_participants integer NOT NULL,
  max_publishers integer NOT NULL,
  max_subscriptions integer NOT NULL,
  max_tracks integer NOT NULL,
  max_ingress_jobs integer NOT NULL,
  max_egress_jobs integer NOT NULL,
  max_recording_minutes_per_day integer NOT NULL,
  max_sip_concurrent_calls integer NOT NULL,
  max_sip_calls_per_minute integer NOT NULL,
  max_turn_bytes_per_minute bigint NOT NULL,
  max_token_requests_per_minute integer NOT NULL,
  max_concurrent_token_requests integer NOT NULL,
  max_data_bytes_per_minute bigint NOT NULL,
  max_agent_dispatches_per_minute integer NOT NULL,
  max_agent_workers integer NOT NULL,
  max_model_tokens_per_minute bigint NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  api_key_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  project_id text NOT NULL REFERENCES projects(project_id),
  environment_id text NOT NULL REFERENCES environments(environment_id),
  secret_hash bytea NOT NULL,
  key_prefix text NOT NULL,
  scopes jsonb NOT NULL,
  status text NOT NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  usage_record_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  project_id text NOT NULL,
  environment_id text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  metric text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  source text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  finalized_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id text PRIMARY KEY,
  tenant_id text,
  project_id text,
  environment_id text,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text NOT NULL,
  source_ip_hash text,
  result text NOT NULL,
  risk_level text NOT NULL,
  occurred_at timestamptz NOT NULL,
  details jsonb
);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  schema_version text NOT NULL,
  producer text NOT NULL,
  tenant_id text,
  project_id text,
  environment_id text,
  resource jsonb NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  trace_id text,
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox_events (occurred_at) WHERE published_at IS NULL;
