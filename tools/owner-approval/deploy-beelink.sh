#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
REMOTE=${YUJIAN_OWNER_APPROVAL_REMOTE:-beelink@100.110.127.117}
DATA_ROOT=${YUJIAN_OWNER_APPROVAL_DATA_ROOT:-/data/models/yujianAI}
RELEASE_ID=${YUJIAN_OWNER_APPROVAL_RELEASE_ID:-owner-approval-$(date -u +%Y%m%dT%H%M%SZ)}
RELEASE_ROOT="$DATA_ROOT/owner-approval/releases/$RELEASE_ID"
DEPLOY_ROOT="$DATA_ROOT/owner-approval/deployment"

for command in npm rsync ssh; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 2; }
done

original_evidence_hashes() {
  ssh "$REMOTE" "if [ -d '$DATA_ROOT/evidence/p1-m0-04/owner-approvals' ]; then find '$DATA_ROOT/evidence/p1-m0-04/owner-approvals' -mindepth 2 -maxdepth 2 -type f \\( -name decision.json -o -name signature.json -o -name result.json \\) -exec sha256sum {} \\; | sort; fi"
}

cd "$REPO_ROOT"
npm run build -w @yujian/owner-approval
ORIGINAL_EVIDENCE_BEFORE=$(original_evidence_hashes)
ssh "$REMOTE" "mkdir -p '$RELEASE_ROOT/dist' '$RELEASE_ROOT/apps' '$RELEASE_ROOT/templates' '$DEPLOY_ROOT' '$DATA_ROOT/evidence/p1-m0-04/owner-approvals' && chmod 0700 '$DATA_ROOT/owner-approval' '$DATA_ROOT/owner-approval/releases' '$DEPLOY_ROOT' '$DATA_ROOT/evidence/p1-m0-04/owner-approvals'"
rsync -a --delete services/owner-approval/dist/ "$REMOTE:$RELEASE_ROOT/dist/"
rsync -a --delete apps/owner-approval/ "$REMOTE:$RELEASE_ROOT/apps/"
rsync -a --delete docs/governance/owner-decisions/ "$REMOTE:$RELEASE_ROOT/templates/"
rsync -a docs/acceptance/p1-owner-key-registry.json "$REMOTE:$RELEASE_ROOT/p1-owner-key-registry.json"
rsync -a infra/owner-approval/beelink/compose.yaml infra/owner-approval/beelink/deployment.env "$REMOTE:$DEPLOY_ROOT/"
ssh "$REMOTE" "set -e
  chmod -R go-rwx '$RELEASE_ROOT'
  ln -sfn '$RELEASE_ROOT' '$DATA_ROOT/owner-approval/current'
  cd '$DEPLOY_ROOT'
  docker compose --project-name yujian-owner-approval --env-file deployment.env -f compose.yaml up -d --force-recreate
  docker inspect yujian-owner-approval --format '{{.Name}} {{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}'"
ORIGINAL_EVIDENCE_AFTER=$(original_evidence_hashes)
if [[ "$ORIGINAL_EVIDENCE_BEFORE" != "$ORIGINAL_EVIDENCE_AFTER" ]]; then
  echo "original owner evidence changed during deployment" >&2
  exit 1
fi
printf '%s\n' "$RELEASE_ID"
