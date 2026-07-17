#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
ENV_FILE=${YUJIAN_P2_ENV_FILE:?YUJIAN_P2_ENV_FILE must point to the protected runtime env file}
COMPOSE_FILE="$ROOT/infra/p2/beelink/compose.yaml"

: "${PGUSER:?PGUSER must be set by the migration runner}"
: "${PGPASSWORD:?PGPASSWORD must be set by the migration runner}"
: "${PGDATABASE:?PGDATABASE must be set by the migration runner}"

sed "s|${ROOT}/infra/database/migrations/|/yujian-migrations/|g" | docker compose --project-name yujian-p2 --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGUSER="$PGUSER" -e PGPASSWORD="$PGPASSWORD" -e PGDATABASE="$PGDATABASE" \
  postgres psql "$@"
