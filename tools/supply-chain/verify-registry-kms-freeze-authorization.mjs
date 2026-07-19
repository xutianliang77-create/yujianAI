import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./verify-registry-kms-freeze.mjs";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

export function validateFreezeAuthorization(record, policyPath, owners, options = {}) {
  if (record.schemaVersion !== 1 || record.taskId !== "P1-M0-04-REGISTRY-KMS-FREEZE-AUTHORIZATION") fail("identity is invalid");
  if (!Number.isFinite(Date.parse(record.generatedAt)) || record.policySha256 !== sha256File(policyPath)) fail("policy binding is invalid");
  const expectedActions = ["registry-backup", "registry-isolated-restore", "kms-raft-snapshot", "kms-isolated-restore", "kms-key-rotation", "rollback-verification"];
  if (JSON.stringify(record.permittedActions) !== JSON.stringify(expectedActions)) fail("permitted actions are invalid");
  const requireCurrent = options.requireCurrent ?? true;
  verifyReceipt(record.releaseOwner, owners, "registry-kms-freeze", ["approve", "approve-with-conditions"], requireCurrent);
  verifyReceipt(record.securityOwner, owners, "security-evidence", ["approve", "time-bound-exception"], requireCurrent);
  if (record.maintenanceAuthorized !== true || record.irreversibleKeyRetirementAuthorized !== false
    || record.productionRestoreAuthorized !== false || record.productionReleaseAuthorized !== false) fail("authorization boundary is invalid");
  return record;
}

function verifyReceipt(receipt, owners, type, decisions, requireCurrent) {
  const decision = owners?.decisions?.find((value) => value.decisionType === type);
  const entry = decision?.history?.[receipt?.sequence];
  if (receipt?.decisionId !== decision?.decisionId || (requireCurrent && receipt.sequence !== decision?.currentSequence)
    || receipt.sequence !== entry?.sequence || receipt.decision !== entry?.decision || !decisions.includes(receipt?.decision)
    || receipt.decidedAt !== entry?.decidedAt || receipt.path !== entry?.receipt?.path || receipt.sha256 !== entry?.receipt?.sha256
    || receipt.signatureVerified !== true || receipt.credentialRevoked !== true || !digestPattern.test(receipt.sha256 ?? "")) fail(`${type} receipt is invalid`);
}

function fail(message) {
  throw new Error(`P1-M0-04 Registry/KMS authorization invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const policyPath = resolve(process.env.P1_M0_04_REGISTRY_KMS_POLICY ?? "infra/registry/beelink/freeze-policy.json");
  const ownerPath = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
  const authorizationPath = resolve(process.env.P1_M0_04_FREEZE_AUTHORIZATION ?? "");
  if (!process.env.P1_M0_04_FREEZE_AUTHORIZATION) fail("P1_M0_04_FREEZE_AUTHORIZATION is required");
  validateFreezeAuthorization(JSON.parse(readFileSync(authorizationPath, "utf8")), policyPath, JSON.parse(readFileSync(ownerPath, "utf8")), { requireCurrent: true });
  process.stdout.write("Registry/KMS maintenance authorization verified; production restore=false; release=false\n");
}
