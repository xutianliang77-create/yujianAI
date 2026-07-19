import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRemediatedCandidateEvidence } from "./verify-remediated-candidate-evidence.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-remediated-candidate-evidence.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts zero-Critical zero-High evidence with isolated runtime regression without authorizing deployment", () => {
  assert.equal(validateRemediatedCandidateEvidence(copy()).deploymentAllowed, false);
});

test("rejects a hidden registry or deployment claim", () => {
  const evidence = copy();
  evidence.images[0].registryDigest = `sha256:${"a".repeat(64)}`;
  assert.throws(() => validateRemediatedCandidateEvidence(evidence), /must not claim a registry digest/u);
  delete evidence.images[0].registryDigest;
  evidence.deploymentAllowed = true;
  assert.throws(() => validateRemediatedCandidateEvidence(evidence), /cannot authorize deployment/u);
});

test("rejects Critical or reintroduced High findings", () => {
  const evidence = copy();
  evidence.images[0].vulnerabilityScan.counts.critical = 1;
  assert.throws(() => validateRemediatedCandidateEvidence(evidence), /contains Critical findings/u);
  const highEvidence = copy();
  highEvidence.images[1].vulnerabilityScan.counts.high = 1;
  highEvidence.images[1].highFindings.push({ advisory: "GO-TEST", fixedVersions: ["1.0.1"] });
  highEvidence.summary.highFindings = 1;
  assert.throws(() => validateRemediatedCandidateEvidence(highEvidence), /review boundaries are inconsistent/u);
});

test("rejects an incomplete or legally laundered license conclusion layer", () => {
  const incomplete = copy();
  incomplete.summary.licensesConcludedNoAssertion = 1;
  assert.throws(() => validateRemediatedCandidateEvidence(incomplete), /license conclusion layer is incomplete/u);
  const approved = copy();
  approved.licenseRemediation.status = "legal-approved";
  assert.throws(() => validateRemediatedCandidateEvidence(approved), /license remediation boundary is invalid/u);
});

test("rejects forged professional signoff state", () => {
  const evidence = copy();
  evidence.owners[0].status = "approved";
  assert.throws(() => validateRemediatedCandidateEvidence(evidence), /security-owner status is invalid/u);
});

test("rejects incomplete runtime regression or a hidden runtime switch", () => {
  const missingRestore = copy();
  missingRestore.runtimeRegression.openbao.raft.restoreVerified = false;
  assert.throws(() => validateRemediatedCandidateEvidence(missingRestore), /OpenBao\/API-key recovery regression is incomplete/u);

  const switched = copy();
  switched.runtimeRegression.isolation.currentRuntimeSwitched = true;
  assert.throws(() => validateRemediatedCandidateEvidence(switched), /runtime regression isolation is invalid/u);
});
