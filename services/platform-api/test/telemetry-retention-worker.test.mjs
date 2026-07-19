import assert from "node:assert/strict";
import test from "node:test";
import { RtcTelemetryRetentionWorker } from "../dist/index.js";

test("RTC telemetry retention deletes a bounded batch using a server-side cutoff", async () => {
  const calls = [];
  const worker = new RtcTelemetryRetentionWorker({
    query: async (text, values) => { calls.push({ text, values }); return { rows: [{ sample_id: "sample-1" }] }; },
  }, { retentionDays: 7, batchSize: 500, clock: () => Date.parse("2026-07-19T00:00:00Z") });
  assert.equal(await worker.runOnce(), 1);
  assert.match(calls[0].text, /LIMIT \$2/u);
  assert.deepEqual(calls[0].values, ["2026-07-12T00:00:00.000Z", 500]);
});
