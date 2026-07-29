// Structural validation of members/*.json — runs in CI on every PR, before the
// network-dependent ownership check. Fast, deterministic, catches malformed entries.
import { readdir, readFile, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, memberSite, siteLabel, loadConfig } from "./lib.mjs";

const dir = join(ROOT, "members");
const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
const seen = new Map();
const errors = [];

const MAX_FILE_BYTES = 4096;

for (const f of files) {
  if (!/^[a-z0-9-]+\.json$/.test(f)) {
    errors.push(`${f}: filename must be kebab-case (a-z, 0-9, -).`);
  }
  // Must be a regular file. CI pulls in members/ from the PR head, and git happily
  // carries a symlink as an added blob — the files API still reports it as `added` with
  // a .json name, so the additions-only merge guard never sees it. Reading through one
  // would let a PR aim our parser at an arbitrary path on the runner.
  const st = await lstat(join(dir, f));
  if (!st.isFile()) {
    errors.push(`${f}: must be a regular file (symlinks and directories are not allowed).`);
    continue;
  }
  if (st.size > MAX_FILE_BYTES) {
    errors.push(`${f}: is ${st.size} bytes; a member file should be well under ${MAX_FILE_BYTES}.`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(await readFile(join(dir, f), "utf8"));
  } catch {
    // Deliberately no parser message: Node embeds the first bytes of the input in it,
    // and this string gets posted to a public PR comment.
    errors.push(`${f}: is not valid JSON.`);
    continue;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push(`${f}: must be a JSON object.`);
    continue;
  }
  if (typeof data.site !== "string" || !data.site.trim()) {
    errors.push(`${f}: needs a "site" field, your site URL (e.g. "https://you.com/" or "https://host/~you/").`);
    continue;
  }
  const site = memberSite(data);
  if (!site) {
    errors.push(`${f}: "${data.site}" is not a valid site URL.`);
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
      `\n\nThe file should be just \`{ "site": "https://your-site.com/" }\` (a full URL, a ` +
      `path like \`/~you/\` is fine). Fix it in your PR, then re-run this check or comment \`/recheck\`.\n`;
    await writeFile(process.env.PR_COMMENT_FILE, body);
  }
  process.exit(1);
}
console.log(`✓ ${files.length} member file(s) valid.`);
