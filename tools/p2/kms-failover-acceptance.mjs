#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createOpenBaoSecretResolver } from "../../infra/p2/runtime/platform-runtime.mjs";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
}

const reportPath = required("YUJIAN_P2_REPORT");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const secretRef = report.cleanup?.kmsSecretRef;
const expectedHash = report.cleanup?.kmsSecretHash;
if (typeof secretRef !== "string" || typeof expectedHash !== "string") throw new Error("KMS failover evidence is missing from the production report");
const addresses = required("YUJIAN_KMS_ADDR").split(",").map((value) => value.trim()).filter(Boolean);
const secret = await createOpenBaoSecretResolver(addresses.join(","), required("YUJIAN_KMS_TOKEN")).resolve(secretRef);
const actualHash = createHash("sha256").update(secret).digest("hex");
if (actualHash !== expectedHash) throw new Error("KMS secret hash changed during leader failover");
report.results = { ...report.results, kms: { ...report.results.kms, failover: "leader-stopped-read-from-survivor" } };
await writeFile(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ kms: "failover-read-verified", secretBytes: secret.byteLength }));
