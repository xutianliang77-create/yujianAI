#!/usr/bin/env bash
set -euo pipefail

umask 077

ACTION=${1:-}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
POLICY=${P1_M0_04_REGISTRY_KMS_POLICY:-$ROOT/infra/registry/beelink/freeze-policy.json}
DATA_ROOT=${YUJIAN_DATA_ROOT:-$(jq -r .dataRoot "$POLICY")}
ENV_FILE=${YUJIAN_P2_ENV_FILE:-$DATA_ROOT/p2/runtime.env}
COMPOSE_FILE="$ROOT/infra/p2/beelink/compose.yaml"
EVIDENCE_ROOT=${YUJIAN_REGISTRY_KMS_EVIDENCE_ROOT:-$(jq -r .registry.evidencePath "$POLICY")}
RUN_ID=${YUJIAN_REGISTRY_KMS_RUN_ID:-kms-${ACTION}-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_ROOT/$RUN_ID"
KMS_KEY=$(jq -r .kms.keyName "$POLICY")
KMS_URI=$(jq -r .kms.uri "$POLICY")
POLICY_SHA="sha256:$(sha256sum "$POLICY" | awk '{print $1}')"
COSIGN_BIN=${COSIGN_BIN:-cosign}

usage() {
  echo "usage: $0 rotate-probe|retire-old-versions" >&2
  echo "rotate-probe requires P1_M0_04_FREEZE_AUTHORIZATION, YUJIAN_KMS_SNAPSHOT_RUN, YUJIAN_REGISTRY_RESTORE_RUN and YUJIAN_CONFIRM_KMS_ROTATION=YES" >&2
  echo "retire-old-versions requires P1_M0_04_KMS_RETIREMENT_AUTHORIZATION and YUJIAN_CONFIRM_IRREVERSIBLE_KMS_RETIREMENT=RETIRE" >&2
  exit 2
}

compose() { docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

new_run_root() {
  mkdir -p "$EVIDENCE_ROOT"; chmod 700 "$EVIDENCE_ROOT"
  mkdir "$RUN_ROOT" || { echo "evidence run already exists: $RUN_ROOT" >&2; exit 2; }
  chmod 700 "$RUN_ROOT"; cp "$POLICY" "$RUN_ROOT/freeze-policy.json"
}

write_result() {
  ( set -o noclobber; cp "$1" "$RUN_ROOT/result.json" )
  find "$RUN_ROOT" -type d -exec chmod 0700 {} +
  find "$RUN_ROOT" -type f -exec chmod 0600 {} +
  jq . "$RUN_ROOT/result.json"
}

bao_with_admin() {
  local token=$1; shift
  compose exec -T -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt -e BAO_TOKEN="$token" openbao-a bao "$@"
}

verify_artifacts() {
  local key=$1 suffix=$2 annotation_run=${3:-}
  : >"$RUN_ROOT/$suffix.ndjson"
  while IFS=$'\t' read -r id reference; do
    if [[ -n "$annotation_run" ]]; then
      "$COSIGN_BIN" verify --key "$key" -a ai.yujian.release=candidate-not-authorized \
        -a ai.yujian.kms-rotation="$annotation_run" "$reference" >"$RUN_ROOT/$id.$suffix.json"
    else
      "$COSIGN_BIN" verify --key "$key" "$reference" >"$RUN_ROOT/$id.$suffix.json"
    fi
    jq -n --arg id "$id" --arg reference "$reference" '{id:$id,digestReference:$reference,verified:true}' >>"$RUN_ROOT/$suffix.ndjson"
  done < <(jq -r '.artifacts[]|[.id,.digestReference]|@tsv' "$POLICY")
}

rotate_probe() {
  [[ ${YUJIAN_CONFIRM_KMS_ROTATION:-} == YES ]] || { echo "refusing rotation without YUJIAN_CONFIRM_KMS_ROTATION=YES" >&2; exit 2; }
  local authorization=${P1_M0_04_FREEZE_AUTHORIZATION:?set P1_M0_04_FREEZE_AUTHORIZATION}
  local snapshot_run=${YUJIAN_KMS_SNAPSHOT_RUN:?set YUJIAN_KMS_SNAPSHOT_RUN}
  local registry_restore_run=${YUJIAN_REGISTRY_RESTORE_RUN:?set YUJIAN_REGISTRY_RESTORE_RUN}
  P1_M0_04_FREEZE_AUTHORIZATION="$authorization" node "$ROOT/tools/supply-chain/verify-registry-kms-freeze-authorization.mjs" >/dev/null
  jq -e --arg policy "$POLICY_SHA" '.taskId=="P1-M0-04-KMS-RAFT-SNAPSHOT" and .status=="passed" and .policySha256==$policy and .productionKmsChanged==false' "$snapshot_run/result.json" >/dev/null
  jq -e --arg policy "$POLICY_SHA" '.taskId=="P1-M0-04-REGISTRY-ISOLATED-RESTORE" and .status=="passed" and .policySha256==$policy and .rollback.allFrozenDigestsVerified==true and .productionRegistryChanged==false' "$registry_restore_run/result.json" >/dev/null
  new_run_root
  local old_public_key old_version new_version token new_public_key old_sha new_sha metadata
  old_public_key=$(jq -r .keyMetadata.publicKeyPath "$snapshot_run/result.json")
  old_version=$(jq -r .keyMetadata.keyVersion "$snapshot_run/result.json")
  [[ -r "$old_public_key" ]] || { echo "archived public key is missing" >&2; exit 2; }
  old_sha="sha256:$(sha256sum "$old_public_key" | awk '{print $1}')"
  [[ "$old_sha" == "$(jq -r .kms.publicKeySha256 "$POLICY")" ]] || { echo "archived public key differs from policy" >&2; exit 1; }
  verify_artifacts "$old_public_key" pre-rotation
  token=$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")
  bao_with_admin "$token" write -f "transit/keys/$KMS_KEY/rotate" >/dev/null
  metadata=$(bao_with_admin "$token" read -format=json "transit/keys/$KMS_KEY")
  new_version=$(jq -r .data.latest_version <<<"$metadata")
  [[ "$new_version" -eq $((old_version+1)) ]] || { echo "unexpected KMS key version after rotation" >&2; exit 1; }
  new_public_key="$RUN_ROOT/public-key-v$new_version.pem"
  "$COSIGN_BIN" public-key --key "$KMS_URI" >"$new_public_key"
  new_sha="sha256:$(sha256sum "$new_public_key" | awk '{print $1}')"
  [[ "$new_sha" != "$old_sha" ]] || { echo "KMS rotation did not change the public key" >&2; exit 1; }
  while IFS=$'\t' read -r _ reference; do
    "$COSIGN_BIN" sign --yes --key "$KMS_URI" -a ai.yujian.release=candidate-not-authorized \
      -a ai.yujian.kms-rotation="$RUN_ID" "$reference" >>"$RUN_ROOT/sign-$new_version.log" 2>&1
  done < <(jq -r '.artifacts[]|[.id,.digestReference]|@tsv' "$POLICY")
  verify_artifacts "$new_public_key" post-rotation "$RUN_ID"
  verify_artifacts "$old_public_key" rollback-old-signatures
  jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg policySha "$POLICY_SHA" \
    --arg authorization "$authorization" --arg snapshotRun "$snapshot_run" --arg registryRestoreRun "$registry_restore_run" \
    --arg oldPublicKey "$old_public_key" --arg oldSha "$old_sha" --arg newPublicKey "$new_public_key" --arg newSha "$new_sha" \
    --argjson oldVersion "$old_version" --argjson newVersion "$new_version" \
    '{schemaVersion:1,taskId:"P1-M0-04-KMS-KEY-ROTATION",runId:$runId,generatedAt:$generatedAt,policySha256:$policySha,status:"passed",authorizationPath:$authorization,prerequisites:{kmsSnapshotRun:$snapshotRun,registryRestoreRun:$registryRestoreRun},rotation:{oldVersion:$oldVersion,newVersion:$newVersion,oldPublicKeyPath:$oldPublicKey,oldPublicKeySha256:$oldSha,newPublicKeyPath:$newPublicKey,newPublicKeySha256:$newSha,allFrozenDigestsSignedWithNewVersion:true},rollback:{oldPublicKeyPreserved:true,oldSignaturesRemainVerified:true,keyVersionDowngradeSupported:false},oldVersionRetired:false,rawSecretsArchived:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"; rm "$RUN_ROOT/result.tmp.json"; token=""
}

retire_old_versions() {
  [[ ${YUJIAN_CONFIRM_IRREVERSIBLE_KMS_RETIREMENT:-} == RETIRE ]] || { echo "refusing irreversible retirement without explicit RETIRE confirmation" >&2; exit 2; }
  local authorization=${P1_M0_04_KMS_RETIREMENT_AUTHORIZATION:?set P1_M0_04_KMS_RETIREMENT_AUTHORIZATION}
  P1_M0_04_KMS_RETIREMENT_AUTHORIZATION="$authorization" node "$ROOT/tools/supply-chain/verify-kms-retirement-authorization.mjs" >/dev/null
  local rotation_run min_version token old_key new_key metadata
  rotation_run=$(jq -r .rotationRun "$authorization")
  min_version=$(jq -r .minAvailableVersion "$authorization")
  old_key=$(jq -r .rotation.oldPublicKeyPath "$rotation_run/result.json")
  new_key=$(jq -r .rotation.newPublicKeyPath "$rotation_run/result.json")
  new_run_root
  verify_artifacts "$old_key" pre-retirement-old-signatures
  verify_artifacts "$new_key" pre-retirement-new-signatures "$(jq -r .runId "$rotation_run/result.json")"
  token=$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")
  bao_with_admin "$token" write "transit/keys/$KMS_KEY/config" min_available_version="$min_version" >/dev/null
  metadata=$(bao_with_admin "$token" read -format=json "transit/keys/$KMS_KEY")
  [[ $(jq -r .data.min_available_version <<<"$metadata") -eq "$min_version" ]] || { echo "KMS old version retirement did not apply" >&2; exit 1; }
  verify_artifacts "$old_key" post-retirement-historical-verification
  jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg policySha "$POLICY_SHA" \
    --arg authorization "$authorization" --arg rotationRun "$rotation_run" --argjson minVersion "$min_version" \
    '{schemaVersion:1,taskId:"P1-M0-04-KMS-KEY-RETIREMENT",runId:$runId,generatedAt:$generatedAt,policySha256:$policySha,status:"passed",authorizationPath:$authorization,rotationRun:$rotationRun,minAvailableVersion:$minVersion,irreversible:true,historicalVerification:{archivedPublicKeyRequired:true,allFrozenDigestsVerified:true},rawSecretsArchived:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"; rm "$RUN_ROOT/result.tmp.json"; token=""
}

[[ "$ACTION" == rotate-probe || "$ACTION" == retire-old-versions ]] || usage
for command in docker jq sha256sum node "$COSIGN_BIN"; do command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }; done
[[ -r "$ENV_FILE" && -r "$DATA_ROOT/p2/openbao-ha-init.json" ]] || { echo "P2/OpenBao runtime is unavailable" >&2; exit 2; }
node "$ROOT/tools/supply-chain/verify-registry-kms-freeze.mjs" >/dev/null
[[ "$ACTION" == rotate-probe ]] && rotate_probe || retire_old_versions
