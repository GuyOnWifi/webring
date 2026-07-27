#!/usr/bin/env bash
# Post ./pr-comment.md as a single "sticky" status comment: delete the bot's previous
# status comment(s), then post a fresh one (so GitHub notifies and the run is visible).
# Previous ones are found by a hidden marker, so we never touch unrelated comments.
# Requires: gh, and env GH_TOKEN, REPO (owner/name), PR (number). Reads ./pr-comment.md.
set -euo pipefail

marker='<!-- webring-bot-status -->'

# Remove the bot's prior status comments (identified by the marker).
ids=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq ".[] | select(.body | contains(\"$marker\")) | .id")
for id in $ids; do
  gh api -X DELETE "repos/$REPO/issues/comments/$id" >/dev/null || true
done

# Post the fresh comment, carrying the marker so the next run can find it.
{ printf '%s\n\n' "$marker"; cat pr-comment.md; } > sticky-comment.md
gh pr comment "$PR" --body-file sticky-comment.md
