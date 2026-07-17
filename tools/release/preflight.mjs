import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync(resolve("infra/release/release-manifest.json"), "utf8"));
if (typeof manifest !== "object" || manifest === null || manifest.schemaVersion !== 1 || typeof manifest.releaseChannel !== "string") {
  process.stderr.write("release manifest schema is invalid\n");
  process.exitCode = 2;
} else if (!Array.isArray(manifest.requiredChecks) || manifest.requiredChecks.length === 0 || manifest.requiredChecks.some((check) => typeof check !== "string" || check.length === 0)) {
  process.stderr.write("release manifest requiredChecks is invalid\n");
  process.exitCode = 2;
} else {
  const requiredChecks = [...manifest.requiredChecks];
  if (new Set(requiredChecks).size !== requiredChecks.length) {
    process.stderr.write("release manifest contains duplicate required checks\n");
    process.exitCode = 2;
    process.exit();
  }
  const evidence = new Set((process.env.YUJIAN_RELEASE_EVIDENCE ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  const unknown = [...evidence].filter((check) => !requiredChecks.includes(check));
  if (unknown.length > 0) {
    process.stderr.write(`release blocked; unknown evidence: ${unknown.join(", ")}\n`);
    process.exitCode = 2;
    process.exit();
  }
  const forbiddenStates = new Set(Array.isArray(manifest.forbiddenReleaseStates) ? manifest.forbiddenReleaseStates : []);
  const currentStates = new Set((process.env.YUJIAN_RELEASE_STATES ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  const blockedStates = [...currentStates].filter((state) => forbiddenStates.has(state));
  if (blockedStates.length > 0) {
    process.stderr.write(`release blocked; forbidden states: ${blockedStates.join(", ")}\n`);
    process.exitCode = 2;
    process.exit();
  }
  const missing = requiredChecks.filter((check) => !evidence.has(check));
  if (missing.length > 0) {
    process.stderr.write(`release blocked; missing evidence: ${missing.join(", ")}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(`release evidence preflight passed; checks=${requiredChecks.length}\n`);
  }
}
