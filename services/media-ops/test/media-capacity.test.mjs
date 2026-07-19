import assert from "node:assert/strict";
import test from "node:test";
import { RedisMediaCapacityCoordinator } from "../dist/media-capacity.js";

test("media capacity remains leased until a terminal provider state", async () => {
  const calls = [];
  const coordinator = new RedisMediaCapacityCoordinator({ eval: async (script, keys, args) => { calls.push({ script, keys, args }); return 1; } }, () => Date.parse("2026-07-19T12:00:00.000Z"));
  const lease = await coordinator.reserve({ environmentId: "environment-a", kind: "egress", resourceId: "egress-a", limit: 2, expiresAt: "2026-07-20T11:59:00.000Z" });
  assert.ok(lease);
  assert.equal(calls[0].keys[0], "yujian:media:capacity:{environment-a}:egress");
  await lease.commit();
  assert.equal(calls.length, 1);
  await lease.complete();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, ["egress-a"]);
});
