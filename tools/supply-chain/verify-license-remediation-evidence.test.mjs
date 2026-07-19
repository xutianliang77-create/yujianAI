import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLicenseRemediationEvidence } from "./verify-license-remediation-evidence.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-license-remediation-evidence.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts complete engineering remediation while keeping legal release blocked", () => {
  const evidence = validateLicenseRemediationEvidence(copy());
  assert.equal(evidence.summary.remediatedConcludedNoAssertion, 0);
  assert.equal(evidence.deploymentAllowed, false);
});

test("rejects hidden legal approval or release authorization", () => {
  const approved = copy();
  approved.owners.find((owner) => owner.role === "legal-owner").status = "approved";
  assert.throws(() => validateLicenseRemediationEvidence(approved), /owner boundary is invalid/u);
  const released = copy();
  released.deploymentAllowed = true;
  assert.throws(() => validateLicenseRemediationEvidence(released), /cannot authorize deployment/u);
});

test("rejects a missing classification or forged tag license", () => {
  const incomplete = copy();
  incomplete.summary.remediatedConcludedNoAssertion = 1;
  assert.throws(() => validateLicenseRemediationEvidence(incomplete), /summary counts are invalid/u);
  const forged = copy();
  forged.reedsolomonBoundary.licenseFileInTag = true;
  assert.throws(() => validateLicenseRemediationEvidence(forged), /reedsolomon boundary is invalid/u);
});

test("rejects evidence paths outside the signed run root", () => {
  const evidence = copy();
  evidence.artifacts.notice.path = "remote:/data/models/yujianAI/evidence/p1-m0-04/other/NOTICE.md";
  assert.throws(() => validateLicenseRemediationEvidence(evidence), /outside the immutable run root/u);
});
