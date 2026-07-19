import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const remotePattern = /^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\//u;

export function validateLicenseRemediationEvidence(evidence) {
  if (evidence.schemaVersion !== 1 || evidence.taskId !== "P1-M0-04-LICENSE-REMEDIATION") fail("identity is invalid");
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt is invalid");
  if (evidence.status !== "engineering-remediation-complete-legal-owner-blocked") fail("status is invalid");
  if (evidence.deploymentAllowed !== false) fail("remediation evidence cannot authorize deployment");
  const environment = evidence.environment;
  if (environment?.server !== "beelink" || environment.platform !== "linux/amd64"
    || !/^p1-m0-04-license-remediation-[0-9]{8}T[0-9]{6}Z$/u.test(environment.runId ?? "")) fail("environment is invalid");
  remotePath(environment.runRoot, "environment.runRoot");
  if (!environment.runRoot.endsWith(`/${environment.runId}`)) fail("run root is inconsistent");

  const summary = evidence.summary;
  if (summary?.declaredNoAssertion !== 335 || summary.originalConcludedNoAssertion !== 405
    || summary.remediatedConcludedNoAssertion !== 0 || summary.legalOwnerReviewRequired !== 1) fail("summary counts are invalid");
  const expectedStatuses = {
    "engineering-concluded": 331,
    "informational-aggregate": 2,
    "legal-owner-review-required": 1,
    "no-independent-content": 1
  };
  if (JSON.stringify(summary.resolutionStatusCounts) !== JSON.stringify(expectedStatuses)) fail("resolution counts are invalid");
  if (Object.values(summary.resolutionStatusCounts).reduce((sum, value) => sum + value, 0) !== 335) fail("resolution total is invalid");

  for (const [name, artifact] of Object.entries(evidence.artifacts ?? {})) {
    remotePath(artifact.path, `artifacts.${name}.path`);
    if (!artifact.path.startsWith(`${environment.runRoot}/`)) fail(`${name} is outside the immutable run root`);
    digest(artifact.sha256, `artifacts.${name}.sha256`);
  }
  if (evidence.artifacts?.inventory?.records !== 335
    || evidence.artifacts?.openbaoSourceArchive?.sha256 !== "sha256:5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7") {
    fail("artifact inventory is invalid");
  }

  if (evidence.signature?.mode !== "cosign-sign-blob"
    || evidence.signature.keyClass !== "engineering-evidence-non-production"
    || evidence.signature.verified !== true) fail("signature boundary is invalid");
  remotePath(evidence.signature.bundlePath, "signature.bundlePath");
  if (!evidence.signature.bundlePath.startsWith(`${environment.runRoot}/`)) fail("signature is outside the run root");
  digest(evidence.signature.bundleSha256, "signature.bundleSha256");
  digest(evidence.signature.publicKeySha256, "signature.publicKeySha256");

  const reedsolomon = evidence.reedsolomonBoundary;
  if (reedsolomon?.module !== "github.com/yeqown/reedsolomon" || reedsolomon.version !== "v1.0.0"
    || reedsolomon.tagCommit !== "5441098c575e61f884a016a3398726d2295fa995"
    || reedsolomon.licenseFileInTag !== false
    || reedsolomon.laterMitCommit !== "c5f4bc9af094852b52e593a5f964647c43028c51"
    || reedsolomon.licenseConcluded !== "LicenseRef-Yujian-ReedSolomon-Pending-Legal"
    || reedsolomon.status !== "legal-owner-review-required") fail("reedsolomon boundary is invalid");
  digest(reedsolomon.laterMitUpstreamBlobSha256, "reedsolomon later MIT hash");

  const owners = new Map((evidence.owners ?? []).map((owner) => [owner.role, owner]));
  if (owners.get("release-owner")?.personalOwner !== "bbb" || owners.get("release-owner")?.status !== "registry-kms-current-rejected-sequence-1"
    || owners.get("legal-owner")?.personalOwner !== "ccc" || owners.get("legal-owner")?.status !== "current-rejected-sequence-1"
    || owners.get("compliance-owner")?.personalOwner !== "ddd" || owners.get("compliance-owner")?.status !== "current-approved-sequence-1") {
    fail("owner boundary is invalid");
  }
  if (evidence.protectedRuntime?.unchanged !== true || evidence.protectedRuntime.allHealthy !== true
    || evidence.protectedRuntime.restartCount !== 0) fail("protected runtime changed");
  if (evidence.gate?.noAssertionEngineeringRemediation !== "passed-335-classified-zero-concluded-noassertion"
    || evidence.gate.licenseNoticeReview !== "rejected-ccc-sequence-1"
    || evidence.gate.sourceOffer !== "actual-source-bundled-awaiting-legal-owner"
    || evidence.gate.registryPromotion !== "not-authorized-bbb-sequence-1-reject"
    || evidence.gate.runtimeSwitch !== "not-authorized"
    || evidence.gate.productionRelease !== "blocked") fail("gate boundary is invalid");
  return evidence;
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is not a sha256 digest`);
}

function remotePath(value, field) {
  if (!remotePattern.test(value ?? "")) fail(`${field} is outside the Beelink evidence root`);
}

function fail(message) {
  throw new Error(`P1-M0-04 license remediation evidence invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_LICENSE_REMEDIATION_FILE ?? "docs/acceptance/p1-license-remediation-evidence.json");
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  validateLicenseRemediationEvidence(evidence);
  process.stdout.write("P1-M0-04 license remediation verified: 335 classified; concluded-NOASSERTION=0; legal-owner=blocked\n");
}
