// Emission calculation engine (pure, shared by server and tests).
//
//   Estimated emissions (kg CO2e) = activity quantity × applicable emission factor
//
// Rules:
// - A blank answer is MISSING: no emission is calculated and the total is partial.
// - A category marked "Tidak memakai" is a genuine zero activity (quantity 0).
// - A factor applies only when its unit matches the activity unit exactly
//   (kWh, liter, kg, km). Liters and kilograms are never interchanged.
// - Fuel factors are tied to fuel types. The workbook's BBM factor is
//   "setara bensin" per liter, so it covers Bensin and workbook rows whose fuel
//   type was not recorded — not Solar, LPG or "Lainnya".
// - No factor = no emission for that line; nothing is invented.
import type { ActivityCategory, ActivityData } from "./types";

export type FactorUnit = "kWh" | "liter" | "kg" | "km";

export interface EmissionFactor {
  factorId: string;
  category: ActivityCategory;
  activityUnit: FactorUnit;
  kgCO2ePerUnit: number;
  /** Fuel types ("unspecified" = type not recorded) or transport mode this factor covers. */
  appliesToFuelTypes?: string[];
  appliesToTransportMode?: string;
  status: "simulated" | "verified";
  source: string;
  sourceNote: string;
  factorYear: number | null;
  validFrom: string | null;
  validTo: string | null;
}

export type LineStatus =
  | "calculated"
  | "not_used" // supplier declared the category does not apply → genuine zero
  | "missing_activity" // blank answer
  | "missing_factor" // no applicable factor for this unit/type/mode
  | "unit_unknown"; // quantity given but unit cannot be determined

export interface EmissionLine {
  category: ActivityCategory;
  status: LineStatus;
  quantity: number | null;
  unit: FactorUnit | null;
  qualifier: string | null; // fuel type or transport mode
  factorId: string | null;
  factorValue: number | null;
  factorStatus: "simulated" | "verified" | null;
  factorSource: string | null;
  factorYear: number | null;
  kgCO2e: number | null;
  note: string;
}

export interface EmissionResult {
  lines: EmissionLine[];
  /** Sum over calculated + not_used lines. Null when nothing could be calculated. */
  totalKgCO2e: number | null;
  totalStatus: "complete" | "partial" | "unavailable";
  missingCategories: ActivityCategory[];
  usesSimulatedFactors: boolean;
  /** kg CO2e per production unit — only when the total is complete and volume > 0. */
  intensity: number | null;
  intensityUnit: string | null;
  intensityNote: string;
}

const CATEGORIES: ActivityCategory[] = ["listrik", "bbm", "kemasan", "limbah", "transportasi"];

function findFactor(factors: EmissionFactor[], category: ActivityCategory, unit: FactorUnit, qualifier: string | null) {
  return factors.find((f) => {
    if (f.category !== category || f.activityUnit !== unit) return false;
    if (category === "bbm") return (f.appliesToFuelTypes ?? []).includes(qualifier ?? "unspecified");
    if (category === "transportasi") return f.appliesToTransportMode === qualifier;
    return true;
  });
}

function activityFor(a: ActivityData, c: ActivityCategory): { qty: number | null; unit: FactorUnit | null; qualifier: string | null; incomplete?: string } {
  switch (c) {
    case "listrik": return { qty: a.electricityKwh, unit: "kWh", qualifier: null };
    case "kemasan": return { qty: a.packagingKg, unit: "kg", qualifier: null };
    case "limbah": return { qty: a.wasteKg, unit: "kg", qualifier: null };
    case "bbm": return { qty: a.fuelQuantity, unit: a.fuelUnit, qualifier: a.fuelType ?? "unspecified" };
    case "transportasi":
      return {
        qty: a.transportKm, unit: "km", qualifier: a.transportMode,
        incomplete: a.transportKm != null && !a.transportMode ? "Moda pengiriman belum diisi" : undefined,
      };
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function calculateEmissions(
  activity: ActivityData,
  productionVolume: number | null,
  productionUnit: string | null,
  factors: EmissionFactor[],
): EmissionResult {
  const na = new Set(activity.notApplicable ?? []);
  const lines: EmissionLine[] = CATEGORIES.map((category) => {
    const base = { category, factorId: null, factorValue: null, factorStatus: null, factorSource: null, factorYear: null } as const;
    if (na.has(category)) {
      return { ...base, status: "not_used", quantity: 0, unit: null, qualifier: null, kgCO2e: 0, note: "Dinyatakan tidak memakai (aktivitas nol)" };
    }
    const { qty, unit, qualifier, incomplete } = activityFor(activity, category);
    if (qty == null) return { ...base, status: "missing_activity", quantity: null, unit, qualifier, kgCO2e: null, note: "Data aktivitas belum diisi" };
    if (incomplete) return { ...base, status: "missing_activity", quantity: qty, unit, qualifier, kgCO2e: null, note: incomplete };
    if (!unit) return { ...base, status: "unit_unknown", quantity: qty, unit: null, qualifier, kgCO2e: null, note: "Satuan tidak diketahui (jenis bahan bakar belum dipilih)" };
    const f = findFactor(factors, category, unit, qualifier);
    if (!f) {
      return { ...base, status: "missing_factor", quantity: qty, unit, qualifier, kgCO2e: null,
        note: `Faktor emisi untuk ${qualifier && qualifier !== "unspecified" ? `${qualifier} ` : ""}(${unit}) belum tersedia` };
    }
    return {
      category, status: "calculated", quantity: qty, unit, qualifier, factorId: f.factorId, factorValue: f.kgCO2ePerUnit,
      factorStatus: f.status, factorSource: f.source, factorYear: f.factorYear, kgCO2e: round(qty * f.kgCO2ePerUnit),
      note: `${qty} ${unit} × ${f.kgCO2ePerUnit} kg CO2e/${unit}`,
    };
  });

  const counted = lines.filter((l) => l.status === "calculated" || l.status === "not_used");
  const missingCategories = lines.filter((l) => !counted.includes(l)).map((l) => l.category);
  const anyCalculated = lines.some((l) => l.status === "calculated");
  const totalStatus = missingCategories.length === 0 ? "complete" : anyCalculated ? "partial" : "unavailable";
  // "unavailable" = nothing was actually calculated and something is missing: no total at all.
  const totalKgCO2e = totalStatus === "unavailable" ? null : round(counted.reduce((s, l) => s + (l.kgCO2e ?? 0), 0));

  let intensity: number | null = null;
  let intensityNote = "";
  if (totalStatus !== "complete") intensityNote = "Intensitas tidak dihitung karena total emisi belum lengkap";
  else if (productionVolume == null) intensityNote = "Intensitas tidak dihitung karena volume produksi belum diisi";
  else if (productionVolume <= 0) intensityNote = "Intensitas tidak dihitung karena volume produksi nol";
  else { intensity = totalKgCO2e! / productionVolume; intensityNote = "Total emisi ÷ volume produksi"; }

  return {
    lines, totalKgCO2e, totalStatus, missingCategories,
    usesSimulatedFactors: lines.some((l) => l.factorStatus === "simulated"),
    intensity, intensityUnit: intensity != null ? `kg CO2e/${productionUnit ?? "unit"}` : null, intensityNote,
  };
}
