import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.env.SUPPORT_BUNDLE_OUTPUT ?? `outputs/support/${Date.now()}.json`);
mkdirSync(resolve(output, ".."), { recursive: true });
const redact = (value) => value
  .replace(/(secret|token|credential|password)\s*[:=]\s*[^\s,}]+/giu, "$1=<redacted>")
  .replace(/\b\+?\d[\d -]{7,}\b/gu, "<number-redacted>");
const bundle = {
  generatedAt: new Date().toISOString(),
  gitCommit: process.env.GIT_COMMIT ?? "unknown",
  environment: process.env.YUJIAN_ENVIRONMENT ?? "unknown",
  readiness: process.env.YUJIAN_READINESS_JSON ? redact(process.env.YUJIAN_READINESS_JSON) : "not-provided",
  notes: "Only synthetic identifiers and redacted diagnostics are allowed; never include media or user payloads.",
};
writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
process.stdout.write(`Support bundle written to ${output}\n`);
