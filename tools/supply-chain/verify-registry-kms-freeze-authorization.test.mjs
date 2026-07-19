import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFreezeAuthorization, } from "./verify-registry-kms-freeze-authorization.mjs";
import { sha256File } from "./verify-registry-kms-freeze.mjs";

const policyPath = "infra/registry/beelink/freeze-policy.json";
const owners = JSON.parse(readFileSync("docs/acceptance/p1-m0-04-owner-signoffs.json", "utf8"));

test("rejects authorization while bbb current decision remains reject", () => {
  const bbb = owners.decisions.find((value) => value.decisionType === "registry-kms-freeze").history.at(-1);
  const aaa = owners.decisions.find((value) => value.decisionType === "security-evidence").history.at(-1);
  const receipt = (entry) => ({ decisionId: entry.decisionId, sequence: entry.sequence, decision: entry.decision, decidedAt: entry.decidedAt, path: entry.receipt.path, sha256: entry.receipt.sha256, signatureVerified: true, credentialRevoked: true });
  const candidate = {
    schemaVersion: 1,
    taskId: "P1-M0-04-REGISTRY-KMS-FREEZE-AUTHORIZATION",
    generatedAt: new Date().toISOString(),
    policySha256: sha256File(policyPath),
    releaseOwner: receipt(bbb),
    securityOwner: receipt(aaa),
    permittedActions: ["registry-backup", "registry-isolated-restore", "kms-raft-snapshot", "kms-isolated-restore", "kms-key-rotation", "rollback-verification"],
    irreversibleKeyRetirementAuthorized: false,
    maintenanceAuthorized: true,
    productionRestoreAuthorized: false,
    productionReleaseAuthorized: false,
  };
  assert.throws(() => validateFreezeAuthorization(candidate, policyPath, owners), /registry-kms-freeze receipt is invalid/u);
});
