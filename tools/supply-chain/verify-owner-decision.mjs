import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const contracts = new Map([
  ["security-evidence", { owner: "aaa", role: "security-owner", decisions: ["approve", "reject", "time-bound-exception"] }],
  ["redis-release", { owner: "bbb", role: "release-owner", decisions: ["approve", "reject"] }],
  ["registry-kms-freeze", { owner: "bbb", role: "release-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
  ["license-notice-source-offer", { owner: "ccc", role: "legal-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
  ["china-distribution", { owner: "ddd", role: "compliance-owner", decisions: ["approve", "reject", "approve-with-conditions"] }],
]);

export function validateOwnerDecision(record, { requireDecided = false } = {}) {
  if (record.schemaVersion !== 1 || record.taskId !== "P1-M0-04-OWNER-DECISION") fail("identity is invalid");
  const contract = contracts.get(record.decisionType);
  if (!contract || record.personalOwner !== contract.owner || record.role !== contract.role) fail("owner contract is invalid");
  if (!Array.isArray(record.evidence) || record.evidence.length < 2) fail("evidence is incomplete");
  for (const evidence of record.evidence) {
    if (typeof evidence.path !== "string" || evidence.path.length < 10 || !digestPattern.test(evidence.sha256 ?? "")) fail("evidence item is invalid");
  }
  if (record.status === "awaiting-personal-decision") {
    for (const field of ["decision", "decidedAt", "reason", "conditions", "expiresAt"]) {
      if (record[field] !== null) fail("pending template contains a decision");
    }
    if (requireDecided) fail("personal decision is still pending");
    return record;
  }
  if (record.status !== "ready-for-personal-signature") fail("status is invalid");
  if (!contract.decisions.includes(record.decision)) fail("decision is invalid");
  if (!Number.isFinite(Date.parse(record.decidedAt))) fail("decidedAt is invalid");
  if (typeof record.reason !== "string" || record.reason.trim().length < 20) fail("reason is too short");
  if (["approve-with-conditions", "time-bound-exception"].includes(record.decision)
    && (typeof record.conditions !== "string" || record.conditions.trim().length < 20)) fail("conditions are required");
  if (record.decision === "time-bound-exception" && !Number.isFinite(Date.parse(record.expiresAt))) fail("expiresAt is required");
  return record;
}

function fail(message) {
  throw new Error(`P1-M0-04 owner decision invalid: ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requireDecided = process.argv.includes("--require-decided");
  const input = process.argv.find((argument) => argument.endsWith(".json"));
  const path = resolve(input ?? "docs/governance/owner-decisions/aaa-security-decision.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  validateOwnerDecision(record, { requireDecided });
  process.stdout.write(`Owner decision verified: owner=${record.personalOwner}; type=${record.decisionType}; status=${record.status}\n`);
}
