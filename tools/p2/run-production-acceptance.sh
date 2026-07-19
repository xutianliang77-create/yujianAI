#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DATA_ROOT=${YUJIAN_DATA_ROOT:-"$ROOT/data"}
ENV_FILE=${YUJIAN_P2_ENV_FILE:-"$DATA_ROOT/p2/runtime.env"}
COMPOSE_FILE="$ROOT/infra/p2/beelink/compose.yaml"
REPORT=${YUJIAN_P2_REPORT:-"$DATA_ROOT/p2/reports/production-acceptance.json"}
PID_FILE="$DATA_ROOT/p2/platform-api.pid"
LOG_FILE="$DATA_ROOT/p2/platform-api.log"

set -a
. "$ENV_FILE"
set +a

export NODE_EXTRA_CA_CERTS="${YUJIAN_KMS_CA_FILE:-$DATA_ROOT/p2/openbao-tls/ca.crt}"

export YUJIAN_P2_REPORT="$REPORT"
export YUJIAN_PLATFORM_BASE_URL="${YUJIAN_PLATFORM_BASE_URL:-http://127.0.0.1:18090}"
export YUJIAN_P2_TENANT_ID="${YUJIAN_P2_TENANT_ID:-p2-prod-tenant}"
export YUJIAN_P2_PROJECT_ID="${YUJIAN_P2_PROJECT_ID:-p2-prod-project}"
export YUJIAN_P2_ENVIRONMENT_ID="${YUJIAN_P2_ENVIRONMENT_ID:-p2-prod-env}"
export YUJIAN_P2_API_CREDENTIAL="${YUJIAN_P2_API_CREDENTIAL:-$(openssl rand -hex 32)}"
export YUJIAN_P2_ADMIN_CREDENTIAL="${YUJIAN_P2_ADMIN_CREDENTIAL:-$(openssl rand -hex 32)}"

start_api() {
  NODE_ENV=production \
  PLATFORM_API_HOST=127.0.0.1 \
  PLATFORM_API_PORT=18090 \
  LIVEKIT_URL="${LIVEKIT_URL:-ws://127.0.0.1:7880}" \
  LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-p2-acceptance-key}" \
  LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-p2-acceptance-secret-$(openssl rand -hex 32)}" \
  YUJIAN_PLATFORM_RUNTIME_MODULE="$ROOT/infra/p2/runtime/platform-runtime.mjs" \
  YUJIAN_PLATFORM_CREDENTIALS_JSON="[{\"tenantId\":\"$YUJIAN_P2_TENANT_ID\",\"projectId\":\"$YUJIAN_P2_PROJECT_ID\",\"environmentId\":\"$YUJIAN_P2_ENVIRONMENT_ID\",\"credential\":\"$YUJIAN_P2_API_CREDENTIAL\",\"scopes\":[\"*\"]}]" \
  YUJIAN_PLATFORM_ADMIN_CREDENTIAL="$YUJIAN_P2_ADMIN_CREDENTIAL" \
  YUJIAN_API_KEY_GRACE_MS=300000 \
  nohup node "$ROOT/services/platform-api/dist/main.js" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 50); do
    if curl -fsS "$YUJIAN_PLATFORM_BASE_URL/healthz" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  cat "$LOG_FILE" >&2 || true
  return 1
}

stop_api() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$(cat "$PID_FILE")" 2>/dev/null || break; sleep 1; done
    rm -f "$PID_FILE"
  fi
}

cleanup() { stop_api; }
trap cleanup EXIT INT TERM

YUJIAN_P2_PHASE=prepare YUJIAN_P2_DEFER_KMS_DELETE=true YUJIAN_KMS_ADMIN_TOKEN="$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")" node "$ROOT/tools/p2/production-acceptance.mjs"
start_api
YUJIAN_P2_PHASE=api YUJIAN_P2_DEFER_KMS_DELETE=true YUJIAN_KMS_ADMIN_TOKEN="$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")" node "$ROOT/tools/p2/production-acceptance.mjs"
stop_api

start_api
YUJIAN_P2_CLEANUP=false node "$ROOT/tools/p2/restart-acceptance.mjs"
stop_api

docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop openbao-a >/dev/null
node "$ROOT/tools/p2/kms-failover-acceptance.mjs"
docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start openbao-a >/dev/null
chmod 644 "$DATA_ROOT/p2/openbao-tls/server.key" 2>/dev/null || true
OPENBAO_A_STATUS=""
for _ in $(seq 1 30); do
  OPENBAO_A_STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --cacert "${YUJIAN_KMS_CA_FILE:-$DATA_ROOT/p2/openbao-tls/ca.crt}" "https://127.0.0.1:${YUJIAN_OPENBAO_A_HOST_PORT:-18200}/v1/sys/health?standbyok=true&perfstandbyok=true" || true)
  if [[ "$OPENBAO_A_STATUS" == 200 || "$OPENBAO_A_STATUS" == 429 || "$OPENBAO_A_STATUS" == 472 || "$OPENBAO_A_STATUS" == 473 || "$OPENBAO_A_STATUS" == 503 ]]; then break; fi
  sleep 1
done
[[ "$OPENBAO_A_STATUS" == 200 || "$OPENBAO_A_STATUS" == 429 || "$OPENBAO_A_STATUS" == 472 || "$OPENBAO_A_STATUS" == 473 || "$OPENBAO_A_STATUS" == 503 ]] || { echo "OpenBao leader did not restart" >&2; exit 1; }
UNSEAL_KEY="$(jq -r '.unseal_keys_b64[0]' "$DATA_ROOT/p2/openbao-ha-init.json")"
docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T openbao-a bao operator unseal "$UNSEAL_KEY" >/dev/null
YUJIAN_KMS_ADMIN_TOKEN="$(jq -r .root_token "$DATA_ROOT/p2/openbao-ha-init.json")" node "$ROOT/tools/p2/kms-cleanup.mjs"

docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" rm -sf redis >/dev/null
docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d redis >/dev/null
for _ in $(seq 1 30); do
  if docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T redis redis-cli --no-auth-warning -a "$YUJIAN_REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then break; fi
  sleep 1
done
start_api
YUJIAN_P2_CLEANUP=true node "$ROOT/tools/p2/restart-acceptance.mjs"
echo "P2 production acceptance passed: report=$REPORT"
