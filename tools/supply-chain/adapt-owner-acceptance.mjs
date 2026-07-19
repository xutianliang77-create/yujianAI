import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const expectedContracts = new Map([
  ["security-evidence", { owner: "aaa", role: "security-owner" }],
  ["redis-release", { owner: "bbb", role: "release-owner" }],
  ["registry-kms-freeze", { owner: "bbb", role: "release-owner" }],
  ["license-notice-source-offer", { owner: "ccc", role: "legal-owner" }],
  ["china-distribution", { owner: "ddd", role: "compliance-owner" }],
]);
const forbiddenKeys = new Set(["wrappedToken", "token", "password", "privateKey", "secret"]);

export async function collectOwnerAcceptanceEvidence(options) {
  const evidenceRoot = resolve(options.evidenceRoot);
  const keyRegistryBytes = await readFile(resolve(options.keyRegistry));
  const keyRegistry = parseJson(keyRegistryBytes, "owner key registry");
  const keys = validateKeyRegistry(keyRegistry);
  const directories = (await readdir(evidenceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("p1-m0-04-"))
    .map((entry) => entry.name)
    .sort();
  const decisions = [];
  for (const directory of directories) {
    const basePath = resolve(evidenceRoot, directory);
    const original = await readEntry(basePath, `${options.evidenceUriRoot}/${directory}`, 0, keys);
    const contract = expectedContracts.get(original.decisionType);
    if (contract === undefined || original.personalOwner !== contract.owner || original.role !== contract.role) {
      fail(`unexpected decision contract: ${original.decisionType}`);
    }
    const history = [original];
    let supersessions = [];
    try {
      supersessions = (await readdir(resolve(basePath, "supersessions"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && /^\d{6}$/u.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (let index = 0; index < supersessions.length; index += 1) {
      const sequence = index + 1;
      if (supersessions[index] !== String(sequence).padStart(6, "0")) fail(`non-contiguous history: ${directory}`);
      const entry = await readEntry(
        resolve(basePath, "supersessions", supersessions[index]),
        `${options.evidenceUriRoot}/${directory}/supersessions/${supersessions[index]}`,
        sequence,
        keys,
      );
      validateChain(history.at(-1), entry);
      history.push(entry);
    }
    decisions.push({
      decisionId: original.decisionId,
      decisionType: original.decisionType,
      personalOwner: original.personalOwner,
      role: original.role,
      currentSequence: history.at(-1).sequence,
      history,
    });
  }
  if (decisions.length !== expectedContracts.size
    || new Set(decisions.map((decision) => decision.decisionType)).size !== expectedContracts.size) {
    fail("exactly five owner decisions are required");
  }
  const { bytes: auditBytes, value: audit } = await readAudit(options);
  validateAudit(audit);
  for (const decision of decisions) {
    const coverage = audit.decisionCoverage?.[decision.decisionId];
    if ((audit.schemaVersion === 2 && coverage === undefined)
      || (coverage !== undefined && coverage.length !== decision.history.length)) {
      fail(`audit decision coverage length mismatch: ${decision.decisionId}`);
    }
    for (const entry of decision.history) {
      entry.auditCoverage = coverage?.[entry.sequence] ?? audit.coverage[decision.personalOwner];
    }
  }
  return {
    schemaVersion: 1,
    taskId: "P1-M0-04-OWNER-ACCEPTANCE-EVIDENCE-SNAPSHOT",
    collectedAt: options.collectedAt ?? new Date().toISOString(),
    source: {
      evidenceRoot: options.evidenceUriRoot,
      ownerKeyRegistry: options.keyRegistryUri,
      ownerKeyRegistrySha256: sha256(keyRegistryBytes),
    },
    decisions: decisions.sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    audit: {
      schemaVersion: audit.schemaVersion ?? 1,
      taskId: audit.taskId,
      runId: audit.runId,
      generatedAt: audit.generatedAt,
      summaryPath: options.auditSummaryUri,
      summarySha256: sha256(auditBytes),
      snapshotPath: audit.snapshotPath,
      snapshotSha256: audit.snapshotSha256,
      records: audit.records,
      pathCounts: audit.pathCounts,
      coverage: audit.coverage,
      ...(audit.decisionCoverage === undefined ? {} : { decisionCoverage: audit.decisionCoverage }),
      activeOwnerSignoffTokens: audit.activeOwnerSignoffTokens,
      rawTokensArchived: audit.rawTokensArchived,
      productionReleaseAuthorized: false,
    },
    productionReleaseAuthorized: false,
  };
}

async function readEntry(directory, uriRoot, sequence, keys) {
  const [decisionBytes, signatureBytes, receiptBytes] = await Promise.all([
    readFile(resolve(directory, "decision.json")),
    readFile(resolve(directory, "signature.json")),
    readFile(resolve(directory, "result.json")),
  ]);
  const artifact = parseJson(decisionBytes, `${uriRoot}/decision.json`);
  const signature = parseJson(signatureBytes, `${uriRoot}/signature.json`);
  const receipt = parseJson(receiptBytes, `${uriRoot}/result.json`);
  rejectCredentialFields(artifact);
  const key = keys.get(receipt.personalOwner);
  const original = sequence === 0;
  if (artifact.decisionId !== receipt.decisionId || artifact.decisionType !== receipt.decisionType
    || artifact.personalOwner !== receipt.personalOwner || artifact.role !== receipt.role
    || artifact.decision !== receipt.decision || artifact.decidedAt !== receipt.decidedAt
    || receipt.artifactSha256 !== sha256(decisionBytes)
    || receipt.signature !== signature.signature || receipt.keyUri !== signature.keyUri
    || receipt.keyVersion !== signature.keyVersion || signature.verified !== true
    || signature.credentialRevoked !== true || receipt.signatureVerified !== true
    || receipt.credentialRevoked !== true || receipt.gateUpdated !== false
    || receipt.productionReleaseAuthorized !== false || key?.keyUri !== receipt.keyUri
    || key?.publicKeySha256 !== receipt.publicKeySha256) fail(`record integrity mismatch: ${uriRoot}`);
  if (original && (artifact.taskId !== "P1-M0-04-OWNER-DECISION"
    || receipt.taskId !== "P1-M0-04-PERSONAL-OWNER-SIGNATURE")) fail(`original identity mismatch: ${uriRoot}`);
  if (!original && (artifact.taskId !== "P1-M0-04-OWNER-SUPERSEDING-DECISION"
    || receipt.taskId !== "P1-M0-04-PERSONAL-OWNER-SUPERSESSION"
    || artifact.sequence !== sequence || receipt.supersessionSequence !== sequence)) fail(`supersession identity mismatch: ${uriRoot}`);
  if (typeof artifact.reason !== "string" || artifact.reason.trim().length < 20) fail(`decision reason is missing: ${uriRoot}`);
  return {
    sequence,
    decisionId: receipt.decisionId,
    decisionType: receipt.decisionType,
    personalOwner: receipt.personalOwner,
    role: receipt.role,
    decision: receipt.decision,
    decidedAt: receipt.decidedAt,
    recordedAt: receipt.recordedAt,
    templateRevision: receipt.templateRevision,
    reasonEvidence: {
      storedOnlyInSignedArtifact: true,
      length: artifact.reason.length,
      sha256: sha256(Buffer.from(artifact.reason, "utf8")),
      professionalReviewRequired: true,
    },
    conditions: artifact.conditions ?? null,
    expiresAt: artifact.expiresAt ?? null,
    decisionArtifact: { path: `${uriRoot}/decision.json`, sha256: sha256(decisionBytes) },
    signatureRecord: { path: `${uriRoot}/signature.json`, sha256: sha256(signatureBytes) },
    receipt: {
      path: `${uriRoot}/result.json`,
      sha256: sha256(receiptBytes),
      keyUri: receipt.keyUri,
      keyVersion: receipt.keyVersion,
      publicKeySha256: receipt.publicKeySha256,
      signatureVerified: true,
      credentialRevoked: true,
    },
    ...(original ? {} : {
      supersedesReceiptSha256: receipt.supersedesReceiptSha256,
      supersedesArtifactSha256: receipt.supersedesArtifactSha256,
      supersessionReasonSha256: sha256(Buffer.from(receipt.supersessionReason, "utf8")),
    }),
  };
}

function validateChain(previous, current) {
  if (current.sequence !== previous.sequence + 1
    || current.supersedesReceiptSha256 !== previous.receipt.sha256
    || current.supersedesArtifactSha256 !== previous.decisionArtifact.sha256) fail("supersession hash chain is invalid");
}

export function adaptOwnerAcceptance({ snapshot, ownerSignoffs, redisDecision, generatedAt }) {
  validateSnapshot(snapshot);
  const current = snapshot.decisions.map((decision) => ({ ...decision, current: decision.history.at(-1) }));
  const byRole = new Map();
  for (const decision of current) {
    const values = byRole.get(decision.role) ?? [];
    values.push(decision);
    byRole.set(decision.role, values);
  }
  const owners = ownerSignoffs.owners.map((legacy) => {
    const decisions = byRole.get(legacy.role) ?? [];
    return {
      role: legacy.role,
      personalOwner: legacy.personalOwner,
      appointedBy: legacy.appointedBy,
      status: "signed-decisions-recorded",
      requiredDecision: legacy.requiredDecision,
      decisionIds: decisions.map((decision) => decision.decisionId).sort(),
      effectiveDecisions: decisions.map((decision) => ({
        decisionId: decision.decisionId,
        decisionType: decision.decisionType,
        sequence: decision.currentSequence,
        decision: decision.current.decision,
        receiptSha256: decision.current.receipt.sha256,
      })).sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    };
  });
  const allReceiptsVerified = current.every((decision) => decision.current.receipt.signatureVerified
    && decision.current.receipt.credentialRevoked);
  const allApproved = current.every((decision) => decision.current.decision !== "reject");
  const signoffs = {
    ...ownerSignoffs,
    schemaVersion: 2,
    generatedAt,
    status: allApproved ? "signed-decisions-awaiting-preconditions" : "signed-decisions-block-release",
    adapter: { contract: "owner-receipt-audit/v2", sourceTaskId: snapshot.taskId },
    evidence: {
      ...ownerSignoffs.evidence,
      ownerApprovalRoot: snapshot.source.evidenceRoot,
      ownerKeyRegistrySha256: snapshot.source.ownerKeyRegistrySha256,
      ownerApprovalAuditSummary: snapshot.audit.summaryPath,
      ownerApprovalAuditSummarySha256: snapshot.audit.summarySha256,
    },
    owners,
    decisions: snapshot.decisions,
    audit: snapshot.audit,
    preconditions: {
      ...ownerSignoffs.preconditions,
      allPersonalDecisionReceiptsVerified: allReceiptsVerified,
      ownerProfessionalQualificationsVerified: false,
      highFindingsReviewedByAaa: effective(current, "security-evidence").decision !== "reject",
      redisDecisionSignedByBbb: true,
      redisReleaseApprovedByBbb: effective(current, "redis-release").decision === "approve",
      licenseNoticeSignedByCcc: true,
      licenseNoticeApprovedByCcc: effective(current, "license-notice-source-offer").decision !== "reject",
      chinaDistributionSignedByDdd: true,
      chinaDistributionApprovedByDdd: effective(current, "china-distribution").decision !== "reject",
      registryTargetsFrozen: effective(current, "registry-kms-freeze").decision === "approve",
    },
    allProfessionalSignaturesVerified: allReceiptsVerified,
    allProfessionalApprovalsGranted: allApproved,
    professionalReviewRequired: true,
    productionReleaseAuthorized: false,
  };
  const redis = current.find((decision) => decision.decisionType === "redis-release");
  const redisEntry = redis.current;
  const redisPreconditions = {
    ...redisDecision.preconditions,
    ownerDecisionSigned: true,
  };
  const redisCanDeploy = redisEntry.decision === "approve" && Object.values(redisPreconditions).every(Boolean);
  const adaptedRedis = {
    ...redisDecision,
    schemaVersion: 2,
    generatedAt,
    adapter: { contract: "owner-receipt-audit/v2", sourceTaskId: snapshot.taskId },
    owner: {
      role: redis.role,
      personalOwner: redis.personalOwner,
      status: "signed-decision-recorded",
      decision: redisEntry.decision,
      decidedAt: redisEntry.decidedAt,
      reasonEvidence: redisEntry.reasonEvidence,
      currentSequence: redis.currentSequence,
      signedRecord: {
        contract: "openbao-owner-receipt/v1",
        decisionId: redis.decisionId,
        decisionArtifact: redisEntry.decisionArtifact,
        signatureRecord: redisEntry.signatureRecord,
        receipt: redisEntry.receipt,
        auditRunId: snapshot.audit.runId,
        auditCoverage: redisEntry.auditCoverage,
      },
    },
    preconditions: redisPreconditions,
    deploymentAuthorized: redisCanDeploy,
    gate: {
      ...redisDecision.gate,
      runtimeSwitch: redisCanDeploy ? "authorized" : "not-authorized",
      productionRelease: redisCanDeploy ? "redis-canary-authorized" : "blocked",
    },
  };
  return { ownerSignoffs: signoffs, redisDecision: adaptedRedis };
}

function effective(decisions, type) {
  const decision = decisions.find((candidate) => candidate.decisionType === type);
  if (decision === undefined) fail(`missing decision: ${type}`);
  return decision.current;
}

function validateSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 1 || snapshot.taskId !== "P1-M0-04-OWNER-ACCEPTANCE-EVIDENCE-SNAPSHOT"
    || snapshot.productionReleaseAuthorized !== false || snapshot.decisions?.length !== 5) fail("snapshot identity is invalid");
  validateAudit(snapshot.audit);
  for (const decision of snapshot.decisions) {
    const coverage = snapshot.audit.decisionCoverage?.[decision.decisionId];
    if ((snapshot.audit.schemaVersion === 2 && coverage === undefined)
      || (coverage !== undefined && coverage.length !== decision.history?.length)) {
      fail(`audit decision coverage length mismatch: ${decision.decisionId}`);
    }
    for (const entry of decision.history ?? []) {
      const expected = coverage?.[entry.sequence] ?? snapshot.audit.coverage[decision.personalOwner];
      if (entry.auditCoverage !== expected) fail(`audit decision coverage mismatch: ${decision.decisionId}`);
    }
  }
}

async function readAudit(options) {
  let bytes;
  if (options.auditSummary !== undefined) bytes = await readFile(resolve(options.auditSummary));
  else {
    if (!/^[A-Za-z0-9_.-]{3,128}$/u.test(options.auditContainer ?? "")
      || typeof options.auditPath !== "string" || !options.auditPath.startsWith("/")) fail("audit source is invalid");
    bytes = execFileSync("docker", ["exec", options.auditContainer, "cat", options.auditPath], { maxBuffer: 1024 * 1024 });
  }
  return { bytes, value: parseJson(bytes, "audit summary") };
}

function validateAudit(audit) {
  const legacyAaa = audit?.coverage?.aaa === "receipt-and-posthoc-verify-only-audit-enabled-after-decision"
    && audit.pathCounts?.signAaa === 0 && audit.decisionCoverage === undefined;
  const supersededAaa = audit?.schemaVersion === 2
    && audit.coverage?.aaa === "partial-original-complete-supersession"
    && audit.pathCounts?.signAaa >= 2
    && audit.decisionCoverage?.["p1-m0-04-aaa-security-20260718"]?.[0]
      === "receipt-and-posthoc-verify-only-audit-enabled-after-decision"
    && audit.decisionCoverage?.["p1-m0-04-aaa-security-20260718"]?.slice(1).every((value) => value === "complete");
  if (audit?.taskId !== "P1-M0-04-OWNER-APPROVAL-AUDIT" || !digestPattern.test(audit.snapshotSha256 ?? "")
    || audit.records < 1 || audit.activeOwnerSignoffTokens !== 0 || audit.rawTokensArchived !== false
    || audit.productionReleaseAuthorized !== false || (!legacyAaa && !supersededAaa)
    || audit.coverage?.bbb !== "complete" || audit.coverage?.ccc !== "complete" || audit.coverage?.ddd !== "complete") {
    fail("audit coverage is invalid");
  }
  if (audit.decisionCoverage !== undefined) {
    for (const [decisionId, coverage] of Object.entries(audit.decisionCoverage)) {
      if (!/^p1-m0-04-[a-z0-9-]+-20260718$/u.test(decisionId) || !Array.isArray(coverage)
        || coverage.length < 1 || coverage.some((value) => !["complete", "receipt-and-posthoc-verify-only-audit-enabled-after-decision"].includes(value))) {
        fail("audit decision coverage is invalid");
      }
    }
  }
}

function validateKeyRegistry(registry) {
  const keys = new Map((registry.owners ?? []).map((owner) => [owner.personalOwner, owner]));
  if (registry.taskId !== "P1-M0-04-OWNER-KEY-REGISTRY" || keys.size !== 4) fail("owner key registry is invalid");
  return keys;
}

function rejectCredentialFields(value) {
  if (Array.isArray(value)) return value.forEach(rejectCredentialFields);
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) fail(`forbidden credential field: ${key}`);
    rejectCredentialFields(nested);
  }
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { fail(`${label} is not valid JSON`); }
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(message) {
  throw new Error(`P1-M0-04 owner acceptance adapter failed: ${message}`);
}

function argumentsMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) values.set(argv[index], argv[index + 1]);
  return values;
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  const args = argumentsMap(argv);
  if (mode === "collect") {
    const snapshot = await collectOwnerAcceptanceEvidence({
      evidenceRoot: args.get("--evidence-root"),
      evidenceUriRoot: args.get("--evidence-uri-root"),
      keyRegistry: args.get("--key-registry"),
      keyRegistryUri: args.get("--key-registry-uri"),
      auditSummary: args.get("--audit-summary"),
      auditContainer: args.get("--audit-container"),
      auditPath: args.get("--audit-path"),
      auditSummaryUri: args.get("--audit-summary-uri"),
      collectedAt: args.get("--collected-at"),
    });
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  if (mode === "adapt") {
    const snapshot = JSON.parse(readFileSync(args.get("--snapshot") === "-" ? 0 : resolve(args.get("--snapshot")), "utf8"));
    const result = adaptOwnerAcceptance({
      snapshot,
      ownerSignoffs: JSON.parse(readFileSync(resolve(args.get("--owner-signoffs")), "utf8")),
      redisDecision: JSON.parse(readFileSync(resolve(args.get("--redis-decision")), "utf8")),
      generatedAt: args.get("--generated-at") ?? new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  fail("mode must be collect or adapt");
}

if ([fileURLToPath(import.meta.url), "-", "[stdin]"].includes(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
