-- Durable media-ops state snapshot. Media state transitions remain validated in the service.
CREATE TABLE IF NOT EXISTS media_ops_snapshots (
  snapshot_id text PRIMARY KEY,
  snapshot jsonb NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);
