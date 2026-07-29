// Verify + suggest bot: runs on every PR. For each newly-added member, confirms consent
// via a well-known webring.json "<ringId>" block. If that's missing it scrapes the
// homepage's OG/h-card tags and drafts a ready-to-paste manifest in a PR comment.
// Exits non-zero (blocks the auto-merge) if any member has no consent signal at all.
// This is the human maintainer, replaced by a script.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ROOT, loadConfig, loadMembers, resolveMember, suggestFromSite, siteLabel, hasWidgetOnSite,
} from "./lib.mjs";

const cfg = await loadConfig();
const members = await loadMembers();

// CI always sets CHANGED_FILES (possibly to an empty string); a bare `npm run verify`
// leaves it undefined. Distinguish the two: "PR changed no member files" means there is
// nothing to verify, while "no filter given" means check the whole ring. Conflating them
// made every docs-only PR re-fetch every member site and fail on anyone's outage.
const filtered = process.env.CHANGED_FILES !== undefined;
const changed = (process.env.CHANGED_FILES || "")
  .split(/\s+/)
  .filter((f) => f.startsWith("members/") && f.endsWith(".json"))
  .map((f) => f.replace(/^members\//, ""));

if (filtered && changed.length === 0) {
  console.log("No member files changed in this PR; nothing to verify.");
  process.exit(0);
}
const toCheck = filtered ? members.filter((m) => changed.includes(m.file)) : members;

// Set by CI: did the PR pass the additions-only guard that gates auto-merge? Verifying
// successfully is necessary but not sufficient, so don't promise a merge without it.
const mergeEligible = process.env.PR_SAFE === "true";

async function draftSnippet(site) {
  const s = await suggestFromSite(site, cfg);
  if (!s.ok) return "";
  return "```json\n" + JSON.stringify({ [cfg.id]: s.block }, null, 2) + "\n```";
}

const sections = [];
let failed = false;

for (const { file, site } of toCheck) {
  const label = siteLabel(site);

  // The file is named for the PR author's GitHub login (one entry per account, and it must
  // be yours). CI sets PR_AUTHOR; a mismatched name can't be your own file, so it's a
  // blocker with a clear fix.
  if (process.env.PR_AUTHOR && file.replace(/\.json$/, "") !== process.env.PR_AUTHOR) {
    failed = true;
    console.log(`FAIL ${file}: filename is not ${process.env.PR_AUTHOR}.json`);
    sections.push(
      `### ❌ \`${file}\`, wrong filename\n` +
      `Your member file must be named \`${process.env.PR_AUTHOR}.json\` (your GitHub username, ` +
      `lowercase). One entry per account, and it has to be your own. Rename it, then re-run this ` +
      `check or comment \`/recheck\`.`
    );
    continue;
  }

  const manifest = new URL(".well-known/webring.json", site).href;
  const r = await resolveMember(site, cfg);

  if (r.ok) {
    console.log(`ok   ${file}: ${label} (well-known)`);
    // The widget is a membership requirement, but it is not an ownership proof (any page
    // that renders user content can be made to carry the marker), so a missing one is a
    // reminder, never a merge blocker.
    const w = await hasWidgetOnSite(site, cfg);
    const nudge = w.ok && !w.present
      ? `\n\nOne thing left: I didn't spot the \`data-webring="${cfg.id}"\` widget on your ` +
        `page. Ring members are expected to display it, so please paste the snippet from ` +
        `the README. This won't block the merge.`
      : "";
    sections.push(`### ✅ \`${label}\`\nFound your \`${cfg.id}\` block. You're in.${nudge}`);
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
      `Once it's reachable, add your \`webring.json\`. ${recheck}`
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
      `👋 Hey! I didn't find a \`${cfg.id}\` block at \`${manifest}\`. That file is how you ` +
      `prove the site is yours, so it's the one thing I can't skip. Good news, I read your ` +
      `page's OpenGraph/h-card tags and drafted it for you. Save this to \`${manifest}\`:\n\n` +
      `${snippet}\n${recheck}`
    );
  }
}

const header = failed
  ? `## 🤖 ${cfg.name}, join check\n\nThanks for submitting. A couple of things before I can merge:`
  : mergeEligible
    ? `## 🤖 ${cfg.name}, join check ✅\n\nAll checks passed. I'll merge this in about ` +
      `${cfg.autoMergeDelayHours || 24}h, a short window for a maintainer to glance, unless ` +
      `someone adds a \`hold\` label. Nothing more for you to do.`
    : `## 🤖 ${cfg.name}, join check ✅\n\nEverything I check passed. This PR does more than add a ` +
      `single new member file, though, so I won't merge it automatically, a maintainer needs to ` +
      `look first. If that wasn't intentional, split the member file into its own PR and it'll ` +
      `go through on its own.`;

await writeFile(process.env.PR_COMMENT_FILE || join(ROOT, "pr-comment.md"), [header, ...sections].join("\n\n") + "\n");

if (failed) {
  console.log("\nVerification failed. See the PR comment for a ready-to-paste suggestion.");
  process.exit(1);
}
console.log(`\nAll ${toCheck.length} member(s) verified.`);
