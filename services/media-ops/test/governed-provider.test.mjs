import assert from "node:assert/strict";
import test from "node:test";
import { GovernedMediaOpsProvider, MediaOperationAdmissionError, PolicyMediaOperationAdmission } from "../dist/governed-provider.js";

const call = { callId: "call-a", environmentId: "environment-a", roomName: "room", direction: "outbound", remoteNumber: "+8613800138000", idempotencyKey: "idempotency-a" };

test("compliance rejection prevents any SIP provider side effect", async () => {
  let invoked = false;
  const admission = new PolicyMediaOperationAdmission(
    { verify: async () => ({ approved: false, receiptDigest: "sha256:" + "0".repeat(64), expiresAt: "2099-01-01T00:00:00.000Z" }) },
    { authorize: async () => ({ allowed: true, decisionCode: "allow" }) },
    { reserve: async () => ({ commit: async () => undefined, release: async () => undefined }) },
    { dailyLimitMicros: 1_000, outboundReservationMicros: 100 },
  );
  const provider = new GovernedMediaOpsProvider({
    createIngress: async () => ({ providerIngressId: "unused" }), createEgress: async () => ({ providerEgressId: "unused" }),
    requestSipCall: async () => { invoked = true; return { providerCallId: "provider-call" }; },
    transferSipCall: async () => undefined, hangupSipCall: async () => undefined,
  }, admission);
  await assert.rejects(() => provider.requestSipCall(call), (error) => error instanceof MediaOperationAdmissionError && error.code === "COMPLIANCE");
  assert.equal(invoked, false);
});

test("provider failure releases its budget reservation", async () => {
  let released = 0;
  const provider = new GovernedMediaOpsProvider({
    createIngress: async () => ({ providerIngressId: "unused" }), createEgress: async () => ({ providerEgressId: "unused" }),
    requestSipCall: async () => { throw new Error("provider down"); }, transferSipCall: async () => undefined, hangupSipCall: async () => undefined,
  }, {
    authorizeSipCall: async () => ({ commit: async () => undefined, release: async () => { released += 1; } }),
    authorizeSipTransfer: async () => ({ commit: async () => undefined, release: async () => undefined }),
    authorizeSipHangup: async () => ({ commit: async () => undefined, release: async () => undefined }),
  });
  await assert.rejects(() => provider.requestSipCall(call), /provider down/u);
  assert.equal(released, 1);
});

test("successful outbound keeps concurrency until the call reaches a terminal state", async () => {
  let completed = 0;
  const provider = new GovernedMediaOpsProvider({
    createIngress: async () => ({ providerIngressId: "unused" }), createEgress: async () => ({ providerEgressId: "unused" }),
    requestSipCall: async (input) => ({ providerCallId: `provider-${input.sipTrunkId}` }), transferSipCall: async () => undefined, hangupSipCall: async () => undefined,
  }, {
    authorizeSipCall: async () => ({ commit: async () => undefined, release: async () => undefined, complete: async () => { completed += 1; }, resolvedSipTrunkId: "trunk-resolved" }),
    authorizeSipTransfer: async () => ({ commit: async () => undefined, release: async () => undefined }),
    authorizeSipHangup: async () => ({ commit: async () => undefined, release: async () => undefined }),
  });
  assert.equal((await provider.requestSipCall(call)).providerCallId, "provider-trunk-resolved");
  assert.equal(completed, 0);
  await provider.completeSipCall({ callId: call.callId, environmentId: call.environmentId });
  assert.equal(completed, 1);
});
