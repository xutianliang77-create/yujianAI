#!/usr/bin/env bash
set -euo pipefail

umask 077

REGISTRY_HOST=${YUJIAN_PRODUCTION_REGISTRY_HOST:?set YUJIAN_PRODUCTION_REGISTRY_HOST}
AUTH_FILE=${YUJIAN_REGISTRY_AUTH_FILE:?set YUJIAN_REGISTRY_AUTH_FILE}
OUTPUT=${YUJIAN_EXTERNAL_FETCH_RESULT:?set YUJIAN_EXTERNAL_FETCH_RESULT}
CLIENT_NAME=${YUJIAN_EXTERNAL_CLIENT_NAME:-$(hostname)}

for command in curl jq; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done
test -r "$AUTH_FILE"
jq -e '.username | type == "string"' "$AUTH_FILE" >/dev/null
jq -e '.password | type == "string"' "$AUTH_FILE" >/dev/null
test "$#" -gt 0

WORK_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yujian-registry-fetch.XXXXXX")
AUTH_CONFIG="$WORK_ROOT/curl.conf"
jq -r '"user = \"\(.username):\(.password)\""' "$AUTH_FILE" >"$AUTH_CONFIG"
: >"$WORK_ROOT/images.ndjson"

hash_file() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}

index=0
for reference in "$@"; do
  [[ "$reference" == "$REGISTRY_HOST/"*@sha256:* ]] || { echo "invalid digest reference: $reference" >&2; exit 2; }
  repository=${reference#"$REGISTRY_HOST/"}
  repository=${repository%@sha256:*}
  digest=sha256:${reference##*@sha256:}
  manifest="$WORK_ROOT/manifest-$index.json"
  curl --noproxy '*' --fail --silent --show-error --config "$AUTH_CONFIG" \
    -H 'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
    "https://$REGISTRY_HOST/v2/$repository/manifests/$digest" >"$manifest"
  test "sha256:$(hash_file "$manifest")" = "$digest"
  blob_count=0
  while IFS= read -r blob; do
    expected=${blob#sha256:}
    actual=$(curl --noproxy '*' --fail --silent --show-error --config "$AUTH_CONFIG" \
      "https://$REGISTRY_HOST/v2/$repository/blobs/$blob" | \
      { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; } | awk '{print $1}')
    test "$actual" = "$expected"
    blob_count=$((blob_count + 1))
  done < <(jq -r '[.config.digest, .layers[].digest] | .[]' "$manifest")
  jq -n --arg digestReference "$reference" --arg mediaType "$(jq -r .mediaType "$manifest")" \
    --argjson blobCount "$blob_count" \
    '{digestReference:$digestReference,manifestDigestVerified:true,mediaType:$mediaType,blobCount:$blobCount,allBlobDigestsVerified:true}' \
    >>"$WORK_ROOT/images.ndjson"
  index=$((index + 1))
done

jq -s '.' "$WORK_ROOT/images.ndjson" >"$WORK_ROOT/images.json"
jq -n --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg client "$CLIENT_NAME" \
  --arg registry "$REGISTRY_HOST" --slurpfile images "$WORK_ROOT/images.json" \
  '{schemaVersion:1,taskId:"P1-M0-04-EXTERNAL-REGISTRY-FETCH",generatedAt:$generatedAt,client:$client,registry:$registry,transport:"tailscale-tls-basic-auth",images:$images[0],passed:($images[0]|length > 0 and all(.[];.manifestDigestVerified and .allBlobDigestsVerified))}' \
  >"$OUTPUT"
chmod 0600 "$OUTPUT"
jq . "$OUTPUT"

for temporary in "$AUTH_CONFIG" "$WORK_ROOT/images.ndjson" "$WORK_ROOT/images.json"; do
  unlink "$temporary"
done
find "$WORK_ROOT" -type f -name 'manifest-*.json' -delete
rmdir "$WORK_ROOT"
