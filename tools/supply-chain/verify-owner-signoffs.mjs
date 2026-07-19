import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const remoteOwnerRoot = "remote:/data/models/yujianAI/evidence/p1-m0-04/owner-approvals";
const contracts = new Map([
  ["security-evidence", { owner: "aaa", role: "security-owner", decisions: ["approve", "reject", "time-bound-exception"] }],
  ["redis-release", { owner: "bbb", role: "release-owner", decisions: ["approve", "reject"] }],
  ["registry-kms-freeze", { owner: "bbb", role: "release-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
  ["license-notice-source-offer", { owner: "ccc", role: "legal-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
  ["china-distribution", { owner: "ddd", role: "compliance-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
]);
const owners = new Map([
  ["security-owner", "aaa"],
  ["release-owner", "bbb"],
  ["legal-owner", "ccc"],
  ["compliance-owner", "ddd"],
]);

export function validateOwnerSignoffs(record) {
  if (record.schemaVersion !== 2 || record.taskId !== "P1-M0-04-OWNER-SIGNOFFS") {
    fail("schema v2 owner receipt/audit contract is required");
  }
  timestamp(record.generatedAt, "generatedAt");
  if (record.adapter?.contract !== "owner-receipt-audit/v2"
    || record.adapter?.sourceTaskId !== "P1-M0-04-OWNER-ACCEPTANCE-EVIDENCE-SNAPSHOT") fail("adapter identity is invalid");
  validateEvidence(record.evidence);
  validateAudit(record.audit);
  if (!Array.isArray(record.decisions) || record.decisions.length !== contracts.size) fail("five decision records are required");
  const decisions = new Map();
  for (const decision of record.decisions) {
    if (decisions.has(decision.decisionType)) fail("decision types must be unique");
    validateDecision(decision, record.audit);
    decisions.set(decision.decisionType, decision);
  }
  for (const type of contracts.keys()) if (!decisions.has(type)) fail(`missing decision: ${type}`);
  validateOwners(record.owners, decisions);
  validatePreconditions(record.preconditions, decisions);
  const current = [...decisions.values()].map((decision) => decision.history.at(-1));
  const allReceiptsVerified = current.every((entry) => entry.receipt.signatureVerified && entry.receipt.credentialRevoked);
  const allApproved = current.every((entry) => entry.decision !== "reject");
  if (record.allProfessionalSignaturesVerified !== allReceiptsVerified) fail("signature aggregate is inconsistent");
  if (record.allProfessionalApprovalsGranted !== allApproved) fail("approval aggregate is inconsistent");
  if (record.professionalReviewRequired !== true) fail("professional review must remain required");
  const expectedStatus = allApproved ? "signed-decisions-awaiting-preconditions" : "signed-decisions-block-release";
  if (record.status !== expectedStatus) fail("aggregate status is inconsistent");
  if (record.productionReleaseAuthorized !== false) fail("receipt adapter cannot authorize production");
  if (record.gate?.formalGate0 !== "not-passed" || record.gate?.formalGate1 !== "not-passed"
    || record.gate?.formalGate7 !== "not-passed" || record.gate?.productionRelease !== "blocked") {
    fail("receipt adapter cannot pass a formal Gate");
  }
  rejectRawCredentialOrReason(record);
  return record;
}

function validateEvidence(evidence) {
  if (evidence?.productionOciEvidence !== "docs/acceptance/p1-production-oci-evidence.json"
    || evidence?.ownerKeyRegistry !== "docs/acceptance/p1-owner-key-registry.json"
    || evidence?.ownerApprovalRoot !== remoteOwnerRoot
    || !digestPattern.test(evidence?.ownerKeyRegistrySha256 ?? "")
    || !/^remote:[/]data[/]models[/]yujianAI[/]p2[/]openbao-a[/]audit-snapshots[/]owner-approval-final-audit-[0-9TZ]+[/]result[.]json$/u.test(evidence?.ownerApprovalAuditSummary ?? "")
    || !digestPattern.test(evidence?.ownerApprovalAuditSummarySha256 ?? "")) fail("owner acceptance evidence is invalid");
}

function validateAudit(audit) {
  const legacyAaa = audit?.schemaVersion === 1
    && audit.coverage?.aaa === "receipt-and-posthoc-verify-only-audit-enabled-after-decision"
    && audit.pathCounts?.signAaa === 0 && audit.decisionCoverage === undefined;
  const supersededAaaCoverage = audit?.decisionCoverage?.["p1-m0-04-aaa-security-20260718"];
  const supersededAaa = audit?.schemaVersion === 2
    && audit.coverage?.aaa === "partial-original-complete-supersession"
    && audit.pathCounts?.signAaa >= 2 && Array.isArray(supersededAaaCoverage)
    && supersededAaaCoverage[0] === "receipt-and-posthoc-verify-only-audit-enabled-after-decision"
    && supersededAaaCoverage.length > 1 && supersededAaaCoverage.slice(1).every((value) => value === "complete");
  if (audit?.taskId !== "P1-M0-04-OWNER-APPROVAL-AUDIT"
    || !/^owner-approval-final-audit-[0-9TZ]+$/u.test(audit.runId ?? "")
    || !digestPattern.test(audit.summarySha256 ?? "") || !digestPattern.test(audit.snapshotSha256 ?? "")
    || audit.records < 1 || audit.activeOwnerSignoffTokens !== 0 || audit.rawTokensArchived !== false
    || audit.productionReleaseAuthorized !== false || (!legacyAaa && !supersededAaa)
    || audit.coverage?.bbb !== "complete" || audit.coverage?.ccc !== "complete" || audit.coverage?.ddd !== "complete"
    || audit.pathCounts?.signBbb < 2
    || audit.pathCounts?.signCcc < 2 || audit.pathCounts?.signDdd < 2) fail("audit coverage is invalid");
}

function validateDecision(decision, audit) {
  const contract = contracts.get(decision.decisionType);
  if (contract === undefined || decision.personalOwner !== contract.owner || decision.role !== contract.role
    || !/^p1-m0-04-[a-z0-9-]+-20260718$/u.test(decision.decisionId ?? "")) fail("decision identity is invalid");
  if (!Array.isArray(decision.history) || decision.history.length < 1
    || decision.currentSequence !== decision.history.length - 1) fail(`${decision.decisionType} history is invalid`);
  const decisionCoverage = audit.decisionCoverage?.[decision.decisionId];
  if ((audit.schemaVersion === 2 && !Array.isArray(decisionCoverage))
    || (decisionCoverage !== undefined && decisionCoverage.length !== decision.history.length)) {
    fail(`${decision.decisionType} audit coverage history is invalid`);
  }
  for (let sequence = 0; sequence < decision.history.length; sequence += 1) {
    const entry = decision.history[sequence];
    if (entry.sequence !== sequence || entry.decisionId !== decision.decisionId
      || entry.decisionType !== decision.decisionType || entry.personalOwner !== contract.owner
      || entry.role !== contract.role || !contract.decisions.includes(entry.decision)) fail(`${decision.decisionType} entry is invalid`);
    timestamp(entry.decidedAt, "decidedAt");
    timestamp(entry.recordedAt, "recordedAt");
    digest(entry.templateRevision, "templateRevision");
    validateReasonEvidence(entry.reasonEvidence);
    source(entry.decisionArtifact, `${decision.decisionId}/decision.json`, "decisionArtifact", sequence);
    source(entry.signatureRecord, `${decision.decisionId}/signature.json`, "signatureRecord", sequence);
    receipt(entry.receipt, contract.owner, decision.decisionId, sequence);
    const expectedCoverage = audit.decisionCoverage?.[decision.decisionId]?.[sequence]
      ?? audit.coverage[contract.owner];
    if (entry.auditCoverage !== expectedCoverage) fail(`${decision.decisionType} audit coverage is inconsistent`);
    if (sequence > 0) {
      const previous = decision.history[sequence - 1];
      if (entry.supersedesReceiptSha256 !== previous.receipt.sha256
        || entry.supersedesArtifactSha256 !== previous.decisionArtifact.sha256
        || !digestPattern.test(entry.supersessionReasonSha256 ?? "")) fail(`${decision.decisionType} supersession link is invalid`);
    }
  }
}

function validateOwners(values, decisions) {
  if (!Array.isArray(values) || values.length !== owners.size) fail("four owners are required");
  const records = new Map(values.map((owner) => [owner.role, owner]));
  for (const [role, person] of owners) {
    const owner = records.get(role);
    const expected = [...decisions.values()].filter((decision) => decision.role === role);
    if (owner?.personalOwner !== person || owner.appointedBy !== "eee" || owner.status !== "signed-decisions-recorded"
      || typeof owner.requiredDecision !== "string" || owner.requiredDecision.length < 30) fail(`${role} owner record is invalid`);
    if (JSON.stringify(owner.decisionIds) !== JSON.stringify(expected.map((decision) => decision.decisionId).sort())) {
      fail(`${role} decision ids are inconsistent`);
    }
    const effective = new Map((owner.effectiveDecisions ?? []).map((decision) => [decision.decisionType, decision]));
    for (const decision of expected) {
      const current = decision.history.at(-1);
      const summary = effective.get(decision.decisionType);
      if (summary?.decisionId !== decision.decisionId || summary.sequence !== decision.currentSequence
        || summary.decision !== current.decision || summary.receiptSha256 !== current.receipt.sha256) {
        fail(`${role} effective decision is inconsistent`);
      }
    }
  }
}

function validatePreconditions(preconditions, decisions) {
  if (Object.values(preconditions ?? {}).some((value) => typeof value !== "boolean")) fail("preconditions must be boolean");
  const current = (type) => decisions.get(type).history.at(-1).decision;
  const expected = {
    allPersonalDecisionReceiptsVerified: true,
    ownerProfessionalQualificationsVerified: false,
    highFindingsReviewedByAaa: current("security-evidence") !== "reject",
    redisDecisionSignedByBbb: true,
    redisReleaseApprovedByBbb: current("redis-release") === "approve",
    licenseNoticeSignedByCcc: true,
    licenseNoticeApprovedByCcc: current("license-notice-source-offer") !== "reject",
    chinaDistributionSignedByDdd: true,
    chinaDistributionApprovedByDdd: current("china-distribution") !== "reject",
    registryTargetsFrozen: current("registry-kms-freeze") === "approve",
  };
  for (const [field, value] of Object.entries(expected)) {
    if (preconditions[field] !== value) fail(`${field} is inconsistent`);
  }
}

function validateReasonEvidence(reason) {
  if (reason?.storedOnlyInSignedArtifact !== true || reason.professionalReviewRequired !== true
    || !Number.isInteger(reason.length) || reason.length < 20 || reason.length > 2000
    || !digestPattern.test(reason.sha256 ?? "")) fail("reason evidence is invalid");
}

function source(value, suffix, field, sequence = 0) {
  const segment = sequence === 0 ? suffix : suffix.replace("/", `/supersessions/${String(sequence).padStart(6, "0")}/`);
  if (value?.path !== `${remoteOwnerRoot}/${segment}` || !digestPattern.test(value.sha256 ?? "")) fail(`${field} is invalid`);
}

function receipt(value, owner, decisionId, sequence) {
  const suffix = sequence === 0 ? `${decisionId}/result.json` : `${decisionId}/supersessions/${String(sequence).padStart(6, "0")}/result.json`;
  if (value?.path !== `${remoteOwnerRoot}/${suffix}` || !digestPattern.test(value.sha256 ?? "")
    || value.keyUri !== `openbao://yujian-owner-${owner}` || !Number.isInteger(value.keyVersion)
    || value.keyVersion < 1 || !digestPattern.test(value.publicKeySha256 ?? "")
    || value.signatureVerified !== true || value.credentialRevoked !== true) fail("receipt is invalid");
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
  if (!digestPattern.test(value ?? "")) fail(`${field} is invalid`);
}

function timestamp(value, field) {
  if (!Number.isFinite(Date.parse(value))) fail(`${field} is invalid`);
}

function fail(message) {
  throw new Error(`P1-M0-04 owner signoff invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  validateOwnerSignoffs(record);
  process.stdout.write(`Owner signoffs verified: status=${record.status}; decisions=${record.decisions.length}; productionAuthorized=${record.productionReleaseAuthorized}\n`);
}
