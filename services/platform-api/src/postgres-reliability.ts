import { randomUUID } from "node:crypto";

export type ReleasePolicy = "normal" | "slowdown" | "freeze";
export type IncidentStatus = "triggered" | "acknowledged" | "mitigated" | "resolved";
export interface ReliabilitySqlResult<Row extends object> { rows: readonly Row[] }
export interface ReliabilitySqlConnection { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<ReliabilitySqlResult<Row>>; release(): void }
export interface ReliabilitySqlPool { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<ReliabilitySqlResult<Row>>; connect(): Promise<ReliabilitySqlConnection> }
export interface ErrorBudgetWindow {
  budgetWindowId: string;
  service: string;
  windowStart: string;
  windowEnd: string;
  targetRatio: number;
  goodEvents: number;
  totalEvents: number;
  consumedRatio: number;
  releasePolicy: ReleasePolicy;
  evidenceRef: string;
}
export interface OncallIncident {
  incidentId: string;
  service: string;
  severity: "p0" | "p1" | "p2" | "p3";
  status: IncidentStatus;
  alertFingerprint: string;
  escalationPolicyId: string;
}

const ID = /^[a-z][a-z0-9._-]{2,127}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REF = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
function instant(value: string, field: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${field} is invalid`);
  return new Date(time).toISOString();
}
function count(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} is invalid`);
  return value;
}

export function evaluateErrorBudget(input: Omit<ErrorBudgetWindow, "budgetWindowId" | "consumedRatio" | "releasePolicy">): Omit<ErrorBudgetWindow, "budgetWindowId"> {
  if (!ID.test(input.service) || !REF.test(input.evidenceRef) || !Number.isFinite(input.targetRatio) || input.targetRatio <= 0 || input.targetRatio >= 1) throw new TypeError("error budget identity or target is invalid");
  const good = count(input.goodEvents, "goodEvents");
  const total = count(input.totalEvents, "totalEvents");
  if (good > total || Date.parse(instant(input.windowEnd, "windowEnd")) <= Date.parse(instant(input.windowStart, "windowStart"))) throw new TypeError("error budget window is invalid");
  const failureRatio = total === 0 ? 0 : (total - good) / total;
  const consumedRatio = failureRatio / (1 - input.targetRatio);
  const releasePolicy: ReleasePolicy = consumedRatio >= 1 ? "freeze" : consumedRatio > 0.5 ? "slowdown" : "normal";
  return { ...input, windowStart: instant(input.windowStart, "windowStart"), windowEnd: instant(input.windowEnd, "windowEnd"), goodEvents: good, totalEvents: total, consumedRatio, releasePolicy };
}

/** PostgreSQL reliability ledger. Windows and incident transitions are append-only and idempotent. */
export class PostgresReliabilityService {
  constructor(private readonly pool: ReliabilitySqlPool, private readonly clock: () => number = Date.now) {}

  async recordErrorBudget(input: Omit<ErrorBudgetWindow, "budgetWindowId" | "consumedRatio" | "releasePolicy">): Promise<ErrorBudgetWindow> {
    const window = evaluateErrorBudget(input);
    const id = `budget-${randomUUID()}`;
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${window.service}:${window.windowStart}:${window.windowEnd}`]);
      const existing = await connection.query<{ budget_window_id: string; target_ratio: string | number; good_events: string | number; total_events: string | number; consumed_ratio: string | number; release_policy: ReleasePolicy; evidence_ref: string }>("SELECT budget_window_id,target_ratio,good_events,total_events,consumed_ratio,release_policy,evidence_ref FROM error_budget_windows WHERE service=$1 AND window_start=$2 AND window_end=$3", [window.service, window.windowStart, window.windowEnd]);
      const stored = existing.rows[0];
      if (stored !== undefined) {
        if (Number(stored.target_ratio) !== window.targetRatio || Number(stored.good_events) !== window.goodEvents || Number(stored.total_events) !== window.totalEvents || stored.evidence_ref !== window.evidenceRef || stored.release_policy !== window.releasePolicy) throw new Error("error budget window conflicts with immutable evidence");
        await connection.query("COMMIT");
        return { ...window, budgetWindowId: stored.budget_window_id, consumedRatio: Number(stored.consumed_ratio), releasePolicy: stored.release_policy };
      }
      await connection.query("INSERT INTO error_budget_windows (budget_window_id,service,window_start,window_end,target_ratio,good_events,total_events,consumed_ratio,release_policy,evidence_ref,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id, window.service, window.windowStart, window.windowEnd, window.targetRatio, window.goodEvents, window.totalEvents, window.consumedRatio, window.releasePolicy, window.evidenceRef, new Date(this.clock()).toISOString()]);
      await connection.query("COMMIT");
      return { ...window, budgetWindowId: id };
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async triggerIncident(input: Omit<OncallIncident, "incidentId" | "status">): Promise<OncallIncident> {
    if (!ID.test(input.service) || !ID.test(input.escalationPolicyId) || !DIGEST.test(input.alertFingerprint) || !["p0", "p1", "p2", "p3"].includes(input.severity)) throw new TypeError("incident input is invalid");
    const proposedId = `incident-${randomUUID()}`;
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [input.alertFingerprint]);
      const existing = await connection.query<{ incident_id: string; service: string; severity: OncallIncident["severity"]; status: IncidentStatus; alert_fingerprint: string; escalation_policy_id: string }>("SELECT incident_id,service,severity,status,alert_fingerprint,escalation_policy_id FROM oncall_incidents WHERE alert_fingerprint=$1", [input.alertFingerprint]);
      const row = existing.rows[0];
      if (row !== undefined) {
        if (row.service !== input.service || row.severity !== input.severity || row.escalation_policy_id !== input.escalationPolicyId) throw new Error("incident fingerprint conflicts with immutable alert content");
        await connection.query("COMMIT");
        return { incidentId: row.incident_id, service: row.service, severity: row.severity, status: row.status, alertFingerprint: row.alert_fingerprint, escalationPolicyId: row.escalation_policy_id };
      }
      await connection.query("INSERT INTO oncall_incidents (incident_id,service,severity,status,alert_fingerprint,escalation_policy_id,triggered_at) VALUES ($1,$2,$3,'triggered',$4,$5,$6)", [proposedId, input.service, input.severity, input.alertFingerprint, input.escalationPolicyId, new Date(this.clock()).toISOString()]);
      await connection.query("COMMIT");
      return { incidentId: proposedId, service: input.service, severity: input.severity, status: "triggered", alertFingerprint: input.alertFingerprint, escalationPolicyId: input.escalationPolicyId };
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async transitionIncident(incidentId: string, from: Exclude<IncidentStatus, "resolved">, to: Exclude<IncidentStatus, "triggered">, actorId: string, evidenceRef: string, postmortemRef?: string): Promise<void> {
    const allowed = (from === "triggered" && to === "acknowledged") || (from === "acknowledged" && to === "mitigated") || (from === "mitigated" && to === "resolved");
    if (!allowed || !ID.test(incidentId) || !ID.test(actorId) || !REF.test(evidenceRef) || (to === "resolved" ? postmortemRef === undefined || !REF.test(postmortemRef) : postmortemRef !== undefined)) throw new TypeError("incident transition is invalid");
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const now = new Date(this.clock()).toISOString();
      const updated = await connection.query<{ incident_id: string }>(`UPDATE oncall_incidents SET status=$3,acknowledged_at=CASE WHEN $3='acknowledged' THEN $4 ELSE acknowledged_at END,mitigated_at=CASE WHEN $3='mitigated' THEN $4 ELSE mitigated_at END,resolved_at=CASE WHEN $3='resolved' THEN $4 ELSE resolved_at END,postmortem_ref=CASE WHEN $3='resolved' THEN $5 ELSE postmortem_ref END WHERE incident_id=$1 AND status=$2 RETURNING incident_id`, [incidentId, from, to, now, postmortemRef ?? null]);
      if (updated.rows[0] === undefined) throw new Error("incident transition conflict");
      await connection.query("INSERT INTO oncall_incident_transitions (transition_id,incident_id,from_status,to_status,evidence_ref,actor_id,transitioned_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [`incident-transition-${randomUUID()}`, incidentId, from, to, evidenceRef, actorId, now]);
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }
}
