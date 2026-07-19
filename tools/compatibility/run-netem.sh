#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "run-netem.sh requires Linux tc; run it on the Beelink or a declared Linux runner" >&2
  exit 2
fi
if [[ "$(id -u)" != "0" ]]; then
  echo "run-netem.sh requires root to install and remove a qdisc" >&2
  exit 2
fi
command -v tc >/dev/null || { echo "tc is required" >&2; exit 2; }

interface="${YUJIAN_NETEM_INTERFACE:-$(ip route show default | awk 'NR == 1 {print $5}')}"
[[ "$interface" =~ ^[A-Za-z0-9_.:-]{1,32}$ ]] || {
  echo "YUJIAN_NETEM_INTERFACE is invalid" >&2
  exit 2
}

loss="${YUJIAN_NETEM_LOSS:-1%}"
delay="${YUJIAN_NETEM_DELAY:-100ms}"
jitter="${YUJIAN_NETEM_JITTER:-0ms}"
rate="${YUJIAN_NETEM_RATE:-}"
[[ "$loss" =~ ^[0-9]+([.][0-9]+)?%$ ]] || { echo "YUJIAN_NETEM_LOSS is invalid" >&2; exit 2; }
[[ "$delay" =~ ^[0-9]+([.][0-9]+)?(ms|us|s)$ ]] || { echo "YUJIAN_NETEM_DELAY is invalid" >&2; exit 2; }
[[ "$jitter" =~ ^[0-9]+([.][0-9]+)?(ms|us|s)$ ]] || { echo "YUJIAN_NETEM_JITTER is invalid" >&2; exit 2; }
if [[ -n "$rate" && ! "$rate" =~ ^[0-9]+([.][0-9]+)?(kbit|mbit|gbit)$ ]]; then
  echo "YUJIAN_NETEM_RATE is invalid" >&2
  exit 2
fi

if [[ "${1:-}" != "--" ]]; then
  echo "usage: YUJIAN_NETEM_LOSS=3% YUJIAN_NETEM_DELAY=100ms $0 -- command [args...]" >&2
  exit 2
fi
shift
[[ "$#" -gt 0 ]] || { echo "a command is required after --" >&2; exit 2; }

cleanup() {
  tc qdisc del dev "$interface" root >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
qdisc=(tc qdisc replace dev "$interface" root netem delay "$delay" "$jitter" loss "$loss")
if [[ -n "$rate" ]]; then qdisc+=(rate "$rate"); fi
"${qdisc[@]}"
printf 'YUJIAN_NETEM_ACTIVE interface=%s loss=%s delay=%s jitter=%s rate=%s\n' "$interface" "$loss" "$delay" "$jitter" "${rate:-unlimited}"
exec "$@"
