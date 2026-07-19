import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const imagePattern = /^beelink[.]tail1e9cec[.]ts[.]net:5443\/yujian\/p1\/[a-z0-9-]+@sha256:[0-9a-f]{64}$/u;
const dataRoot = "/data/models/yujianAI";

export function validateRegistryKmsFreezePolicy(policy, productionOci, ownerSignoffs) {
  if (policy.schemaVersion !== 1 || policy.policyId !== "p1-m0-04-registry-kms-freeze-20260719") fail("policy identity is invalid");
  if (policy.status !== "implemented-awaiting-runtime-evidence-and-owner-supersession") fail("policy status is invalid");
  if (policy.dataRoot !== dataRoot) fail("data root must use the Beelink data volume");
  validateRegistry(policy.registry);
  validateKms(policy.kms);
  validateArtifacts(policy.artifacts, productionOci);
  validateEvidence(policy.evidence);
  validateOwnerDecision(policy.ownerDecision, ownerSignoffs);
  if (policy.productionReleaseAuthorized !== false) fail("policy cannot authorize production release");
  return policy;
}

export function validateRegistryKmsImplementation(record, policySha256) {
  if (record.schemaVersion !== 1 || record.taskId !== "P1-M0-04-REGISTRY-KMS-FREEZE-IMPLEMENTATION") fail("implementation identity is invalid");
  if (!Number.isFinite(Date.parse(record.generatedAt))) fail("implementation generatedAt is invalid");
  if (record.status !== "implementation-complete-runtime-not-executed") fail("implementation status is invalid");
  digest(record.policySha256, "implementation policySha256");
  if (record.policySha256 !== policySha256) fail("implementation policy digest does not match");
  const required = ["freezePolicy", "appendOnlyPlan", "registryBackup", "registryIsolatedRestore", "kmsRaftSnapshot", "kmsIsolatedRestore", "kmsRotation", "irreversibleRetirementGuard", "rollbackVerification"];
  if (required.some((field) => record.controls?.[field] !== "implemented")) fail("implementation controls are incomplete");
  const stages = ["registryBackup", "registryRestore", "kmsSnapshot", "kmsRestore", "kmsRotation", "rollback"];
  if (stages.some((field) => record.runtimeEvidence?.[field] !== "not-executed")) fail("runtime evidence was claimed without execution");
  if (record.tests?.execution !== "skipped-by-user" || record.tests?.passed !== null) fail("test boundary is invalid");
  if (record.ownerDecision?.owner !== "bbb" || record.ownerDecision.sequence !== 1
    || record.ownerDecision.decision !== "reject" || record.ownerDecision.supersedingDecisionRequired !== true) fail("owner boundary is invalid");
  if (record.productionReleaseAuthorized !== false) fail("implementation cannot authorize release");
  return record;
}

export function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function validateRegistry(registry) {
  if (registry?.host !== "beelink.tail1e9cec.ts.net:5443" || registry.bindAddress !== "100.110.127.117:5443"
    || registry.containerName !== "yujian-production-registry" || registry.transport !== "tailscale-tls-basic-auth") fail("registry endpoint is invalid");
  for (const field of ["dataPath", "backupPath", "evidencePath"]) dataPath(registry[field], `registry.${field}`);
  if (!imagePattern.test(registry.runtimeImage ?? "") || registry.deleteEnabled !== false
    || registry.digestPinRequired !== true || registry.tagMutation !== "release-tool-denied") fail("registry immutability boundary is invalid");
  if (registry.garbageCollection !== "manual-after-verified-backup-and-owner-window") fail("registry garbage collection boundary is invalid");
  if (!Number.isFinite(Date.parse(registry.tls?.certificateNotAfter)) || registry.tls.renewBeforeDays !== 30 || registry.tls.owner !== "bbb") fail("registry TLS policy is invalid");
  validateRecovery(registry.recovery, "isolated-loopback-registry", "127.0.0.1:55443");
  if (registry.recovery.productionRestoreRequiresSeparateApproval !== true) fail("production registry restore approval is missing");
}

function validateKms(kms) {
  if (kms?.uri !== "openbao://yujian-oci-release" || kms.keyName !== "yujian-oci-release"
    || kms.algorithm !== "ecdsa-p256" || kms.exportable !== false || kms.plaintextBackupAllowed !== false) fail("KMS key boundary is invalid");
  if (!/^openbao\/openbao:2[.]4[.]1@sha256:[0-9a-f]{64}$/u.test(kms.runtimeImage ?? "")) fail("KMS runtime image is not pinned");
  if (JSON.stringify(kms.addresses) !== JSON.stringify(["https://127.0.0.1:18200", "https://127.0.0.1:18201", "https://127.0.0.1:18202"])) fail("KMS addresses are invalid");
  if (kms.clusterBoundary !== "three-voters-single-beelink-host") fail("KMS fault domain must remain explicit");
  digest(kms.publicKeySha256, "KMS public key");
  dataPath(kms.raftSnapshotPath, "KMS snapshot path");
  validateRecovery(kms.recovery, "isolated-single-node-raft-restore", "127.0.0.1:19200");
  if (kms.rotation?.owner !== "bbb" || kms.rotation.securityOwner !== "aaa"
    || kms.rotation.minimumIntervalDays !== 90 || kms.rotation.preserveHistoricalPublicKeys !== true
    || kms.rotation.automaticOldVersionRetirement !== false
    || kms.rotation.irreversibleRetirementRequiresFreshOwnerReceipts !== true
    || kms.rotation.rollbackModel !== "preserve-old-public-key-and-digest-verification") fail("KMS rotation policy is invalid");
}

function validateRecovery(recovery, mode, bindAddress) {
  if (recovery?.mode !== mode || recovery.bindAddress !== bindAddress
    || recovery.rpoTargetSeconds !== 86400 || recovery.rtoTargetSeconds !== 14400) fail(`${mode} recovery target is invalid`);
}

function validateArtifacts(artifacts, productionOci) {
  if (!Array.isArray(artifacts) || artifacts.length !== 4 || productionOci?.images?.length !== 4) fail("exactly four artifacts are required");
  const source = new Map(productionOci.images.map((image) => [image.id, image.digestReference]));
  const seen = new Set();
  for (const artifact of artifacts) {
    if (seen.has(artifact.id) || !imagePattern.test(artifact.digestReference ?? "")) fail("artifact identity is invalid");
    seen.add(artifact.id);
    if (source.get(artifact.id) !== artifact.digestReference) fail(`${artifact.id} differs from production OCI evidence`);
  }
}

function validateEvidence(evidence) {
  const expected = ["registry-backup", "registry-isolated-restore", "kms-raft-snapshot", "kms-isolated-restore", "kms-key-rotation", "rollback-verification"];
  if (evidence?.appendOnly !== true || evidence.overwriteAllowed !== false || evidence.rawSecretsAllowed !== false
    || JSON.stringify(evidence.requiredStages) !== JSON.stringify(expected)) fail("evidence policy is invalid");
}

function validateOwnerDecision(ownerDecision, signoffs) {
  const decision = signoffs?.decisions?.find((value) => value.decisionType === "registry-kms-freeze");
  const frozen = decision?.history?.[ownerDecision?.sequence];
  if (ownerDecision?.decisionId !== decision?.decisionId || ownerDecision.sequence !== frozen?.sequence
    || ownerDecision.decision !== frozen?.decision
    || ownerDecision.receiptPath !== frozen?.receipt?.path || ownerDecision.receiptSha256 !== frozen?.receipt?.sha256
    || ownerDecision.decision !== "reject" || ownerDecision.supersedingDecisionRequired !== true) fail("current bbb reject receipt is not preserved");
}

function dataPath(value, field) {
  if (typeof value !== "string" || !value.startsWith(`${dataRoot}/`) || value.includes("..")) fail(`${field} is outside the data root`);
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function fail(message) {
  throw new Error(`P1-M0-04 registry/KMS freeze invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const policyPath = resolve(process.env.P1_M0_04_REGISTRY_KMS_POLICY ?? "infra/registry/beelink/freeze-policy.json");
  const ociPath = resolve(process.env.P1_M0_04_PRODUCTION_OCI_FILE ?? "docs/acceptance/p1-production-oci-evidence.json");
  const ownerPath = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  validateRegistryKmsFreezePolicy(policy, JSON.parse(readFileSync(ociPath, "utf8")), JSON.parse(readFileSync(ownerPath, "utf8")));
  const implementationPath = process.env.P1_M0_04_REGISTRY_KMS_IMPLEMENTATION;
  if (implementationPath) validateRegistryKmsImplementation(JSON.parse(readFileSync(resolve(implementationPath), "utf8")), sha256File(policyPath));
  process.stdout.write(`Registry/KMS freeze policy verified: artifacts=${policy.artifacts.length}; owner=${policy.ownerDecision.decision}; release=false\n`);
}
