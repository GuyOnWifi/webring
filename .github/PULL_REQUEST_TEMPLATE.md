<!-- The bot runs all of these automatically. This list just shows what it wants. -->

# Join the UW CS Webring

Thanks for joining. Tick each box so the bot can verify and auto-merge. You never wait on a human.

## This PR should

- [ ] Add exactly one file: `members/<your-name>.json` (filename is kebab-case: a-z, 0-9, hyphens)
- [ ] That file contains only your bare domain, nothing else:
  ```json
  { "domain": "your-site.com" }
  ```
- [ ] Touch no other files. Members-only PRs auto-merge; anything else needs review.

## On your own site (this is your consent signal, pick one)

- [ ] **Recommended.** Serve `https://your-site.com/.well-known/webring.json` with a `uwcs` block. You control exactly how you appear:
  ```json
  {
    "uwcs": {
      "name": "Your Name",
      "description": "one line about you",
      "url": "https://your-site.com",
      "feed": "/index.xml",
      "tags": ["rust", "systems"]
    }
  }
  ```
- [ ] **Or** embed the ring widget (see README). It carries `data-webring="uwcs"`, which is what the bot looks for.

## Sanity (the bot checks these too)

- [ ] Your site is reachable over HTTPS
- [ ] Your feed URL returns a valid RSS or Atom document (needed only if you want your posts in the planet)
- [ ] Your domain is not already in the ring

If the bot cannot find a `webring.json`, it will scrape your homepage and comment a ready-to-paste one. Once every check is green it squash-merges on its own.
