import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateFreezeAuthorization } from "./verify-registry-kms-freeze-authorization.mjs";

const policyPath = resolve(process.env.P1_M0_04_REGISTRY_KMS_POLICY ?? "infra/registry/beelink/freeze-policy.json");
const ownerPath = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
const freezePath = resolve(required("P1_M0_04_FREEZE_AUTHORIZATION"));
const rotationRun = resolve(required("P1_M0_04_KMS_ROTATION_RUN"));
const output = resolve(process.env.P1_M0_04_KMS_RETIREMENT_AUTHORIZATION ?? "/data/models/yujianAI/registry/evidence/registry-kms-freeze/kms-retirement-authorization.json");
const owners = JSON.parse(readFileSync(ownerPath, "utf8"));
const freeze = JSON.parse(readFileSync(freezePath, "utf8"));
const rotation = JSON.parse(readFileSync(resolve(rotationRun, "result.json"), "utf8"));
validateFreezeAuthorization(freeze, policyPath, owners, { requireCurrent: false });
if (rotation.taskId !== "P1-M0-04-KMS-KEY-ROTATION" || rotation.status !== "passed" || rotation.oldVersionRetired !== false) {
  throw new Error("a passed, non-retired KMS rotation result is required");
}

const current = (type) => owners.decisions.find((value) => value.decisionType === type)?.history?.at(-1);
const bbb = current("registry-kms-freeze");
const aaa = current("security-evidence");
for (const [owner, now, prior, allowed] of [["bbb", bbb, freeze.releaseOwner, ["approve", "approve-with-conditions"]], ["aaa", aaa, freeze.securityOwner, ["approve", "time-bound-exception"]]]) {
  if (now?.sequence <= prior.sequence || Date.parse(now?.decidedAt) <= Date.parse(rotation.generatedAt) || !allowed.includes(now?.decision)) {
    throw new Error(`a fresh post-rotation ${owner} approval is required for irreversible retirement`);
  }
}
const receipt = (entry) => ({ decisionId: entry.decisionId, sequence: entry.sequence, decision: entry.decision, decidedAt: entry.decidedAt, path: entry.receipt.path, sha256: entry.receipt.sha256, signatureVerified: entry.receipt.signatureVerified, credentialRevoked: entry.receipt.credentialRevoked });
const authorization = {
  schemaVersion: 1,
  taskId: "P1-M0-04-KMS-RETIREMENT-AUTHORIZATION",
  generatedAt: new Date().toISOString(),
  rotationRun,
  rotationResultSha256: sha256(resolve(rotationRun, "result.json")),
  minAvailableVersion: rotation.rotation.newVersion,
  releaseOwner: receipt(bbb),
  securityOwner: receipt(aaa),
  irreversibleKeyRetirementAuthorized: true,
  productionReleaseAuthorized: false,
};
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const descriptor = openSync(output, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(authorization, null, 2)}\n`); } finally { closeSync(descriptor); }
process.stdout.write(`Irreversible KMS retirement authorization created: ${output}\n`);

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function sha256(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}
