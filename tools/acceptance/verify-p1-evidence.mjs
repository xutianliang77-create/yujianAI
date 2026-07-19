import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const evidencePath = resolve(process.env.P1_EVIDENCE_FILE ?? "outputs/p1/evidence.json");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const requiredTargets = [
  "beelinkServer",
  "webClient",
  "flutterWeb",
  "ios",
  "android",
  "python",
  "turnWeakNetwork",
  "webhook",
  "supplyChain",
  "nightlySandbox",
];

function fail(message) {
  throw new Error(`P1 evidence invalid: ${message}`);
}

if (evidence.schemaVersion !== 1) fail("schemaVersion must be 1");
if (typeof evidence.commit !== "string" || !/^[0-9a-f]{7,40}$/u.test(evidence.commit)) fail("commit must be a git hash");
if (typeof evidence.generatedAt !== "string" || !Number.isFinite(Date.parse(evidence.generatedAt))) fail("generatedAt must be an ISO timestamp");
if (typeof evidence.targets !== "object" || evidence.targets === null) fail("targets must be an object");

const statuses = new Map();
for (const target of requiredTargets) {
  const result = evidence.targets[target];
  if (typeof result !== "object" || result === null) fail(`${target} is missing`);
  if (!new Set(["passed", "deferred", "blocked"]).has(result.status)) fail(`${target}.status is invalid`);
  if (result.status === "passed" && (typeof result.report !== "string" || result.report.length === 0)) {
    fail(`${target}.report is required when passed`);
  }
  statuses.set(target, result.status);
}

const missing = requiredTargets.filter((target) => statuses.get(target) !== "passed");
if (process.env.P1_REQUIRE_PASS === "true" && missing.length > 0) {
  throw new Error(`P1 evidence incomplete: ${missing.join(", ")}`);
}
process.stdout.write(`P1 evidence schema verified; passed=${requiredTargets.length - missing.length}; pending=${missing.length}\n`);
