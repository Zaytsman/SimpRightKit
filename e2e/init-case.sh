#!/usr/bin/env bash
# One case of simpright init's E2E matrix. A fresh copy of SimpRightTemplate (the tag in e2e/template.json) is set up
# with this kit's packages, packed from the working tree, the way /simpright-setup does it: init, then apply, each
# after a dry run that must write nothing. Then the checks: the setup's skills are there, doctor --offline, the
# typecheck, the scenario validator, the examples the case keeps (on the live app), actionlint on the workflows apply
# generated, and a second apply that must change nothing. The E2E workflow runs every case; one runs here too (Git
# Bash on Windows):
#
#   bash e2e/init-case.sh <case> <none | api | ui | all>
#
# <case> names an answers file, e2e/answers/<case>.yml, or is `defaults` (init --defaults); then the examples to run,
# by Playwright project. Environment:
#   WORK        the folder for the copies and the tarballs (default: simpright-e2e in the temp folder); the case's copy,
#               WORK/<case>, is made anew
#   TARBALLS    a folder with the three packages' npm pack tarballs (default: the kit is built and packed into
#               WORK/tarballs)
#   KIT_REF     the kit commit apply pins the kit's actions to (default: the kit's HEAD)
#   ACTIONLINT  the actionlint binary (default: actionlint on PATH; without one the workflows aren't linted, except on
#               GitHub Actions, where that fails the case)
set -Eeuo pipefail

usage='usage: bash e2e/init-case.sh <case> <none | api | ui | all>'
CASE=${1:?$usage}
TESTS=${2:?$usage}
case $TESTS in none | api | ui | all) ;; *) echo "$usage" >&2; exit 2 ;; esac

KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ANSWERS=$KIT/e2e/answers/$CASE.yml
if [ "$CASE" != defaults ] && [ ! -f "$ANSWERS" ]; then echo "No answers for the case '$CASE' ($ANSWERS)." >&2; exit 2; fi

# GitHub Actions folds each step's output in the log; elsewhere each step gets a header line.
open_group=false
step() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    if $open_group; then echo '::endgroup::'; fi
    echo "::group::$*"
    open_group=true
  else
    printf '\n=== %s: %s\n' "$CASE" "$*"
  fi
}
fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    if $open_group; then echo '::endgroup::'; open_group=false; fi
    echo "::error title=init ($CASE)::$*"
  else
    echo "FAILED ($CASE): $*" >&2
  fi
  exit 1
}
trap 'fail "this command failed: $BASH_COMMAND"' ERR

# A path as npm and Node take it: Git Bash's /c/... becomes C:/... on Windows.
native() { if command -v cygpath > /dev/null; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }
# A value from a JSON file: json <file> <property access, e.g. .tag>.
json() { node -p "require(process.argv[1])$2" "$(native "$1")"; }
# The project's files as git sees them (ignored ones left out), as a tree hash: what a command must not change.
snapshot() { git -c core.safecrlf=false add --all && git write-tree; }
# Fails with `message` when the project's files differ from the snapshot `before`, and lists the files that changed.
unchanged_since() {
  local now
  now=$(snapshot)
  if [ "$now" != "$1" ]; then
    git --no-pager diff --stat "$1" "$now"
    fail "$2"
  fi
}

WORK=${WORK:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/simpright-e2e}
mkdir -p "$WORK"
VERSION=$(json "$KIT/packages/simpright/package.json" .version)
KIT_REF=${KIT_REF:-$(git -C "$KIT" rev-parse HEAD)}
REPOSITORY=$(json "$KIT/e2e/template.json" .repository)
TAG=$(json "$KIT/e2e/template.json" .tag)

if [ -z "${TARBALLS:-}" ]; then
  TARBALLS=$WORK/tarballs
  step "Build and pack the kit's packages ($VERSION)"
  rm -rf "$TARBALLS"
  mkdir -p "$TARBALLS"
  (cd "$KIT" && npm run build && npm pack --workspaces --ignore-scripts --loglevel=warn --pack-destination "$(native "$TARBALLS")")
fi

PROJECT=$WORK/$CASE
step "SimpRightTemplate $TAG, with kit $VERSION from the tarballs (its actions at ${KIT_REF:0:7})"
rm -rf "$PROJECT"
git clone --quiet --depth 1 --branch "$TAG" -c advice.detachedHead=false "https://github.com/$REPOSITORY.git" "$PROJECT"
cd "$PROJECT"
# All three, the portal too: apply leaves a kit package installed from a file: spec alone, while one it added at the
# kit's version would come from npm, which doesn't have a release branch's version yet.
for name in simpright @simpright/scenarios @simpright/portal; do
  tarball=$TARBALLS/$(printf '%s' "${name#@}" | tr / -)-$VERSION.tgz
  [ -f "$tarball" ] || fail "No tarball $tarball: build and pack the kit, or point TARBALLS at the right folder."
  npm pkg set "devDependencies.$name=file:$(native "$tarball")"
done
npm install --ignore-scripts --no-audit --no-fund

if [ "$CASE" = defaults ]; then init_args=(--defaults); else init_args=(--answers "$(native "$ANSWERS")"); fi
step "init --dry-run, which must write nothing"
before=$(snapshot)
npx --no-install simpright init "${init_args[@]}" --dry-run
unchanged_since "$before" "init --dry-run changed the project"

step "init"
npx --no-install simpright init "${init_args[@]}"
if [ "$CASE" = defaults ]; then
  unchanged_since "$before" "init --defaults changed the project"
elif [ "$(snapshot)" = "$before" ]; then
  fail "init changed nothing"
fi
# env.ts resolves every ${VAR} in the env file when it loads, even for tests that run logged out, as the examples
# do: placeholder values for the users' variables are enough. .env is git-ignored.
if grep -qE '^[A-Z][A-Z0-9_]*=' .env.example 2> /dev/null; then
  sed -nE 's/^([A-Z][A-Z0-9_]*)=.*$/\1=placeholder/p' .env.example > .env
fi

step "apply --dry-run, which must write nothing"
before=$(snapshot)
npx --no-install simpright apply --dry-run --kit-ref "$KIT_REF"
unchanged_since "$before" "apply --dry-run changed the project"

step "apply"
npx --no-install simpright apply --kit-ref "$KIT_REF" | tee "$WORK/$CASE-apply.log"
if grep -q 'Then run npm install' "$WORK/$CASE-apply.log"; then npm install --ignore-scripts --no-audit --no-fund; fi
for skill in simpright-setup simpright-doctor; do
  [ -f ".claude/skills/$skill/SKILL.md" ] || fail "apply wrote no /$skill skill."
done

step "doctor --offline"
npx --no-install simpright doctor --offline

step "The typecheck"
npm run typecheck

step "The scenario validator"
npx --no-install simpright-scenarios validate

if [ "$TESTS" != none ]; then
  step "The examples ($TESTS), on the live app"
  # --with-deps installs the browser's system packages, which a GitHub runner needs and allows.
  if [ "$TESTS" != api ]; then npx --no-install playwright install ${GITHUB_ACTIONS:+--with-deps} chromium; fi
  projects=()
  if [ "$TESTS" != all ]; then projects=(--project="$TESTS"); fi
  CI=true npx --no-install playwright test "${projects[@]}"
fi

step "actionlint on the workflows apply generated"
generated=$(node -p 'Object.keys(require(process.argv[1]).files).filter((file) => file.startsWith(".github/workflows/")).join(" ")' "$(native "$PROJECT/.simpright/state.json")")
linter=${ACTIONLINT:-$(command -v actionlint || true)}
if [ -z "$generated" ]; then
  echo "apply generated no workflow."
elif [ -n "$linter" ]; then
  # The file names have no spaces: one argument each.
  # shellcheck disable=SC2086
  "$linter" $generated
  echo "actionlint: no problem in $(wc -w <<< "$generated" | tr -d ' ') workflow(s)."
elif [ -n "${GITHUB_ACTIONS:-}" ]; then
  fail "No actionlint for the generated workflows: set ACTIONLINT."
else
  echo "No actionlint (set ACTIONLINT): the generated workflows aren't linted."
fi

step "apply again, which must change nothing"
before=$(snapshot)
npx --no-install simpright apply --kit-ref "$KIT_REF"
unchanged_since "$before" "a second apply changed the project"

if $open_group; then echo '::endgroup::'; fi
echo "init ($CASE): every check passed."
