#!/usr/bin/env bash
set -euo pipefail

umask 077

scope_file=${YUJIAN_IMAGE_SCOPE_FILE:?set YUJIAN_IMAGE_SCOPE_FILE}
evidence_base=${YUJIAN_IMAGE_EVIDENCE_ROOT:-/data/models/yujianAI/evidence/p1-m0-04}
tool_root=${YUJIAN_SUPPLY_CHAIN_TOOL_ROOT:-/data/models/yujianAI/toolchains/supply-chain}
run_id=${YUJIAN_IMAGE_EVIDENCE_RUN_ID:-p1-m0-04-$(date -u +%Y%m%dT%H%M%SZ)}
run_root="$evidence_base/$run_id"
syft_bin=${SYFT_BIN:-$tool_root/syft-v1.48.0/syft}
grype_bin=${GRYPE_BIN:-$tool_root/grype-v0.116.0/grype}
cosign_bin=${COSIGN_BIN:-$tool_root/cosign-v3.1.2/cosign}
cosign_key=${COSIGN_KEY:?set COSIGN_KEY to an encrypted engineering evidence key}
cosign_public_key=${COSIGN_PUBLIC_KEY:?set COSIGN_PUBLIC_KEY}
cosign_password_file=${COSIGN_PASSWORD_FILE:?set COSIGN_PASSWORD_FILE}
grype_cache=${GRYPE_DB_CACHE_DIR:-$tool_root/grype-db}

for command in docker jq sha256sum; do
  command -v "$command" >/dev/null || { printf 'missing command: %s\n' "$command" >&2; exit 2; }
done
for executable in "$syft_bin" "$grype_bin" "$cosign_bin"; do
  test -x "$executable" || { printf 'missing executable: %s\n' "$executable" >&2; exit 2; }
done
test -r "$scope_file" || { printf 'unreadable scope: %s\n' "$scope_file" >&2; exit 2; }
test -r "$cosign_key" || { printf 'unreadable signing key: %s\n' "$cosign_key" >&2; exit 2; }
test -r "$cosign_public_key" || { printf 'unreadable public key: %s\n' "$cosign_public_key" >&2; exit 2; }
test -r "$cosign_password_file" || { printf 'unreadable password file: %s\n' "$cosign_password_file" >&2; exit 2; }

mkdir -p "$run_root/images" "$grype_cache"
cp "$scope_file" "$run_root/scope.json"
chmod 0600 "$run_root/scope.json"
scope_policy=$(jq -er '.policy | select(type == "string" and length > 0)' "$run_root/scope.json")

export GRYPE_DB_CACHE_DIR="$grype_cache"
"$grype_bin" db update >"$run_root/grype-db-update.log" 2>&1
"$grype_bin" db status -o json >"$run_root/grype-db-status.json"

syft_version=$($syft_bin version -o json | jq -r .version)
grype_version=$($grype_bin version -o json | jq -r .version)
cosign_version=$($cosign_bin version --json | jq -r '.gitVersion // .version')
syft_sha=$(sha256sum "$syft_bin" | awk '{print "sha256:" $1}')
grype_sha=$(sha256sum "$grype_bin" | awk '{print "sha256:" $1}')
cosign_sha=$(sha256sum "$cosign_bin" | awk '{print "sha256:" $1}')

: >"$run_root/images.ndjson"
while IFS= read -r image; do
  id=$(jq -r .id <<<"$image")
  reference=$(jq -r .reference <<<"$image")
  expected_local_id=$(jq -r .expectedLocalImageId <<<"$image")
  registry_digest=${reference##*@}
  image_root="$run_root/images/$id"
  mkdir -p "$image_root"

  local_id=$(docker image inspect --format '{{.Id}}' "$reference")
  if [[ "$local_id" != "$expected_local_id" ]]; then
    printf '%s local image id mismatch: expected=%s actual=%s\n' "$id" "$expected_local_id" "$local_id" >&2
    exit 3
  fi

  sbom="$image_root/sbom.spdx.json"
  scan="$image_root/vulnerabilities.grype.json"
  "$syft_bin" "docker:$reference" -o "spdx-json=$sbom" >"$image_root/syft.log" 2>&1
  GRYPE_DB_AUTO_UPDATE=false "$grype_bin" "sbom:$sbom" -o json >"$scan" 2>"$image_root/grype.log"

  spdx_version=$(jq -r .spdxVersion "$sbom")
  packages=$(jq '.packages | length' "$sbom")
  if [[ "$spdx_version" != "SPDX-2.3" || "$packages" -le 0 ]]; then
    printf '%s generated an invalid or empty SPDX SBOM\n' "$id" >&2
    exit 4
  fi
  counts=$(jq '
    [.matches[].vulnerability.severity | ascii_downcase] as $s |
    {
      negligible: ($s | map(select(. == "negligible")) | length),
      low: ($s | map(select(. == "low")) | length),
      medium: ($s | map(select(. == "medium")) | length),
      high: ($s | map(select(. == "high")) | length),
      critical: ($s | map(select(. == "critical")) | length),
      unknown: ($s | map(select(. == "unknown" or . == "")) | length)
    }
  ' "$scan")
  critical=$(jq -r .critical <<<"$counts")
  scan_gate=passed
  if [[ "$critical" -gt 0 ]]; then scan_gate=blocked; fi

  jq -n \
    --arg id "$id" \
    --arg reference "$reference" \
    --arg registryDigest "$registry_digest" \
    --arg localImageId "$local_id" \
    --arg sbomPath "$sbom" \
    --arg sbomSha "sha256:$(sha256sum "$sbom" | awk '{print $1}')" \
    --arg scanPath "$scan" \
    --arg scanSha "sha256:$(sha256sum "$scan" | awk '{print $1}')" \
    --arg scanGate "$scan_gate" \
    --argjson packages "$packages" \
    --argjson counts "$counts" \
    '{
      id: $id,
      reference: $reference,
      registryDigest: $registryDigest,
      localImageId: $localImageId,
      platform: "linux/amd64",
      sbom: {format: "spdx-json", spdxVersion: "SPDX-2.3", packages: $packages, path: $sbomPath, sha256: $sbomSha},
      vulnerabilityScan: {path: $scanPath, sha256: $scanSha, counts: $counts, unwaivedCritical: $counts.critical, gate: $scanGate}
    }' >>"$run_root/images.ndjson"
done < <(jq -c '.images[]' "$run_root/scope.json")

jq -s '.' "$run_root/images.ndjson" >"$run_root/images.json"
scope_sha="sha256:$(sha256sum "$run_root/scope.json" | awk '{print $1}')"
db_status_sha="sha256:$(sha256sum "$run_root/grype-db-status.json" | awk '{print $1}')"
jq -n \
  --arg runId "$run_id" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg hostname "$(hostname)" \
  --arg subject "$scope_policy" \
  --arg scopeSha "$scope_sha" \
  --arg dbStatusSha "$db_status_sha" \
  --arg syftVersion "$syft_version" \
  --arg syftSha "$syft_sha" \
  --arg grypeVersion "$grype_version" \
  --arg grypeSha "$grype_sha" \
  --arg cosignVersion "$cosign_version" \
  --arg cosignSha "$cosign_sha" \
  --slurpfile images "$run_root/images.json" \
  '{
    schemaVersion: 1,
    taskId: "P1-M0-04",
    runId: $runId,
    generatedAt: $generatedAt,
    subject: $subject,
    environment: {server: $hostname, platform: "linux/amd64"},
    scopeSha256: $scopeSha,
    vulnerabilityDatabaseStatusSha256: $dbStatusSha,
    tools: [
      {name: "syft", version: $syftVersion, sha256: $syftSha},
      {name: "grype", version: $grypeVersion, sha256: $grypeSha},
      {name: "cosign", version: $cosignVersion, sha256: $cosignSha}
    ],
    images: $images[0]
  }' >"$run_root/signing-statement.json"

export COSIGN_PASSWORD
COSIGN_PASSWORD=$(<"$cosign_password_file")
"$cosign_bin" sign-blob --yes --key "$cosign_key" \
  --bundle "$run_root/signing-statement.sigstore.json" "$run_root/signing-statement.json" \
  >"$run_root/signature-create.log" 2>&1
"$cosign_bin" verify-blob --insecure-ignore-tlog --key "$cosign_public_key" \
  --bundle "$run_root/signing-statement.sigstore.json" "$run_root/signing-statement.json" \
  >"$run_root/signature-verify.log" 2>&1
unset COSIGN_PASSWORD
cp "$cosign_public_key" "$run_root/signing-public.pem"

find "$run_root" -type f -exec chmod 0600 {} +
total_critical=$(jq '[.[].vulnerabilityScan.unwaivedCritical] | add' "$run_root/images.json")
technical_status=passed
if [[ "$total_critical" -gt 0 ]]; then technical_status=blocked; fi
jq -n \
  --arg runId "$run_id" \
  --arg runRoot "$run_root" \
  --arg technicalStatus "$technical_status" \
  --arg statementSha "sha256:$(sha256sum "$run_root/signing-statement.json" | awk '{print $1}')" \
  --arg bundleSha "sha256:$(sha256sum "$run_root/signing-statement.sigstore.json" | awk '{print $1}')" \
  --arg publicKeySha "sha256:$(sha256sum "$run_root/signing-public.pem" | awk '{print $1}')" \
  --argjson totalCritical "$total_critical" \
  '{
    runId: $runId,
    runRoot: $runRoot,
    technicalStatus: $technicalStatus,
    totalUnwaivedCritical: $totalCritical,
    signatureVerified: true,
    statementSha256: $statementSha,
    bundleSha256: $bundleSha,
    publicKeySha256: $publicKeySha
  }' >"$run_root/run-result.json"
chmod 0600 "$run_root/run-result.json"
printf 'run_root=%s\ntechnical_status=%s\nunwaived_critical=%s\n' "$run_root" "$technical_status" "$total_critical"

if [[ "$technical_status" != "passed" ]]; then exit 10; fi
