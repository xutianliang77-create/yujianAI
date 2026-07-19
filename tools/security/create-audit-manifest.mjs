import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (inputArg === undefined || outputArg === undefined) throw new Error("usage: create-audit-manifest <checks.json> <new-manifest.json>");
const input = JSON.parse(readFileSync(resolve(inputArg), "utf8"));
const required = ["secret-scan", "sast", "dependency-scan", "container-scan", "sbom", "signature", "penetration-test", "compliance-assessment"];
const statuses = new Set(["passed", "failed", "not-run", "blocked"]);
const digest = /^sha256:[0-9a-f]{64}$/u;
const reference = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
if (input?.schemaVersion !== 1 || !digest.test(input.releaseDigest) || !/^[0-9a-f]{40}$/u.test(input.sourceCommit) || !Array.isArray(input.checks)) throw new Error("security audit input is invalid");
const byId = new Map(input.checks.map((check) => [check?.checkId, check]));
if (byId.size !== required.length || required.some((id) => !byId.has(id))) throw new Error("security audit checks are incomplete or duplicated");
for (const id of required) {
  const check = byId.get(id);
  if (!statuses.has(check.status) || !reference.test(check.evidenceRef) || !digest.test(check.sha256) || !Number.isSafeInteger(check.criticalFindings) || check.criticalFindings < 0 || !Number.isSafeInteger(check.highFindings) || check.highFindings < 0) throw new Error(`security audit check is invalid: ${id}`);
  if (check.status === "passed" && (check.criticalFindings !== 0 || check.highFindings !== 0)) throw new Error(`passed security audit check contains open findings: ${id}`);
}
const outcome = input.checks.some((check) => check.status === "failed" || check.criticalFindings > 0 || check.highFindings > 0) ? "failed" : input.checks.every((check) => check.status === "passed") ? "passed" : "incomplete";
const document = { schemaVersion: 1, releaseDigest: input.releaseDigest, sourceCommit: input.sourceCommit, checks: input.checks, outcome, generatedAt: new Date().toISOString() };
const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
const output = resolve(outputArg);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, body, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, sha256: `sha256:${createHash("sha256").update(body).digest("hex")}`, outcome })}\n`);
