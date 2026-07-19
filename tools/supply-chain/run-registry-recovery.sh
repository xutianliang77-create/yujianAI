#!/usr/bin/env bash
set -euo pipefail

umask 077

ACTION=${1:-}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
POLICY=${P1_M0_04_REGISTRY_KMS_POLICY:-$ROOT/infra/registry/beelink/freeze-policy.json}
EVIDENCE_ROOT=${YUJIAN_REGISTRY_KMS_EVIDENCE_ROOT:-$(jq -r .registry.evidencePath "$POLICY")}
RUN_ID=${YUJIAN_REGISTRY_KMS_RUN_ID:-registry-${ACTION}-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_ROOT/$RUN_ID"
CONTAINER=$(jq -r .registry.containerName "$POLICY")
DATA_PATH=$(jq -r .registry.dataPath "$POLICY")
BACKUP_PATH=$(jq -r .registry.backupPath "$POLICY")
RECOVERY_BIND=$(jq -r .registry.recovery.bindAddress "$POLICY")
RECOVERY_PORT=${RECOVERY_BIND##*:}
POLICY_SHA="sha256:$(sha256sum "$POLICY" | awk '{print $1}')"
ISOLATED_CONTAINER="yujian-registry-restore-${RUN_ID//[^a-zA-Z0-9_.-]/-}"

usage() {
  echo "usage: $0 backup|restore-verify" >&2
  echo "backup requires YUJIAN_CONFIRM_REGISTRY_QUIESCE=YES" >&2
  echo "restore-verify requires YUJIAN_REGISTRY_BACKUP_RUN and YUJIAN_COSIGN_PUBLIC_KEY" >&2
  exit 2
}

require_commands() {
  local command
  for command in docker jq curl sha256sum tar flock node; do
    command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
  done
}

new_run_root() {
  mkdir -p "$EVIDENCE_ROOT"
  chmod 700 "$EVIDENCE_ROOT"
  mkdir "$RUN_ROOT" || { echo "evidence run already exists: $RUN_ROOT" >&2; exit 2; }
  chmod 700 "$RUN_ROOT"
  cp "$POLICY" "$RUN_ROOT/freeze-policy.json"
}

write_result() {
  local source=$1
  ( set -o noclobber; cp "$source" "$RUN_ROOT/result.json" )
  find "$RUN_ROOT" -type d -exec chmod 0700 {} +
  find "$RUN_ROOT" -type f -exec chmod 0600 {} +
  jq . "$RUN_ROOT/result.json"
}

cleanup_restore() {
  docker rm -f "$ISOLATED_CONTAINER" >/dev/null 2>&1 || true
}

backup_registry() {
  [[ ${YUJIAN_CONFIRM_REGISTRY_QUIESCE:-} == YES ]] || { echo "refusing to pause registry without YUJIAN_CONFIRM_REGISTRY_QUIESCE=YES" >&2; exit 2; }
  [[ -d "$DATA_PATH/docker/registry/v2" ]] || { echo "registry data path is invalid: $DATA_PATH" >&2; exit 2; }
  docker inspect "$CONTAINER" >/dev/null
  [[ $(docker inspect "$CONTAINER" --format '{{.State.Running}}') == true ]] || { echo "registry is not running" >&2; exit 2; }
  new_run_root
  mkdir -p "$BACKUP_PATH/$RUN_ID"
  chmod 700 "$BACKUP_PATH/$RUN_ID"
  exec 9>"$BACKUP_PATH/.registry-backup.lock"
  flock -n 9 || { echo "another registry backup is running" >&2; exit 2; }

  local archive="$BACKUP_PATH/$RUN_ID/registry-data.tar.gz"
  local image_archive="$BACKUP_PATH/$RUN_ID/registry-runtime-image.oci.tar"
  local image_id image_reference restart_before restart_after paused=false started_at finished_at
  image_id=$(docker inspect "$CONTAINER" --format '{{.Image}}')
  image_reference=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')
  restart_before=$(docker inspect "$CONTAINER" --format '{{.RestartCount}}')
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  trap 'if [[ $paused == true ]]; then docker unpause "$CONTAINER" >/dev/null 2>&1 || true; fi' EXIT
  docker pause "$CONTAINER" >/dev/null
  paused=true
  tar --numeric-owner --xattrs --acls -C "$DATA_PATH" -czf "$archive" .
  docker unpause "$CONTAINER" >/dev/null
  paused=false
  docker save "$image_id" -o "$image_archive"
  finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  restart_after=$(docker inspect "$CONTAINER" --format '{{.RestartCount}}')
  [[ "$restart_before" == "$restart_after" ]] || { echo "registry restart count changed during backup" >&2; exit 1; }
  tar -tzf "$archive" >/dev/null

  jq -n --arg runId "$RUN_ID" --arg generatedAt "$finished_at" --arg startedAt "$started_at" \
    --arg policySha "$POLICY_SHA" --arg archive "$archive" --arg imageArchive "$image_archive" \
    --arg archiveSha "sha256:$(sha256sum "$archive" | awk '{print $1}')" \
    --arg imageArchiveSha "sha256:$(sha256sum "$image_archive" | awk '{print $1}')" \
    --arg imageId "$image_id" --arg imageReference "$image_reference" \
    --argjson restartCount "$restart_after" \
    '{schemaVersion:1,taskId:"P1-M0-04-REGISTRY-BACKUP",runId:$runId,generatedAt:$generatedAt,startedAt:$startedAt,policySha256:$policySha,status:"passed",registryQuiesced:true,archive:{path:$archive,sha256:$archiveSha,format:"tar-gzip",verifiedReadable:true},runtimeBootstrap:{path:$imageArchive,sha256:$imageArchiveSha,imageId:$imageId,imageReference:$imageReference},protectedRuntime:{running:true,restartCountUnchanged:true,restartCount:$restartCount},productionRestoreExecuted:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"
  rm "$RUN_ROOT/result.tmp.json"
}

restore_registry() {
  local backup_run=${YUJIAN_REGISTRY_BACKUP_RUN:?set YUJIAN_REGISTRY_BACKUP_RUN to the immutable backup run directory}
  local public_key=${YUJIAN_COSIGN_PUBLIC_KEY:?set YUJIAN_COSIGN_PUBLIC_KEY to the archived public key}
  local backup_result="$backup_run/result.json"
  local archive image_archive image_id expected actual started_ms finished_ms manifest_count=0 blob_count=0
  [[ -r "$backup_result" && -r "$public_key" ]] || { echo "backup result or public key is unreadable" >&2; exit 2; }
  jq -e --arg policy "$POLICY_SHA" '.taskId=="P1-M0-04-REGISTRY-BACKUP" and .status=="passed" and .policySha256==$policy and .productionRestoreExecuted==false' "$backup_result" >/dev/null
  archive=$(jq -r .archive.path "$backup_result")
  image_archive=$(jq -r .runtimeBootstrap.path "$backup_result")
  image_id=$(jq -r .runtimeBootstrap.imageId "$backup_result")
  for field in archive runtimeBootstrap; do
    expected=$(jq -r ".$field.sha256" "$backup_result")
    [[ $field == archive ]] && actual="sha256:$(sha256sum "$archive" | awk '{print $1}')" || actual="sha256:$(sha256sum "$image_archive" | awk '{print $1}')"
    [[ "$expected" == "$actual" ]] || { echo "$field backup digest mismatch" >&2; exit 1; }
  done
  new_run_root
  mkdir "$RUN_ROOT/restored-data"
  tar -C "$RUN_ROOT/restored-data" -xzf "$archive"
  docker load -i "$image_archive" >"$RUN_ROOT/docker-load.log"
  docker image inspect "$image_id" >/dev/null
  trap cleanup_restore EXIT
  started_ms=$(date +%s%3N)
  docker run -d --name "$ISOLATED_CONTAINER" --user 1000:1000 \
    -p "127.0.0.1:$RECOVERY_PORT:5000" \
    -e REGISTRY_HTTP_ADDR=0.0.0.0:5000 -e REGISTRY_STORAGE_DELETE_ENABLED=false \
    -e OTEL_TRACES_EXPORTER=none -v "$RUN_ROOT/restored-data:/var/lib/registry:ro" "$image_id" \
    >"$RUN_ROOT/container-id.txt"
  for _ in $(seq 1 60); do
    curl --noproxy '*' --fail --silent "http://127.0.0.1:$RECOVERY_PORT/v2/" >/dev/null && break
    sleep 1
  done
  curl --noproxy '*' --fail --silent "http://127.0.0.1:$RECOVERY_PORT/v2/" >/dev/null
  : >"$RUN_ROOT/artifacts.ndjson"
  while IFS=$'\t' read -r id reference; do
    local repository=${reference#*/yujian/p1/}
    repository="yujian/p1/${repository%@sha256:*}"
    local digest="sha256:${reference##*@sha256:}"
    local manifest="$RUN_ROOT/$id.manifest.json"
    curl --noproxy '*' --fail --silent -H 'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
      "http://127.0.0.1:$RECOVERY_PORT/v2/$repository/manifests/$digest" >"$manifest"
    [[ "sha256:$(sha256sum "$manifest" | awk '{print $1}')" == "$digest" ]] || { echo "$id manifest mismatch" >&2; exit 1; }
    local current_blobs=0 blob actual_blob
    while IFS= read -r blob; do
      actual_blob=$(curl --noproxy '*' --fail --silent "http://127.0.0.1:$RECOVERY_PORT/v2/$repository/blobs/$blob" | sha256sum | awk '{print $1}')
      [[ "sha256:$actual_blob" == "$blob" ]] || { echo "$id blob mismatch: $blob" >&2; exit 1; }
      current_blobs=$((current_blobs + 1))
    done < <(jq -r '[.config.digest,.layers[].digest]|.[]' "$manifest")
    local restored="127.0.0.1:$RECOVERY_PORT/$repository@$digest"
    cosign verify --allow-insecure-registry --key "$public_key" "$restored" >"$RUN_ROOT/$id.signature.json"
    cosign verify-attestation --allow-insecure-registry --key "$public_key" --type spdxjson "$restored" >"$RUN_ROOT/$id.attestation.json"
    jq -n --arg id "$id" --arg reference "$reference" --arg restored "$restored" --argjson blobs "$current_blobs" \
      '{id:$id,sourceDigestReference:$reference,restoredDigestReference:$restored,manifestDigestVerified:true,blobCount:$blobs,allBlobDigestsVerified:true,signatureVerified:true,attestationVerified:true}' >>"$RUN_ROOT/artifacts.ndjson"
    manifest_count=$((manifest_count + 1)); blob_count=$((blob_count + current_blobs))
  done < <(jq -r '.artifacts[]|[.id,.digestReference]|@tsv' "$POLICY")
  finished_ms=$(date +%s%3N)
  jq -s '.' "$RUN_ROOT/artifacts.ndjson" >"$RUN_ROOT/artifacts.json"
  jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg policySha "$POLICY_SHA" \
    --arg sourceBackup "$backup_run" --argjson rtoMs "$((finished_ms-started_ms))" \
    --argjson manifests "$manifest_count" --argjson blobs "$blob_count" --slurpfile artifacts "$RUN_ROOT/artifacts.json" \
    '{schemaVersion:1,taskId:"P1-M0-04-REGISTRY-ISOLATED-RESTORE",runId:$runId,generatedAt:$generatedAt,policySha256:$policySha,status:"passed",sourceBackupRun:$sourceBackup,recovery:{isolated:true,loopbackOnly:true,rtoMs:$rtoMs,manifestsVerified:$manifests,blobsVerified:$blobs,artifacts:$artifacts[0]},rollback:{allFrozenDigestsVerified:true,historicalSignaturesVerified:true,historicalAttestationsVerified:true},productionRegistryChanged:false,productionRestoreExecuted:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"
  rm "$RUN_ROOT/result.tmp.json"
}

[[ "$ACTION" == backup || "$ACTION" == restore-verify ]] || usage
require_commands
node "$ROOT/tools/supply-chain/verify-registry-kms-freeze.mjs" >/dev/null
[[ "$ACTION" == backup ]] && backup_registry || restore_registry
