// Structural validation of members/*.json — runs in CI on every PR, before the
// network-dependent ownership check. Fast, deterministic, catches malformed entries.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, memberSite, siteLabel, loadConfig } from "./lib.mjs";

const dir = join(ROOT, "members");
const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
const seen = new Map();
const errors = [];

for (const f of files) {
  if (!/^[a-z0-9-]+\.json$/.test(f)) {
    errors.push(`${f}: filename must be kebab-case (a-z, 0-9, -).`);
  }
  let data;
  try {
    data = JSON.parse(await readFile(join(dir, f), "utf8"));
  } catch (e) {
    errors.push(`${f}: invalid JSON: ${e.message}`);
    continue;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push(`${f}: must be a JSON object.`);
    continue;
  }
  const hasSite = typeof data.site === "string" && data.site.trim();
  const hasDomain = typeof data.domain === "string" && data.domain.trim();
  if (!hasSite && !hasDomain) {
    errors.push(`${f}: needs a "site" URL (e.g. "https://you.com/" or "https://host/~you/") or a bare "domain".`);
    continue;
  }
  if (hasDomain && !hasSite && /\/|^https?:/i.test(data.domain)) {
    errors.push(`${f}: "domain" must be a bare host (no scheme or path). Use "site" for a full URL.`);
  }
  const site = memberSite(data);
  if (!site) {
    errors.push(`${f}: "${data.site || data.domain}" is not a valid site URL.`);
    continue;
  }
  if (seen.has(site)) {
    errors.push(`${f}: duplicate site "${siteLabel(site)}" (also in ${seen.get(site)}).`);
  } else {
    seen.set(site, f);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map((e) => "  - " + e).join("\n"));
  // Surface the structural problems on the PR too (validate runs before verify and
  // exits, so verify never gets to write a comment). The workflow posts this file.
  if (process.env.PR_COMMENT_FILE) {
    const cfg = await loadConfig();
    const body =
      `## 🤖 ${cfg.name}, join check\n\n` +
      `I couldn't add you yet. Your member file has a formatting problem:\n\n` +
      errors.map((e) => `- ${e}`).join("\n") +
      `\n\nThe file should be just \`{ "site": "https://your-site.com/" }\` (a full URL, path ` +
      `OK), or a bare \`{ "domain": "you.com" }\`. Fix it in your PR, then re-run this check ` +
      `or comment \`/recheck\`.\n`;
    await writeFile(process.env.PR_COMMENT_FILE, body);
  }
  process.exit(1);
}
console.log(`✓ ${files.length} member file(s) valid.`);
