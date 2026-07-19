import { createHash } from "node:crypto";
import type { MediaProviderUsageV1, MediaUsageReconciliationV1, SipCallV1, SipQualitySummaryV1 } from "@yujian/platform-contracts";

export interface MediaAccountingSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[] }>;
}

function count(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value;
}

function time(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${field} is invalid`);
  return value;
}

/** Immutable provider usage ingestion and variance ledger. */
export class PostgresMediaAccounting {
  constructor(private readonly pool: MediaAccountingSqlPool, private readonly now: () => Date = () => new Date()) {}

  async appendUsage(value: MediaProviderUsageV1): Promise<void> {
    count(value.quantity, "quantity"); count(value.amountMicros, "amountMicros");
    time(value.periodStartedAt, "periodStartedAt"); time(value.periodEndedAt, "periodEndedAt");
    if (!/^sha256:[0-9a-f]{64}$/u.test(value.sourceDigest)) throw new TypeError("sourceDigest is invalid");
    const result = await this.pool.query<{ source_digest: string }>(
      `INSERT INTO media_provider_usage
       (provider_id, provider_record_id, environment_id, resource_kind, provider_resource_id,
        usage_type, quantity, unit, amount_micros, currency, period_started_at, period_ended_at,
        source_digest, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz,$13,$14::timestamptz)
       ON CONFLICT (provider_id, provider_record_id) DO NOTHING RETURNING source_digest`,
      [value.providerId, value.providerRecordId, value.environmentId, value.resourceKind, value.providerResourceId,
        value.usageType, value.quantity, value.unit, value.amountMicros, value.currency, value.periodStartedAt,
        value.periodEndedAt, value.sourceDigest, this.now().toISOString()],
    );
    if (result.rows[0] !== undefined) return;
    const existing = await this.pool.query<{ source_digest: string; provider_resource_id: string; quantity: string | number; amount_micros: string | number }>(
      "SELECT source_digest, provider_resource_id, quantity, amount_micros FROM media_provider_usage WHERE provider_id = $1 AND provider_record_id = $2",
      [value.providerId, value.providerRecordId],
    );
    const row = existing.rows[0];
    if (row?.source_digest !== value.sourceDigest || row.provider_resource_id !== value.providerResourceId || Number(row.quantity) !== value.quantity || Number(row.amount_micros) !== value.amountMicros) throw new Error("provider usage idempotency conflict");
  }

  async reconcile(value: MediaProviderUsageV1, platformQuantity: number): Promise<MediaUsageReconciliationV1> {
    const providerQuantity = count(value.quantity, "providerQuantity");
    const localQuantity = count(platformQuantity, "platformQuantity");
    const variance = providerQuantity - localQuantity;
    const reconciliationKey = `${value.providerId}\u0000${value.providerRecordId}\u0000${localQuantity}`;
    const result: MediaUsageReconciliationV1 = {
      reconciliationId: `media-reconcile-${createHash("sha256").update(reconciliationKey).digest("hex")}`,
      environmentId: value.environmentId,
      resourceKind: value.resourceKind,
      providerResourceId: value.providerResourceId,
      providerQuantity,
      platformQuantity: localQuantity,
      variance,
      status: variance === 0 ? "matched" : "variance",
      createdAt: this.now().toISOString(),
    };
    await this.pool.query(
      `INSERT INTO media_usage_reconciliations
       (reconciliation_id, environment_id, resource_kind, provider_resource_id, provider_quantity,
        platform_quantity, variance, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)
       ON CONFLICT (reconciliation_id) DO NOTHING`,
      [result.reconciliationId, result.environmentId, result.resourceKind, result.providerResourceId,
        result.providerQuantity, result.platformQuantity, result.variance, result.status, result.createdAt],
    );
    return result;
  }

  async resolve(reconciliationId: string, resolutionDigest: string): Promise<void> {
    if (!/^sha256:[0-9a-f]{64}$/u.test(resolutionDigest)) throw new TypeError("resolutionDigest is invalid");
    const result = await this.pool.query(
      `UPDATE media_usage_reconciliations SET status = 'resolved', resolution_digest = $2, resolved_at = $3::timestamptz
       WHERE reconciliation_id = $1 AND status = 'variance' RETURNING reconciliation_id`,
      [reconciliationId, resolutionDigest, this.now().toISOString()],
    );
    if (result.rows[0] === undefined) throw new Error("media reconciliation is missing or not open");
  }

  async recordSipQuality(summary: SipQualitySummaryV1): Promise<boolean> {
    const result = await this.pool.query<{ call_id: string }>(
      `INSERT INTO media_quality_summaries
       (environment_id, call_id, provider_id, post_dial_delay_ms, connected_duration_ms,
        answered, dtmf_attempted, terminal_reason_code, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)
       ON CONFLICT (environment_id, call_id) DO NOTHING RETURNING call_id`,
      [summary.environmentId, summary.callId, summary.providerId, count(summary.postDialDelayMs, "postDialDelayMs"),
        count(summary.connectedDurationMs, "connectedDurationMs"), summary.answered, summary.dtmfAttempted,
        summary.terminalReasonCode, time(summary.observedAt, "observedAt")],
    );
    return result.rows[0] !== undefined;
  }
}

export function summarizeSipQuality(call: SipCallV1, providerId: string, observedAt = new Date()): SipQualitySummaryV1 {
  const created = Date.parse(call.createdAt);
  const answered = call.answeredAt === undefined ? undefined : Date.parse(call.answeredAt);
  const ended = call.endedAt === undefined ? observedAt.getTime() : Date.parse(call.endedAt);
  if (!Number.isFinite(created) || (answered !== undefined && !Number.isFinite(answered)) || !Number.isFinite(ended)) throw new TypeError("call timestamps are invalid");
  return {
    environmentId: call.environmentId,
    callId: call.callId,
    providerId,
    postDialDelayMs: answered === undefined ? Math.max(0, ended - created) : Math.max(0, answered - created),
    connectedDurationMs: answered === undefined ? 0 : Math.max(0, ended - answered),
    answered: answered !== undefined,
    dtmfAttempted: call.dtmfSequenceHash !== undefined,
    terminalReasonCode: call.terminalReasonCode ?? (call.status === "active" ? "active" : call.status),
    observedAt: observedAt.toISOString(),
  };
}
