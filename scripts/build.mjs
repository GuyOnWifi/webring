// Builder: the derived-artifact step (F-Droid's index). Reads members/, resolves
// each one's metadata (well-known → h-card/OG fallback), health-checks, drops dead
// sites, aggregates feeds into a "planet" river, and emits the data the static app
// + widget consume. Runs on cron + on merge. Emits ONLY data; index.html is an app shell.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadConfig, loadMembers, resolveMember, fetchPosts, siteLabel } from "./lib.mjs";

const cfg = await loadConfig();
const members = await loadMembers();
const out = join(ROOT, "public");
await mkdir(out, { recursive: true });
const now = process.env.BUILD_TIME || new Date().toISOString();

// Carry forward failure counts so we only drop after N consecutive misses.
// Keep the raw prior files too, so the stable-timestamp guard below can tell a
// real data change from pure timestamp churn.
let prev = {};
let oldIndexRaw = null;
let oldFeedRaw = null;
try {
  oldIndexRaw = await readFile(join(out, "index.json"), "utf8");
  const old = JSON.parse(oldIndexRaw);
  for (const m of old.members || []) prev[m.site || m.domain] = m;
} catch {}
try {
  oldFeedRaw = await readFile(join(out, "feed.json"), "utf8");
} catch {}

const resolved = await Promise.all(
  members.map(async ({ site }) => {
    const r = await resolveMember(site, cfg);
    const p = prev[site] || {};
    if (r.ok) return { ...r.data, source: r.source, ok: true, failures: 0 };
    return {
      site,
      domain: siteLabel(site),
      name: p.name,
      description: p.description,
      avatar: p.avatar,
      homepage: p.homepage || site,
      program: p.program,
      socials: p.socials || {},
      tags: p.tags || [],
      ok: false,
      failures: (p.failures || 0) + 1,
      error: r.error,
    };
  })
);

const kept = resolved.filter((m) => m.failures < cfg.dropAfterFailures);
const dropped = resolved.filter((m) => m.failures >= cfg.dropAfterFailures);
const live = kept.filter((m) => m.ok);
kept.sort((a, b) => (a.name || a.domain).localeCompare(b.name || b.domain));

// --- Planet river: pull recent posts from live members' feeds (cap per source). ---
const perSource = cfg.postsPerSource || 3;
const postLists = await Promise.all(live.map((m) => fetchPosts(m, cfg.fetchTimeoutMs, perSource)));
const posts = postLists.flat().sort((a, b) => b.ts - a.ts).slice(0, cfg.feedMaxItems || 60);

// Record latest-post timestamp per member (activity signal).
const lastPostByDomain = {};
for (const p of posts) if (!lastPostByDomain[p.domain]) lastPostByDomain[p.domain] = p.date;
for (const m of kept) m.lastPost = lastPostByDomain[m.domain] || prev[m.site]?.lastPost || null;

const index = {
  ring: { id: cfg.id, name: cfg.name, url: cfg.url, description: cfg.description },
  generated: now,
  count: kept.length,
  tags: [...new Set(kept.flatMap((m) => m.tags || []))].sort(),
  programs: [...new Set(kept.map((m) => m.program).filter(Boolean))].sort(),
  members: kept,
};

// Stable timestamp: if neither the member index nor the planet posts changed since
// the last build, reuse the previous `generated` value so all four output files are
// byte-identical. Otherwise the `generated`/`lastBuildDate`/`dateCreated` stamps
// change every run, producing an empty-diff commit + push every 6h on the cron —
// which spams notifications. Byte-identical output makes the workflow's
// `git commit || echo "no changes"` a genuine no-op.
let generated = now;
try {
  const oldIndex = oldIndexRaw && JSON.parse(oldIndexRaw);
  const oldFeed = oldFeedRaw && JSON.parse(oldFeedRaw);
  const sansTime = (o) => JSON.stringify({ ...o, generated: null });
  if (
    oldIndex &&
    oldFeed &&
    sansTime(index) === sansTime(oldIndex) &&
    sansTime({ posts }) === sansTime({ posts: oldFeed.posts })
  ) {
    generated = oldIndex.generated;
  }
} catch {}
index.generated = generated;

await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
await writeFile(join(out, "feed.json"), JSON.stringify({ generated, posts }, null, 2));
await writeFile(join(out, "feed.xml"), renderRss(index.ring, posts, generated));
await writeFile(join(out, "members.opml"), renderOpml(index.ring, live, generated));

console.log(`Built ${cfg.name}: ${live.length} live / ${kept.length} listed, ${posts.length} posts`);
if (dropped.length) console.log(`Dropped (>=${cfg.dropAfterFailures} fails): ${dropped.map((m) => m.domain).join(", ")}`);

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Combined RSS so anyone can subscribe to the whole ring in one feed.
function renderRss(ring, posts, now) {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(p.link)}</link>
      <dc:creator>${esc(p.author)}</dc:creator>
      ${p.date ? `<pubDate>${esc(p.date)}</pubDate>` : ""}
      <guid isPermaLink="true">${esc(p.link)}</guid>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(ring.name)} — Planet</title>
    <link>${esc(ring.url)}</link>
    <description>${esc(ring.description)}</description>
    <lastBuildDate>${esc(now)}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

// OPML so a reader can one-click subscribe to every member feed.
function renderOpml(ring, live, now) {
  const outlines = live
    .filter((m) => m.feed)
    .map((m) => `    <outline type="rss" text="${esc(m.name)}" title="${esc(m.name)}" xmlUrl="${esc(m.feed)}" htmlUrl="${esc(m.homepage)}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>${esc(ring.name)} feeds</title><dateCreated>${esc(now)}</dateCreated></head>
  <body>
${outlines}
  </body>
</opml>`;
}
