import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const replayScript = join(repositoryRoot, "tools/upstream/replay-patch-queue.mjs");

test("patch replay reports a clean application and fails closed on conflict", () => {
  const root = mkdtempSync(join(tmpdir(), "yujian-upstream-replay-test-"));
  try {
    const source = join(root, "source");
    const remoteRoot = join(root, "remote");
    const remote = join(remoteRoot, "demo.git");
    const mirrorRoot = join(root, "mirrors");
    const mirror = join(mirrorRoot, "demo.git");
    const fixtureRoot = join(root, "fixture");
    const patchRoot = join(fixtureRoot, "patches");
    mkdirSync(source, { recursive: true });
    mkdirSync(remoteRoot, { recursive: true });
    mkdirSync(mirrorRoot, { recursive: true });
    mkdirSync(patchRoot, { recursive: true });

    git(source, ["init", "--quiet"]);
    git(source, ["config", "user.name", "Yujian Test"]);
    git(source, ["config", "user.email", "test@yujian.invalid"]);
    writeFileSync(join(source, "message.txt"), "base\n");
    git(source, ["add", "message.txt"]);
    git(source, ["commit", "--quiet", "-m", "base"]);
    const commit = git(source, ["rev-parse", "HEAD"]).trim();
    execFileSync("git", ["clone", "--quiet", "--bare", source, remote]);
    execFileSync("git", ["clone", "--quiet", "--mirror", remote, mirror]);

    const manifestPath = join(fixtureRoot, "manifest.json");
    const queuePath = join(fixtureRoot, "queue.json");
    const patchPath = join(patchRoot, "demo.patch");
    writeJson(manifestPath, {
      schemaVersion: 1,
      components: [{ id: "demo", repository: remote, tag: "v1.0.0", commit }],
    });

    writeFileSync(patchPath, validPatch());
    writeJson(queuePath, queue(commit, patchPath));
    const successReport = join(root, "success.json");
    const success = runReplay({ manifestPath, queuePath, mirrorRoot, reportPath: successReport });
    assert.equal(success.status, 0, success.stderr);
    const passed = JSON.parse(readFileSync(successReport, "utf8"));
    assert.equal(passed.status, "passed");
    assert.deepEqual(passed.summary, { repositories: 1, components: 1, patches: 1, conflicts: 0 });
    assert.notEqual(passed.components[0].baseTree, passed.components[0].resultTree);

    writeFileSync(patchPath, conflictingPatch());
    writeJson(queuePath, queue(commit, patchPath));
    const conflictReport = join(root, "conflict.json");
    const conflict = runReplay({ manifestPath, queuePath, mirrorRoot, reportPath: conflictReport });
    assert.equal(conflict.status, 1);
    const failed = JSON.parse(readFileSync(conflictReport, "utf8"));
    assert.equal(failed.status, "failed");
    assert.equal(failed.failure.code, "PATCH_CONFLICT");
    assert.match(failed.failure.message, /does not apply/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function queue(commit, patchPath) {
  const bytes = readFileSync(patchPath);
  return {
    schemaVersion: 1,
    baseManifest: "manifest.json",
    policy: { default: "clean-upstream", allowMediaCorePatches: false },
    patches: [{
      id: "demo-control-plane-change",
      componentId: "demo",
      baseCommit: commit,
      patchFile: "patches/demo.patch",
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      license: "Apache-2.0",
      purpose: "exercise replay gate",
      scope: "message.txt",
      compatibility: "fixture only",
      security: "no runtime effect",
      tests: "node test",
      rollback: "remove patch entry",
      upstream: "not applicable to fixture",
      owner: "release-owner",
      reviewDate: "2026-07-18",
    }],
  };
}

function runReplay({ manifestPath, queuePath, mirrorRoot, reportPath }) {
  return spawnSync(process.execPath, [replayScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      YUJIAN_UPSTREAM_MANIFEST: manifestPath,
      YUJIAN_UPSTREAM_PATCH_QUEUE: queuePath,
      YUJIAN_UPSTREAM_MIRROR_ROOT: mirrorRoot,
      YUJIAN_UPSTREAM_REPLAY_REPORT: reportPath,
    },
  });
}

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function validPatch() {
  return `diff --git a/message.txt b/message.txt
index df967b9..b6f00f2 100644
--- a/message.txt
+++ b/message.txt
@@ -1 +1 @@
-base
+patched
`;
}

function conflictingPatch() {
  return `diff --git a/message.txt b/message.txt
index 14f8f4e..b6f00f2 100644
--- a/message.txt
+++ b/message.txt
@@ -1 +1 @@
-missing
+patched
`;
}
