import assert from "node:assert/strict";
import test from "node:test";
import { AccountingMediaLifecycleObserver } from "../dist/lifecycle-observer.js";

test("terminal SIP quality emits metrics only after first durable insert", async () => {
  const observed = [];
  let inserted = true;
  const observer = new AccountingMediaLifecycleObserver(
    { recordSipQuality: async () => { const result = inserted; inserted = false; return result; } },
    { observe: (value) => observed.push(value) },
  );
  const call = {
    callId: "call-a", environmentId: "environment-a", direction: "outbound", roomName: "room",
    remoteNumberHash: "a".repeat(64), status: "completed", providerName: "carrier_a",
    answeredAt: "2026-07-19T12:00:01.000Z", endedAt: "2026-07-19T12:00:10.000Z",
    idempotencyKeyHash: "b".repeat(64), createdAt: "2026-07-19T12:00:00.000Z", updatedAt: "2026-07-19T12:00:10.000Z",
  };
  await observer.onSipTerminal(call);
  await observer.onSipTerminal(call);
  assert.equal(observed.length, 1);
});
