import assert from "node:assert/strict";
import test from "node:test";
import { RtcCapacityExporter } from "../dist/index.js";

test("exporter publishes healthy and draining reports without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return new Response("{}", { status: 202 }); };
  try {
    const exporter = new RtcCapacityExporter({
      nodeId: "rtc-node-1", livekitUrl: "http://127.0.0.1:7880", apiKey: "key", apiSecret: "secret",
      platformUrl: "http://platform.local", credential: "x".repeat(32), intervalMs: 5_000, ttlMs: 15_000,
      limits: { activeRooms: 10, activeParticipants: 100, activePublishers: 50, activeSubscriptions: 1000, activeTracks: 200 },
    }, { collect: async () => ({ activeRooms: 1, activeParticipants: 2, activePublishers: 1, activeSubscriptions: 4, activeTracks: 2 }) }, () => 1_750_000_000_000);
    await exporter.publish();
    exporter.setDraining();
    await exporter.publish();
    assert.equal(bodies[0].healthy, true);
    assert.equal(bodies[1].draining, true);
    assert.equal(JSON.stringify(bodies).includes("x".repeat(32)), false);
  } finally { globalThis.fetch = originalFetch; }
});
