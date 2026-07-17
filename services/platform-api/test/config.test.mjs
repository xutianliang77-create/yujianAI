import assert from "node:assert/strict";
import test from "node:test";
import { loadPlatformApiConfig } from "../dist/index.js";

const baseEnvironment = {
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: "platform-config-test",
  LIVEKIT_API_SECRET: "platform-config-test-secret",
};
const credential = {
  tenantId: "tenant-preview",
  projectId: "project-demo",
  environmentId: "environment-local",
  credential: "platform-config-test-credential-0001",
};

test("config loads environment-scoped platform credentials", () => {
  const config = loadPlatformApiConfig({
    ...baseEnvironment,
    YUJIAN_PLATFORM_CREDENTIALS_JSON: JSON.stringify([credential]),
  });
  assert.deepEqual(config.platformCredentials, [credential]);
});

test("config rejects the removed unscoped credential", () => {
  assert.throws(
    () =>
      loadPlatformApiConfig({
        ...baseEnvironment,
        YUJIAN_PLATFORM_API_KEY: credential.credential,
      }),
    /YUJIAN_PLATFORM_CREDENTIALS_JSON must be set/u,
  );
});

test("config rejects duplicate scopes and unknown credential fields", () => {
  assert.throws(
    () =>
      loadPlatformApiConfig({
        ...baseEnvironment,
        YUJIAN_PLATFORM_CREDENTIALS_JSON: JSON.stringify([
          credential,
          { ...credential, credential: "platform-config-test-credential-0002" },
        ]),
      }),
    /scope is duplicated/u,
  );
  assert.throws(
    () =>
      loadPlatformApiConfig({
        ...baseEnvironment,
        YUJIAN_PLATFORM_CREDENTIALS_JSON: JSON.stringify([
          { ...credential, role: "admin" },
        ]),
      }),
    /role is unknown/u,
  );
});

test("config accepts Yujian RTC names and exposes both node endpoints", () => {
  const config = loadPlatformApiConfig({
    YUJIAN_RTC_PRIMARY_URL: "ws://127.0.0.1:7880",
    YUJIAN_RTC_SECONDARY_URL: "ws://127.0.0.1:7980",
    YUJIAN_RTC_API_KEY: "yujian-config-test",
    YUJIAN_RTC_API_SECRET: "yujian-config-test-secret",
    YUJIAN_PLATFORM_CREDENTIALS_JSON: JSON.stringify([credential]),
  });
  assert.deepEqual(
    config.rtcNodes?.map(({ id, wsUrl }) => ({ id, wsUrl })),
    [
      { id: "primary", wsUrl: "ws://127.0.0.1:7880" },
      { id: "secondary", wsUrl: "ws://127.0.0.1:7980" },
    ],
  );
});
