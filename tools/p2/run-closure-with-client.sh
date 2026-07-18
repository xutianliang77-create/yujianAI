#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HOST=${YUJIAN_BEELINK_HOST:-beelink@100.110.127.117}
REMOTE_ROOT=${YUJIAN_BEELINK_PROJECT_ROOT:-/home/beelink/yujianAI}
REMOTE_DATA_ROOT=${YUJIAN_BEELINK_DATA_ROOT:-"$REMOTE_ROOT/data"}
REMOTE_NODE_DIR=${YUJIAN_BEELINK_NODE_DIR:-/home/beelink/.local/node-v24.18.0-linux-x64/bin}
LOCAL_INPUT="/tmp/yujian-p2-client-probe-$$.json"
LOCAL_RESULT="/tmp/yujian-p2-client-probe-$$.result.json"
LOCAL_LOG="/tmp/yujian-p2-closure-$$.log"
REMOTE_PID=""
CLIENT_PID=""

for remote_path in "$REMOTE_ROOT" "$REMOTE_DATA_ROOT" "$REMOTE_NODE_DIR"; do
  [[ "$remote_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "unsafe Beelink path: $remote_path" >&2; exit 2; }
done
REMOTE_REPORT="$REMOTE_DATA_ROOT/p2/reports/p2-closure-acceptance.json"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  [[ -z "$CLIENT_PID" ]] || kill "$CLIENT_PID" >/dev/null 2>&1 || true
  [[ -z "$REMOTE_PID" ]] || kill "$REMOTE_PID" >/dev/null 2>&1 || true
  for path in "$LOCAL_INPUT" "$LOCAL_RESULT" "$LOCAL_LOG"; do [[ ! -e "$path" ]] || unlink "$path"; done
  exit "$status"
}
trap cleanup EXIT INT TERM

ssh -o BatchMode=yes "$HOST" "export PATH='$REMOTE_NODE_DIR':\$PATH; cd '$REMOTE_ROOT' && \
  find '$REMOTE_DATA_ROOT/p2' -maxdepth 1 -type f -name 'client-probe-p2-closure-*.json*' -delete && \
  if [[ -f '$REMOTE_REPORT' && \$(jq -r '.cleanup.status // \"running\"' '$REMOTE_REPORT') != complete ]]; then \
    set -a; . '$REMOTE_DATA_ROOT/p2/runtime.env'; set +a; \
    export YUJIAN_PROJECT_ROOT='$REMOTE_ROOT' YUJIAN_DATA_ROOT='$REMOTE_DATA_ROOT' \
      YUJIAN_P2_CLOSURE_REPORT='$REMOTE_REPORT' \
      NODE_EXTRA_CA_CERTS=\"\$YUJIAN_KMS_CA_FILE\"; \
    export YUJIAN_KMS_ADMIN_TOKEN=\$(jq -r .root_token '$REMOTE_DATA_ROOT/p2/openbao-ha-init.json'); \
    node tools/p2/cleanup-closure.mjs; \
  fi"
ssh -o BatchMode=yes "$HOST" "export PATH='$REMOTE_NODE_DIR':\$PATH; cd '$REMOTE_ROOT' && \
  YUJIAN_DATA_ROOT='$REMOTE_DATA_ROOT' \
  YUJIAN_P2_ENV_FILE='$REMOTE_DATA_ROOT/p2/runtime.env' \
  YUJIAN_P2_CLOSURE_REPORT='$REMOTE_REPORT' \
  bash tools/p2/run-closure-acceptance.sh" >"$LOCAL_LOG" 2>&1 &
REMOTE_PID=$!

REMOTE_INPUT=""
for _ in $(seq 1 180); do
  kill -0 "$REMOTE_PID" 2>/dev/null || { tail -n 80 "$LOCAL_LOG" >&2; exit 1; }
  REMOTE_INPUT=$(ssh -o BatchMode=yes "$HOST" "find '$REMOTE_DATA_ROOT/p2' -maxdepth 1 -type f -name 'client-probe-p2-closure-*.json' -print -quit" 2>/dev/null || true)
  [[ -z "$REMOTE_INPUT" ]] || break
  sleep 1
done
[[ -n "$REMOTE_INPUT" ]] || { echo "Beelink did not publish the external RTC client probe" >&2; exit 1; }

scp -q "$HOST:$REMOTE_INPUT" "$LOCAL_INPUT"
YUJIAN_P2_RTC_CLIENT_URL=${YUJIAN_P2_RTC_CLIENT_URL:-ws://100.110.127.117:7880} \
  node "$ROOT/tools/p2/rtc-client-probe.mjs" "$LOCAL_INPUT" "$LOCAL_RESULT" &
CLIENT_PID=$!
for _ in $(seq 1 40); do [[ -s "$LOCAL_RESULT" ]] && break; sleep 0.5; done
[[ -s "$LOCAL_RESULT" ]] || { echo "local RTC client did not produce a result" >&2; exit 1; }
scp -q "$LOCAL_RESULT" "$HOST:$REMOTE_INPUT.result.json"
wait "$CLIENT_PID"
CLIENT_PID=""
wait "$REMOTE_PID"
REMOTE_PID=""
tail -n 80 "$LOCAL_LOG"
