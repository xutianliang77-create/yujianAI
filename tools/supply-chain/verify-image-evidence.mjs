import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const remoteEvidencePattern = /^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\//u;
const severities = ["negligible", "low", "medium", "high", "critical", "unknown"];
const requiredOwners = ["compliance-owner", "legal-owner", "release-owner", "security-owner"];
const requiredTools = ["syft", "grype", "cosign"];

export function validateImageEvidence(evidence, options = {}) {
  if (evidence.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (evidence.taskId !== "P1-M0-04") fail("taskId must be P1-M0-04");
  if (!/^p1-m0-04-[0-9TZ]+$/u.test(evidence.runId ?? "")) fail("runId is invalid");
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt must be an ISO timestamp");
  if (!new Set(["passed-technical", "failed-technical"]).has(evidence.status)) fail("status is invalid");
  if (evidence.environment?.server !== "beelink") fail("environment.server must be beelink");
  if (evidence.environment?.platform !== "linux/amd64") fail("environment.platform must be linux/amd64");
  remotePath(evidence.environment?.evidenceRoot, "environment.evidenceRoot");
  if (evidence.scope?.policy !== "current-pinned-yujian-images") fail("scope.policy is invalid");
  if (!Array.isArray(evidence.scope?.excluded)) fail("scope.excluded must be an array");

  const tools = new Map((evidence.tools ?? []).map((tool) => [tool.name, tool]));
  for (const name of requiredTools) {
    const tool = tools.get(name);
    if (!tool || typeof tool.version !== "string" || tool.version.length === 0) fail(`${name} tool metadata is missing`);
    digest(tool.sha256, `${name}.sha256`);
    if (tool.checksumVerified !== true) fail(`${name} checksum must be verified`);
  }

  if (evidence.vulnerabilityPolicy?.maximumUnwaivedCritical !== 0) fail("critical threshold must be zero");
  if (evidence.vulnerabilityPolicy?.highSeverity !== "report-and-owner-review") fail("high severity policy is invalid");
  if (!Array.isArray(evidence.vulnerabilityPolicy?.exceptions)) fail("vulnerability exceptions must be an array");
  if (!Number.isFinite(Date.parse(evidence.vulnerabilityPolicy?.database?.builtAt))) fail("vulnerability database timestamp is invalid");
  digest(evidence.vulnerabilityPolicy?.database?.checksum, "vulnerability database checksum");

  if (!Array.isArray(evidence.images) || evidence.images.length === 0) fail("images must be non-empty");
  const imageIds = new Set();
  let unwaivedCritical = 0;
  for (const image of evidence.images) {
    if (typeof image.id !== "string" || image.id.length === 0 || imageIds.has(image.id)) fail("image id is missing or duplicated");
    imageIds.add(image.id);
    if (typeof image.reference !== "string" || !/@sha256:[0-9a-f]{64}$/u.test(image.reference)) fail(`${image.id}.reference must be digest-pinned`);
    digest(image.registryDigest, `${image.id}.registryDigest`);
    digest(image.localImageId, `${image.id}.localImageId`);
    if (image.platform !== "linux/amd64") fail(`${image.id}.platform must be linux/amd64`);
    if (image.sbom?.format !== "spdx-json" || image.sbom?.spdxVersion !== "SPDX-2.3") fail(`${image.id}.sbom format is invalid`);
    if (!Number.isInteger(image.sbom?.packages) || image.sbom.packages <= 0) fail(`${image.id}.sbom packages must be positive`);
    remotePath(image.sbom?.path, `${image.id}.sbom.path`);
    digest(image.sbom?.sha256, `${image.id}.sbom.sha256`);
    remotePath(image.vulnerabilityScan?.path, `${image.id}.vulnerabilityScan.path`);
    digest(image.vulnerabilityScan?.sha256, `${image.id}.vulnerabilityScan.sha256`);
    for (const severity of severities) {
      if (!Number.isInteger(image.vulnerabilityScan?.counts?.[severity]) || image.vulnerabilityScan.counts[severity] < 0) {
        fail(`${image.id}.vulnerabilityScan.counts.${severity} is invalid`);
      }
    }
    if (!Number.isInteger(image.vulnerabilityScan?.unwaivedCritical) || image.vulnerabilityScan.unwaivedCritical < 0) {
      fail(`${image.id}.vulnerabilityScan.unwaivedCritical is invalid`);
    }
    if (evidence.vulnerabilityPolicy.exceptions.length === 0
      && image.vulnerabilityScan.unwaivedCritical !== image.vulnerabilityScan.counts.critical) {
      fail(`${image.id}.vulnerabilityScan cannot waive Critical findings without an exception record`);
    }
    const expectedScanGate = image.vulnerabilityScan.unwaivedCritical === 0 ? "passed" : "blocked";
    if (image.vulnerabilityScan.gate !== expectedScanGate) fail(`${image.id}.vulnerabilityScan.gate is inconsistent`);
    unwaivedCritical += image.vulnerabilityScan.unwaivedCritical;
  }

  const signature = evidence.signature;
  if (signature?.mode !== "cosign-sign-blob") fail("signature.mode is invalid");
  if (signature?.keyClass !== "engineering-evidence-non-production") fail("signature.keyClass is invalid");
  for (const field of ["statementPath", "bundlePath", "publicKeyPath", "verificationLog"]) {
    remotePath(signature?.[field], `signature.${field}`);
  }
  for (const field of ["statementSha256", "bundleSha256", "publicKeySha256"]) {
    digest(signature?.[field], `signature.${field}`);
  }
  if (signature?.verified !== true) fail("signature must be verified");

  if (!Number.isInteger(evidence.licenseInventory?.packages) || evidence.licenseInventory.packages <= 0) {
    fail("licenseInventory.packages must be positive");
  }
  if (!Number.isInteger(evidence.licenseInventory?.packagesWithNoAssertion)
    || evidence.licenseInventory.packagesWithNoAssertion < 0
    || evidence.licenseInventory.packagesWithNoAssertion > evidence.licenseInventory.packages) {
    fail("licenseInventory.packagesWithNoAssertion is invalid");
  }
  const sbomPackages = evidence.images.reduce((total, image) => total + image.sbom.packages, 0);
  if (evidence.licenseInventory.packages !== sbomPackages) fail("licenseInventory.packages must equal the SBOM package total");
  if (evidence.licenseInventory?.packagesWithNoAssertion > 0 && evidence.legalReview?.status !== "pending-personal-owner-signoff") {
    fail("legal review cannot pass while SBOM licenses contain NOASSERTION");
  }

  const owners = new Map((evidence.owners ?? []).map((owner) => [owner.role, owner]));
  for (const role of requiredOwners) {
    const owner = owners.get(role);
    if (!owner) fail(`${role} owner evidence is missing`);
    const assigned = typeof owner.personalOwner === "string" && owner.personalOwner.trim().length > 0;
    const expectedStatus = assigned ? "assigned-pending-signoff" : "pending-personal-assignment";
    if (owner.status !== expectedStatus) fail(`${role} owner status is inconsistent`);
    if (assigned) {
      if (typeof owner.appointedBy !== "string" || owner.appointedBy.trim().length === 0) fail(`${role} appointment approver is missing`);
      if (!Number.isFinite(Date.parse(owner.appointedAt))) fail(`${role} appointment date is invalid`);
    }
  }
  if (evidence.legalReview?.status !== "pending-personal-owner-signoff") fail("legal review must remain pending until personal signoff");

  const technicalPass = unwaivedCritical === 0 && signature.verified;
  if (evidence.status === "passed-technical" && !technicalPass) fail("technical evidence cannot pass with unwaived critical vulnerabilities");
  if (evidence.status === "failed-technical" && technicalPass) fail("failed technical status is inconsistent with passing evidence");
  if (evidence.gate?.technicalEvidence !== (technicalPass ? "passed" : "blocked")) fail("technical gate is inconsistent");
  const pendingOwner = requiredOwners.some((role) => owners.get(role).status !== "assigned-pending-signoff");
  if (pendingOwner && evidence.gate?.formalGate0 === "passed") fail("formal Gate 0 cannot pass while personal owners are unassigned");
  if (pendingOwner && evidence.gate?.formalGate1 === "passed") fail("formal Gate 1 cannot pass while personal owners are unassigned");
  if (pendingOwner && evidence.gate?.productionRelease !== "blocked") fail("production release must be blocked while personal owners are unassigned");
  if (options.requirePass === true && (
    evidence.status !== "passed-technical"
    || evidence.licenseInventory.packagesWithNoAssertion !== 0
    || pendingOwner
    || evidence.gate?.productionRelease !== "approved"
  )) {
    fail("release gate is not passed");
  }
  return evidence;
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remoteEvidencePattern.test(value ?? "")) fail(`${field} must point to the Beelink P1-M0-04 evidence root`);
}

function fail(message) {
  throw new Error(`P1-M0-04 evidence invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const evidencePath = resolve(process.env.P1_M0_04_EVIDENCE_FILE ?? "docs/acceptance/p1-supply-chain-evidence.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  validateImageEvidence(evidence, { requirePass: process.env.P1_M0_04_REQUIRE_PASS === "true" });
  process.stdout.write(`P1-M0-04 evidence verified: images=${evidence.images.length}; status=${evidence.status}\n`);
}
