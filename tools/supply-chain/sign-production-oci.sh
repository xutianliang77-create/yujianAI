#!/usr/bin/env bash
set -euo pipefail

umask 077

IMAGE=${YUJIAN_OCI_IMAGE:?set YUJIAN_OCI_IMAGE to a production registry digest reference}
REGISTRY_HOST=${YUJIAN_PRODUCTION_REGISTRY_HOST:?set YUJIAN_PRODUCTION_REGISTRY_HOST}
SBOM=${YUJIAN_OCI_SBOM:?set YUJIAN_OCI_SBOM to the matching SPDX JSON}
KEY_URI=${YUJIAN_COSIGN_KEY_URI:?set YUJIAN_COSIGN_KEY_URI to a production KMS/OpenBao key URI}
RELEASE_COMMIT=${YUJIAN_RELEASE_COMMIT:?set YUJIAN_RELEASE_COMMIT to the 40-character Git commit}
EVIDENCE_BASE=${YUJIAN_OCI_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04/production-oci}
RUN_ID=${YUJIAN_OCI_RUN_ID:-production-oci-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_ROOT="$EVIDENCE_BASE/$RUN_ID"
COSIGN_BIN=${COSIGN_BIN:-cosign}

for command in docker jq sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
command -v "$COSIGN_BIN" >/dev/null || test -x "$COSIGN_BIN" || { echo "cosign is unavailable" >&2; exit 2; }
[[ "$IMAGE" == "$REGISTRY_HOST/"* ]] || { echo "image is outside the approved production registry host" >&2; exit 2; }
[[ "$IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "image must be digest-pinned" >&2; exit 2; }
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "release commit must be a full Git SHA" >&2; exit 2; }
[[ "$KEY_URI" =~ ^(openbao|hashivault|awskms|gcpkms|azurekms):// ]] || { echo "production signing requires a managed key URI" >&2; exit 2; }
test -r "$SBOM" || { echo "SBOM is unreadable" >&2; exit 2; }
jq -e '.spdxVersion == "SPDX-2.3"' "$SBOM" >/dev/null

mkdir -p "$RUN_ROOT"
chmod 0700 "$RUN_ROOT"
cp "$SBOM" "$RUN_ROOT/sbom.spdx.json"
docker pull "$IMAGE" >"$RUN_ROOT/pull-before-sign.log"
"$COSIGN_BIN" public-key --key "$KEY_URI" >"$RUN_ROOT/production-signing-public.pem"
"$COSIGN_BIN" sign --yes --key "$KEY_URI" \
  -a ai.yujian.release=candidate-not-authorized \
  -a ai.yujian.commit="$RELEASE_COMMIT" \
  "$IMAGE" >"$RUN_ROOT/signature-create.log" 2>&1
"$COSIGN_BIN" attest --yes --key "$KEY_URI" --type spdxjson \
  --predicate "$RUN_ROOT/sbom.spdx.json" "$IMAGE" >"$RUN_ROOT/attestation-create.log" 2>&1

docker pull "$IMAGE" >"$RUN_ROOT/pull-after-sign.log"
"$COSIGN_BIN" verify --key "$RUN_ROOT/production-signing-public.pem" \
  -a ai.yujian.release=candidate-not-authorized \
  -a ai.yujian.commit="$RELEASE_COMMIT" \
  "$IMAGE" >"$RUN_ROOT/signature-verify.json"
"$COSIGN_BIN" verify-attestation --key "$RUN_ROOT/production-signing-public.pem" \
  --type spdxjson "$IMAGE" >"$RUN_ROOT/attestation-verify.json"

jq -n \
  --arg runId "$RUN_ID" --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg image "$IMAGE" --arg registryHost "$REGISTRY_HOST" --arg releaseCommit "$RELEASE_COMMIT" \
  --arg keyProvider "${KEY_URI%%://*}" \
  --arg sbomSha "sha256:$(sha256sum "$RUN_ROOT/sbom.spdx.json" | awk '{print $1}')" \
  --arg publicKeySha "sha256:$(sha256sum "$RUN_ROOT/production-signing-public.pem" | awk '{print $1}')" \
  --arg signatureVerifySha "sha256:$(sha256sum "$RUN_ROOT/signature-verify.json" | awk '{print $1}')" \
  --arg attestationVerifySha "sha256:$(sha256sum "$RUN_ROOT/attestation-verify.json" | awk '{print $1}')" \
  '{schemaVersion:1,taskId:"P1-M0-04-PRODUCTION-OCI-SIGNATURE",runId:$runId,generatedAt:$generatedAt,image:$image,registryHost:$registryHost,releaseCommit:$releaseCommit,keyProvider:$keyProvider,sbomSha256:$sbomSha,publicKeySha256:$publicKeySha,signature:{attached:true,verified:true,verificationSha256:$signatureVerifySha},attestation:{type:"spdxjson",attached:true,verified:true,verificationSha256:$attestationVerifySha},releaseOwnerDecision:"pending-bbb",releaseAuthorized:false}' \
  >"$RUN_ROOT/result.json"

find "$RUN_ROOT" -type d -exec chmod 0700 {} +
find "$RUN_ROOT" -type f -exec chmod 0600 {} +
jq . "$RUN_ROOT/result.json"
