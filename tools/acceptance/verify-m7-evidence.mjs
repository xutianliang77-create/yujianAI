import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? process.env.M7_EVIDENCE_FILE ?? "outputs/m7/evidence.json");
const evidence = JSON.parse(readFileSync(path, "utf8"));
const tasks = ["m7-01-billing", "m7-02-region-failover", "m7-03-slo-oncall", "m7-04-security", "m7-05-data-rights", "m7-06-lts-support", "m7-07-docs-status", "m7-08-load-dr", "m7-09-rc-freeze", "m7-10-ga-review"];
const statuses = new Set(["passed", "failed", "not-run", "blocked"]);
const digest = /^sha256:[0-9a-f]{64}$/u;
const reference = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
if (evidence?.schemaVersion !== 1 || !/^[0-9a-f]{40}$/u.test(evidence.sourceCommit) || !digest.test(evidence.releaseDigest) || !Number.isFinite(Date.parse(evidence.generatedAt)) || !Array.isArray(evidence.tasks)) throw new Error("M7 evidence envelope is invalid");
const byId = new Map(evidence.tasks.map((task) => [task?.taskId, task]));
if (byId.size !== tasks.length || tasks.some((task) => !byId.has(task))) throw new Error("M7 evidence tasks are incomplete or duplicated");
for (const taskId of tasks) {
  const task = byId.get(taskId);
  if (!statuses.has(task.status)) throw new Error(`M7 status is invalid: ${taskId}`);
  if (task.status === "passed" || task.status === "failed") {
    if (!reference.test(task.evidenceRef) || !digest.test(task.sha256)) throw new Error(`M7 executed task lacks immutable evidence: ${taskId}`);
  } else if (typeof task.reason !== "string" || task.reason.trim().length < 12) throw new Error(`M7 pending task lacks a reason: ${taskId}`);
}
const pending = evidence.tasks.filter((task) => task.status !== "passed");
if (process.env.M7_REQUIRE_PASS === "true" && pending.length > 0) throw new Error(`M7 acceptance incomplete: ${pending.map((task) => task.taskId).join(", ")}`);
process.stdout.write(`M7 evidence schema verified; passed=${tasks.length - pending.length}; pending=${pending.length}\n`);
