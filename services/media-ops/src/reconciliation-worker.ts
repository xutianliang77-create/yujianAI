import type { MediaProviderUsageV1 } from "@yujian/platform-contracts";
import type { MediaOpsBackgroundWorker } from "./retention.js";
import type { MediaAccountingSqlPool } from "./accounting.js";
import { PostgresMediaAccounting } from "./accounting.js";

export interface MediaProviderUsageSource {
  readonly sourceId: string;
  fetch(cursor: string | undefined, limit: number): Promise<{ records: readonly MediaProviderUsageV1[]; nextCursor?: string }>;
}

export interface MediaPlatformQuantityProvider {
  quantity(record: MediaProviderUsageV1): Promise<number>;
}

export interface MediaReconciliationCheckpointStore {
  load(sourceId: string): Promise<string | undefined>;
  save(sourceId: string, expectedCursor: string | undefined, nextCursor: string): Promise<void>;
}

type CheckpointRow = { cursor_value: string; version: string | number };

export class PostgresMediaReconciliationCheckpointStore implements MediaReconciliationCheckpointStore {
  private readonly versions = new Map<string, number>();
  constructor(private readonly pool: MediaAccountingSqlPool) {}

  async load(sourceId: string): Promise<string | undefined> {
    const result = await this.pool.query<CheckpointRow>("SELECT cursor_value, version FROM media_reconciliation_checkpoints WHERE source_id = $1", [sourceId]);
    const row = result.rows[0];
    if (row === undefined) { this.versions.set(sourceId, 0); return undefined; }
    const version = Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("media reconciliation checkpoint version is invalid");
    this.versions.set(sourceId, version);
    return row.cursor_value;
  }

  async save(sourceId: string, expectedCursor: string | undefined, nextCursor: string): Promise<void> {
    const version = this.versions.get(sourceId) ?? 0;
    const result = await this.pool.query<{ version: string | number }>(
      `INSERT INTO media_reconciliation_checkpoints (source_id, cursor_value, version, updated_at)
       VALUES ($1,$2,1,now())
       ON CONFLICT (source_id) DO UPDATE SET cursor_value = EXCLUDED.cursor_value,
         version = media_reconciliation_checkpoints.version + 1, updated_at = now()
       WHERE media_reconciliation_checkpoints.version = $3 AND media_reconciliation_checkpoints.cursor_value = $4
       RETURNING version`,
      [sourceId, nextCursor, version, expectedCursor ?? ""],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("media reconciliation checkpoint conflict");
    this.versions.set(sourceId, Number(row.version));
  }
}

/** Pulls provider usage pages, appends immutable records, reconciles quantity, then CAS-advances the cursor. */
export class MediaUsageReconciliationWorker implements MediaOpsBackgroundWorker {
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly source: MediaProviderUsageSource,
    private readonly quantities: MediaPlatformQuantityProvider,
    private readonly accounting: PostgresMediaAccounting,
    private readonly checkpoints: MediaReconciliationCheckpointStore,
    private readonly options: { pollIntervalMs?: number; batchSize?: number; onError?: (error: unknown) => void } = {},
  ) {
    const interval = options.pollIntervalMs ?? 60_000;
    const size = options.batchSize ?? 100;
    if (!Number.isInteger(interval) || interval < 1_000 || interval > 300_000) throw new RangeError("media reconciliation interval is invalid");
    if (!Number.isInteger(size) || size < 1 || size > 1_000) throw new RangeError("media reconciliation batch size is invalid");
  }

  start(): void { if (this.running) return; this.running = true; this.loopPromise = this.loop(); }
  async stop(): Promise<void> { this.running = false; this.wake?.(); await this.loopPromise; this.loopPromise = undefined; }

  private async loop(): Promise<void> {
    let cursor = await this.checkpoints.load(this.source.sourceId);
    while (this.running) {
      try {
        const page = await this.source.fetch(cursor, this.options.batchSize ?? 100);
        for (const record of page.records) {
          await this.accounting.appendUsage(record);
          await this.accounting.reconcile(record, await this.quantities.quantity(record));
        }
        const nextCursor = page.nextCursor;
        const advanced = nextCursor !== undefined && nextCursor !== cursor;
        if (advanced) {
          await this.checkpoints.save(this.source.sourceId, cursor, nextCursor);
          cursor = nextCursor;
        }
        await this.delay(page.records.length === 0 || !advanced ? this.options.pollIntervalMs ?? 60_000 : 100);
      } catch (error) {
        try { this.options.onError?.(error); } catch { /* Observer failures are isolated. */ }
        await this.delay(this.options.pollIntervalMs ?? 60_000);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.wake = undefined; resolve(); }, ms);
      this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
    });
  }
}
