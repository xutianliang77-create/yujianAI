import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const expected = new Map([
  ["aaa", "security-owner"],
  ["bbb", "release-owner"],
  ["ccc", "legal-owner"],
  ["ddd", "compliance-owner"],
]);

export function validateOwnerKeyRegistry(record) {
  if (record.schemaVersion !== 1 || record.taskId !== "P1-M0-04-OWNER-KEY-REGISTRY") fail("identity is invalid");
  if (record.status !== "keys-provisioned-no-personal-credentials-issued") fail("status is invalid");
  if (!Number.isFinite(Date.parse(record.generatedAt))) fail("generatedAt is invalid");
  if (!/^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\/owner-signers\//u.test(record.environment?.resultPath ?? "")) fail("result path is invalid");
  digest(record.environment?.resultSha256, "resultSha256");
  if (!/^owner-policy-validation-[0-9TZ]+$/u.test(record.environment?.policyValidationRunId ?? "")
    || !/^remote:\/data\/models\/yujianAI\/evidence\/p1-m0-04\/owner-signers\/owner-policy-validation-/u.test(record.environment?.policyValidationPath ?? "")) fail("policy validation path is invalid");
  digest(record.environment?.policyValidationSha256, "policyValidationSha256");
  if (!Array.isArray(record.owners) || record.owners.length !== 4) fail("four owners are required");
  const owners = new Map(record.owners.map((owner) => [owner.personalOwner, owner]));
  for (const [person, role] of expected) {
    const owner = owners.get(person);
    if (owner?.role !== role || owner.keyUri !== `openbao://yujian-owner-${person}`
      || owner.policy !== `yujian-owner-${person}-signer`) fail(`${person} identity is invalid`);
    if (JSON.stringify(owner.policyCapabilities) !== JSON.stringify(["read-own-key", "sign-own-key", "verify-own-key", "revoke-self"])) fail(`${person} policy capabilities are invalid`);
    if (owner.keyType !== "ecdsa-p256" || owner.latestVersion !== 1 || owner.exportable !== false
      || owner.allowPlaintextBackup !== false) fail(`${person} key boundary is invalid`);
    for (const field of ["publicKeySha256", "policySha256"]) digest(owner[field], `${person}.${field}`);
    if (owner.personalCredentialIssued !== false || owner.status !== "key-provisioned-awaiting-personal-credential") fail(`${person} credential boundary is invalid`);
    for (const forbidden of ["token", "password", "privateKey", "wrappedToken"]) {
      if (forbidden in owner) fail(`${person} contains forbidden credential material`);
    }
  }
  if (record.responseWrapTtlSeconds !== 300 || record.personalSigningTokenTtlSeconds !== 900
    || record.tokensCreatedInAdvance !== false || record.technicalSelfTestTokensRevoked !== true
    || record.allPersonalDecisionsPending !== true) fail("delivery boundary is invalid");
  if (record.protectedRuntime?.unchanged !== true || record.protectedRuntime?.allHealthy !== true
    || record.protectedRuntime?.restartCount !== 0) fail("protected runtime changed");
  if (record.productionReleaseAuthorized !== false) fail("key provisioning cannot authorize release");
  return record;
}

function digest(value, field) {
  if (!digestPattern.test(value ?? "")) fail(`${field} is invalid`);
}

function fail(message) {
  throw new Error(`P1-M0-04 owner key registry invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.P1_M0_04_OWNER_KEY_REGISTRY ?? "docs/acceptance/p1-owner-key-registry.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  validateOwnerKeyRegistry(record);
  process.stdout.write(`Owner key registry verified: owners=${record.owners.length}; credentialsIssued=false; release=false\n`);
}
