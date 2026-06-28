# UW CS Webring

A webring that runs itself. No maintainer approval, no rotting links, no dead ring.

Most webrings die when the maintainer stops clicking "merge." This one removes the
human from the loop, F-Droid style: **the registry only stores consent; every site is
the source of truth for its own metadata.**

- **You join by editing _your_ site, not begging a maintainer.** A bot verifies you
  own your domain and auto-merges.
- **The ring heals itself.** A cron scrapes every member, drops dead sites, and the
  widget re-stitches neighbors live. Nobody re-links anything, ever.
- **Planet feed.** Every member's blog, aggregated into one river + combined RSS + OPML.
- **Live directory** with search, tag filters, activity ("posted 3d ago"), and an
  animated **ring map** of the topology.
- **It's a toolchain, not a list.** Fork it to run your own ring in 5 minutes.

## How to join (2 minutes)

1. **Serve a well-known file** at `https://YOUR-SITE.com/.well-known/webring.json`:

   ```json
   {
     "name": "Your Name",
     "description": "one line about you",
     "url": "https://your-site.com",
     "avatar": "/me.png",
     "feed": "/index.xml",
     "tags": ["rust", "systems"],
     "rings": ["uwcs"]
   }
   ```
   Only `rings` (listing `"uwcs"`) is required. Serving this file proves you own the
   domain — that's your consent. Everything else is scraped from it.

   **Don't want to author JSON?** Skip step 1. Instead just add the widget below
   (it links back to the ring) anywhere on your homepage — that link _is_ your consent
   signal. The builder then auto-scrapes your name/description/avatar/feed from your
   page's [h-card](https://microformats.org/wiki/h-card) or OpenGraph tags.

2. **Add one file** `members/your-name.json` via PR:

   ```json
   { "domain": "your-site.com" }
   ```
   A bot fetches your well-known file, confirms it opted into `uwcs`, and auto-merges.
   You never wait on a human.

3. **Paste the widget** anywhere on your site:

   ```html
   <script src="https://uwcs-ring.vercel.app/widget.js" data-site="your-site.com"></script>
   ```
   Renders `← prev · random · next →`. Put `<div id="webring"></div>` where you want it
   (defaults to next to the script). That's it — you never edit it again.

## How it works

```
you edit YOUR site (well-known + widget snippet)
        │
        ▼
  verify bot confirms domain ownership ──► auto-merges members/you.json
        │
        ▼
  builder (cron, every 6h) scrapes everyone, drops dead sites ──► public/index.json
        │
        ▼
  widget.js reads index.json live ──► ring is always current & self-healing
```

| Piece | File | Job |
|-------|------|-----|
| Member record | `members/*.json` | The only PR-editable data: one domain. |
| Well-known spec | `.well-known/webring.json` | Per-site metadata + proof of ownership. |
| Verify bot | `scripts/verify.mjs` + `.github/workflows/verify.yml` | Replaces the maintainer. |
| Builder | `scripts/build.mjs` + `.github/workflows/build.yml` | Derives `index.json`, prunes the dead. |
| Widget | `public/widget.js` | Live, self-healing prev/random/next. |

## Stack

Next.js (App Router) + Tailwind, **statically exported** and hosted on **GitHub Pages**
— no server, no Vercel. The scraper (`scripts/*.mjs`) runs in GitHub Actions; Next reads
the committed JSON at build time and prerenders the site.

## Run your own ring (fork it)

1. Edit `ring.config.json` — set a unique `id`, `name`, and your deployed `url`.
2. Enable GitHub Pages → **Source: GitHub Actions** in repo settings.
3. Set the base path for your host in `.github/workflows/deploy.yml`:
   - Project page (`user.github.io/repo`): `NEXT_PUBLIC_BASE_PATH: /repo`
   - User/org page or custom domain: `NEXT_PUBLIC_BASE_PATH: ""`
4. Members list your `id` in their well-known `rings` array. Done.

`dropAfterFailures`, `fetchTimeoutMs`, `postsPerSource`, `feedMaxItems` are all in
`ring.config.json`.

## Local dev

```bash
npm install
npm run scrape     # scrape members → public/index.json, feed.*, members.opml
npm run dev        # Next dev server at localhost:3000
npm run build      # scrape + static export to out/
npm run validate   # structural check of members/*.json (CI)
npm run verify     # confirm members proved domain ownership (CI)
```

## Design notes

- **Untrusted input.** Member metadata is sanitized (HTML stripped, lengths capped,
  URLs resolved only against the member's own origin, 64KB fetch cap, timeouts).
- **Drop-after-N.** A site must miss the health check `dropAfterFailures` times in a row
  before removal, so a brief outage doesn't kick anyone.
- **Reproducible.** `index.json` is a pure function of `members/` + each site's
  well-known file. Re-run the builder anywhere and get the same result.
