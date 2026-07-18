import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { OpenBaoOwnerSigner, OwnerSignerError } from "../dist/index.js";

async function withOpenBao(callback) {
  const calls = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    calls.push({ path: request.url, token: request.headers["x-vault-token"], body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/sys/wrapping/unwrap") {
      const wrongOwner = request.headers["x-vault-token"] === "wrapped-token-belonging-to-bbb";
      const overprivileged = request.headers["x-vault-token"] === "overprivileged-wrapped-token-for-aaa";
      response.end(JSON.stringify({ auth: {
        client_token: "personal-token-from-one-time-unwrap",
        token_policies: [`yujian-owner-${wrongOwner ? "bbb" : "aaa"}-signer`, ...(overprivileged ? ["root"] : [])],
        metadata: { personal_owner: wrongOwner ? "bbb" : "aaa" },
        lease_duration: 600,
        renewable: false,
      } }));
      return;
    }
    if (request.url === "/v1/transit/sign/yujian-owner-aaa/sha2-256") {
      response.end(JSON.stringify({ data: { signature: "vault:v1:ZmFrZS1hc24xLXNpZ25hdHVyZQ==" } }));
      return;
    }
    if (request.url === "/v1/transit/verify/yujian-owner-aaa/sha2-256") {
      response.end(JSON.stringify({ data: { valid: true } }));
      return;
    }
    if (request.url === "/v1/auth/token/revoke-self") {
      response.statusCode = 204;
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ errors: ["not found"] }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try { await callback(`http://127.0.0.1:${address.port}`, calls); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("OpenBao signer unwraps, binds owner, signs, verifies and revokes", async () => {
  await withOpenBao(async (address, calls) => {
    const signer = new OpenBaoOwnerSigner([address]);
    const result = await signer.sign({
      owner: "aaa",
      artifact: Buffer.from("owner-decision"),
      wrappedToken: "wrapped-token-belonging-to-aaa",
    });
    assert.deepEqual(calls.map((call) => call.path), [
      "/v1/sys/wrapping/unwrap",
      "/v1/transit/sign/yujian-owner-aaa/sha2-256",
      "/v1/transit/verify/yujian-owner-aaa/sha2-256",
      "/v1/auth/token/revoke-self",
    ]);
    assert.equal(calls[0].token, "wrapped-token-belonging-to-aaa");
    assert.ok(calls.slice(1).every((call) => call.token === "personal-token-from-one-time-unwrap"));
    assert.equal(result.keyUri, "openbao://yujian-owner-aaa");
    assert.equal(result.verified, true);
    assert.equal(result.credentialRevoked, true);
  });
});

test("OpenBao signer rejects cross-owner credentials and revokes them", async () => {
  await withOpenBao(async (address, calls) => {
    const signer = new OpenBaoOwnerSigner([address]);
    await assert.rejects(() => signer.sign({
      owner: "aaa",
      artifact: Buffer.from("owner-decision"),
      wrappedToken: "wrapped-token-belonging-to-bbb",
    }), (error) => error instanceof OwnerSignerError && error.statusCode === 403);
    assert.deepEqual(calls.map((call) => call.path), [
      "/v1/sys/wrapping/unwrap",
      "/v1/auth/token/revoke-self",
    ]);
  });
});

test("OpenBao signer rejects an owner token with any additional policy", async () => {
  await withOpenBao(async (address, calls) => {
    const signer = new OpenBaoOwnerSigner([address]);
    await assert.rejects(() => signer.sign({
      owner: "aaa",
      artifact: Buffer.from("owner-decision"),
      wrappedToken: "overprivileged-wrapped-token-for-aaa",
    }), (error) => error instanceof OwnerSignerError && error.statusCode === 403);
    assert.deepEqual(calls.map((call) => call.path), [
      "/v1/sys/wrapping/unwrap",
      "/v1/auth/token/revoke-self",
    ]);
  });
});
