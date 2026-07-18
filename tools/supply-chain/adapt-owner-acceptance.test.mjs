import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adaptOwnerAcceptance } from "./adapt-owner-acceptance.mjs";
import { validateOwnerSignoffs } from "./verify-owner-signoffs.mjs";
import { validateRedisReleaseDecision } from "./verify-redis-release-decision.mjs";

const ownerSignoffs = JSON.parse(readFileSync("docs/acceptance/p1-m0-04-owner-signoffs.json", "utf8"));
const redisDecision = JSON.parse(readFileSync("docs/acceptance/p1-redis-release-decision.json", "utf8"));

function snapshot() {
  return {
    schemaVersion: 1,
    taskId: "P1-M0-04-OWNER-ACCEPTANCE-EVIDENCE-SNAPSHOT",
    collectedAt: ownerSignoffs.generatedAt,
    source: {
      evidenceRoot: ownerSignoffs.evidence.ownerApprovalRoot,
      ownerKeyRegistry: ownerSignoffs.evidence.ownerKeyRegistry,
      ownerKeyRegistrySha256: ownerSignoffs.evidence.ownerKeyRegistrySha256,
    },
    decisions: structuredClone(ownerSignoffs.decisions),
    audit: structuredClone(ownerSignoffs.audit),
    productionReleaseAuthorized: false,
  };
}

test("adapter preserves all hash-linked supersessions while two rejections keep the Gate blocked", () => {
  const result = adaptOwnerAcceptance({
    snapshot: snapshot(),
    ownerSignoffs: structuredClone(ownerSignoffs),
    redisDecision: structuredClone(redisDecision),
    generatedAt: "2026-07-18T14:31:00Z",
  });
  assert.equal(result.ownerSignoffs.decisions.length, 5);
  const aaa = result.ownerSignoffs.decisions.find((decision) => decision.personalOwner === "aaa");
  assert.equal(aaa.currentSequence, 1);
  assert.equal(aaa.history.length, 2);
  assert.equal(aaa.history[0].decision, "reject");
  assert.equal(aaa.history[1].decision, "approve");
  assert.equal(aaa.history[1].supersedesReceiptSha256, aaa.history[0].receipt.sha256);
  assert.equal(aaa.history[0].auditCoverage, "receipt-and-posthoc-verify-only-audit-enabled-after-decision");
  assert.equal(aaa.history[1].auditCoverage, "complete");
  const bbbFreeze = result.ownerSignoffs.decisions
    .find((decision) => decision.decisionType === "registry-kms-freeze");
  assert.equal(bbbFreeze.currentSequence, 1);
  assert.equal(bbbFreeze.history.length, 2);
  assert.deepEqual(bbbFreeze.history.map((entry) => entry.decision), ["reject", "reject"]);
  assert.equal(bbbFreeze.history[1].supersedesReceiptSha256, bbbFreeze.history[0].receipt.sha256);
  assert.equal(bbbFreeze.history[1].auditCoverage, "complete");
  const cccLegal = result.ownerSignoffs.decisions
    .find((decision) => decision.decisionType === "license-notice-source-offer");
  assert.equal(cccLegal.currentSequence, 1);
  assert.equal(cccLegal.history.length, 2);
  assert.deepEqual(cccLegal.history.map((entry) => entry.decision), ["reject", "reject"]);
  assert.equal(cccLegal.history[1].supersedesReceiptSha256, cccLegal.history[0].receipt.sha256);
  assert.equal(cccLegal.history[1].auditCoverage, "complete");
  const dddCompliance = result.ownerSignoffs.decisions
    .find((decision) => decision.decisionType === "china-distribution");
  assert.equal(dddCompliance.currentSequence, 1);
  assert.equal(dddCompliance.history.length, 2);
  assert.deepEqual(dddCompliance.history.map((entry) => entry.decision), ["reject", "approve"]);
  assert.equal(dddCompliance.history[1].supersedesReceiptSha256, dddCompliance.history[0].receipt.sha256);
  assert.equal(dddCompliance.history[1].auditCoverage, "complete");
  assert.equal(result.ownerSignoffs.preconditions.chinaDistributionApprovedByDdd, true);
  assert.deepEqual(result.ownerSignoffs.owners.find((owner) => owner.personalOwner === "bbb").effectiveDecisions
    .map((decision) => decision.decision), ["approve", "reject"]);
  assert.equal(result.redisDecision.owner.decision, "approve");
  assert.equal(result.redisDecision.deploymentAuthorized, false);
  assert.doesNotThrow(() => validateOwnerSignoffs(result.ownerSignoffs));
  assert.doesNotThrow(() => validateRedisReleaseDecision(result.redisDecision));
});

test("adapter rejects an incomplete or release-authorizing snapshot", () => {
  const incomplete = snapshot();
  incomplete.decisions.pop();
  assert.throws(() => adaptOwnerAcceptance({
    snapshot: incomplete,
    ownerSignoffs,
    redisDecision,
    generatedAt: "2026-07-18T14:31:00Z",
  }), /snapshot identity is invalid/u);
  const release = snapshot();
  release.productionReleaseAuthorized = true;
  assert.throws(() => adaptOwnerAcceptance({
    snapshot: release,
    ownerSignoffs,
    redisDecision,
    generatedAt: "2026-07-18T14:31:00Z",
  }), /snapshot identity is invalid/u);
});

test("adapter rejects audit coverage that omits a supersession sequence", () => {
  const invalid = snapshot();
  invalid.audit.decisionCoverage["p1-m0-04-aaa-security-20260718"].pop();
  assert.throws(() => adaptOwnerAcceptance({
    snapshot: invalid,
    ownerSignoffs,
    redisDecision,
    generatedAt: "2026-07-18T15:14:35Z",
  }), /coverage length mismatch/u);
});
