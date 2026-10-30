#!/usr/bin/env bash
# Replaces the history of the gh-pages branch with a single commit that holds the current site: the squash-pages
# action.
#
# Usage: squash-pages.sh
#
# Every publish adds a commit with a full report, and the old commits keep every report ever published
# (pruned runs too), so the branch only grows. The site doesn't change: the new commit has the same files.
# The push uses --force-with-lease, so it goes through only while gh-pages is still the commit read here:
# a publish that lands in between makes it fail (nothing is lost; run it again later). A publish that read
# gh-pages before the squash and pushes after it is rejected, rebases onto the new commit and retries
# (../lib/gh-pages-lib.sh).
#
# Runs in GitHub Actions in the repository's checkout, with GH_TOKEN set.
set -euo pipefail

export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

git remote set-url origin "https://x-access-token:${GH_TOKEN:?GH_TOKEN is not set}@github.com/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}.git"
git fetch --depth=1 origin gh-pages
OLD="$(git rev-parse FETCH_HEAD)"
NEW="$(git commit-tree "FETCH_HEAD^{tree}" -m "Squash the gh-pages history (was ${OLD:0:7})")"
git push --force-with-lease="refs/heads/gh-pages:$OLD" origin "$NEW:refs/heads/gh-pages"
echo "gh-pages is now a single commit, ${NEW:0:7} (was ${OLD:0:7}); the site's files are unchanged."
