CREATE TABLE IF NOT EXISTS platform_store_snapshots (
  snapshot_id TEXT PRIMARY KEY CHECK (snapshot_id = 'default'),
  snapshot JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
