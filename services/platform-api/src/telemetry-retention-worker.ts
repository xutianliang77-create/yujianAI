import type { RtcTelemetrySqlPool } from "./telemetry-persistence.js";

export interface RtcTelemetryRetentionOptions {
  retentionDays?: number;
  intervalMs?: number;
  batchSize?: number;
  clock?: () => number;
  onError?: (error: unknown) => void;
}

export class RtcTelemetryRetentionWorker {
  private readonly retentionMs: number;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly clock: () => number;
  private timer?: NodeJS.Timeout;
  private active: Promise<void> | undefined;
  private stopping = false;
  private readonly onError: (error: unknown) => void;

  constructor(private readonly pool: RtcTelemetrySqlPool, options: RtcTelemetryRetentionOptions = {}) {
    const retentionDays = options.retentionDays ?? 7;
    this.intervalMs = options.intervalMs ?? 3_600_000;
    this.batchSize = options.batchSize ?? 5_000;
    this.clock = options.clock ?? Date.now;
    this.onError = options.onError ?? (() => undefined);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) throw new RangeError("RTC telemetry retention must be 1-90 days");
    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 60_000 || this.intervalMs > 86_400_000) throw new RangeError("RTC telemetry retention interval must be 1 minute-1 day");
    if (!Number.isInteger(this.batchSize) || this.batchSize < 100 || this.batchSize > 50_000) throw new RangeError("RTC telemetry retention batch size must be 100-50000");
    this.retentionMs = retentionDays * 86_400_000;
  }

  async runOnce(): Promise<number> {
    const cutoff = new Date(this.clock() - this.retentionMs).toISOString();
    const result = await this.pool.query<{ sample_id: string }>(
      `WITH expired AS (
         SELECT sample_id FROM rtc_quality_samples
          WHERE captured_at < $1
          ORDER BY captured_at
          LIMIT $2
       )
       DELETE FROM rtc_quality_samples AS samples
       USING expired
       WHERE samples.sample_id = expired.sample_id
       RETURNING samples.sample_id`,
      [cutoff, this.batchSize],
    );
    return result.rows.length;
  }

  start(): void {
    if (this.timer !== undefined || this.active !== undefined) return;
    this.stopping = false;
    const tick = (): void => {
      this.active = this.runOnce()
        .then(() => undefined)
        .catch((error: unknown) => this.onError(error))
        .finally(() => {
          this.active = undefined;
          if (!this.stopping) this.timer = setTimeout(tick, this.intervalMs);
        });
    };
    tick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    await this.active;
  }
}
