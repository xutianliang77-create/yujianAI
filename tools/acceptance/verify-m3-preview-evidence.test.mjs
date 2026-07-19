import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sha = `sha256:${"a".repeat(64)}`;
const target = { gitCommit: "b".repeat(40) };
const envelope = (evidenceType) => ({ schemaVersion: 1, evidenceType, generatedAt: "2026-07-19T00:00:00Z", target, containsCredentials: false, containsMedia: false });
const artifact = (name) => ({ evidenceUri: `file:///data/evidence/${name}.json`, sha256: sha });

function fixture() {
  const carriers = ["cmcc", "cucc", "ctcc"];
  const regions = ["north", "east", "south"];
  const carrier = {
    ...envelope("m3-carrier-network-evidence"),
    matrix: carriers.flatMap((carrierName) => regions.map((region) => ({
      carrier: carrierName,
      region,
      joinAttempts: 100,
      joinSuccesses: 100,
      joinLatencyMs: { p50: 100, p95: 200, p99: 300 },
      quality: { p95RttMs: 80, p95PacketLossRatio: 0.001 },
      transportCounts: { udp: 98, tcp: 1, tls: 1 },
      artifacts: [artifact(`${carrierName}-${region}`)],
    })),
  };
  const flows = Object.fromEntries(["token", "join", "publish-audio", "subscribe-audio", "data", "rpc", "reconnect"].map((name) => [name, "passed"]));
  const designPartner = {
    ...envelope("m3-design-partner-evidence"),
    trials: ["alpha", "beta"].map((name, index) => ({
      partnerId: `partner-${name}`,
      tenantId: `tenant-${name}`,
      environmentId: `environment-${name}`,
      status: "closed",
      dataClass: "synthetic",
      containsPersonalData: false,
      containsUserContent: false,
      apiKeyRevoked: true,
      resourcesDeleted: true,
      auditExport: artifact(`audit-${index}`),
      coreFlows: flows,
      defects: [],
    })),
  };
  const faultNames = ["rtc-node-stop", "redis-unavailable", "postgres-primary-unavailable", "provider-timeout-rate-limit", "turn-udp-disabled"];
  const reliability = {
    ...envelope("m3-reliability-evidence"),
    stabilityRuns: [24, 72].map((hours) => ({
      durationHoursRequired: hours,
      status: "completed",
      durationMillisecondsObserved: hours * 3_600_000,
      sampleIntervalSeconds: 60,
      samples: hours * 60,
      availabilityRatio: 1,
      rawSamples: artifact(`stability-${hours}`),
    })),
    faultInjections: faultNames.map((scenario) => ({
      scenario,
      status: "recovered",
      maintenanceApprovedBy: "release-owner",
      maintenanceApprovedAt: "2026-07-18T23:00:00Z",
      maintenanceApprovalExpiresAt: "2026-07-19T02:00:00Z",
      maintenanceApprovalSha256: sha,
      injectedAt: "2026-07-19T00:00:00Z",
      recoveredAt: "2026-07-19T00:00:01Z",
      recoveryMilliseconds: 1000,
      ledgerLoss: false,
      residualResources: false,
      productionOverwrite: false,
      artifact: artifact(scenario),
    })),
  };
  return { carrier, designPartner, reliability };
}

function execute(values) {
  const directory = mkdtempSync(resolve(tmpdir(), "yujian-m3-evidence-"));
  const paths = Object.entries(values).map(([name, value]) => {
    const path = resolve(directory, `${name}.json`);
    writeFileSync(path, JSON.stringify(value));
    return path;
  });
  return spawnSync(process.execPath, [new URL("./verify-m3-preview-evidence.mjs", import.meta.url).pathname, ...paths], { encoding: "utf8" });
}

test("M3 preview verifier accepts only a complete matrix, closed trials and recovered reliability runs", () => {
  const result = execute(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).productionReleaseAuthorized, false);
});

test("M3 preview verifier rejects a partial carrier matrix", () => {
  const values = fixture();
  values.carrier.matrix.pop();
  const result = execute(values);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /carrier matrix is missing/u);
});
