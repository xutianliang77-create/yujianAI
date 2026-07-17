import assert from "node:assert/strict";
import test from "node:test";
import { PlatformStore } from "../dist/platform-store.js";

const scope = {
  tenantId: "tenant-snapshot",
  projectId: "project-snapshot",
  environmentId: "environment-snapshot",
};

test("platform store snapshot restores API-key hash without persisting the secret", () => {
  const source = new PlatformStore();
  source.seed({ scope, endpoint: "wss://rtc.example.test" });
  const issued = source.createApiKey(scope, ["room.read"], undefined, "snapshot-key");
  const snapshot = source.snapshot();
  assert.equal(JSON.stringify(snapshot).includes(issued.secret), false);

  const restored = new PlatformStore();
  restored.restore(snapshot);
  assert.deepEqual(restored.getEnvironment(scope), source.getEnvironment(scope));
  assert.deepEqual(restored.resolveApiKeyCredential(issued.secret)?.scope, scope);
  assert.equal(restored.getApiKey(issued.metadata.apiKeyId).keyPrefix, issued.metadata.keyPrefix);
  assert.throws(() => restored.createApiKey(scope, ["room.read"], undefined, "snapshot-key"), /secret-bearing state recovery/u);
});

test("platform store snapshot rejects broken environment references", () => {
  const store = new PlatformStore();
  store.seed({ scope, endpoint: "wss://rtc.example.test" });
  const snapshot = store.snapshot();
  snapshot.environments[0].projectId = "missing-project";
  assert.throws(() => new PlatformStore().restore(snapshot), /unknown resource/u);
});
