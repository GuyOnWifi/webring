// Builder: the derived-artifact step (F-Droid's index). Reads members/, resolves
// each one's metadata (well-known → h-card/OG fallback), health-checks, drops dead
// sites, aggregates feeds into a "planet" river, and emits the data the static app
// + widget consume. Runs on cron + on merge. Emits ONLY data; index.html is an app shell.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadConfig, loadMembers, resolveMember, fetchPosts } from "./lib.mjs";

const cfg = await loadConfig();
const members = await loadMembers();
const out = join(ROOT, "public");
await mkdir(out, { recursive: true });
const now = process.env.BUILD_TIME || new Date().toISOString();

// Carry forward failure counts so we only drop after N consecutive misses.
let prev = {};
try {
  const old = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
  for (const m of old.members || []) prev[m.domain] = m;
} catch {}

const resolved = await Promise.all(
  members.map(async ({ domain }) => {
    const r = await resolveMember(domain, cfg);
    const priorFailures = prev[domain]?.failures || 0;
    if (r.ok) return { domain, ...r.data, source: r.source, ok: true, failures: 0 };
    return {
      domain,
      name: prev[domain]?.name,
      description: prev[domain]?.description,
      avatar: prev[domain]?.avatar,
      homepage: prev[domain]?.homepage,
      program: prev[domain]?.program,
      socials: prev[domain]?.socials || {},
      tags: prev[domain]?.tags || [],
      ok: false,
      failures: priorFailures + 1,
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
for (const m of kept) m.lastPost = lastPostByDomain[m.domain] || prev[m.domain]?.lastPost || null;

const index = {
  ring: { id: cfg.id, name: cfg.name, url: cfg.url, description: cfg.description },
  generated: now,
  count: kept.length,
  tags: [...new Set(kept.flatMap((m) => m.tags || []))].sort(),
  programs: [...new Set(kept.map((m) => m.program).filter(Boolean))].sort(),
  members: kept,
};

await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
await writeFile(join(out, "feed.json"), JSON.stringify({ generated: now, posts }, null, 2));
await writeFile(join(out, "feed.xml"), renderRss(index.ring, posts, now));
await writeFile(join(out, "members.opml"), renderOpml(index.ring, live, now));

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
