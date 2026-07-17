import { randomUUID } from "node:crypto";
import type {
  PlatformScopeV1,
  RtcQualitySampleV1,
  RtcQualitySummaryV1,
} from "@yujian/platform-contracts";

const MAX_SAMPLES = 50_000;

export class RtcTelemetryBuffer {
  private readonly samples: RtcQualitySampleV1[] = [];

  record(
    scope: PlatformScopeV1,
    input: Omit<RtcQualitySampleV1, "sampleId" | keyof PlatformScopeV1>,
  ): RtcQualitySampleV1 {
    if ([input.nodeId, input.roomName, input.participantIdentity].some((value) => value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value))) throw new TypeError("RTC telemetry identity fields are invalid");
    if (!Number.isFinite(Date.parse(input.capturedAt))) throw new TypeError("RTC telemetry capturedAt is invalid");
    for (const value of [input.rttMs, input.jitterMs, input.packetsLost, input.packetsSent, input.bitrateKbps, input.audioLevel]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new TypeError("RTC telemetry metrics must be finite non-negative numbers");
    }
    const sample: RtcQualitySampleV1 = {
      sampleId: `rtc-${randomUUID()}`,
      ...scope,
      ...input,
    };
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    return sample;
  }

  summarize(scope: PlatformScopeV1, windowMs = 300_000): RtcQualitySummaryV1 {
    const end = Date.now();
    const start = end - Math.max(60_000, Math.min(windowMs, 86_400_000));
    const samples = this.samples.filter((sample) =>
      sample.tenantId === scope.tenantId &&
      sample.projectId === scope.projectId &&
      sample.environmentId === scope.environmentId &&
      Date.parse(sample.capturedAt) >= start,
    );
    const percentile = (values: number[], quantile: number): number | undefined => {
      if (values.length === 0) return undefined;
      values.sort((a, b) => a - b);
      return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
    };
    const sent = samples.reduce((sum, sample) => sum + (sample.packetsSent ?? 0), 0);
    const lost = samples.reduce((sum, sample) => sum + (sample.packetsLost ?? 0), 0);
    const bitrates = samples.flatMap((sample) => sample.bitrateKbps === undefined ? [] : [sample.bitrateKbps]);
    const rtt = samples.flatMap((sample) => sample.rttMs === undefined ? [] : [sample.rttMs]);
    const jitter = samples.flatMap((sample) => sample.jitterMs === undefined ? [] : [sample.jitterMs]);
    const p50RttMs = percentile(rtt, 0.5);
    const p95RttMs = percentile(rtt, 0.95);
    const p99RttMs = percentile(rtt, 0.99);
    const p50JitterMs = percentile(jitter, 0.5);
    const p95JitterMs = percentile(jitter, 0.95);
    const p99JitterMs = percentile(jitter, 0.99);
    return {
      environmentId: scope.environmentId,
      windowStart: new Date(start).toISOString(),
      windowEnd: new Date(end).toISOString(),
      sampleCount: samples.length,
      packetLossRate: sent + lost === 0 ? 0 : lost / (sent + lost),
      ...(p50RttMs === undefined ? {} : { p50RttMs }),
      ...(p95RttMs === undefined ? {} : { p95RttMs }),
      ...(p99RttMs === undefined ? {} : { p99RttMs }),
      ...(p50JitterMs === undefined ? {} : { p50JitterMs }),
      ...(p95JitterMs === undefined ? {} : { p95JitterMs }),
      ...(p99JitterMs === undefined ? {} : { p99JitterMs }),
      ...(bitrates.length === 0 ? {} : { averageBitrateKbps: bitrates.reduce((sum, value) => sum + value, 0) / bitrates.length }),
    };
  }
}
