import type { ProviderInvocationObservation, ProviderInvocationObserver } from "./index.js";

export interface ProviderMetricsSink {
  increment(name: string, labels: Readonly<Record<string, string>>, value?: number): void;
  observe(name: string, value: number, labels: Readonly<Record<string, string>>): void;
}

/** Low-cardinality metrics only: trace, tenant, deployment and pricing version are intentionally excluded. */
export class ProviderMetricsObserver implements ProviderInvocationObserver {
  constructor(private readonly sink: ProviderMetricsSink) {}

  observe(value: ProviderInvocationObservation): void {
    const labels = { provider: value.providerId, capability: value.capability, outcome: value.outcome };
    this.sink.increment("yujian_provider_invocations_total", labels);
    this.sink.observe("yujian_provider_duration_ms", value.durationMs, labels);
    if (value.usage !== undefined) {
      this.sink.increment("yujian_provider_input_text_units_total", { provider: value.providerId, capability: value.capability }, value.usage.inputTextUnits);
      this.sink.increment("yujian_provider_output_text_units_total", { provider: value.providerId, capability: value.capability }, value.usage.outputTextUnits);
      this.sink.increment("yujian_provider_audio_ms_total", { provider: value.providerId, capability: value.capability, direction: "input" }, value.usage.inputAudioMs);
      this.sink.increment("yujian_provider_audio_ms_total", { provider: value.providerId, capability: value.capability, direction: "output" }, value.usage.outputAudioMs);
      this.sink.increment("yujian_provider_image_units_total", { provider: value.providerId, capability: value.capability }, value.usage.imageUnits);
    }
    if (value.cost !== undefined) {
      this.sink.increment("yujian_provider_cost_micros_total", { provider: value.providerId, capability: value.capability, currency: value.cost.currency }, value.cost.amountMicros);
    }
  }
}

export class CompositeProviderInvocationObserver implements ProviderInvocationObserver {
  constructor(private readonly observers: readonly ProviderInvocationObserver[]) {
    if (observers.length === 0 || observers.length > 16) throw new RangeError("provider observer list must contain 1-16 entries");
  }

  async observe(value: ProviderInvocationObservation): Promise<void> {
    const results = await Promise.allSettled(this.observers.map((observer) => observer.observe(value)));
    if (results.every((result) => result.status === "rejected")) throw new Error("all provider observers failed");
  }
}
