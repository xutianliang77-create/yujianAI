import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  ContractValidationError,
  PreviewTrialTransitionError,
  applyPreviewTrialEvent,
  createPreviewTrial,
  parseCreateSupportTicketRequest,
  parseIssueSupportAccessGrantRequest,
  parseIssueRoomTokenRequest,
  parseRegisterSupportBundleRequest,
  parseTurnCredentialRequest,
  parseUpdateSupportTicketRequest,
  parseUpsertEnvironmentEntitlementRequest,
} from "../dist/index.js";

const schema = JSON.parse(
  readFileSync(
    new URL("../schemas/v1/issue-room-token-request.schema.json", import.meta.url),
    "utf8",
  ),
);
const validateSchema = new Ajv2020({ strict: true }).compile(schema);

const validRequest = {
  tenantId: "tenant-preview",
  projectId: "project-demo",
  environmentId: "environment-local",
  roomName: "product-demo",
  participantIdentity: "developer-001",
  participantName: "开发者",
  metadata: JSON.stringify({ role: "host" }),
  attributes: { plan: "preview" },
  permissions: {
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  },
  ttlSeconds: 120,
};

test("request parser normalizes a valid LiveKit token request", () => {
  const parsed = parseIssueRoomTokenRequest(validRequest);
  assert.equal(parsed.ttlSeconds, 120);
  assert.deepEqual(parsed.permissions, validRequest.permissions);
  assert.deepEqual(parsed.attributes, validRequest.attributes);
});

test("request parser applies short-lived least-surprise defaults", () => {
  const parsed = parseIssueRoomTokenRequest({
    tenantId: "tenant-preview",
    projectId: "project-demo",
    environmentId: "environment-local",
    roomName: "quickstart",
    participantIdentity: "guest-1",
  });
  assert.equal(parsed.ttlSeconds, 300);
  assert.deepEqual(parsed.permissions, {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  assert.deepEqual(parsed.attributes, {});
});

test("request parser rejects unknown and unsafe fields", () => {
  assert.throws(
    () =>
      parseIssueRoomTokenRequest({
        tenantId: "Tenant_Invalid",
        projectId: "project-demo",
        environmentId: "environment-local",
        roomName: "quickstart",
        participantIdentity: " guest-1",
        apiSecret: "must-not-be-accepted",
      }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.deepEqual(
        error.issues.map((issue) => issue.field).sort(),
        ["apiSecret", "participantIdentity", "tenantId"],
      );
      return true;
    },
  );
});

test("request parser enforces token TTL and metadata limits", () => {
  assert.throws(
    () =>
      parseIssueRoomTokenRequest({
        tenantId: "tenant-preview",
        projectId: "project-demo",
        environmentId: "environment-local",
        roomName: "quickstart",
        participantIdentity: "guest-1",
        ttlSeconds: 3600,
        metadata: "x".repeat(4097),
      }),
    ContractValidationError,
  );
});

test("JSON Schema accepts the canonical fixture and rejects unknown fields", () => {
  assert.equal(validateSchema(validRequest), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateSchema({ ...validRequest, unexpected: true }), false);
});

test("request parser reserves yujian attributes for platform scope", () => {
  assert.throws(
    () =>
      parseIssueRoomTokenRequest({
        ...validRequest,
        attributes: { "yujian.tenant_id": "spoofed" },
      }),
    ContractValidationError,
  );
});

test("TURN credential request is scoped and short lived", () => {
  const parsed = parseTurnCredentialRequest({ tenantId: "tenant-preview", projectId: "project-demo", environmentId: "environment-local", participantIdentity: "guest-1" });
  assert.equal(parsed.ttlSeconds, 600);
  assert.throws(() => parseTurnCredentialRequest({ ...parsed, ttlSeconds: 3601 }), ContractValidationError);
  assert.throws(() => parseTurnCredentialRequest({ ...parsed, sharedSecret: "forbidden" }), ContractValidationError);
});

test("Preview entitlement contract is versioned and rejects unknown features", () => {
  const parsed = parseUpsertEnvironmentEntitlementRequest({
    planId: "preview-v1", status: "active", features: ["rtc", "telemetry"],
    validFrom: "2026-07-19T00:00:00Z", validUntil: "2026-08-19T00:00:00Z", expectedVersion: 0,
  });
  assert.equal(parsed.expectedVersion, 0);
  assert.throws(() => parseUpsertEnvironmentEntitlementRequest({ ...parsed, features: ["translation"] }), ContractValidationError);
});

test("support ticket contract excludes arbitrary payload fields", () => {
  const parsed = parseCreateSupportTicketRequest({ severity: "p1", category: "quality", summary: "RTC packet loss regression" });
  assert.equal(parsed.category, "quality");
  assert.throws(() => parseCreateSupportTicketRequest({ ...parsed, recording: "base64-media" }), ContractValidationError);
});

test("support access contract permits one short-lived permission only", () => {
  const parsed = parseIssueSupportAccessGrantRequest({ operatorSubject: "operator:aaa", permissions: ["ticket.read"], ttlSeconds: 300 });
  assert.equal(parsed.permissions[0], "ticket.read");
  assert.throws(() => parseIssueSupportAccessGrantRequest({ ...parsed, permissions: ["ticket.read", "bundle.download"] }), ContractValidationError);
  assert.throws(() => parseIssueSupportAccessGrantRequest({ ...parsed, ttlSeconds: 3601 }), ContractValidationError);
});

test("support bundle contract rejects media and credential-bearing object URIs", () => {
  const parsed = parseRegisterSupportBundleRequest({ artifactUri: "s3://support/bundle.json", sha256: `sha256:${"a".repeat(64)}`, sizeBytes: 1024, redactionPolicyVersion: "support-redaction-v1", containsMedia: false, expiresAt: "2026-08-01T00:00:00Z" });
  assert.equal(parsed.containsMedia, false);
  assert.throws(() => parseRegisterSupportBundleRequest({ ...parsed, artifactUri: "https://support.invalid/bundle?token=secret" }), ContractValidationError);
  assert.throws(() => parseRegisterSupportBundleRequest({ ...parsed, containsMedia: true }), ContractValidationError);
});

test("support ticket update requires version CAS", () => {
  assert.deepEqual(parseUpdateSupportTicketRequest({ status: "resolved", expectedVersion: 2 }), { status: "resolved", expectedVersion: 2 });
  assert.throws(() => parseUpdateSupportTicketRequest({ status: "closed", expectedVersion: 0 }), ContractValidationError);
});

test("design partner P0 defect pauses trial until fixed evidence is closed", () => {
  let trial = createPreviewTrial({ trialId: "trial-preview-1", partnerId: "partner-alpha", tenantId: "tenant-preview", projectId: "project-demo", environmentId: "environment-local", dataClass: "synthetic", createdAt: "2026-07-19T00:00:00Z" });
  trial = applyPreviewTrialEvent(trial, { type: "onboarding.started", expectedVersion: 1, occurredAt: "2026-07-19T00:01:00Z" });
  trial = applyPreviewTrialEvent(trial, { type: "trial.activated", expectedVersion: 2, occurredAt: "2026-07-19T00:02:00Z" });
  trial = applyPreviewTrialEvent(trial, { type: "defect.opened", defectId: "defect-join", severity: "p0", category: "availability", expectedVersion: 3, occurredAt: "2026-07-19T00:03:00Z" });
  assert.equal(trial.status, "paused");
  assert.throws(() => applyPreviewTrialEvent(trial, { type: "trial.resumed", expectedVersion: 4, occurredAt: "2026-07-19T00:04:00Z" }), PreviewTrialTransitionError);
  trial = applyPreviewTrialEvent(trial, { type: "defect.updated", defectId: "defect-join", status: "fixed", fixVersion: "0.1.1", regressionEvidenceSha256: `sha256:${"a".repeat(64)}`, expectedVersion: 4, occurredAt: "2026-07-19T00:05:00Z" });
  trial = applyPreviewTrialEvent(trial, { type: "defect.updated", defectId: "defect-join", status: "closed", expectedVersion: 5, occurredAt: "2026-07-19T00:06:00Z" });
  trial = applyPreviewTrialEvent(trial, { type: "trial.resumed", expectedVersion: 6, occurredAt: "2026-07-19T00:07:00Z" });
  assert.equal(trial.status, "active");
});

test("design partner trial rejects stale events and premature close", () => {
  const trial = createPreviewTrial({ trialId: "trial-preview-2", partnerId: "partner-beta", tenantId: "tenant-preview", projectId: "project-demo", environmentId: "environment-local", dataClass: "authorized", createdAt: "2026-07-19T00:00:00Z" });
  assert.throws(() => applyPreviewTrialEvent(trial, { type: "onboarding.started", expectedVersion: 2, occurredAt: "2026-07-19T00:01:00Z" }), /version conflict/u);
  assert.throws(() => applyPreviewTrialEvent(trial, { type: "trial.closed", expectedVersion: 1, occurredAt: "2026-07-19T00:01:00Z" }), PreviewTrialTransitionError);
});
