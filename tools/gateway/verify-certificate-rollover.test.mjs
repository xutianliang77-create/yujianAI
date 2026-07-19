import assert from "node:assert/strict";
import test from "node:test";
import { parseCertificateRolloverPlan, validateCertificateRollover } from "./verify-certificate-rollover.mjs";

const now = Date.parse("2026-07-19T00:00:00Z");
const currentFingerprint = `sha256:${"1".repeat(64)}`;
const nextFingerprint = `sha256:${"2".repeat(64)}`;
const plan = parseCertificateRolloverPlan({
  schemaVersion: 1, taskId: "M3-03-CERTIFICATE-ROLLOVER", owner: "sre-owner", hostnames: ["api.example.cn"],
  current: { certificatePath: "/current.crt", sha256Fingerprint: currentFingerprint },
  next: { certificatePath: "/next.crt", sha256Fingerprint: nextFingerprint },
  activateAt: "2026-07-27T00:00:00Z", rollbackUntil: "2026-07-28T00:00:00Z",
  minimumCurrentRemainingHours: 168, privateKeyReadRequired: false,
});
const certificate = (fingerprint, from, to) => ({ fingerprint, validFromMs: Date.parse(from), validToMs: Date.parse(to), hostnames: new Set(["api.example.cn"]) });

test("certificate rollover requires a distinct next certificate and a rollback overlap", () => {
  const result = validateCertificateRollover(plan,
    certificate(currentFingerprint, "2026-07-01T00:00:00Z", "2026-08-10T00:00:00Z"),
    certificate(nextFingerprint, "2026-07-20T00:00:00Z", "2026-10-20T00:00:00Z"), now);
  assert.equal(result.status, "ready-for-controlled-rollover");
  assert.equal(result.privateKeyRead, false);
});

test("certificate rollover rejects an uncovered rollback window", () => {
  assert.throws(() => validateCertificateRollover(plan,
    certificate(currentFingerprint, "2026-07-01T00:00:00Z", "2026-07-27T12:00:00Z"),
    certificate(nextFingerprint, "2026-07-20T00:00:00Z", "2026-10-20T00:00:00Z"), now), /overlap|validity/u);
});
