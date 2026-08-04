# UW CS Webring

A webring that runs itself.

- **Membership within ~24h.** A bot merges the PR in 24h, with time for maintainers to step in.
  We trust that you're joining this webring because you're an actual student, not a larper.
- **You update information by editing _your_ site, not begging a maintainer.** Just change your `.well-known/webring.json`.
- **The ring heals itself.** A cron scrapes every member, drops dead sites, and the
  widget re-stitches neighbors live. Nobody re-links anything, ever.
- **Aggregated feed.** Every member's blog, aggregated into one river + combined RSS + OPML.
- **Live directory** with search, tag filters, activity ("posted 3d ago"), and an
  animated map _(that actually looks like a ring)_ of the topology.
- **Designed to be extensible.** Fork it to run your own ring in 5 minutes!

## How to join (2 minutes)

**Too lazy to read?** Paste this to any AI agent that can run commands (Claude Code, Cursor):

> Help me join the UW CS webring. Instructions: https://guyonwifi.github.io/webring/join.md

It fetches that file and does the whole join: your `webring.json`, the footer widget, the
fork, and the PR. (Want to see it first? `curl -s https://guyonwifi.github.io/webring/join.md`.)

<br>

1. **Serve a `webring.json`** at `/.well-known/webring.json` (or under your path,
   `host/~you/.well-known/webring.json`, on shared hosting, which is the URL you register
   in step 2):

   ```json
   {
     "uwcs": {
       "name": "Your Name",
       "description": "one line about you",
       "avatar": "/me.png",
       "feed": "/index.xml",
       "tags": ["rust", "systems"]
     }
   }
   ```

   The `uwcs` block is what opts you in, and serving the file at a known path proves you
   control the site. No `url` field, your homepage is just the site from step 2.

   **In more than one ring?** One block per ring, each described its own way. `$shared`
   merges under every block (the ring's own values win) so you don't repeat yourself;
   `$`-prefixed keys aren't rings:

   ```json
   {
     "$shared": {
       "name": "Your Name",
       "avatar": "/me.png",
       "feed": "/index.xml"
     },
     "uwcs": {
       "description": "systems hacker @ waterloo",
       "tags": ["rust", "systems"]
     },
     "some-other-ring": { "description": "aspiring poet", "tags": ["writing"] }
   }
   ```

   **Don't want to write JSON?** Open the PR in step 2 anyway. The bot reads your
   [h-card](https://microformats.org/wiki/h-card) or OpenGraph tags and replies with a
   ready-to-paste block, so you save it and comment `/recheck`. This is the one step you
   can't skip: the file at a known path is what proves the site is yours.

2. **Add one file** `members/<your-github-username>.json` via PR (lowercase, e.g.
   `members/guyonwifi.json`):

   ```json
   { "site": "https://your-site.com/" }
   ```

   The whole file is your site URL. A bare host (`you.com`) or a path
   (`https://www.student.math.uwaterloo.ca/~you/`) both work, and everything is stored as
   `https`. The filename is your GitHub username, so it's one provable entry per account.
   The bot fetches your manifest, confirms consent, and merges after the review window.

3. **Paste the widget** anywhere on your site (the footer is traditional):

   ```html
   <div data-webring="uwcs" style="display:flex;align-items:center;gap:8px">
     <a
       href="https://guyonwifi.github.io/webring/hop.html?from=your-site.com&nav=prev"
       title="previous site"
       >←</a
     >
     <a
       href="https://guyonwifi.github.io/webring"
       target="_blank"
       rel="noopener"
       title="uw cs webring"
     >
       <img
         src="https://guyonwifi.github.io/webring/icon.svg"
         alt="uw cs webring"
         width="20"
         height="20"
       />
     </a>
     <a
       href="https://guyonwifi.github.io/webring/hop.html?from=your-site.com&nav=next"
       title="next site"
       >→</a
     >
   </div>
   ```

   Swap `from=your-site.com` for your site. Displaying the widget is required, and the bot
   reminds you if it's missing. Prev/next resolve against the live ring via `hop.html`, so
   neighbours re-stitch as sites come and go and you never touch this again.

   **Want your own design?** Style this footer however you like, or build a completely
   different one. The only thing the bot needs is a `data-webring="uwcs"` attribute on the
   wrapping element, that's how it knows the widget is there.

## How it works

```
you edit YOUR site (well-known manifest + widget snippet)
        │
        ▼
  verify bot confirms site ownership ──► members/you.json merges after a review window
        │
        ▼
  builder (cron, every 6h) scrapes everyone, drops dead sites ──► index.json (deployed)
        │
        ▼
  members' widgets hop via index.json ──► ring is always current & self-healing
```

| Piece         | File                                                 | Job                                                                         |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Member record | `members/*.json`                                     | The only PR-editable data: one site URL.                                    |
| Manifest spec | `<site>/.well-known/webring.json`                    | Per-site metadata + proof of consent.                                       |
| Verify bot    | `scripts/verify.mjs` + `.github/workflows/ci.yml`    | Replaces the maintainer.                                                    |
| Auto-merge    | `.github/workflows/automerge.yml`                    | Hourly sweep; merges what's sat out the review window.                      |
| Builder       | `scripts/build.mjs` + `.github/workflows/deploy.yml` | Derives `index.json`, prunes the dead, deploys.                             |
| Widget        | pasted HTML + `public/hop.html`                      | Static embed + `data-webring` marker; prev/next resolve live, self-healing. |

## Stack

Next.js (App Router) + Tailwind, **statically exported** and hosted on **GitHub Pages**.
No server, no Vercel. The scraper (`scripts/*.mjs`) runs in GitHub Actions; Next reads
the freshly-scraped JSON at build time and prerenders the site.

## More

Running your own ring, operating this one (holds, the kill switch), the security model,
and local development all live in **[DESIGN.md](DESIGN.md)**.
