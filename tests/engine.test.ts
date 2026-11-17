// Emission + scoring engine tests, including row-by-row consistency with the workbook.
import { describe, expect, it } from "vitest";
import { calculateEmissions } from "@/lib/emissions";
import { emptyActivity } from "@/lib/report";
import { compareEvidence, completenessRatio, scoreReport, WORKBOOK_SCORING_PARAMS, type Benchmark } from "@/lib/scoring";
import { factorsFromWorkbook, reportFromSubmission, scoringParamsFromWorkbook } from "@/server/seed";
import { readWorkbook } from "@/server/workbook";

const wb = readWorkbook();
const factors = factorsFromWorkbook(wb);
const P = scoringParamsFromWorkbook(wb);
const names = new Map(wb.suppliers.map((s) => [s.supplierId, s]));
const rows = wb.submissions.map((s, i) => ({ s, sc: wb.scores[i], ...reportFromSubmission(s, names.get(s.supplierId)!.name) }));
const line = (r: ReturnType<typeof calculateEmissions>, c: string) => r.lines.find((l) => l.category === c)!;

describe("workbook factors and parameters", () => {
  it("imports the 7 factors with their original units and values, labeled simulated", () => {
    const by = Object.fromEntries(factors.map((f) => [f.factorId, [f.activityUnit, f.kgCO2ePerUnit, f.status]]));
    expect(by).toEqual({
      "wb-listrik-kwh": ["kWh", 0.85, "simulated"], "wb-bbm-liter": ["liter", 2.31, "simulated"],
      "wb-kemasan-kg": ["kg", 2.5, "simulated"], "wb-limbah-kg": ["kg", 0.5, "simulated"],
      "wb-motor-km": ["km", 0.1, "simulated"], "wb-mobil-bak-km": ["km", 0.25, "simulated"], "wb-truk-km": ["km", 0.9, "simulated"],
    });
    expect(factors.every((f) => f.factorYear === null && f.source.includes("Dummy Data Analisis.xlsx"))).toBe(true); // no invented year
  });
  it("scoring parameters equal the workbook (weights sum to 100%)", () => {
    expect(P.weights).toEqual({ completeness: 0.3, evidence: 0.3, intensity: 0.4 });
    expect(P.weights.completeness + P.weights.evidence + P.weights.intensity).toBeCloseTo(1, 12);
    expect([P.evidenceTolerance, P.minCompleteness, P.greenMaxRatio, P.redMinRatio]).toEqual([0.1, 0.6, 1, 1.15]);
    expect({ ...P, source: "" }).toEqual({ ...WORKBOOK_SCORING_PARAMS, source: "" });
  });
});

describe("units: liters and kilograms are never interchanged", () => {
  const a = (o: object) => ({ ...emptyActivity(), ...o });
  it("Bensin in liters uses the BBM factor", () => {
    expect(line(calculateEmissions(a({ fuelType: "Bensin", fuelUnit: "liter", fuelQuantity: 10 }), null, null, factors), "bbm"))
      .toMatchObject({ status: "calculated", kgCO2e: 23.1, factorId: "wb-bbm-liter", factorStatus: "simulated" });
  });
  it("LPG in kg has no factor (not converted from the liter factor)", () => {
    expect(line(calculateEmissions(a({ fuelType: "LPG", fuelUnit: "kg", fuelQuantity: 12 }), null, null, factors), "bbm"))
      .toMatchObject({ status: "missing_factor", kgCO2e: null });
  });
  it("Solar is not assumed equal to the 'setara bensin' factor", () => {
    expect(line(calculateEmissions(a({ fuelType: "Solar", fuelUnit: "liter", fuelQuantity: 12 }), null, null, factors), "bbm").status).toBe("missing_factor");
  });
  it("a kg quantity never matches a liter factor", () => {
    expect(line(calculateEmissions(a({ fuelType: "Bensin", fuelUnit: "kg", fuelQuantity: 12 }), null, null, factors), "bbm").status).toBe("missing_factor");
  });
  it("transport uses the mode-specific per-km factor; km without mode is incomplete", () => {
    expect(line(calculateEmissions(a({ transportMode: "Truk", transportKm: 100 }), null, null, factors), "transportasi").kgCO2e).toBe(90);
    expect(line(calculateEmissions(a({ transportKm: 100 }), null, null, factors), "transportasi").status).toBe("missing_activity");
  });
});

describe("missing versus genuine zero", () => {
  it("blank answers are missing: no emission, partial total, no intensity", () => {
    const r = calculateEmissions({ ...emptyActivity(), electricityKwh: 100 }, 50, "pcs", factors);
    expect(line(r, "limbah")).toMatchObject({ status: "missing_activity", quantity: null, kgCO2e: null });
    expect(r.totalStatus).toBe("partial");
    expect(r.totalKgCO2e).toBe(85);
    expect(r.intensity).toBeNull();
    expect(r.missingCategories).toEqual(["bbm", "kemasan", "limbah", "transportasi"]);
  });
  it("'Tidak memakai' is a genuine zero activity and counts toward a complete total", () => {
    const r = calculateEmissions({ ...emptyActivity(), electricityKwh: 100, packagingKg: 4, wasteKg: 0, notApplicable: ["bbm", "transportasi"] }, 50, "pcs", factors);
    expect(line(r, "bbm")).toMatchObject({ status: "not_used", quantity: 0, kgCO2e: 0 });
    expect(line(r, "limbah")).toMatchObject({ status: "calculated", quantity: 0, kgCO2e: 0 }); // typed 0 is real too
    expect(r.totalStatus).toBe("complete");
    expect(r.totalKgCO2e).toBe(95);
    expect(r.intensity).toBe(1.9);
  });
  it("nothing answered → no total at all (not 0)", () => {
    const r = calculateEmissions(emptyActivity(), null, null, factors);
    expect(r.totalStatus).toBe("unavailable");
    expect(r.totalKgCO2e).toBeNull();
  });
  it("completeness counts 'tidak memakai' as answered and blanks as unanswered", () => {
    const p = { businessName: "X", sector: "Minuman", mainProduct: null, productionVolume: 10, productionUnit: "pcs", employees: 2 };
    expect(completenessRatio(p, emptyActivity())).toBe(0.3);
    expect(completenessRatio(p, { ...emptyActivity(), notApplicable: ["listrik", "bbm", "kemasan", "limbah", "transportasi"] })).toBe(0.8);
  });
});

describe("consistency with the workbook (277 rows)", () => {
  it("completeness reproduces column 'Kelengkapan Data' for every row", () => {
    for (const r of rows) expect(completenessRatio(r.profile, r.activity), r.s.supplierId + r.s.period).toBeCloseTo(r.sc.completeness, 12);
  });
  it("every reported category reproduces the workbook emission; blank cells are the only differences", () => {
    const keys = ["listrik", "bbm", "kemasan", "limbah", "transportasi"] as const;
    let blankAsZero = 0;
    for (const r of rows) {
      const e = calculateEmissions(r.activity, r.profile.productionVolume, r.profile.productionUnit, factors);
      for (const k of keys) {
        const l = line(e, k);
        if (l.status === "calculated") expect(l.kgCO2e!, `${r.s.supplierId} ${r.s.period} ${k}`).toBeCloseTo(r.sc.emis[k], 6);
        else { expect(r.sc.emis[k]).toBe(0); expect(l.status).toBe("missing_activity"); blankAsZero++; }
      }
      if (e.totalStatus === "complete") {
        expect(e.totalKgCO2e!).toBeCloseTo(r.sc.emis.total, 6);
        expect(e.intensity!).toBeCloseTo(r.sc.intensity!, 9);
      }
    }
    // Documented difference: the workbook multiplies blank cells as 0; the engine reports them missing.
    expect(blankAsZero).toBe(27); // 2 kWh + 16 BBM + 3 kemasan + 4 limbah + 2 transport blanks
  });
  it("evidence rule reproduces 'Status Bukti' for every row (10% tolerance)", () => {
    const map = { match: "Cocok", mismatch: "Tidak cocok", unverifiable: "Belum ada bukti" } as const;
    for (const r of rows) expect(map[compareEvidence(r.s.kwh, r.s.billKwh, P.evidenceTolerance).status]).toBe(r.sc.evidenceStatus);
  });
  it("evidence rule reproduces all 12 sample-audit results", () => {
    expect(wb.audits).toHaveLength(12);
    for (const a of wb.audits) {
      const out = compareEvidence(a.reportedKwh, a.auditedKwh, P.evidenceTolerance);
      expect(out.status === "match" ? "Cocok" : "Tidak cocok").toBe(a.result);
    }
  });
  it("scoring formula reproduces the workbook wherever every component is genuinely available", () => {
    let compared = 0;
    let withheld = 0;
    for (const r of rows) {
      const e = calculateEmissions(r.activity, r.profile.productionVolume, r.profile.productionUnit, factors);
      const bench: Benchmark = { benchmarkId: "test", sector: r.s.sector!, avgIntensity: r.sc.groupAvg!, unit: "kg CO2e/unit", status: "simulated_sample_average", source: "test only" };
      const s = scoreReport({ profile: r.profile, activity: r.activity, intensity: e.intensity, evidence: compareEvidence(r.s.kwh, r.s.billKwh, P.evidenceTolerance), benchmark: bench, params: P });
      if (s.final != null) {
        expect(s.final, `${r.s.supplierId} ${r.s.period}`).toBe(r.sc.final);
        expect(s.color).toBe(r.sc.color);
        compared++;
      } else {
        withheld++;
        // Withheld only because evidence or intensity is genuinely unavailable — the workbook scored those as 0.
        expect(r.sc.evidenceStatus === "Belum ada bukti" || e.intensity == null).toBe(true);
      }
    }
    expect(compared + withheld).toBe(277);
    expect(compared).toBeGreaterThan(150);
  });
});

describe("evidence tolerance and missing evidence", () => {
  it("exactly 10% is a match; just above is a mismatch", () => {
    expect(compareEvidence(110, 100, 0.1).status).toBe("match");
    expect(compareEvidence(90, 100, 0.1).status).toBe("match");
    expect(compareEvidence(110.01, 100, 0.1).status).toBe("mismatch");
  });
  it("no checked value, zero checked value, or no reported value → unverifiable (never a 0 score)", () => {
    expect(compareEvidence(100, null, 0.1).status).toBe("unverifiable");
    expect(compareEvidence(100, 0, 0.1).status).toBe("unverifiable");
    expect(compareEvidence(null, 100, 0.1).status).toBe("unverifiable");
    expect(compareEvidence(100, 100, 0.1, true).status).toBe("unverifiable");
  });
});

describe("score components", () => {
  const profile = { businessName: "X", sector: "Minuman", mainProduct: "Teh", productionVolume: 100, productionUnit: "pcs", employees: 2 };
  const activity = { ...emptyActivity(), electricityKwh: 100, packagingKg: 1, wasteKg: 1, rawMaterialOrigin: "Lokal" as const,
    efficiencyPractice: "Sebagian" as const, notApplicable: ["bbm", "transportasi"] as ("bbm" | "transportasi")[] };
  it("unavailable components are excluded, not scored 0, and there is no final score", () => {
    const s = scoreReport({ profile, activity, intensity: 0.9, evidence: { status: "unverifiable", reason: "x" }, benchmark: null, params: P });
    expect(s.components.map((c) => [c.key, c.status, c.score])).toEqual([["completeness", "available", 100], ["evidence", "unavailable", null], ["intensity", "unavailable", null]]);
    expect(s.availableWeight).toBe(0.3);
    expect(s.partialPoints).toBe(30);
    expect(s.final).toBeNull();
    expect(s.color).toBeNull();
  });
  it("a red trigger is decisive even when other components are unavailable", () => {
    const s = scoreReport({ profile, activity, intensity: null, evidence: { status: "mismatch", diffRatio: 0.3 }, benchmark: null, params: P });
    expect(s.color).toBe("MERAH");
    expect(s.final).toBeNull();
  });
  it("weights are applied 30/30/40 when everything is available", () => {
    const bench: Benchmark = { benchmarkId: "b", sector: "Minuman", avgIntensity: 1, unit: "", status: "industry_verified", source: "test" };
    const s = scoreReport({ profile, activity, intensity: 1.1, evidence: { status: "match", diffRatio: 0 }, benchmark: bench, params: P });
    expect(s.final).toBe(100 * 0.3 + 100 * 0.3 + 50 * 0.4);
    expect(s.color).toBe("KUNING");
  });
});
