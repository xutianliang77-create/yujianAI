import type { PlatformScopeV1, RtcQualitySampleV1, RtcQualitySummaryV1 } from "@yujian/platform-contracts";

export interface RtcTelemetryPersistence {
  append(sample: RtcQualitySampleV1): Promise<void>;
  summarize(scope: PlatformScopeV1, windowMs?: number): Promise<RtcQualitySummaryV1>;
}

export interface RtcTelemetrySqlResult<Row extends object> { rows: readonly Row[]; }
export interface RtcTelemetrySqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<RtcTelemetrySqlResult<Row>>;
}

function numeric(row: Record<string, unknown>, field: string, fallback = 0): number {
  const value = row[field];
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid RTC telemetry aggregate ${field}`);
  return parsed;
}

/** PostgreSQL telemetry sink; raw samples are append-only and summaries are calculated server-side. */
export class PostgresRtcTelemetryPersistence implements RtcTelemetryPersistence {
  constructor(private readonly pool: RtcTelemetrySqlPool) {}

  async append(sample: RtcQualitySampleV1): Promise<void> {
    await this.pool.query(
      `INSERT INTO rtc_quality_samples
       (sample_id, tenant_id, project_id, environment_id, node_id, room_name, participant_identity, captured_at,
        rtt_ms, jitter_ms, packets_lost, packets_sent, bitrate_kbps, audio_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (sample_id) DO NOTHING`,
      [sample.sampleId, sample.tenantId, sample.projectId, sample.environmentId, sample.nodeId, sample.roomName, sample.participantIdentity, sample.capturedAt, sample.rttMs ?? null, sample.jitterMs ?? null, sample.packetsLost ?? null, sample.packetsSent ?? null, sample.bitrateKbps ?? null, sample.audioLevel ?? null],
    );
  }

  async summarize(scope: PlatformScopeV1, windowMs = 300_000): Promise<RtcQualitySummaryV1> {
    if (!Number.isInteger(windowMs) || windowMs < 60_000 || windowMs > 86_400_000) throw new RangeError("telemetry window must be 60000-86400000ms");
    const end = new Date();
    const start = new Date(end.getTime() - windowMs);
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT count(*)::int AS sample_count,
              COALESCE(sum(packets_lost), 0) AS packets_lost,
              COALESCE(sum(packets_sent), 0) AS packets_sent,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY rtt_ms) AS p50_rtt_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY rtt_ms) AS p95_rtt_ms,
              percentile_cont(0.99) WITHIN GROUP (ORDER BY rtt_ms) AS p99_rtt_ms,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY jitter_ms) AS p50_jitter_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY jitter_ms) AS p95_jitter_ms,
              percentile_cont(0.99) WITHIN GROUP (ORDER BY jitter_ms) AS p99_jitter_ms,
              avg(bitrate_kbps) AS average_bitrate_kbps
         FROM rtc_quality_samples
        WHERE tenant_id = $1 AND project_id = $2 AND environment_id = $3
          AND captured_at >= $4 AND captured_at < $5`,
      [scope.tenantId, scope.projectId, scope.environmentId, start.toISOString(), end.toISOString()],
    );
    const row = result.rows[0] ?? {};
    const packetsLost = numeric(row, "packets_lost");
    const packetsSent = numeric(row, "packets_sent");
    const p50RttMs = row.p50_rtt_ms === null || row.p50_rtt_ms === undefined ? undefined : numeric(row, "p50_rtt_ms");
    const p95RttMs = row.p95_rtt_ms === null || row.p95_rtt_ms === undefined ? undefined : numeric(row, "p95_rtt_ms");
    const p99RttMs = row.p99_rtt_ms === null || row.p99_rtt_ms === undefined ? undefined : numeric(row, "p99_rtt_ms");
    const p50JitterMs = row.p50_jitter_ms === null || row.p50_jitter_ms === undefined ? undefined : numeric(row, "p50_jitter_ms");
    const p95JitterMs = row.p95_jitter_ms === null || row.p95_jitter_ms === undefined ? undefined : numeric(row, "p95_jitter_ms");
    const p99JitterMs = row.p99_jitter_ms === null || row.p99_jitter_ms === undefined ? undefined : numeric(row, "p99_jitter_ms");
    const averageBitrateKbps = row.average_bitrate_kbps === null || row.average_bitrate_kbps === undefined ? undefined : numeric(row, "average_bitrate_kbps");
    return {
      environmentId: scope.environmentId,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      sampleCount: Math.trunc(numeric(row, "sample_count")),
      packetLossRate: packetsLost + packetsSent === 0 ? 0 : packetsLost / (packetsLost + packetsSent),
      ...(p50RttMs === undefined ? {} : { p50RttMs }),
      ...(p95RttMs === undefined ? {} : { p95RttMs }),
      ...(p99RttMs === undefined ? {} : { p99RttMs }),
      ...(p50JitterMs === undefined ? {} : { p50JitterMs }),
      ...(p95JitterMs === undefined ? {} : { p95JitterMs }),
      ...(p99JitterMs === undefined ? {} : { p99JitterMs }),
      ...(averageBitrateKbps === undefined ? {} : { averageBitrateKbps }),
    };
  }
}
