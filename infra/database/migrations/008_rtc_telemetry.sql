-- Durable RTC quality samples; retention jobs may delete rows by captured_at.
CREATE TABLE IF NOT EXISTS rtc_quality_samples (
  sample_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  participant_identity TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  rtt_ms DOUBLE PRECISION,
  jitter_ms DOUBLE PRECISION,
  packets_lost DOUBLE PRECISION,
  packets_sent DOUBLE PRECISION,
  bitrate_kbps DOUBLE PRECISION,
  audio_level DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rtt_ms IS NULL OR rtt_ms >= 0),
  CHECK (jitter_ms IS NULL OR jitter_ms >= 0),
  CHECK (packets_lost IS NULL OR packets_lost >= 0),
  CHECK (packets_sent IS NULL OR packets_sent >= 0),
  CHECK (bitrate_kbps IS NULL OR bitrate_kbps >= 0),
  CHECK (audio_level IS NULL OR audio_level >= 0)
);
CREATE INDEX IF NOT EXISTS rtc_quality_samples_scope_time_idx
  ON rtc_quality_samples (tenant_id, project_id, environment_id, captured_at DESC);
