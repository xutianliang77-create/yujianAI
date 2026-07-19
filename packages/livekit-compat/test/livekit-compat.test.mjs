import assert from "node:assert/strict";
import test from "node:test";
import {
  parseIssueRoomTokenRequest,
} from "@yujian/platform-contracts";
import { TokenVerifier } from "livekit-server-sdk";
import {
  LiveKitAdminProbe,
  normalizeLiveKitWsUrl,
  parseRtcCapacityReport,
  RoomTokenIssuer,
  TurnCredentialIssuer,
  toLiveKitHttpUrl,
  validateLiveKitConnectionConfig,
  YujianRegionRouter,
  YujianRtcNodePool,
} from "../dist/index.js";

const credentials = {
  wsUrl: "ws://127.0.0.1:7880",
  apiKey: "unit-test-key",
  apiSecret: "unit-test-credential-not-for-production",
};

test("endpoint helpers preserve LiveKit ws/http semantics", () => {
  assert.equal(normalizeLiveKitWsUrl("wss://rtc.example.cn/"), "wss://rtc.example.cn");
  assert.equal(toLiveKitHttpUrl("ws://127.0.0.1:7880"), "http://127.0.0.1:7880");
  assert.throws(() => normalizeLiveKitWsUrl("https://rtc.example.cn"));
  assert.throws(() => normalizeLiveKitWsUrl("wss://user@rtc.example.cn"));
});

test("capacity report requires bounded ttl and conservative subscription accounting", () => {
  const report = parseRtcCapacityReport({
    schemaVersion: 1,
    nodeId: "rtc-node-1",
    observedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-07-19T00:00:15.000Z",
    sequence: 1,
    healthy: true,
    draining: false,
    source: "livekit-room-service-upper-bound",
    subscriptionAccounting: "participants-times-published-tracks-upper-bound",
    usage: { activeRooms: 1, activeParticipants: 2, activePublishers: 1, activeSubscriptions: 4, activeTracks: 2 },
    limits: { activeRooms: 100, activeParticipants: 1000, activePublishers: 500, activeSubscriptions: 10000, activeTracks: 2000 },
  });
  assert.equal(report.usage.activeSubscriptions, 4);
  assert.throws(() => parseRtcCapacityReport({ ...report, expiresAt: "2026-07-19T00:10:00.000Z" }), /ttl/u);
  assert.throws(() => parseRtcCapacityReport({ ...report, activeSubscriptions: 0, subscriptionAccounting: "measured" }), /accounting/u);
});

test("connection config rejects missing credentials", () => {
  assert.throws(() =>
    validateLiveKitConnectionConfig({
      wsUrl: credentials.wsUrl,
      apiKey: "",
      apiSecret: credentials.apiSecret,
    }),
  );
  assert.throws(() => new LiveKitAdminProbe(credentials, 0));
});

test("Yujian RTC node pool validates identity and rotates nodes", () => {
  const pool = new YujianRtcNodePool([
    { id: "primary", ...credentials },
    { id: "secondary", ...credentials, wsUrl: "ws://127.0.0.1:7980" },
  ]);
  assert.equal(pool.next().id, "primary");
  assert.equal(pool.next().id, "secondary");
  assert.equal(pool.get("primary").wsUrl, credentials.wsUrl);
  assert.throws(
    () => new YujianRtcNodePool([{ id: "Primary", ...credentials }]),
    /node id/u,
  );
  assert.throws(
    () => new YujianRtcNodePool([
      { id: "primary", ...credentials },
      { id: "primary", ...credentials },
    ]),
    /duplicate/u,
  );
});

test("region router refuses to bypass an unsatisfied residency policy", () => {
  const router = new YujianRegionRouter([
    { id: "primary", ...credentials, regionId: "cn-north", residencyTags: ["mainland"] },
  ]);
  assert.equal(router.select({ allowedRegions: ["cn-north"], preferredRegions: [], residencyTags: ["mainland"] }).node.id, "primary");
  assert.throws(
    () => router.select({ allowedRegions: ["cn-south"], preferredRegions: [], residencyTags: [] }),
    /no RTC node satisfies/u,
  );
  assert.throws(
    () => new YujianRtcNodePool([{ id: "primary", ...credentials, regionId: "CN-NORTH" }]),
    /region id/u,
  );
});

test("official LiveKit SDK signs the platform Room token contract", async () => {
  const request = parseIssueRoomTokenRequest({
    tenantId: "tenant-preview",
    projectId: "project-demo",
    environmentId: "environment-local",
    roomName: "compat-room",
    participantIdentity: "participant-001",
    participantName: "测试用户",
    attributes: { tenant: "test-only" },
    permissions: {
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    },
    ttlSeconds: 120,
  });
  const issuer = new RoomTokenIssuer(credentials);
  const result = await issuer.issue(request);
  const claims = await new TokenVerifier(
    credentials.apiKey,
    credentials.apiSecret,
  ).verify(result.token);

  assert.equal(claims.sub, request.participantIdentity);
  assert.equal(claims.name, request.participantName);
  assert.deepEqual(claims.attributes, {
    ...request.attributes,
    "yujian.environment_id": request.environmentId,
    "yujian.project_id": request.projectId,
    "yujian.tenant_id": request.tenantId,
  });
  assert.deepEqual(claims.video, {
    roomJoin: true,
    room: request.roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  assert.equal(result.url, credentials.wsUrl);
  assert.equal(JSON.stringify(result).includes(credentials.apiSecret), false);
});

test("TURN REST credential uses HMAC without returning the shared secret", () => {
  const issuer = new TurnCredentialIssuer(Buffer.alloc(32, 7), ["turn:turn.example.cn:3478?transport=udp", "turns:turn.example.cn:5349?transport=tcp"], () => 1_750_000_000_000);
  const credential = issuer.issue({ tenantId: "tenant-preview", projectId: "project-demo", environmentId: "environment-local", participantIdentity: "guest-1", ttlSeconds: 600 });
  assert.equal(credential.username, "1750000600:guest-1");
  assert.equal(credential.credentialType, "password");
  assert.equal(JSON.stringify(credential).includes(Buffer.alloc(32, 7).toString("base64")), false);
});
