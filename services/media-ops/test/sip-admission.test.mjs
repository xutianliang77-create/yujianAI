import assert from "node:assert/strict";
import test from "node:test";
import { RedisSipAdmissionCoordinator } from "../dist/sip-admission.js";

test("SIP Redis admission keeps active lease until terminal completion", async () => {
  const calls = [];
  const coordinator = new RedisSipAdmissionCoordinator({ eval: async (script, keys, args) => { calls.push({ script, keys, args }); return 1; } }, () => Date.parse("2026-07-19T12:00:00.000Z"));
  const lease = await coordinator.reserve({ environmentId: "environment-a", trunkId: "trunk-a", callId: "call-a", maxConcurrentCalls: 2, maxCallsPerMinute: 10, expiresAt: "2026-07-19T13:00:00.000Z" });
  assert.ok(lease);
  assert.equal(calls[0].keys[0].includes("{environment-a:trunk-a}"), true);
  await lease.commit();
  assert.equal(calls.length, 1, "commit keeps the call in the active set");
  await lease.complete();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, ["call-a"]);
});
