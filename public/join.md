# Join the UW CS Webring (AI agent instructions)

Join me to the UW CS Webring end to end: https://github.com/GuyOnWifi/webring
Ask me only for what you cannot determine yourself, then do the rest. Don't just hand me
commands to run; carry them out (you have shell, file editing, and `gh`).

First, read the source of truth: fetch the repo's README
(https://raw.githubusercontent.com/GuyOnWifi/webring/main/README.md) and use its exact
footer-widget snippet, icon URL, and hop.html links. If anything below is unclear, the
README wins.

How membership works:

- Two parts. (A) A PR to that repo adding members/<my-github-login>.json, and (B) a
  webring.json I serve on my own site that proves I control it.
- Ownership is proved ONLY by serving webring.json at <my-site>/.well-known/webring.json
  with a "uwcs" block (on path hosting host/~me/, that is host/~me/.well-known/webring.json).

Requirements, satisfy all exactly:

- The PR adds exactly ONE file and nothing else: members/<my-github-login>.json, filename
  lowercase, contents entirely { "site": "<my site URL>" }. One entry per account.
- The site URL is my public homepage; a path (host/~me/) is fine, and it's stored as https.
- webring.json is namespaced: top-level keys are ring ids, "$"-prefixed keys are reserved
  ("$shared" merges under each ring block). There is NO "url" field; my homepage is the
  site itself. The "uwcs" block may set: name, description, avatar, feed, tags.
- All URLs must be https. avatar may point anywhere; feed must be on my own origin, because
  the ring fetches it server-side and republishes it.
- The footer widget must carry a data-webring="uwcs" attribute on its wrapping element. Use
  the exact prev/icon/next markup from the README; I may restyle it, but keep that marker.

Carry out:

1. Find my GitHub login (`gh api user -q .login`, lowercase) and my personal site + where
   its source lives (ask me only if you can't tell).
2. Create /.well-known/webring.json (a "uwcs" block) in my site source, filling
   name/description/avatar/feed/tags from my existing site metadata (show me, let me tweak).
   Add the README's footer widget. Commit, push, and confirm the manifest is live at the URL.
3. Fork GuyOnWifi/webring with `gh repo fork`, add members/<my-login>.json on a branch, and
   open the PR with `gh pr create`.
4. Verify live and report pass/fail: the manifest parses with a "uwcs" key, my site is 200
   over HTTPS, my feed is valid RSS/Atom and same-origin, the members filename is my
   lowercase login.
5. Print the PR URL. The bot merges after a ~24h review window (nothing else for me to do);
   if a check fails, its PR comment says what to fix, and I can push a fix or comment /recheck.
