import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const remoteRootPattern = /^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\//u;
const severities = ["negligible", "low", "medium", "high", "critical", "unknown"];
const requiredOwnerRoles = ["compliance-owner", "legal-owner", "release-owner", "security-owner"];
const requiredRuntimeServices = ["openbao", "postgres", "redis"];

export function validateCandidateEvidence(evidence) {
  if (evidence.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (evidence.taskId !== "P1-M0-04-CANDIDATES") fail("taskId is invalid");
  if (!/^p1-m0-04-candidates-[0-9TZ]+$/u.test(evidence.runId ?? "")) fail("runId is invalid");
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt must be an ISO timestamp");
  if (evidence.deploymentAllowed !== false) fail("candidate evidence cannot authorize deployment");
  if (evidence.environment?.server !== "beelink" || evidence.environment?.platform !== "linux/amd64") {
    fail("environment is invalid");
  }
  remotePath(evidence.environment?.evidenceRoot, "environment.evidenceRoot");
  if (!Number.isInteger(evidence.environment?.reportFiles) || evidence.environment.reportFiles <= 0) fail("report file count is invalid");
  if (evidence.environment?.reportMode !== "0600") fail("report files must be mode 0600");
  if (evidence.scope?.manifest !== "infra/upstream/p1-image-candidates.json") fail("candidate manifest path is invalid");
  digest(evidence.scope?.manifestSha256, "scope.manifestSha256");
  digest(evidence.scope?.runnerSha256, "scope.runnerSha256");
  digest(evidence.vulnerabilityDatabase?.checksum, "vulnerabilityDatabase.checksum");
  if (!Number.isFinite(Date.parse(evidence.vulnerabilityDatabase?.builtAt))) fail("vulnerability database timestamp is invalid");
  if (evidence.vulnerabilityDatabase?.sameAsCurrentImageRun !== true) fail("candidate scan must use the current-image database snapshot");

  const tools = new Map((evidence.tools ?? []).map((tool) => [tool.name, tool]));
  for (const name of ["syft", "grype", "cosign"]) {
    const tool = tools.get(name);
    if (!tool || typeof tool.version !== "string" || tool.checksumVerified !== true) fail(`${name} tool metadata is invalid`);
    digest(tool.sha256, `${name}.sha256`);
  }

  if (!Array.isArray(evidence.candidates) || evidence.candidates.length < 3) fail("candidates must contain the authorized services");
  let blocked = 0;
  let eligible = 0;
  let regressionPassed = 0;
  let criticalMatches = 0;
  const ids = new Set();
  for (const candidate of evidence.candidates) {
    if (typeof candidate.id !== "string" || ids.has(candidate.id)) fail("candidate id is missing or duplicated");
    ids.add(candidate.id);
    if (!/@sha256:[0-9a-f]{64}$/u.test(candidate.reference ?? "")) fail(`${candidate.id}.reference is not digest-pinned`);
    if (!/@sha256:[0-9a-f]{64}$/u.test(candidate.currentReference ?? "")) fail(`${candidate.id}.currentReference is not digest-pinned`);
    digest(candidate.registryDigest, `${candidate.id}.registryDigest`);
    if (candidate.reference.split("@").at(-1) !== candidate.registryDigest) fail(`${candidate.id}.registryDigest does not match the reference`);
    digest(candidate.localImageId, `${candidate.id}.localImageId`);
    if (candidate.platform !== "linux/amd64") fail(`${candidate.id}.platform is invalid`);
    if (candidate.sbom?.spdxVersion !== "SPDX-2.3" || !Number.isInteger(candidate.sbom?.packages) || candidate.sbom.packages <= 0) {
      fail(`${candidate.id}.sbom is invalid`);
    }
    remotePath(candidate.sbom?.path, `${candidate.id}.sbom.path`);
    digest(candidate.sbom?.sha256, `${candidate.id}.sbom.sha256`);
    remotePath(candidate.vulnerabilityScan?.path, `${candidate.id}.vulnerabilityScan.path`);
    digest(candidate.vulnerabilityScan?.sha256, `${candidate.id}.vulnerabilityScan.sha256`);
    for (const severity of severities) {
      const count = candidate.vulnerabilityScan?.counts?.[severity];
      if (!Number.isInteger(count) || count < 0) fail(`${candidate.id}.${severity} count is invalid`);
    }
    if (!Number.isInteger(candidate.licensesNoAssertion) || candidate.licensesNoAssertion < 0
      || candidate.licensesNoAssertion > candidate.sbom.packages) fail(`${candidate.id}.licensesNoAssertion is invalid`);
    const hasCritical = candidate.vulnerabilityScan.counts.critical > 0;
    if (hasCritical && candidate.regression !== undefined) fail(`${candidate.id}.regression cannot exist while Critical findings remain`);
    if (!hasCritical && candidate.regression !== undefined) validateRegression(candidate.regression, candidate.id);
    const expectedDecision = hasCritical
      ? "blocked"
      : candidate.regression === undefined
        ? "eligible-for-regression"
        : "regression-passed-awaiting-deployment-approval";
    if (candidate.decision !== expectedDecision) fail(`${candidate.id}.decision is inconsistent`);
    if (typeof candidate.requiredBeforeDeployment !== "string" || candidate.requiredBeforeDeployment.length === 0) {
      fail(`${candidate.id}.requiredBeforeDeployment is missing`);
    }
    criticalMatches += candidate.vulnerabilityScan.counts.critical;
    if (hasCritical) blocked += 1;
    else if (candidate.regression === undefined) eligible += 1;
    else regressionPassed += 1;
  }

  if (evidence.summary?.blocked !== blocked
    || evidence.summary?.eligibleForRegression !== eligible
    || evidence.summary?.regressionPassed !== regressionPassed) fail("candidate summary is inconsistent");
  if (evidence.summary?.totalCriticalMatchesAcrossAllAlternatives !== criticalMatches) fail("candidate Critical total is inconsistent");
  const expectedStatus = blocked > 0
    ? "blocked"
    : eligible > 0
      ? "eligible-for-regression"
      : "regression-passed-awaiting-deployment-approval";
  if (evidence.status !== expectedStatus) fail("candidate status is inconsistent");
  const signature = evidence.signature;
  for (const field of ["statementPath", "bundlePath", "publicKeyPath", "verificationLog"]) {
    remotePath(signature?.[field], `signature.${field}`);
  }
  for (const field of ["statementSha256", "bundleSha256", "publicKeySha256"]) {
    digest(signature?.[field], `signature.${field}`);
  }
  if (signature?.verified !== true) fail("candidate statement signature is not verified");
  if (evidence.currentRuntime?.unchanged !== true) fail("current runtime must remain unchanged");
  if (evidence.currentRuntime?.restartCount !== 0) fail("current runtime restart count must remain zero");
  for (const service of requiredRuntimeServices) {
    if (!/@sha256:[0-9a-f]{64}$/u.test(evidence.currentRuntime?.runningReferences?.[service] ?? "")) {
      fail(`${service} current runtime reference is not digest-pinned`);
    }
  }
  const ownerNominations = new Map((evidence.ownerNominations ?? []).map((owner) => [owner.role, owner]));
  for (const role of requiredOwnerRoles) {
    const owner = ownerNominations.get(role);
    if (!owner) fail(`${role} nomination is missing`);
    const assigned = typeof owner.personalOwner === "string" && owner.personalOwner.trim().length > 0;
    if (!assigned && (owner.personalOwner !== null || owner.status !== "awaiting-user-nomination")) {
      fail(`${role} unassigned nomination status is inconsistent`);
    }
    if (assigned) {
      if (owner.status !== "assigned-pending-signoff") fail(`${role} assigned nomination status is inconsistent`);
      if (typeof owner.appointedBy !== "string" || owner.appointedBy.trim().length === 0) fail(`${role} appointment approver is missing`);
      if (!Number.isFinite(Date.parse(owner.appointedAt))) fail(`${role} appointment date is invalid`);
    }
  }
  if (evidence.gate?.runtimeSwitch !== "not-authorized") fail("runtime switch must remain unauthorized");
  if (evidence.gate?.currentImageGate !== "blocked" || evidence.gate?.productionRelease !== "blocked") {
    fail("candidate evidence cannot pass the current image or production release gate");
  }
  return evidence;
}

function validateRegression(regression, candidateId) {
  if (regression.status !== "passed") fail(`${candidateId}.regression status is invalid`);
  if (!/^p1-m0-04-redis-regression-[0-9TZ]+$/u.test(regression.runId ?? "")) {
    fail(`${candidateId}.regression runId is invalid`);
  }
  if (!Number.isFinite(Date.parse(regression.generatedAt))) fail(`${candidateId}.regression generatedAt is invalid`);
  remotePath(regression.reportPath, `${candidateId}.regression.reportPath`);
  digest(regression.reportSha256, `${candidateId}.regression.reportSha256`);
  if (!/^[0-9a-f]{40}$/u.test(regression.source?.repositoryCommit ?? "")) {
    fail(`${candidateId}.regression repositoryCommit is invalid`);
  }
  digest(regression.source?.nodeRunnerSha256, `${candidateId}.regression.nodeRunnerSha256`);
  digest(regression.source?.shellRunnerSha256, `${candidateId}.regression.shellRunnerSha256`);
  for (const phaseName of ["initial", "postRestart", "postRebuild"]) {
    const phase = regression.phases?.[phaseName];
    if (phase?.rateAttempts !== 100 || phase.rateAllowed !== 20
      || phase.quotaAttempts !== 30 || phase.quotaSuccessful !== 3
      || phase.lease !== "single-owner") fail(`${candidateId}.regression.${phaseName} is invalid`);
  }
  if (regression.persistence?.aofMarkerRecovered !== true
    || regression.persistence.containerRestart !== true
    || regression.persistence.containerDeleteRecreate !== true
    || regression.persistence.finalDbSize !== 0) fail(`${candidateId}.regression persistence is invalid`);
  if (regression.isolation?.loopbackOnly !== true
    || regression.isolation.currentRuntimeSwitched !== false
    || regression.isolation.candidateContainerRemoved !== true
    || regression.isolation.protectedRestartCountUnchanged !== true) fail(`${candidateId}.regression isolation is invalid`);
  if (regression.deploymentApproval !== "not-granted") fail(`${candidateId}.regression cannot authorize deployment`);
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remoteRootPattern.test(value ?? "")) fail(`${field} is outside the Beelink evidence root`);
}

function fail(message) {
  throw new Error(`P1-M0-04 candidate evidence invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_CANDIDATE_FILE ?? "docs/acceptance/p1-supply-chain-candidate-evidence.json");
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  validateCandidateEvidence(evidence);
  process.stdout.write(`P1-M0-04 candidate evidence verified: eligible=${evidence.summary.eligibleForRegression}; regression-passed=${evidence.summary.regressionPassed}; blocked=${evidence.summary.blocked}\n`);
}
