#!/usr/bin/env bash
# Rejects `git commit` commands whose message carries an attribution trailer.
# CLAUDE.md forbids them; this makes it hold even when a session ignores that.
cmd=$(jq -r '.tool_input.command // empty')
if grep -qE '(^|[[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit' <<<"$cmd" \
  && grep -qiE 'co-authored-by:|claude-session:' <<<"$cmd"; then
  echo "Blocked: commit messages in this repo must not carry Co-Authored-By or Claude-Session trailers (see CLAUDE.md). Re-run the commit without them." >&2
  exit 2
fi
exit 0
