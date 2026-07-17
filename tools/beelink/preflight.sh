#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Beelink preflight failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

[[ "$(uname -s)" == "Linux" ]] || fail "Linux is required"
[[ "$(uname -m)" == "x86_64" ]] || fail "x86_64 is required"
: "${YUJIAN_RTC_NODE_IP:?YUJIAN_RTC_NODE_IP must be set}"

for command_name in tailscale nvidia-smi docker node npm curl; do
  require_command "$command_name"
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" == "24" ]] || fail "Node.js 24 is required, found $(node --version)"

tailscale_ips="$(tailscale ip -4)"
grep -Fxq "$YUJIAN_RTC_NODE_IP" <<<"$tailscale_ips" ||
  fail "YUJIAN_RTC_NODE_IP is not assigned to this Tailscale node"

mapfile -t gpu_names < <(nvidia-smi --query-gpu=name --format=csv,noheader)
[[ "${#gpu_names[@]}" -eq 1 ]] ||
  fail "exactly one NVIDIA GPU is required, found ${#gpu_names[@]}"
[[ "${gpu_names[0]}" == *"RTX 5090"* ]] ||
  fail "the GPU must be an RTX 5090, found ${gpu_names[0]}"

echo "Beelink preflight passed"
echo "OS: $(uname -srmo)"
echo "Node: $(node --version)"
echo "GPU: ${gpu_names[0]}"
echo "Tailscale IP: $YUJIAN_RTC_NODE_IP"
echo "Client SDK/browser checks: run on the client host"
