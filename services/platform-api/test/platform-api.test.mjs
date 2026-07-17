import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import { createPlatformServer } from "../dist/index.js";

const config = {
  host: "127.0.0.1",
  port: 8090,
  platformCredentials: [
    {
      tenantId: "tenant-preview",
      projectId: "project-demo",
      environmentId: "environment-local",
      credential: "platform-unit-test-key-not-for-production",
    },
  ],
  livekit: {
    wsUrl: "ws://127.0.0.1:7880",
    apiKey: "platform-api-unit-test",
    apiSecret: "platform-api-unit-test-credential",
  },
};
const platformCredential = config.platformCredentials[0];
const platformScope = {
  tenantId: platformCredential.tenantId,
  projectId: platformCredential.projectId,
  environmentId: platformCredential.environmentId,
};

const server = createPlatformServer(config, {
  readinessCheck: async () => ({ latencyMs: 2, activeRoomCount: 0 }),
  logger: () => {},
});

let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("health and readiness endpoints do not require platform credentials", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const readiness = await fetch(`${baseUrl}/readyz`);
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).upstream, "livekit");
});

test("token endpoint rejects missing credentials", async () => {
  const response = await fetch(`${baseUrl}/platform/v1/rtc/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...platformScope,
      roomName: "quickstart",
      participantIdentity: "developer-001",
    }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "AUTHENTICATION_FAILED");
});

test("token endpoint rejects unknown contract fields", async () => {
  const response = await fetch(`${baseUrl}/platform/v1/rtc/token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformCredential.credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...platformScope,
      roomName: "quickstart",
      participantIdentity: "developer-001",
      apiSecret: "not-an-accepted-request-field",
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "VALIDATION_FAILED");
  assert.equal(body.error.details[0].field, "apiSecret");
});

test("token endpoint rejects a valid credential outside its bound environment", async () => {
  const response = await fetch(`${baseUrl}/platform/v1/rtc/token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformCredential.credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...platformScope,
      environmentId: "environment-other",
      roomName: "quickstart",
      participantIdentity: "developer-001",
    }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "AUTHORIZATION_FAILED");
});

test("token endpoint returns a LiveKit-compatible short-lived JWT", async () => {
  const response = await fetch(`${baseUrl}/platform/v1/rtc/token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformCredential.credential}`,
      "content-type": "application/json",
      "x-request-id": "test-request-001",
    },
    body: JSON.stringify({
      ...platformScope,
      roomName: "quickstart",
      participantIdentity: "developer-001",
      permissions: {
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      },
      ttlSeconds: 60,
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.requestId, "test-request-001");
  assert.equal(body.data.url, config.livekit.wsUrl);
  assert.equal(body.data.nodeId, "primary");

  const claims = await new TokenVerifier(
    config.livekit.apiKey,
    config.livekit.apiSecret,
  ).verify(body.data.token);
  assert.equal(claims.sub, "developer-001");
  assert.equal(claims.video.room, "quickstart");
  assert.equal(claims.video.canPublishData, false);
  assert.deepEqual(claims.attributes, {
    "yujian.environment_id": platformScope.environmentId,
    "yujian.project_id": platformScope.projectId,
    "yujian.tenant_id": platformScope.tenantId,
  });
  assert.equal(JSON.stringify(body).includes(config.livekit.apiSecret), false);
});
