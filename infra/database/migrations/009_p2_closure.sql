-- P2 identity/data-rights execution and retry-safe webhook delivery.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_until timestamptz;
CREATE INDEX IF NOT EXISTS outbox_claim_idx ON outbox_events (claimed_until, next_attempt_at, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  event_id text NOT NULL REFERENCES outbox_events(event_id) ON DELETE CASCADE,
  destination_id text NOT NULL,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, destination_id)
);

CREATE TABLE IF NOT EXISTS data_subject_records (
  record_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  subject_id text NOT NULL,
  system_name text NOT NULL,
  record_locator text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject_id, system_name, record_locator)
);
CREATE INDEX IF NOT EXISTS data_subject_records_subject_idx
  ON data_subject_records (tenant_id, subject_id);
