import type { RtcQualitySampleV1 } from "@yujian/platform-contracts";
import type { PlatformMetrics } from "./metrics.js";

const RTT_BUCKETS = [10, 25, 50, 100, 200, 300, 500, 1_000, 2_000, 5_000] as const;
const JITTER_BUCKETS = [1, 2, 5, 10, 20, 30, 50, 100, 250, 500] as const;
const BITRATE_BUCKETS = [32, 64, 128, 256, 512, 1_000, 2_500, 5_000, 10_000, 25_000] as const;
const LOSS_BUCKETS = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] as const;
const AUDIO_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] as const;

/** Export only global low-cardinality quality series; scoped identities remain in PostgreSQL. */
export function recordRtcQualityMetrics(metrics: PlatformMetrics, sample: RtcQualitySampleV1): void {
  metrics.increment("yujian_rtc_client_quality_samples_total");
  if (sample.rttMs !== undefined) metrics.observe("yujian_rtc_client_rtt_ms", sample.rttMs, {}, RTT_BUCKETS);
  if (sample.jitterMs !== undefined) metrics.observe("yujian_rtc_client_jitter_ms", sample.jitterMs, {}, JITTER_BUCKETS);
  if (sample.bitrateKbps !== undefined) metrics.observe("yujian_rtc_client_bitrate_kbps", sample.bitrateKbps, {}, BITRATE_BUCKETS);
  if (sample.audioLevel !== undefined) metrics.observe("yujian_rtc_client_audio_level", sample.audioLevel, {}, AUDIO_BUCKETS);
  const packetsLost = sample.packetsLost ?? 0;
  const packetsSent = sample.packetsSent ?? 0;
  if (packetsLost + packetsSent > 0) {
    metrics.observe("yujian_rtc_client_packet_loss_ratio", packetsLost / (packetsLost + packetsSent), {}, LOSS_BUCKETS);
  }
}
