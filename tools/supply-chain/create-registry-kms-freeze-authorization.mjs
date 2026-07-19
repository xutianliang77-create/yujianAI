import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateRegistryKmsFreezePolicy } from "./verify-registry-kms-freeze.mjs";

const policyPath = resolve(process.env.P1_M0_04_REGISTRY_KMS_POLICY ?? "infra/registry/beelink/freeze-policy.json");
const ownerPath = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
const ociPath = resolve(process.env.P1_M0_04_PRODUCTION_OCI_FILE ?? "docs/acceptance/p1-production-oci-evidence.json");
const output = resolve(process.env.P1_M0_04_FREEZE_AUTHORIZATION ?? "/data/models/yujianAI/registry/evidence/registry-kms-freeze/freeze-authorization.json");
const policyBytes = readFileSync(policyPath);
const policy = JSON.parse(policyBytes);
const owners = JSON.parse(readFileSync(ownerPath, "utf8"));
validateRegistryKmsFreezePolicy(policy, JSON.parse(readFileSync(ociPath, "utf8")), owners);

const bbbDecision = owners.decisions.find((value) => value.decisionType === "registry-kms-freeze");
const bbb = bbbDecision?.history?.at(-1);
const aaaDecision = owners.decisions.find((value) => value.decisionType === "security-evidence");
const aaa = aaaDecision?.history?.at(-1);
if (bbb?.sequence <= policy.ownerDecision.sequence || !["approve", "approve-with-conditions"].includes(bbb?.decision)) {
  throw new Error("a superseding bbb approval is required before Registry/KMS maintenance authorization");
}
if (!["approve", "time-bound-exception"].includes(aaa?.decision)) {
  throw new Error("a current aaa security approval is required before Registry/KMS maintenance authorization");
}

const receipt = (entry) => ({
  decisionId: entry.decisionId,
  sequence: entry.sequence,
  decision: entry.decision,
  decidedAt: entry.decidedAt,
  path: entry.receipt.path,
  sha256: entry.receipt.sha256,
  signatureVerified: entry.receipt.signatureVerified,
  credentialRevoked: entry.receipt.credentialRevoked,
});
const authorization = {
  schemaVersion: 1,
  taskId: "P1-M0-04-REGISTRY-KMS-FREEZE-AUTHORIZATION",
  generatedAt: new Date().toISOString(),
  policyId: policy.policyId,
  policySha256: `sha256:${createHash("sha256").update(policyBytes).digest("hex")}`,
  releaseOwner: receipt(bbb),
  securityOwner: receipt(aaa),
  permittedActions: ["registry-backup", "registry-isolated-restore", "kms-raft-snapshot", "kms-isolated-restore", "kms-key-rotation", "rollback-verification"],
  irreversibleKeyRetirementAuthorized: false,
  maintenanceAuthorized: true,
  productionRestoreAuthorized: false,
  productionReleaseAuthorized: false,
};
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const descriptor = openSync(output, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(authorization, null, 2)}\n`); } finally { closeSync(descriptor); }
process.stdout.write(`Registry/KMS maintenance authorization created: ${output}\n`);
