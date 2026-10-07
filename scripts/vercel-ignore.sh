#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = skip this build, exit 1 = build.
#
# Skips only when every file changed since the previous deployed commit is on the
# allow-list below, which holds paths the built site never reads. Anything else
# builds: unknown paths, a missing or unfetchable previous commit, any error.
# Applies to Production and Preview builds alike.
#
# Test hook: VERCEL_IGNORE_FILES (newline-separated) replaces the git diff.

NON_SITE='^(\.github/|\.claude/|tests/|docs/|mcp/|glama/|glama\.json$|playwright\.config\.ts$|README\.md$|CHANGELOG\.md$|CONTRIBUTING\.md$|LICENSE$)'

build() { echo "vercel-ignore: build ($1)"; exit 1; }

# Any failure from here on means build, never skip.
trap 'build "script error"' ERR
set -eE -o pipefail

if [ -n "${VERCEL_IGNORE_FILES+x}" ]; then
  changed="$VERCEL_IGNORE_FILES"
else
  prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
  [ -n "$prev" ] || build "no previous SHA"
  if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
    git fetch --quiet --depth=100 origin "$prev" 2>/dev/null || build "previous SHA not fetchable"
    git cat-file -e "$prev^{commit}" 2>/dev/null || build "previous SHA not available"
  fi
  changed="$(git diff --no-renames --name-only "$prev" HEAD)"
fi

[ -n "$changed" ] || build "no changed files listed"

while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Quoted or odd paths are never trusted.
  case "$f" in *\"*|*\\*|../*|*/../*|/*) build "unusual path $f" ;; esac
  if ! printf '%s\n' "$f" | grep -Eq "$NON_SITE"; then
    build "site file changed: $f"
  fi
done <<< "$changed"

echo "vercel-ignore: skip (only non-site files changed)"
exit 0
