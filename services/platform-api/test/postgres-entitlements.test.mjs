import assert from "node:assert/strict";
import test from "node:test";
import { EntitlementError, PostgresEnvironmentEntitlementService } from "../dist/index.js";

const scope = { tenantId: "tenant-preview", projectId: "project-demo", environmentId: "environment-local" };
const row = { entitlement_id: "entitlement-1", tenant_id: scope.tenantId, project_id: scope.projectId, environment_id: scope.environmentId, plan_id: "preview-v1", status: "active", features: ["rtc", "telemetry"], valid_from: "2026-07-01T00:00:00Z", valid_until: "2026-08-01T00:00:00Z", version: 1, updated_at: "2026-07-19T00:00:00Z" };

test("entitlement authorization fails closed for a feature outside the plan", async () => {
  const service = new PostgresEnvironmentEntitlementService({ query: async () => ({ rows: [row] }) }, () => Date.parse("2026-07-19T00:00:00Z"));
  assert.equal((await service.authorize(scope, "rtc")).planId, "preview-v1");
  await assert.rejects(() => service.authorize(scope, "sip"), EntitlementError);
});

test("entitlement CAS conflict is not silently overwritten", async () => {
  const service = new PostgresEnvironmentEntitlementService({ query: async () => ({ rows: [] }) });
  await assert.rejects(() => service.upsert(scope, { planId: "preview-v1", status: "active", features: ["rtc"], validFrom: "2026-07-01T00:00:00.000Z", validUntil: "2026-08-01T00:00:00.000Z", expectedVersion: 1 }), /version conflict/u);
});
