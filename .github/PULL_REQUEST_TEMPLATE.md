<!-- The bot verifies and merges after a short review window. This is just a reminder. -->

# Joining the UW CS Webring

Quick reminder of what the bot needs (full details in the README):

- Add one file, `members/<your-github-username>.json` (lowercase), containing only `{ "site": "https://your-site.com/" }`. Your site URL; a path like `/~you/` is fine, a bare host works too. One entry per account, your own only, and don't touch anything else.
- Serve a `webring.json` with a `uwcs` block at `<your-site>/.well-known/webring.json`. That file is your consent: writing it at a known path is what proves the site is yours.
- Display the ring widget (the `data-webring="uwcs"` snippet) on your page. It's expected of members, but it's a reminder, not the consent proof.
- Your site should be reachable over HTTPS, with a valid feed if you want your posts in the planet.

No `webring.json` yet? Open the PR anyway. The bot reads your homepage's OG/h-card tags and comments a ready-to-paste one.
