#!/usr/bin/env bash
set -euo pipefail

umask 077

OWNER=${YUJIAN_PERSONAL_OWNER:?set YUJIAN_PERSONAL_OWNER to aaa, bbb, ccc, or ddd}
OPENBAO_INIT=${YUJIAN_OPENBAO_INIT:-/data/models/yujianAI/p2/openbao-ha-init.json}
OPENBAO_CONTAINER=${YUJIAN_OPENBAO_CONTAINER:-yujian-p2-openbao-a-1}
DELIVERY_ROOT=${YUJIAN_OWNER_TOKEN_DELIVERY_ROOT:-/data/models/yujianAI/secrets/p1-m0-04/owner-token-delivery}
RUN_ID=${YUJIAN_OWNER_TOKEN_RUN_ID:-owner-token-$OWNER-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$DELIVERY_ROOT/$OWNER/$RUN_ID"

case "$OWNER" in aaa|bbb|ccc|ddd) ;; *) echo "unsupported personal owner" >&2; exit 2 ;; esac
for command in docker jq; do command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }; done
test -r "$OPENBAO_INIT"
ROOT_TOKEN=$(jq -r '.root_token // empty' "$OPENBAO_INIT")
test -n "$ROOT_TOKEN"
mkdir -p "$RUN_ROOT"
docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" bao token create \
  -policy="yujian-owner-$OWNER-signer" -no-default-policy -orphan -renewable=false \
  -ttl=15m -explicit-max-ttl=15m -display-name="yujian-owner-$OWNER-signoff" \
  -metadata="personal_owner=$OWNER" -metadata="purpose=p1-m0-04-owner-signoff" \
  -wrap-ttl=5m -format=json >"$RUN_ROOT/wrapped-token.json"
unset ROOT_TOKEN
jq -e '.wrap_info.token | type == "string"' "$RUN_ROOT/wrapped-token.json" >/dev/null
jq -n --arg owner "$OWNER" --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg deliveryPath "$RUN_ROOT/wrapped-token.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-OWNER-TOKEN-DELIVERY",personalOwner:$owner,runId:$runId,generatedAt:$generatedAt,deliveryPath:$deliveryPath,responseWrapTtlSeconds:300,signingTokenTtlSeconds:900,renewable:false,deliveryStatus:"wrapped-token-created-awaiting-secure-personal-delivery",personalDecisionRecorded:false}' \
  >"$RUN_ROOT/metadata.json"
chmod 0600 "$RUN_ROOT/wrapped-token.json" "$RUN_ROOT/metadata.json"
jq . "$RUN_ROOT/metadata.json"
