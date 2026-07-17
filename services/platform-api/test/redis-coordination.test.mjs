import assert from "node:assert/strict";
import test from "node:test";
import { RedisLeaseStore } from "../dist/redis-coordination.js";

test("RedisLeaseStore releases only its own token and is idempotent", async () => {
  const values = new Map();
  const client = {
    async eval(script, keys, args) {
      const key = keys[0];
      const token = args[0];
      if (script.includes("'NX'")) {
        if (values.has(key)) return 0;
        values.set(key, token);
        return 1;
      }
      if (values.get(key) === token) {
        values.delete(key);
        return 1;
      }
      return 0;
    },
  };
  const leases = new RedisLeaseStore(client);
  const first = await leases.acquire("tenant-a:rate", 5_000, 1_000);
  assert.ok(first);
  assert.equal(first.expiresAt, new Date(6_000).toISOString());
  assert.equal(await leases.acquire("tenant-a:rate", 5_000), undefined);
  assert.equal(await first.release(), true);
  assert.equal(await first.release(), false);
  const second = await leases.acquire("tenant-a:rate", 5_000);
  assert.ok(second);
});

test("RedisLeaseStore rejects unsafe keys and ttl", async () => {
  const leases = new RedisLeaseStore({ eval: async () => 0 });
  await assert.rejects(() => leases.acquire("", 5_000), TypeError);
  await assert.rejects(() => leases.acquire("safe", 999), RangeError);
});
