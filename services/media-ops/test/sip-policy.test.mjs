import assert from "node:assert/strict";
import test from "node:test";
import { PolicySipRiskDecisionProvider } from "../dist/sip-policy.js";

const trunk = {
  trunkId: "trunk-a", environmentId: "environment-a", direction: "outbound", provider: "provider-a", region: "cn-north",
  numberRefs: ["kms://sip/numbers/a"], credentialRef: "kms://sip/credentials/a", allowedDestinationPrefixes: ["+8610", "+86138"],
  secureTransport: "tls-srtp", fraudPolicyRef: "fraud-policy-a", dispatchRuleRef: "dispatch-a",
  maxConcurrentCalls: 2, maxCallsPerMinute: 10, maxDailyCostMicros: 100_000, allowInternational: false,
  status: "active", version: 1, updatedAt: "2026-07-19T12:00:00.000Z",
};

test("SIP policy defaults to E.164, destination-prefix and domestic restrictions", async () => {
  const policy = new PolicySipRiskDecisionProvider({ get: async () => trunk }, { authorize: async () => ({ allowed: true, decisionCode: "fraud_allow" }) });
  assert.equal((await policy.authorize({ environmentId: "environment-a", operation: "call", direction: "outbound", destination: "+8613800138000", trunkId: "trunk-a" })).allowed, true);
  assert.equal((await policy.authorize({ environmentId: "environment-a", operation: "call", direction: "outbound", destination: "+12025550123", trunkId: "trunk-a" })).decisionCode, "international_denied");
  assert.equal((await policy.authorize({ environmentId: "environment-a", operation: "call", direction: "outbound", destination: "13800138000", trunkId: "trunk-a" })).decisionCode, "destination_not_e164");
});

test("unconfigured dispatch or fraud policy fails closed", async () => {
  const policy = new PolicySipRiskDecisionProvider({ get: async () => ({ ...trunk, dispatchRuleRef: "unconfigured" }) }, { authorize: async () => ({ allowed: true, decisionCode: "allow" }) });
  assert.equal((await policy.authorize({ environmentId: "environment-a", operation: "call", direction: "outbound", destination: "+8613800138000" })).allowed, false);
});
