#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
P2_DIR="$ROOT/infra/p2/beelink"
DATA_ROOT=${YUJIAN_DATA_ROOT:-"$ROOT/data"}
ENV_FILE=${YUJIAN_P2_ENV_FILE:-"$DATA_ROOT/p2/runtime.env"}
COMPOSE_FILE="$P2_DIR/compose.yaml"
PROJECT=yujian-p2

export YUJIAN_DATA_ROOT="$DATA_ROOT"
export YUJIAN_PROJECT_ROOT="$ROOT"
export YUJIAN_P2_DIR="$P2_DIR"
export YUJIAN_P2_ENV_FILE="$ENV_FILE"

random_hex() {
  openssl rand -hex 32
}

ensure_dirs() {
  umask 077
  mkdir -p "$DATA_ROOT/p2" "$DATA_ROOT/p2/postgres" "$DATA_ROOT/p2/redis" "$DATA_ROOT/p2/openbao" "$DATA_ROOT/p2/reports"
  # Service containers run with image-specific UIDs; their bind mounts are
  # tightened by prepare_service_dirs after the pinned images are present.
  chmod 755 "$DATA_ROOT" "$DATA_ROOT/p2"
  chmod 700 "$DATA_ROOT/p2/reports"
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
YUJIAN_OPENBAO_HOST_PORT=18200
YUJIAN_POSTGRES_DB=yujian
YUJIAN_POSTGRES_USER=yujian
YUJIAN_POSTGRES_PASSWORD=$pg_password
YUJIAN_REDIS_PASSWORD=$redis_password
YUJIAN_DATABASE_URL=postgresql://yujian:$pg_password@127.0.0.1:15432/yujian?sslmode=disable
YUJIAN_REDIS_URL=redis://:$redis_password@127.0.0.1:16379
YUJIAN_KMS_ADDR=http://127.0.0.1:18200
YUJIAN_KMS_TOKEN=
EOF
    chmod 600 "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

compose() {
  docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

prepare_service_dirs() {
  local postgres_image redis_image openbao_image
  postgres_image=$(awk -F= '$1=="YUJIAN_POSTGRES_IMAGE"{print substr($0,index($0,"=")+1)}' "$ENV_FILE")
  redis_image=$(awk -F= '$1=="YUJIAN_REDIS_IMAGE"{print substr($0,index($0,"=")+1)}' "$ENV_FILE")
  openbao_image=$(awk -F= '$1=="YUJIAN_OPENBAO_IMAGE"{print substr($0,index($0,"=")+1)}' "$ENV_FILE")
  docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/postgres:/data" "$postgres_image" -c 'chown -R 999:999 /data && chmod 700 /data'
  docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/redis:/data" "$redis_image" -c 'chown -R 999:999 /data && chmod 700 /data'
  docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/p2/openbao:/data" "$openbao_image" -c 'chown -R 100:65534 /data && chmod 700 /data'
}

wait_for_services() {
  local i
  for i in $(seq 1 40); do
    if compose exec -T postgres pg_isready -U "$(awk -F= '$1=="YUJIAN_POSTGRES_USER"{print $2}' "$ENV_FILE")" -d "$(awk -F= '$1=="YUJIAN_POSTGRES_DB"{print $2}' "$ENV_FILE")" >/dev/null 2>&1 && \
       compose exec -T redis redis-cli --no-auth-warning -a "$(awk -F= '$1=="YUJIAN_REDIS_PASSWORD"{print $2}' "$ENV_FILE")" ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    sleep 2
  done
  echo "P2 PostgreSQL/Redis health check timed out" >&2
  return 1
}

init_openbao() {
  local init_file="$DATA_ROOT/p2/openbao-init.json"
  if [[ ! -f "$init_file" ]]; then
    compose exec -T openbao bao operator init -key-shares=1 -key-threshold=1 -format=json >"$init_file"
    chmod 600 "$init_file"
  fi
  local unseal_key root_token
  unseal_key=$(jq -r '.unseal_keys_b64[0] // empty' "$init_file")
  root_token=$(jq -r '.root_token // empty' "$init_file")
  [[ -n "$unseal_key" && -n "$root_token" ]] || { echo "invalid OpenBao init artifact" >&2; return 1; }
  compose exec -T openbao bao operator unseal "$unseal_key" >/dev/null
  compose exec -T -e BAO_TOKEN="$root_token" openbao bao secrets enable -path=kv kv-v2 >/dev/null 2>&1 || true
  compose exec -T -e BAO_TOKEN="$root_token" openbao bao policy write yujian-runtime - <<'POLICY'
path "kv/data/yujian/*" {
  capabilities = ["read"]
}
POLICY
  if ! grep -q '^YUJIAN_KMS_TOKEN=' "$ENV_FILE" || [[ -z "$(awk -F= '$1=="YUJIAN_KMS_TOKEN"{print substr($0,index($0,"=")+1)}' "$ENV_FILE")" ]]; then
    local kms_token
    kms_token=$(compose exec -T -e BAO_TOKEN="$root_token" openbao bao token create -policy=yujian-runtime -period=24h -format=json | jq -r '.auth.client_token')
    [[ -n "$kms_token" && "$kms_token" != "null" ]] || { echo "OpenBao runtime token creation failed" >&2; return 1; }
    python3 - "$ENV_FILE" "$kms_token" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
token = sys.argv[2].strip()
lines = path.read_text().splitlines()
if not any(line.startswith("YUJIAN_KMS_TOKEN=") for line in lines):
    lines.append("YUJIAN_KMS_TOKEN=" + token)
else:
    lines = ["YUJIAN_KMS_TOKEN=" + token if line.startswith("YUJIAN_KMS_TOKEN=") else line for line in lines]
path.write_text("\n".join(lines) + "\n")
PY
    chmod 600 "$ENV_FILE"
  fi
}

migrate() {
  ensure_env
  wait_for_services
  (cd "$ROOT" && YUJIAN_DATABASE_URL="$(awk -F= '$1=="YUJIAN_DATABASE_URL"{print substr($0,index($0,"=")+1)}' "$ENV_FILE")" \
    YUJIAN_P2_ENV_FILE="$ENV_FILE" PSQL_BIN="$P2_DIR/psql-via-docker.sh" npm run db:migrate)
}

smoke() {
  ensure_env
  wait_for_services
  init_openbao
  local status
  status=$(compose exec -T -e BAO_TOKEN="$(jq -r '.root_token' "$DATA_ROOT/p2/openbao-init.json")" openbao bao status -format=json)
  python3 - "$status" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if payload.get("sealed"):
    raise SystemExit("OpenBao is sealed")
print(json.dumps({"postgres": "ready", "redis": "ready", "openbao": "unsealed", "version": payload.get("version")}, separators=(",", ":")))
PY
}

case "${1:-}" in
  up)
    ensure_env
    compose pull
    prepare_service_dirs
    compose up -d
    wait_for_services
    init_openbao
    compose ps
    ;;
  migrate)
    migrate
    ;;
  smoke)
    smoke
    ;;
  status)
    ensure_env
    compose ps
    ;;
  down)
    ensure_env
    compose down
    ;;
  *)
    echo "usage: $0 {up|migrate|smoke|status|down}" >&2
    exit 2
    ;;
esac
