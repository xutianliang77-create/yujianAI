import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

export function validateKmsRetirementAuthorization(record, owners) {
  if (record.schemaVersion !== 1 || record.taskId !== "P1-M0-04-KMS-RETIREMENT-AUTHORIZATION") fail("identity is invalid");
  if (!Number.isFinite(Date.parse(record.generatedAt)) || typeof record.rotationRun !== "string") fail("time or rotation path is invalid");
  const rotationPath = resolve(record.rotationRun, "result.json");
  const rotation = JSON.parse(readFileSync(rotationPath, "utf8"));
  const rotationSha = `sha256:${createHash("sha256").update(readFileSync(rotationPath)).digest("hex")}`;
  if (record.rotationResultSha256 !== rotationSha || rotation.taskId !== "P1-M0-04-KMS-KEY-ROTATION"
    || rotation.status !== "passed" || rotation.oldVersionRetired !== false
    || record.minAvailableVersion !== rotation.rotation?.newVersion) fail("rotation binding is invalid");
  verifyReceipt(record.releaseOwner, owners, "registry-kms-freeze", ["approve", "approve-with-conditions"], rotation.generatedAt);
  verifyReceipt(record.securityOwner, owners, "security-evidence", ["approve", "time-bound-exception"], rotation.generatedAt);
  if (record.irreversibleKeyRetirementAuthorized !== true || record.productionReleaseAuthorized !== false) fail("authorization boundary is invalid");
  return record;
}

function verifyReceipt(receipt, owners, type, decisions, after) {
  const decision = owners?.decisions?.find((value) => value.decisionType === type);
  const current = decision?.history?.at(-1);
  if (receipt?.decisionId !== decision?.decisionId || receipt.sequence !== decision?.currentSequence
    || receipt.sequence !== current?.sequence || receipt.decision !== current?.decision || !decisions.includes(receipt?.decision)
    || receipt.decidedAt !== current?.decidedAt || Date.parse(receipt.decidedAt) <= Date.parse(after)
    || receipt.path !== current?.receipt?.path || receipt.sha256 !== current?.receipt?.sha256
    || receipt.signatureVerified !== true || receipt.credentialRevoked !== true || !digestPattern.test(receipt.sha256 ?? "")) fail(`${type} receipt is invalid`);
}

function fail(message) {
  throw new Error(`P1-M0-04 KMS retirement authorization invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.P1_M0_04_KMS_RETIREMENT_AUTHORIZATION) fail("P1_M0_04_KMS_RETIREMENT_AUTHORIZATION is required");
  const authorization = JSON.parse(readFileSync(resolve(process.env.P1_M0_04_KMS_RETIREMENT_AUTHORIZATION), "utf8"));
  const owners = JSON.parse(readFileSync(resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json"), "utf8"));
  validateKmsRetirementAuthorization(authorization, owners);
  process.stdout.write("Irreversible KMS retirement authorization verified; release=false\n");
}
