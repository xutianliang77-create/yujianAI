import assert from "node:assert/strict";
import test from "node:test";
import { RedisMediaBudgetCoordinator } from "../dist/media-budget.js";

test("Redis media budget leases bind commit and release to a unique owner token", async () => {
  const calls = [];
  const client = { eval: async (script, keys, args) => { calls.push({ script, keys, args }); return 1; } };
  const budget = new RedisMediaBudgetCoordinator(client, () => Date.parse("2026-07-19T12:00:00.000Z"));
  const lease = await budget.reserve({ environmentId: "environment-a", reservationId: "reservation-a", amountMicros: 100, limitMicros: 1_000, expiresAt: "2026-07-19T12:01:00.000Z" });
  assert.ok(lease);
  assert.equal(calls[0].keys[0].includes("{environment-a}"), true);
  assert.match(calls[0].args[6], /^[0-9a-f-]{36}$/u);
  await lease.commit();
  assert.deepEqual(calls[1].args, ["reservation-a", calls[0].args[6]]);
  await lease.release();
  assert.equal(calls.length, 2, "a terminal lease cannot be released again");
});

test("Redis media budget fails closed when the reservation is not acquired", async () => {
  const budget = new RedisMediaBudgetCoordinator({ eval: async () => 0 }, () => Date.parse("2026-07-19T12:00:00.000Z"));
  assert.equal(await budget.reserve({ environmentId: "environment-a", reservationId: "reservation-a", amountMicros: 100, limitMicros: 1_000, expiresAt: "2026-07-19T12:01:00.000Z" }), undefined);
});
