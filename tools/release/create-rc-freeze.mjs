import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (inputArg === undefined || outputArg === undefined) throw new Error("usage: create-rc-freeze <gate-snapshot.json> <new-freeze.json>");
const input = JSON.parse(readFileSync(resolve(inputArg), "utf8"));
const digest = /^sha256:[0-9a-f]{64}$/u;
const reference = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
const expectedGates = Array.from({ length: 11 }, (_, index) => `gate-${index}`);
if (input?.schemaVersion !== 1 || !/^v?[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?$/u.test(input.version) || !/^[0-9a-f]{40}$/u.test(input.sourceCommit) || !reference.test(input.artifactManifest?.evidenceRef) || !digest.test(input.artifactManifest?.sha256) || !Array.isArray(input.gateResults)) throw new Error("RC freeze input is invalid");
const gates = new Map(input.gateResults.map((gate) => [gate?.gateId, gate]));
if (gates.size !== expectedGates.length || expectedGates.some((id) => !gates.has(id))) throw new Error("RC freeze requires exactly Gate 0-10");
for (const id of expectedGates) {
  const gate = gates.get(id);
  if (!["passed", "failed", "not-run", "blocked"].includes(gate.status) || !reference.test(gate.evidenceRef) || !digest.test(gate.sha256)) throw new Error(`RC gate evidence is invalid: ${id}`);
}
const now = new Date().toISOString();
const status = input.gateResults.every((gate) => gate.status === "passed") ? "frozen" : "rejected";
const document = { schemaVersion: 1, releaseCandidateId: `rc-${randomUUID()}`, version: input.version, sourceCommit: input.sourceCommit, artifactManifest: input.artifactManifest, gateResults: input.gateResults, status, frozenAt: status === "frozen" ? now : null, createdAt: now };
const output = resolve(outputArg);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
writeFileSync(output, body, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, sha256: `sha256:${createHash("sha256").update(body).digest("hex")}`, releaseCandidateId: document.releaseCandidateId, status })}\n`);
