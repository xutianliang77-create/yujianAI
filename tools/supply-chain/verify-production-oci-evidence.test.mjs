import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateProductionOciEvidence } from "./verify-production-oci-evidence.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-production-oci-evidence.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts verified OCI artifacts while keeping release blocked", () => {
  assert.equal(validateProductionOciEvidence(copy()).productionReleaseAuthorized, false);
});

test("rejects an unverified signature or attestation", () => {
  const evidence = copy();
  evidence.images[0].signatureVerified = false;
  assert.throws(() => validateProductionOciEvidence(evidence), /is not verified/u);
});

test("rejects forged bbb or professional owner approval", () => {
  const evidence = copy();
  evidence.preconditions.releaseOwnerFreezeSignedByBbb = true;
  assert.throws(() => validateProductionOciEvidence(evidence), /human gate was forged/u);
});

test("rejects a nonzero registry High gate", () => {
  const evidence = copy();
  evidence.registry.scan.high = 1;
  assert.throws(() => validateProductionOciEvidence(evidence), /vulnerability gate is not zero/u);
});
