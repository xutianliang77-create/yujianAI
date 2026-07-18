#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

class ReplayFailure extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const workspaceRoot = resolve(".");
const manifestPath = resolve(
  process.env.YUJIAN_UPSTREAM_MANIFEST ?? "infra/upstream/livekit-versions.json",
);
const queuePath = resolve(
  process.env.YUJIAN_UPSTREAM_PATCH_QUEUE ?? "infra/upstream/livekit-patch-queue.json",
);
const reportPath = process.env.YUJIAN_UPSTREAM_REPLAY_REPORT === undefined
  ? undefined
  : resolve(process.env.YUJIAN_UPSTREAM_REPLAY_REPORT);

try {
  const report = replay();
  writeReport(report);
  process.stdout.write(
    `Patch queue replay passed: ${report.summary.components} components, ${report.summary.patches} patches\n`,
  );
} catch (error) {
  const failure = error instanceof ReplayFailure
    ? error
    : new ReplayFailure("REPLAY_FAILED", error instanceof Error ? error.message : "unknown replay error");
  writeReport({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "failed",
    failure: { code: failure.code, message: failure.message },
  });
  process.stderr.write(`Patch queue replay failed [${failure.code}]: ${failure.message}\n`);
  process.exitCode = 1;
}

function replay() {
  const mirrorRootValue = process.env.YUJIAN_UPSTREAM_MIRROR_ROOT;
  if (mirrorRootValue === undefined || mirrorRootValue.trim() === "") {
    fail("MIRROR_ROOT_REQUIRED", "YUJIAN_UPSTREAM_MIRROR_ROOT must be set");
  }
  let mirrorRoot;
  try {
    mirrorRoot = realpathSync(resolve(mirrorRootValue));
  } catch {
    fail("MIRROR_INVALID", "upstream mirror root cannot be resolved");
  }
  assertExternalPath(mirrorRoot, "mirror root");

  const manifestBytes = readFile(manifestPath, "manifest");
  const queueBytes = readFile(queuePath, "patch queue");
  const manifest = parseJson(manifestBytes, "manifest");
  const queue = parseJson(queueBytes, "patch queue");
  const components = validateContracts(manifest, queue);
  const patches = validatePatches(queue.patches, components);
  const patchGroups = Map.groupBy(patches, (patch) => patch.componentId);
  const replayRoot = mkdtempSync(join(tmpdir(), "yujian-upstream-replay-"));
  const verifiedRepositories = new Set();

  try {
    const componentReports = [];
    for (const component of components.values()) {
      const mirror = join(mirrorRoot, `${basename(component.repository, ".git")}.git`);
      if (!verifiedRepositories.has(component.repository)) {
        verifyMirror(mirror, component.repository);
        verifiedRepositories.add(component.repository);
      }
      const baseTree = git(mirror, ["rev-parse", `${component.commit}^{tree}`], "PINNED_COMMIT_MISSING").trim();
      const componentPatches = patchGroups.get(component.id) ?? [];
      const resultTree = componentPatches.length === 0
        ? baseTree
        : replayComponent(component, componentPatches, mirror, join(replayRoot, safeName(component.id)));
      componentReports.push({
        id: component.id,
        repository: component.repository,
        tag: component.tag,
        commit: component.commit,
        baseTree,
        resultTree,
        patches: componentPatches.map((patch) => ({
          id: patch.id,
          patchFile: patch.patchFile,
          sha256: patch.sha256,
        })),
      });
    }
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "passed",
      manifest: {
        file: basename(manifestPath),
        sha256: digest(manifestBytes),
      },
      patchQueue: {
        file: basename(queuePath),
        sha256: digest(queueBytes),
      },
      summary: {
        repositories: verifiedRepositories.size,
        components: componentReports.length,
        patches: patches.length,
        conflicts: 0,
      },
      components: componentReports,
    };
  } finally {
    rmSync(replayRoot, { recursive: true, force: true });
  }
}

function validateContracts(manifest, queue) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.components) || manifest.components.length === 0) {
    fail("MANIFEST_INVALID", "manifest must contain schemaVersion 1 components");
  }
  if (
    queue?.schemaVersion !== 1 ||
    queue.baseManifest !== basename(manifestPath) ||
    queue.policy?.allowMediaCorePatches !== false ||
    !Array.isArray(queue.patches)
  ) {
    fail("PATCH_QUEUE_INVALID", "patch queue contract or base manifest is invalid");
  }
  const components = new Map();
  for (const component of manifest.components) {
    if (
      !/^[A-Za-z0-9._-]{1,128}$/u.test(component?.id ?? "") ||
      typeof component.repository !== "string" || component.repository.length === 0 ||
      typeof component.tag !== "string" || component.tag.length === 0 ||
      !/^[0-9a-f]{40}$/u.test(component.commit ?? "") ||
      components.has(component.id)
    ) {
      fail("MANIFEST_INVALID", "manifest component identity, repository, tag or commit is invalid");
    }
    components.set(component.id, component);
  }
  return components;
}

function validatePatches(entries, components) {
  const requiredText = [
    "id", "componentId", "patchFile", "license", "purpose", "scope", "compatibility",
    "security", "tests", "rollback", "upstream", "owner", "reviewDate",
  ];
  const ids = new Set();
  return entries.map((entry) => {
    if (requiredText.some((field) => typeof entry?.[field] !== "string" || entry[field].trim() === "")) {
      fail("PATCH_METADATA_INVALID", "every patch must contain the required review metadata");
    }
    if (!/^[A-Za-z0-9._-]{1,128}$/u.test(entry.id) || ids.has(entry.id)) {
      fail("PATCH_METADATA_INVALID", `patch id ${String(entry.id)} is invalid or duplicated`);
    }
    ids.add(entry.id);
    const component = components.get(entry.componentId);
    if (component === undefined || entry.baseCommit !== component.commit) {
      fail("PATCH_BASE_MISMATCH", `patch ${entry.id} does not target its frozen component commit`);
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(entry.sha256 ?? "")) {
      fail("PATCH_METADATA_INVALID", `patch ${entry.id} has an invalid SHA-256`);
    }
    const reviewTime = Date.parse(`${entry.reviewDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(entry.reviewDate) || !Number.isFinite(reviewTime) || new Date(reviewTime).toISOString().slice(0, 10) !== entry.reviewDate) {
      fail("PATCH_METADATA_INVALID", `patch ${entry.id} reviewDate must be YYYY-MM-DD`);
    }
    const patchPath = resolvePatchPath(entry.patchFile);
    const bytes = readFile(patchPath, `patch ${entry.id}`);
    if (`sha256:${digest(bytes)}` !== entry.sha256) {
      fail("PATCH_DIGEST_MISMATCH", `patch ${entry.id} does not match its recorded SHA-256`);
    }
    return { ...entry, patchPath };
  });
}

function replayComponent(component, patches, mirror, worktree) {
  runGit(["clone", "--quiet", "--no-checkout", mirror, worktree], "WORKTREE_CREATE_FAILED");
  git(worktree, ["checkout", "--quiet", "--detach", component.commit], "WORKTREE_CREATE_FAILED");
  for (const patch of patches) {
    try {
      execFileSync("git", ["-C", worktree, "apply", "--check", "--whitespace=error-all", patch.patchPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      execFileSync("git", ["-C", worktree, "apply", "--index", "--whitespace=error-all", patch.patchPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      fail("PATCH_CONFLICT", `patch ${patch.id} does not apply to ${component.id} at ${component.commit}`);
    }
  }
  git(worktree, ["diff", "--cached", "--check"], "PATCH_WHITESPACE_INVALID");
  return git(worktree, ["write-tree"], "PATCH_TREE_FAILED").trim();
}

function verifyMirror(mirror, repository) {
  const bare = git(mirror, ["rev-parse", "--is-bare-repository"], "MIRROR_INVALID").trim();
  const origin = git(mirror, ["remote", "get-url", "origin"], "MIRROR_INVALID").trim();
  if (bare !== "true" || origin !== repository) {
    fail("MIRROR_INVALID", `mirror for ${repository} is not a clean bare origin mirror`);
  }
}

function resolvePatchPath(value) {
  if (isAbsolute(value)) fail("PATCH_PATH_INVALID", "patchFile must be relative");
  let patchRoot;
  let patchPath;
  try {
    patchRoot = realpathSync(resolve(dirname(queuePath), "patches"));
    patchPath = realpathSync(resolve(dirname(queuePath), value));
  } catch {
    fail("PATCH_PATH_INVALID", "patchFile cannot be resolved");
  }
  if (patchPath === patchRoot || !patchPath.startsWith(`${patchRoot}${sep}`) || !patchPath.endsWith(".patch")) {
    fail("PATCH_PATH_INVALID", "patchFile must be a .patch file under the patch queue patches directory");
  }
  return patchPath;
}

function assertExternalPath(path, label) {
  if (path === workspaceRoot || path.startsWith(`${workspaceRoot}${sep}`)) {
    fail("UNSAFE_PATH", `${label} must be outside the workspace`);
  }
}

function readFile(path, label) {
  try {
    return readFileSync(path);
  } catch {
    fail("INPUT_MISSING", `${label} cannot be read`);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("INPUT_INVALID", `${label} is not valid JSON`);
  }
}

function git(directory, args, code) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail(code, `git ${args[0]} failed for ${basename(directory)}`);
  }
}

function runGit(args, code) {
  try {
    execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    fail(code, `git ${args[0]} failed`);
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeName(value) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-");
}

function fail(code, message) {
  throw new ReplayFailure(code, message);
}

function writeReport(report) {
  if (reportPath === undefined) return;
  mkdirSync(dirname(reportPath), { recursive: true });
  const temporary = `${reportPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, reportPath);
}
