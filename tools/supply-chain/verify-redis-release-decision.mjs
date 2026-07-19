import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const imagePattern = /^redis:[^@]+@sha256:[0-9a-f]{64}$/u;
const productionImagePattern = /^beelink[.]tail1e9cec[.]ts[.]net:5443\/yujian\/p1\/redis@sha256:[0-9a-f]{64}$/u;
const remoteEvidencePattern = /^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\//u;
const ownerRoot = "remote:/data/models/yujianAI/evidence/p1-m0-04/owner-approvals";
const requiredPreconditions = [
  "candidateScanPassed",
  "candidateRegressionPassed",
  "technicalRegistryConfigured",
  "technicalKmsKeyConfigured",
  "rollbackPlanAccepted",
  "registryTargetFrozen",
  "productionSignatureVerified",
  "ownerDecisionSigned",
];

export function validateRedisReleaseDecision(record) {
  if (record.schemaVersion !== 2 || record.taskId !== "P1-M0-04-REDIS-RELEASE-DECISION") {
    fail("schema v2 owner receipt/audit contract is required");
  }
  if (record.adapter?.contract !== "owner-receipt-audit/v2"
    || record.adapter?.sourceTaskId !== "P1-M0-04-OWNER-ACCEPTANCE-EVIDENCE-SNAPSHOT") fail("adapter identity is invalid");
  if (!Number.isFinite(Date.parse(record.generatedAt))) fail("generatedAt must be an ISO timestamp");
  validateCandidate(record);
  validateEvidence(record.evidence);
  validateOwner(record.owner);
  for (const field of requiredPreconditions) {
    if (typeof record.preconditions?.[field] !== "boolean") fail(`${field} must be boolean`);
  }
  if (record.preconditions.ownerDecisionSigned !== true) fail("owner decision receipt must be recorded");
  if (record.deploymentAuthorized !== false) fail("Redis receipt cannot authorize deployment while formal Gates are blocked");
  if (record.gate?.runtimeSwitch !== "not-authorized" || record.gate?.currentImageGate !== "blocked"
    || record.gate?.formalGate0 !== "not-passed" || record.gate?.formalGate1 !== "not-passed"
    || record.gate?.formalGate7 !== "not-passed" || record.gate?.productionRelease !== "blocked") {
    fail("Redis decision cannot pass the broader image or formal Gates");
  }
  rejectRawCredentialOrReason(record);
  return record;
}

function validateCandidate(record) {
  if (!imagePattern.test(record.candidate?.currentReference ?? "")) fail("current Redis reference is invalid");
  if (!imagePattern.test(record.candidate?.candidateReference ?? "")) fail("candidate Redis reference is invalid");
  if (record.candidate.currentReference === record.candidate.candidateReference) fail("candidate must differ from current Redis");
  if (!productionImagePattern.test(record.candidate.productionRegistryReference ?? "")) fail("production Redis reference is invalid");
}

function validateEvidence(evidence) {
  if (evidence?.candidateScanRunId !== "p1-m0-04-candidates-20260718T084500Z"
    || evidence?.candidateScanIndex !== "docs/acceptance/p1-supply-chain-candidate-evidence.json") fail("candidate scan evidence is invalid");
  if (!/^p1-m0-04-redis-regression-[0-9TZ]+$/u.test(evidence?.regressionRunId ?? "")) fail("regression run is invalid");
  remotePath(evidence?.regressionReport, "regressionReport");
  digest(evidence?.regressionReportSha256, "regressionReportSha256");
  if (!/^production-oci-redis-[0-9TZ]+$/u.test(evidence?.productionOciRunId ?? "")) fail("production OCI run is invalid");
  remotePath(evidence?.productionOciResult, "productionOciResult");
  digest(evidence?.productionOciResultSha256, "productionOciResultSha256");
  if (evidence?.productionOciIndex !== "docs/acceptance/p1-production-oci-evidence.json"
    || evidence?.registryHost !== "beelink.tail1e9cec.ts.net:5443"
    || evidence?.kmsKeyUri !== "openbao://yujian-oci-release") fail("production OCI target is invalid");
}

function validateOwner(owner) {
  if (owner?.role !== "release-owner" || owner.personalOwner !== "bbb"
    || owner.status !== "signed-decision-recorded" || !["approve", "reject"].includes(owner.decision)
    || !Number.isFinite(Date.parse(owner.decidedAt)) || !Number.isInteger(owner.currentSequence)
    || owner.currentSequence < 0) fail("bbb signed decision is invalid");
  const reason = owner.reasonEvidence;
  if (reason?.storedOnlyInSignedArtifact !== true || reason.professionalReviewRequired !== true
    || !Number.isInteger(reason.length) || reason.length < 20 || reason.length > 2000
    || !digestPattern.test(reason.sha256 ?? "")) fail("decision reason evidence is invalid");
  const signed = owner.signedRecord;
  const allowedSignedFields = new Set([
    "contract", "decisionId", "decisionArtifact", "signatureRecord", "receipt", "auditRunId", "auditCoverage",
  ]);
  if (Object.keys(signed ?? {}).some((field) => !allowedSignedFields.has(field))) fail("signed receipt contains legacy or unknown fields");
  if (signed?.contract !== "openbao-owner-receipt/v1"
    || signed.decisionId !== "p1-m0-04-bbb-redis-20260718"
    || !/^owner-approval-final-audit-[0-9TZ]+$/u.test(signed.auditRunId ?? "")
    || signed.auditCoverage !== "complete") fail("signed receipt identity is invalid");
  const prefix = owner.currentSequence === 0
    ? `${ownerRoot}/${signed.decisionId}`
    : `${ownerRoot}/${signed.decisionId}/supersessions/${String(owner.currentSequence).padStart(6, "0")}`;
  fileReference(signed.decisionArtifact, `${prefix}/decision.json`, "decisionArtifact");
  fileReference(signed.signatureRecord, `${prefix}/signature.json`, "signatureRecord");
  const receipt = signed.receipt;
  if (receipt?.path !== `${prefix}/result.json` || !digestPattern.test(receipt.sha256 ?? "")
    || receipt.keyUri !== "openbao://yujian-owner-bbb" || !Number.isInteger(receipt.keyVersion)
    || receipt.keyVersion < 1 || !digestPattern.test(receipt.publicKeySha256 ?? "")
    || receipt.signatureVerified !== true || receipt.credentialRevoked !== true) fail("OpenBao receipt is invalid");
}

function fileReference(value, path, field) {
  if (value?.path !== path || !digestPattern.test(value.sha256 ?? "")) fail(`${field} is invalid`);
}

function rejectRawCredentialOrReason(value) {
  if (Array.isArray(value)) return value.forEach(rejectRawCredentialOrReason);
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (["signature", "wrappedToken", "token", "password", "privateKey", "secret", "reason"].includes(key)) {
      fail(`raw ${key} must not be copied into acceptance JSON`);
    }
    rejectRawCredentialOrReason(nested);
  }
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remoteEvidencePattern.test(value ?? "")) fail(`${field} is outside the Beelink evidence root`);
}

function fail(message) {
  throw new Error(`P1-M0-04 Redis release decision invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_REDIS_DECISION_FILE ?? "docs/acceptance/p1-redis-release-decision.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  validateRedisReleaseDecision(record);
  process.stdout.write(`Redis release decision verified: owner=${record.owner.personalOwner}; status=${record.owner.status}; decision=${record.owner.decision}; authorized=${record.deploymentAuthorized}\n`);
}
