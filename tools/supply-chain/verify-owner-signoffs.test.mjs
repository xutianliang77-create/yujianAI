import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOwnerSignoffs } from "./verify-owner-signoffs.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-m0-04-owner-signoffs.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts five receipt-backed decisions while two rejections keep release blocked", () => {
  const record = validateOwnerSignoffs(copy());
  assert.equal(record.decisions.length, 5);
  assert.equal(record.allProfessionalSignaturesVerified, true);
  assert.equal(record.allProfessionalApprovalsGranted, false);
  assert.equal(record.productionReleaseAuthorized, false);
  const bbbFreeze = record.decisions.find((decision) => decision.decisionType === "registry-kms-freeze");
  assert.equal(bbbFreeze.currentSequence, 1);
  assert.deepEqual(bbbFreeze.history.map((entry) => entry.decision), ["reject", "reject"]);
  assert.equal(bbbFreeze.history[1].supersedesReceiptSha256, bbbFreeze.history[0].receipt.sha256);
  const cccLegal = record.decisions.find((decision) => decision.decisionType === "license-notice-source-offer");
  assert.equal(cccLegal.currentSequence, 1);
  assert.deepEqual(cccLegal.history.map((entry) => entry.decision), ["reject", "reject"]);
  assert.equal(cccLegal.history[1].supersedesReceiptSha256, cccLegal.history[0].receipt.sha256);
  const dddCompliance = record.decisions.find((decision) => decision.decisionType === "china-distribution");
  assert.equal(dddCompliance.currentSequence, 1);
  assert.deepEqual(dddCompliance.history.map((entry) => entry.decision), ["reject", "approve"]);
  assert.equal(dddCompliance.history[1].supersedesReceiptSha256, dddCompliance.history[0].receipt.sha256);
  assert.equal(record.preconditions.chinaDistributionApprovedByDdd, true);
});

test("rejects the legacy schema that cannot represent mixed bbb decisions", () => {
  const record = copy();
  record.schemaVersion = 1;
  assert.throws(() => validateOwnerSignoffs(record), /schema v2/u);
});

test("rejects a raw reason or signature copied from protected remote evidence", () => {
  const record = copy();
  record.decisions[0].history[0].reason = "raw professional decision text must stay in the signed artifact";
  assert.throws(() => validateOwnerSignoffs(record), /raw reason/u);
  delete record.decisions[0].history[0].reason;
  record.decisions[0].history[0].receipt.signature = "vault:v1:forbidden";
  assert.throws(() => validateOwnerSignoffs(record), /raw signature/u);
});

test("rejects a forged receipt link or overstated aaa audit coverage", () => {
  const record = copy();
  record.owners[1].effectiveDecisions[0].receiptSha256 = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateOwnerSignoffs(record), /effective decision is inconsistent/u);
  const audit = copy();
  audit.audit.coverage.aaa = "complete";
  assert.throws(() => validateOwnerSignoffs(audit), /audit coverage is invalid/u);
  const sequence = copy();
  sequence.decisions.find((decision) => decision.personalOwner === "aaa").history[1].auditCoverage
    = "receipt-and-posthoc-verify-only-audit-enabled-after-decision";
  assert.throws(() => validateOwnerSignoffs(sequence), /audit coverage is inconsistent/u);
});

test("receipt evidence can never directly pass formal Gates", () => {
  const record = copy();
  record.productionReleaseAuthorized = true;
  record.gate.formalGate0 = "passed";
  record.gate.formalGate1 = "passed";
  record.gate.formalGate7 = "passed";
  record.gate.productionRelease = "authorized";
  assert.throws(() => validateOwnerSignoffs(record), /cannot authorize production/u);
});
