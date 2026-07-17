CREATE TABLE IF NOT EXISTS webhook_destinations (
  destination_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  event_types JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (destination_id, tenant_id, project_id, environment_id)
);
CREATE INDEX IF NOT EXISTS webhook_destinations_scope_idx
  ON webhook_destinations (tenant_id, project_id, environment_id, status);
