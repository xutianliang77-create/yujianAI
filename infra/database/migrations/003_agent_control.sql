CREATE TABLE IF NOT EXISTS agent_control_snapshots (
  snapshot_id text PRIMARY KEY CHECK (snapshot_id = 'default'),
  snapshot jsonb NOT NULL,
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);
