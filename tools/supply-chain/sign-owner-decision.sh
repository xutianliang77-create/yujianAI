#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
ARTIFACT=${YUJIAN_OWNER_DECISION_ARTIFACT:?set YUJIAN_OWNER_DECISION_ARTIFACT}
KEY_REGISTRY=${YUJIAN_OWNER_KEY_REGISTRY:?set YUJIAN_OWNER_KEY_REGISTRY}
EVIDENCE_BASE=${YUJIAN_OWNER_SIGNOFF_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04/owner-signoffs}
COSIGN_BIN=${COSIGN_BIN:-cosign}

for command in jq node sha256sum; do command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }; done
command -v "$COSIGN_BIN" >/dev/null || test -x "$COSIGN_BIN" || { echo "cosign is unavailable" >&2; exit 2; }
test -r "$ARTIFACT" && test -r "$KEY_REGISTRY"
test -n "${BAO_TOKEN:-}" || { echo "caller-supplied personal OpenBao token is required" >&2; exit 2; }
node "$REPO_ROOT/tools/supply-chain/verify-owner-decision.mjs" --require-decided "$ARTIFACT"

OWNER=$(jq -r .personalOwner "$ARTIFACT")
ROLE=$(jq -r .role "$ARTIFACT")
DECISION_TYPE=$(jq -r .decisionType "$ARTIFACT")
DECISION=$(jq -r .decision "$ARTIFACT")
KEY_URI=$(jq -r --arg owner "$OWNER" '.owners[] | select(.personalOwner == $owner) | .keyUri' "$KEY_REGISTRY")
EXPECTED_KEY_SHA=$(jq -r --arg owner "$OWNER" '.owners[] | select(.personalOwner == $owner) | .publicKeySha256' "$KEY_REGISTRY")
test "$KEY_URI" = "openbao://yujian-owner-$OWNER"
RUN_ID=${YUJIAN_OWNER_SIGNOFF_RUN_ID:-owner-signoff-$OWNER-$DECISION_TYPE-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
mkdir -p "$RUN_ROOT"
cp "$ARTIFACT" "$RUN_ROOT/decision.json"
"$COSIGN_BIN" public-key --key "$KEY_URI" >"$RUN_ROOT/public.pem"
ACTUAL_KEY_SHA="sha256:$(sha256sum "$RUN_ROOT/public.pem" | awk '{print $1}')"
test "$ACTUAL_KEY_SHA" = "$EXPECTED_KEY_SHA"
"$COSIGN_BIN" sign-blob --yes --key "$KEY_URI" --bundle "$RUN_ROOT/decision.sigstore.json" \
  "$RUN_ROOT/decision.json" >"$RUN_ROOT/sign.log" 2>&1
"$COSIGN_BIN" verify-blob --insecure-ignore-tlog --key "$RUN_ROOT/public.pem" \
  --bundle "$RUN_ROOT/decision.sigstore.json" "$RUN_ROOT/decision.json" \
  >"$RUN_ROOT/verify.log" 2>&1
jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg signer "$OWNER" --arg role "$ROLE" --arg decisionType "$DECISION_TYPE" --arg decision "$DECISION" \
  --arg identityOrKey "$KEY_URI" --arg artifact "$RUN_ROOT/decision.json" \
  --arg artifactSha256 "sha256:$(sha256sum "$RUN_ROOT/decision.json" | awk '{print $1}')" \
  --arg bundle "$RUN_ROOT/decision.sigstore.json" \
  --arg bundleSha256 "sha256:$(sha256sum "$RUN_ROOT/decision.sigstore.json" | awk '{print $1}')" \
  --arg publicKey "$RUN_ROOT/public.pem" --arg publicKeySha256 "$ACTUAL_KEY_SHA" \
  --arg verificationLog "$RUN_ROOT/verify.log" \
  --arg verificationLogSha256 "sha256:$(sha256sum "$RUN_ROOT/verify.log" | awk '{print $1}')" \
  '{schemaVersion:1,taskId:"P1-M0-04-PERSONAL-OWNER-SIGNATURE",runId:$runId,generatedAt:$generatedAt,signer:$signer,role:$role,decisionType:$decisionType,decision:$decision,identityOrKey:$identityOrKey,artifact:$artifact,artifactSha256:$artifactSha256,bundle:$bundle,bundleSha256:$bundleSha256,publicKey:$publicKey,publicKeySha256:$publicKeySha256,verificationLog:$verificationLog,verificationLogSha256:$verificationLogSha256,credentialSource:"caller-supplied-response-wrapped-personal-token",verified:true,productionReleaseAuthorized:false}' \
  >"$RUN_ROOT/result.json"
find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/result.json"
