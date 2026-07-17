#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Client preflight failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

for command_name in node npm flutter dart curl; do
  require_command "$command_name"
done

chrome_found=false
for chrome_name in \
  "${YUJIAN_CHROME_BIN:-}" \
  google-chrome google-chrome-stable chromium chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [[ -n "$chrome_name" ]] || continue
  if [[ -x "$chrome_name" ]] || command -v "$chrome_name" >/dev/null 2>&1; then
    chrome_found=true
    break
  fi
done
[[ "$chrome_found" == true ]] || fail "Chrome or Chromium is required"

echo "Client preflight passed"
echo "OS: $(uname -srmo)"
echo "Node: $(node --version)"
echo "Flutter: $(flutter --version 2>/dev/null | sed -n '1p')"
echo "Chrome: available"
