import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve("infra/upstream/livekit-versions.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const patchQueue = JSON.parse(
  readFileSync(resolve("infra/upstream/livekit-patch-queue.json"), "utf8"),
);
const network = process.argv.includes("--network");

function fail(message) {
  throw new Error(`LiveKit manifest invalid: ${message}`);
}

function validateLocal() {
  if (manifest.schemaVersion !== 1) {
    fail("schemaVersion must be 1");
  }
  if (manifest.policy?.organization !== "livekit") {
    fail("only the livekit organization is allowed");
  }
  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    fail("components must be non-empty");
  }
  if (
    patchQueue.schemaVersion !== 1 ||
    patchQueue.baseManifest !== "livekit-versions.json" ||
    !Array.isArray(patchQueue.patches)
  ) {
    fail("patch queue contract is invalid");
  }
  if (
    patchQueue.policy?.allowMediaCorePatches !== false ||
    patchQueue.patches.length !== 0
  ) {
    fail("M1 requires an empty patch queue with media core patches disabled");
  }

  const ids = new Set();
  for (const component of manifest.components) {
    if (ids.has(component.id)) {
      fail(`duplicate component id ${component.id}`);
    }
    ids.add(component.id);
    if (!/^https:\/\/github\.com\/livekit\/[A-Za-z0-9._-]+\.git$/.test(component.repository)) {
      fail(`${component.id} must use an official LiveKit Git repository`);
    }
    if (typeof component.tag !== "string" || component.tag.length === 0) {
      fail(`${component.id} is missing a tag`);
    }
    if (!/^[0-9a-f]{40}$/.test(component.commit)) {
      fail(`${component.id} has an invalid commit`);
    }
    if (component.package?.registry !== undefined && component.package.registry !== "npm") {
      fail(`${component.id} uses an unsupported package registry`);
    }
  }

  for (const image of [
    ...(manifest.images ?? []),
    ...(manifest.supportingImages ?? []),
  ]) {
    if (!/^sha256:[0-9a-f]{64}$/.test(image.digest)) {
      fail(`${image.id} has an invalid digest`);
    }
    if (!/^linux\/(amd64|arm64)$/.test(image.platform)) {
      fail(`${image.id} has an unsupported platform`);
    }
    if (image.reference.endsWith(":latest")) {
      fail(`${image.id} must not use latest`);
    }
  }
}

function resolveRemoteCommit(component) {
  const output = execFileSync(
    "git",
    [
      "ls-remote",
      "--tags",
      component.repository,
      `refs/tags/${component.tag}`,
      `refs/tags/${component.tag}^{}`,
    ],
    { encoding: "utf8" },
  );
  const refs = output.trim().split("\n").filter(Boolean);
  const dereferenced = refs.find((line) => line.endsWith("^{}"));
  return (dereferenced ?? refs[0])?.split(/\s+/u)[0];
}

function validateNetwork() {
  for (const component of manifest.components) {
    const remoteCommit = resolveRemoteCommit(component);
    if (remoteCommit !== component.commit) {
      fail(
        `${component.id} expected ${component.commit} at ${component.tag}, got ${remoteCommit ?? "none"}`,
      );
    }
    if (component.package?.registry === "npm") {
      const version = execFileSync(
        "npm",
        ["view", `${component.package.name}@${component.package.version}`, "version", "--json"],
        { encoding: "utf8" },
      );
      if (JSON.parse(version) !== component.package.version) {
        fail(`${component.id} npm package version cannot be resolved`);
      }
    }
  }
}

validateLocal();
if (network) {
  validateNetwork();
}

console.log(
  `LiveKit manifest verified (${manifest.components.length} components, ${
    network ? "network" : "local"
  } mode)`,
);
