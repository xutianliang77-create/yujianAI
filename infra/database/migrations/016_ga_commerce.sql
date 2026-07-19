-- M7 commercial settlement, SRE governance and immutable release decisions.

ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS plan_id text REFERENCES price_plans(plan_id);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS usage_cutoff timestamptz;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS export_uri text;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS export_digest text CHECK (export_digest IS NULL OR export_digest ~ '^sha256:[0-9a-f]{64}$');

CREATE TABLE IF NOT EXISTS billing_invoice_transitions (
  transition_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(invoice_id),
  from_status text NOT NULL CHECK (from_status IN ('draft','issued','paid','void')),
  to_status text NOT NULL CHECK (to_status IN ('issued','paid','void')),
  from_version bigint NOT NULL CHECK (from_version >= 1),
  to_version bigint NOT NULL CHECK (to_version = from_version + 1),
  approval_receipt_ref text NOT NULL,
  transitioned_at timestamptz NOT NULL,
  UNIQUE (invoice_id, to_version),
  CHECK ((from_status = 'draft' AND to_status IN ('issued','void')) OR (from_status = 'issued' AND to_status IN ('paid','void')))
);

CREATE TABLE IF NOT EXISTS provider_billing_statements (
  statement_id text PRIMARY KEY,
  provider_id text NOT NULL,
  billing_period text NOT NULL CHECK (billing_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  currency text NOT NULL CHECK (currency = 'CNY'),
  total_fen bigint NOT NULL CHECK (total_fen >= 0),
  statement_digest text NOT NULL UNIQUE CHECK (statement_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_uri text NOT NULL CHECK (artifact_uri ~ '^(evidence|s3|gs|oss|https)://' AND position('?' in artifact_uri) = 0 AND position('#' in artifact_uri) = 0),
  created_at timestamptz NOT NULL,
  UNIQUE (provider_id, billing_period)
);

CREATE TABLE IF NOT EXISTS billing_reconciliations (
  reconciliation_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(invoice_id),
  statement_id text NOT NULL REFERENCES provider_billing_statements(statement_id),
  expected_fen bigint NOT NULL CHECK (expected_fen >= 0),
  provider_total_fen bigint NOT NULL CHECK (provider_total_fen >= 0),
  delta_fen bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('matched','within-threshold','review-required','adjusted')),
  threshold_fen bigint NOT NULL CHECK (threshold_fen >= 0),
  finance_approval_ref text,
  adjustment_id text UNIQUE REFERENCES billing_adjustments(adjustment_id),
  created_at timestamptz NOT NULL,
  UNIQUE (invoice_id, statement_id)
);

CREATE TABLE IF NOT EXISTS error_budget_windows (
  budget_window_id text PRIMARY KEY,
  service text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  target_ratio numeric NOT NULL CHECK (target_ratio > 0 AND target_ratio < 1),
  good_events bigint NOT NULL CHECK (good_events >= 0),
  total_events bigint NOT NULL CHECK (total_events >= good_events),
  consumed_ratio numeric NOT NULL CHECK (consumed_ratio >= 0),
  release_policy text NOT NULL CHECK (release_policy IN ('normal','slowdown','freeze')),
  evidence_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (service, window_start, window_end),
  CHECK (window_end > window_start)
);

CREATE TABLE IF NOT EXISTS oncall_incidents (
  incident_id text PRIMARY KEY,
  service text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('p0','p1','p2','p3')),
  status text NOT NULL CHECK (status IN ('triggered','acknowledged','mitigated','resolved')),
  alert_fingerprint text NOT NULL UNIQUE CHECK (alert_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  escalation_policy_id text NOT NULL,
  triggered_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  mitigated_at timestamptz,
  resolved_at timestamptz,
  postmortem_ref text
);

CREATE TABLE IF NOT EXISTS oncall_incident_transitions (
  transition_id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES oncall_incidents(incident_id),
  from_status text NOT NULL CHECK (from_status IN ('triggered','acknowledged','mitigated')),
  to_status text NOT NULL CHECK (to_status IN ('acknowledged','mitigated','resolved')),
  evidence_ref text NOT NULL,
  actor_id text NOT NULL,
  transitioned_at timestamptz NOT NULL,
  UNIQUE (incident_id, to_status)
);

CREATE TABLE IF NOT EXISTS release_candidates (
  release_candidate_id text PRIMARY KEY,
  version text NOT NULL UNIQUE CHECK (version ~ '^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$'),
  source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
  manifest_digest text NOT NULL UNIQUE CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  record_digest text NOT NULL UNIQUE CHECK (record_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_manifest_uri text NOT NULL CHECK (artifact_manifest_uri ~ '^(evidence|s3|gs|oss|https)://' AND position('?' in artifact_manifest_uri) = 0 AND position('#' in artifact_manifest_uri) = 0),
  status text NOT NULL CHECK (status IN ('draft','frozen','rejected','released')),
  frozen_at timestamptz,
  created_at timestamptz NOT NULL,
  CHECK ((status IN ('frozen','released')) = (frozen_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS release_gate_results (
  release_candidate_id text NOT NULL REFERENCES release_candidates(release_candidate_id),
  gate_id text NOT NULL CHECK (gate_id ~ '^gate-(0|1|2|3|4|5|6|7|8|9|10)$'),
  status text NOT NULL CHECK (status IN ('passed','failed','not-run','blocked')),
  evidence_ref text NOT NULL,
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (release_candidate_id, gate_id)
);

CREATE TABLE IF NOT EXISTS ga_decisions (
  decision_id text PRIMARY KEY,
  release_candidate_id text NOT NULL UNIQUE REFERENCES release_candidates(release_candidate_id),
  release_candidate_artifact_digest text NOT NULL CHECK (release_candidate_artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approve','reject')),
  gate_snapshot_digest text NOT NULL CHECK (gate_snapshot_digest ~ '^sha256:[0-9a-f]{64}$'),
  owner_receipts jsonb NOT NULL CHECK (jsonb_typeof(owner_receipts) = 'object'),
  decided_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS security_audit_manifests (
  audit_manifest_id text PRIMARY KEY,
  release_digest text NOT NULL UNIQUE CHECK (release_digest ~ '^sha256:[0-9a-f]{64}$'),
  source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
  manifest_digest text NOT NULL UNIQUE CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('passed','failed','incomplete')),
  artifact_uri text NOT NULL,
  generated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS security_audit_checks (
  audit_manifest_id text NOT NULL REFERENCES security_audit_manifests(audit_manifest_id),
  check_id text NOT NULL CHECK (check_id IN ('secret-scan','sast','dependency-scan','container-scan','sbom','signature','penetration-test','compliance-assessment')),
  status text NOT NULL CHECK (status IN ('passed','failed','not-run','blocked')),
  critical_findings integer NOT NULL CHECK (critical_findings >= 0),
  high_findings integer NOT NULL CHECK (high_findings >= 0),
  evidence_ref text NOT NULL,
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (audit_manifest_id, check_id)
);
