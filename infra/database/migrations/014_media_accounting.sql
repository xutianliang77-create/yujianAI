-- pgcrypto is required once to irreversibly remove legacy raw idempotency keys from 002 tables.
-- The migration fails closed when the database owner cannot install/use it.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sip_calls ADD COLUMN idempotency_key_hash text;
UPDATE sip_calls SET idempotency_key_hash = encode(digest(idempotency_key, 'sha256'), 'hex');
ALTER TABLE sip_calls ALTER COLUMN idempotency_key_hash SET NOT NULL;
ALTER TABLE sip_calls DROP COLUMN idempotency_key;
ALTER TABLE sip_calls ADD CONSTRAINT sip_calls_idempotency_key_hash_format CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE sip_calls ADD CONSTRAINT sip_calls_environment_id_idempotency_key_hash_key UNIQUE (environment_id, idempotency_key_hash);

ALTER TABLE ingress_jobs ADD COLUMN idempotency_key_hash text;
UPDATE ingress_jobs SET idempotency_key_hash = encode(digest(idempotency_key, 'sha256'), 'hex');
ALTER TABLE ingress_jobs ALTER COLUMN idempotency_key_hash SET NOT NULL;
ALTER TABLE ingress_jobs DROP COLUMN idempotency_key;
ALTER TABLE ingress_jobs ADD CONSTRAINT ingress_jobs_idempotency_key_hash_format CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE ingress_jobs ADD CONSTRAINT ingress_jobs_environment_id_idempotency_key_hash_key UNIQUE (environment_id, idempotency_key_hash);

ALTER TABLE egress_jobs ADD COLUMN idempotency_key_hash text;
UPDATE egress_jobs SET idempotency_key_hash = encode(digest(idempotency_key, 'sha256'), 'hex');
ALTER TABLE egress_jobs ALTER COLUMN idempotency_key_hash SET NOT NULL;
ALTER TABLE egress_jobs DROP COLUMN idempotency_key;
ALTER TABLE egress_jobs ADD CONSTRAINT egress_jobs_idempotency_key_hash_format CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE egress_jobs ADD CONSTRAINT egress_jobs_environment_id_idempotency_key_hash_key UNIQUE (environment_id, idempotency_key_hash);

-- Remove complete trunk numbers from the ordinary metadata table. Existing values become irreversible
-- references and must be rebound to a deployment-owned KMS/provider reference before activation.
ALTER TABLE sip_trunks RENAME COLUMN numbers TO legacy_numbers;
ALTER TABLE sip_trunks ADD COLUMN number_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE sip_trunks SET number_refs = COALESCE((
  SELECT jsonb_agg(to_jsonb('sha256:' || encode(digest(value, 'sha256'), 'hex')))
  FROM jsonb_array_elements_text(legacy_numbers) AS source(value)
), '[]'::jsonb);
ALTER TABLE sip_trunks DROP COLUMN legacy_numbers;
ALTER TABLE sip_trunks RENAME COLUMN allowed_destinations TO allowed_destination_prefixes;
ALTER TABLE sip_trunks ADD COLUMN secure_transport text NOT NULL DEFAULT 'tls-srtp' CHECK (secure_transport IN ('tls-srtp','provider-managed'));
ALTER TABLE sip_trunks ADD COLUMN fraud_policy_ref text NOT NULL DEFAULT 'unconfigured';
ALTER TABLE sip_trunks ADD COLUMN dispatch_rule_ref text NOT NULL DEFAULT 'unconfigured';
ALTER TABLE sip_trunks ADD COLUMN max_concurrent_calls integer NOT NULL DEFAULT 1 CHECK (max_concurrent_calls BETWEEN 1 AND 100000);
ALTER TABLE sip_trunks ADD COLUMN max_calls_per_minute integer NOT NULL DEFAULT 1 CHECK (max_calls_per_minute BETWEEN 1 AND 1000000);
ALTER TABLE sip_trunks ADD COLUMN max_daily_cost_micros bigint NOT NULL DEFAULT 1 CHECK (max_daily_cost_micros > 0);
ALTER TABLE sip_trunks ADD COLUMN allow_international boolean NOT NULL DEFAULT false;
ALTER TABLE sip_trunks ADD CONSTRAINT sip_trunks_direction_check CHECK (direction IN ('inbound','outbound','bidirectional'));
ALTER TABLE sip_trunks ADD CONSTRAINT sip_trunks_status_check CHECK (status IN ('active','suspended','retiring'));
ALTER TABLE sip_trunks ADD CONSTRAINT sip_trunks_number_refs_array_check CHECK (jsonb_typeof(number_refs) = 'array');
ALTER TABLE sip_trunks ADD CONSTRAINT sip_trunks_destination_prefixes_array_check CHECK (jsonb_typeof(allowed_destination_prefixes) = 'array');

CREATE TABLE IF NOT EXISTS media_provider_usage (
  provider_id text NOT NULL,
  provider_record_id text NOT NULL,
  environment_id text NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('sip_call','ingress','egress')),
  provider_resource_id text NOT NULL,
  usage_type text NOT NULL CHECK (usage_type IN ('duration_ms','recording_ms','transcoded_ms','bytes','operation')),
  quantity bigint NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL CHECK (unit IN ('ms','byte','count')),
  amount_micros bigint NOT NULL CHECK (amount_micros >= 0),
  currency text NOT NULL CHECK (currency IN ('CNY','USD')),
  period_started_at timestamptz NOT NULL,
  period_ended_at timestamptz NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (provider_id, provider_record_id),
  CHECK (period_ended_at >= period_started_at)
);

CREATE INDEX IF NOT EXISTS media_provider_usage_scope_time_idx
  ON media_provider_usage (environment_id, period_started_at DESC);
CREATE INDEX IF NOT EXISTS media_provider_usage_resource_idx
  ON media_provider_usage (resource_kind, provider_resource_id);

CREATE TABLE IF NOT EXISTS media_usage_reconciliations (
  reconciliation_id text PRIMARY KEY,
  environment_id text NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('sip_call','ingress','egress')),
  provider_resource_id text NOT NULL,
  provider_quantity bigint NOT NULL CHECK (provider_quantity >= 0),
  platform_quantity bigint NOT NULL CHECK (platform_quantity >= 0),
  variance bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('matched','variance','resolved')),
  resolution_digest text CHECK (resolution_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CHECK ((status = 'resolved' AND resolution_digest IS NOT NULL AND resolved_at IS NOT NULL) OR
         (status <> 'resolved' AND resolution_digest IS NULL AND resolved_at IS NULL))
);

CREATE INDEX IF NOT EXISTS media_usage_reconciliations_scope_idx
  ON media_usage_reconciliations (environment_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS media_quality_summaries (
  environment_id text NOT NULL,
  call_id text NOT NULL,
  provider_id text NOT NULL,
  post_dial_delay_ms bigint NOT NULL CHECK (post_dial_delay_ms >= 0),
  connected_duration_ms bigint NOT NULL CHECK (connected_duration_ms >= 0),
  answered boolean NOT NULL,
  dtmf_attempted boolean NOT NULL,
  terminal_reason_code text NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (environment_id, call_id)
);

CREATE TABLE IF NOT EXISTS media_reconciliation_checkpoints (
  source_id text PRIMARY KEY,
  cursor_value text NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  updated_at timestamptz NOT NULL
);
