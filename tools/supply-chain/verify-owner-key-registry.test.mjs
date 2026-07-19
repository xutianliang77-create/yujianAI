import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOwnerKeyRegistry } from "./verify-owner-key-registry.mjs";

const source = JSON.parse(readFileSync("docs/acceptance/p1-owner-key-registry.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts four provisioned keys with no personal credentials", () => {
  assert.equal(validateOwnerKeyRegistry(copy()).productionReleaseAuthorized, false);
});

test("rejects an exportable key or pre-issued credential", () => {
  const exportable = copy();
  exportable.owners[0].exportable = true;
  assert.throws(() => validateOwnerKeyRegistry(exportable), /key boundary/u);
  const credential = copy();
  credential.owners[1].personalCredentialIssued = true;
  assert.throws(() => validateOwnerKeyRegistry(credential), /credential boundary/u);
});

test("rejects key provisioning used as release authorization", () => {
  const record = copy();
  record.productionReleaseAuthorized = true;
  assert.throws(() => validateOwnerKeyRegistry(record), /cannot authorize release/u);
});

test("rejects a signer policy that cannot verify or revoke", () => {
  const record = copy();
  record.owners[0].policyCapabilities = ["read-own-key", "sign-own-key"];
  assert.throws(() => validateOwnerKeyRegistry(record), /policy capabilities/u);
});
