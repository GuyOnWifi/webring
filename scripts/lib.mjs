// Shared helpers: read config/members, resolve a member's metadata (well-known
// first, h-card/OpenGraph fallback), and parse their feed for the planet river.
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "user-agent": "webring-builder/0.1 (+https://github.com)" };

export async function loadConfig() {
  return JSON.parse(await readFile(join(ROOT, "ring.config.json"), "utf8"));
}

// Each member file is members/<name>.json — the ONLY thing a PR edits. Identity is a
// "site": a full URL that may include a path (e.g. https://host/~you/), so people on
// shared/path-based hosting work too. Accept { "site": "<url>" } or, as apex shorthand,
// { "domain": "their-site.com" }.
export async function loadMembers() {
  const dir = join(ROOT, "members");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const members = [];
  for (const f of files) {
    const data = JSON.parse(await readFile(join(dir, f), "utf8"));
    const site = memberSite(data);
    if (!site) throw new Error(`${f}: needs a "site" URL or a bare "domain"`);
    members.push({ file: f, site });
  }
  return members;
}

export function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// Canonical site URL for a member: https, no query/hash, trailing slash (so relative
// lookups like ".well-known/webring.json" resolve UNDER the path). Returns null if
// neither a valid "site" URL nor a "domain" host is present.
export function memberSite(data) {
  let raw =
    typeof data.site === "string" && data.site.trim()
      ? data.site.trim()
      : typeof data.domain === "string" && data.domain.trim()
        ? normalizeDomain(data.domain)
        : null;
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.hash = "";
  u.search = "";
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  return u.href;
}

// Short display label for a site URL: host + path, no scheme or trailing slash.
export function siteLabel(site) {
  try {
    const u = new URL(site);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return site;
  }
}

async function get(url, timeoutMs, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: UA });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const raw = await res.text();
    if (raw.length > maxBytes) return { ok: false, error: "response too large" };
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timed out" : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// Resolve a member's metadata + prove consent, everything relative to their site URL
// (which may include a path like https://host/~you/). Consent signals:
//   1. a webring.json with a block keyed by the ring id, checked at <site>.well-known/
//      first (proper convention; for apex sites that's the origin root), then
//      <site>webring.json (a plain file path-scoped sites can actually write). Preferred.
//   2. the data-webring widget marker on the page itself.
// Returns { ok, source, data?, error? }.
export async function resolveMember(site, cfg) {
  const timeout = cfg.fetchTimeoutMs;

  // 1. Manifest, relative to the site URL.
  for (const rel of [".well-known/webring.json", "webring.json"]) {
    const wk = await get(new URL(rel, site).href, timeout, 64 * 1024);
    if (!wk.ok) continue;
    let data;
    try {
      data = JSON.parse(wk.raw);
    } catch {
      return { ok: false, error: "webring.json is not valid JSON" };
    }
    // Namespaced: each top-level key is a ring id; "$"-prefixed keys are reserved
    // ($shared merges under every ring block), so one file can serve many rings.
    const block = data[cfg.id];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const shared = data.$shared && typeof data.$shared === "object" ? data.$shared : {};
      return { ok: true, source: "well-known", data: sanitize({ ...shared, ...block }, site) };
    }
    // Legacy flat format: { ...fields, "rings": ["uwcs"] }.
    const rings = Array.isArray(data.rings) ? data.rings : [];
    if (rings.includes(cfg.id)) return { ok: true, source: "well-known", data: sanitize(data, site) };
    return { ok: false, error: `webring.json has no "${cfg.id}" block` };
  }

  // 2. Fallback: the widget marker on the page itself.
  const home = await get(site, timeout, 512 * 1024);
  if (!home.ok) return { ok: false, error: home.error };
  if (!hasWidget(home.raw, cfg)) {
    return { ok: false, error: `no webring.json and no "${cfg.id}" widget at ${siteLabel(site)}` };
  }
  return { ok: true, source: "scraped", data: sanitize(scrapeMeta(home.raw, site), site) };
}

// For the join bot: build a ready-to-paste ring block from whatever we can scrape
// off the homepage (OG/h-card). Used to *suggest* a webring.json when none exists —
// no consent link-back required, since this only drafts a suggestion, grants nothing.
// Returns { ok, block } or { ok:false, error }.
export async function suggestFromSite(site, cfg) {
  const home = await get(site, cfg.fetchTimeoutMs, 512 * 1024);
  if (!home.ok) return { ok: false, error: home.error };
  const m = sanitize(scrapeMeta(home.raw, site), site);
  const block = {
    name: m.name,
    description: m.description || "one line about you",
    ...(m.avatar ? { avatar: m.avatar } : {}),
    ...(m.feed ? { feed: m.feed } : {}),
    ...(m.program ? { program: m.program } : {}),
    ...(Object.keys(m.socials).length ? { socials: m.socials } : {}),
    tags: m.tags.length ? m.tags : ["add", "some", "tags"],
  };
  return { ok: true, block };
}

// Consent check: the homepage must embed the ring widget, identified by its
// `data-webring` marker naming this ring. That marker is the deliberate opt-in.
function hasWidget(html, cfg) {
  const marker = new RegExp(`data-webring\\s*=\\s*["'][^"']*\\b${escapeRe(cfg.id)}\\b[^"']*["']`, "i");
  return marker.test(html);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Best-effort metadata from raw HTML — h-card (microformats2) first, then OpenGraph,
// then plain <title>/<meta name=description>. All values get sanitized afterward.
function scrapeMeta(html, site) {
  const attr = (re) => (html.match(re) || [])[1];
  const mf = (cls) =>
    (html.match(new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([^<]+)<`, "i")) || [])[1];
  const og = (p) => attr(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']+)["']`, "i"));

  const photo = html.match(/class=["'][^"']*\bu-photo\b[^"']*["'][^>]*\bsrc=["']([^"']+)["']/i);

  return {
    name: mf("p-name") || og("title") || attr(/<title[^>]*>([^<]+)<\/title>/i),
    description:
      mf("p-note") ||
      og("description") ||
      attr(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
    avatar: (photo && photo[1]) || og("image"),
    feed: discoverFeed(html, site),
    tags: [],
  };
}

// RSS/Atom autodiscovery: <link rel="alternate" type="application/rss+xml" href="...">
function discoverFeed(html, site) {
  const m = html.match(
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i
  );
  if (!m) return undefined;
  const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
  if (!href) return undefined;
  try {
    return new URL(href, site).href;
  } catch {
    return undefined;
  }
}

// Known social platforms: handle -> canonical URL, and the host(s) a full URL may use.
// Restricting hosts stops `socials` being abused as an open redirect / spam vector.
const SOCIALS = {
  github: { hosts: ["github.com"], url: (h) => `https://github.com/${h}` },
  x: { hosts: ["x.com", "twitter.com"], url: (h) => `https://x.com/${h}` },
  linkedin: { hosts: ["linkedin.com"], url: (h) => `https://linkedin.com/in/${h}` },
  instagram: { hosts: ["instagram.com"], url: (h) => `https://instagram.com/${h}` },
  mastodon: { hosts: null, url: (h) => h }, // federated: any host, full URL only
  bluesky: { hosts: ["bsky.app"], url: (h) => `https://bsky.app/profile/${h}` },
  matrix: { hosts: ["matrix.to"], url: (h) => h }, // federated: matrix.to link or @user:server id
};

function sanitizeSocials(raw) {
  if (typeof raw !== "object" || raw === null) return {};
  const out = {};
  for (const [key, cfg] of Object.entries(SOCIALS)) {
    let v = raw[key];
    if (typeof v !== "string" || !v.trim()) continue;
    v = v.trim();
    let href;
    if (/^https?:\/\//i.test(v)) {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:") continue;
        if (cfg.hosts && !cfg.hosts.some((h) => u.host === h || u.host.endsWith("." + h))) continue;
        href = u.href;
      } catch {
        continue;
      }
    } else if (key === "mastodon" && /^@?[^@]+@[^@]+$/.test(v)) {
      const [, user, host] = v.match(/^@?([^@]+)@([^@]+)$/);
      href = `https://${host}/@${user}`;
    } else if (key === "matrix" && /^@[^:@\s/]+:[^:@\s/]+$/.test(v)) {
      href = `https://matrix.to/#/${v}`; // Matrix user id → universal (Element) link
    } else if (cfg.hosts && key !== "matrix") {
      // matrix has no bare-handle form (its handle IS @user:server, handled above),
      // so it must not fall through to the generic handle→URL mapping.
      href = cfg.url(v.replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, ""));
    }
    if (href) out[key] = href.slice(0, 200);
  }
  return out;
}

// Member-supplied data is untrusted. Strip HTML, cap lengths, only allow known fields.
function sanitize(data, site) {
  const text = (v, max) =>
    typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim().slice(0, max) : undefined;
  const url = (v) => {
    if (typeof v !== "string") return undefined;
    try {
      const u = new URL(v, site); // relative refs resolve against the member's site URL
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
    } catch {
      return undefined;
    }
  };
  const tags = Array.isArray(data.tags)
    ? data.tags.map((x) => text(x, 24)).filter(Boolean).slice(0, 8)
    : [];
  const label = siteLabel(site);
  return {
    site,
    domain: label,
    homepage: site, // the site IS the homepage; no separate (spoofable) url field
    name: text(data.name, 60) || label,
    description: text(data.description, 200) || "",
    avatar: url(data.avatar),
    feed: url(data.feed),
    program: text(data.program, 40),
    socials: sanitizeSocials(data.socials),
    tags,
  };
}

// Fetch + parse a member feed; return up to `limit` recent posts. Tiny RSS+Atom parser.
export async function fetchPosts(member, timeoutMs, limit = 3) {
  if (!member.feed) return [];
  const r = await get(member.feed, timeoutMs, 2 * 1024 * 1024);
  if (!r.ok) return [];
  const xml = r.raw;
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const b of blocks.slice(0, limit)) {
    const tag = (t) => {
      const m = b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, "i"));
      return m ? decode(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim()) : "";
    };
    // Atom <link href>; RSS <link>text.
    let link = (b.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || tag("link");
    const date = tag("pubDate") || tag("published") || tag("updated");
    const title = tag("title");
    if (!title || !link) continue;
    try {
      link = new URL(link, member.homepage).href;
    } catch {}
    out.push({
      title: title.slice(0, 140),
      link,
      date,
      ts: Date.parse(date) || 0,
      author: member.name,
      domain: member.domain,
    });
  }
  return out;
}

function decode(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
