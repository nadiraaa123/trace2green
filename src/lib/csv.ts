import { CATEGORIES, type StatsRow } from "./kpi";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of summary rows. Empty cells mean "not available" — never zero. */
export function rowsToCsv(rows: StatsRow[], period: string, companyName: string) {
  const header = ["perusahaan", "periode", "id_pemasok", "nama_pemasok", "sumber_data", "sektor", "wilayah", "izin_data", "status_laporan",
    "status_verifikasi_perusahaan", "skor_akhir", "status_skor", "basis_skor", "basis_pembanding", "kelengkapan_persen", "bukti",
    "listrik_kwh", ...CATEGORIES.map((c) => `emisi_${c}_kgco2e`), "total_emisi_kgco2e", "status_total_emisi", "sel_kosong_dihitung_nol_workbook", "catatan"];
  const note = "Estimasi untuk pemantauan; bukan sertifikasi karbon dan bukan laporan resmi PSPK. Sumber 'demo' = data simulasi workbook.";
  const lines = rows.map((r) => [
    companyName, period, r.supplierId, r.name, r.source === "demo" ? "demo (simulasi)" : "trial", r.sector, r.region, r.consent ? "ya" : "tidak",
    r.reportStatus, r.source === "demo" ? "tidak berlaku" : r.reviewStatus ?? "", r.final, r.color ?? "belum dinilai", r.scoreBasis, r.benchmarkBasis,
    r.completeness == null ? "" : Math.round(r.completeness * 100), r.evidence, r.kwh, ...CATEGORIES.map((c) => r.byCategory?.[c] ?? ""),
    r.totalKg, r.totalStatus, r.blankAsZero.join(" "), note,
  ].map(esc).join(","));
  return "﻿" + [header.join(","), ...lines].join("\n");
}
