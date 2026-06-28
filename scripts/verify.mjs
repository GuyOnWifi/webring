// Verify bot: runs on every PR. Confirms each newly-added member proved consent
// (well-known file OR a homepage link back to the ring). Exits non-zero (blocks
// merge) on failure. This is the human maintainer, replaced by ~30 lines.
import { loadConfig, loadMembers, resolveMember } from "./lib.mjs";

const cfg = await loadConfig();
const members = await loadMembers();

// Optional: only check files changed in this PR (passed space-separated). Else check all.
const changed = (process.env.CHANGED_FILES || "")
  .split(/\s+/)
  .filter((f) => f.startsWith("members/") && f.endsWith(".json"))
  .map((f) => f.replace(/^members\//, ""));

const toCheck = changed.length ? members.filter((m) => changed.includes(m.file)) : members;

let failed = false;
for (const { file, domain } of toCheck) {
  const r = await resolveMember(domain, cfg);
  if (r.ok) {
    console.log(`✅ ${file}: ${domain} verified via ${r.source}`);
  } else {
    failed = true;
    console.log(`❌ ${file}: ${domain} — ${r.error}`);
    console.log(`   Fix (either one):`);
    console.log(`   A) serve https://${domain}/.well-known/webring.json with { "rings": ["${cfg.id}"] }`);
    console.log(`   B) add the ring widget/link (pointing at ${cfg.url}) anywhere on your homepage`);
  }
}

if (failed) {
  console.log("\nVerification failed. Add one of the consent signals above, then re-run.");
  process.exit(1);
}
console.log(`\nAll ${toCheck.length} member(s) verified.`);
