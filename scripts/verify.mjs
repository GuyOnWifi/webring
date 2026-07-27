// Verify + suggest bot: runs on every PR. For each newly-added member, confirms a
// consent signal, either a well-known webring.json "<ringId>" block or the
// data-webring widget marker on the homepage. When there's no webring.json, it scrapes
// the homepage's OG/h-card tags and drafts a ready-to-paste suggestion in a PR comment.
// Exits non-zero (blocks the auto-merge) if any member has no consent signal at all.
// This is the human maintainer, replaced by a script.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadConfig, loadMembers, resolveMember, suggestFromSite, siteLabel } from "./lib.mjs";

const cfg = await loadConfig();
const members = await loadMembers();

// Optional: only check files changed in this PR (passed space-separated). Else check all.
const changed = (process.env.CHANGED_FILES || "")
  .split(/\s+/)
  .filter((f) => f.startsWith("members/") && f.endsWith(".json"))
  .map((f) => f.replace(/^members\//, ""));
const toCheck = changed.length ? members.filter((m) => changed.includes(m.file)) : members;

async function draftSnippet(site) {
  const s = await suggestFromSite(site, cfg);
  if (!s.ok) return "";
  return "```json\n" + JSON.stringify({ [cfg.id]: s.block }, null, 2) + "\n```";
}

const sections = [];
let failed = false;

for (const { file, site } of toCheck) {
  const label = siteLabel(site);
  const manifest = new URL(".well-known/webring.json", site).href;
  const r = await resolveMember(site, cfg);

  if (r.ok && r.source === "well-known") {
    console.log(`ok   ${file}: ${label} (well-known)`);
    sections.push(`### ✅ \`${label}\`\nFound your \`${cfg.id}\` block. You're in.`);
    continue;
  }

  if (r.ok && r.source === "scraped") {
    // Consent via the widget marker; metadata scraped from the page. Passes, but a
    // webring.json gives richer, self-authored control, so offer it.
    console.log(`ok   ${file}: ${label} (widget marker)`);
    const snippet = await draftSnippet(site);
    sections.push(
      `### ✅ \`${label}\`\nVerified via your \`data-webring="${cfg.id}"\` widget, and I scraped your page ` +
      `for name, description, and avatar. Want to set those yourself? Drop this at ` +
      `\`${manifest}\` (optional):\n\n${snippet}`
    );
    continue;
  }

  // No usable consent signal. Block the merge and hand over a ready-to-paste file.
  failed = true;
  console.log(`FAIL ${file}: ${label} (${r.error})`);
  const snippet = await draftSnippet(site);
  const recheck = "Then re-run this check, or comment `/recheck` on this PR, and I'll take another look.";

  if (!snippet) {
    sections.push(
      `### ❌ \`${label}\`, couldn't reach your site\n` +
      `I tried \`${site}\` but got: \`${r.error}\`. Is it up and served over HTTPS? ` +
      `Once it's reachable, add a \`webring.json\` or the widget. ${recheck}`
    );
  } else if (/not valid JSON/i.test(r.error || "")) {
    sections.push(
      `### ❌ \`${label}\`, your \`webring.json\` isn't valid JSON\n` +
      `I fetched your \`webring.json\` but couldn't parse it (\`${r.error}\`). ` +
      `Fix the syntax, then keep your \`${cfg.id}\` block. Here's a valid one, prefilled from your ` +
      `page, to model it on:\n\n${snippet}\n${recheck}`
    );
  } else {
    sections.push(
      `### ❌ \`${label}\`, no consent signal yet\n` +
      `👋 Hey! I didn't find a \`${cfg.id}\` block in your \`webring.json\`, and no ` +
      `\`data-webring="${cfg.id}"\` widget on your page. Good news, I read your page's ` +
      `OpenGraph/h-card tags and drafted one. Pick either:\n\n` +
      `1. Save this to \`${manifest}\`:\n\n${snippet}\n` +
      `2. Or paste the ring widget (see the README) on your page.\n\n${recheck}`
    );
  }
}

const header = failed
  ? `## 🤖 ${cfg.name}, join check\n\nThanks for submitting. A couple of things before I can merge:`
  : `## 🤖 ${cfg.name}, join check ✅\n\nAll checks passed, merging now. Welcome to the ring.`;

await writeFile(process.env.PR_COMMENT_FILE || join(ROOT, "pr-comment.md"), [header, ...sections].join("\n\n") + "\n");

if (failed) {
  console.log("\nVerification failed. See the PR comment for a ready-to-paste suggestion.");
  process.exit(1);
}
console.log(`\nAll ${toCheck.length} member(s) verified.`);
