#!/usr/bin/env bash
# Copies the wiki pages in <source> over the wiki's checkout <wiki>, for publish-wiki.sh: pages added, changed or
# removed in <source> are added, changed or removed in <wiki>, and its .git stays.
#
# Usage: sync-pages.sh <source> <wiki>
#
# Pages are compared by content (--checksum). rsync's quick check would take a page for unchanged when its size and its
# modification second match, and a checkout and the wiki's clone often run in the same second, so an edit that keeps
# the size (a word's case) never reached the wiki.
set -euo pipefail

source_dir="${1:?usage: sync-pages.sh <source> <wiki>}"
wiki_dir="${2:?usage: sync-pages.sh <source> <wiki>}"
rsync -a --delete --checksum --exclude '.git' "${source_dir%/}/" "${wiki_dir%/}/"
