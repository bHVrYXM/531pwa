#!/usr/bin/env bash
# Release + publish.
#   1. bumps the version in package.json (patch by default)
#   2. commits the source and tags it vX.Y.Z (and pushes to your PRIVATE source repo, if "origin" is set)
#   3. builds and publishes ONLY the built files to the public Pages repo
#
# Usage:  ./deploy.sh [patch|minor|major]
set -euo pipefail

PAGES_REMOTE="${DEPLOY_REMOTE:-https://github.com/bHVrYXM/531pwa.git}"
BUMP="${1:-patch}"
case "$BUMP" in patch|minor|major) ;; *) echo "Usage: ./deploy.sh [patch|minor|major]"; exit 1;; esac

cd "$(dirname "$0")"

npm version "$BUMP" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"

git add -A
git commit -q -m "Release v$VERSION"
git tag "v$VERSION"
if git remote get-url origin >/dev/null 2>&1; then
  git push -q origin HEAD --tags
else
  echo "(no 'origin' remote yet — source not pushed. Add your private repo to enable that.)"
fi

npm run build

cd dist
touch .nojekyll            # tell GitHub Pages to serve files as-is
rm -rf .git
git init -q
git checkout -q -b main
git add -A
git commit -q -m "v$VERSION"
git push -f -q "$PAGES_REMOTE" main
rm -rf .git

echo "Released v$VERSION. GitHub Pages usually updates within a minute."
