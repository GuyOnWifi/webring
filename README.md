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

1. **Serve a `webring.json`** on your site, at `/.well-known/webring.json`. On shared or
   path hosting where you can't write the site root (e.g. `host/~you/`), put it at
   `<your-page>/webring.json` instead; the bot checks both:

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
   Each top-level key is a **ring namespace**; the presence of a `"uwcs"` block is how you
   opt in. Serving this file proves you control the site, that's your consent. There's no
   `url` field: your homepage is just the site you register in step 2.

   Joining more than one ring? Add a block per ring, each can describe you differently:

   ```json
   {
     "$shared": { "name": "Your Name", "avatar": "/me.png", "feed": "/index.xml" },
     "uwcs": { "description": "systems hacker @ waterloo", "tags": ["rust", "systems"] },
     "some-other-ring": { "description": "aspiring poet", "tags": ["writing"] }
   }
   ```
   Reserved `$`-prefixed keys aren't rings; `$shared` is merged underneath every ring block
   (the ring block wins) so you don't repeat yourself.

   **Don't want to author JSON?** Skip step 1. Just add the widget below anywhere on your
   page; its `data-webring="uwcs"` marker _is_ your consent signal. The builder then scrapes
   your name/description/avatar/feed from your page's [h-card](https://microformats.org/wiki/h-card)
   or OpenGraph tags, and the join bot suggests a ready-to-paste `uwcs` block from what it found.

2. **Add one file** `members/your-name.json` via PR:

   ```json
   { "site": "https://your-site.com/" }
   ```
   That's the whole file: your site URL. A bare host like `"you.com"` works too (it
   becomes `https://`), and a path is fine for shared hosting:
   `{ "site": "https://www.student.math.uwaterloo.ca/~you/" }`. A bot fetches your site,
   confirms the `uwcs` consent, and auto-merges. You never wait on a human.

3. **Paste the widget** anywhere on your site (the footer is traditional):

   ```html
   <div data-webring="uwcs" style="display:flex;align-items:center;gap:8px">
     <a href="https://guyonwifi.github.io/webring/hop.html?from=your-site.com&nav=prev" title="previous site">←</a>
     <a href="https://guyonwifi.github.io/webring" target="_blank" rel="noopener" title="uw cs webring">
       <img src="https://guyonwifi.github.io/webring/icon.svg" alt="uw cs webring" width="20" height="20" />
     </a>
     <a href="https://guyonwifi.github.io/webring/hop.html?from=your-site.com&nav=next" title="next site">→</a>
   </div>
   ```
   Swap both `from=your-site.com` for your site (a host, or `host/~you` if you're on
   path hosting). Plain HTML, no scripts. The `data-webring="uwcs"` marker doubles as your
   **consent signal**, the verify bot looks for it. Prev/next resolve against the live ring
   at click time (via `hop.html`), so neighbours re-stitch as sites come and go, and you
   never edit this again.

## How it works

```
you edit YOUR site (well-known + widget snippet)
        │
        ▼
  verify bot confirms site ownership ──► auto-merges members/you.json
        │
        ▼
  builder (cron, every 6h) scrapes everyone, drops dead sites ──► public/index.json
        │
        ▼
  members' widgets hop via index.json ──► ring is always current & self-healing
```

| Piece | File | Job |
|-------|------|-----|
| Member record | `members/*.json` | The only PR-editable data: one site URL. |
| Manifest spec | `.well-known/webring.json` or `<site>/webring.json` | Per-site metadata + proof of consent. |
| Verify bot | `scripts/verify.mjs` + `.github/workflows/verify.yml` | Replaces the maintainer. |
| Builder | `scripts/build.mjs` + `.github/workflows/build.yml` | Derives `index.json`, prunes the dead. |
| Widget | pasted HTML + `public/hop.html` | Static embed + `data-webring` marker; prev/next resolve live, self-healing. |

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
4. Members add a block keyed by your `id` to their well-known file. Done.

`dropAfterFailures`, `fetchTimeoutMs`, `postsPerSource`, `feedMaxItems` are all in
`ring.config.json`.

**Like this approach? Copy it for your own webring** — the `.well-known/webring.json`
format is an open, namespaced convention, and this whole repo is yours to fork. Just
pick your own ring namespace; **don't take the `uwcs` namespace** — that one's ours, and
namespaces are what keep independent rings from stepping on each other.

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
