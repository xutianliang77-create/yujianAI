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
SNAPSHOT_ROOT=$(jq -r .kms.raftSnapshotPath "$POLICY")
KMS_IMAGE=$(jq -r .kms.runtimeImage "$POLICY")
KMS_KEY=$(jq -r .kms.keyName "$POLICY")
KMS_URI=$(jq -r .kms.uri "$POLICY")
POLICY_SHA="sha256:$(sha256sum "$POLICY" | awk '{print $1}')"
RECOVERY_PORT=${YUJIAN_KMS_RECOVERY_PORT:-19200}
ISOLATED_CONTAINER="yujian-kms-restore-${RUN_ID//[^a-zA-Z0-9_.-]/-}"

usage() {
  echo "usage: $0 snapshot|restore-verify" >&2
  echo "snapshot requires YUJIAN_CONFIRM_KMS_SNAPSHOT=YES" >&2
  echo "restore-verify requires YUJIAN_KMS_SNAPSHOT_RUN" >&2
  exit 2
}

compose() { docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

require_commands() {
  local command
  for command in docker jq curl sha256sum node; do
    command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
  done
  [[ -r "$ENV_FILE" && -r "$DATA_ROOT/p2/openbao-ha-init.json" ]] || { echo "P2 runtime or OpenBao init material is unavailable" >&2; exit 2; }
}

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

snapshot_kms() {
  [[ ${YUJIAN_CONFIRM_KMS_SNAPSHOT:-} == YES ]] || { echo "refusing snapshot without YUJIAN_CONFIRM_KMS_SNAPSHOT=YES" >&2; exit 2; }
  new_run_root
  mkdir -p "$SNAPSHOT_ROOT/$RUN_ID"; chmod 700 "$SNAPSHOT_ROOT/$RUN_ID"
  local token snapshot container_snapshot metadata latest public_key started_ms finished_ms
  token=$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")
  snapshot="$SNAPSHOT_ROOT/$RUN_ID/openbao-raft.snap"
  container_snapshot="/openbao/data/$RUN_ID.snap"
  started_ms=$(date +%s%3N)
  compose exec -T -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt -e BAO_TOKEN="$token" \
    openbao-a bao operator raft snapshot save "$container_snapshot" >/dev/null
  compose cp "openbao-a:$container_snapshot" "$snapshot"
  compose exec -T openbao-a rm -f "$container_snapshot"
  compose exec -T -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt -e BAO_TOKEN="$token" \
    openbao-a bao read -format=json "transit/keys/$KMS_KEY" >"$RUN_ROOT/key-metadata.raw.json"
  jq '{name:.data.name,type:.data.type,latest_version:.data.latest_version,min_available_version:.data.min_available_version,min_decryption_version:.data.min_decryption_version,min_encryption_version:.data.min_encryption_version,keys:(.data.keys|with_entries(.value={creation_time:.value.creation_time,public_key:.value.public_key}))}' \
    "$RUN_ROOT/key-metadata.raw.json" >"$RUN_ROOT/key-metadata.json"
  rm "$RUN_ROOT/key-metadata.raw.json"
  latest=$(jq -r .latest_version "$RUN_ROOT/key-metadata.json")
  public_key="$RUN_ROOT/public-key-v$latest.pem"
  jq -r --arg version "$latest" '.keys[$version].public_key' "$RUN_ROOT/key-metadata.json" >"$public_key"
  [[ "sha256:$(sha256sum "$public_key" | awk '{print $1}')" == "$(jq -r .kms.publicKeySha256 "$POLICY")" ]] || { echo "KMS public key differs from frozen evidence" >&2; exit 1; }
  finished_ms=$(date +%s%3N)
  jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg policySha "$POLICY_SHA" \
    --arg snapshot "$snapshot" --arg snapshotSha "sha256:$(sha256sum "$snapshot" | awk '{print $1}')" \
    --arg metadataSha "sha256:$(sha256sum "$RUN_ROOT/key-metadata.json" | awk '{print $1}')" \
    --arg publicKey "$public_key" --arg publicKeySha "sha256:$(sha256sum "$public_key" | awk '{print $1}')" \
    --argjson keyVersion "$latest" --argjson durationMs "$((finished_ms-started_ms))" \
    '{schemaVersion:1,taskId:"P1-M0-04-KMS-RAFT-SNAPSHOT",runId:$runId,generatedAt:$generatedAt,policySha256:$policySha,status:"passed",snapshot:{path:$snapshot,sha256:$snapshotSha,encryptedRaftData:true,plaintextSecretExported:false},keyMetadata:{sha256:$metadataSha,keyVersion:$keyVersion,publicKeyPath:$publicKey,publicKeySha256:$publicKeySha,privateKeyExported:false},durationMs:$durationMs,productionKmsChanged:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"; rm "$RUN_ROOT/result.tmp.json"
  token=""
}

cleanup_restore() {
  docker rm -f "$ISOLATED_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$RUN_ROOT/temporary-init.json" 2>/dev/null || true
}

restore_kms() {
  local snapshot_run=${YUJIAN_KMS_SNAPSHOT_RUN:?set YUJIAN_KMS_SNAPSHOT_RUN to the immutable snapshot run directory}
  local result="$snapshot_run/result.json" snapshot expected actual source_token source_unseal temp_token temp_unseal latest public_key started_ms finished_ms
  jq -e --arg policy "$POLICY_SHA" '.taskId=="P1-M0-04-KMS-RAFT-SNAPSHOT" and .status=="passed" and .policySha256==$policy and .productionKmsChanged==false' "$result" >/dev/null
  snapshot=$(jq -r .snapshot.path "$result"); expected=$(jq -r .snapshot.sha256 "$result")
  actual="sha256:$(sha256sum "$snapshot" | awk '{print $1}')"; [[ "$expected" == "$actual" ]] || { echo "Raft snapshot digest mismatch" >&2; exit 1; }
  new_run_root; mkdir "$RUN_ROOT/raft"; chmod 700 "$RUN_ROOT/raft"
  cat >"$RUN_ROOT/restore.hcl" <<'HCL'
ui = false
disable_mlock = true
storage "raft" { path = "/openbao/data" node_id = "restore-a" }
listener "tcp" { address = "0.0.0.0:8200" cluster_address = "0.0.0.0:8201" tls_disable = 1 }
api_addr = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"
HCL
  docker run --rm --user 0 --entrypoint /bin/sh -v "$RUN_ROOT/raft:/data" "$KMS_IMAGE" -c 'chown -R 100:65534 /data && chmod 700 /data'
  trap cleanup_restore EXIT
  started_ms=$(date +%s%3N)
  docker run -d --name "$ISOLATED_CONTAINER" -p "127.0.0.1:$RECOVERY_PORT:8200" \
    -v "$RUN_ROOT/raft:/openbao/data" -v "$RUN_ROOT/restore.hcl:/openbao/restore.hcl:ro" \
    -v "$snapshot:/openbao/backup.snap:ro" "$KMS_IMAGE" server -config=/openbao/restore.hcl >"$RUN_ROOT/container-id.txt"
  for _ in $(seq 1 60); do
    curl --noproxy '*' --silent "http://127.0.0.1:$RECOVERY_PORT/v1/sys/health" >/dev/null && break
    sleep 1
  done
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$ISOLATED_CONTAINER" bao operator init -key-shares=1 -key-threshold=1 -format=json >"$RUN_ROOT/temporary-init.json"
  temp_token=$(jq -r .root_token "$RUN_ROOT/temporary-init.json"); temp_unseal=$(jq -r .unseal_keys_b64[0] "$RUN_ROOT/temporary-init.json")
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$ISOLATED_CONTAINER" bao operator unseal "$temp_unseal" >/dev/null
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$temp_token" "$ISOLATED_CONTAINER" bao operator raft snapshot restore -force /openbao/backup.snap >/dev/null
  docker restart "$ISOLATED_CONTAINER" >/dev/null
  source_token=$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json"); source_unseal=$(jq -r .unseal_keys_b64[0] "$DATA_ROOT/p2/openbao-ha-init.json")
  for _ in $(seq 1 60); do
    curl --noproxy '*' --silent "http://127.0.0.1:$RECOVERY_PORT/v1/sys/health" >/dev/null && break
    sleep 1
  done
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$ISOLATED_CONTAINER" bao operator unseal "$source_unseal" >/dev/null
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$source_token" "$ISOLATED_CONTAINER" bao read -format=json "transit/keys/$KMS_KEY" \
    >"$RUN_ROOT/restored-key.raw.json"
  jq '{name:.data.name,type:.data.type,latest_version:.data.latest_version,keys:(.data.keys|with_entries(.value={creation_time:.value.creation_time,public_key:.value.public_key}))}' \
    "$RUN_ROOT/restored-key.raw.json" >"$RUN_ROOT/restored-key.json"; rm "$RUN_ROOT/restored-key.raw.json"
  latest=$(jq -r .latest_version "$RUN_ROOT/restored-key.json"); public_key="$RUN_ROOT/restored-public-key-v$latest.pem"
  jq -r --arg version "$latest" '.keys[$version].public_key' "$RUN_ROOT/restored-key.json" >"$public_key"
  [[ "sha256:$(sha256sum "$public_key" | awk '{print $1}')" == "$(jq -r .kms.publicKeySha256 "$POLICY")" ]] || { echo "restored KMS public key mismatch" >&2; exit 1; }
  finished_ms=$(date +%s%3N); rm "$RUN_ROOT/temporary-init.json"
  temp_token=""; temp_unseal=""; source_token=""; source_unseal=""
  jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg policySha "$POLICY_SHA" \
    --arg sourceSnapshot "$snapshot_run" --arg publicKeySha "sha256:$(sha256sum "$public_key" | awk '{print $1}')" \
    --argjson keyVersion "$latest" --argjson rtoMs "$((finished_ms-started_ms))" \
    '{schemaVersion:1,taskId:"P1-M0-04-KMS-ISOLATED-RESTORE",runId:$runId,generatedAt:$generatedAt,policySha256:$policySha,status:"passed",sourceSnapshotRun:$sourceSnapshot,recovery:{isolated:true,loopbackOnly:true,rtoMs:$rtoMs,keyVersion:$keyVersion,publicKeySha256:$publicKeySha,transitKeyRestored:true},rawSecretsArchived:false,productionKmsChanged:false,productionReleaseAuthorized:false}' \
    >"$RUN_ROOT/result.tmp.json"
  write_result "$RUN_ROOT/result.tmp.json"; rm "$RUN_ROOT/result.tmp.json"
}

[[ "$ACTION" == snapshot || "$ACTION" == restore-verify ]] || usage
require_commands
node "$ROOT/tools/supply-chain/verify-registry-kms-freeze.mjs" >/dev/null
[[ "$ACTION" == snapshot ]] && snapshot_kms || restore_kms
