import assert from "node:assert/strict";
import test from "node:test";
import {
  FixedProviderPricing,
  HttpJsonProvider,
  ObservedProviderAdapter,
  ProviderHttpError,
} from "../dist/index.js";

const capability = { providerId: "provider-a", capability: "llm", regions: ["cn-north"], supportsStreaming: false, status: "healthy" };
const context = {
  tenantId: "tenant-a", environmentId: "env-a", deploymentId: "deployment-a", dispatchId: "dispatch-a",
  traceId: "trace-a", deadlineAt: new Date(Date.now() + 10_000).toISOString(), idempotencyKey: "idem-a",
};

test("HTTP provider resolves credentials for one invocation and attributes numeric usage", async () => {
  let released = false;
  const adapter = new HttpJsonProvider(capability, {
    endpoint: "https://provider.example/v1/chat",
    credentialProvider: { resolve: async () => ({ headers: { authorization: "Bearer short-lived-value" }, expiresAt: new Date(Date.now() + 5_000).toISOString(), release: () => { released = true; } }) },
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.authorization, "Bearer short-lived-value");
      return new Response(JSON.stringify({ usage: { input: 2, output: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const observations = [];
  const pricing = new FixedProviderPricing("CNY", "price-2026-07", { inputTextUnitMicros: 2, outputTextUnitMicros: 3, inputAudioMillisecondMicros: 0, outputAudioMillisecondMicros: 0, imageUnitMicros: 0 });
  const observed = new ObservedProviderAdapter(adapter, { observe: (value) => observations.push(value) }, {
    extractUsage: () => ({ inputTextUnits: 2, outputTextUnits: 3, inputAudioMs: 0, outputAudioMs: 0, imageUnits: 0 }),
    attributeCost: (usage) => pricing.attribute(usage),
  });
  await observed.invoke({ prompt: "not-observed" }, context, new AbortController().signal);
  assert.equal(released, true);
  assert.equal(observations[0].cost.amountMicros, 13);
  assert.equal(JSON.stringify(observations).includes("not-observed"), false);
});

test("static secret headers and credential-bearing endpoints are rejected", () => {
  assert.throws(() => new HttpJsonProvider(capability, { endpoint: "https://provider.example/v1", headers: { authorization: "Bearer secret" } }));
  assert.throws(() => new HttpJsonProvider(capability, { endpoint: "https://user:pass@provider.example/v1" }));
  assert.ok(new ProviderHttpError("NETWORK_ERROR", undefined, true).retryable);
});
