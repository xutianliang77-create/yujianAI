import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOwnerDecision } from "./verify-owner-decision.mjs";

const source = JSON.parse(readFileSync("docs/governance/owner-decisions/aaa-security-decision.json", "utf8"));
const copy = () => structuredClone(source);

test("accepts an unsigned template but not as a signable decision", () => {
  assert.doesNotThrow(() => validateOwnerDecision(copy()));
  assert.throws(() => validateOwnerDecision(copy(), { requireDecided: true }), /still pending/u);
});

test("accepts a complete aaa approval ready for personal signature", () => {
  const record = copy();
  Object.assign(record, { status: "ready-for-personal-signature", decision: "approve", decidedAt: "2026-07-18T13:00:00Z", reason: "Reviewed the immutable scan and signing evidence in full." });
  assert.doesNotThrow(() => validateOwnerDecision(record, { requireDecided: true }));
});

test("rejects a signer or role substitution", () => {
  const record = copy();
  record.personalOwner = "bbb";
  assert.throws(() => validateOwnerDecision(record), /owner contract is invalid/u);
});

test("requires conditions and expiry for a time-bound exception", () => {
  const record = copy();
  Object.assign(record, { status: "ready-for-personal-signature", decision: "time-bound-exception", decidedAt: "2026-07-18T13:00:00Z", reason: "A documented temporary exception is requested for review." });
  assert.throws(() => validateOwnerDecision(record, { requireDecided: true }), /conditions are required/u);
  record.conditions = "Restrict use to the isolated canary and close the exception before release.";
  assert.throws(() => validateOwnerDecision(record, { requireDecided: true }), /expiresAt is required/u);
});
