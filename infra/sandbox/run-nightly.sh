#!/usr/bin/env bash
set -euo pipefail

: "${YUJIAN_SANDBOX_RTC_IMAGE:?set a pinned LiveKit image digest}"
: "${YUJIAN_SANDBOX_REDIS_IMAGE:?set a pinned Redis image digest}"
: "${YUJIAN_SANDBOX_API_KEY:?set a short-lived sandbox key}"
: "${YUJIAN_SANDBOX_API_SECRET:?set a short-lived sandbox secret}"

[[ "$YUJIAN_SANDBOX_RTC_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "RTC image must use a digest" >&2; exit 2; }
[[ "$YUJIAN_SANDBOX_REDIS_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "Redis image must use a digest" >&2; exit 2; }
[[ "$YUJIAN_SANDBOX_API_KEY" =~ ^[A-Za-z0-9_-]{8,64}$ ]] || { echo "sandbox key is invalid" >&2; exit 2; }
[[ "$YUJIAN_SANDBOX_API_SECRET" =~ ^[A-Za-z0-9_-]{32,128}$ ]] || { echo "sandbox secret is invalid" >&2; exit 2; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }

project="yujian-sandbox-${GITHUB_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
compose=(docker compose -p "$project" -f infra/sandbox/compose.yaml)
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=$project") ]]; then
    echo "sandbox cleanup left containers behind" >&2
    return 1
  fi
}
trap cleanup EXIT INT TERM

export YUJIAN_REDIS_IMAGE="$YUJIAN_SANDBOX_REDIS_IMAGE"
export YUJIAN_RTC_IMAGE="$YUJIAN_SANDBOX_RTC_IMAGE"
export LIVEKIT_API_KEY="$YUJIAN_SANDBOX_API_KEY"
export LIVEKIT_API_SECRET="$YUJIAN_SANDBOX_API_SECRET"
"${compose[@]}" config --quiet
"${compose[@]}" up -d
"${compose[@]}" ps --format json
test "$("${compose[@]}" ps -q | wc -l | tr -d ' ')" -eq 2
printf 'YUJIAN_SANDBOX_PASSED project=%s lifecycle=started_and_destroyed\n' "$project"
