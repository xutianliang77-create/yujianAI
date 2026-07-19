#!/usr/bin/env bash
set -euo pipefail

umask 077

OWNER=${YUJIAN_OWNER_APPROVAL_TEST_OWNER:-aaa}
OPENBAO_INIT=${YUJIAN_OPENBAO_INIT:-/data/models/yujianAI/p2/openbao-ha-init.json}
OPENBAO_CONTAINER=${YUJIAN_OPENBAO_CONTAINER:-yujian-p2-openbao-a-1}
APP_CONTAINER=${YUJIAN_OWNER_APPROVAL_CONTAINER:-yujian-owner-approval}
EVIDENCE_ROOT=${YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04/owner-approvals}
PURPOSE=owner-approval-integration-self-test

case "$OWNER" in aaa|bbb|ccc|ddd) ;; *) echo "unsupported test owner" >&2; exit 2 ;; esac
for command in docker jq; do command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }; done
ROOT_TOKEN=$(jq -r '.root_token // empty' "$OPENBAO_INIT")
test -n "$ROOT_TOKEN"

matching_accessors() {
  docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
    bao list -format=json auth/token/accessors | jq -r '.[]' | while read -r accessor; do
      metadata=$(docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
        bao token lookup -accessor -format=json "$accessor" 2>/dev/null | jq -r '.data.meta.purpose // empty' || true)
      if test "$metadata" = "$PURPOSE"; then printf '%s\n' "$accessor"; fi
    done
  return 0
}

cleanup() {
  if test -n "${ROOT_TOKEN:-}"; then
    matching_accessors | while read -r accessor; do
      test -n "$accessor" && docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" \
        bao token revoke -accessor "$accessor" >/dev/null 2>&1 || true
    done
  fi
}
trap cleanup EXIT

before=$(find "$EVIDENCE_ROOT" -type f 2>/dev/null | wc -l | tr -d ' ')
wrapped_json=$(docker exec -e BAO_TOKEN="$ROOT_TOKEN" "$OPENBAO_CONTAINER" bao token create \
  -policy="yujian-owner-$OWNER-signer" -no-default-policy -orphan -renewable=false \
  -ttl=2m -explicit-max-ttl=2m -display-name="yujian-owner-$OWNER-approval-self-test" \
  -metadata="personal_owner=$OWNER" -metadata="purpose=$PURPOSE" \
  -wrap-ttl=1m -format=json)
wrapped_token=$(jq -r '.wrap_info.token // empty' <<<"$wrapped_json")
test -n "$wrapped_token"
result=$(docker exec -e YUJIAN_TECHNICAL_WRAP_TOKEN="$wrapped_token" \
  -e YUJIAN_TECHNICAL_OWNER="$OWNER" "$APP_CONTAINER" \
  node --input-type=module -e '
    import { OpenBaoOwnerSigner } from "/app/dist/index.js";
    const signer = new OpenBaoOwnerSigner([
      "https://127.0.0.1:18200",
      "https://127.0.0.1:18201",
      "https://127.0.0.1:18202",
    ]);
    const signed = await signer.sign({
      owner: process.env.YUJIAN_TECHNICAL_OWNER,
      artifact: Buffer.from("yujian-owner-approval-openbao-technical-self-test", "utf8"),
      wrappedToken: process.env.YUJIAN_TECHNICAL_WRAP_TOKEN,
    });
    process.stdout.write(JSON.stringify({
      keyUri: signed.keyUri,
      keyVersion: signed.keyVersion,
      verified: signed.verified,
      credentialRevoked: signed.credentialRevoked,
      personalDecisionRecorded: false,
      productionReleaseAuthorized: false,
    }));
  ')
unset wrapped_token wrapped_json
jq -e --arg uri "openbao://yujian-owner-$OWNER" \
  '.keyUri == $uri and .verified == true and .credentialRevoked == true and .personalDecisionRecorded == false and .productionReleaseAuthorized == false' \
  <<<"$result" >/dev/null
after=$(find "$EVIDENCE_ROOT" -type f 2>/dev/null | wc -l | tr -d ' ')
test "$before" = "$after"
active=$(matching_accessors | wc -l | tr -d ' ')
test "$active" = 0
trap - EXIT
unset ROOT_TOKEN
jq -n --arg owner "$OWNER" --argjson signer "$result" \
  '{status:"passed",testClass:"technical-non-decision",owner:$owner,signer:$signer,evidenceFilesCreated:0,activeSelfTestTokens:0}'
