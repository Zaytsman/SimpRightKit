#!/usr/bin/env bash
# Copies a folder of wiki pages to the repository's GitHub wiki (<repo>.wiki.git): the publish-wiki action.
#
# Usage: publish-wiki.sh <folder>
#
# The folder is the source: pages added, changed or removed there are added, changed or removed in the wiki
# (rsync --delete), and edits made in the wiki's web editor are overwritten by the next publish. The wiki's git
# repository exists only after its first page was created in the web UI.
#
# Runs in GitHub Actions in the project's folder, with GH_TOKEN set to a token that can push.
set -euo pipefail

SOURCE="${1:?usage: publish-wiki.sh <folder>}"
wiki_url="https://x-access-token:${GH_TOKEN:?GH_TOKEN is not set}@github.com/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}.wiki.git"
if ! git clone --quiet "$wiki_url" "$RUNNER_TEMP/wiki"; then
  echo "::error::Can't clone ${GITHUB_REPOSITORY}.wiki.git. Turn on Wikis in the repository settings and create the first page in the web UI, then re-run."
  exit 1
fi

rsync -a --delete --exclude '.git' "${SOURCE%/}/" "$RUNNER_TEMP/wiki/"

cd "$RUNNER_TEMP/wiki"
git add -A
if git diff --cached --quiet; then
  echo "The wiki is already up to date."
  exit 0
fi
git status --short
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit --quiet -m "Sync from ${GITHUB_REPOSITORY}@${GITHUB_SHA::7}"
git push --quiet origin HEAD
echo "Published: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/wiki"
