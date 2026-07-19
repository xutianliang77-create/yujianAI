import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRegistryKmsFreezePolicy } from "./verify-registry-kms-freeze.mjs";

const policy = JSON.parse(readFileSync("infra/registry/beelink/freeze-policy.json", "utf8"));
const oci = JSON.parse(readFileSync("docs/acceptance/p1-production-oci-evidence.json", "utf8"));
const owners = JSON.parse(readFileSync("docs/acceptance/p1-m0-04-owner-signoffs.json", "utf8"));
const copy = (value) => structuredClone(value);

test("accepts the frozen technical proposal while preserving bbb reject", () => {
  assert.equal(validateRegistryKmsFreezePolicy(copy(policy), copy(oci), copy(owners)).productionReleaseAuthorized, false);
});

test("rejects a changed rollback digest", () => {
  const changed = copy(policy);
  changed.artifacts[0].digestReference = changed.artifacts[0].digestReference.replace(/.$/u, "0");
  assert.throws(() => validateRegistryKmsFreezePolicy(changed, copy(oci), copy(owners)), /differs from production OCI evidence/u);
});

test("rejects an overwritten owner result", () => {
  const changed = copy(policy);
  changed.ownerDecision.decision = "approve";
  assert.throws(() => validateRegistryKmsFreezePolicy(changed, copy(oci), copy(owners)), /current bbb reject receipt is not preserved/u);
});

test("rejects automatic irreversible key retirement", () => {
  const changed = copy(policy);
  changed.kms.rotation.automaticOldVersionRetirement = true;
  assert.throws(() => validateRegistryKmsFreezePolicy(changed, copy(oci), copy(owners)), /rotation policy is invalid/u);
});
