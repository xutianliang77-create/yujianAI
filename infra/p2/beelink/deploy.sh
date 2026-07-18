#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
P2_DIR="$ROOT/infra/p2/beelink"
DATA_ROOT=${YUJIAN_DATA_ROOT:-"$ROOT/data"}
ENV_FILE=${YUJIAN_P2_ENV_FILE:-"$DATA_ROOT/p2/runtime.env"}
COMPOSE_FILE="$P2_DIR/compose.yaml"
PROJECT=yujian-p2
TLS_DIR="$DATA_ROOT/p2/openbao-tls"

export YUJIAN_DATA_ROOT="$DATA_ROOT"
export YUJIAN_PROJECT_ROOT="$ROOT"
export YUJIAN_P2_DIR="$P2_DIR"
export YUJIAN_P2_ENV_FILE="$ENV_FILE"

random_hex() { openssl rand -hex 32; }
env_value() { awk -F= -v key="$1" '$1 == key {print substr($0,index($0,"=")+1); exit}' "$ENV_FILE"; }

set_env_value() {
  python3 - "$ENV_FILE" "$1" "$2" <<'PY'
from pathlib import Path
import sys
path, key, value = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text().splitlines() if path.exists() else []
updated = False
output = []
for line in lines:
    if line.startswith(key + "="):
        if not updated:
            output.append(key + "=" + value)
            updated = True
    else:
        output.append(line)
if not updated:
    output.append(key + "=" + value)
path.write_text("\n".join(output) + "\n")
PY
}

ensure_dirs() {
  umask 077
  mkdir -p "$DATA_ROOT/p2" "$DATA_ROOT/p2/postgres" "$DATA_ROOT/p2/redis" \
    "$DATA_ROOT/p2/openbao" "$DATA_ROOT/p2/openbao-a" "$DATA_ROOT/p2/openbao-b" \
    "$DATA_ROOT/p2/openbao-c" "$TLS_DIR" "$DATA_ROOT/p2/reports" "$DATA_ROOT/p2/backups" "$DATA_ROOT/p2/data-rights"
  chmod 755 "$DATA_ROOT" "$DATA_ROOT/p2"
  chmod 700 "$DATA_ROOT/p2/reports" "$DATA_ROOT/p2/backups" "$DATA_ROOT/p2/data-rights" "$TLS_DIR"
}

ensure_env() {
  ensure_dirs
  if [[ ! -f "$ENV_FILE" ]]; then
    local pg_password redis_password
    pg_password=$(random_hex)
    redis_password=$(random_hex)
    umask 077
    cat >"$ENV_FILE" <<EOF
YUJIAN_DATA_ROOT=$DATA_ROOT
YUJIAN_PROJECT_ROOT=$ROOT
YUJIAN_P2_DIR=$P2_DIR
YUJIAN_POSTGRES_IMAGE=postgres:16.4@sha256:9a70e4d1c03a5066080292db2dd95ee3965d3651316e21989fa0935afb8ce8ca
YUJIAN_REDIS_IMAGE=redis:7.2.7-alpine@sha256:1de7ca6a3f63a083036fa1d95dddbd6bdfcdf5865bb692c1e412d4bdf9cb1e37
YUJIAN_OPENBAO_IMAGE=openbao/openbao:2.4.1@sha256:06a26f632cd0bdd0fd6e25034f55d68bc28b62590adc8efea3b8dacade11579a
YUJIAN_POSTGRES_HOST_PORT=15432
YUJIAN_REDIS_HOST_PORT=16379
YUJIAN_OPENBAO_A_HOST_PORT=18200
YUJIAN_OPENBAO_B_HOST_PORT=18201
YUJIAN_OPENBAO_C_HOST_PORT=18202
YUJIAN_OPENBAO_NODE_COUNT=3
YUJIAN_POSTGRES_DB=yujian
YUJIAN_POSTGRES_USER=yujian
YUJIAN_POSTGRES_PASSWORD=$pg_password
YUJIAN_REDIS_PASSWORD=$redis_password
YUJIAN_DATABASE_URL=postgresql://yujian:$pg_password@127.0.0.1:15432/yujian?sslmode=disable
YUJIAN_REDIS_URL=redis://:$redis_password@127.0.0.1:16379
YUJIAN_KMS_ADDR=https://127.0.0.1:18200,https://127.0.0.1:18201,https://127.0.0.1:18202
YUJIAN_KMS_CA_FILE=$TLS_DIR/ca.crt
YUJIAN_KMS_TOKEN=
EOF
    chmod 600 "$ENV_FILE"
  fi
  set_env_value YUJIAN_DATA_ROOT "$DATA_ROOT"
  set_env_value YUJIAN_PROJECT_ROOT "$ROOT"
  set_env_value YUJIAN_P2_DIR "$P2_DIR"
  set_env_value YUJIAN_P2_ENV_FILE "$ENV_FILE"
  if [[ "$(env_value YUJIAN_KMS_ADDR)" != https://127.0.0.1:18200,* ]]; then
    set_env_value YUJIAN_KMS_ADDR "https://127.0.0.1:18200,https://127.0.0.1:18201,https://127.0.0.1:18202"
  fi
  [[ -n "$(env_value YUJIAN_OPENBAO_A_HOST_PORT)" ]] || set_env_value YUJIAN_OPENBAO_A_HOST_PORT 18200
  [[ -n "$(env_value YUJIAN_OPENBAO_B_HOST_PORT)" ]] || set_env_value YUJIAN_OPENBAO_B_HOST_PORT 18201
  [[ -n "$(env_value YUJIAN_OPENBAO_C_HOST_PORT)" ]] || set_env_value YUJIAN_OPENBAO_C_HOST_PORT 18202
  [[ -n "$(env_value YUJIAN_OPENBAO_NODE_COUNT)" ]] || set_env_value YUJIAN_OPENBAO_NODE_COUNT 3
  set_env_value YUJIAN_KMS_CA_FILE "$TLS_DIR/ca.crt"
  chmod 600 "$ENV_FILE"
}

ensure_tls() {
  ensure_dirs
  if [[ ! -s "$TLS_DIR/ca.key" || ! -s "$TLS_DIR/ca.crt" ]]; then
    openssl genrsa -out "$TLS_DIR/ca.key" 4096 >/dev/null 2>&1
    openssl req -x509 -new -nodes -key "$TLS_DIR/ca.key" -sha256 -days 3650 -out "$TLS_DIR/ca.crt" -subj "/CN=Yujian P2 OpenBao CA" >/dev/null 2>&1
  fi
  if [[ ! -s "$TLS_DIR/server.key" || ! -s "$TLS_DIR/server.crt" ]]; then
    openssl req -new -newkey rsa:2048 -nodes -keyout "$TLS_DIR/server.key" -out "$TLS_DIR/server.csr" -subj "/CN=openbao-a" >/dev/null 2>&1
    openssl x509 -req -in "$TLS_DIR/server.csr" -CA "$TLS_DIR/ca.crt" -CAkey "$TLS_DIR/ca.key" -CAcreateserial \
      -out "$TLS_DIR/server.crt" -days 825 -sha256 \
      -extfile <(printf '%s\n' 'basicConstraints=CA:FALSE' 'keyUsage=digitalSignature,keyEncipherment' 'subjectAltName=DNS:openbao-a,DNS:openbao-b,DNS:openbao-c,DNS:localhost,IP:127.0.0.1') >/dev/null 2>&1
    rm -f "$TLS_DIR/server.csr" "$TLS_DIR/ca.srl"
  fi
  chmod 600 "$TLS_DIR/ca.key"
  chmod 644 "$TLS_DIR/server.key"
  chmod 644 "$TLS_DIR/ca.crt" "$TLS_DIR/server.crt"
}

compose() { docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

prepare_service_dirs() {
  local postgres_image redis_image openbao_image
  postgres_image=$(env_value YUJIAN_POSTGRES_IMAGE)
  redis_image=$(env_value YUJIAN_REDIS_IMAGE)
  openbao_image=$(env_value YUJIAN_OPENBAO_IMAGE)
  docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/postgres:/data" "$postgres_image" -c 'chown -R 999:999 /data && chmod 700 /data'
  docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/redis:/data" "$redis_image" -c 'chown -R 999:999 /data && chmod 700 /data'
  for node in a b c; do
    docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/openbao-$node:/data" "$openbao_image" -c 'chown -R 100:65534 /data && chmod 700 /data'
  done
  docker run --rm --user 0 -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" --entrypoint /bin/sh -v "$TLS_DIR:/tls" "$openbao_image" -c 'chown "$HOST_UID":"$HOST_GID" /tls/ca.crt /tls/server.crt /tls/server.key && chgrp 65534 /tls/ca.crt /tls/server.crt /tls/server.key && chmod 644 /tls/ca.crt /tls/server.crt /tls/server.key'
}

remove_legacy_openbao() { docker rm -f "yujian-p2-openbao-1" >/dev/null 2>&1 || true; }

wait_for_services() {
  local i
  for i in $(seq 1 40); do
    if compose exec -T postgres pg_isready -U "$(env_value YUJIAN_POSTGRES_USER)" -d "$(env_value YUJIAN_POSTGRES_DB)" >/dev/null 2>&1 && \
       compose exec -T redis redis-cli --no-auth-warning -a "$(env_value YUJIAN_REDIS_PASSWORD)" ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    sleep 2
  done
  echo "P2 PostgreSQL/Redis health check timed out" >&2
  return 1
}

wait_for_openbao() {
  local port status i
  for port in "$(env_value YUJIAN_OPENBAO_A_HOST_PORT)" "$(env_value YUJIAN_OPENBAO_B_HOST_PORT)" "$(env_value YUJIAN_OPENBAO_C_HOST_PORT)"; do
    status=""
    for i in $(seq 1 40); do
      status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --cacert "$TLS_DIR/ca.crt" "https://127.0.0.1:$port/v1/sys/health?standbyok=true&perfstandbyok=true" || true)
      if [[ "$status" == 200 || "$status" == 429 || "$status" == 472 || "$status" == 473 || "$status" == 501 || "$status" == 503 ]]; then break; fi
      sleep 1
    done
    [[ "$status" == 200 || "$status" == 429 || "$status" == 472 || "$status" == 473 || "$status" == 501 || "$status" == 503 ]] || { echo "OpenBao node on port $port did not become reachable" >&2; return 1; }
  done
}

bao_exec() {
  local node="$1"
  shift
  compose exec -T -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt "$node" bao "$@"
}

bao_exec_token() {
  local node="$1" token="$2"
  shift 2
  compose exec -T -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt -e BAO_TOKEN="$token" "$node" bao "$@"
}

node_status() { bao_exec "$1" status -format=json 2>/dev/null || true; }
node_initialized() { [[ "$(node_status "$1")" == *'"initialized":true'* ]]; }
node_sealed() { [[ "$(node_status "$1")" == *'"sealed":true'* ]]; }

set_runtime_token() {
  local token="$1"
  set_env_value YUJIAN_KMS_TOKEN "$token"
  chmod 600 "$ENV_FILE"
}

peer_count() {
  local peers="$1"
  python3 - "$peers" <<'PY'
import json, sys
try:
    value = json.loads(sys.argv[1])
except Exception:
    print(0)
    raise SystemExit
ids = set()
def visit(item):
    if isinstance(item, dict):
        if isinstance(item.get("node_id"), str):
            ids.add(item["node_id"])
        for child in item.values():
            visit(child)
    elif isinstance(item, list):
        for child in item:
            visit(child)
visit(value)
print(len(ids))
PY
}

peer_voter_count() {
  local peers="$1"
  python3 - "$peers" <<'PY'
import json, sys
try:
    value = json.loads(sys.argv[1])
except Exception:
    print(0)
    raise SystemExit
count = 0
def visit(item):
    global count
    if isinstance(item, dict):
        if item.get("voter") is True:
            count += 1
        for child in item.values():
            visit(child)
    elif isinstance(item, list):
        for child in item:
            visit(child)
visit(value)
print(count)
PY
}

init_openbao() {
  local init_file="$DATA_ROOT/p2/openbao-ha-init.json"
  if [[ ! -f "$init_file" ]]; then
    set_runtime_token ""
    bao_exec openbao-a operator init -key-shares=1 -key-threshold=1 -format=json >"$init_file"
    chmod 600 "$init_file"
  fi
  local unseal_key root_token
  unseal_key=$(jq -r '.unseal_keys_b64[0] // empty' "$init_file")
  root_token=$(jq -r '.root_token // empty' "$init_file")
  [[ -n "$unseal_key" && -n "$root_token" ]] || { echo "invalid OpenBao HA init artifact" >&2; return 1; }
  if node_sealed openbao-a; then bao_exec openbao-a operator unseal "$unseal_key" >/dev/null; fi
  for node in openbao-b openbao-c; do
    if ! node_initialized "$node"; then
      bao_exec "$node" operator raft join -leader-ca-cert=@/openbao/tls/ca.crt -tls-server-name=openbao-a https://openbao-a:8200 >/dev/null
    fi
    if node_sealed "$node"; then bao_exec "$node" operator unseal "$unseal_key" >/dev/null; fi
  done
  local peers count voters
  for _ in $(seq 1 30); do
    peers=$(bao_exec_token openbao-a "$root_token" operator raft list-peers -format=json 2>/dev/null || true)
    count=$(peer_count "$peers")
    voters=$(peer_voter_count "$peers")
    if [[ "$count" -ge 3 && "$voters" -ge 3 ]]; then break; fi
    sleep 1
  done
  [[ "$count" -ge 3 && "$voters" -ge 3 ]] || { echo "OpenBao Raft quorum has $count peers and $voters voters; expected 3 of each" >&2; return 1; }
  bao_exec_token openbao-a "$root_token" secrets enable -path=kv kv-v2 >/dev/null 2>&1 || true
  bao_exec_token openbao-a "$root_token" policy write yujian-runtime - <<'POLICY'
path "kv/data/yujian/*" {
  capabilities = ["read"]
}
POLICY
  if [[ -z "$(env_value YUJIAN_KMS_TOKEN)" ]]; then
    local kms_token
    kms_token=$(bao_exec_token openbao-a "$root_token" token create -policy=yujian-runtime -period=24h -format=json | jq -r '.auth.client_token')
    [[ -n "$kms_token" && "$kms_token" != "null" ]] || { echo "OpenBao runtime token creation failed" >&2; return 1; }
    set_runtime_token "$kms_token"
  fi
}

migrate() {
  ensure_env
  ensure_tls
  wait_for_services
  (cd "$ROOT" && YUJIAN_DATABASE_URL="$(env_value YUJIAN_DATABASE_URL)" YUJIAN_P2_ENV_FILE="$ENV_FILE" PSQL_BIN="$P2_DIR/psql-via-docker.sh" npm run db:migrate)
}

smoke() {
  ensure_env
  ensure_tls
  wait_for_services
  wait_for_openbao
  init_openbao
  local root_token status peers count voters
  root_token=$(jq -r '.root_token' "$DATA_ROOT/p2/openbao-ha-init.json")
  status=$(bao_exec_token openbao-a "$root_token" status -format=json)
  peers=$(bao_exec_token openbao-a "$root_token" operator raft list-peers -format=json)
  count=$(peer_count "$peers")
  voters=$(peer_voter_count "$peers")
  python3 - "$status" "$count" "$voters" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if payload.get("sealed"):
    raise SystemExit("OpenBao is sealed")
if int(sys.argv[2]) < 3 or int(sys.argv[3]) < 3:
    raise SystemExit("OpenBao Raft quorum is below three voters")
print(json.dumps({"postgres": "ready", "redis": "ready", "openbao": "tls-raft-ha", "raftPeers": int(sys.argv[2]), "raftVoters": int(sys.argv[3]), "version": payload.get("version")}, separators=(",", ":")))
PY
}

case "${1:-}" in
  up)
    ensure_env
    ensure_tls
    compose pull
    prepare_service_dirs
    remove_legacy_openbao
    compose up -d --remove-orphans
    wait_for_services
    wait_for_openbao
    init_openbao
    compose ps
    ;;
  migrate) migrate ;;
  smoke) smoke ;;
  status) ensure_env; compose ps ;;
  down) ensure_env; compose down ;;
  *) echo "usage: $0 {up|migrate|smoke|status|down}" >&2; exit 2 ;;
esac
