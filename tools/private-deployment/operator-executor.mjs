import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function required(name, pattern) {
  const value = process.env[name];
  if (value === undefined || !pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).slice(0, 2_048)}`);
  return result.stdout;
}

const DNS = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const release = required("YUJIAN_RELEASE_NAME", DNS);
const namespace = required("YUJIAN_RELEASE_NAMESPACE", DNS);
const chartRef = required("YUJIAN_CHART_REF", /^oci:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9._/-]+$/u);
const chartVersion = required("YUJIAN_CHART_VERSION", /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u);
const chartDigest = required("YUJIAN_CHART_DIGEST", DIGEST);
const rollback = process.env.YUJIAN_ROLLBACK_REVISION;
if (rollback !== undefined && !/^[1-9][0-9]*$/u.test(rollback)) throw new Error("YUJIAN_ROLLBACK_REVISION is invalid");
const approval = process.env.YUJIAN_APPROVAL_RECEIPT_REF;
if (rollback !== undefined && (approval === undefined || !/^(?:evidence|https|s3|oss):\/\/[^\s?#]+$/u.test(approval))) throw new Error("rollback requires a stable approval receipt reference");

const root = mkdtempSync(join(tmpdir(), "yujian-chart-"));
try {
  run("helm", ["pull", chartRef, "--version", chartVersion, "--destination", root]);
  const archives = readdirSync(root).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error("Helm pull did not produce exactly one chart archive");
  const chart = join(root, archives[0]);
  const actualDigest = `sha256:${createHash("sha256").update(readFileSync(chart)).digest("hex")}`;
  if (actualDigest !== chartDigest) throw new Error("Helm chart digest mismatch");
  run("node", ["/app/tools/private-deployment/upgrade-preflight.mjs"], process.env);
  if (rollback !== undefined) {
    run("helm", ["rollback", release, rollback, "--namespace", namespace, "--wait", "--cleanup-on-fail", "--timeout", "15m"]);
  } else {
    run("helm", ["upgrade", "--install", release, chart, "--namespace", namespace, "--create-namespace", "--values", "/var/run/yujian-values/values.yaml", "--atomic", "--cleanup-on-fail", "--wait", "--timeout", "15m", "--history-max", "10"]);
  }
  process.stdout.write(`${JSON.stringify({ status: "succeeded", release, namespace, chartDigest, rollbackRevision: rollback, approvalReceiptRef: approval })}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
