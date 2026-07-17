#!/usr/bin/env bash
set -euo pipefail

: "${YUJIAN_OFFLINE_MANIFEST:?set YUJIAN_OFFLINE_MANIFEST}"
test -f "$YUJIAN_OFFLINE_MANIFEST"
release_manifest="${YUJIAN_RELEASE_MANIFEST:-infra/release/release-manifest.json}"
chart_dir="${YUJIAN_HELM_CHART:-infra/helm/yujian-platform}"
test -f "$release_manifest"
test -f "$chart_dir/Chart.yaml"
test -f "$chart_dir/values.schema.json"
node tools/private-deployment/verify-offline-manifest.mjs "$YUJIAN_OFFLINE_MANIFEST"
node tools/private-deployment/upgrade-preflight.mjs "$release_manifest"
for migration in 001_platform.sql 002_domain_expansion.sql 003_agent_control.sql 004_media_ops.sql 005_outbox_delivery.sql 006_platform_store.sql 007_webhook_destinations.sql 008_rtc_telemetry.sql 009_p2_closure.sql 010_data_rights_recovery.sql; do
  test -f "infra/database/migrations/$migration" || { echo "missing migration: $migration" >&2; exit 1; }
done
command -v kubectl >/dev/null
command -v helm >/dev/null
command -v jq >/dev/null
command -v node >/dev/null
kubectl version --client >/dev/null
helm version --client >/dev/null
manifest_version="$(jq -r '.schemaVersion // empty' "$YUJIAN_OFFLINE_MANIFEST")"
[[ "$manifest_version" == "1" ]] || { echo "offline manifest schemaVersion must be 1" >&2; exit 1; }
release_channel="$(jq -r '.releaseChannel // empty' "$release_manifest")"
[[ -n "$release_channel" ]] || { echo "release manifest channel is missing" >&2; exit 1; }
helm lint "$chart_dir" --set rtc.primaryWsUrl=ws://placeholder.invalid --set platformRuntime.modulePath=/etc/yujian/platform-runtime.mjs >/dev/null
printf 'private deployment preflight passed\nchart=%s\noffline_manifest=%s\nrelease_channel=%s\n' \
  "$chart_dir" "$YUJIAN_OFFLINE_MANIFEST" "$release_channel"
echo "cluster install, migration, restore and rollback remain an operator action"
