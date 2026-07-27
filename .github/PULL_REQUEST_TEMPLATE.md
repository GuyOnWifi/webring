<!-- The bot verifies and auto-merges. This is just a reminder of what it checks. -->

# Joining the UW CS Webring

Quick reminder of what the bot needs (full details in the README):

- Add one file, `members/<your-name>.json`, containing only `{ "site": "https://your-site.com/" }` (your site URL; a path like `/~you/` is fine, a bare host works too). Kebab-case filename, and don't touch anything else.
- On your own site, either serve a `webring.json` with a `uwcs` block (at `/.well-known/webring.json`, or `<your-page>/webring.json` on path hosting), or embed the ring widget (it carries `data-webring="uwcs"`). That is your consent signal.
- Your site should be reachable over HTTPS, with a valid feed if you want your posts in the planet.

No `webring.json` yet? Open the PR anyway. The bot scrapes your homepage and comments a ready-to-paste one.
