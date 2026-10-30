#!/bin/bash
# scripts/baseline/release-app.sh: build the production app from a clean git archive of an exact commit and deploy it UNALIASED, then promote.
# Standing release path (CLAUDE.md: CLI deploys from a clean archive, pinned project, git push never deploys).
#   bash release-app.sh plan   <sha>            READ-ONLY: checks the sha, exports the archive, prints the commands
#   bash release-app.sh deploy <sha>            production deploy, NOT aliased (live site untouched). Prints the deployment URL.
#   bash release-app.sh promote <deployment-url> flips jewellerytv.vercel.app to that deployment (seconds)
# deploy and promote touch production: run only on Arijit's explicit go for that release.
set -euo pipefail
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
export VERCEL_PROJECT_ID=prj_Hr4mhkvvdaerwE74WKmhONopZyOy VERCEL_ORG_ID=team_gU7ItyRFnKvTa5XvIOMbWUcH
mode=${1:-}; arg=${2:-}
case "$mode" in
  plan|deploy)
    [ -n "$arg" ] || { echo "need a commit sha"; exit 2; }
    # Config-drift guard (2026-10-30 incident): a release must not ship while
    # a verified agent fix has been silently overwritten on either agent.
    echo "agent drift check:"
    (cd "$(dirname "$0")/.." && NODE_USE_SYSTEM_CA=1 node scripts/baseline/check-agent-drift.mjs) || {
      echo "REFUSING: agent drift alarm — restore the missing rules before releasing (scripts/baseline/check-agent-drift.mjs).";
      exit 4;
    }
    git -C "$REPO" fetch -q origin
    full=$(git -C "$REPO" rev-parse "$arg"); main=$(git -C "$REPO" rev-parse origin/main)
    if [ "$full" != "$main" ]; then
      # Allowed only when the commit is an ancestor of main AND everything since is docs-only (public/docs, README).
      git -C "$REPO" merge-base --is-ancestor "$full" "$main" || { echo "REFUSING: $arg is not on origin/main."; exit 3; }
      extra=$(git -C "$REPO" diff --name-only "$full" "$main" | grep -v -E '^app/(public/docs/|README\.md$)' || true)
      [ -z "$extra" ] || { echo "REFUSING: main has non-docs changes since $arg:"; echo "$extra"; exit 3; }
      echo "NOTE: releasing ${full:0:7}, tested; main is ${main:0:7} (docs-only commits ahead, deliberately NOT shipped)."
    fi
    EXPORT=$(mktemp -d /tmp/jtv-release-XXXXXX)
    git -C "$REPO" archive "$full" | tar -x -C "$EXPORT"          # archive from the repo ROOT, never from the old storefront/
    test -d "$EXPORT/app" || { echo "REFUSING: export has no app/ (wrong cwd trap)"; exit 4; }
    echo "export: $EXPORT  commit: ${full:0:7}  files: $(find "$EXPORT" -type f | wc -l | tr -d ' ')"
    ls "$EXPORT/app" | head -12 | tr '\n' ' '; echo
    echo "no secrets/env files in export: $(find "$EXPORT" -name '.env*' -not -name '.env.example' | wc -l | tr -d ' ') found (expect 0)"
    if [ "$mode" = plan ]; then echo "PLAN ONLY. Would run: (cd $EXPORT && vercel deploy --prod --skip-domain --yes)"; exit 0; fi
    cd "$EXPORT" && vercel deploy --prod --skip-domain --yes 2>&1 | tee "$EXPORT/deploy.log" | tail -5
    echo "EXPORT_DIR=$EXPORT" ;;
  promote)
    [ -n "$arg" ] || { echo "need the deployment url"; exit 2; }
    cd "$REPO/app" && vercel promote "$arg" --yes 2>&1 | tail -5 ;;
  *) echo "usage: release-app.sh plan|deploy <sha> | promote <deployment-url>"; exit 2 ;;
esac
