#!/usr/bin/env bash
set -euo pipefail

umask 077

REPO_ROOT=${YUJIAN_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
EVIDENCE_BASE=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
RUN_ID=${YUJIAN_LICENSE_REMEDIATION_RUN_ID:-p1-m0-04-license-remediation-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
SCAN_ROOT=${YUJIAN_REMEDIATED_SCAN_ROOT:-$EVIDENCE_BASE/p1-m0-04-remediated-scan-20260718T120238Z}
SOURCE_ROOT=${YUJIAN_P1_SOURCE_ROOT:-/data/models/yujianAI/p1-m0-04/sources}
OPENBAO_SOURCE=${YUJIAN_OPENBAO_SOURCE:-/data/models/yujianAI/p1-m0-04/builds/p1-m0-04-remediated-build-20260718T115740Z/openbao-dist-2.5.4}
COSIGN_BIN=${COSIGN_BIN:-/data/models/yujianAI/toolchains/supply-chain/cosign-v3.1.2/cosign}
COSIGN_KEY=${COSIGN_KEY:-/data/models/yujianAI/secrets/p1-m0-04/engineering-evidence.key}
COSIGN_PUBLIC_KEY=${COSIGN_PUBLIC_KEY:-/data/models/yujianAI/secrets/p1-m0-04/engineering-evidence.pub}
COSIGN_PASSWORD_FILE=${COSIGN_PASSWORD_FILE:-/data/models/yujianAI/secrets/p1-m0-04/password}
POSTGRES_ID=postgres-16.14-alpine-gosu-go1.25.12
OPENBAO_ID=openbao-2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12
POSTGRES_SBOM="$SCAN_ROOT/images/$POSTGRES_ID/sbom.spdx.json"
OPENBAO_SBOM="$SCAN_ROOT/images/$OPENBAO_ID/sbom.spdx.json"
OPENBAO_ARCHIVE="$SOURCE_ROOT/openbao-dist-2.5.4.tar.xz"
GOSU_SOURCE="$SOURCE_ROOT/gosu-1.19-6456aaa"
POLICY="$REPO_ROOT/infra/upstream/license-remediation/noassertion-policy.json"

for command in docker jq node sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
for file in "$POSTGRES_SBOM" "$OPENBAO_SBOM" "$OPENBAO_ARCHIVE" \
  "$OPENBAO_SOURCE/LICENSE" "$OPENBAO_SOURCE/LICENSE_DEPENDENCIES.md" \
  "$OPENBAO_SOURCE/vendor/github.com/openbao/openbao-template/LICENSE" \
  "$OPENBAO_SOURCE/helper/stubbolt/stubbolt.go" "$GOSU_SOURCE/LICENSE" \
  "$POLICY" "$COSIGN_KEY" "$COSIGN_PUBLIC_KEY" "$COSIGN_PASSWORD_FILE"; do
  test -r "$file" || { echo "missing required file: $file" >&2; exit 2; }
done
test -x "$COSIGN_BIN" || { echo "cosign is not executable: $COSIGN_BIN" >&2; exit 2; }

verify_hash() {
  local expected=$1
  local file=$2
  test "$(sha256sum "$file" | awk '{print $1}')" = "$expected" || {
    echo "hash mismatch: $file" >&2
    exit 3
  }
}

verify_hash 23e0ad127b6d850ccfef20c9260c409861721cfb94fdf6a37a2559547f7c0dc4 "$POSTGRES_SBOM"
verify_hash 73a4205a6a1849e27103b718e2fd0057006f1c197653cea09f2527642c6a3395 "$OPENBAO_SBOM"
verify_hash 5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7 "$OPENBAO_ARCHIVE"
verify_hash d6b1a865f1c8c697d343bd4e0ce61025f91898486a1f00d727f32e8644af77d3 "$OPENBAO_SOURCE/LICENSE"
verify_hash f4293107047228ac15cdf62b2054ff04ba55a22887406fbcc6b6aa564e469bd9 "$OPENBAO_SOURCE/LICENSE_DEPENDENCIES.md"
verify_hash 60b11d77fa1965fe21409a59c0659feaae5fdab54515cb72c0cec528c43c1f79 "$OPENBAO_SOURCE/vendor/github.com/openbao/openbao-template/LICENSE"
verify_hash 131d32c4b23d36ad69a96b0f93086344ae33c4f24b4a5473d3ed1e62f2e19e3e "$OPENBAO_SOURCE/helper/stubbolt/stubbolt.go"
verify_hash cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30 "$GOSU_SOURCE/LICENSE"
verify_hash 3d6af92ff8a4c2cdf69afb1cf44edea727922f5cd0cf8b5f72b11cdecac8fdfd "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt"
verify_hash 2d36597f7117c38b006835ae7f537487207d8ec407aa9d9980794b2030cbc067 "$REPO_ROOT/infra/upstream/licenses/golang-x-sys-v0.1.0-BSD-3-Clause.txt"

mkdir -p "$RUN_ROOT/original-sbom" "$RUN_ROOT/licenses" "$RUN_ROOT/remediated-sbom" \
  "$RUN_ROOT/source-offer" "$RUN_ROOT/source-evidence" "$RUN_ROOT/tooling"
chmod 0700 "$RUN_ROOT" "$RUN_ROOT"/*
exec > >(tee "$RUN_ROOT/run.log") 2>&1
GENERATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

capture_protected() {
  local output=$1
  docker inspect yujian-p2-postgres-1 yujian-p2-redis-1 yujian-p2-openbao-a-1 \
    yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 --format '{{json .}}' \
    | jq -s '[.[] | {name:.Name,image:.Config.Image,containerId:.Id,state:.State.Status,health:.State.Health.Status,restartCount:.RestartCount}] | sort_by(.name)' >"$output"
}

capture_protected "$RUN_ROOT/protected-before.json"
cp "$POSTGRES_SBOM" "$RUN_ROOT/original-sbom/postgres.spdx.json"
cp "$OPENBAO_SBOM" "$RUN_ROOT/original-sbom/openbao.spdx.json"
cp "$REPO_ROOT/infra/upstream/license-remediation/NOTICE.md" "$RUN_ROOT/NOTICE.md"
cp "$REPO_ROOT/infra/upstream/license-remediation/SOURCE_OFFER.md" "$RUN_ROOT/SOURCE_OFFER.md"
cp "$POLICY" "$RUN_ROOT/tooling/noassertion-policy.json"
cp "$REPO_ROOT/tools/supply-chain/remediate-noassertion.mjs" "$RUN_ROOT/tooling/"
cp "${BASH_SOURCE[0]}" "$RUN_ROOT/tooling/"
cp "$REPO_ROOT/infra/upstream/licenses/postgresql-16.14-COPYRIGHT.txt" "$RUN_ROOT/licenses/"
cp "$GOSU_SOURCE/LICENSE" "$RUN_ROOT/licenses/gosu-and-moby-sys-user-Apache-2.0.txt"
cp "$REPO_ROOT/infra/upstream/licenses/golang-x-sys-v0.1.0-BSD-3-Clause.txt" "$RUN_ROOT/licenses/"
cp "$OPENBAO_SOURCE/LICENSE" "$RUN_ROOT/licenses/openbao-2.5.4-MPL-2.0.txt"
cp "$OPENBAO_SOURCE/LICENSE_DEPENDENCIES.md" "$RUN_ROOT/licenses/openbao-dependencies.md"
cp "$OPENBAO_SOURCE/vendor/github.com/openbao/openbao-template/LICENSE" "$RUN_ROOT/licenses/openbao-template-v1.0.1-MPL-2.0.txt"
cp "$REPO_ROOT/infra/upstream/licenses/yeqown-reedsolomon-MIT-added-20260308-pending-legal.txt" "$RUN_ROOT/licenses/"
cp "$OPENBAO_SOURCE/helper/stubbolt/stubbolt.go" "$RUN_ROOT/source-evidence/openbao-helper-stubbolt.go"
cp "$OPENBAO_SOURCE/vendor/github.com/openbao/openbao-template/LICENSE" "$RUN_ROOT/source-evidence/openbao-template-v1.0.1-LICENSE.txt"
cp "$OPENBAO_ARCHIVE" "$RUN_ROOT/source-offer/"
cp "$REPO_ROOT/infra/upstream/build-images/openbao-2.5.4-crypto.Dockerfile" "$RUN_ROOT/source-offer/"
cp "$REPO_ROOT/infra/upstream/build-images/postgres-16.14-alpine-gosu.Dockerfile" "$RUN_ROOT/source-offer/"
cp "$REPO_ROOT/tools/supply-chain/build-remediated-candidates.sh" "$RUN_ROOT/source-offer/"
cp "$COSIGN_PUBLIC_KEY" "$RUN_ROOT/engineering-signing-public.pem"

node "$REPO_ROOT/tools/supply-chain/remediate-noassertion.mjs" \
  --postgres-sbom "$RUN_ROOT/original-sbom/postgres.spdx.json" \
  --openbao-sbom "$RUN_ROOT/original-sbom/openbao.spdx.json" \
  --dependency-notice "$RUN_ROOT/licenses/openbao-dependencies.md" \
  --policy "$RUN_ROOT/tooling/noassertion-policy.json" \
  --output "$RUN_ROOT" --generated-at "$GENERATED_AT" --run-id "$RUN_ID"

capture_protected "$RUN_ROOT/protected-after.json"
jq -e --slurpfile before "$RUN_ROOT/protected-before.json" \
  '. == $before[0] and all(.[]; .state == "running" and .health == "healthy" and .restartCount == 0)' \
  "$RUN_ROOT/protected-after.json" >/dev/null

jq --slurpfile before "$RUN_ROOT/protected-before.json" --slurpfile after "$RUN_ROOT/protected-after.json" \
  --arg archiveSha "sha256:$(sha256sum "$RUN_ROOT/source-offer/openbao-dist-2.5.4.tar.xz" | awk '{print $1}')" \
  --arg dockerfileSha "sha256:$(sha256sum "$RUN_ROOT/source-offer/openbao-2.5.4-crypto.Dockerfile" | awk '{print $1}')" \
  --arg laterMitBlobSha "sha256:58fb0c85bfc183bad46c47dd38ac17e3372d86c1fcb65bce880fa1d964424f69" \
  '. + {sourceOffer:{status:"actual-source-bundled-awaiting-legal-owner",openbaoArchive:"source-offer/openbao-dist-2.5.4.tar.xz",openbaoArchiveSha256:$archiveSha,buildRecipe:"source-offer/openbao-2.5.4-crypto.Dockerfile",buildRecipeSha256:$dockerfileSha},reedsolomonBoundary:{tag:"v1.0.0",tagCommit:"5441098c575e61f884a016a3398726d2295fa995",licenseAddedCommit:"c5f4bc9af094852b52e593a5f964647c43028c51",upstreamLicenseBlobSha256:$laterMitBlobSha,status:"legal-owner-review-required"},protectedRuntime:{before:$before[0],after:$after[0],unchanged:true,allHealthy:true,restartCount:0}}' \
  "$RUN_ROOT/report.json" >"$RUN_ROOT/report.next.json"
mv "$RUN_ROOT/report.next.json" "$RUN_ROOT/report.json"

(
  cd "$RUN_ROOT"
  find . -type f ! -name SHA256SUMS ! -name 'signing-*' ! -name run-result.json ! -name run.log -print0 \
    | sort -z | xargs -0 sha256sum >SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
export COSIGN_PASSWORD
COSIGN_PASSWORD=$(<"$COSIGN_PASSWORD_FILE")
"$COSIGN_BIN" sign-blob --yes --key "$COSIGN_KEY" --bundle "$RUN_ROOT/signing-manifest.sigstore.json" \
  "$RUN_ROOT/SHA256SUMS" >"$RUN_ROOT/signing-create.log" 2>&1
"$COSIGN_BIN" verify-blob --insecure-ignore-tlog --key "$COSIGN_PUBLIC_KEY" \
  --bundle "$RUN_ROOT/signing-manifest.sigstore.json" "$RUN_ROOT/SHA256SUMS" >"$RUN_ROOT/signing-verify.log" 2>&1
unset COSIGN_PASSWORD

jq -n --arg runId "$RUN_ID" --arg runRoot "$RUN_ROOT" --arg generatedAt "$GENERATED_AT" \
  --arg reportSha "sha256:$(sha256sum "$RUN_ROOT/report.json" | awk '{print $1}')" \
  --arg inventorySha "sha256:$(sha256sum "$RUN_ROOT/noassertion-inventory.json" | awk '{print $1}')" \
  --arg manifestSha "sha256:$(sha256sum "$RUN_ROOT/SHA256SUMS" | awk '{print $1}')" \
  --arg bundleSha "sha256:$(sha256sum "$RUN_ROOT/signing-manifest.sigstore.json" | awk '{print $1}')" \
  --arg publicKeySha "sha256:$(sha256sum "$RUN_ROOT/engineering-signing-public.pem" | awk '{print $1}')" \
  --slurpfile report "$RUN_ROOT/report.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-LICENSE-REMEDIATION-RUN",runId:$runId,runRoot:$runRoot,generatedAt:$generatedAt,status:$report[0].status,deploymentAllowed:false,summary:$report[0].summary,reportSha256:$reportSha,inventorySha256:$inventorySha,manifestSha256:$manifestSha,signatureBundleSha256:$bundleSha,publicKeySha256:$publicKeySha,signatureVerified:true,sourceOffer:$report[0].sourceOffer,protectedRuntime:$report[0].protectedRuntime,ownerBoundary:$report[0].ownerBoundary}' \
  >"$RUN_ROOT/run-result.json"

find "$RUN_ROOT" -type d -exec chmod 0500 {} +
find "$RUN_ROOT" -type f -exec chmod 0400 {} +
jq . "$RUN_ROOT/run-result.json"
