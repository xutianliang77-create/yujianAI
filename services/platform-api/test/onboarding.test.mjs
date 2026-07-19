import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformServer, PlatformStore } from "../dist/index.js";

async function withServer(callback) {
  const store = new PlatformStore();
  const identity = {
    authenticateSubject: async (token) => ({ subject: token, roles: [] }),
    authenticate: async (token) => {
      const member = [...store.members.values()].find((candidate) => candidate.subject === token && candidate.status === "active");
      if (member === undefined) return undefined;
      const environment = [...store.environments.values()].find((candidate) => candidate.tenantId === member.tenantId && candidate.status === "active");
      return environment === undefined ? undefined : {
        tenantId: member.tenantId,
        projectId: environment.projectId,
        environmentId: environment.environmentId,
        roles: member.roles,
      };
    },
  };
  const server = createPlatformServer({
    host: "127.0.0.1",
    port: 8090,
    platformCredentials: [{ tenantId: "bootstrap-tenant", projectId: "bootstrap-project", environmentId: "bootstrap-env", credential: "bootstrap-credential-not-for-production" }],
    livekit: { wsUrl: "ws://127.0.0.1:7880", apiKey: "onboarding-test", apiSecret: "onboarding-test-secret" },
  }, { store, identity, logger: () => undefined });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try { await callback(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

async function request(base, path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers ?? {}) },
  });
  let body;
  try { body = await response.json(); } catch { body = undefined; }
  return { status: response.status, body };
}

test("OIDC onboarding, invitation acceptance, persisted roles and cross-tenant isolation share one contract", async () => {
  await withServer(async (base) => {
    const onboard = async (subject, slug) => request(base, "/platform/v1/onboarding", subject, {
      method: "POST",
      headers: { "idempotency-key": `onboard-${slug}` },
      body: JSON.stringify({ tenantDisplayName: slug, projectName: "First project", projectSlug: slug, environmentName: "Development" }),
    });
    const alice = await onboard("oidc-alice", "alice-tenant");
    assert.equal(alice.status, 201);
    const scope = {
      tenantId: alice.body.data.tenant.tenantId,
      projectId: alice.body.data.project.projectId,
      environmentId: alice.body.data.environment.environmentId,
    };
    const invitation = await request(base, `/platform/v1/tenants/${scope.tenantId}/invitations`, "oidc-alice", {
      method: "POST",
      headers: { "idempotency-key": "invite-bob" },
      body: JSON.stringify({ subject: "oidc-bob", roles: ["developer"] }),
    });
    assert.equal(invitation.status, 201);
    assert.equal(invitation.body.data.status, "invited");
    const accepted = await request(base, `/platform/v1/invitations/${invitation.body.data.memberId}:accept`, "oidc-bob", { method: "POST" });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.data.status, "active");
    const denied = await request(base, `/platform/v1/tenants/${scope.tenantId}/invitations`, "oidc-bob", {
      method: "POST",
      headers: { "idempotency-key": "developer-escalation" },
      body: JSON.stringify({ subject: "oidc-mallory", roles: ["tenant_owner"] }),
    });
    assert.equal(denied.status, 403);
    const token = await request(base, "/platform/v1/rtc/token", "oidc-bob", {
      method: "POST",
      body: JSON.stringify({ ...scope, roomName: "first-room", participantIdentity: "bob", permissions: { canPublish: true, canSubscribe: true }, ttlSeconds: 60 }),
    });
    assert.equal(token.status, 201);
    const other = await onboard("oidc-carol", "carol-tenant");
    assert.equal(other.status, 201);
    const idor = await request(base, `/platform/v1/tenants/${other.body.data.tenant.tenantId}`, "oidc-alice");
    assert.equal(idor.status, 403);
  });
});

test("onboarding idempotency is scoped by verified identity", async () => {
  await withServer(async (base) => {
    const onboard = (subject) => request(base, "/platform/v1/onboarding", subject, {
      method: "POST",
      headers: { "idempotency-key": "same-client-key" },
      body: JSON.stringify({
        tenantDisplayName: "Independent tenant",
        projectName: "First project",
        projectSlug: `project-${subject}`,
        environmentName: "Development",
      }),
    });
    const first = await onboard("oidc-first");
    const second = await onboard("oidc-second");
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.data.tenant.tenantId, second.body.data.tenant.tenantId);
  });
});
