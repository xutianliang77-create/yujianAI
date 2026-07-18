#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
EVIDENCE_BASE=${YUJIAN_REGISTRY_EVIDENCE_ROOT:-/data/models/yujianAI/registry/evidence}
TOOL_ROOT=${YUJIAN_SUPPLY_CHAIN_TOOL_ROOT:-/data/models/yujianAI/toolchains/supply-chain}
RUN_ID=${YUJIAN_REGISTRY_BUILD_RUN_ID:-registry-build-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
SOURCE_ROOT="$RUN_ROOT/source"
IMAGE_TAG=yujian/p1-registry:3.1.1-crypto0.52-net0.55-go1.25.12
COMMIT=9a8d98b679740cd514aa7e7d84d23d442a5ef54c
SYFT_BIN=${SYFT_BIN:-$TOOL_ROOT/syft-v1.48.0/syft}
GRYPE_BIN=${GRYPE_BIN:-$TOOL_ROOT/grype-v0.116.0/grype}

for command in docker git jq sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
test -x "$SYFT_BIN" && test -x "$GRYPE_BIN"
mkdir -p "$SOURCE_ROOT"
git clone --quiet --filter=blob:none --no-checkout https://github.com/distribution/distribution.git "$SOURCE_ROOT/distribution"
git -C "$SOURCE_ROOT/distribution" checkout --quiet "$COMMIT"
test "$(git -C "$SOURCE_ROOT/distribution" rev-parse HEAD)" = "$COMMIT"
cp "$REPO_ROOT/infra/upstream/build-images/distribution-3.1.1-crypto.Dockerfile" "$RUN_ROOT/"

docker build --pull=false --network=host \
  -f "$RUN_ROOT/distribution-3.1.1-crypto.Dockerfile" \
  -t "$IMAGE_TAG" "$SOURCE_ROOT/distribution" >"$RUN_ROOT/build.log" 2>&1
image_id=$(docker image inspect "$IMAGE_TAG" --format '{{.Id}}')
export GRYPE_DB_CACHE_DIR=${GRYPE_DB_CACHE_DIR:-$TOOL_ROOT/grype-db}
"$SYFT_BIN" "docker:$IMAGE_TAG" -o "spdx-json=$RUN_ROOT/sbom.spdx.json" >"$RUN_ROOT/syft.log" 2>&1
GRYPE_DB_AUTO_UPDATE=false "$GRYPE_BIN" "sbom:$RUN_ROOT/sbom.spdx.json" -o json >"$RUN_ROOT/vulnerabilities.grype.json" 2>"$RUN_ROOT/grype.log"
counts=$(jq '[.matches[].vulnerability.severity | ascii_downcase] as $s | {negligible:($s|map(select(.=="negligible"))|length),low:($s|map(select(.=="low"))|length),medium:($s|map(select(.=="medium"))|length),high:($s|map(select(.=="high"))|length),critical:($s|map(select(.=="critical"))|length),unknown:($s|map(select(.=="unknown" or .==""))|length)}' "$RUN_ROOT/vulnerabilities.grype.json")
jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg runRoot "$RUN_ROOT" --arg image "$IMAGE_TAG" --arg imageId "$image_id" --arg sourceCommit "$COMMIT" \
  --arg dockerfileSha256 "sha256:$(sha256sum "$RUN_ROOT/distribution-3.1.1-crypto.Dockerfile" | awk '{print $1}')" \
  --arg sbomSha256 "sha256:$(sha256sum "$RUN_ROOT/sbom.spdx.json" | awk '{print $1}')" \
  --arg scanSha256 "sha256:$(sha256sum "$RUN_ROOT/vulnerabilities.grype.json" | awk '{print $1}')" \
  --argjson counts "$counts" \
  '{schemaVersion:1,taskId:"P1-M0-04-PRODUCTION-REGISTRY-BUILD",runId:$runId,generatedAt:$generatedAt,runRoot:$runRoot,image:$image,imageId:$imageId,sourceCommit:$sourceCommit,dockerfileSha256:$dockerfileSha256,sbomSha256:$sbomSha256,scanSha256:$scanSha256,counts:$counts,deploymentAllowed:($counts.critical==0 and $counts.high==0)}' \
  >"$RUN_ROOT/result.json"
find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/result.json"
jq -e '.deploymentAllowed == true' "$RUN_ROOT/result.json" >/dev/null
