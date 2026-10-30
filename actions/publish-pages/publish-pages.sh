#!/usr/bin/env bash
# Publishes the Test Cases pages (from the scenarios), the Bugs page (from the bugs) and the dashboard to the gh-pages
# branch (served by GitHub Pages): the publish-pages action.
#
# Usage: publish-pages.sh
#
# simpright-portal build-pages (@simpright/portal) writes the files (test-cases/<layer>/, bugs/, index.html and
# portal.json; the rest of the site is publish-run's); this script checks out gh-pages, runs it and pushes the result
# (../lib/gh-pages-lib.sh). Runs in GitHub Actions in the project's folder after npm ci, with GH_TOKEN set.
set -euo pipefail
source "$(dirname "$0")/../lib/gh-pages-lib.sh"

SITE=".gh-pages"
ghp_checkout "$SITE"
npx --no-install simpright-portal build-pages --site "$SITE"
ghp_publish "$SITE" "Publish test cases and bugs (${GITHUB_SHA:0:7})"
