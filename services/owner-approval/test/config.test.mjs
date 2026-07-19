import assert from "node:assert/strict";
import test from "node:test";
import { loadOwnerApprovalConfig } from "../dist/index.js";

const base = {
  YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT: "/tmp/yujian-owner-approval-test",
  YUJIAN_OWNER_OPENBAO_ADDRS: "https://127.0.0.1:18200,https://127.0.0.1:18201",
};

test("loopback configuration starts without public TLS and keeps absolute paths", () => {
  const config = loadOwnerApprovalConfig(base);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8093);
  assert.equal(config.evidenceRoot, base.YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT);
  assert.equal(config.tls, undefined);
  assert.deepEqual(config.openBaoAddresses, ["https://127.0.0.1:18200", "https://127.0.0.1:18201"]);
});

test("non-loopback plaintext and relative evidence paths fail closed", () => {
  assert.throws(() => loadOwnerApprovalConfig({
    ...base,
    YUJIAN_OWNER_APPROVAL_HOST: "0.0.0.0",
  }), /requires TLS/u);
  assert.throws(() => loadOwnerApprovalConfig({
    ...base,
    YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT: "relative/evidence",
  }), /absolute path/u);
});
