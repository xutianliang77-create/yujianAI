#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

function integer(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be ${minimum}-${maximum}`);
  return value;
}

function platformUrl(value) {
  const parsed = new URL(value);
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") throw new Error("YUJIAN_PLATFORM_URL must be credential-free HTTPS or loopback HTTP");
  return parsed.href.replace(/\/$/u, "");
}

function percentile(values, ratio) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

const durationHours = integer("YUJIAN_STABILITY_DURATION_HOURS", 24, 24, 72);
if (durationHours !== 24 && durationHours !== 72) throw new Error("YUJIAN_STABILITY_DURATION_HOURS must be 24 or 72");
const intervalSeconds = integer("YUJIAN_STABILITY_INTERVAL_SECONDS", 30, 5, 300);
const timeoutMs = integer("YUJIAN_STABILITY_TIMEOUT_MS", 5_000, 100, 30_000);
const baseUrl = platformUrl(process.env.YUJIAN_PLATFORM_URL ?? "http://127.0.0.1:8090");
const runId = `stability-${durationHours}h-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const outputRoot = resolve(process.env.YUJIAN_STABILITY_OUTPUT_ROOT ?? "outputs/stability");
mkdirSync(dirname(outputRoot), { recursive: true, mode: 0o700 });
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const runDirectory = resolve(outputRoot, runId);
mkdirSync(runDirectory, { recursive: false, mode: 0o700 });
const samplesPath = resolve(runDirectory, "samples.ndjson");
const samplesFd = openSync(samplesPath, "wx", 0o600);
const startedAtMs = Date.now();
const deadlineMs = startedAtMs + durationHours * 3_600_000;
const plan = {
  schemaVersion: 1,
  evidenceType: "m3-stability-plan",
  runId,
  durationHours,
  intervalSeconds,
  timeoutMs,
  target: { baseUrl, gitCommit: process.env.GIT_COMMIT ?? "unknown" },
  startedAt: new Date(startedAtMs).toISOString(),
  expectedEndAt: new Date(deadlineMs).toISOString(),
  containsCredentials: false,
  containsMedia: false,
};
writeFileSync(resolve(runDirectory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });

let stopSignal;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopSignal = signal; });
const samples = [];
const paths = ["/healthz", "/readyz"];

try {
  while (Date.now() < deadlineMs && stopSignal === undefined) {
    const cycleAt = new Date().toISOString();
    for (const path of paths) {
      const started = performance.now();
      let sample;
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
        sample = { observedAt: cycleAt, path, ok: response.ok, status: response.status, latencyMs: Math.round(performance.now() - started) };
        await response.body?.cancel();
      } catch (error) {
        sample = { observedAt: cycleAt, path, ok: false, latencyMs: Math.round(performance.now() - started), errorName: error instanceof Error ? error.name : "ProbeError" };
      }
      samples.push(sample);
      writeSync(samplesFd, `${JSON.stringify(sample)}\n`);
    }
    fsyncSync(samplesFd);
    const remaining = Math.min(intervalSeconds * 1_000, Math.max(0, deadlineMs - Date.now()));
    if (remaining > 0 && stopSignal === undefined) await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining));
  }
} finally {
  fsyncSync(samplesFd);
  closeSync(samplesFd);
}

const completedAtMs = Date.now();
const summaries = paths.map((path) => {
  const selected = samples.filter((sample) => sample.path === path);
  const latencies = selected.map((sample) => sample.latencyMs);
  return {
    path,
    samples: selected.length,
    successes: selected.filter((sample) => sample.ok).length,
    availabilityRatio: selected.length === 0 ? 0 : selected.filter((sample) => sample.ok).length / selected.length,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
  };
});
const summary = {
  schemaVersion: 1,
  evidenceType: "m3-stability-summary",
  runId,
  status: stopSignal === undefined && completedAtMs >= deadlineMs ? "completed" : "aborted",
  durationHoursRequired: durationHours,
  durationMillisecondsObserved: Math.max(0, completedAtMs - startedAtMs),
  startedAt: new Date(startedAtMs).toISOString(),
  completedAt: new Date(completedAtMs).toISOString(),
  ...(stopSignal === undefined ? {} : { stopSignal }),
  summaries,
  samplesPath: "samples.ndjson",
  containsCredentials: false,
  containsMedia: false,
};
writeFileSync(resolve(runDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ runId, runDirectory, status: summary.status })}\n`);
if (summary.status !== "completed" || summaries.some((entry) => entry.successes !== entry.samples)) process.exitCode = 1;
