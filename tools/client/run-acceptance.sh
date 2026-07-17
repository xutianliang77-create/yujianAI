#!/usr/bin/env bash
set -euo pipefail

: "${YUJIAN_RTC_PRIMARY_URL:?YUJIAN_RTC_PRIMARY_URL must be set}"
: "${YUJIAN_RTC_SECONDARY_URL:?YUJIAN_RTC_SECONDARY_URL must be set}"
: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY must be set}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET must be set}"

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
report_directory="outputs/client/$run_id"
mkdir -p "$report_directory"
exec > >(tee "$report_directory/acceptance.log") 2>&1

harness_pid=""
cleanup() {
  if [[ -n "$harness_pid" ]]; then
    kill "$harness_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Starting client acceptance run $run_id"
bash tools/client/preflight.sh

(
  cd tests/compatibility/flutter
  PUB_HOSTED_URL=https://pub.dev flutter pub get
  dart analyze
  flutter test
  flutter build web --base-href /flutter/
) 2>&1 | tee "$report_directory/flutter.log"
npm run build:compat:web

YUJIAN_RTC_API_KEY="$LIVEKIT_API_KEY" \
YUJIAN_RTC_API_SECRET="$LIVEKIT_API_SECRET" \
YUJIAN_WEB_COMPAT_HOST="${YUJIAN_WEB_COMPAT_HOST:-127.0.0.1}" \
node tools/compatibility/serve-web-harness.mjs >"$report_directory/web-harness.log" 2>&1 &
harness_pid="$!"

check_host="${YUJIAN_WEB_COMPAT_CHECK_HOST:-127.0.0.1}"
check_port="${YUJIAN_WEB_COMPAT_PORT:-4173}"
for _ in {1..100}; do
  if curl --fail --silent "http://${check_host}:${check_port}/healthz" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent "http://${check_host}:${check_port}/healthz" >/dev/null
YUJIAN_WEB_COMPAT_URL="http://127.0.0.1:${check_port}" \
YUJIAN_CHROME_BIN="${YUJIAN_CHROME_BIN:-}" \
node tools/compatibility/run-browser-acceptance.mjs

printf 'status=passed\nrun_id=%s\nserver_runtime=beelink\nclient_runtime=passed\ncompleted_at=%s\n' \
  "$run_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$report_directory/summary.txt"
echo "Client acceptance passed; report: $report_directory"
