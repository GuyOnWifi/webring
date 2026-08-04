# UW CS Webring

A webring that runs itself.

- **You update information by editing _your_ site, not begging a maintainer.**
- **The ring heals itself.** A cron scrapes every member, drops dead sites, and the
  widget re-stitches neighbors live. Nobody re-links anything, ever.
- **Aggregated feed.** Every member's blog, aggregated into one river + combined RSS + OPML.
- **Live directory** with search, tag filters, activity ("posted 3d ago"), and an
  animated **ring map** of the topology.
- **Designed to be extensible** Fork it to run your own ring in 5 minutes!

## How to join (2 minutes)

1. **Serve a `webring.json`** at `/.well-known/webring.json` on your site. On shared or
   path hosting where you can't write the site root, it goes under your path instead
   (e.g. `host/~you/.well-known/webring.json`), since that's the site URL you register
   in step 2:

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

   Reserved `$`-prefixed keys aren't rings; `$shared` is merged underneath every ring block
   (the ring block wins) so you don't repeat yourself.

   **Don't want to author JSON?** Open the PR in step 2 anyway. The bot will read your page's
   [h-card](https://microformats.org/wiki/h-card) or OpenGraph tags and reply with a
   ready-to-paste `uwcs` block, prefilled from what it found, so you just save it and comment
   `/recheck`. This file is the one step that can't be skipped: writing it at a known path is
   what proves the site is yours.

2. **Add one file** `members/<your-github-username>.json` via PR (lowercase, e.g.
   `members/adalovelace.json`):

   ```json
   { "site": "https://your-site.com/" }
   ```

   That's the whole file: your site URL. A bare host like `"you.com"` works too, and a path
   is fine for shared hosting: `{ "site": "https://www.student.math.uwaterloo.ca/~you/" }`.
   Sites are always registered as **https** (an `http://` URL is upgraded, not kept). The
   filename is your GitHub username, so the entry is provably yours and there's one per
   account. A bot fetches your manifest, confirms the `uwcs` consent, and merges after a
   short review window (see below). No human needed for the common case.

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

   Swap both `from=your-site.com` for your site (a host, or `host/~you` if you're on
   path hosting). Displaying the widget is a **requirement** of
   membership and the bot will remind you if it's missing. Prev/next resolve against the live ring at click
   time (via `hop.html`), so neighbours re-stitch as sites come and go, and you never edit
   this again.

## How it works

```
you edit YOUR site (well-known manifest + widget snippet)
        │
        ▼
  verify bot confirms site ownership ──► members/you.json merges after a review window
        │
        ▼
  builder (cron, every 6h) scrapes everyone, drops dead sites ──► public/index.json
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

### Stopping a merge

A verified join PR is labelled `ready-to-merge` and merged by the hourly sweep once it has
sat `autoMergeDelayHours`. Nobody has to act for that to happen, so objecting is the thing
that needs a mechanism:

- **One PR:** add the **`hold`** label (the Labels picker in the PR sidebar; the workflows
  create the label for you). Nothing ever removes it, so the sweep skips that PR
  permanently. This is the right brake for a judgement call the scripts don't encode, like
  a widget you don't want to carry.
- **Don't** just remove `ready-to-merge` to object. It works until the next push or
  `/recheck`, either of which re-adds it and puts the PR back on the merge track.
- **Everything, right now:** `gh workflow disable automerge` (or Actions → automerge →
  Disable). The sweep merges with `--admin`, so branch protection will not stop it; this
  is the only full kill switch.
- **Already merged?** Revert the member file on `main`. The push retriggers the builder and
  the site republishes without it.

## Stack

Next.js (App Router) + Tailwind, **statically exported** and hosted on **GitHub Pages**.
No server, no Vercel. The scraper (`scripts/*.mjs`) runs in GitHub Actions; Next reads
the freshly-scraped JSON at build time and prerenders the site.

## Run your own ring (fork it)

1. Edit `ring.config.json`: set a unique `id`, `name`, and your deployed `url`.
2. Enable GitHub Pages → **Source: GitHub Actions** in repo settings.
3. Set the base path for your host in `.github/workflows/deploy.yml`:
   - Project page (`user.github.io/repo`): `NEXT_PUBLIC_BASE_PATH: /repo`
   - User/org page or custom domain: `NEXT_PUBLIC_BASE_PATH: ""`
4. Members add a block keyed by your `id` to their well-known file. Done.

`autoMergeDelayHours` (the review-window length), `dropAfterFailures`, `fetchTimeoutMs`,
`postsPerSource`, and `feedMaxItems` are all in `ring.config.json`.

**Like this approach? Copy it for your own webring.** The `.well-known/webring.json`
format is an open, namespaced convention, and this whole repo is yours to fork. Just
pick your own ring namespace; **don't take the `uwcs` namespace**, that one's ours, and
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

- **Untrusted input.** Member metadata is sanitized: HTML stripped, lengths capped, and
  every URL required to be `https`. `feed` must additionally sit on the member's own
  origin, because the builder fetches it server-side and republishes what comes back;
  `avatar` may point anywhere, since it's only ever an `<img src>` your browser loads.
- **Bounded fetches.** Every outbound request is https-only, times out after
  `fetchTimeoutMs`, and is truncated _during_ transfer at 64KB for a manifest, 512KB for
  a page, and 2MB for a feed. Redirects are followed by hand, at most 5 deep, so each hop
  is re-checked; addresses that aren't public unicast (loopback, RFC1918, link-local,
  CGNAT) are refused, so a member file can't aim CI at an internal service.
- **Drop-after-N.** A site must miss the health check `dropAfterFailures` times in a row
  before removal, so a brief outage doesn't kick anyone.
- **Reproducible.** `index.json` is a pure function of `members/` + each site's
  well-known file. Re-run the builder anywhere and get the same result.
