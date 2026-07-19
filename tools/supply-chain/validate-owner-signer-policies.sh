#!/usr/bin/env bash
set -euo pipefail

umask 077

OPENBAO_INIT=${YUJIAN_OPENBAO_INIT:-/data/models/yujianAI/p2/openbao-ha-init.json}
OPENBAO_CONTAINER=${YUJIAN_OPENBAO_CONTAINER:-yujian-p2-openbao-a-1}
EVIDENCE_BASE=${YUJIAN_OWNER_KEY_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04/owner-signers}
RUN_ID=${YUJIAN_OWNER_POLICY_RUN_ID:-owner-policy-validation-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"

for command in base64 docker jq; do command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }; done
ROOT_TOKEN=$(jq -r '.root_token // empty' "$OPENBAO_INIT")
test -n "$ROOT_TOKEN"
mkdir -p "$RUN_ROOT"
: >"$RUN_ROOT/results.ndjson"

for owner in aaa bbb ccc ddd; do
  case "$owner" in aaa) other=bbb ;; *) other=aaa ;; esac
  token_json=$(docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" bao token create \
    -policy="yujian-owner-$owner-signer" -no-default-policy -orphan -renewable=false \
    -ttl=2m -explicit-max-ttl=2m -display-name="yujian-owner-$owner-policy-self-test" \
    -metadata="purpose=p1-m0-04-policy-self-test" -format=json)
  token=$(jq -r .auth.client_token <<<"$token_json")
  revoke_self_test_token() {
    if test -n "${token:-}"; then
      if ! docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" bao token revoke -self >/dev/null 2>&1; then
        docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" bao token revoke "$token" >/dev/null
      fi
      token=
    fi
  }
  trap revoke_self_test_token EXIT
  docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" \
    bao read "transit/keys/yujian-owner-$owner" >/dev/null
  test_input=$(printf 'p1-m0-04-owner-policy-self-test:%s' "$owner" | base64 | tr -d '\n')
  test_signature=$(docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" \
    bao write -format=json "transit/sign/yujian-owner-$owner/sha2-256" input="$test_input" | jq -r .data.signature)
  test -n "$test_signature"
  docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" \
    bao write -format=json "transit/verify/yujian-owner-$owner/sha2-256" \
      input="$test_input" signature="$test_signature" | jq -e '.data.valid == true' >/dev/null
  if docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" \
    bao read "transit/keys/yujian-owner-$other" >/dev/null 2>&1; then
    echo "$owner can read another owner's key" >&2
    exit 3
  fi
  if docker exec -e BAO_TOKEN="$token" "$OPENBAO_CONTAINER" bao read sys/mounts >/dev/null 2>&1; then
    echo "$owner can read system mounts" >&2
    exit 3
  fi
  revoke_self_test_token
  trap - EXIT
  unset token token_json test_signature
  jq -n --arg owner "$owner" \
    '{personalOwner:$owner,ownKeyRead:"passed",ownKeyTestSignature:"passed",ownKeyTestVerification:"passed",otherKeyRead:"denied",systemMounts:"denied",selfTestTokenRevoked:true,personalCredentialIssued:false,passed:true}' \
    >>"$RUN_ROOT/results.ndjson"
done
unset ROOT_TOKEN
jq -s '.' "$RUN_ROOT/results.ndjson" >"$RUN_ROOT/results.json"
jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile results "$RUN_ROOT/results.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-OWNER-POLICY-VALIDATION",runId:$runId,generatedAt:$generatedAt,status:"passed",results:$results[0],technicalSelfTestTokensCreatedAndRevoked:true,personalCredentialsIssued:false,allPersonalDecisionsPending:true,productionReleaseAuthorized:false}' \
  >"$RUN_ROOT/result.json"
find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/result.json"
