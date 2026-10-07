#!/usr/bin/env bash
# Cut a release. GitHub Actions builds and publishes the site when the push lands.
#   1. bumps the version in package.json (patch by default)
#   2. commits everything and tags it vX.Y.Z
#   3. pushes commit + tag to GitHub
#
# Usage:  ./deploy.sh [patch|minor|major]
set -euo pipefail

BUMP="${1:-patch}"
case "$BUMP" in patch|minor|major) ;; *) echo "Usage: ./deploy.sh [patch|minor|major]"; exit 1;; esac

cd "$(dirname "$0")"

npm version "$BUMP" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"

git add -A
git commit -q -m "Release v$VERSION"
git tag "v$VERSION"
git push -q origin HEAD --tags

echo "Released v$VERSION. Watch the build: https://github.com/bHVrYXM/531pwa/actions"
