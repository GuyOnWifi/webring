// Structural validation of members/*.json — runs in CI on every PR, before the
// network-dependent ownership check. Fast, deterministic, catches malformed entries.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, normalizeDomain, loadConfig } from "./lib.mjs";

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
  if (typeof data.domain !== "string" || !data.domain.trim()) {
    errors.push(`${f}: missing required string field "domain".`);
    continue;
  }
  const domain = normalizeDomain(data.domain);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    errors.push(`${f}: "${data.domain}" is not a valid bare domain (e.g. "you.com").`);
  }
  if (/\/|^https?:/i.test(data.domain)) {
    errors.push(`${f}: "domain" should be a bare host, no scheme or path.`);
  }
  if (seen.has(domain)) {
    errors.push(`${f}: duplicate domain "${domain}" (also in ${seen.get(domain)}).`);
  } else {
    seen.set(domain, f);
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
      `\n\nThe file should be just \`{ "domain": "you.com" }\` (a bare host, no https:// or ` +
      `path). Fix it in your PR, then re-run this check or comment \`/recheck\`.\n`;
    await writeFile(process.env.PR_COMMENT_FILE, body);
  }
  process.exit(1);
}
console.log(`✓ ${files.length} member file(s) valid.`);
