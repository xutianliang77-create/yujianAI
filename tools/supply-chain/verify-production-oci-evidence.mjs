import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const imagePattern = /^beelink[.]tail1e9cec[.]ts[.]net:5443\/yujian\/p1\/[a-z0-9-]+@sha256:[0-9a-f]{64}$/u;
const remotePattern = /^remote:\/data\/models\/yujianAI\/(registry\/evidence|evidence\/p1-m0-04)\//u;

export function validateProductionOciEvidence(evidence) {
  if (evidence.schemaVersion !== 1 || evidence.taskId !== "P1-M0-04-PRODUCTION-OCI-EVIDENCE") fail("identity is invalid");
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt is invalid");
  if (evidence.status !== "technical-signing-passed-owner-freeze-pending") fail("status is invalid");
  remotePath(evidence.environment?.summaryPath, "summaryPath");
  digest(evidence.environment?.summarySha256, "summarySha256");
  if (evidence.registry?.scan?.critical !== 0 || evidence.registry?.scan?.high !== 0) fail("registry vulnerability gate is not zero");
  if (evidence.registry?.tlsVerified !== true || evidence.registry?.tailscaleOnly !== true
    || evidence.registry?.unauthenticatedStatus !== 401 || evidence.registry?.authenticatedStatus !== 200
    || evidence.registry?.running !== true || evidence.registry?.restartCount !== 0) fail("registry runtime is invalid");
  if (!Number.isFinite(Date.parse(evidence.registry.certificateNotAfter))) fail("registry certificate expiry is invalid");
  if (evidence.kms?.uri !== "openbao://yujian-oci-release" || evidence.kms?.tlsVerified !== true
    || evidence.kms?.keyType !== "ecdsa-p256" || evidence.kms?.exportable !== false
    || evidence.kms?.allowPlaintextBackup !== false) fail("KMS boundary is invalid");
  digest(evidence.kms?.publicKeySha256, "KMS public key");
  if (!Array.isArray(evidence.images) || evidence.images.length !== 4) fail("exactly four signed images are required");
  for (const image of evidence.images) {
    if (!imagePattern.test(image.digestReference ?? "")) fail(`${image.id} digest reference is invalid`);
    for (const field of ["sbomSha256", "resultSha256"]) digest(image[field], `${image.id}.${field}`);
    if (image.signatureVerified !== true || image.attestationVerified !== true) fail(`${image.id} is not verified`);
  }
  remotePath(evidence.externalFetch?.path, "externalFetch.path");
  digest(evidence.externalFetch?.sha256, "externalFetch.sha256");
  if (evidence.externalFetch?.manifestsVerified !== 4 || evidence.externalFetch?.blobsVerified !== 44
    || evidence.externalFetch?.passed !== true) fail("external fetch is incomplete");
  if (evidence.protectedRuntime?.unchanged !== true || evidence.protectedRuntime?.allHealthy !== true
    || evidence.protectedRuntime?.restartCount !== 0) fail("protected runtime changed");
  const technical = ["technicalRegistryConfigured", "technicalKmsKeyConfigured", "allOciSignaturesVerified", "allSbomAttestationsVerified", "externalFetchVerified"];
  if (technical.some((field) => evidence.preconditions?.[field] !== true)) fail("technical preconditions are incomplete");
  const human = ["releaseOwnerFreezeSignedByBbb", "redisDecisionSignedByBbb", "securitySignedByAaa", "legalSignedByCcc", "complianceSignedByDdd"];
  if (human.some((field) => evidence.preconditions?.[field] !== false)) fail("unsigned human gate was forged");
  if (evidence.technicalStatus !== "passed" || evidence.productionReleaseAuthorized !== false) fail("authorization boundary is invalid");
  if (evidence.gate?.productionOciTechnical !== "passed" || evidence.gate?.releaseOwnerFreeze !== "pending-bbb"
    || evidence.gate?.productionRelease !== "blocked") fail("gate is invalid");
  return evidence;
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remotePattern.test(value ?? "")) fail(`${field} is outside the evidence roots`);
}

function fail(message) {
  throw new Error(`P1-M0-04 production OCI evidence invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_PRODUCTION_OCI_FILE ?? "docs/acceptance/p1-production-oci-evidence.json");
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  validateProductionOciEvidence(evidence);
  process.stdout.write(`Production OCI evidence verified: images=${evidence.images.length}; technical=passed; release=false\n`);
}
