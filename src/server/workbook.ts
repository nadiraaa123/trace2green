// Reads "Dummy Data Analisis.xlsx" into typed rows. Columns are located by their
// header text (verified against the file), so a renamed/moved column fails loudly
// instead of importing the wrong values. Cached cell values are used as-is:
// nothing is recalculated or rounded here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

export const WORKBOOK_PATH = "data/Dummy Data Analisis.xlsx";

type Cell = string | number | null;

function sheetRows(wb: XLSX.WorkBook, name: string, headerRow = 1) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Workbook sheet "${name}" not found`);
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const header = (aoa[headerRow - 1] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  const rows = aoa.slice(headerRow).filter((r) => r.some((c) => c !== null && c !== ""));
  const col = (h: string) => {
    const i = header.indexOf(h);
    if (i < 0) throw new Error(`Sheet "${name}": column "${h}" not found`);
    return i;
  };
  return { rows, col };
}

const str = (v: Cell) => (v == null || v === "" ? null : String(v).trim());
const num = (v: Cell) => (v == null || v === "" ? null : typeof v === "number" ? v : Number(v));
function period(v: Cell): string {
  if (typeof v !== "number") throw new Error(`Expected Excel date serial, got ${v}`);
  const d = XLSX.SSF.parse_date_code(v);
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}

export interface WbSupplier { supplierId: string; name: string; sector: string; buyer: string; region: string; critical: boolean }
export interface WbSubmission {
  supplierId: string; period: string; sector: string | null; employees: number | null; kwh: number | null; billKwh: number | null;
  fuelLiters: number | null; production: number | null; packagingKg: number | null; wasteKg: number | null;
  origin: string | null; transportMode: string | null; transportKm: number | null; practice: string | null;
}
export interface WbScore {
  supplierId: string; period: string; completeness: number;
  emis: { listrik: number; bbm: number; kemasan: number; limbah: number; transportasi: number; total: number };
  intensity: number | null; groupAvg: number | null; ratio: number | null; evidenceStatus: string;
  scoreCompleteness: number; scoreEvidence: number; scoreIntensity: number; final: number; color: string;
  critical: boolean; priority: boolean; suggestion: string;
}
export interface WbAudit { supplierId: string; period: string; name: string; reportedKwh: number; auditedKwh: number; diff: number | null; result: string; note: string }
export interface WbFactor { category: string; unit: string; factor: number; note: string }
export interface WbParam { name: string; value: number; note: string }
export interface WbRekap { period: string; invited: number; submitted: number; hijau: number; kuning: number; merah: number; avgScore: number; totalEmission: number }

export interface Workbook {
  sha256: string;
  suppliers: WbSupplier[];
  submissions: WbSubmission[];
  scores: WbScore[];
  audits: WbAudit[];
  factors: WbFactor[];
  params: WbParam[];
  rekap: WbRekap[];
}

export function readWorkbook(path = WORKBOOK_PATH): Workbook {
  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });

  const ds = sheetRows(wb, "Daftar pemasok");
  const suppliers = ds.rows.map((r) => ({
    supplierId: String(r[ds.col("ID Pemasok")]), name: String(r[ds.col("Nama Pemasok (contoh)")]),
    sector: String(r[ds.col("Jenis Usaha")]), buyer: String(r[ds.col("Perusahaan Pembeli")]),
    region: String(r[ds.col("Wilayah")]), critical: r[ds.col("Pemasok Kritis")] === "Ya",
  }));

  const is = sheetRows(wb, "Isian pemasok");
  const submissions = is.rows.map((r) => ({
    supplierId: String(r[is.col("ID Pemasok")]), period: period(r[is.col("Bulan")]),
    sector: str(r[is.col("Q1 Jenis usaha")]), employees: num(r[is.col("Q2 Jumlah karyawan")]),
    kwh: num(r[is.col("Q3 Listrik bulan lalu (kWh)")]), billKwh: num(r[is.col("Bukti: kWh pada foto tagihan")]),
    fuelLiters: num(r[is.col("Q4 BBM (liter/bulan)")]), production: num(r[is.col("Q5 Volume produksi (unit/bulan)")]),
    packagingKg: num(r[is.col("Q6 Berat kemasan (kg/bulan)")]), wasteKg: num(r[is.col("Q7 Limbah (kg/bulan)")]),
    origin: str(r[is.col("Q8 Asal bahan baku utama")]), transportMode: str(r[is.col("Q9 Moda pengiriman")]),
    transportKm: num(r[is.col("Q9 Jarak pengiriman (km/bulan)")]), practice: str(r[is.col("Q10 Upaya hemat energi/daur ulang")]),
  }));

  const hs = sheetRows(wb, "Hasil skor");
  const c = hs.col;
  const scores = hs.rows.map((r) => ({
    supplierId: String(r[c("ID Pemasok")]), period: period(r[c("Bulan")]), completeness: num(r[c("Kelengkapan Data")])!,
    emis: {
      listrik: num(r[c("Emisi Listrik (kg CO2e)")])!, bbm: num(r[c("Emisi BBM (kg CO2e)")])!, kemasan: num(r[c("Emisi Kemasan (kg CO2e)")])!,
      limbah: num(r[c("Emisi Limbah (kg CO2e)")])!, transportasi: num(r[c("Emisi Transportasi (kg CO2e)")])!, total: num(r[c("Total Emisi (kg CO2e)")])!,
    },
    intensity: num(r[c("Intensitas (kg CO2e/unit)")]), groupAvg: num(r[c("Rata-rata Kelompok (kg CO2e/unit)")]),
    ratio: num(r[c("Rasio Intensitas")]), evidenceStatus: String(r[c("Status Bukti")]),
    scoreCompleteness: num(r[c("Skor Kelengkapan")])!, scoreEvidence: num(r[c("Skor Bukti")])!, scoreIntensity: num(r[c("Skor Intensitas")])!,
    final: num(r[c("Skor Akhir")])!, color: String(r[c("Status")]), critical: r[c("Pemasok Kritis")] === "Ya",
    priority: r[c("Prioritas Audit")] === "Prioritas", suggestion: String(r[c("Saran Perbaikan")]),
  }));

  const au = sheetRows(wb, "Hasil audit");
  const audits = au.rows.map((r) => ({
    supplierId: String(r[au.col("ID Pemasok")]), period: period(r[au.col("Bulan Audit")]), name: String(r[au.col("Nama Pemasok")]),
    reportedKwh: num(r[au.col("kWh Dilaporkan Pemasok")])!, auditedKwh: num(r[au.col("kWh Hasil Audit")])!,
    diff: num(r[au.col("Selisih")]), result: String(r[au.col("Hasil")]), note: String(r[au.col("Catatan Auditor (contoh)")]),
  }));

  // "Faktor emisi": factor table (header row 3, rows 4–10) and parameter block (header row 13).
  const fe = wb.Sheets["Faktor emisi"];
  if (!fe) throw new Error('Workbook sheet "Faktor emisi" not found');
  const feAoa = XLSX.utils.sheet_to_json<Cell[]>(fe, { header: 1, raw: true, defval: null });
  const hdr = feAoa[2]?.map((x) => str(x));
  if (hdr?.[0] !== "Kategori" || hdr?.[2] !== "Faktor emisi (kg CO2e per satuan)") throw new Error("Faktor emisi: unexpected factor header");
  const factors: WbFactor[] = [];
  for (let i = 3; i < feAoa.length && feAoa[i]?.[0] != null; i++) {
    const r = feAoa[i];
    factors.push({ category: String(r[0]), unit: String(r[1]), factor: num(r[2])!, note: String(r[3] ?? "") });
  }
  const pStart = feAoa.findIndex((r) => r?.[0] === "Parameter skor");
  if (pStart < 0) throw new Error("Faktor emisi: parameter block not found");
  const params: WbParam[] = [];
  for (let i = pStart + 1; i < feAoa.length && feAoa[i]?.[0] != null; i++) {
    params.push({ name: String(feAoa[i][0]), value: num(feAoa[i][1])!, note: String(feAoa[i][2] ?? "") });
  }

  const rk = sheetRows(wb, "Rekap");
  const rekap = rk.rows.map((r) => ({
    period: period(r[rk.col("Bulan")]), invited: num(r[rk.col("Pemasok Diundang")])!, submitted: num(r[rk.col("Pemasok Mengisi")])!,
    hijau: num(r[rk.col("Hijau")])!, kuning: num(r[rk.col("Kuning")])!, merah: num(r[rk.col("Merah")])!,
    avgScore: num(r[rk.col("Rata-rata Skor Akhir")])!, totalEmission: num(r[rk.col("Total Emisi (kg CO2e)")])!,
  }));

  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    suppliers, submissions, scores, audits, factors, params, rekap,
  };
}
