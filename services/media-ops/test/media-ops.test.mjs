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
