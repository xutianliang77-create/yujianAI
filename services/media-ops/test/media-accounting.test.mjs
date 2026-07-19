import assert from "node:assert/strict";
import test from "node:test";
import { PostgresMediaAccounting, summarizeSipQuality } from "../dist/accounting.js";

const usage = {
  providerRecordId: "record-a", providerId: "provider-a", environmentId: "environment-a",
  resourceKind: "sip_call", providerResourceId: "provider-call-a", usageType: "duration_ms",
  quantity: 60_000, unit: "ms", amountMicros: 42_000, currency: "CNY",
  periodStartedAt: "2026-07-19T12:00:00.000Z", periodEndedAt: "2026-07-19T12:01:00.000Z",
  sourceDigest: "sha256:" + "a".repeat(64),
};

test("provider usage append and reconciliation remain numeric and immutable", async () => {
  const queries = [];
  const pool = { query: async (text, values) => { queries.push({ text, values }); return { rows: text.startsWith("INSERT INTO media_provider_usage") ? [{ source_digest: usage.sourceDigest }] : [{}] }; } };
  const accounting = new PostgresMediaAccounting(pool, () => new Date("2026-07-19T12:02:00.000Z"));
  await accounting.appendUsage(usage);
  const reconciliation = await accounting.reconcile(usage, 59_000);
  assert.equal(reconciliation.variance, 1_000);
  assert.equal(reconciliation.status, "variance");
  assert.equal(queries.some((entry) => entry.text.includes("media_provider_usage")), true);
  assert.equal(queries.some((entry) => entry.text.includes("media_usage_reconciliations")), true);
});

test("provider usage replay with a different digest is rejected", async () => {
  let queryIndex = 0;
  const pool = { query: async () => ({ rows: queryIndex++ === 0 ? [] : [{ source_digest: "sha256:" + "b".repeat(64) }] }) };
  await assert.rejects(() => new PostgresMediaAccounting(pool).appendUsage(usage), /idempotency conflict/u);
});

test("SIP quality derives PDD and connected duration without storing phone or DTMF", () => {
  const summary = summarizeSipQuality({
    callId: "call-a", environmentId: "environment-a", direction: "outbound", roomName: "room",
    remoteNumberHash: "a".repeat(64), dtmfSequenceHash: "b".repeat(64), status: "completed",
    providerCallId: "provider-call-a", answeredAt: "2026-07-19T12:00:03.000Z", endedAt: "2026-07-19T12:01:00.000Z",
    terminalReasonCode: "remote_hangup", idempotencyKeyHash: "c".repeat(64),
    createdAt: "2026-07-19T12:00:00.000Z", updatedAt: "2026-07-19T12:01:00.000Z",
  }, "provider-a", new Date("2026-07-19T12:01:01.000Z"));
  assert.equal(summary.postDialDelayMs, 3_000);
  assert.equal(summary.connectedDurationMs, 57_000);
  assert.equal(summary.dtmfAttempted, true);
});
