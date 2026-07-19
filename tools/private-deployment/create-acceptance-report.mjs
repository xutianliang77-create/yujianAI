import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (inputPath === undefined || outputPath === undefined) throw new Error("usage: create-acceptance-report <checks.json> <new-report.json>");
const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const ID = /^[a-z][a-z0-9-]{2,127}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REF = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
if (typeof input !== "object" || input === null || !ID.test(input.tenantId) || !ID.test(input.projectId) || !ID.test(input.environmentId) || !DIGEST.test(input.releaseDigest) || !Array.isArray(input.checks) || input.checks.length === 0 || input.checks.length > 128) throw new Error("acceptance report input is invalid");
const ids = new Set();
for (const check of input.checks) {
  if (typeof check !== "object" || check === null || !ID.test(check.checkId) || ids.has(check.checkId) || !["passed", "failed", "not-run"].includes(check.status) || !Array.isArray(check.evidenceRefs) || check.evidenceRefs.length > 32 || check.evidenceRefs.some((ref) => typeof ref !== "string" || !REF.test(ref)) || (check.status === "passed" && check.evidenceRefs.length === 0)) throw new Error("acceptance report check is invalid");
  ids.add(check.checkId);
}
const outcome = input.checks.some((check) => check.status === "failed") ? "failed" : input.checks.some((check) => check.status === "not-run") ? "incomplete" : "passed";
const document = { schemaVersion: 1, tenantId: input.tenantId, projectId: input.projectId, environmentId: input.environmentId, releaseDigest: input.releaseDigest, outcome, checks: input.checks, generatedAt: new Date().toISOString() };
const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
const output = resolve(outputPath);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, body, { flag: "wx", mode: 0o600 });
const sha256 = `sha256:${createHash("sha256").update(body).digest("hex")}`;
writeFileSync(`${output}.manifest.json`, `${JSON.stringify({ schemaVersion: 1, artifactPath: output, sha256, outcome, containsSecrets: false, containsMedia: false }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ report: output, manifest: `${output}.manifest.json`, sha256, outcome })}\n`);
