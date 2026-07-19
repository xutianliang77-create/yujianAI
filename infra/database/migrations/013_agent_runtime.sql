CREATE TABLE IF NOT EXISTS agent_provider_invocations (
  invocation_id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  environment_id text NOT NULL,
  deployment_id text NOT NULL,
  dispatch_id text NOT NULL,
  provider_id text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('realtime','llm','asr','tts','vlm','moderation')),
  outcome text NOT NULL CHECK (outcome IN ('success','failure','cancelled')),
  duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
  trace_id text NOT NULL,
  error_code text,
  input_text_units bigint NOT NULL DEFAULT 0 CHECK (input_text_units >= 0),
  output_text_units bigint NOT NULL DEFAULT 0 CHECK (output_text_units >= 0),
  input_audio_ms bigint NOT NULL DEFAULT 0 CHECK (input_audio_ms >= 0),
  output_audio_ms bigint NOT NULL DEFAULT 0 CHECK (output_audio_ms >= 0),
  image_units bigint NOT NULL DEFAULT 0 CHECK (image_units >= 0),
  currency text CHECK (currency IN ('CNY','USD')),
  amount_micros bigint CHECK (amount_micros >= 0),
  pricing_version text,
  occurred_at timestamptz NOT NULL,
  CHECK ((currency IS NULL AND amount_micros IS NULL AND pricing_version IS NULL) OR
         (currency IS NOT NULL AND amount_micros IS NOT NULL AND pricing_version IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS agent_provider_invocations_scope_time_idx
  ON agent_provider_invocations (tenant_id, environment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agent_provider_invocations_dispatch_idx
  ON agent_provider_invocations (dispatch_id, occurred_at);

CREATE TABLE IF NOT EXISTS agent_tool_results (
  result_key text PRIMARY KEY CHECK (result_key ~ '^[0-9a-f]{64}$'),
  result_ciphertext bytea NOT NULL,
  encryption_key_ref text NOT NULL,
  ciphertext_sha256 text NOT NULL CHECK (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tool_audit (
  event_id bigserial PRIMARY KEY,
  tool_id text NOT NULL,
  result_key text NOT NULL CHECK (result_key ~ '^[0-9a-f]{64}$'),
  trace_id text NOT NULL,
  subject_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('denied','executed','replayed')),
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_tool_audit_trace_idx ON agent_tool_audit (trace_id, occurred_at);
