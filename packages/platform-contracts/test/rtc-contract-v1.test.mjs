import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  ContractValidationError,
  parseIssueRoomTokenRequest,
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
