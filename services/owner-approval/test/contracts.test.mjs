import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDecidedArtifact,
  buildSupersedingArtifact,
  parseOwnerDecisionSubmission,
  parseOwnerDecisionTemplate,
  parseOwnerSupersedingDecisionSubmission,
  revisionFor,
} from "../dist/index.js";
import { validateOwnerDecision } from "../../../tools/supply-chain/verify-owner-decision.mjs";

const templatePath = new URL("../../../docs/governance/owner-decisions/aaa-security-decision.json", import.meta.url);

async function template() {
  return parseOwnerDecisionTemplate(JSON.parse(await readFile(templatePath, "utf8")));
}

test("approval contract creates a supply-chain-compatible decided artifact", async () => {
  const pending = await template();
  const revision = revisionFor(pending);
  assert.match(revision, /^sha256:[0-9a-f]{64}$/u);
  const submission = parseOwnerDecisionSubmission({
    revision,
    decision: "approve",
    reason: "已逐项核对扫描结果、签名边界和残余风险，批准记录该安全决定。",
    wrappedToken: "wrapped-token-for-contract-test-only",
    confirmEvidenceReviewed: true,
  }, pending);
  const decided = buildDecidedArtifact(pending, submission, "2026-07-18T14:00:00.000Z");
  assert.equal(decided.status, "ready-for-personal-signature");
  assert.equal(decided.decision, "approve");
  assert.equal(decided.conditions, null);
  assert.doesNotThrow(() => validateOwnerDecision(decided, { requireDecided: true }));
});

test("approval contract rejects stale revisions, unknown fields and decisions outside the task", async () => {
  const pending = await template();
  assert.throws(() => parseOwnerDecisionSubmission({
    revision: revisionFor(pending),
    decision: "approve-with-conditions",
    reason: "该理由长度满足合同，但决定类型不属于安全任务允许范围。",
    conditions: "该条件不会被接受，因为任务合同不允许这一决定类型。",
    wrappedToken: "wrapped-token-for-contract-test-only",
    confirmEvidenceReviewed: true,
  }, pending), /不允许此决定/u);
  assert.throws(() => parseOwnerDecisionSubmission({
    revision: revisionFor(pending),
    decision: "reject",
    reason: "已完成证据审阅，但此请求故意携带未知字段用于负向测试。",
    wrappedToken: "wrapped-token-for-contract-test-only",
    confirmEvidenceReviewed: true,
    productionReleaseAuthorized: true,
  }, pending), /未知字段/u);
  const submission = parseOwnerDecisionSubmission({
    revision: revisionFor(pending),
    decision: "reject",
    reason: "已完成证据审阅，当前残余风险不可接受，因此明确驳回。",
    wrappedToken: "wrapped-token-for-contract-test-only",
    confirmEvidenceReviewed: true,
  }, pending);
  submission.revision = `sha256:${"0".repeat(64)}`;
  assert.throws(() => buildDecidedArtifact(pending, submission), /已变化/u);
});

test("time-bound exception requires both conditions and an expiry", async () => {
  const pending = await template();
  const base = {
    revision: revisionFor(pending),
    decision: "time-bound-exception",
    reason: "当前需要一个明确到期且附带整改条件的安全例外决定。",
    wrappedToken: "wrapped-token-for-contract-test-only",
    confirmEvidenceReviewed: true,
  };
  assert.throws(() => parseOwnerDecisionSubmission(base, pending), /conditions/u);
  assert.throws(() => parseOwnerDecisionSubmission({
    ...base,
    conditions: "必须在到期前完成残余风险复核并重新提交安全证据。",
  }, pending), /expiresAt/u);
});

test("superseding contract binds the immutable predecessor and requires an explicit preservation confirmation", async () => {
  const pending = await template();
  const previous = {
    receiptSha256: `sha256:${"1".repeat(64)}`,
    artifactSha256: `sha256:${"2".repeat(64)}`,
    recordedAt: "2026-07-18T14:00:00.000Z",
  };
  const base = {
    revision: revisionFor(pending),
    expectedReceiptSha256: previous.receiptSha256,
    decision: "approve",
    reason: "新的整改证据已逐项复核，现决定批准并保留此前驳回决定的完整记录。",
    supersessionReason: "此前决定之后补充了可验证的整改证据，因此需要追加一份替代决定。",
    wrappedToken: "wrapped-token-for-supersession-test",
    confirmEvidenceReviewed: true,
    confirmOriginalPreserved: true,
  };
  const submission = parseOwnerSupersedingDecisionSubmission(base, pending);
  const artifact = buildSupersedingArtifact(pending, submission, previous, 1, "2026-07-18T15:00:00.000Z");
  assert.equal(artifact.taskId, "P1-M0-04-OWNER-SUPERSEDING-DECISION");
  assert.equal(artifact.sequence, 1);
  assert.equal(artifact.supersedes.receiptSha256, previous.receiptSha256);
  assert.equal(artifact.supersedes.artifactSha256, previous.artifactSha256);
  assert.equal(artifact.decision, "approve");

  assert.throws(() => parseOwnerSupersedingDecisionSubmission({
    ...base,
    confirmOriginalPreserved: false,
  }, pending), /原始证据/u);
  assert.throws(() => buildSupersedingArtifact(pending, submission, {
    ...previous,
    receiptSha256: `sha256:${"3".repeat(64)}`,
  }, 1), /当前决定已变化/u);
});
