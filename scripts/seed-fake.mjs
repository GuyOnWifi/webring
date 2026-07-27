// Dev-only seed generator. Writes N fake, interlinked members into
// public/index.json + public/feed.json so the UI / ring graph can be demoed
// locally without live scraping. This is NOT part of the production build —
// `build.mjs` derives the real public/*.json from members/ on cron + on merge,
// which will overwrite anything this writes.
//
// The output matches the shape build.mjs emits (and the app consumes), so the
// directory, planet feed, and graph all populate. Deterministic (seeded PRNG +
// fixed timestamps) so reruns are stable.
//
// Usage: node scripts/seed-fake.mjs [count]   (default 90)
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");
const N = parseInt(process.argv[2] || "90", 10);
const GENERATED = "2026-07-15T00:00:00.000Z";
const NOW = Date.parse(GENERATED);

// deterministic PRNG so reruns produce identical data
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pickN = (a, n) => {
  const c = [...a];
  const out = [];
  while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]);
  return out;
};

const FIRST =
  "Alex Priya Jordan Samira Leo Maya Tom Nina Omar Yuki Chen Ava Noah Liam Aria Kai Mia Ezra Zoe Ravi Sana Ken Ivy Diego Lena Hugo Nadia Theo Isla Quinn Rhea Milo Anya Felix Dara Jonas Amara Wren Cleo Bruno Elif Tariq Suki Marco Nova Reza Indra Sol Vera Cyrus Lian Odette Bram Yara Nils Rosa Ada Bo Ines Kofi Mira Enzo Suri Wei Talia Rune Pax Lucia Halle Zane Devi Milan Freya Arjun Neel Cora Emre Sena Vik Juno Rania Otis Lark Beau Iris Dax Noor".split(
    /\s+/
  );
const LAST =
  "Chen Nair Wu Haddad Feng Desai Becker Stoll Ali Tanaka Park Rossi Kaur Silva Novak Costa Reyes Khan Moreau Adebayo Ivanov Sato Berg Vance Cruz Okafor Lindqvist Meyer Abbas Roy Dubois Marsh Ono Petrov Yilmaz Larsen Dias Fischer Weber Grant Osei Kim Blum Hoang Marino Sharma Ahmed Vega Ford Ruiz Bauer Lang Neri Frost Aziz Holt Mensah Toth Lopez Riva Sena Bello Cho Amin Faber Nash Roth Yuan Pace Rana Beck Faye Idris Klein Mora Sung Tass Reid Volk Wren".split(
    /\s+/
  );
const TLDS = ["dev", "io", "sh", "net", "com", "codes", "xyz", "me", "page", "site"];
const PROGRAMS = ["CS", "CS/Math", "SE", "CFM", "Data Science", "Mechatronics", "ECE", "Math/CS", "Stats", "CS/BBA"];
const TAGS = [
  "rust", "systems", "ml", "web", "compilers", "graphics", "security", "distributed",
  "databases", "networking", "crypto", "embedded", "frontend", "design", "robotics",
  "quant", "nlp", "vision", "os", "pl", "infra", "gamedev", "hci", "bio",
];
const BLURB = {
  rust: "borrow-checker enjoyer", systems: "goes deep on systems", ml: "makes GPUs go brrr",
  web: "ships delightful web", compilers: "writes compilers for fun", graphics: "path tracers & shaders",
  security: "breaks things responsibly", distributed: "raft is my roman empire", databases: "query planner nerd",
  networking: "packets all the way down", crypto: "zero-knowledge, full attitude", embedded: "bare metal & blinkenlights",
  frontend: "too many animations", design: "pixels with intent", robotics: "teaching arms to reach",
  quant: "order-book whisperer", nlp: "tokens, all the way down", vision: "teaching cameras to see",
  os: "kernel tinkerer", pl: "type systems > vibes", infra: "yaml wrangler", gamedev: "shipping tiny worlds",
  hci: "humans first", bio: "wet lab meets dry lab",
};
const SOCIAL_BASE = {
  github: "https://github.com/",
  x: "https://x.com/",
  linkedin: "https://linkedin.com/in/",
  instagram: "https://instagram.com/",
  mastodon: "https://hachyderm.io/@",
  bluesky: "https://bsky.app/profile/",
  matrix: "https://matrix.to/#/@",
};

const usedTags = new Set();
const usedPrograms = new Set();
const seenDomain = new Set();
const members = [];
const posts = [];

for (let i = 0; i < N; i++) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const name = `${first} ${last}`;
  const handle = `${first}${last}`.toLowerCase().replace(/[^a-z]/g, "");
  let domain = `${handle}.${pick(TLDS)}`;
  while (seenDomain.has(domain)) domain = `${handle}${Math.floor(rnd() * 99)}.${pick(TLDS)}`;
  seenDomain.add(domain);

  const tags = pickN(TAGS, 2 + Math.floor(rnd() * 3));
  tags.forEach((t) => usedTags.add(t));
  const program = pick(PROGRAMS);
  usedPrograms.add(program);

  const socials = { github: SOCIAL_BASE.github + handle };
  for (const k of ["x", "linkedin", "instagram", "mastodon", "bluesky", "matrix"])
    if (rnd() < 0.4) socials[k] = SOCIAL_BASE[k] + handle + (k === "matrix" ? ":matrix.org" : "");

  const ok = rnd() > 0.1;
  const lastPost = new Date(NOW - Math.floor(rnd() * 200) * 86400000).toISOString();

  members.push({
    site: `https://${domain}/`,
    domain,
    name,
    description: `${pick(tags.map((t) => BLURB[t]))}. ${program} @ waterloo.`,
    avatar: `https://i.pravatar.cc/150?u=${domain}`,
    homepage: `https://${domain}`,
    program,
    tags,
    socials,
    ok,
    failures: ok ? 0 : 1 + Math.floor(rnd() * 3),
    ...(ok ? {} : { error: "fetch timeout after 8000ms" }),
    lastPost,
  });

  if (ok && rnd() < 0.6) {
    posts.push({
      title: `${pick(["notes on", "a field guide to", "thinking about", "quick take:", "deep dive:"])} ${pick(tags)}`,
      link: `https://${domain}/blog/${pick(tags)}`,
      date: lastPost,
      author: name,
      domain,
    });
  }
}

members.sort((a, b) => a.name.localeCompare(b.name));
posts.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

const index = {
  ring: {
    id: "uwcs",
    name: "UW CS Webring",
    url: "https://guyonwifi.github.io/webring",
    description: "A self-running webring for the UW CS community.",
  },
  generated: GENERATED,
  count: members.length,
  tags: [...usedTags].sort(),
  programs: [...usedPrograms].sort(),
  members,
};

await writeFile(join(OUT, "index.json"), JSON.stringify(index, null, 2));
await writeFile(join(OUT, "feed.json"), JSON.stringify({ generated: GENERATED, posts }, null, 2));
console.log(`Seeded ${members.length} fake members + ${posts.length} posts into public/ (dev only).`);
