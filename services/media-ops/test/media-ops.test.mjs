import assert from "node:assert/strict";
import test from "node:test";
import { MediaOpsControl, MediaOpsError } from "../dist/control.js";

test("media idempotency is scoped by environment", () => {
  const control = new MediaOpsControl();
  const first = control.createIngress({
    environmentId: "environment-a",
    roomName: "room",
    inputType: "whip",
    idempotencyKey: "same-key",
  });
  const replay = control.createIngress({
    environmentId: "environment-a",
    roomName: "room",
    inputType: "whip",
    idempotencyKey: "same-key",
  });
  const otherEnvironment = control.createIngress({
    environmentId: "environment-b",
    roomName: "room",
    inputType: "whip",
    idempotencyKey: "same-key",
  });
  assert.equal(replay.ingressId, first.ingressId);
  assert.notEqual(otherEnvironment.ingressId, first.ingressId);
});

test("media state transitions reject terminal state rewrites", () => {
  const control = new MediaOpsControl();
  const job = control.createEgress({
    environmentId: "environment-a",
    roomName: "room",
    outputType: "mp4",
    idempotencyKey: "egress-key",
  });
  control.transition("egress", job.egressId, "starting");
  control.transition("egress", job.egressId, "failed");
  assert.throws(
    () => control.transition("egress", job.egressId, "active"),
    (error) => error instanceof MediaOpsError && error.code === "CONFLICT",
  );
});

test("media input validation rejects unsupported provider types", () => {
  const control = new MediaOpsControl();
  assert.throws(
    () => control.createIngress({
      environmentId: "environment-a",
      roomName: "room",
      inputType: "invalid",
      idempotencyKey: "ingress-key",
    }),
    (error) => error instanceof MediaOpsError && error.code === "CONFLICT",
  );
});

test("media snapshot requires paired egress deletion evidence", () => {
  const control = new MediaOpsControl();
  const job = control.createEgress({
    environmentId: "environment-a",
    roomName: "room",
    outputType: "mp4",
    idempotencyKey: "snapshot-key",
  });
  assert.throws(
    () => control.restore({
      ...control.snapshot(),
      egress: [{ ...job, status: "completed", deletedAt: "2026-07-17T00:00:00.000Z" }],
    }),
    /deletion evidence/u,
  );
  assert.throws(
    () => control.restore({
      ...control.snapshot(),
      egress: [{ ...job, status: "completed", retentionExpiresAt: "not-a-date" }],
    }),
    /ISO date/u,
  );
});

test("media snapshots contain hashes rather than raw idempotency, URL, phone or DTMF values", () => {
  const control = new MediaOpsControl({ sipEnabled: true });
  control.createIngress({
    environmentId: "environment-a",
    roomName: "room",
    inputType: "url",
    sourceUrl: "https://media.example.cn/input.m3u8?signature=private",
    idempotencyKey: "raw-ingress-key",
  });
  control.requestSipCall({
    environmentId: "environment-a",
    roomName: "room",
    direction: "outbound",
    remoteNumber: "+8613800138000",
    dtmf: "1234#",
    idempotencyKey: "raw-sip-key",
  });
  const serialized = JSON.stringify(control.snapshot());
  for (const secret of ["raw-ingress-key", "raw-sip-key", "+8613800138000", "1234#", "signature=private"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("URL ingress rejects local and non-HTTPS fetch targets", () => {
  const control = new MediaOpsControl();
  for (const sourceUrl of ["http://media.example.cn/input", "https://127.0.0.1/input", "https://user:pass@media.example.cn/input"]) {
    assert.throws(
      () => control.createIngress({ environmentId: "environment-a", roomName: "room", inputType: "url", sourceUrl, idempotencyKey: sourceUrl }),
      (error) => error instanceof MediaOpsError && error.code === "CONFLICT",
    );
  }
});

test("authenticated provider adoption may advance an inbound SIP call directly to active", () => {
  const control = new MediaOpsControl({ sipEnabled: true });
  const call = control.requestSipCall({ environmentId: "environment-a", roomName: "room", direction: "inbound", remoteNumber: "anonymous", idempotencyKey: "inbound" });
  const active = control.applyProviderStatus("call", call.callId, { status: "active", providerId: "provider-call", providerName: "carrier_a", participantIdentity: "sip-participant", providerSequence: 1, occurredAt: "2026-07-19T12:00:00.000Z", attestationDigest: "sha256:" + "a".repeat(64) });
  assert.equal(active.status, "active");
  assert.equal(active.participantIdentity, "sip-participant");
  assert.equal(typeof active.answeredAt, "string");
});

test("stale provider sequences cannot roll back media state", () => {
  const control = new MediaOpsControl();
  const job = control.createIngress({ environmentId: "environment-a", roomName: "room", inputType: "whip", idempotencyKey: "sequence" });
  control.applyProviderStatus("ingress", job.ingressId, { status: "active", providerId: "provider-ingress", providerName: "ingress_a", providerSequence: 2, occurredAt: "2026-07-19T12:00:02.000Z", attestationDigest: "sha256:" + "b".repeat(64) });
  const stale = control.applyProviderStatus("ingress", job.ingressId, { status: "starting", providerId: "provider-ingress", providerName: "ingress_a", providerSequence: 1, occurredAt: "2026-07-19T12:00:01.000Z", attestationDigest: "sha256:" + "c".repeat(64) });
  assert.equal(stale.status, "active");
  assert.equal(stale.providerSequence, 2);
});
