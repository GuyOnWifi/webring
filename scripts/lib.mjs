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

// Each member file is members/<name>.json — the ONLY thing a PR edits.
// Required: { "domain": "their-site.com" }. Everything else is scraped.
export async function loadMembers() {
  const dir = join(ROOT, "members");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const members = [];
  for (const f of files) {
    const data = JSON.parse(await readFile(join(dir, f), "utf8"));
    if (!data.domain) throw new Error(`${f}: missing "domain"`);
    members.push({ file: f, domain: normalizeDomain(data.domain) });
  }
  return members;
}

export function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
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

// Resolve a member's metadata + prove consent to be in THIS ring.
// Two valid consent signals (either proves the domain owner opted in):
//   1. /.well-known/webring.json lists the ring id  (explicit, preferred)
//   2. the homepage links back to the ring url        (implicit — the widget snippet does this)
// Returns { ok, source, data?, error? }.
export async function resolveMember(domain, cfg) {
  const timeout = cfg.fetchTimeoutMs;

  // 1. Well-known (authoritative + richest metadata).
  const wk = await get(`https://${domain}/.well-known/webring.json`, timeout, 64 * 1024);
  if (wk.ok) {
    let data;
    try {
      data = JSON.parse(wk.raw);
    } catch {
      return { ok: false, error: "well-known file is not valid JSON" };
    }
    const rings = Array.isArray(data.rings) ? data.rings : [];
    if (rings.includes(cfg.id)) return { ok: true, source: "well-known", data: sanitize(data, domain) };
    return { ok: false, error: `well-known does not list ring "${cfg.id}"` };
  }

  // 2. Fallback: scrape the homepage. Require a link back to the ring as consent,
  //    then lift metadata from h-card microformats / OpenGraph / <title>.
  const home = await get(`https://${domain}/`, timeout, 512 * 1024);
  if (!home.ok) return { ok: false, error: home.error };
  if (!linksToRing(home.raw, cfg.url)) {
    return { ok: false, error: `no well-known file and homepage does not link to ${cfg.url}` };
  }
  return { ok: true, source: "scraped", data: sanitize(scrapeMeta(home.raw, domain), domain) };
}

// Consent check: does the page contain a link/script pointing at the ring origin?
function linksToRing(html, ringUrl) {
  let origin;
  try {
    origin = new URL(ringUrl).origin;
  } catch {
    return false;
  }
  return html.includes(origin);
}

// Best-effort metadata from raw HTML — h-card (microformats2) first, then OpenGraph,
// then plain <title>/<meta name=description>. All values get sanitized afterward.
function scrapeMeta(html, domain) {
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
    feed: discoverFeed(html, domain),
    url: og("url") || `https://${domain}`,
    tags: [],
  };
}

// RSS/Atom autodiscovery: <link rel="alternate" type="application/rss+xml" href="...">
function discoverFeed(html, domain) {
  const m = html.match(
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i
  );
  if (!m) return undefined;
  const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
  if (!href) return undefined;
  try {
    return new URL(href, `https://${domain}`).href;
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
function sanitize(data, domain) {
  const text = (v, max) =>
    typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim().slice(0, max) : undefined;
  const url = (v) => {
    if (typeof v !== "string") return undefined;
    try {
      const u = new URL(v, `https://${domain}`);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
    } catch {
      return undefined;
    }
  };
  const tags = Array.isArray(data.tags)
    ? data.tags.map((x) => text(x, 24)).filter(Boolean).slice(0, 8)
    : [];
  return {
    name: text(data.name, 60) || domain,
    description: text(data.description, 200) || "",
    avatar: url(data.avatar),
    feed: url(data.feed),
    homepage: url(data.url) || `https://${domain}`,
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
