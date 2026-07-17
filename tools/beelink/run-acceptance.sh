#!/usr/bin/env bash
set -euo pipefail

: "${YUJIAN_RTC_NODE_IP:?YUJIAN_RTC_NODE_IP must be set}"
: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY must be set}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET must be set}"
: "${YUJIAN_PLATFORM_TEST_CREDENTIAL:?YUJIAN_PLATFORM_TEST_CREDENTIAL must be set}"

primary_port="${YUJIAN_RTC_PRIMARY_PORT:-7880}"
secondary_port="${YUJIAN_RTC_SECONDARY_PORT:-7980}"
primary_tcp_port="${YUJIAN_RTC_PRIMARY_TCP_PORT:-7881}"
primary_udp_port="${YUJIAN_RTC_PRIMARY_UDP_PORT:-7882}"
secondary_tcp_port="${YUJIAN_RTC_SECONDARY_TCP_PORT:-7981}"
secondary_udp_port="${YUJIAN_RTC_SECONDARY_UDP_PORT:-7982}"
export YUJIAN_RTC_PRIMARY_PORT="$primary_port"
export YUJIAN_RTC_SECONDARY_PORT="$secondary_port"
export YUJIAN_RTC_PRIMARY_TCP_PORT="$primary_tcp_port"
export YUJIAN_RTC_PRIMARY_UDP_PORT="$primary_udp_port"
export YUJIAN_RTC_SECONDARY_TCP_PORT="$secondary_tcp_port"
export YUJIAN_RTC_SECONDARY_UDP_PORT="$secondary_udp_port"

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
  docker compose "${compose_files[@]}" logs --no-color --tail=300 \
    yujian-rtc-a yujian-rtc-b redis >"$report_directory/rtc.log" 2>&1 || true
  if [[ "${YUJIAN_KEEP_RTC_UP:-false}" != "true" ]]; then
    docker compose "${compose_files[@]}" down >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Starting Beelink acceptance run $run_id"
bash tools/beelink/preflight.sh
npm ci
npm run verify:upstream:network
npm run upstream:mirror:sync
npm run check

docker compose "${compose_files[@]}" config --quiet
docker compose "${compose_files[@]}" up -d --wait
docker compose "${compose_files[@]}" ps

export YUJIAN_RTC_PRIMARY_URL="ws://${YUJIAN_RTC_NODE_IP}:${primary_port}"
export YUJIAN_RTC_SECONDARY_URL="ws://${YUJIAN_RTC_NODE_IP}:${secondary_port}"
npm run test:integration:rtc

printf 'status=passed\nrun_id=%s\nserver_runtime=passed\nclient_runtime=separate\nrtc_kept_up=%s\ncompleted_at=%s\n' \
  "$run_id" "${YUJIAN_KEEP_RTC_UP:-false}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$report_directory/summary.txt"
echo "Beelink server acceptance passed; report: $report_directory"
