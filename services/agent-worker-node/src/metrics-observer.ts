import type { AgentDispatchObservation, AgentDispatchObserver } from "./dispatch-runner.js";

export interface AgentDispatchMetricsSink {
  increment(name: string, labels?: Readonly<Record<string, string>>): void;
  observeDuration(name: string, durationMs: number, labels?: Readonly<Record<string, string>>): void;
}

/** Low-cardinality adapter for Prometheus/OTel sinks; trace IDs stay in traces, never metric labels. */
export class AgentDispatchMetricsObserver implements AgentDispatchObserver {
  constructor(private readonly sink: AgentDispatchMetricsSink) {}

  observe(observation: AgentDispatchObservation): void {
    const labels = { event: observation.event };
    this.sink.increment("yujian_agent_dispatch_events_total", labels);
    if (observation.durationMs !== undefined && Number.isFinite(observation.durationMs) && observation.durationMs >= 0) {
      this.sink.observeDuration("yujian_agent_dispatch_duration_ms", observation.durationMs, labels);
    }
    if (observation.error !== undefined) this.sink.increment("yujian_agent_dispatch_errors_total", labels);
  }
}
