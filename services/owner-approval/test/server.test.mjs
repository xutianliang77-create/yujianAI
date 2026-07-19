import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createOwnerApprovalServer,
  OwnerApprovalCatalog,
  OwnerApprovalEvidenceStore,
  OwnerApprovalService,
} from "../dist/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function jsonRequest(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
  });
  return { status: response.status, body: await response.json() };
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

test("approval server preserves originals and appends a hash-linked superseding decision chain", async () => {
  const evidenceRoot = await mkdtemp(join(tmpdir(), "yujian-owner-approval-"));
  const catalog = await OwnerApprovalCatalog.load(
    join(repoRoot, "docs/governance/owner-decisions"),
    join(repoRoot, "docs/acceptance/p1-owner-key-registry.json"),
  );
  const evidence = new OwnerApprovalEvidenceStore(evidenceRoot);
  const signedInputs = [];
  const signer = {
    async sign(input) {
      signedInputs.push(input);
      return {
        keyUri: input.wrappedToken.includes("cross-owner")
          ? "openbao://yujian-owner-aaa"
          : `openbao://yujian-owner-${input.owner}`,
        keyVersion: 1,
        signature: "vault:v1:dGVzdC1zaWduYXR1cmU=",
        verified: true,
        credentialRevoked: true,
      };
    },
  };
  const logs = [];
  const service = new OwnerApprovalService(catalog, evidence, signer);
  let clock = 0;
  const server = createOwnerApprovalServer({ assetRoot: join(repoRoot, "apps/owner-approval") }, service, {
    logger: (event) => logs.push(event),
    now: () => { clock += 60_001; return clock; },
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Owner 审批台/u);
    assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/u);

    const listed = await jsonRequest(base, "/api/v1/owner-approvals?owner=bbb");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.tasks.length, 2);
    assert.equal(listed.body.data.productionReleaseAuthorized, false);
    const task = listed.body.data.tasks.find((candidate) => candidate.decisionType === "redis-release");
    assert.ok(task);
    assert.equal(task.currentSequence, 0);
    assert.deepEqual(task.history, []);

    const invalid = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:decide`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        decision: "approve",
        reason: "理由太短",
        wrappedToken: "wrapped-token-that-is-never-unwrapped",
        confirmEvidenceReviewed: true,
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(signedInputs.length, 0);

    const wrappedToken = "wrapped-token-visible-only-to-test";
    const decided = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:decide`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        decision: "reject",
        reason: "已审阅全部 Redis 回归与签名证据，当前回滚前置条件不完整，因此驳回。",
        wrappedToken,
        confirmEvidenceReviewed: true,
      }),
    });
    assert.equal(decided.status, 201);
    assert.equal(decided.body.data.receipt.signatureVerified, true);
    assert.equal(decided.body.data.receipt.credentialRevoked, true);
    assert.equal(decided.body.data.receipt.productionReleaseAuthorized, false);
    assert.equal(signedInputs.length, 1);

    const recorded = ["decision.json", "signature.json", "result.json"];
    const contents = await Promise.all(recorded.map((name) => readFile(join(evidenceRoot, task.decisionId, name), "utf8")));
    const originalHashes = contents.map(sha256);
    assert.equal(contents.join("\n").includes(wrappedToken), false);

    const duplicate = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:decide`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        decision: "approve",
        reason: "这次重复决定必须在解包另一个 token 以前就被拒绝，不能覆盖原决定。",
        wrappedToken: "another-wrapped-token-that-must-not-be-used",
        confirmEvidenceReviewed: true,
      }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(signedInputs.length, 1);
    assert.equal(JSON.stringify(logs).includes(wrappedToken), false);

    const afterOriginal = await jsonRequest(base, "/api/v1/owner-approvals?owner=bbb");
    const originalTask = afterOriginal.body.data.tasks.find((candidate) => candidate.decisionId === task.decisionId);
    assert.equal(originalTask.currentSequence, 0);
    assert.equal(originalTask.history.length, 1);
    assert.match(originalTask.currentReceiptSha256, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(originalTask.receipt.signature, undefined);

    const crossOwner = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:supersede`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        expectedReceiptSha256: originalTask.currentReceiptSha256,
        decision: "approve",
        reason: "补充证据已经完成复核，但本次请求故意使用其他 Owner 的凭据进行隔离测试。",
        supersessionReason: "本次只验证跨 Owner 凭据不能生成替代记录，原始证据必须保持不变。",
        wrappedToken: "wrapped-cross-owner-token-for-test",
        confirmEvidenceReviewed: true,
        confirmOriginalPreserved: true,
      }),
    });
    assert.equal(crossOwner.status, 409);
    assert.equal((await evidence.history(task.decisionId)).length, 1);

    const supersedingToken = "wrapped-token-for-first-supersession";
    const superseded = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:supersede`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        expectedReceiptSha256: originalTask.currentReceiptSha256,
        decision: "approve",
        reason: "已复核新增回滚证据和发布边界，现批准该候选进入后续流程，但不自动放行生产。",
        supersessionReason: "原决定之后补齐了可验证的回滚前置条件，因此追加一份替代决定。",
        wrappedToken: supersedingToken,
        confirmEvidenceReviewed: true,
        confirmOriginalPreserved: true,
      }),
    });
    assert.equal(superseded.status, 201);
    assert.equal(superseded.body.data.receipt.taskId, "P1-M0-04-PERSONAL-OWNER-SUPERSESSION");
    assert.equal(superseded.body.data.receipt.supersessionSequence, 1);
    assert.equal(superseded.body.data.receipt.supersedesReceiptSha256, originalTask.currentReceiptSha256);
    assert.equal(superseded.body.data.receipt.productionReleaseAuthorized, false);

    const unchanged = await Promise.all(recorded.map((name) => readFile(join(evidenceRoot, task.decisionId, name), "utf8")));
    assert.deepEqual(unchanged.map(sha256), originalHashes);
    const supersessionRoot = join(evidenceRoot, task.decisionId, "supersessions", "000001");
    const supersessionContents = await Promise.all(recorded.map((name) => readFile(join(supersessionRoot, name), "utf8")));
    assert.equal(supersessionContents.join("\n").includes(supersedingToken), false);
    for (const name of recorded) {
      assert.equal((await stat(join(supersessionRoot, name))).mode & 0o777, 0o600);
    }

    const afterSupersession = await jsonRequest(base, "/api/v1/owner-approvals?owner=bbb");
    const effectiveTask = afterSupersession.body.data.tasks.find((candidate) => candidate.decisionId === task.decisionId);
    assert.equal(effectiveTask.currentSequence, 1);
    assert.equal(effectiveTask.receipt.decision, "approve");
    assert.equal(effectiveTask.history.length, 2);
    assert.equal(effectiveTask.history[1].supersedesReceiptSha256, originalTask.currentReceiptSha256);

    const stale = await jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:supersede`, {
      method: "POST",
      body: JSON.stringify({
        revision: task.revision,
        expectedReceiptSha256: originalTask.currentReceiptSha256,
        decision: "reject",
        reason: "该请求基于已经过期的决定哈希，必须在使用一次性凭据以前被拒绝。",
        supersessionReason: "这是旧页面并发保护的负向测试，不得产生任何新的证据记录。",
        wrappedToken: "stale-wrapped-token-that-must-not-be-used",
        confirmEvidenceReviewed: true,
        confirmOriginalPreserved: true,
      }),
    });
    assert.equal(stale.status, 409);
    assert.equal(signedInputs.length, 3);

    const concurrentBody = (wrappedTokenValue, reason) => JSON.stringify({
      revision: task.revision,
      expectedReceiptSha256: effectiveTask.currentReceiptSha256,
      decision: "reject",
      reason,
      supersessionReason: "两份并发请求只能有一份追加成功，另一份必须因哈希变化或锁冲突失败。",
      wrappedToken: wrappedTokenValue,
      confirmEvidenceReviewed: true,
      confirmOriginalPreserved: true,
    });
    const concurrent = await Promise.all([
      jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:supersede`, {
        method: "POST",
        body: concurrentBody("concurrent-wrapped-token-a", "并发请求 A 重新评估后决定驳回，测试追加式写入和原证据保护。"),
      }),
      jsonRequest(base, `/api/v1/owner-approvals/${task.decisionId}:supersede`, {
        method: "POST",
        body: concurrentBody("concurrent-wrapped-token-b", "并发请求 B 重新评估后决定驳回，测试只有一个请求能够签名归档。"),
      }),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409]);
    assert.equal(signedInputs.length, 4);
    const finalHistory = await evidence.history(task.decisionId);
    assert.equal(finalHistory.length, 3);
    assert.equal(finalHistory[2].sequence, 2);
    assert.deepEqual(await readdir(join(evidenceRoot, task.decisionId, "supersessions")), ["000001", "000002"]);
    const finalOriginals = await Promise.all(recorded.map((name) => readFile(join(evidenceRoot, task.decisionId, name), "utf8")));
    assert.deepEqual(finalOriginals.map(sha256), originalHashes);
    assert.equal(JSON.stringify(logs).includes("wrapped-token"), false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});
