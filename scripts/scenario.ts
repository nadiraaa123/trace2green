/**
 * 2027–2031 growth scenario (projection layer). DRY RUN BY DEFAULT.
 *
 *   npx tsx scripts/scenario.ts --offline             # plan only, no database
 *   npx tsx scripts/scenario.ts                       # dry run: diff against the target database (read-only)
 *   SCENARIO_CS_PASSWORD=... npx tsx scripts/scenario.ts --apply --confirm-project <projectId>
 *
 * Writes ONLY: meta/financial_scenario, scenario_companies/*, scenario_suppliers/*, cs_staff/CS-S*,
 * and 13 CS demo accounts. Create-only: existing docs are never overwritten. No reports, payments or contracts.
 */
import { buildScenarioPlan, planCounts, SCENARIO_YEARS } from "../src/lib/scenario";

function printPlan() {
  const plan = buildScenarioPlan();
  console.log("\nSkenario (proyeksi, bukan pelanggan nyata)");
  console.log("Tahun | Perusahaan (baru/perpanjang) | Pemasok existing+baru = berbayar | Trial | Menunggu aktivasi | CS | Kapasitas | Sisa | Maks beban CS");
  for (const y of SCENARIO_YEARS) {
    const c = planCounts(plan, y);
    console.log(`${y}  | ${c.totalCompanies} (${c.newCompanies}/${c.renewingCompanies}) | ${c.existingSuppliers}+${c.newSuppliers} = ${c.payingSuppliers} | ${c.trialSuppliers} | ${c.awaitingActivation} | ${c.csNeeded} | ${c.csCapacity} | ${c.csRemaining} | ${c.maxLoad}`);
  }
  const perCs = new Map<string, number>();
  plan.suppliers.forEach((s) => perCs.set(s.csId, (perCs.get(s.csId) ?? 0) + 1));
  console.log("\nBeban CS 2031:", [...perCs].map(([k, v]) => `${k}=${v}`).join(", "));
  console.log(`Dokumen: 1 meta + ${plan.companies.length} perusahaan + ${plan.suppliers.length} pemasok + ${plan.cs.length} CS = ${1 + plan.companies.length + plan.suppliers.length + plan.cs.length}; akun Auth CS: ${plan.cs.length}`);
  return plan;
}

async function main() {
  const args = process.argv.slice(2);
  printPlan();
  if (args.includes("--offline")) return;

  const { db, auth, target, targetProjectId } = await import("./_admin");
  const { applyScenario, diffScenario } = await import("../src/server/scenario");
  console.log(`\nTarget: ${target} — project ${targetProjectId}`);
  const d = await diffScenario(db, auth);
  console.log("Per koleksi:", JSON.stringify(d.byCollection));
  console.log(`Akan dibuat: ${d.toCreate.length} · sudah sama: ${d.unchanged.length} · KONFLIK (dilewati, tidak ditimpa): ${d.conflicts.length}`);
  if (d.conflicts.length) console.log("Konflik:", d.conflicts.slice(0, 20).join(", "), d.conflicts.length > 20 ? "…" : "");
  console.log("Akun CS:", d.csAccounts.map((a) => `${a.csId}:${a.action}${a.detail ? `(${a.detail})` : ""}`).join(" "));
  console.log("Data yang dipertahankan (tidak diubah):", JSON.stringify(d.preserved));

  if (!args.includes("--apply")) { console.log("\nDRY RUN — tidak ada yang ditulis."); return; }
  const confirm = args[args.indexOf("--confirm-project") + 1];
  if (!args.includes("--confirm-project") || confirm !== targetProjectId) {
    throw new Error(`Tolak: --confirm-project harus sama dengan project target (${targetProjectId}).`);
  }
  const pw = process.env.SCENARIO_CS_PASSWORD ?? "";
  const r = await applyScenario(db, auth, pw);
  console.log("\nDITULIS:", JSON.stringify(r));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
