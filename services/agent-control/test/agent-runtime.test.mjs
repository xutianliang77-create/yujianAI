import assert from "node:assert/strict";
import test from "node:test";
import { AgentControlPlane, RedisAgentDispatchQuota, ToolPolicyEngine } from "../dist/index.js";

const sha = `sha256:${"a".repeat(64)}`;

test("artifact registration persists an exact verifier receipt", async () => {
  const control = new AgentControlPlane(undefined, { verifyArtifact: async (input) => ({ verifierId: `verifier-${input.runtime}`, policyDigest: sha, receiptDigest: sha, verifiedAt: new Date().toISOString() }) });
  const artifact = await control.registerArtifact({ tenantId: "tenant", projectId: "project", image: "registry.example/yujian/worker", digest: sha, runtime: "node", entrypoint: "dist/main.js", signatureRef: "evidence://signature", sbomUri: "evidence://sbom" });
  assert.equal(artifact.verification.verifierId, "verifier-node");
});

test("Redis quota uses environment hash slot and rejects distributed overflow", async () => {
  const calls = [];
  const quota = new RedisAgentDispatchQuota({ eval: async (script, keys, args) => { calls.push({ script, keys, args }); return [0, "environment"]; } }, { maxActivePerEnvironment: 10, maxActivePerDeployment: 5, leaseGraceMs: 5_000 });
  const result = await quota.admit({ dispatchId: "dispatch-a", environmentId: "env-a", deploymentId: "deployment-a", roomName: "room", status: "queued", deadlineAt: new Date(Date.now() + 10_000).toISOString(), traceId: "trace", createdAt: new Date().toISOString() });
  assert.equal(result, "quota_exceeded");
  assert.equal(calls[0].keys.every((key) => key.includes("{env-a}")), true);
});

test("high-risk tool requires a verifiable approval receipt", async () => {
  const engine = new ToolPolicyEngine();
  const policy = { toolId: "tool-a", name: "operate", risk: "L3", requiresExplicitApproval: true, allowedRoles: ["tenant_admin"], idempotencyRequired: true, timeoutMs: 1_000 };
  await assert.rejects(engine.authorize(policy, { subject: "user-a", roles: ["tenant_admin"], explicitApproval: true, idempotencyKey: "idem", traceId: "trace" }, async () => "never"));
});
