import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateRedisReleaseDecision } from "./verify-redis-release-decision.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-redis-release-decision.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts the real bbb approval receipt while deployment remains blocked", () => {
  const record = validateRedisReleaseDecision(copy());
  assert.equal(record.owner.decision, "approve");
  assert.equal(record.preconditions.ownerDecisionSigned, true);
  assert.equal(record.deploymentAuthorized, false);
});

test("rejects the legacy pending or Sigstore-bundle contract", () => {
  const record = copy();
  record.schemaVersion = 1;
  assert.throws(() => validateRedisReleaseDecision(record), /schema v2/u);
  const bundle = copy();
  bundle.owner.signedRecord.bundlePath = "remote:/data/models/yujianAI/evidence/p1-m0-04/legacy.sigstore.json";
  assert.throws(() => validateRedisReleaseDecision(bundle), /raw|invalid/u);
});

test("rejects release authorization even though the Redis decision is approve", () => {
  const record = copy();
  record.deploymentAuthorized = true;
  record.gate.runtimeSwitch = "authorized";
  record.gate.productionRelease = "redis-canary-authorized";
  assert.throws(() => validateRedisReleaseDecision(record), /cannot authorize deployment/u);
});

test("rejects missing revocation, audit coverage or a raw reason", () => {
  const revoked = copy();
  revoked.owner.signedRecord.receipt.credentialRevoked = false;
  assert.throws(() => validateRedisReleaseDecision(revoked), /receipt is invalid/u);
  const audit = copy();
  audit.owner.signedRecord.auditCoverage = "partial";
  assert.throws(() => validateRedisReleaseDecision(audit), /signed receipt identity is invalid/u);
  const reason = copy();
  reason.owner.reason = "raw decision reason must remain remote";
  assert.throws(() => validateRedisReleaseDecision(reason), /raw reason/u);
});
