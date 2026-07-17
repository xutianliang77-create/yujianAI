-- Keep long multi-destination webhook deliveries owned by one replica.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claim_token text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claim_renewal_count integer NOT NULL DEFAULT 0;

UPDATE outbox_events SET claim_token = NULL, claimed_until = NULL
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
