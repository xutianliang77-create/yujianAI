#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
EVIDENCE_BASE=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
DATA_BASE=${YUJIAN_REMEDIATED_DATA_ROOT:-/data/models/yujianAI/p1-m0-04/remediated-regression}
RUN_ID=${YUJIAN_REMEDIATED_RUN_ID:-p1-m0-04-remediated-regression-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
DATA_ROOT="$DATA_BASE/$RUN_ID"
SUFFIX=${RUN_ID##*-}
SCOPE_SUFFIX=$(printf '%s' "$SUFFIX" | tr '[:upper:]' '[:lower:]')
NETWORK="yujian-p1-remediated-$SUFFIX"
PG_CONTAINER="yujian-p1-pg-$SUFFIX"
REDIS_CONTAINER="yujian-p1-redis-$SUFFIX"
BAO_A="yujian-p1-bao-a-$SUFFIX"
BAO_B="yujian-p1-bao-b-$SUFFIX"
BAO_C="yujian-p1-bao-c-$SUFFIX"
BAO_NODES=("$BAO_A" "$BAO_B" "$BAO_C")

PG_IMAGE=${YUJIAN_POSTGRES_CANDIDATE_IMAGE:-yujian/p1-postgres:16.14-alpine-gosu-go1.25.12}
PG_IMAGE_ID=${YUJIAN_POSTGRES_CANDIDATE_IMAGE_ID:-sha256:290eff57f950a0d306b7f699ea0fa3d7507401749de2d83c006c792104d05d9b}
OPENBAO_OLD_IMAGE=${YUJIAN_OPENBAO_OLD_IMAGE:-openbao/openbao:2.4.1@sha256:06a26f632cd0bdd0fd6e25034f55d68bc28b62590adc8efea3b8dacade11579a}
OPENBAO_IMAGE=${YUJIAN_OPENBAO_CANDIDATE_IMAGE:-yujian/p1-openbao:2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12}
OPENBAO_IMAGE_ID=${YUJIAN_OPENBAO_CANDIDATE_IMAGE_ID:-sha256:5aa72789deee20508c8a4f3ecef56b92f7cfc5f71dc99df3caecb7029a1d66e4}
REDIS_IMAGE=${YUJIAN_REDIS_CANDIDATE_IMAGE:-redis:7.2.14-alpine@sha256:dfa18828cbc07b3ae6a95ec7343f6c214fdee2d836197b4be8e9904420762cd8}
NODE_IMAGE=${YUJIAN_ACCEPTANCE_NODE_IMAGE:-node:24.18.0-bookworm}
PROTECTED_CONTAINERS=(
  yujian-p2-postgres-1
  yujian-p2-redis-1
  yujian-p2-openbao-a-1
  yujian-p2-openbao-b-1
  yujian-p2-openbao-c-1
)

PG_DB=yujian_candidate
PG_USER=yujian_candidate
PG_PASSWORD=$(openssl rand -hex 32)
API_CREDENTIAL=$(openssl rand -hex 32)
ADMIN_CREDENTIAL=$(openssl rand -hex 32)
API_CONTAINER="yujian-p1-api-$SUFFIX"
RESTORE_DB=""

for command in curl docker git jq openssl python3 sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
test -d "$REPO_ROOT/infra/database/migrations" || { echo "migration directory is missing" >&2; exit 2; }
test -f "$REPO_ROOT/tools/p2/production-acceptance.mjs" || { echo "P2 acceptance runner is missing" >&2; exit 2; }

ALLOCATED_PORTS=$(python3 - <<'PY'
import socket
sockets = []
for _ in range(6):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sockets.append(sock)
print(" ".join(str(sock.getsockname()[1]) for sock in sockets))
for sock in sockets:
    sock.close()
PY
)
read -r PG_PORT REDIS_PORT BAO_A_PORT BAO_B_PORT BAO_C_PORT API_PORT <<<"$ALLOCATED_PORTS"
for port in "$PG_PORT" "$REDIS_PORT" "$BAO_A_PORT" "$BAO_B_PORT" "$BAO_C_PORT" "$API_PORT"; do
  [[ "$port" =~ ^[0-9]+$ ]] || { echo "failed to reserve loopback ports" >&2; exit 2; }
done

mkdir -p "$RUN_ROOT/source" "$DATA_ROOT/postgres" "$DATA_ROOT/redis" \
  "$DATA_ROOT/openbao-a" "$DATA_ROOT/openbao-b" "$DATA_ROOT/openbao-c" \
  "$DATA_ROOT/tls" "$DATA_ROOT/config" "$DATA_ROOT/runtime/p2/data-rights"
chmod 0700 "$RUN_ROOT" "$RUN_ROOT/source" "$DATA_ROOT" "$DATA_ROOT"/*
exec > >(tee "$RUN_ROOT/acceptance.log") 2>&1

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  for container in "$API_CONTAINER" "$PG_CONTAINER" "$REDIS_CONTAINER" "${BAO_NODES[@]}"; do
    docker rm -f "$container" >/dev/null 2>&1 || true
  done
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  if [[ "$code" -ne 0 ]]; then
    printf 'status=failed\nexit_code=%s\n' "$code" >"$RUN_ROOT/failure.txt"
  fi
  find "$RUN_ROOT" -type d -exec chmod 0700 {} +
  find "$RUN_ROOT" -type f -exec chmod 0600 {} +
  exit "$code"
}
trap cleanup EXIT INT TERM

capture_protected() {
  local output=$1 temporary="$RUN_ROOT/protected.jsonl"
  : >"$temporary"
  for container in "${PROTECTED_CONTAINERS[@]}"; do
    docker inspect "$container" --format \
      '{"name":{{json .Name}},"containerId":{{json .Id}},"imageId":{{json .Image}},"restartCount":{{.RestartCount}},"state":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}}}' \
      >>"$temporary"
  done
  jq -s 'sort_by(.name)' "$temporary" >"$output"
  rm -f "$temporary"
}

assert_protected_healthy() {
  jq -e 'length == 5 and all(.[]; .state == "running" and .health == "healthy")' "$1" >/dev/null
}

wait_pg() {
  for _ in $(seq 1 60); do
    if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$PG_CONTAINER" >&2 || true
  echo "candidate PostgreSQL did not become ready" >&2
  return 1
}

start_pg() {
  docker run -d --name "$PG_CONTAINER" --restart no --network "$NETWORK" \
    --label ai.yujian.task=P1-M0-04 --label "ai.yujian.run=$RUN_ID" \
    -p "127.0.0.1:$PG_PORT:5432" \
    -e POSTGRES_DB="$PG_DB" -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e PGDATA=/var/lib/postgresql/data/pgdata \
    -v "$DATA_ROOT/postgres:/var/lib/postgresql/data" "$PG_IMAGE" >/dev/null
  wait_pg
}

wait_redis() {
  for _ in $(seq 1 60); do
    if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then return 0; fi
    sleep 1
  done
  docker logs "$REDIS_CONTAINER" >&2 || true
  echo "candidate Redis did not become ready" >&2
  return 1
}

start_redis() {
  docker run -d --name "$REDIS_CONTAINER" --restart no --network "$NETWORK" \
    --label ai.yujian.task=P1-M0-04 --label "ai.yujian.run=$RUN_ID" \
    -p "127.0.0.1:$REDIS_PORT:6379" -v "$DATA_ROOT/redis:/data" "$REDIS_IMAGE" \
    redis-server --appendonly yes --appendfsync always >/dev/null
  wait_redis
}

bao_status() {
  docker exec -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt \
    "$1" bao status -format=json 2>/dev/null || true
}

wait_bao() {
  local node=$1 status
  for _ in $(seq 1 60); do
    status=$(bao_status "$node")
    if jq -e '.initialized == true or .initialized == false' <<<"$status" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$node" >&2 || true
  echo "OpenBao node did not become reachable: $node" >&2
  return 1
}

bao_exec() {
  local node=$1
  shift
  docker exec -i -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt "$node" bao "$@"
}

bao_exec_token() {
  local node=$1 token=$2
  shift 2
  docker exec -i -e BAO_ADDR=https://127.0.0.1:8200 -e BAO_CACERT=/openbao/tls/ca.crt \
    -e BAO_TOKEN="$token" "$node" bao "$@"
}

start_bao_node() {
  local node=$1 image=$2 alias data_name config_name host_port
  case "$node" in
    "$BAO_A") alias=openbao-a; data_name=openbao-a; config_name=openbao-a.hcl; host_port=$BAO_A_PORT ;;
    "$BAO_B") alias=openbao-b; data_name=openbao-b; config_name=openbao-b.hcl; host_port=$BAO_B_PORT ;;
    "$BAO_C") alias=openbao-c; data_name=openbao-c; config_name=openbao-c.hcl; host_port=$BAO_C_PORT ;;
    *) echo "unknown OpenBao node: $node" >&2; return 2 ;;
  esac
  docker run -d --name "$node" --hostname "$alias" --network "$NETWORK" --network-alias "$alias" \
    --restart no --label ai.yujian.task=P1-M0-04 --label "ai.yujian.run=$RUN_ID" \
    -p "127.0.0.1:$host_port:8200" \
    -v "$DATA_ROOT/$data_name:/openbao/data" \
    -v "$DATA_ROOT/config/$config_name:/openbao/config.hcl:ro" \
    -v "$DATA_ROOT/tls/ca.crt:/openbao/tls/ca.crt:ro" \
    -v "$DATA_ROOT/tls/server.crt:/openbao/tls/server.crt:ro" \
    -v "$DATA_ROOT/tls/server.key:/openbao/tls/server.key:ro" \
    "$image" server -config=/openbao/config.hcl >/dev/null
  wait_bao "$node"
}

unseal_node() {
  local node=$1 status
  status=$(bao_status "$node")
  if [[ $(jq -r '.sealed // false' <<<"$status") == true ]]; then
    bao_exec "$node" operator unseal "$UNSEAL_KEY" >/dev/null
  fi
  for _ in $(seq 1 30); do
    status=$(bao_status "$node")
    if jq -e '.initialized == true and .sealed == false' <<<"$status" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "OpenBao node did not become unsealed: $node" >&2
  return 1
}

peer_summary() {
  local peers
  for node in "${BAO_NODES[@]}"; do
    if peers=$(bao_exec_token "$node" "$ROOT_TOKEN" operator raft list-peers -format=json 2>/dev/null); then
      jq '{peers:(.data.config.servers | length),voters:([.data.config.servers[] | select(.voter == true)] | length)}' <<<"$peers"
      return 0
    fi
  done
  echo "unable to read OpenBao peers" >&2
  return 1
}

wait_three_voters() {
  local summary
  for _ in $(seq 1 60); do
    summary=$(peer_summary 2>/dev/null || true)
    if jq -e '.peers == 3 and .voters == 3' <<<"$summary" >/dev/null 2>&1; then
      printf '%s\n' "$summary"
      return 0
    fi
    sleep 1
  done
  echo "OpenBao did not reach three Raft voters" >&2
  return 1
}

active_bao_node() {
  local status
  for _ in $(seq 1 60); do
    for node in "${BAO_NODES[@]}"; do
      status=$(bao_status "$node")
      if jq -e '.is_self == true and .sealed == false' <<<"$status" >/dev/null 2>&1; then
        printf '%s\n' "$node"
        return 0
      fi
    done
    sleep 1
  done
  echo "OpenBao active node not found" >&2
  return 1
}

prepare_tls_and_configs() {
  local tls="$DATA_ROOT/tls" config="$DATA_ROOT/config"
  openssl genrsa -out "$tls/ca.key" 4096 >/dev/null 2>&1
  openssl req -x509 -new -nodes -key "$tls/ca.key" -sha256 -days 30 -out "$tls/ca.crt" \
    -subj "/CN=Yujian P1 Candidate Regression CA" >/dev/null 2>&1
  openssl req -new -newkey rsa:2048 -nodes -keyout "$tls/server.key" -out "$tls/server.csr" \
    -subj "/CN=openbao-a" >/dev/null 2>&1
  openssl x509 -req -in "$tls/server.csr" -CA "$tls/ca.crt" -CAkey "$tls/ca.key" -CAcreateserial \
    -out "$tls/server.crt" -days 30 -sha256 \
    -extfile <(printf '%s\n' 'basicConstraints=CA:FALSE' 'keyUsage=digitalSignature,keyEncipherment' \
      'subjectAltName=DNS:openbao-a,DNS:openbao-b,DNS:openbao-c,DNS:localhost,IP:127.0.0.1') >/dev/null 2>&1
  rm -f "$tls/server.csr" "$tls/ca.srl"
  chmod 0600 "$tls/ca.key"
  chmod 0644 "$tls/ca.crt" "$tls/server.crt" "$tls/server.key"

  for node in a b c; do
    cat >"$config/openbao-$node.hcl" <<EOF
ui = false
disable_mlock = true
storage "raft" {
  path = "/openbao/data"
  node_id = "openbao-$node"
}
listener "tcp" {
  address = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file = "/openbao/tls/server.crt"
  tls_key_file = "/openbao/tls/server.key"
  tls_client_ca_file = "/openbao/tls/ca.crt"
}
api_addr = "https://openbao-$node:8200"
cluster_addr = "https://openbao-$node:8201"
EOF
    chmod 0644 "$config/openbao-$node.hcl"
  done

  for path in postgres redis openbao-a openbao-b openbao-c; do
    image=$PG_IMAGE
    service_user=postgres
    [[ "$path" == redis ]] && { image=$REDIS_IMAGE; service_user=redis; }
    [[ "$path" == openbao-* ]] && { image=$OPENBAO_OLD_IMAGE; service_user=openbao; }
    uid=$(docker run --rm --entrypoint /bin/sh "$image" -c "id -u $service_user")
    gid=$(docker run --rm --entrypoint /bin/sh "$image" -c "id -g $service_user")
    [[ "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ ]] || { echo "invalid service UID/GID for $path" >&2; return 2; }
    docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT/$path:/data" "$image" \
      -c "chown -R $uid:$gid /data && chmod 700 /data" >/dev/null
  done
}

apply_migrations() {
  docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -q \
    -c 'CREATE TABLE IF NOT EXISTS yujian_schema_migrations (migration_id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
  while IFS= read -r migration; do
    local name id applied
    name=$(basename "$migration")
    id=${name%.sql}
    applied=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atqc \
      "SELECT count(*) FROM yujian_schema_migrations WHERE migration_id='$id'")
    if [[ "$applied" == 0 ]]; then
      { printf 'BEGIN;\n'; sed '$a\' "$migration"; printf "INSERT INTO yujian_schema_migrations (migration_id) VALUES ('%s');\nCOMMIT;\n" "$id"; } \
        | docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -q
    fi
  done < <(find "$REPO_ROOT/infra/database/migrations" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' | sort)
  [[ $(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atqc 'SELECT count(*) FROM yujian_schema_migrations') == 11 ]]
}

start_api() {
  local credentials
  credentials=$(jq -cn --arg tenant "$YUJIAN_P2_TENANT_ID" --arg project "$YUJIAN_P2_PROJECT_ID" \
    --arg environment "$YUJIAN_P2_ENVIRONMENT_ID" --arg credential "$API_CREDENTIAL" \
    '[{tenantId:$tenant,projectId:$project,environmentId:$environment,credential:$credential,scopes:["*"]}]')
  docker run -d --name "$API_CONTAINER" --network host --restart no \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$REPO_ROOT:$REPO_ROOT:ro" -v "$DATA_ROOT:$DATA_ROOT" -v "$RUN_ROOT:$RUN_ROOT" \
    -w "$REPO_ROOT" \
    -e NODE_ENV=production -e PLATFORM_API_HOST=127.0.0.1 -e PLATFORM_API_PORT="$API_PORT" \
    -e LIVEKIT_URL=ws://127.0.0.1:1 -e LIVEKIT_API_KEY=p1-candidate-regression \
    -e LIVEKIT_API_SECRET="candidate-$(openssl rand -hex 32)" \
    -e YUJIAN_PLATFORM_RUNTIME_MODULE="$REPO_ROOT/infra/p2/runtime/platform-runtime.mjs" \
    -e YUJIAN_PLATFORM_CREDENTIALS_JSON="$credentials" -e YUJIAN_PLATFORM_ADMIN_CREDENTIAL="$ADMIN_CREDENTIAL" \
    -e YUJIAN_API_KEY_GRACE_MS=300000 \
    -e YUJIAN_DATABASE_URL -e YUJIAN_REDIS_URL -e YUJIAN_KMS_ADDR -e YUJIAN_KMS_TOKEN \
    -e YUJIAN_DATA_ROOT -e NODE_EXTRA_CA_CERTS "$NODE_IMAGE" \
    node "$REPO_ROOT/services/platform-api/dist/main.js" >/dev/null
  for _ in $(seq 1 60); do
    if curl -fsS "$YUJIAN_PLATFORM_BASE_URL/healthz" >/dev/null 2>&1; then return 0; fi
    if [[ $(docker inspect "$API_CONTAINER" --format '{{.State.Running}}') != true ]]; then docker logs "$API_CONTAINER" >&2; return 1; fi
    sleep 1
  done
  docker logs "$API_CONTAINER" >&2 || true
  return 1
}

stop_api() {
  if docker inspect "$API_CONTAINER" >/dev/null 2>&1; then
    docker logs "$API_CONTAINER" >>"$RUN_ROOT/platform-api.log" 2>&1 || true
    docker rm -f "$API_CONTAINER" >/dev/null
  fi
}

node_run() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$REPO_ROOT:$REPO_ROOT:ro" -v "$DATA_ROOT:$DATA_ROOT" -v "$RUN_ROOT:$RUN_ROOT" \
    -w "$REPO_ROOT" \
    -e YUJIAN_DATABASE_URL -e YUJIAN_REDIS_URL -e YUJIAN_KMS_ADDR -e YUJIAN_KMS_TOKEN \
    -e YUJIAN_KMS_ADMIN_TOKEN -e YUJIAN_DATA_ROOT -e YUJIAN_P2_REPORT \
    -e YUJIAN_P2_TENANT_ID -e YUJIAN_P2_PROJECT_ID -e YUJIAN_P2_ENVIRONMENT_ID \
    -e YUJIAN_P2_API_CREDENTIAL -e YUJIAN_PLATFORM_BASE_URL -e NODE_EXTRA_CA_CERTS \
    -e YUJIAN_P2_PHASE -e YUJIAN_P2_DEFER_KMS_DELETE -e YUJIAN_P2_CLEANUP \
    "$NODE_IMAGE" node "$@"
}

npm_build() {
  docker run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$REPO_ROOT:$REPO_ROOT" -w "$REPO_ROOT" "$NODE_IMAGE" npm --prefix "$REPO_ROOT" run build -w "$1"
}

echo "run_id=$RUN_ID"
echo "data_root=$DATA_ROOT"
capture_protected "$RUN_ROOT/protected-before.json"
assert_protected_healthy "$RUN_ROOT/protected-before.json"

[[ $(docker image inspect "$PG_IMAGE" --format '{{.Id}}') == "$PG_IMAGE_ID" ]] || { echo "PostgreSQL image ID mismatch" >&2; exit 3; }
[[ $(docker image inspect "$OPENBAO_IMAGE" --format '{{.Id}}') == "$OPENBAO_IMAGE_ID" ]] || { echo "OpenBao image ID mismatch" >&2; exit 3; }
docker image inspect "$NODE_IMAGE" >/dev/null
PG_REGISTRY=$(docker image inspect "$PG_IMAGE" --format '{{index .RepoDigests 0}}')
OPENBAO_REGISTRY=$(docker image inspect "$OPENBAO_IMAGE" --format '{{index .RepoDigests 0}}')

cp "${BASH_SOURCE[0]}" "$RUN_ROOT/source/run-remediated-production-regression.sh"
cp "$REPO_ROOT/tools/p2/production-acceptance.mjs" "$RUN_ROOT/source/production-acceptance.mjs"
cp "$REPO_ROOT/tools/p2/restart-acceptance.mjs" "$RUN_ROOT/source/restart-acceptance.mjs"
cp "$REPO_ROOT/tools/p2/kms-failover-acceptance.mjs" "$RUN_ROOT/source/kms-failover-acceptance.mjs"
cp "$REPO_ROOT/tools/p2/kms-cleanup.mjs" "$RUN_ROOT/source/kms-cleanup.mjs"

docker network create "$NETWORK" >/dev/null
prepare_tls_and_configs
echo "stage=dependencies-start"
start_pg
start_redis
apply_migrations

echo "stage=openbao-2.4-fixture"
for node in "${BAO_NODES[@]}"; do start_bao_node "$node" "$OPENBAO_OLD_IMAGE"; done
bao_exec "$BAO_A" operator init -key-shares=1 -key-threshold=1 -format=json >"$RUN_ROOT/openbao-init.json"
UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' "$RUN_ROOT/openbao-init.json")
ROOT_TOKEN=$(jq -r '.root_token' "$RUN_ROOT/openbao-init.json")
[[ -n "$UNSEAL_KEY" && "$UNSEAL_KEY" != null && -n "$ROOT_TOKEN" && "$ROOT_TOKEN" != null ]]
unseal_node "$BAO_A"
for node in "$BAO_B" "$BAO_C"; do
  bao_exec "$node" operator raft join -leader-ca-cert=@/openbao/tls/ca.crt \
    -tls-server-name=openbao-a https://openbao-a:8200 >/dev/null
  unseal_node "$node"
done
OLD_PEERS=$(wait_three_voters)
bao_exec_token "$BAO_A" "$ROOT_TOKEN" secrets enable -path=kv kv-v2 >/dev/null
bao_exec_token "$BAO_A" "$ROOT_TOKEN" secrets enable transit >/dev/null
bao_exec_token "$BAO_A" "$ROOT_TOKEN" write -f transit/keys/yujian-api-key-regression type=ecdsa-p256 exportable=false >/dev/null
bao_exec_token "$BAO_A" "$ROOT_TOKEN" policy write yujian-runtime - <<'POLICY' >/dev/null
path "kv/data/yujian/*" {
  capabilities = ["read"]
}
POLICY
RUNTIME_TOKEN=$(bao_exec_token "$BAO_A" "$ROOT_TOKEN" token create -policy=yujian-runtime -period=24h -format=json | jq -r '.auth.client_token')
MARKER_VALUE=$(openssl rand -base64 32 | tr -d '\n')
bao_exec_token "$BAO_A" "$ROOT_TOKEN" kv put kv/yujian/p1/candidate value="$MARKER_VALUE" >/dev/null
TRANSIT_INPUT=$(printf '%s' "$RUN_ID" | openssl base64 -A)
TRANSIT_SIGNATURE=$(bao_exec_token "$BAO_A" "$ROOT_TOKEN" write -field=signature \
  transit/sign/yujian-api-key-regression/sha2-256 input="$TRANSIT_INPUT")
bao_exec_token "$BAO_A" "$ROOT_TOKEN" operator raft snapshot save /openbao/data/pre-upgrade.snap
docker cp "$BAO_A:/openbao/data/pre-upgrade.snap" "$RUN_ROOT/pre-upgrade.snap"
SNAPSHOT_SHA=sha256:$(sha256sum "$RUN_ROOT/pre-upgrade.snap" | awk '{print $1}')

echo "stage=openbao-rolling-upgrade"
for node in "${BAO_NODES[@]}"; do
  docker rm -f "$node" >/dev/null
  start_bao_node "$node" "$OPENBAO_IMAGE"
  unseal_node "$node"
  wait_three_voters >/dev/null
done
UPGRADED_PEERS=$(wait_three_voters)
for node in "${BAO_NODES[@]}"; do
  jq -e '.version == "2.5.4-yujian.2" and .sealed == false' <<<"$(bao_status "$node")" >/dev/null
done
ACTIVE_BAO=$(active_bao_node)
[[ $(bao_exec_token "$ACTIVE_BAO" "$RUNTIME_TOKEN" kv get -field=value kv/yujian/p1/candidate) == "$MARKER_VALUE" ]]
bao_exec_token "$ACTIVE_BAO" "$ROOT_TOKEN" write -format=json transit/verify/yujian-api-key-regression/sha2-256 \
  input="$TRANSIT_INPUT" signature="$TRANSIT_SIGNATURE" | jq -e '.data.valid == true' >/dev/null

bao_exec_token "$ACTIVE_BAO" "$ROOT_TOKEN" kv put kv/yujian/p1/candidate value=post-upgrade-mutation >/dev/null
echo "stage=openbao-snapshot-restore"
docker cp "$RUN_ROOT/pre-upgrade.snap" "$ACTIVE_BAO:/openbao/data/pre-upgrade.snap"
bao_exec_token "$ACTIVE_BAO" "$ROOT_TOKEN" operator raft snapshot restore -force /openbao/data/pre-upgrade.snap >/dev/null
for _ in $(seq 1 60); do
  ready=true
  for node in "${BAO_NODES[@]}"; do
    if ! jq -e '.initialized == true' <<<"$(bao_status "$node")" >/dev/null 2>&1; then ready=false; fi
  done
  [[ "$ready" == true ]] && break
  sleep 1
done
for node in "${BAO_NODES[@]}"; do unseal_node "$node"; done
RESTORED_PEERS=$(wait_three_voters)
ACTIVE_BAO=$(active_bao_node)
[[ $(bao_exec_token "$ACTIVE_BAO" "$RUNTIME_TOKEN" kv get -field=value kv/yujian/p1/candidate) == "$MARKER_VALUE" ]]

for port in "$BAO_A_PORT" "$BAO_B_PORT" "$BAO_C_PORT"; do
  [[ $(curl -sS --cacert "$DATA_ROOT/tls/ca.crt" -o /dev/null -w '%{ssl_verify_result}' \
    "https://127.0.0.1:$port/v1/sys/health?standbyok=true&perfstandbyok=true") == 0 ]]
done

export YUJIAN_DATABASE_URL="postgresql://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$PG_DB?sslmode=disable"
export YUJIAN_REDIS_URL="redis://127.0.0.1:$REDIS_PORT"
export YUJIAN_KMS_ADDR="https://127.0.0.1:$BAO_A_PORT,https://127.0.0.1:$BAO_B_PORT,https://127.0.0.1:$BAO_C_PORT"
export YUJIAN_KMS_TOKEN="$RUNTIME_TOKEN"
export YUJIAN_KMS_ADMIN_TOKEN="$ROOT_TOKEN"
export YUJIAN_KMS_CA_FILE="$DATA_ROOT/tls/ca.crt"
export NODE_EXTRA_CA_CERTS="$DATA_ROOT/tls/ca.crt"
export YUJIAN_DATA_ROOT="$DATA_ROOT/runtime"
export YUJIAN_P2_REPORT="$RUN_ROOT/platform-acceptance.json"
export YUJIAN_P2_TENANT_ID="p1-candidate-tenant-$SCOPE_SUFFIX"
export YUJIAN_P2_PROJECT_ID="p1-candidate-project-$SCOPE_SUFFIX"
export YUJIAN_P2_ENVIRONMENT_ID="p1-candidate-env-$SCOPE_SUFFIX"
export YUJIAN_P2_API_CREDENTIAL="$API_CREDENTIAL"
export YUJIAN_PLATFORM_BASE_URL="http://127.0.0.1:$API_PORT"

npm_build @yujian/platform-contracts >"$RUN_ROOT/build.log" 2>&1
npm_build @yujian/platform-adapters >>"$RUN_ROOT/build.log" 2>&1
npm_build @yujian/data-rights >>"$RUN_ROOT/build.log" 2>&1
npm_build @yujian/platform-api >>"$RUN_ROOT/build.log" 2>&1
echo "stage=platform-production-acceptance"
YUJIAN_P2_PHASE=prepare YUJIAN_P2_DEFER_KMS_DELETE=true node_run "$REPO_ROOT/tools/p2/production-acceptance.mjs"
start_api
YUJIAN_P2_PHASE=api YUJIAN_P2_DEFER_KMS_DELETE=true node_run "$REPO_ROOT/tools/p2/production-acceptance.mjs"
stop_api

OUTBOX_ID=$(jq -r '.cleanup.outboxId' "$YUJIAN_P2_REPORT")
AUDIT_ID=$(jq -r '.cleanup.auditId' "$YUJIAN_P2_REPORT")
USAGE_ID=$(jq -r '.cleanup.usageId' "$YUJIAN_P2_REPORT")
API_KEY_ID=$(jq -r '.cleanup.apiKeyId' "$YUJIAN_P2_REPORT")
BACKUP="$RUN_ROOT/postgres.dump"
echo "stage=postgres-backup-restore"
START_MS=$(date +%s%3N)
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc >"$BACKUP"
BACKUP_SHA=sha256:$(sha256sum "$BACKUP" | awk '{print $1}')
RESTORE_DB="yujian_restore_$SCOPE_SUFFIX"
docker exec "$PG_CONTAINER" createdb -U "$PG_USER" "$RESTORE_DB"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$RESTORE_DB" --exit-on-error <"$BACKUP"
RESTORE_MS=$(( $(date +%s%3N) - START_MS ))
RESTORE_RESULT=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$RESTORE_DB" -At \
  -v outbox_id="$OUTBOX_ID" -v audit_id="$AUDIT_ID" -v usage_id="$USAGE_ID" -v api_key_id="$API_KEY_ID" <<'SQL'
SELECT json_build_object(
  'migrations', (SELECT count(*) FROM yujian_schema_migrations),
  'outbox', (SELECT count(*) FROM outbox_events WHERE event_id = :'outbox_id'),
  'audit', (SELECT count(*) FROM audit_events WHERE audit_event_id = :'audit_id'),
  'usage', (SELECT count(*) FROM usage_records WHERE usage_record_id = :'usage_id'),
  'apiKeyRevoked', (SELECT snapshot->'apiKeys' @> jsonb_build_array(jsonb_build_object('apiKeyId', :'api_key_id', 'status', 'revoked')) FROM platform_store_snapshots WHERE snapshot_id='default')
);
SQL
)
jq -e '.migrations == 11 and .outbox == 1 and .audit == 1 and .usage == 1 and .apiKeyRevoked == true' <<<"$RESTORE_RESULT" >/dev/null
docker exec "$PG_CONTAINER" dropdb -U "$PG_USER" "$RESTORE_DB"
RESTORE_DB=""

LEADER=""
for node in "${BAO_NODES[@]}"; do
  if [[ $(jq -r '.is_self // false' <<<"$(bao_status "$node")") == true ]]; then LEADER=$node; break; fi
done
[[ -n "$LEADER" ]] || { echo "OpenBao leader not found" >&2; exit 4; }
echo "stage=openbao-leader-failover"
docker stop "$LEADER" >/dev/null
for _ in $(seq 1 60); do
  if node_run "$REPO_ROOT/tools/p2/kms-failover-acceptance.mjs" >"$RUN_ROOT/kms-failover.log" 2>&1; then break; fi
  sleep 1
done
grep -q 'failover-read-verified' "$RUN_ROOT/kms-failover.log"
docker start "$LEADER" >/dev/null
wait_bao "$LEADER"
unseal_node "$LEADER"
wait_three_voters >/dev/null

start_api
echo "stage=persistence-before-rebuild"
YUJIAN_P2_CLEANUP=false node_run "$REPO_ROOT/tools/p2/restart-acceptance.mjs" >"$RUN_ROOT/restart-before-rebuild.json"
stop_api

docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null
start_pg
start_redis
export YUJIAN_DATABASE_URL="postgresql://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$PG_DB?sslmode=disable"
export YUJIAN_REDIS_URL="redis://127.0.0.1:$REDIS_PORT"
[[ $(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atqc 'SELECT count(*) FROM yujian_schema_migrations') == 11 ]]
start_api
echo "stage=persistence-after-rebuild"
YUJIAN_P2_CLEANUP=true node_run "$REPO_ROOT/tools/p2/restart-acceptance.mjs" >"$RUN_ROOT/restart-after-rebuild.json"
stop_api
node_run "$REPO_ROOT/tools/p2/kms-cleanup.mjs" >"$RUN_ROOT/kms-cleanup.json"

capture_protected "$RUN_ROOT/protected-after.json"
assert_protected_healthy "$RUN_ROOT/protected-after.json"
cmp -s "$RUN_ROOT/protected-before.json" "$RUN_ROOT/protected-after.json" || { echo "protected P2 runtime changed" >&2; exit 5; }

REPO_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)
RUNNER_SHA=sha256:$(sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}')
PLATFORM_SHA=sha256:$(sha256sum "$YUJIAN_P2_REPORT" | awk '{print $1}')
jq -n \
  --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg runRoot "$RUN_ROOT" --arg dataRoot "$DATA_ROOT" --arg repoCommit "$REPO_COMMIT" \
  --arg runnerSha "$RUNNER_SHA" --arg platformSha "$PLATFORM_SHA" \
  --arg pgImage "$PG_IMAGE" --arg pgImageId "$PG_IMAGE_ID" --arg pgRegistry "$PG_REGISTRY" \
  --arg baoImage "$OPENBAO_IMAGE" --arg baoImageId "$OPENBAO_IMAGE_ID" --arg baoRegistry "$OPENBAO_REGISTRY" \
  --arg oldBaoImage "$OPENBAO_OLD_IMAGE" --arg snapshotSha "$SNAPSHOT_SHA" \
  --arg backupSha "$BACKUP_SHA" --argjson restoreMs "$RESTORE_MS" \
  --argjson oldPeers "$OLD_PEERS" --argjson upgradedPeers "$UPGRADED_PEERS" --argjson restoredPeers "$RESTORED_PEERS" \
  --slurpfile platform "$YUJIAN_P2_REPORT" --slurpfile protectedBefore "$RUN_ROOT/protected-before.json" \
  --slurpfile protectedAfter "$RUN_ROOT/protected-after.json" \
  '{
    schemaVersion:1,
    taskId:"P1-M0-04-REMEDIATED-PRODUCTION-REGRESSION",
    runId:$runId,
    generatedAt:$generatedAt,
    status:"passed",
    deploymentAllowed:false,
    environment:{server:"beelink",platform:"linux/amd64",runRoot:$runRoot,dataRoot:$dataRoot},
    source:{repositoryCommit:$repoCommit,runnerSha256:$runnerSha,platformAcceptanceSha256:$platformSha},
    postgres:{candidate:{image:$pgImage,localImageId:$pgImageId,registryReference:$pgRegistry},migrations:11,
      transaction:$platform[0].results.postgres.transaction,outbox:$platform[0].results.postgres.outbox,
      cas:$platform[0].results.postgres.cas,backup:{format:"pg_dump-custom",sha256:$backupSha,isolatedRestore:true,rtoMs:$restoreMs,
      restoredMigrations:11,restoredOutbox:true,restoredAudit:true,restoredUsage:true,restoredRevokedApiKey:true},
      persistence:{containerDeleteRecreate:true}},
    openbao:{fromImage:$oldBaoImage,candidate:{image:$baoImage,localImageId:$baoImageId,registryReference:$baoRegistry},
      rollingUpgrade:"2.4.1-to-2.5.4-yujian.2",versions:["2.5.4-yujian.2","2.5.4-yujian.2","2.5.4-yujian.2"],
      tls:{verified:true,loopbackOnly:true},raft:{before:$oldPeers,afterUpgrade:$upgradedPeers,afterRestore:$restoredPeers,
      snapshotSha256:$snapshotSha,restoreVerified:true},transitSignatureVerified:true,
      failover:$platform[0].results.kms.failover,secretBoundary:$platform[0].results.kms.secretBoundary,
      apiKey:$platform[0].results.apiKey},
    redisDependency:{candidatePersistenceRebuild:true,results:$platform[0].results.redis},
    isolation:{currentRuntimeSwitched:false,candidateContainersRemovedOnExit:true,protectedBefore:$protectedBefore[0],protectedAfter:$protectedAfter[0]},
    gate:{candidateRegression:"passed",registryPromotion:"not-authorized",runtimeSwitch:"not-authorized",productionRelease:"blocked"}
  }' >"$RUN_ROOT/report.json"

find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq '{runId,status,postgres:{migrations:.postgres.migrations,transaction:.postgres.transaction,outbox:.postgres.outbox,cas:.postgres.cas,backup:.postgres.backup,persistence:.postgres.persistence},openbao:{rollingUpgrade:.openbao.rollingUpgrade,tls:.openbao.tls,raft:.openbao.raft,transitSignatureVerified:.openbao.transitSignatureVerified,failover:.openbao.failover,apiKey:.openbao.apiKey},isolation:{currentRuntimeSwitched:.isolation.currentRuntimeSwitched,candidateContainersRemovedOnExit:.isolation.candidateContainersRemovedOnExit},gate}' "$RUN_ROOT/report.json"
