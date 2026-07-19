#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CARRIERS = new Set(["cmcc", "cucc", "ctcc", "other", "lab"]);
const REGIONS = new Set(["north", "east", "south", "other", "lab"]);
const NETWORKS = new Set(["wired", "wifi", "4g", "5g", "other", "lab"]);

function integer(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be ${minimum}-${maximum}`);
  return parsed;
}

function profile(name, allowed, fallback) {
  const value = process.env[name] ?? fallback;
  if (!allowed.has(value)) throw new Error(`${name} is invalid`);
  return value;
}

function safeBaseUrl(value) {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new Error("YUJIAN_PLATFORM_URL must be credential-free HTTPS or loopback HTTP");
  return url.href.replace(/\/$/u, "");
}

function quantile(values, ratio) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)];
}

const baseUrl = safeBaseUrl(process.env.YUJIAN_PLATFORM_URL ?? "http://127.0.0.1:8090");
const attempts = integer("YUJIAN_SYNTHETIC_ATTEMPTS", 3, 1, 100);
const intervalMs = integer("YUJIAN_SYNTHETIC_INTERVAL_MS", 250, 0, 60_000);
const timeoutMs = integer("YUJIAN_SYNTHETIC_TIMEOUT_MS", 5_000, 100, 30_000);
const carrier = profile("YUJIAN_SYNTHETIC_CARRIER", CARRIERS, "lab");
const region = profile("YUJIAN_SYNTHETIC_REGION", REGIONS, "lab");
const network = profile("YUJIAN_SYNTHETIC_NETWORK", NETWORKS, "lab");
const runId = `synthetic-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const paths = ["/healthz", "/readyz"];
const samples = [];

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  for (const path of paths) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      samples.push({ attempt, path, status: response.status, latencyMs: Math.round(performance.now() - started), ok: response.ok });
      await response.body?.cancel();
    } catch (error) {
      samples.push({ attempt, path, latencyMs: Math.round(performance.now() - started), ok: false, errorName: error instanceof Error ? error.name : "ProbeError" });
    }
  }
  if (attempt < attempts && intervalMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
}

const summaries = paths.map((path) => {
  const values = samples.filter((sample) => sample.path === path);
  const latencies = values.map((sample) => sample.latencyMs);
  return {
    path,
    attempts: values.length,
    successes: values.filter((sample) => sample.ok).length,
    p50LatencyMs: quantile(latencies, 0.5),
    p95LatencyMs: quantile(latencies, 0.95),
    p99LatencyMs: quantile(latencies, 0.99),
  };
});
const report = {
  schemaVersion: 1,
  evidenceType: "m3-carrier-synthetic-sample",
  runId,
  observedAt: new Date().toISOString(),
  profile: { carrier, region, network },
  target: { baseUrl, gitCommit: process.env.GIT_COMMIT ?? "unknown" },
  summaries,
  samples,
  containsCredentials: false,
  containsMedia: false,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const output = process.env.YUJIAN_SYNTHETIC_OUTPUT;
if (output === undefined) process.stdout.write(serialized);
else {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, serialized, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ runId, reportPath: path })}\n`);
}
if (summaries.some((summary) => summary.successes !== summary.attempts)) process.exitCode = 1;
