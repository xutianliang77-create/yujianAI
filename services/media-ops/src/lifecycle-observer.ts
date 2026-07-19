import type { SipCallV1 } from "@yujian/platform-contracts";
import { PostgresMediaAccounting, summarizeSipQuality } from "./accounting.js";
import { MediaQualityMetricsObserver } from "./quality-metrics.js";

export interface MediaLifecycleObserver {
  onSipTerminal(call: SipCallV1): Promise<void>;
}

/** Persists one terminal quality summary before emitting low-cardinality metrics. */
export class AccountingMediaLifecycleObserver implements MediaLifecycleObserver {
  constructor(private readonly accounting: PostgresMediaAccounting, private readonly metrics: MediaQualityMetricsObserver) {}

  async onSipTerminal(call: SipCallV1): Promise<void> {
    if (call.providerName === undefined) throw new Error("terminal SIP call is missing verified provider name");
    const summary = summarizeSipQuality(call, call.providerName);
    if (await this.accounting.recordSipQuality(summary)) this.metrics.observe(summary);
  }
}
