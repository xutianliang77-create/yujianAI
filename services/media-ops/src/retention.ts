import type { EgressJobV1 } from "@yujian/platform-contracts";
import { MediaOpsControl } from "./control.js";

export interface MediaObjectDeletionProvider {
  deleteObject(objectUri: string): Promise<{ evidenceUri: string }>;
}

export interface MediaOpsBackgroundWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface MediaRetentionWorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown, egress?: EgressJobV1) => void;
}

/** Deletes expired egress objects exactly once from the control-plane perspective. */
export class MediaRetentionWorker implements MediaOpsBackgroundWorker {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly onError: (error: unknown, egress?: EgressJobV1) => void;
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly control: MediaOpsControl,
    private readonly storage: MediaObjectDeletionProvider,
    private readonly persist: () => Promise<void>,
    options: MediaRetentionWorkerOptions = {},
  ) {
    const pollIntervalMs = options.pollIntervalMs ?? 30_000;
    const batchSize = options.batchSize ?? 20;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1_000 || pollIntervalMs > 300_000) throw new RangeError("retention pollIntervalMs must be 1000-300000");
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new RangeError("retention batchSize must be 1-100");
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.onError = options.onError ?? (() => undefined);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let deleted = 0;
      try {
        deleted = await this.processBatch();
      } catch (error) {
        try { this.onError(error); } catch { /* observer failure cannot stop cleanup */ }
      }
      if (!this.running) break;
      await this.delay(deleted === 0 ? this.pollIntervalMs : 100);
    }
  }

  private async processBatch(): Promise<number> {
    let deleted = 0;
    for (const egress of this.control.listExpiredEgress().slice(0, this.batchSize)) {
      if (!this.running) break;
      try {
        const objectUri = egress.objectUri;
        if (objectUri === undefined) continue;
        const result = await this.storage.deleteObject(objectUri);
        if (typeof result.evidenceUri !== "string" || result.evidenceUri.length === 0) throw new Error("object deletion evidence URI is missing");
        this.control.markEgressDeleted(egress.egressId, result.evidenceUri);
        await this.persist();
        deleted += 1;
      } catch (error) {
        try { this.onError(error, egress); } catch { /* observer failure cannot stop cleanup */ }
      }
    }
    return deleted;
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.wake = undefined; resolve(); }, milliseconds);
      this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
    });
  }
}
