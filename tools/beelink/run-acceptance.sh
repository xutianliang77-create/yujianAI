#!/usr/bin/env bash
set -euo pipefail

: "${YUJIAN_RTC_NODE_IP:?YUJIAN_RTC_NODE_IP must be set}"
: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY must be set}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET must be set}"
: "${YUJIAN_PLATFORM_TEST_CREDENTIAL:?YUJIAN_PLATFORM_TEST_CREDENTIAL must be set}"

[[ "$LIVEKIT_API_KEY" =~ ^[A-Za-z0-9_-]{8,64}$ ]] || {
  echo "LIVEKIT_API_KEY must be 8-64 URL-safe characters" >&2
  exit 1
}
[[ "$LIVEKIT_API_SECRET" =~ ^[A-Za-z0-9_-]{32,128}$ ]] || {
  echo "LIVEKIT_API_SECRET must be 32-128 URL-safe characters" >&2
  exit 1
}
[[ "$YUJIAN_PLATFORM_TEST_CREDENTIAL" =~ ^[A-Za-z0-9_-]{32,128}$ ]] || {
  echo "YUJIAN_PLATFORM_TEST_CREDENTIAL must be 32-128 URL-safe characters" >&2
  exit 1
}

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
report_directory="outputs/beelink/$run_id"
mkdir -p "$report_directory"
exec > >(tee "$report_directory/acceptance.log") 2>&1

compose_files=(
  -f infra/livekit/local/compose.yaml
  -f infra/livekit/beelink/compose.override.yaml
)
compatibility_server_pid=""

cleanup() {
  if [[ -n "$compatibility_server_pid" ]]; then
    kill "$compatibility_server_pid" >/dev/null 2>&1 || true
  fi
  docker compose "${compose_files[@]}" down >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Starting Beelink acceptance run $run_id"
bash tools/beelink/preflight.sh
npm ci
npm run verify:upstream:network
npm run upstream:mirror:sync
npm run check

(
  cd tests/compatibility/flutter
  PUB_HOSTED_URL=https://pub.dev flutter pub get
  dart analyze
  flutter test
  flutter build web --base-href /flutter/
)
npm run build:compat:web

docker compose "${compose_files[@]}" config --quiet
docker compose "${compose_files[@]}" up -d --wait
docker compose "${compose_files[@]}" ps

export YUJIAN_RTC_PRIMARY_URL="ws://${YUJIAN_RTC_NODE_IP}:7880"
export YUJIAN_RTC_SECONDARY_URL="ws://${YUJIAN_RTC_NODE_IP}:7980"
npm run test:integration:rtc

YUJIAN_RTC_API_KEY="$LIVEKIT_API_KEY" \
YUJIAN_RTC_API_SECRET="$LIVEKIT_API_SECRET" \
node tools/compatibility/serve-web-harness.mjs &
compatibility_server_pid="$!"

for _ in {1..100}; do
  if curl --fail --silent http://127.0.0.1:4173/healthz >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent http://127.0.0.1:4173/healthz >/dev/null
YUJIAN_WEB_COMPAT_URL=http://127.0.0.1:4173 \
node tools/compatibility/run-browser-acceptance.mjs

printf 'status=passed\nrun_id=%s\ncompleted_at=%s\n' \
  "$run_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$report_directory/summary.txt"
echo "Beelink acceptance passed; report: $report_directory"
