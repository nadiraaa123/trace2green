/**
 * Imports the simulated workbook into Firestore (idempotent).
 *
 *   npx tsx scripts/seed.ts            # emulator if FIRESTORE_EMULATOR_HOST is set
 *   npx tsx scripts/seed.ts --dry-run  # show what would change
 *
 * Writing to a real project requires --confirm-production.
 */
import { seedWorkbook } from "../src/server/seed";
import { readWorkbook } from "../src/server/workbook";
import { db, target } from "./_admin";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!target.startsWith("emulator") && !dryRun && !process.argv.includes("--confirm-production")) {
    throw new Error(`Refusing to seed ${target} without --confirm-production`);
  }
  const wb = readWorkbook();
  console.log(`Target: ${target}  workbook sha256: ${wb.sha256.slice(0, 12)}…`);
  console.log(`Workbook: ${wb.suppliers.length} suppliers, ${wb.submissions.length} report rows, ${wb.audits.length} audits, ${wb.factors.length} factors`);
  const s = await seedWorkbook(db, wb, { dryRun });
  console.log(`${dryRun ? "[dry run] " : ""}planned ${s.planned}, written ${s.written}, unchanged ${s.skippedUnchanged}, conflicts ${s.conflicts.length}, company summaries written ${s.statsWritten}`);
  for (const c of s.conflicts.slice(0, 20)) console.log(`  conflict: ${c}`);
  console.log(JSON.stringify(s.counts));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
