#!/usr/bin/env bash
set -euo pipefail

umask 077

OPENBAO_INIT=${YUJIAN_OPENBAO_INIT:-/data/models/yujianAI/p2/openbao-ha-init.json}
OPENBAO_CONTAINER=${YUJIAN_OPENBAO_CONTAINER:-yujian-p2-openbao-a-1}
EVIDENCE_BASE=${YUJIAN_OWNER_KEY_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04/owner-signers}
RUN_ID=${YUJIAN_OWNER_KEY_RUN_ID:-owner-key-provision-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"

for command in docker jq openssl sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
test -r "$OPENBAO_INIT" || { echo "OpenBao init file is unavailable" >&2; exit 2; }
ROOT_TOKEN=$(jq -r '.root_token // empty' "$OPENBAO_INIT")
test -n "$ROOT_TOKEN" || { echo "OpenBao root token is unavailable" >&2; exit 2; }
mkdir -p "$RUN_ROOT/owners"

capture_protected() {
  docker inspect yujian-p2-postgres-1 yujian-p2-redis-1 yujian-p2-openbao-a-1 \
    yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 --format '{{json .}}' | \
    jq -s '[.[] | {name:.Name,containerId:.Id,image:.Config.Image,state:.State.Status,health:.State.Health.Status,restartCount:.RestartCount}] | sort_by(.name)'
}

capture_protected >"$RUN_ROOT/protected-before.json"
: >"$RUN_ROOT/owners.ndjson"

while read -r owner role; do
  key="yujian-owner-$owner"
  policy="yujian-owner-$owner-signer"
  owner_root="$RUN_ROOT/owners/$owner"
  mkdir -p "$owner_root"
  if ! docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
    bao read "transit/keys/$key" >/dev/null 2>&1; then
    docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
      bao write -f "transit/keys/$key" type=ecdsa-p256 exportable=false \
      allow_plaintext_backup=false >/dev/null
  fi
  jq -nr --arg key "$key" '
    "path \"transit/keys/\($key)\" { capabilities = [\"read\"] }\n" +
    "path \"transit/sign/\($key)\" { capabilities = [\"update\"] }\n" +
    "path \"transit/sign/\($key)/*\" { capabilities = [\"update\"] }\n" +
    "path \"transit/verify/\($key)\" { capabilities = [\"update\"] }\n" +
    "path \"transit/verify/\($key)/*\" { capabilities = [\"update\"] }\n" +
    "path \"auth/token/revoke-self\" { capabilities = [\"update\"] }"
  ' >"$owner_root/policy.hcl"
  docker exec -i -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
    bao policy write "$policy" - <"$owner_root/policy.hcl" >/dev/null
  docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
    bao read -format=json "transit/keys/$key" >"$owner_root/key-metadata.json"
  jq -e '.data.type == "ecdsa-p256" and .data.exportable == false and .data.allow_plaintext_backup == false' \
    "$owner_root/key-metadata.json" >/dev/null
  jq -r '.data.keys[(.data.latest_version | tostring)].public_key' \
    "$owner_root/key-metadata.json" >"$owner_root/public.pem"
  openssl pkey -pubin -in "$owner_root/public.pem" -noout >/dev/null
  jq -n --arg owner "$owner" --arg role "$role" --arg keyUri "openbao://$key" \
    --arg policy "$policy" \
    --arg publicKeySha256 "sha256:$(sha256sum "$owner_root/public.pem" | awk '{print $1}')" \
    --arg policySha256 "sha256:$(sha256sum "$owner_root/policy.hcl" | awk '{print $1}')" \
    --argjson latestVersion "$(jq '.data.latest_version' "$owner_root/key-metadata.json")" \
    '{personalOwner:$owner,role:$role,keyUri:$keyUri,policy:$policy,policyCapabilities:["read-own-key","sign-own-key","verify-own-key","revoke-self"],keyType:"ecdsa-p256",latestVersion:$latestVersion,exportable:false,allowPlaintextBackup:false,publicKeySha256:$publicKeySha256,policySha256:$policySha256,personalCredentialIssued:false,status:"key-provisioned-awaiting-personal-credential"}' \
    >>"$RUN_ROOT/owners.ndjson"
done <<'OWNERS'
aaa security-owner
bbb release-owner
ccc legal-owner
ddd compliance-owner
OWNERS

jq -s '.' "$RUN_ROOT/owners.ndjson" >"$RUN_ROOT/owners.json"
capture_protected >"$RUN_ROOT/protected-after.json"
jq -e --slurpfile before "$RUN_ROOT/protected-before.json" \
  '. == $before[0] and all(.[]; .state == "running" and .health == "healthy" and .restartCount == 0)' \
  "$RUN_ROOT/protected-after.json" >/dev/null
jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg runRoot "$RUN_ROOT" --slurpfile owners "$RUN_ROOT/owners.json" \
  --slurpfile before "$RUN_ROOT/protected-before.json" --slurpfile after "$RUN_ROOT/protected-after.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-OWNER-KEY-PROVISION",runId:$runId,generatedAt:$generatedAt,runRoot:$runRoot,status:"keys-provisioned-no-personal-credentials-issued",owners:$owners[0],protectedRuntime:{before:$before[0],after:$after[0]},allPersonalDecisionsPending:true,productionReleaseAuthorized:false}' \
  >"$RUN_ROOT/result.json"
unset ROOT_TOKEN
find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/result.json"
