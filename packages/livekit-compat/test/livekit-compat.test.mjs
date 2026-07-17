import assert from "node:assert/strict";
import test from "node:test";
import {
  parseIssueRoomTokenRequest,
} from "@yujian/platform-contracts";
import { TokenVerifier } from "livekit-server-sdk";
import {
  LiveKitAdminProbe,
  normalizeLiveKitWsUrl,
  RoomTokenIssuer,
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
