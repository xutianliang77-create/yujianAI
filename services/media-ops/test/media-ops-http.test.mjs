import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { MediaOpsControl } from "../dist/control.js";
import { createMediaOpsServer } from "../dist/server.js";

const internalCredential = "i".repeat(32);
const providerCredential = "p".repeat(32);

test("inbound SIP is adopted only by the separate provider callback credential", async (context) => {
  let providerDialCount = 0;
  const provider = {
    createIngress: async () => ({ providerIngressId: "unused" }),
    createEgress: async () => ({ providerEgressId: "unused" }),
    requestSipCall: async () => { providerDialCount += 1; return { providerCallId: "unexpected" }; },
    transferSipCall: async () => undefined,
    hangupSipCall: async () => undefined,
  };
  const statusVerifier = { verify: async ({ edgeAttestation }) => {
    assert.equal(edgeAttestation, "signed-edge-attestation-0123456789");
    return { attestationDigest: "sha256:" + "a".repeat(64), providerSequence: 1, occurredAt: "2026-07-19T12:00:00.000Z", providerName: "carrier_a" };
  } };
  const server = createMediaOpsServer(internalCredential, new MediaOpsControl({ sipEnabled: true }), undefined, provider, undefined, providerCredential, statusVerifier);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address.port}`;
  const createdResponse = await fetch(`${base}/internal/v1/environments/environment-a/media/sip/calls`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "inbound-one", "x-yujian-internal-token": internalCredential },
    body: JSON.stringify({ direction: "inbound", roomName: "room", remoteNumber: "anonymous" }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).data;
  assert.equal(providerDialCount, 0);
  assert.equal(created.status, "requested");

  const rejected = await fetch(`${base}/internal/v1/environments/environment-a/media/sip/calls/${created.callId}:status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-yujian-provider-token": internalCredential },
    body: JSON.stringify({ status: "active", providerId: "provider-call" }),
  });
  assert.equal(rejected.status, 401);

  const adopted = await fetch(`${base}/internal/v1/environments/environment-a/media/sip/calls/${created.callId}:status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-yujian-provider-token": providerCredential, "x-yujian-edge-attestation": "signed-edge-attestation-0123456789" },
    body: JSON.stringify({ status: "active", providerId: "provider-call", participantIdentity: "sip-participant" }),
  });
  assert.equal(adopted.status, 200);
  assert.equal((await adopted.json()).data.status, "active");
});
