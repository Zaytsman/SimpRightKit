#!/usr/bin/env bash
# Publishes this run's Playwright report to the gh-pages branch (served by GitHub Pages): the publish-run action.
#
# Usage: publish-run.sh <family> [--latest-coverage]
#   <family>           the run's id in simpright.yml runs, e.g. daily-ui-regression, custom-api
#   --latest-coverage  also publish test-results/api-coverage as latest/api-coverage
#
# simpright-portal publish-run (@simpright/portal, installed by npm ci) writes the files; this script checks out
# gh-pages, runs it and pushes the result (../lib/gh-pages-lib.sh). Runs in GitHub Actions in the project's folder, with
# GH_TOKEN and KEEP_RUNS (how many runs of the family stay on the site: the action's keep input) set.
set -euo pipefail
source "$(dirname "$0")/../lib/gh-pages-lib.sh"

USAGE="usage: publish-run.sh <family> [--latest-coverage]"
FAMILY="${1:?$USAGE}"
SITE=".gh-pages"
args=(--site "$SITE" --run "$FAMILY" --number "${GITHUB_RUN_NUMBER:?GITHUB_RUN_NUMBER is not set}")
case "${2:-}" in
  '') ;;
  --latest-coverage) args+=(--latest-coverage) ;;
  *) echo "$USAGE" >&2; exit 2 ;;
esac
if [ -n "${KEEP_RUNS:-}" ]; then
  args+=(--keep "$KEEP_RUNS")
fi

ghp_checkout "$SITE"
npx --no-install simpright-portal publish-run "${args[@]}"
ghp_publish "$SITE" "Publish $FAMILY run-$GITHUB_RUN_NUMBER"
