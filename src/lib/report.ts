// Monthly report form model shared by the wizard, review screen and server.
// Questions follow Lampiran B of the proposal and the workbook "Isian pemasok".
import type { ActivityCategory, ActivityData, ReportProfile } from "./types";

export const emptyActivity = (): ActivityData => ({
  electricityKwh: null, fuelQuantity: null, fuelUnit: null, fuelType: null,
  packagingKg: null, packagingMaterial: null, wasteKg: null, wasteHandling: null,
  rawMaterialOrigin: null, transportMode: null, transportKm: null,
  efficiencyPractice: null, notApplicable: [],
});

export const emptyProfile = (): ReportProfile => ({
  businessName: null, sector: null, mainProduct: null,
  productionVolume: null, productionUnit: null, employees: null,
});

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  listrik: "Listrik",
  bbm: "Bahan bakar (BBM/LPG)",
  kemasan: "Kemasan",
  limbah: "Limbah",
  transportasi: "Transportasi pengiriman",
};

/** Text shown for the explicit "not used" choice of each category. */
export const NOT_USED_LABEL: Record<ActivityCategory, string> = {
  listrik: "Usaha tidak memakai listrik PLN",
  bbm: "Tidak memakai BBM/LPG",
  kemasan: "Tidak memakai kemasan",
  limbah: "Tidak menghasilkan limbah",
  transportasi: "Tidak melakukan pengiriman",
};

export const FUEL_TYPES = ["Bensin", "Solar", "LPG", "Lainnya"] as const;
export const ORIGINS = ["Lokal", "Regional", "Impor"] as const;
export const TRANSPORT_MODES = ["Motor", "Mobil bak", "Truk"] as const;
export const PRACTICES = ["Belum", "Sebagian", "Sudah ada"] as const;
export const PRODUCTION_UNITS = ["unit", "pcs", "kg", "liter", "pak", "lusin"] as const;

/** Sector-aware helper text; does not change which questions are asked. */
export const SECTOR_HINTS: Record<string, string> = {
  "Roti & kue": "Contoh produksi: jumlah roti atau kue per bulan. Oven listrik/gas masuk ke listrik atau LPG.",
  "Kemasan": "Contoh produksi: jumlah kemasan yang dibuat. Mesin cetak biasanya paling banyak memakai listrik.",
  "Bahan baku segar": "Contoh produksi: kg sayur/buah yang dikirim. Pengiriman sering menjadi sumber emisi terbesar.",
  "Bumbu & olahan": "Contoh produksi: jumlah botol atau bungkus per bulan.",
  "Minuman": "Contoh produksi: jumlah botol/gelas per bulan. Pendingin termasuk pemakaian listrik.",
};

export interface MissingItem {
  step: 1 | 2;
  field: string;
  label: string;
}

/**
 * Lists answers that are still missing. A category in `notApplicable` is
 * answered (the supplier said it does not apply), so it is not missing.
 * Optional descriptive fields (material type, waste handling) are not listed.
 */
export function missingItems(profile: ReportProfile, a: ActivityData): MissingItem[] {
  const out: MissingItem[] = [];
  const na = new Set(a.notApplicable ?? []);
  if (!profile.businessName) out.push({ step: 1, field: "businessName", label: "Nama usaha" });
  if (!profile.sector) out.push({ step: 1, field: "sector", label: "Sektor usaha" });
  if (!profile.mainProduct) out.push({ step: 1, field: "mainProduct", label: "Produk utama" });
  if (profile.productionVolume == null) out.push({ step: 1, field: "productionVolume", label: "Jumlah produksi" });
  if (profile.productionVolume != null && !profile.productionUnit) out.push({ step: 1, field: "productionUnit", label: "Satuan produksi" });
  if (profile.employees == null) out.push({ step: 1, field: "employees", label: "Jumlah pekerja" });
  if (!na.has("listrik") && a.electricityKwh == null) out.push({ step: 2, field: "electricityKwh", label: "Pemakaian listrik" });
  if (!na.has("bbm")) {
    if (a.fuelQuantity == null) out.push({ step: 2, field: "fuelQuantity", label: "Jumlah BBM/LPG" });
    if (!a.fuelType) out.push({ step: 2, field: "fuelType", label: "Jenis bahan bakar" });
  }
  if (!na.has("kemasan") && a.packagingKg == null) out.push({ step: 2, field: "packagingKg", label: "Berat kemasan" });
  if (!na.has("limbah") && a.wasteKg == null) out.push({ step: 2, field: "wasteKg", label: "Jumlah limbah" });
  if (!a.rawMaterialOrigin) out.push({ step: 2, field: "rawMaterialOrigin", label: "Asal bahan baku" });
  if (!na.has("transportasi")) {
    if (!a.transportMode) out.push({ step: 2, field: "transportMode", label: "Moda pengiriman" });
    if (a.transportKm == null) out.push({ step: 2, field: "transportKm", label: "Jarak pengiriman" });
  }
  if (!a.efficiencyPractice) out.push({ step: 2, field: "efficiencyPractice", label: "Upaya hemat energi/daur ulang" });
  return out;
}

/** Minimum needed before a report can be submitted (everything else may stay missing). */
export function submitBlockers(profile: ReportProfile): string[] {
  const b: string[] = [];
  if (!profile.businessName) b.push("Nama usaha wajib diisi");
  if (!profile.sector) b.push("Sektor usaha wajib dipilih");
  return b;
}

/** Soft plausibility warnings for UMKM-scale values (never block submission). */
export function plausibilityWarnings(a: ActivityData): string[] {
  const w: string[] = [];
  if ((a.electricityKwh ?? 0) > 20000) w.push("Pemakaian listrik di atas 20.000 kWh/bulan. Mohon periksa kembali.");
  if ((a.fuelQuantity ?? 0) > 5000) w.push("Jumlah bahan bakar di atas 5.000 per bulan. Mohon periksa kembali.");
  if ((a.transportKm ?? 0) > 20000) w.push("Jarak pengiriman di atas 20.000 km/bulan. Mohon periksa kembali.");
  return w;
}

/** Keeps fuel unit consistent with type: LPG is measured in kg, liquid fuels in liters. */
export const fuelUnitFor = (t: ActivityData["fuelType"]): ActivityData["fuelUnit"] =>
  t == null ? null : t === "LPG" ? "kg" : "liter";
