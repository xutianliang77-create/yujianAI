#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
BUILD_RESULT=${YUJIAN_REMEDIATED_BUILD_RESULT:?set YUJIAN_REMEDIATED_BUILD_RESULT}
EVIDENCE_BASE=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
TOOL_ROOT=${YUJIAN_SUPPLY_CHAIN_TOOL_ROOT:-/data/models/yujianAI/toolchains/supply-chain}
RUN_ID=${YUJIAN_REMEDIATED_SCAN_RUN_ID:-p1-m0-04-remediated-scan-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
SYFT_BIN=${SYFT_BIN:-$TOOL_ROOT/syft-v1.48.0/syft}
GRYPE_BIN=${GRYPE_BIN:-$TOOL_ROOT/grype-v0.116.0/grype}
COSIGN_BIN=${COSIGN_BIN:-$TOOL_ROOT/cosign-v3.1.2/cosign}
COSIGN_KEY=${COSIGN_KEY:-/data/models/yujianAI/secrets/p1-m0-04/engineering-evidence.key}
COSIGN_PUBLIC_KEY=${COSIGN_PUBLIC_KEY:-/data/models/yujianAI/secrets/p1-m0-04/engineering-evidence.pub}
COSIGN_PASSWORD_FILE=${COSIGN_PASSWORD_FILE:-/data/models/yujianAI/secrets/p1-m0-04/password}
GRYPE_CACHE=${GRYPE_DB_CACHE_DIR:-$TOOL_ROOT/grype-db}

for command in docker jq sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
for executable in "$SYFT_BIN" "$GRYPE_BIN" "$COSIGN_BIN"; do
  test -x "$executable" || { echo "missing executable: $executable" >&2; exit 2; }
done
for file in "$BUILD_RESULT" "$COSIGN_KEY" "$COSIGN_PUBLIC_KEY" "$COSIGN_PASSWORD_FILE"; do
  test -r "$file" || { echo "missing required file: $file" >&2; exit 2; }
done
jq -e '.status == "built-awaiting-scan" and .deploymentAllowed == false and (.outputs | length) == 2' "$BUILD_RESULT" >/dev/null

mkdir -p "$RUN_ROOT/images" "$RUN_ROOT/source"
chmod 0700 "$RUN_ROOT" "$RUN_ROOT/images" "$RUN_ROOT/source"
exec > >(tee "$RUN_ROOT/scan.log") 2>&1

capture_protected() {
  local output=$1
  docker inspect yujian-p2-postgres-1 yujian-p2-redis-1 yujian-p2-openbao-a-1 yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
    --format '{{json .}}' | jq -s '[.[] | {name:.Name,image:.Config.Image,containerId:.Id,state:.State.Status,health:.State.Health.Status,restartCount:.RestartCount}] | sort_by(.name)' >"$output"
}

capture_protected "$RUN_ROOT/protected-before.json"
cp "$BUILD_RESULT" "$RUN_ROOT/source/build-result.json"
cp "$REPO_ROOT/infra/upstream/build-images/postgres-16.14-alpine-gosu.Dockerfile" "$RUN_ROOT/source/"
cp "$REPO_ROOT/infra/upstream/build-images/openbao-2.5.4-crypto.Dockerfile" "$RUN_ROOT/source/"
cp "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt" "$RUN_ROOT/source/"
cp "$REPO_ROOT/tools/supply-chain/build-remediated-candidates.sh" "$RUN_ROOT/source/"
cp "${BASH_SOURCE[0]}" "$RUN_ROOT/source/"

export GRYPE_DB_CACHE_DIR="$GRYPE_CACHE"
"$GRYPE_BIN" db status -o json >"$RUN_ROOT/grype-db-status.json"
: >"$RUN_ROOT/images.ndjson"
while IFS= read -r image; do
  id=$(jq -r .id <<<"$image")
  tag=$(jq -r .localTag <<<"$image")
  expected_id=$(jq -r .localImageId <<<"$image")
  actual_id=$(docker image inspect "$tag" --format '{{.Id}}')
  test "$actual_id" = "$expected_id" || { echo "$id image id mismatch" >&2; exit 3; }
  image_root="$RUN_ROOT/images/$id"
  mkdir -p "$image_root"
  sbom="$image_root/sbom.spdx.json"
  scan="$image_root/vulnerabilities.grype.json"
  "$SYFT_BIN" "docker:$tag" -o "spdx-json=$sbom" >"$image_root/syft.log" 2>&1
  GRYPE_DB_AUTO_UPDATE=false "$GRYPE_BIN" "sbom:$sbom" -o json >"$scan" 2>"$image_root/grype.log"
  packages=$(jq '.packages | length' "$sbom")
  noassertion=$(jq '[.packages[] | select((.licenseDeclared // "NOASSERTION") == "NOASSERTION")] | length' "$sbom")
  counts=$(jq '[.matches[].vulnerability.severity | ascii_downcase] as $s | {negligible:($s|map(select(.=="negligible"))|length),low:($s|map(select(.=="low"))|length),medium:($s|map(select(.=="medium"))|length),high:($s|map(select(.=="high"))|length),critical:($s|map(select(.=="critical"))|length),unknown:($s|map(select(.=="unknown" or .==""))|length)}' "$scan")
  jq -n --arg id "$id" --arg localTag "$tag" --arg localImageId "$actual_id" \
    --arg sbomPath "$sbom" --arg sbomSha "sha256:$(sha256sum "$sbom" | awk '{print $1}')" \
    --arg scanPath "$scan" --arg scanSha "sha256:$(sha256sum "$scan" | awk '{print $1}')" \
    --argjson packages "$packages" --argjson noassertion "$noassertion" --argjson counts "$counts" \
    '{id:$id,artifactClass:"local-pre-registry",localTag:$localTag,localImageId:$localImageId,platform:"linux/amd64",sbom:{spdxVersion:"SPDX-2.3",packages:$packages,licensesNoAssertion:$noassertion,path:$sbomPath,sha256:$sbomSha},vulnerabilityScan:{path:$scanPath,sha256:$scanSha,counts:$counts,gate:(if $counts.critical == 0 then "passed" else "blocked" end)}}' \
    >>"$RUN_ROOT/images.ndjson"
done < <(jq -c '.outputs[]' "$BUILD_RESULT")
jq -s '.' "$RUN_ROOT/images.ndjson" >"$RUN_ROOT/images.json"

capture_protected "$RUN_ROOT/protected-after.json"
jq -e --slurpfile before "$RUN_ROOT/protected-before.json" \
  '. == $before[0] and all(.[]; .state == "running" and .health == "healthy" and .restartCount == 0)' \
  "$RUN_ROOT/protected-after.json" >/dev/null

total_critical=$(jq '[.[].vulnerabilityScan.counts.critical] | add' "$RUN_ROOT/images.json")
total_noassertion=$(jq '[.[].sbom.licensesNoAssertion] | add' "$RUN_ROOT/images.json")
technical_status=passed
if [[ "$total_critical" -gt 0 ]]; then technical_status=blocked; fi
jq -n --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg status "$technical_status" --arg buildResultSha "sha256:$(sha256sum "$BUILD_RESULT" | awk '{print $1}')" \
  --arg dockerfilePostgresSha "sha256:$(sha256sum "$REPO_ROOT/infra/upstream/build-images/postgres-16.14-alpine-gosu.Dockerfile" | awk '{print $1}')" \
  --arg dockerfileOpenbaoSha "sha256:$(sha256sum "$REPO_ROOT/infra/upstream/build-images/openbao-2.5.4-crypto.Dockerfile" | awk '{print $1}')" \
  --arg postgresLicenseSha "sha256:$(sha256sum "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt" | awk '{print $1}')" \
  --arg runnerSha "sha256:$(sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}')" \
  --argjson totalCritical "$total_critical" --argjson totalNoAssertion "$total_noassertion" \
  --slurpfile images "$RUN_ROOT/images.json" --slurpfile protectedBefore "$RUN_ROOT/protected-before.json" --slurpfile protectedAfter "$RUN_ROOT/protected-after.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-REMEDIATED-CANDIDATE-SCAN",runId:$runId,generatedAt:$generatedAt,status:$status,deploymentAllowed:false,artifactClass:"local-pre-registry",source:{buildResultSha256:$buildResultSha,postgresDockerfileSha256:$dockerfilePostgresSha,openbaoDockerfileSha256:$dockerfileOpenbaoSha,postgresqlLicenseSha256:$postgresLicenseSha,runnerSha256:$runnerSha},summary:{images:($images[0]|length),unwaivedCritical:$totalCritical,licensesNoAssertion:$totalNoAssertion},images:$images[0],protectedRuntime:{before:$protectedBefore[0],after:$protectedAfter[0]},gate:{runtimeSwitch:"not-authorized",registryPromotion:"not-authorized",productionRelease:"blocked"}}' \
  >"$RUN_ROOT/signing-statement.json"

export COSIGN_PASSWORD
COSIGN_PASSWORD=$(<"$COSIGN_PASSWORD_FILE")
"$COSIGN_BIN" sign-blob --yes --key "$COSIGN_KEY" --bundle "$RUN_ROOT/signing-statement.sigstore.json" "$RUN_ROOT/signing-statement.json" >"$RUN_ROOT/signature-create.log" 2>&1
"$COSIGN_BIN" verify-blob --insecure-ignore-tlog --key "$COSIGN_PUBLIC_KEY" --bundle "$RUN_ROOT/signing-statement.sigstore.json" "$RUN_ROOT/signing-statement.json" >"$RUN_ROOT/signature-verify.log" 2>&1
unset COSIGN_PASSWORD
cp "$COSIGN_PUBLIC_KEY" "$RUN_ROOT/signing-public.pem"

jq -n --arg runId "$RUN_ID" --arg runRoot "$RUN_ROOT" --arg technicalStatus "$technical_status" \
  --arg statementSha "sha256:$(sha256sum "$RUN_ROOT/signing-statement.json" | awk '{print $1}')" \
  --arg bundleSha "sha256:$(sha256sum "$RUN_ROOT/signing-statement.sigstore.json" | awk '{print $1}')" \
  --arg publicKeySha "sha256:$(sha256sum "$RUN_ROOT/signing-public.pem" | awk '{print $1}')" \
  --argjson totalCritical "$total_critical" --argjson totalNoAssertion "$total_noassertion" \
  '{runId:$runId,runRoot:$runRoot,technicalStatus:$technicalStatus,totalUnwaivedCritical:$totalCritical,totalLicensesNoAssertion:$totalNoAssertion,signatureVerified:true,statementSha256:$statementSha,bundleSha256:$bundleSha,publicKeySha256:$publicKeySha,deploymentAllowed:false}' \
  >"$RUN_ROOT/run-result.json"
find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/run-result.json"
test "$technical_status" = "passed"
