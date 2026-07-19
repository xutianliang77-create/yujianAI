import { parseRtcCapacityReport, type RtcCapacityReportV1, type RtcCapacityUsageV1 } from "@yujian/livekit-compat";
import type { RtcCapacityExporterConfig } from "./config.js";

export interface CapacityCollector { collect(): Promise<RtcCapacityUsageV1> }

const ZERO: RtcCapacityUsageV1 = { activeRooms: 0, activeParticipants: 0, activePublishers: 0, activeSubscriptions: 0, activeTracks: 0 };

export class RtcCapacityExporter {
  private sequence = Date.now() * 1_000;
  private draining = false;
  private lastUsage: RtcCapacityUsageV1 = ZERO;

  constructor(private readonly config: RtcCapacityExporterConfig, private readonly collector: CapacityCollector, private readonly clock: () => number = Date.now) {}

  setDraining(): void { this.draining = true; }

  async publish(): Promise<RtcCapacityReportV1> {
    const now = this.clock();
    let healthy = true;
    try { this.lastUsage = await this.collector.collect(); }
    catch { healthy = false; }
    const report = parseRtcCapacityReport({
      schemaVersion: 1,
      nodeId: this.config.nodeId,
      observedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.config.ttlMs).toISOString(),
      sequence: this.sequence++,
      healthy,
      draining: this.draining,
      source: "livekit-room-service-upper-bound",
      subscriptionAccounting: "participants-times-published-tracks-upper-bound",
      usage: this.lastUsage,
      limits: this.config.limits,
    });
    const response = await fetch(`${this.config.platformUrl}/internal/v1/rtc/capacity`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.credential}`, "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(Math.min(this.config.intervalMs, 5_000)),
    });
    if (!response.ok) throw new Error(`RTC capacity publish failed: HTTP ${response.status}`);
    return report;
  }
}
