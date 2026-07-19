#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
}

const report = JSON.parse(await readFile(required("YUJIAN_P2_REPORT"), "utf8"));
const secretRef = report.cleanup?.kmsSecretRef;
if (typeof secretRef !== "string") throw new Error("KMS secret reference is missing from the production report");
const token = required("YUJIAN_KMS_ADMIN_TOKEN");
const addresses = required("YUJIAN_KMS_ADDR").split(",").map((value) => value.trim()).filter(Boolean);
let removed = false;
for (const address of addresses) {
  const response = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/metadata/${secretRef}`, {
    method: "DELETE",
    headers: { "X-Vault-Token": token },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
  if (response?.ok) { removed = true; break; }
}
if (!removed) throw new Error("KMS acceptance secret cleanup failed on every HA address");
console.log(JSON.stringify({ kms: "acceptance-secret-deleted" }));
