// Supplier scoring engine (pure). Methodology from the proposal (Subbab 2.3)
// and the workbook "Faktor emisi" parameter block:
//
//   Final = 30% data completeness + 30% evidence consistency + 40% emission intensity
//
// Differences from the workbook, by design (see docs/ARCHITECTURE.md §7):
// - A component that cannot be assessed is "unavailable", never scored 0.
//   (The workbook scores "Belum ada bukti" and missing intensity as 0.)
// - A final score exists only when ALL components are available.
// - Intensity needs a benchmark from the benchmark registry; none is invented.
import type { ActivityData, ReportProfile, ScoreColor } from "./types";

export interface ScoringParams {
  weights: { completeness: number; evidence: number; intensity: number };
  evidenceTolerance: number; // relative kWh difference still treated as a match
  minCompleteness: number; // below this → MERAH
  greenMaxRatio: number; // intensity ratio ≤ this → full intensity score
  redMinRatio: number; // ratio > this → intensity score 0 and MERAH
  source: string;
}

/** Values copied verbatim from the workbook tab "Faktor emisi" (rows 14–20). */
export const WORKBOOK_SCORING_PARAMS: ScoringParams = {
  weights: { completeness: 0.3, evidence: 0.3, intensity: 0.4 },
  evidenceTolerance: 0.1,
  minCompleteness: 0.6,
  greenMaxRatio: 1,
  redMinRatio: 1.15,
  source: "Dummy Data Analisis.xlsx — tab Faktor emisi (parameter skor; toleransi & batas adalah ASUMSI workbook)",
};

export type ComponentStatus = "available" | "unavailable";

export interface ScoreComponent {
  key: "completeness" | "evidence" | "intensity";
  weight: number;
  status: ComponentStatus;
  score: number | null; // 0–100
  detail: string;
}

/** The 10 questions of Lampiran B, counted exactly like the workbook column "Kelengkapan Data". */
export function completenessItems(p: ReportProfile, a: ActivityData) {
  const na = new Set(a.notApplicable ?? []);
  return [
    { q: "Q1 Jenis usaha", ok: !!p.sector },
    { q: "Q2 Jumlah karyawan", ok: p.employees != null },
    { q: "Q3 Listrik", ok: na.has("listrik") || a.electricityKwh != null },
    { q: "Q4 BBM/LPG", ok: na.has("bbm") || a.fuelQuantity != null },
    { q: "Q5 Volume produksi", ok: p.productionVolume != null },
    { q: "Q6 Kemasan", ok: na.has("kemasan") || a.packagingKg != null },
    { q: "Q7 Limbah", ok: na.has("limbah") || a.wasteKg != null },
    { q: "Q8 Asal bahan baku", ok: !!a.rawMaterialOrigin },
    { q: "Q9 Moda + jarak pengiriman", ok: na.has("transportasi") || (!!a.transportMode && a.transportKm != null) },
    { q: "Q10 Upaya hemat energi", ok: !!a.efficiencyPractice },
  ];
}

export function completenessRatio(p: ReportProfile, a: ActivityData) {
  const items = completenessItems(p, a);
  return items.filter((i) => i.ok).length / items.length;
}

export type EvidenceOutcome =
  | { status: "match"; diffRatio: number }
  | { status: "mismatch"; diffRatio: number }
  | { status: "unverifiable"; reason: string };

/**
 * Compares the supplier's reported kWh with an independently checked kWh
 * (from a document a reviewer actually saw). Same rule as the workbook:
 * |reported − checked| / checked ≤ tolerance → match.
 * No checked value → "Bukti Belum Dapat Diverifikasi" (not a mismatch, not 0).
 */
export function compareEvidence(reportedKwh: number | null, checkedKwh: number | null, tolerance: number, electricityNotUsed = false): EvidenceOutcome {
  if (electricityNotUsed) return { status: "unverifiable", reason: "Usaha menyatakan tidak memakai listrik; tidak ada tagihan untuk dicocokkan" };
  if (checkedKwh == null) return { status: "unverifiable", reason: "Belum ada nilai hasil pemeriksaan dokumen" };
  if (checkedKwh <= 0) return { status: "unverifiable", reason: "Nilai hasil pemeriksaan nol; tidak dapat dipakai sebagai pembanding" };
  if (reportedKwh == null) return { status: "unverifiable", reason: "Pemasok belum mengisi pemakaian listrik" };
  const diffRatio = Math.abs(reportedKwh - checkedKwh) / checkedKwh;
  // Small epsilon so an exact 10.0% difference is not lost to float error.
  return diffRatio <= tolerance + 1e-12 ? { status: "match", diffRatio } : { status: "mismatch", diffRatio };
}

export interface Benchmark {
  benchmarkId: string;
  sector: string;
  avgIntensity: number;
  unit: string;
  status: "industry_verified" | "simulated_sample_average";
  source: string;
}

export interface ScoreInput {
  profile: ReportProfile;
  activity: ActivityData;
  intensity: number | null; // from the emission engine (complete totals only)
  evidence: EvidenceOutcome;
  /** Only an industry benchmark is accepted for live scoring; null → intensity unavailable. */
  benchmark: Benchmark | null;
  params: ScoringParams;
}

export interface ScoreResult {
  components: ScoreComponent[];
  availableWeight: number; // 0–1
  /** Weighted points from available components (out of 100 × availableWeight). */
  partialPoints: number;
  /** Only when every component is available. */
  final: number | null;
  color: ScoreColor | null;
  colorReason: string;
  intensityRatio: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function scoreReport(input: ScoreInput): ScoreResult {
  const { params: P } = input;
  const completeness = completenessRatio(input.profile, input.activity);
  const comp: ScoreComponent = {
    key: "completeness", weight: P.weights.completeness, status: "available", score: r1(completeness * 100),
    detail: `${Math.round(completeness * 10)} dari 10 pertanyaan terjawab`,
  };

  const ev = input.evidence;
  const evidence: ScoreComponent = ev.status === "unverifiable"
    ? { key: "evidence", weight: P.weights.evidence, status: "unavailable", score: null, detail: `Bukti Belum Dapat Diverifikasi — ${ev.reason}` }
    : { key: "evidence", weight: P.weights.evidence, status: "available", score: ev.status === "match" ? 100 : 0,
      detail: `${ev.status === "match" ? "Cocok" : "Tidak cocok"}: selisih ${(ev.diffRatio * 100).toFixed(1)}% (toleransi ${(P.evidenceTolerance * 100).toFixed(0)}%)` };

  let intensityRatio: number | null = null;
  let intensity: ScoreComponent;
  if (!input.benchmark) {
    intensity = { key: "intensity", weight: P.weights.intensity, status: "unavailable", score: null,
      detail: "Pembanding industri belum tersedia; intensitas tidak dinilai" };
  } else if (input.intensity == null) {
    intensity = { key: "intensity", weight: P.weights.intensity, status: "unavailable", score: null,
      detail: "Intensitas emisi belum dapat dihitung (data aktivitas/produksi belum lengkap)" };
  } else {
    intensityRatio = input.intensity / input.benchmark.avgIntensity;
    const s = intensityRatio <= P.greenMaxRatio ? 100 : intensityRatio <= P.redMinRatio ? 50 : 0;
    intensity = { key: "intensity", weight: P.weights.intensity, status: "available", score: s,
      detail: `Rasio ${intensityRatio.toFixed(2)} terhadap rata-rata kelompok (${input.benchmark.status === "simulated_sample_average" ? "pembanding simulasi" : "pembanding industri"})` };
  }

  const components = [comp, evidence, intensity];
  const available = components.filter((c) => c.status === "available");
  const availableWeight = Math.round(available.reduce((s, c) => s + c.weight, 0) * 100) / 100;
  const partialPoints = r1(available.reduce((s, c) => s + (c.score ?? 0) * c.weight, 0));
  const final = available.length === components.length ? partialPoints : null;

  // Status rules (Tabel 1.2 / workbook column V). A red trigger is decisive even when other
  // components are unavailable; green and yellow need every component.
  const redReasons: string[] = [];
  if (completeness < P.minCompleteness) redReasons.push("data minim");
  if (ev.status === "mismatch") redReasons.push("bukti tidak cocok");
  if (intensityRatio != null && intensityRatio > P.redMinRatio) redReasons.push("intensitas tinggi");
  let color: ScoreColor | null;
  let colorReason: string;
  if (redReasons.length) { color = "MERAH"; colorReason = `MERAH: ${redReasons.join(", ")}`; }
  else if (final == null) { color = null; colorReason = "Belum dapat ditentukan: ada komponen yang belum tersedia"; }
  else if (completeness === 1 && ev.status === "match" && intensityRatio != null && intensityRatio <= P.greenMaxRatio) {
    color = "HIJAU"; colorReason = "HIJAU: data lengkap, bukti cocok, intensitas ≤ rata-rata kelompok";
  } else { color = "KUNING"; colorReason = "KUNING: data sebagian atau intensitas di sekitar rata-rata"; }

  return { components, availableWeight, partialPoints, final, color, colorReason, intensityRatio };
}

export interface Recommendation { code: string; text: string; severity: "info" | "warning" | "action" }

/** Deterministic, rule-based suggestions (no AI). */
export function recommendationsFor(p: ReportProfile, a: ActivityData, score: ScoreResult, missingFactorCategories: string[]): Recommendation[] {
  const out: Recommendation[] = [];
  const missing = completenessItems(p, a).filter((i) => !i.ok).map((i) => i.q.replace(/^Q\d+ /, ""));
  if (missing.length) out.push({ code: "complete_data", severity: "action", text: `Lengkapi data yang kosong: ${missing.join(", ")}.` });
  const ev = score.components.find((c) => c.key === "evidence")!;
  if (ev.status === "unavailable" && !(a.notApplicable ?? []).includes("listrik")) {
    out.push({ code: "provide_bill", severity: "action", text: "Siapkan tagihan listrik atau riwayat token agar angka listrik dapat diperiksa." });
  }
  if (ev.status === "available" && ev.score === 0) out.push({ code: "recheck_kwh", severity: "warning", text: "Periksa ulang angka listrik; angka berbeda lebih dari 10% dari dokumen yang diperiksa." });
  if (a.efficiencyPractice === "Belum") out.push({ code: "start_efficiency", severity: "info", text: "Mulai satu upaya hemat energi atau daur ulang, misalnya mematikan alat saat tidak dipakai." });
  if (missingFactorCategories.length) out.push({ code: "factor_unavailable", severity: "info", text: `Emisi untuk ${missingFactorCategories.join(", ")} belum dihitung karena faktor emisi yang sesuai belum tersedia.` });
  if (!out.length) out.push({ code: "keep_up", severity: "info", text: "Pertahankan kinerja dan kirim laporan tepat waktu setiap bulan." });
  return out;
}
