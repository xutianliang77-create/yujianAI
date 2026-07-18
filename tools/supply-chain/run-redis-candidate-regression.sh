#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
EVIDENCE_BASE=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
DATA_BASE=${YUJIAN_REDIS_CANDIDATE_DATA_ROOT:-/data/models/yujianAI/p1-m0-04/redis-candidate}
IMAGE=${YUJIAN_REDIS_CANDIDATE_IMAGE:-redis:7.2.14-alpine@sha256:dfa18828cbc07b3ae6a95ec7343f6c214fdee2d836197b4be8e9904420762cd8}
EXPECTED_IMAGE_ID=${YUJIAN_REDIS_CANDIDATE_IMAGE_ID:-sha256:b6636bae9624cba73c69fc9d21318151217a103a1db600b8012db8c460785c26}
P2_CONTAINER=${YUJIAN_P2_REDIS_CONTAINER:-yujian-p2-redis-1}
RUN_ID=${YUJIAN_REDIS_CANDIDATE_RUN_ID:-p1-m0-04-redis-regression-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
DATA_ROOT="$DATA_BASE/$RUN_ID"
CONTAINER="yujian-p1-redis-candidate-${RUN_ID##*-}"
NODE_RUNNER="$REPO_ROOT/tools/supply-chain/redis-candidate-regression.mjs"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

for command in docker git jq node npm sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
[[ "$IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "candidate image must be digest-pinned" >&2; exit 2; }
test -f "$NODE_RUNNER" || { echo "missing Node regression runner" >&2; exit 2; }
docker inspect "$P2_CONTAINER" >/dev/null 2>&1 || { echo "protected P2 Redis container is missing" >&2; exit 2; }
if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER"; then
  echo "candidate container name already exists: $CONTAINER" >&2
  exit 2
fi

mkdir -p "$RUN_ROOT" "$DATA_ROOT"
chmod 0700 "$RUN_ROOT" "$DATA_ROOT"
exec > >(tee "$RUN_ROOT/acceptance.log") 2>&1

cleanup() {
  local code=$?
  trap - EXIT
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [[ -d "$DATA_ROOT" ]]; then
    docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT:/data" "$IMAGE" \
      -c "chown -R $HOST_UID:$HOST_GID /data && chmod -R u+rwX,go-rwx /data" >/dev/null 2>&1 || true
  fi
  if [[ "$code" -ne 0 ]]; then
    printf 'status=failed\nexit_code=%s\n' "$code" >"$RUN_ROOT/failure.txt"
  fi
  find "$RUN_ROOT" -type d -exec chmod 0700 {} +
  find "$RUN_ROOT" -type f -exec chmod 0600 {} +
  exit "$code"
}
trap cleanup EXIT

capture_protected() {
  local output=$1 image id state health restarts
  image=$(docker inspect "$P2_CONTAINER" --format '{{.Config.Image}}')
  id=$(docker inspect "$P2_CONTAINER" --format '{{.Id}}')
  state=$(docker inspect "$P2_CONTAINER" --format '{{.State.Status}}')
  health=$(docker inspect "$P2_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
  restarts=$(docker inspect "$P2_CONTAINER" --format '{{.RestartCount}}')
  jq -n --arg name "$P2_CONTAINER" --arg image "$image" --arg id "$id" \
    --arg state "$state" --arg health "$health" --argjson restarts "$restarts" \
    '{name:$name,image:$image,containerId:$id,state:$state,health:$health,restartCount:$restarts}' >"$output"
}

wait_healthy() {
  local attempt health
  for attempt in $(seq 1 40); do
    health=$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
    [[ "$health" == "healthy" ]] && return 0
    [[ "$health" == "unhealthy" ]] && break
    sleep 1
  done
  docker logs "$CONTAINER" >&2 || true
  echo "candidate Redis health check failed" >&2
  return 1
}

start_candidate() {
  docker run -d --name "$CONTAINER" --restart no \
    --label ai.yujian.task=P1-M0-04 --label "ai.yujian.run=$RUN_ID" \
    --memory 512m --cpus 1 --pids-limit 256 \
    -p 127.0.0.1::6379 -v "$DATA_ROOT:/data" \
    --health-cmd 'redis-cli ping | grep -q PONG' --health-interval 1s \
    --health-timeout 2s --health-retries 30 --health-start-period 2s \
    "$IMAGE" redis-server --appendonly yes --appendfsync always >/dev/null
  wait_healthy
}

run_phase() {
  local phase=$1 cleanup_phase=${2:-false} port report
  port=$(docker port "$CONTAINER" 6379/tcp | sed -n 's/.*://p' | head -n 1)
  [[ "$port" =~ ^[0-9]+$ ]] || { echo "candidate Redis loopback port is invalid" >&2; return 1; }
  report="$RUN_ROOT/$phase.json"
  YUJIAN_REDIS_CANDIDATE_URL="redis://127.0.0.1:$port" \
  YUJIAN_REDIS_CANDIDATE_RUN_ID="$RUN_ID" \
  YUJIAN_REDIS_CANDIDATE_PHASE="$phase" \
  YUJIAN_REDIS_CANDIDATE_REPORT="$report" \
  YUJIAN_REDIS_CANDIDATE_CLEANUP="$cleanup_phase" \
    node "$NODE_RUNNER"
}

echo "run_id=$RUN_ID"
echo "candidate_image=$IMAGE"
capture_protected "$RUN_ROOT/protected-before.json"
jq -e '.state == "running" and .health == "healthy" and .restartCount == 0' "$RUN_ROOT/protected-before.json" >/dev/null

actual_image_id=$(docker image inspect "$IMAGE" --format '{{.Id}}')
[[ "$actual_image_id" == "$EXPECTED_IMAGE_ID" ]] || { echo "candidate local image id mismatch" >&2; exit 3; }
repo_digest=${IMAGE##*@}
repo_commit=$(git -C "$REPO_ROOT" rev-parse HEAD)
node_sha=sha256:$(sha256sum "$NODE_RUNNER" | awk '{print $1}')
shell_sha=sha256:$(sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}')
mkdir -p "$RUN_ROOT/source"
cp "$NODE_RUNNER" "$RUN_ROOT/source/redis-candidate-regression.mjs"
cp "${BASH_SOURCE[0]}" "$RUN_ROOT/source/run-redis-candidate-regression.sh"
chmod 0600 "$RUN_ROOT/source/"*

docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT:/data" "$IMAGE" \
  -c 'chown -R 999:999 /data && chmod 700 /data'

npm --prefix "$REPO_ROOT" run build -w @yujian/platform-api >"$RUN_ROOT/build.log" 2>&1
start_candidate
run_phase initial

docker restart "$CONTAINER" >/dev/null
wait_healthy
run_phase post-restart

docker rm -f "$CONTAINER" >/dev/null
start_candidate
run_phase post-rebuild true
docker rm -f "$CONTAINER" >/dev/null
docker run --rm --user 0 --entrypoint /bin/sh -v "$DATA_ROOT:/data" "$IMAGE" \
  -c "chown -R $HOST_UID:$HOST_GID /data && chmod -R u+rwX,go-rwx /data" >/dev/null

capture_protected "$RUN_ROOT/protected-after.json"
jq -e --slurpfile before "$RUN_ROOT/protected-before.json" \
  '.state == "running" and .health == "healthy" and .restartCount == 0 and
   .image == $before[0].image and .containerId == $before[0].containerId and
   .restartCount == $before[0].restartCount' "$RUN_ROOT/protected-after.json" >/dev/null
if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER"; then
  echo "candidate container was not cleaned up" >&2
  exit 4
fi

jq -n \
  --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repoCommit "$repo_commit" --arg image "$IMAGE" --arg registryDigest "$repo_digest" \
  --arg localImageId "$actual_image_id" --arg nodeRunnerSha "$node_sha" --arg shellRunnerSha "$shell_sha" \
  --arg runRoot "$RUN_ROOT" --arg dataRoot "$DATA_ROOT" \
  --slurpfile initial "$RUN_ROOT/initial.json" \
  --slurpfile restart "$RUN_ROOT/post-restart.json" \
  --slurpfile rebuild "$RUN_ROOT/post-rebuild.json" \
  --slurpfile protectedBefore "$RUN_ROOT/protected-before.json" \
  --slurpfile protectedAfter "$RUN_ROOT/protected-after.json" \
  '{
    schemaVersion:1,
    taskId:"P1-M0-04-REDIS-CANDIDATE-REGRESSION",
    runId:$runId,
    generatedAt:$generatedAt,
    status:"passed",
    environment:{server:"beelink",platform:"linux/amd64",runRoot:$runRoot,dataRoot:$dataRoot},
    source:{repositoryCommit:$repoCommit,nodeRunnerSha256:$nodeRunnerSha,shellRunnerSha256:$shellRunnerSha},
    candidate:{image:$image,registryDigest:$registryDigest,localImageId:$localImageId},
    phases:{initial:$initial[0],postRestart:$restart[0],postRebuild:$rebuild[0]},
    persistence:{containerRestart:true,containerDeleteRecreate:true,aofMarkerRecovered:true,finalDbSize:$rebuild[0].cleanup.finalDbSize},
    isolation:{loopbackOnly:true,currentRuntimeSwitched:false,candidateContainerRemoved:true,protectedBefore:$protectedBefore[0],protectedAfter:$protectedAfter[0]},
    gate:{candidateRegression:"passed",deploymentApproval:"not-granted",currentImageGate:"blocked"}
  }' >"$RUN_ROOT/report.json"

find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq '{runId,status,candidate,phases:{initial:.phases.initial.competition,postRestart:.phases.postRestart.competition,postRebuild:.phases.postRebuild.competition},persistence,isolation:{loopbackOnly:.isolation.loopbackOnly,currentRuntimeSwitched:.isolation.currentRuntimeSwitched,candidateContainerRemoved:.isolation.candidateContainerRemoved},gate}' "$RUN_ROOT/report.json"
