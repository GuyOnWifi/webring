// Shared helpers: read config/members, resolve a member's metadata from their
// well-known manifest, and parse their feed for the planet river.
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "user-agent": "webring-builder/0.1 (+https://github.com)" };
const MAX_REDIRECTS = 5;

export async function loadConfig() {
  return JSON.parse(await readFile(join(ROOT, "ring.config.json"), "utf8"));
}

// Each member file is members/<name>.json — the ONLY thing a PR edits. It holds one
// field, "site": your site URL. It may include a path (e.g. https://host/~you/) so
// people on shared/path-based hosting work too, and a bare host like "you.com" is
// accepted and upgraded to https.
export async function loadMembers() {
  const dir = join(ROOT, "members");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const members = [];
  for (const f of files) {
    const data = JSON.parse(await readFile(join(dir, f), "utf8"));
    const site = memberSite(data);
    if (!site) throw new Error(`${f}: needs a "site" (your site URL)`);
    members.push({ file: f, site });
  }
  return members;
}

// Canonical site URL for a member: https, no query/hash, trailing slash (so relative
// lookups like ".well-known/webring.json" resolve UNDER the path). Accepts a bare host
// or a full URL in `site`. Returns null if `site` is missing or unparseable.
//
// The scheme is always normalized to https, never merely defaulted. Keeping an
// author-supplied "http://" would (a) let the same site register twice under one
// `domain` label, colliding in the directory, the planet, and hop.html, and (b) put
// the verification fetch on a cleartext channel any network hop could forge.
export function memberSite(data) {
  let raw = typeof data.site === "string" && data.site.trim() ? data.site.trim() : null;
  if (!raw) return null;
  // Reject an explicit non-http(s) scheme instead of prefixing https:// onto it, which
  // would silently reinterpret "ftp://a.com" as the host "ftp" with the path "//a.com".
  // A bare "host:port" is scheme-shaped too, so allow that one form through.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1]) && !/^[a-z][a-z0-9+.-]*:\d+(\/|$)/i.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.protocol = "https:";
  u.hash = "";
  u.search = "";
  u.username = "";
  u.password = "";
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

// Is this literal IP address something we must never fetch? Anything that isn't a
// public unicast address: loopback, RFC1918, link-local (incl. the 169.254.169.254
// cloud metadata endpoint), CGNAT, unique-local v6, multicast, reserved.
function isPrivateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    if (/^fe[89ab]/.test(s)) return true; // link-local
    if (/^f[cd]/.test(s)) return true; // unique-local
    if (/^ff/.test(s)) return true; // multicast
    const mapped = s.match(/(\d+\.\d+\.\d+\.\d+)$/); // ::ffff:10.0.0.1 and friends
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not an address we understand — refuse rather than guess
}

// Member-supplied URLs are fetched by CI with a write-scoped token in the environment,
// and what comes back is echoed into a public PR comment. Resolve the host first and
// refuse anything that points inside the runner's network, so a member file can't be
// used to probe or exfiltrate internal services. Throws on refusal.
//
// Residual risk: a hostile DNS server could answer this lookup publicly and the
// subsequent connect privately (rebinding). Closing that needs pinning the connection
// to the vetted address via a custom agent; the ranges below stop the direct attempt.
async function assertPublicUrl(u) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`refusing to fetch a private address (${host})`);
    return;
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`DNS lookup failed for ${host}`);
  }
  if (!addrs.length) throw new Error(`DNS lookup failed for ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`refusing to fetch a private address (${host} resolves to ${a.address})`);
    }
  }
}

// Read the body with the cap applied DURING transfer, not after. `res.text()` would
// buffer the whole response first, so a member serving an endless stream could exhaust
// the runner regardless of maxBytes; here we bail the moment we cross the limit.
async function readCapped(res, maxBytes) {
  if (!res.body) return { ok: true, raw: "" };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, error: "response too large" };
    }
    chunks.push(value);
  }
  return { ok: true, raw: Buffer.concat(chunks).toString("utf8") };
}

// Fetch over https only, following redirects by hand so every hop is re-checked
// against assertPublicUrl (a public host is otherwise free to 302 into the private
// range, which `redirect: "follow"` would chase without a word).
async function get(url, timeoutMs, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      let u;
      try {
        u = new URL(current);
      } catch {
        return { ok: false, error: "bad URL" };
      }
      if (u.protocol !== "https:") return { ok: false, error: `refusing non-https URL (${u.protocol}//)` };
      await assertPublicUrl(u);
      const res = await fetch(u, { signal: ctrl.signal, redirect: "manual", headers: UA });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) return { ok: false, error: "too many redirects" };
        current = new URL(location, u).href;
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      return await readCapped(res, maxBytes);
    }
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timed out" : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// Resolve a member's metadata + prove consent. The ONLY consent signal is a manifest
// at <site>.well-known/webring.json carrying a block keyed by the ring id (for an apex
// site that's the origin root; for path hosting like https://host/~you/ it sits under
// the path). Writing a file at a specific path is something only the site's owner can
// do, which is exactly the property consent needs.
//
// The `data-webring` widget marker deliberately does NOT grant consent: it's a plain
// substring of the page, so any site that renders user-submitted content (comments,
// forums, wikis, pastes) can be made to carry it by someone who doesn't own it. The
// widget is a membership requirement, checked separately and non-blockingly by
// hasWidgetOnSite; it is not an ownership proof.
// Returns { ok, source, data?, error? }.
export async function resolveMember(site, cfg) {
  const wk = await get(new URL(".well-known/webring.json", site).href, cfg.fetchTimeoutMs, 64 * 1024);
  if (!wk.ok) return { ok: false, error: `couldn't read .well-known/webring.json (${wk.error})` };

  let data;
  try {
    data = JSON.parse(wk.raw);
  } catch {
    return { ok: false, error: "webring.json is not valid JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
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

// Membership check, not an ownership proof: is the ring widget actually on the page?
// Reported to the submitter as a reminder; it never decides whether a PR can merge.
export async function hasWidgetOnSite(site, cfg) {
  const home = await get(site, cfg.fetchTimeoutMs, 512 * 1024);
  if (!home.ok) return { ok: false, error: home.error };
  return { ok: true, present: hasWidget(home.raw, cfg) };
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

  // https only; relative refs resolve against the member's site URL.
  const url = (v) => {
    if (typeof v !== "string") return undefined;
    try {
      const u = new URL(v, site);
      return u.protocol === "https:" ? u.href : undefined;
    } catch {
      return undefined;
    }
  };
  // `feed` is fetched server-side by the builder and its contents are republished into
  // our public feed.xml, so it must stay on the member's own origin — otherwise a member
  // file is a standing instruction for CI to fetch an arbitrary host and publish the
  // result. `avatar` gets no such restriction: it is only ever an <img src> resolved by
  // the visitor's browser, never fetched by us, so a CDN-hosted avatar is fine.
  const sameOriginUrl = (v) => {
    const href = url(v);
    if (!href) return undefined;
    try {
      return new URL(href).origin === new URL(site).origin ? href : undefined;
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
    feed: sameOriginUrl(data.feed),
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
    // Post links land in index.json and feed.xml, which member widgets and feed readers
    // consume directly, so hold them to the same http(s)-only rule as everything else.
    // A raw "javascript:" href parses fine as an absolute URL and must not survive.
    try {
      const u = new URL(link, member.homepage);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      link = u.href;
    } catch {
      continue;
    }
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
