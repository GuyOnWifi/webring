# Security Policy

## Reporting a vulnerability

Please report privately via GitHub's
[private vulnerability reporting](https://github.com/GuyOnWifi/webring/security/advisories/new)
rather than opening a public issue. We'll respond as soon as we can.

## Threat model

This ring runs unattended, so several properties are deliberate:

- **Consent is proof of control.** A member is added only if they serve
  `/.well-known/webring.json` with a `uwcs` block on the site they register. The
  `data-webring` widget marker does **not** grant membership: it's a plain page
  substring, so any site that renders someone else's content could be made to carry it.
- **Ownership by filename.** A member file is named for the PR author's GitHub login, so
  you can only add your own entry, one per account. Auto-merge is limited to a single
  added `members/<you>.json`; edits, deletes, renames, and everything else need a human.
- **No PR code runs with privileges.** The `pull_request_target` CI checks out the
  trusted base branch and only reads the PR's member data. It never runs `npm ci`, lint,
  build, or any script from the PR, so a PR can't exfiltrate the workflow token.
- **Outbound fetches are guarded.** Member sites are DNS-resolved first and refused if
  they point at private, loopback, or link-local addresses (including the cloud metadata
  endpoint), since CI fetches them with a write-scoped token.

If you find a way around any of these, that's exactly what we'd like to hear about.
