#!/usr/bin/env bash
# Builds the `release` branch: only the files Sofia needs at runtime, plus the engine's
# libraries, so people who install her never run `npm install`.
# The marketplace (.claude-plugin/marketplace.json on main) points at this branch.
# Usage: scripts/release.sh   (then review and `git push origin release`)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first." >&2; exit 1; }

VERSION="$(node -p "require('./.claude-plugin/plugin.json').version")"
SOURCE_SHA="$(git rev-parse --short HEAD)"
OUT="$(mktemp -d)/release"

if git show-ref --quiet refs/heads/release; then
  git worktree add --quiet "$OUT" release
else
  git worktree add --quiet --detach "$OUT"
  git -C "$OUT" checkout --quiet --orphan release
fi
trap 'git worktree remove --force "$OUT" >/dev/null 2>&1 || true' EXIT

# Start from an empty tree, then copy what ships.
git -C "$OUT" rm -rq --ignore-unmatch . >/dev/null
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

SHIP=(
  .claude-plugin/plugin.json
  agents
  skills
  catalog/checks.json
  ui/dist
  engine/bin
  engine/src
  engine/package.json
  engine/package-lock.json
  LICENSE
  README.md
)
for p in "${SHIP[@]}"; do
  mkdir -p "$OUT/$(dirname "$p")"
  cp -R "$p" "$OUT/$p"
done

# The engine's libraries. No browser download: Sofia uses the user's own Chrome.
( cd "$OUT/engine" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev --no-audit --no-fund --ignore-scripts --loglevel=error )

# Smoke test: the engine starts and finds its catalog.
node "$OUT/engine/bin/launch-check.js" --help >/dev/null

git -C "$OUT" add -A -f .
if git -C "$OUT" diff --cached --quiet; then
  echo "release is already up to date with $SOURCE_SHA (v$VERSION)."
  exit 0
fi
git -C "$OUT" commit -qm "Sofia v$VERSION (from $SOURCE_SHA)"
echo "release branch updated: v$VERSION from $SOURCE_SHA"
echo "Push it with: git push origin release"
