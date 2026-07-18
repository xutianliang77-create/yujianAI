#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
GOSU_SOURCE=${YUJIAN_GOSU_SOURCE:-/data/models/yujianAI/p1-m0-04/sources/gosu-1.19-6456aaa}
OPENBAO_ARCHIVE=${YUJIAN_OPENBAO_ARCHIVE:-/data/models/yujianAI/p1-m0-04/sources/openbao-dist-2.5.4.tar.xz}
EVIDENCE_BASE=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
RUN_ID=${YUJIAN_REMEDIATED_BUILD_RUN_ID:-p1-m0-04-remediated-build-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
WORK_ROOT=${YUJIAN_REMEDIATED_BUILD_ROOT:-/data/models/yujianAI/p1-m0-04/builds/$RUN_ID}
POSTGRES_TAG=yujian/p1-postgres:16.14-alpine-gosu-go1.25.12
OPENBAO_TAG=yujian/p1-openbao:2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12
EXPECTED_GOSU_COMMIT=6456aaa0f3c854d199d0f037f068eb97515b7513
EXPECTED_OPENBAO_SHA=5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7

for command in docker git jq sha256sum tar; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
test -f "$REPO_ROOT/infra/upstream/build-images/postgres-16.14-alpine-gosu.Dockerfile"
test -f "$REPO_ROOT/infra/upstream/build-images/openbao-2.5.4-crypto.Dockerfile"
test -f "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt"
test -d "$GOSU_SOURCE/.git" || { echo "gosu source checkout is missing" >&2; exit 2; }
test -f "$OPENBAO_ARCHIVE" || { echo "OpenBao distribution archive is missing" >&2; exit 2; }
test "$(git -C "$GOSU_SOURCE" rev-parse HEAD)" = "$EXPECTED_GOSU_COMMIT" || { echo "gosu source commit mismatch" >&2; exit 2; }
echo "$EXPECTED_OPENBAO_SHA  $OPENBAO_ARCHIVE" | sha256sum -c -

mkdir -p "$RUN_ROOT" "$WORK_ROOT"
chmod 0700 "$RUN_ROOT" "$WORK_ROOT"
exec > >(tee "$RUN_ROOT/build.log") 2>&1

capture_protected() {
  local output=$1
  docker inspect yujian-p2-postgres-1 yujian-p2-openbao-a-1 yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
    --format '{{json .}}' | jq -s '[.[] | {name:.Name,image:.Config.Image,containerId:.Id,state:.State.Status,health:.State.Health.Status,restartCount:.RestartCount}]' >"$output"
}

capture_protected "$RUN_ROOT/protected-before.json"
tar -xJf "$OPENBAO_ARCHIVE" -C "$WORK_ROOT"
OPENBAO_CONTEXT="$WORK_ROOT/openbao-dist-2.5.4"
test -d "$OPENBAO_CONTEXT" || { echo "OpenBao archive layout is invalid" >&2; exit 2; }

docker build --network host --pull=false \
  --build-context yujian-licenses="$REPO_ROOT/infra/upstream/licenses" \
  --file "$REPO_ROOT/infra/upstream/build-images/postgres-16.14-alpine-gosu.Dockerfile" \
  --tag "$POSTGRES_TAG" "$GOSU_SOURCE"
docker build --network host --pull=false \
  --file "$REPO_ROOT/infra/upstream/build-images/openbao-2.5.4-crypto.Dockerfile" \
  --tag "$OPENBAO_TAG" "$OPENBAO_CONTEXT"

postgres_id=$(docker image inspect "$POSTGRES_TAG" --format '{{.Id}}')
openbao_id=$(docker image inspect "$OPENBAO_TAG" --format '{{.Id}}')
capture_protected "$RUN_ROOT/protected-after.json"
jq -e --slurpfile before "$RUN_ROOT/protected-before.json" \
  '. == $before[0] and all(.[]; .state == "running" and .health == "healthy" and .restartCount == 0)' \
  "$RUN_ROOT/protected-after.json" >/dev/null

jq -n \
  --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg postgresTag "$POSTGRES_TAG" --arg postgresId "$postgres_id" \
  --arg openbaoTag "$OPENBAO_TAG" --arg openbaoId "$openbao_id" \
  --arg gosuCommit "$EXPECTED_GOSU_COMMIT" --arg openbaoArchiveSha "sha256:$EXPECTED_OPENBAO_SHA" \
  --arg postgresLicenseSha "sha256:$(sha256sum "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt" | awk '{print $1}')" \
  --slurpfile before "$RUN_ROOT/protected-before.json" --slurpfile after "$RUN_ROOT/protected-after.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-REMEDIATED-CANDIDATE-BUILD",runId:$runId,generatedAt:$generatedAt,status:"built-awaiting-scan",deploymentAllowed:false,outputs:[{id:"postgres-16.14-alpine-gosu-go1.25.12",localTag:$postgresTag,localImageId:$postgresId},{id:"openbao-2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12",localTag:$openbaoTag,localImageId:$openbaoId}],sources:{gosuCommit:$gosuCommit,openbaoDistributionSha256:$openbaoArchiveSha,postgresqlLicenseSha256:$postgresLicenseSha},protectedRuntime:{before:$before[0],after:$after[0]},gate:{runtimeSwitch:"not-authorized",productionRelease:"blocked"}}' \
  >"$RUN_ROOT/build-result.json"

find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/build-result.json"
