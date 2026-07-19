import type { SipQualitySummaryV1 } from "@yujian/platform-contracts";

export interface MediaQualityMetricsSink {
  increment(name: string, labels: Readonly<Record<string, string>>, value?: number): void;
  observe(name: string, value: number, labels: Readonly<Record<string, string>>): void;
}

function reason(value: string): string {
  if (value === "completed" || value === "local_hangup") return "completed";
  if (value === "cancelled") return "cancelled";
  if (value.includes("timeout")) return "timeout";
  if (value.includes("busy")) return "busy";
  if (value.includes("reject")) return "rejected";
  if (value.includes("provider") || value === "failed") return "provider_failure";
  return "other";
}

/** PDD/answer/DTMF metrics without number, call, room, tenant or environment labels. */
export class MediaQualityMetricsObserver {
  private readonly allowedProviders: ReadonlySet<string>;
  constructor(private readonly sink: MediaQualityMetricsSink, allowedProviders: readonly string[] = []) {
    if (allowedProviders.some((value) => !/^[a-z][a-z0-9_-]{1,63}$/u.test(value))) throw new TypeError("media metric provider allowlist is invalid");
    this.allowedProviders = new Set(allowedProviders);
  }
  observe(value: SipQualitySummaryV1): void {
    const provider = this.allowedProviders.has(value.providerId) ? value.providerId : "other";
    const labels = { provider, answered: String(value.answered), terminal_reason: reason(value.terminalReasonCode) };
    this.sink.increment("yujian_sip_calls_total", labels);
    this.sink.observe("yujian_sip_post_dial_delay_ms", value.postDialDelayMs, { provider, answered: String(value.answered) });
    if (value.answered) this.sink.observe("yujian_sip_connected_duration_ms", value.connectedDurationMs, { provider });
    if (value.dtmfAttempted) this.sink.increment("yujian_sip_dtmf_attempts_total", { provider });
  }
}
