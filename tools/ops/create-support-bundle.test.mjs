import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("support bundle keeps only allowlisted readiness fields and writes a digest manifest", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "yujian-support-"));
  const output = resolve(directory, "bundle.json");
  const result = spawnSync(process.execPath, [new URL("./create-support-bundle.mjs", import.meta.url).pathname], {
    env: { ...process.env, YUJIAN_SUPPORT_TICKET_ID: "ticket-preview", YUJIAN_ENVIRONMENT: "environment-preview", SUPPORT_BUNDLE_OUTPUT: output, YUJIAN_READINESS_JSON: JSON.stringify({ ready: true, token: "must-not-leak", nodes: [{ id: "rtc-a", healthy: true, apiSecret: "must-not-leak" }] }) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const bundle = readFileSync(output, "utf8");
  assert.equal(bundle.includes("must-not-leak"), false);
  assert.equal(JSON.parse(bundle).containsMedia, false);
  assert.match(JSON.parse(readFileSync(`${output}.manifest.json`, "utf8")).sha256, /^sha256:[0-9a-f]{64}$/u);
});
