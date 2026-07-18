import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const remotePattern = /^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\//u;
const ownerMap = new Map([
  ["security-owner", { person: "aaa", status: "current-approved-sequence-1" }],
  ["release-owner", { person: "bbb", status: "registry-kms-current-rejected-sequence-1" }],
  ["legal-owner", { person: "ccc", status: "current-rejected-sequence-1" }],
  ["compliance-owner", { person: "ddd", status: "current-approved-sequence-1" }]
]);

export function validateRemediatedCandidateEvidence(evidence) {
  if (evidence.schemaVersion !== 1 || evidence.taskId !== "P1-M0-04-REMEDIATED-CANDIDATES") fail("identity is invalid");
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt is invalid");
  if (evidence.status !== "scan-and-runtime-regression-passed-owner-blocked") fail("status is invalid");
  if (evidence.deploymentAllowed !== false) fail("local candidates cannot authorize deployment");
  if (evidence.environment?.server !== "beelink" || evidence.environment?.platform !== "linux/amd64") fail("environment is invalid");
  for (const field of ["buildResult", "scanRoot"]) remotePath(evidence.environment?.[field], `environment.${field}`);
  for (const value of Object.values(evidence.source ?? {})) digest(value, "source hash");

  if (!Array.isArray(evidence.images) || evidence.images.length !== 2) fail("exactly two images are required");
  let critical = 0;
  let high = 0;
  let noAssertion = 0;
  for (const image of evidence.images) {
    if (image.artifactClass !== "local-pre-registry") fail(`${image.id} artifact class is invalid`);
    if ("registryDigest" in image || "registryReference" in image) fail(`${image.id} must not claim a registry digest`);
    digest(image.localImageId, `${image.id}.localImageId`);
    if (image.sbom?.spdxVersion !== "SPDX-2.3" || !Number.isInteger(image.sbom?.packages) || image.sbom.packages <= 0) fail(`${image.id} SBOM is invalid`);
    remotePath(image.sbom?.path, `${image.id}.sbom.path`);
    digest(image.sbom?.sha256, `${image.id}.sbom.sha256`);
    remotePath(image.vulnerabilityScan?.path, `${image.id}.scan.path`);
    digest(image.vulnerabilityScan?.sha256, `${image.id}.scan.sha256`);
    for (const severity of ["negligible", "low", "medium", "high", "critical", "unknown"]) {
      if (!Number.isInteger(image.vulnerabilityScan?.counts?.[severity]) || image.vulnerabilityScan.counts[severity] < 0) fail(`${image.id}.${severity} is invalid`);
    }
    if (image.vulnerabilityScan.counts.critical !== 0) fail(`${image.id} contains Critical findings`);
    if (image.highFindings?.length !== image.vulnerabilityScan.counts.high) fail(`${image.id} High inventory is inconsistent`);
    for (const finding of image.highFindings) {
      if (typeof finding.advisory !== "string" || !Array.isArray(finding.fixedVersions) || finding.fixedVersions.length === 0) fail(`${image.id} High finding is invalid`);
    }
    if (!Array.isArray(image.licensePayloads) || image.licensePayloads.length < 2) fail(`${image.id} license payloads are incomplete`);
    for (const license of image.licensePayloads) {
      if (!license.path?.startsWith("/licenses/")) fail(`${image.id} license path is invalid`);
      digest(license.sha256, `${image.id} license hash`);
    }
    if (typeof image.requiredRegression !== "string" || image.requiredRegression.length < 20) fail(`${image.id} regression requirement is missing`);
    critical += image.vulnerabilityScan.counts.critical;
    high += image.vulnerabilityScan.counts.high;
    noAssertion += image.sbom.licensesNoAssertion;
  }
  if (evidence.summary?.unwaivedCritical !== critical || evidence.summary?.highFindings !== high
    || evidence.summary?.licensesNoAssertion !== noAssertion) fail("summary is inconsistent");
  if (evidence.summary?.licensesConcludedNoAssertion !== 0) fail("license conclusion layer is incomplete");
  if (critical !== 0 || high !== 0 || noAssertion === 0) fail("review boundaries are inconsistent");
  if (evidence.summary?.securityReviewRequired !== true || evidence.summary?.legalReviewRequired !== true) fail("owner review flags are invalid");

  validateLicenseRemediation(evidence.licenseRemediation, noAssertion);

  if (evidence.signature?.mode !== "cosign-sign-blob" || evidence.signature?.keyClass !== "engineering-evidence-non-production") fail("signature class is invalid");
  if (evidence.signature?.verified !== true
    || evidence.signature?.productionOciSignature !== "verified-see-p1-production-oci-evidence"
    || evidence.signature?.productionOciEvidence !== "docs/acceptance/p1-production-oci-evidence.json") fail("signature boundary is invalid");
  for (const field of ["statementPath", "bundlePath"]) remotePath(evidence.signature?.[field], `signature.${field}`);
  for (const field of ["statementSha256", "bundleSha256", "publicKeySha256"]) digest(evidence.signature?.[field], `signature.${field}`);

  const owners = new Map((evidence.owners ?? []).map((owner) => [owner.role, owner]));
  for (const [role, expected] of ownerMap) {
    const owner = owners.get(role);
    if (owner?.personalOwner !== expected.person || owner.status !== expected.status) fail(`${role} status is invalid`);
  }
  validateRuntimeRegression(evidence.runtimeRegression, evidence.images);
  if (evidence.protectedRuntime?.unchanged !== true || evidence.protectedRuntime?.allHealthy !== true || evidence.protectedRuntime?.restartCount !== 0) fail("protected runtime changed");
  if (evidence.gate?.criticalThreshold !== "passed"
    || evidence.gate?.securityHighReview !== "not-required-high-zero"
    || evidence.gate?.securityOwnerSignoff !== "approved-aaa-sequence-1"
    || evidence.gate?.licenseNoticeReview !== "rejected-ccc-sequence-1-compliance-approved-ddd-sequence-1"
    || evidence.gate?.runtimeRegression !== "passed"
    || evidence.gate?.productionOciSignature !== "passed"
    || evidence.gate?.runtimeSwitch !== "not-authorized"
    || evidence.gate?.registryPromotion !== "not-authorized"
    || evidence.gate?.productionRelease !== "blocked") fail("gate state is invalid");
  return evidence;
}

function validateLicenseRemediation(remediation, declaredNoAssertion) {
  if (remediation?.evidence !== "docs/acceptance/p1-license-remediation-evidence.json"
    || remediation.status !== "engineering-remediation-complete-legal-owner-blocked"
    || !/^p1-m0-04-license-remediation-[0-9]{8}T[0-9]{6}Z$/u.test(remediation.runId ?? "")
    || remediation.declaredNoAssertion !== declaredNoAssertion
    || remediation.concludedNoAssertion !== 0
    || remediation.legalOwnerReviewRequired !== 1
    || remediation.sourceOffer !== "actual-source-bundled-awaiting-legal-owner") {
    fail("license remediation boundary is invalid");
  }
  remotePath(remediation.reportPath, "licenseRemediation.reportPath");
  if (!remediation.reportPath.includes(`/${remediation.runId}/report.json`)) fail("license remediation report path is inconsistent");
  digest(remediation.reportSha256, "licenseRemediation.reportSha256");
  digest(remediation.inventorySha256, "licenseRemediation.inventorySha256");
}

function validateRuntimeRegression(regression, images) {
  if (regression?.status !== "passed"
    || !/^p1-m0-04-remediated-regression-[0-9]{8}T[0-9]{6}Z$/u.test(regression.runId ?? "")
    || !Number.isFinite(Date.parse(regression.generatedAt))) fail("runtime regression identity is invalid");
  remotePath(regression.reportPath, "runtimeRegression.reportPath");
  if (!regression.reportPath.includes(`/${regression.runId}/report.json`)) fail("runtime regression report path is inconsistent");
  for (const field of ["reportSha256", "runnerSha256", "platformAcceptanceSha256"]) {
    digest(regression[field], `runtimeRegression.${field}`);
  }

  const postgresImage = images.find((image) => image.id.startsWith("postgres-"));
  const postgres = regression.postgres;
  if (postgres?.localImageId !== postgresImage?.localImageId || postgres.migrations !== 11
    || postgres.transaction !== "committed" || postgres.outbox !== "visible"
    || postgres.cas !== "stale-writer-rejected" || postgres.containerDeleteRecreate !== true) {
    fail("PostgreSQL runtime regression is incomplete");
  }
  const backup = postgres.backup;
  digest(backup?.sha256, "runtimeRegression.postgres.backup.sha256");
  if (backup?.format !== "pg_dump-custom" || backup.isolatedRestore !== true
    || !Number.isInteger(backup.rtoMs) || backup.rtoMs < 0 || backup.restoredMigrations !== 11
    || backup.restoredOutbox !== true || backup.restoredAudit !== true || backup.restoredUsage !== true
    || backup.restoredRevokedApiKey !== true) fail("PostgreSQL restore regression is incomplete");

  const openbaoImage = images.find((image) => image.id.startsWith("openbao-"));
  const openbao = regression.openbao;
  if (openbao?.localImageId !== openbaoImage?.localImageId
    || openbao.rollingUpgrade !== "2.4.1-to-2.5.4-yujian.2"
    || openbao.versions?.length !== 3 || !openbao.versions.every((version) => version === "2.5.4-yujian.2")
    || openbao.tlsVerified !== true || openbao.loopbackOnly !== true
    || openbao.transitSignatureVerified !== true
    || openbao.failover !== "leader-stopped-read-from-survivor"
    || openbao.secretBoundary !== "runtime-token-read-only") fail("OpenBao runtime regression is incomplete");
  for (const phase of ["before", "afterUpgrade", "afterRestore"]) {
    if (openbao.raft?.[phase]?.peers !== 3 || openbao.raft[phase].voters !== 3) fail(`OpenBao Raft ${phase} is invalid`);
  }
  digest(openbao.raft?.snapshotSha256, "runtimeRegression.openbao.raft.snapshotSha256");
  if (openbao.raft?.restoreVerified !== true
    || openbao.apiKey?.create !== "one-time-secret"
    || openbao.apiKey?.rotate !== "old-and-new-grace-accepted"
    || openbao.apiKey?.revoke !== "old-and-new-rejected"
    || openbao.apiKey?.secretPersistence !== "absent") fail("OpenBao/API-key recovery regression is incomplete");

  if (regression.isolation?.currentRuntimeSwitched !== false
    || regression.isolation?.candidateContainersRemoved !== true
    || regression.isolation?.protectedRuntimeUnchanged !== true
    || regression.isolation?.protectedRuntimeAllHealthy !== true) fail("runtime regression isolation is invalid");
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remotePattern.test(value ?? "")) fail(`${field} is outside the Beelink evidence root`);
}

function fail(message) {
  throw new Error(`P1-M0-04 remediated evidence invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_REMEDIATED_FILE ?? "docs/acceptance/p1-remediated-candidate-evidence.json");
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  validateRemediatedCandidateEvidence(evidence);
  process.stdout.write(`P1-M0-04 remediated evidence verified: Critical=${evidence.summary.unwaivedCritical}; High=${evidence.summary.highFindings}; deployment=false\n`);
}
