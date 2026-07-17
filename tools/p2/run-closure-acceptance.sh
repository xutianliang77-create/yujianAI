#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DATA_ROOT=${YUJIAN_DATA_ROOT:-"$ROOT/data"}
ENV_FILE=${YUJIAN_P2_ENV_FILE:-"$DATA_ROOT/p2/runtime.env"}
COMPOSE_FILE="$ROOT/infra/p2/beelink/compose.yaml"
REPORT=${YUJIAN_P2_CLOSURE_REPORT:-"$DATA_ROOT/p2/reports/p2-closure-acceptance.json"}
PROJECT=yujian-p2
RESTORE_DB=""

set -a
. "$ENV_FILE"
set +a
export YUJIAN_PROJECT_ROOT="$ROOT"
export YUJIAN_DATA_ROOT="$DATA_ROOT"
export YUJIAN_P2_CLOSURE_REPORT="$REPORT"
export YUJIAN_KMS_ADMIN_TOKEN
YUJIAN_KMS_ADMIN_TOKEN=$(jq -r '.root_token' "$DATA_ROOT/p2/openbao-ha-init.json")
export NODE_EXTRA_CA_CERTS="${YUJIAN_KMS_CA_FILE:-$DATA_ROOT/p2/openbao-tls/ca.crt}"
export YUJIAN_P2_TLS_KEY="$DATA_ROOT/p2/openbao-tls/server.key"
export YUJIAN_P2_TLS_CERT="$DATA_ROOT/p2/openbao-tls/server.crt"
export YUJIAN_P2_RTC_URL=${YUJIAN_P2_RTC_URL:-ws://127.0.0.1:7880}

compose() { docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$RESTORE_DB" ]]; then compose exec -T postgres dropdb -U "$YUJIAN_POSTGRES_USER" --if-exists "$RESTORE_DB" >/dev/null 2>&1 || true; fi
  if [[ -f "$REPORT" ]]; then node "$ROOT/tools/p2/cleanup-closure.mjs" >/dev/null 2>&1 || true; fi
  exit "$status"
}
trap cleanup EXIT INT TERM

mapfile -t RTC_CREDENTIALS < <(python3 - <<'PY'
from pathlib import Path
path = Path('/home/beelink/livekit-qkxy/livekit.yaml')
inside = False
for line in path.read_text().splitlines():
    if line and not line.startswith(' '):
        inside = line.split(':', 1)[0].strip() == 'keys'
        continue
    if inside and line.startswith('  ') and ':' in line:
        key, secret = line.strip().split(':', 1)
        print(key.strip().strip(chr(34) + chr(39)))
        print(secret.strip().strip(chr(34) + chr(39)))
        break
PY
)
[[ ${#RTC_CREDENTIALS[@]} -eq 2 && -n "${RTC_CREDENTIALS[0]}" && -n "${RTC_CREDENTIALS[1]}" ]] || { echo "unable to read the existing LiveKit acceptance credential" >&2; exit 1; }
export YUJIAN_P2_RTC_API_KEY="${RTC_CREDENTIALS[0]}"
export YUJIAN_P2_RTC_API_SECRET="${RTC_CREDENTIALS[1]}"
unset RTC_CREDENTIALS

mkdir -p "$DATA_ROOT/p2/backups" "$DATA_ROOT/p2/reports" "$DATA_ROOT/p2/data-rights"
chmod 700 "$DATA_ROOT/p2/backups" "$DATA_ROOT/p2/reports" "$DATA_ROOT/p2/data-rights"

npm run build -w @yujian/platform-contracts
npm run build -w @yujian/platform-adapters
npm run build -w @yujian/data-rights
npm run build -w @yujian/platform-api
bash "$ROOT/infra/p2/beelink/deploy.sh" migrate

PROTECTED_BEFORE=$(docker inspect -f '{{.Name}}={{.RestartCount}}' ai-phone-staging-agent ai-phone-staging-api ai-phone-staging-gateway livekit-qkxy-livekit-1 livekit-qkxy-redis-1 | sort | sha256sum | awk '{print $1}')
node "$ROOT/tools/p2/closure-acceptance.mjs"

RUN_ID=$(jq -r '.runId' "$REPORT")
TENANT_ID=$(jq -r '.cleanup.scope.tenantId' "$REPORT")
EXPORT_ID=$(jq -r '.cleanup.exportRequestId' "$REPORT")
DELETE_ID=$(jq -r '.cleanup.deleteRequestId' "$REPORT")
RECOVERY_ID=$(jq -r '.cleanup.recoveryRequestId' "$REPORT")
BACKUP="$DATA_ROOT/p2/backups/${RUN_ID}.dump"
SOURCE_SNAPSHOT=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$YUJIAN_POSTGRES_DB" -Atqc "SELECT updated_at::text FROM platform_store_snapshots WHERE snapshot_id='default'")
START_MS=$(date +%s%3N)
compose exec -T postgres pg_dump -U "$YUJIAN_POSTGRES_USER" -d "$YUJIAN_POSTGRES_DB" -Fc >"$BACKUP"
chmod 600 "$BACKUP"
BACKUP_SHA=$(sha256sum "$BACKUP" | awk '{print $1}')
RESTORE_DB="yujian_restore_$(date +%s)_$RANDOM"
compose exec -T postgres createdb -U "$YUJIAN_POSTGRES_USER" "$RESTORE_DB"
compose exec -T postgres pg_restore -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" --exit-on-error <"$BACKUP"
RESTORE_MS=$(( $(date +%s%3N) - START_MS ))

MIGRATIONS=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" -Atqc "SELECT count(*) FROM yujian_schema_migrations")
RESTORED_SNAPSHOT=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" -Atqc "SELECT updated_at::text FROM platform_store_snapshots WHERE snapshot_id='default'")
RESTORED_TENANT=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" -v tenant_id="$TENANT_ID" -Atqc "SELECT count(*) FROM platform_store_snapshots WHERE snapshot_id='default' AND snapshot->'tenants' @> jsonb_build_array(jsonb_build_object('tenantId', :'tenant_id'))")
RESTORED_RIGHTS=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" -v export_id="$EXPORT_ID" -v delete_id="$DELETE_ID" -v recovery_id="$RECOVERY_ID" -Atqc "SELECT count(*) FROM data_subject_requests WHERE request_id IN (:'export_id', :'delete_id', :'recovery_id') AND status='completed'")
RESTORED_RECEIPTS=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$RESTORE_DB" -v delete_id="$DELETE_ID" -v recovery_id="$RECOVERY_ID" -Atqc "SELECT count(*) FROM data_rights_evidence_receipts WHERE request_id IN (:'delete_id', :'recovery_id')")
[[ "$MIGRATIONS" == 11 && "$RESTORED_TENANT" == 1 && "$RESTORED_RIGHTS" == 3 && "$RESTORED_RECEIPTS" == 2 && "$SOURCE_SNAPSHOT" == "$RESTORED_SNAPSHOT" ]] || { echo "isolated PostgreSQL restore verification failed" >&2; exit 1; }

MEMBER_COUNT=$(compose exec -T postgres psql -U "$YUJIAN_POSTGRES_USER" -d "$YUJIAN_POSTGRES_DB" -v tenant_id="$TENANT_ID" -Atqc "SELECT count(*) FROM tenant_members WHERE tenant_id = :'tenant_id' AND status='active'")
REDIS_KEY="p2:rbac-rebuild:${RUN_ID}"
compose exec -T redis redis-cli --no-auth-warning -a "$YUJIAN_REDIS_PASSWORD" DEL "$REDIS_KEY" >/dev/null
compose exec -T redis redis-cli --no-auth-warning -a "$YUJIAN_REDIS_PASSWORD" SET "$REDIS_KEY" "$MEMBER_COUNT" EX 600 >/dev/null
REDIS_VALUE=$(compose exec -T redis redis-cli --no-auth-warning -a "$YUJIAN_REDIS_PASSWORD" GET "$REDIS_KEY")
compose exec -T redis redis-cli --no-auth-warning -a "$YUJIAN_REDIS_PASSWORD" DEL "$REDIS_KEY" >/dev/null
[[ "$REDIS_VALUE" == "$MEMBER_COUNT" && "$MEMBER_COUNT" -ge 2 ]] || { echo "Redis rebuild from PostgreSQL truth failed" >&2; exit 1; }

PROTECTED_AFTER=$(docker inspect -f '{{.Name}}={{.RestartCount}}' ai-phone-staging-agent ai-phone-staging-api ai-phone-staging-gateway livekit-qkxy-livekit-1 livekit-qkxy-redis-1 | sort | sha256sum | awk '{print $1}')
[[ "$PROTECTED_BEFORE" == "$PROTECTED_AFTER" ]] || { echo "protected container restart state changed" >&2; exit 1; }

TMP_REPORT="${REPORT}.tmp"
jq --arg backup "$BACKUP" --arg sha "$BACKUP_SHA" --argjson rtoMs "$RESTORE_MS" --argjson memberCount "$MEMBER_COUNT" \
  '.results.p2_06.backupRestore = {format:"pg_dump-custom",isolatedRestore:true,migrations:11,snapshotTimestampMatched:true,rpo:"captured-snapshot-zero-loss",rtoMs:$rtoMs,sha256:$sha,backupPath:$backup} | .results.p2_06.redisRebuild = {source:"postgres-tenant-members",activeMembers:$memberCount,status:"passed"} | .protectedContainers = {restartCountsUnchanged:true}' \
  "$REPORT" >"$TMP_REPORT"
mv "$TMP_REPORT" "$REPORT"
chmod 600 "$REPORT"

node "$ROOT/tools/p2/cleanup-closure.mjs"
compose exec -T postgres dropdb -U "$YUJIAN_POSTGRES_USER" --if-exists "$RESTORE_DB" >/dev/null
RESTORE_DB=""
trap - EXIT INT TERM
echo "P2-04/05/06 closure acceptance passed: report=$REPORT backup=$BACKUP"
