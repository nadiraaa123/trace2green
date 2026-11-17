// Phase 4 e2e fixtures: full workbook seed; expected KPIs computed directly from the workbook (not from app code).
import { db, target } from "../../scripts/_admin";
import { seedWorkbook } from "../../src/server/seed";
import { readWorkbook } from "../../src/server/workbook";

async function main() {
  if (!target.startsWith("emulator")) throw new Error("emulator only");
  const wb = readWorkbook();
  await seedWorkbook(db, wb);
  const aIds = new Set(wb.suppliers.filter((s) => s.buyer === "Perusahaan Mitra A").map((s) => s.supplierId));
  const rows = wb.scores.filter((s) => s.period === "2027-03" && aIds.has(s.supplierId));
  const avg = rows.reduce((t, s) => t + s.final, 0) / rows.length;
  const total = rows.reduce((t, s) => t + s.emis.total, 0);
  console.log("EXPECTED=" + JSON.stringify({
    received: rows.length,
    avg: avg.toLocaleString("id-ID", { maximumFractionDigits: 1 }),
    tco2: (total / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 }),
    hijau: rows.filter((s) => s.color === "HIJAU").length,
  }));
}
main().then(() => process.exit(0));
