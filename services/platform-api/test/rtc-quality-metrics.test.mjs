import assert from "node:assert/strict";
import test from "node:test";
import { PlatformMetrics, recordRtcQualityMetrics } from "../dist/index.js";

test("RTC quality metrics are low-cardinality and do not expose scoped identity", () => {
  const metrics = new PlatformMetrics();
  recordRtcQualityMetrics(metrics, {
    sampleId: "rtc-sample-1",
    tenantId: "tenant-secret",
    projectId: "project-secret",
    environmentId: "environment-secret",
    nodeId: "rtc-node-secret",
    roomName: "room-secret",
    participantIdentity: "participant-secret",
    capturedAt: "2026-07-19T00:00:00.000Z",
    rttMs: 42,
    jitterMs: 4,
    packetsLost: 1,
    packetsSent: 99,
    bitrateKbps: 512,
    audioLevel: 0.1,
  });
  const rendered = metrics.render();
  assert.match(rendered, /yujian_rtc_client_rtt_ms_bucket\{le="50"\} 1/u);
  assert.match(rendered, /yujian_rtc_client_packet_loss_ratio_count 1/u);
  for (const secret of ["tenant-secret", "room-secret", "participant-secret", "rtc-node-secret"]) {
    assert.equal(rendered.includes(secret), false);
  }
});

test("a histogram cannot silently change its bucket contract", () => {
  const metrics = new PlatformMetrics();
  metrics.observe("stable_metric", 1, {}, [1, 2]);
  assert.throws(() => metrics.observe("stable_metric", 1, {}, [1, 3]), /cannot change/u);
});
