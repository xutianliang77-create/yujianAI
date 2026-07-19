#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RESOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const FORBIDDEN_KEYS = new Set(["token", "accessToken", "secret", "apiSecret", "password", "authorization", "cookie", "recording", "sdp", "phoneNumber", "userText", "requestBody", "payload"]);

function fail(message) { throw new Error(`M3 preview evidence rejected: ${message}`); }
function object(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${field} must be an object`);
  return value;
}
function array(value, field) { if (!Array.isArray(value)) fail(`${field} must be an array`); return value; }
function finite(value, field, minimum = 0) { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(`${field} is invalid`); return value; }
function integer(value, field, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) fail(`${field} is invalid`); return value; }
function timestamp(value, field) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(`${field} is invalid`); return Date.parse(value); }
function digest(value, field) { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${field} is invalid`); }
function resourceId(value, field) { if (typeof value !== "string" || !RESOURCE_ID.test(value)) fail(`${field} is invalid`); }
function falseFlag(value, field) { if (value !== false) fail(`${field} must be false`); }

function readJson(path, field) {
  const bytes = readFileSync(resolve(path));
  if (bytes.length > 2_097_152) fail(`${field} exceeds 2 MiB`);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail(`${field} is not valid JSON`); }
  rejectSensitiveKeys(parsed, field);
  return object(parsed, field);
}

function rejectSensitiveKeys(value, field) {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSensitiveKeys(item, `${field}[${index}]`));
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${field}.${key} is forbidden`);
    rejectSensitiveKeys(item, `${field}.${key}`);
  }
}

function stableArtifact(value, field) {
  const artifact = object(value, field);
  digest(artifact.sha256, `${field}.sha256`);
  if (typeof artifact.evidenceUri !== "string" || artifact.evidenceUri.length > 2048 || !/^(file|s3|gs|https):\/\//u.test(artifact.evidenceUri)) fail(`${field}.evidenceUri is invalid`);
  if (artifact.evidenceUri.includes("?") || artifact.evidenceUri.includes("#") || /:\/\/[^/]*@/u.test(artifact.evidenceUri)) fail(`${field}.evidenceUri embeds credentials or query data`);
}

function verifyEnvelope(evidence, type, field) {
  if (evidence.schemaVersion !== 1 || evidence.evidenceType !== type) fail(`${field} identity is invalid`);
  timestamp(evidence.generatedAt, `${field}.generatedAt`);
  const target = object(evidence.target, `${field}.target`);
  if (typeof target.gitCommit !== "string" || !/^[0-9a-f]{40}$/u.test(target.gitCommit)) fail(`${field}.target.gitCommit must be immutable`);
  falseFlag(evidence.containsCredentials, `${field}.containsCredentials`);
  falseFlag(evidence.containsMedia, `${field}.containsMedia`);
}

function verifyCarrier(evidence, policy) {
  verifyEnvelope(evidence, "m3-carrier-network-evidence", "carrier");
  const cells = array(evidence.matrix, "carrier.matrix");
  const indexed = new Map();
  const transports = new Map(policy.requiredFallbackTransports.map((name) => [name, 0]));
  for (const [index, raw] of cells.entries()) {
    const cell = object(raw, `carrier.matrix[${index}]`);
    const key = `${cell.carrier}:${cell.region}`;
    if (indexed.has(key)) fail(`carrier matrix duplicates ${key}`);
    indexed.set(key, cell);
    const attempts = integer(cell.joinAttempts, `${key}.joinAttempts`, policy.minimumJoinAttemptsPerCell);
    const successes = integer(cell.joinSuccesses, `${key}.joinSuccesses`);
    if (successes > attempts || (attempts - successes) / attempts > policy.maximumJoinFailureRatio) fail(`${key} join failure ratio exceeds policy`);
    const latency = object(cell.joinLatencyMs, `${key}.joinLatencyMs`);
    const p50 = finite(latency.p50, `${key}.joinLatencyMs.p50`);
    const p95 = finite(latency.p95, `${key}.joinLatencyMs.p95`);
    const p99 = finite(latency.p99, `${key}.joinLatencyMs.p99`);
    if (p50 > p95 || p95 > p99 || p95 > policy.maximumP95JoinLatencyMs || p99 > policy.maximumP99JoinLatencyMs) fail(`${key} join latency exceeds policy`);
    const quality = object(cell.quality, `${key}.quality`);
    if (finite(quality.p95RttMs, `${key}.quality.p95RttMs`) > policy.maximumP95RttMs) fail(`${key} RTT exceeds policy`);
    if (finite(quality.p95PacketLossRatio, `${key}.quality.p95PacketLossRatio`) > policy.maximumP95PacketLossRatio) fail(`${key} packet loss exceeds policy`);
    const counts = object(cell.transportCounts, `${key}.transportCounts`);
    for (const name of transports.keys()) transports.set(name, transports.get(name) + integer(counts[name], `${key}.transportCounts.${name}`));
    const artifacts = array(cell.artifacts, `${key}.artifacts`);
    if (artifacts.length === 0) fail(`${key} has no immutable artifact`);
    artifacts.forEach((artifact, artifactIndex) => stableArtifact(artifact, `${key}.artifacts[${artifactIndex}]`));
  }
  for (const carrier of policy.requiredCarriers) for (const region of policy.requiredRegions) if (!indexed.has(`${carrier}:${region}`)) fail(`carrier matrix is missing ${carrier}:${region}`);
  for (const [name, count] of transports) if (count < 1) fail(`carrier evidence never exercised ${name}`);
}

function verifyDesignPartners(evidence, policy) {
  verifyEnvelope(evidence, "m3-design-partner-evidence", "designPartner");
  const trials = array(evidence.trials, "designPartner.trials");
  if (trials.length < policy.minimumClosedTrials || trials.some((trial) => trial?.status !== "closed")) fail("all submitted design partner trials must be closed and meet the minimum count");
  const scopes = new Set();
  for (const [index, raw] of trials.entries()) {
    const trial = object(raw, `designPartner.trials[${index}]`);
    if (typeof trial.partnerId !== "string" || !/^partner-[a-z0-9-]{3,64}$/u.test(trial.partnerId) || trial.partnerId.includes("@")) fail("partnerId must be pseudonymous");
    resourceId(trial.tenantId, `${trial.partnerId}.tenantId`);
    resourceId(trial.environmentId, `${trial.partnerId}.environmentId`);
    const scope = `${trial.tenantId}:${trial.environmentId}`;
    if (scopes.has(scope)) fail("design partners must use isolated environments");
    scopes.add(scope);
    if (!['synthetic', 'authorized'].includes(trial.dataClass)) fail(`${trial.partnerId}.dataClass is invalid`);
    falseFlag(trial.containsPersonalData, `${trial.partnerId}.containsPersonalData`);
    falseFlag(trial.containsUserContent, `${trial.partnerId}.containsUserContent`);
    if (trial.apiKeyRevoked !== true || trial.resourcesDeleted !== true) fail(`${trial.partnerId} cleanup is incomplete`);
    stableArtifact(trial.auditExport, `${trial.partnerId}.auditExport`);
    const flows = object(trial.coreFlows, `${trial.partnerId}.coreFlows`);
    for (const flow of policy.requiredCoreFlows) if (flows[flow] !== "passed") fail(`${trial.partnerId} core flow ${flow} did not pass`);
    for (const defect of array(trial.defects, `${trial.partnerId}.defects`)) {
      if (policy.blockingSeverities.includes(defect?.severity) && (defect.status !== "closed" || typeof defect.fixVersion !== "string" || defect.fixVersion.length === 0 || !DIGEST.test(defect.regressionEvidenceSha256 ?? ""))) fail(`${trial.partnerId} has an open or unproven blocking defect`);
    }
  }
}

function verifyReliability(evidence, policy) {
  verifyEnvelope(evidence, "m3-reliability-evidence", "reliability");
  const runs = array(evidence.stabilityRuns, "reliability.stabilityRuns");
  for (const hours of policy.requiredStabilityHours) {
    const run = runs.find((candidate) => candidate?.durationHoursRequired === hours);
    if (run?.status !== "completed") fail(`${hours}h stability run is missing or incomplete`);
    const observed = integer(run.durationMillisecondsObserved, `${hours}h.durationMillisecondsObserved`, hours * 3_600_000);
    const interval = integer(run.sampleIntervalSeconds, `${hours}h.sampleIntervalSeconds`, 1);
    if (interval > policy.maximumSampleIntervalSeconds) fail(`${hours}h sample interval is too large`);
    const minimumSamples = Math.floor((observed / 1000 / interval) * policy.minimumSampleCoverageRatio);
    if (integer(run.samples, `${hours}h.samples`) < minimumSamples) fail(`${hours}h sample coverage is insufficient`);
    if (finite(run.availabilityRatio, `${hours}h.availabilityRatio`) < policy.minimumAvailabilityRatio || run.availabilityRatio > 1) fail(`${hours}h availability is outside policy`);
    stableArtifact(run.rawSamples, `${hours}h.rawSamples`);
  }
  const scenarios = array(evidence.faultInjections, "reliability.faultInjections");
  for (const name of policy.requiredFaultScenarios) {
    const scenario = scenarios.find((candidate) => candidate?.scenario === name);
    if (scenario?.status !== "recovered") fail(`fault scenario ${name} is missing or not recovered`);
    const injectedAt = timestamp(scenario.injectedAt, `${name}.injectedAt`);
    const recoveredAt = timestamp(scenario.recoveredAt, `${name}.recoveredAt`);
    if (recoveredAt <= injectedAt || integer(scenario.recoveryMilliseconds, `${name}.recoveryMilliseconds`) < recoveredAt - injectedAt) fail(`${name} recovery timing is invalid`);
    falseFlag(scenario.ledgerLoss, `${name}.ledgerLoss`);
    falseFlag(scenario.residualResources, `${name}.residualResources`);
    falseFlag(scenario.productionOverwrite, `${name}.productionOverwrite`);
    if (scenario.maintenanceApprovedBy !== "release-owner") fail(`${name} maintenance approval owner is invalid`);
    const approvedAt = timestamp(scenario.maintenanceApprovedAt, `${name}.maintenanceApprovedAt`);
    const approvalExpiresAt = timestamp(scenario.maintenanceApprovalExpiresAt, `${name}.maintenanceApprovalExpiresAt`);
    if (approvedAt >= injectedAt || approvalExpiresAt <= recoveredAt) fail(`${name} maintenance approval window does not cover the injection`);
    digest(scenario.maintenanceApprovalSha256, `${name}.maintenanceApprovalSha256`);
    stableArtifact(scenario.artifact, `${name}.artifact`);
  }
}

const policy = readJson(process.env.YUJIAN_M3_EVIDENCE_POLICY ?? resolve(root, "infra/acceptance/m3-preview-evidence-policy.json"), "policy");
if (policy.schemaVersion !== 1 || policy.policyId !== "m3-preview-gate-v1") fail("policy identity is invalid");
const carrierPath = process.env.YUJIAN_M3_CARRIER_EVIDENCE ?? process.argv[2];
const designPartnerPath = process.env.YUJIAN_M3_DESIGN_PARTNER_EVIDENCE ?? process.argv[3];
const reliabilityPath = process.env.YUJIAN_M3_RELIABILITY_EVIDENCE ?? process.argv[4];
if (!carrierPath || !designPartnerPath || !reliabilityPath) fail("carrier, design-partner and reliability evidence paths are required");
const carrier = readJson(carrierPath, "carrier");
const designPartner = readJson(designPartnerPath, "designPartner");
const reliability = readJson(reliabilityPath, "reliability");
verifyCarrier(carrier, object(policy.carrierNetwork, "policy.carrierNetwork"));
verifyDesignPartners(designPartner, object(policy.designPartners, "policy.designPartners"));
verifyReliability(reliability, object(policy.reliability, "policy.reliability"));
process.stdout.write(`${JSON.stringify({ policyId: policy.policyId, gate: "M3-preview-evidence-passed", productionReleaseAuthorized: false })}\n`);
