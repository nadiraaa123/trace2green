// Pure unit tests (no emulator needed, but run in the same suite).
import { describe, expect, it } from "vitest";
import { parseIdNumber } from "@/lib/numbers";
import { defaultPeriod, formatPeriod, isReportable, referenceDate, reportablePeriods } from "@/lib/period";
import { emptyActivity, emptyProfile, fuelUnitFor, missingItems, submitBlockers } from "@/lib/report";
import { validateEvidenceFile, DemoPreviewStorage } from "@/lib/evidence/storage";

describe("parseIdNumber (Indonesian input)", () => {
  it.each([
    ["", null], ["  ", null], ["0", 0], ["1250", 1250], ["1.250", 1250], ["1.250.000", 1250000],
    ["28,9", 28.9], ["1.250,5", 1250.5], ["28.9", 28.9], ["0,5", 0.5],
  ])("%s -> %s", (raw, expected) => {
    expect(parseIdNumber(raw)).toEqual({ ok: true, value: expected });
  });
  it.each(["-5", "abc", "1,2,3", "12a", "1.25.0", "1e5", "9999999999"])("rejects %s", (raw) => {
    expect(parseIdNumber(raw).ok).toBe(false);
  });
  it("empty stays null — missing is never zero", () => {
    expect(parseIdNumber("")).toEqual({ ok: true, value: null });
  });
});

describe("reporting periods", () => {
  const ref = referenceDate("2027-04-05");
  it("offers the 12 full months before the reference month, newest first", () => {
    const p = reportablePeriods(ref);
    expect(p[0]).toBe("2027-03");
    expect(p).toHaveLength(12);
    expect(p[11]).toBe("2026-04");
    expect(defaultPeriod(ref)).toBe("2027-03");
  });
  it("rejects the current and future months", () => {
    expect(isReportable("2027-04", ref)).toBe(false);
    expect(isReportable("2027-05", ref)).toBe(false);
    expect(isReportable("2026-03", ref)).toBe(false);
    expect(isReportable("2027-01", ref)).toBe(true);
  });
  it("crosses year boundaries", () => {
    expect(reportablePeriods(referenceDate("2027-01-10"))[0]).toBe("2026-12");
  });
  it("formats in Indonesian", () => expect(formatPeriod("2027-03")).toBe("Maret 2027"));
});

describe("missing items and not-applicable categories", () => {
  it("an empty report lists every required answer as missing", () => {
    const m = missingItems(emptyProfile(), emptyActivity()).map((x) => x.field);
    expect(m).toEqual(expect.arrayContaining(["electricityKwh", "fuelQuantity", "fuelType", "packagingKg", "wasteKg", "transportKm", "efficiencyPractice", "sector"]));
  });
  it("a category marked 'tidak memakai' is answered, not missing", () => {
    const a = { ...emptyActivity(), notApplicable: ["bbm", "transportasi"] as const };
    const m = missingItems(emptyProfile(), { ...a, notApplicable: [...a.notApplicable] }).map((x) => x.field);
    expect(m).not.toContain("fuelQuantity");
    expect(m).not.toContain("transportKm");
    expect(m).toContain("electricityKwh");
  });
  it("zero is a real answer, distinct from missing", () => {
    const m = missingItems(emptyProfile(), { ...emptyActivity(), wasteKg: 0 }).map((x) => x.field);
    expect(m).not.toContain("wasteKg");
  });
  it("submission needs only business name and sector", () => {
    expect(submitBlockers(emptyProfile())).toHaveLength(2);
    expect(submitBlockers({ ...emptyProfile(), businessName: "X Y", sector: "Minuman" })).toHaveLength(0);
  });
  it("fuel unit follows fuel type", () => {
    expect(fuelUnitFor("LPG")).toBe("kg");
    expect(fuelUnitFor("Solar")).toBe("liter");
    expect(fuelUnitFor(null)).toBeNull();
  });
});

describe("evidence storage (demo only)", () => {
  it("validates type and size", () => {
    expect(validateEvidenceFile({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(validateEvidenceFile({ size: 1000, type: "text/html" })).toMatch(/Format/);
    expect(validateEvidenceFile({ size: 6 * 1024 * 1024, type: "application/pdf" })).toMatch(/5 MB/);
  });
  it("demo storage never claims persistence", async () => {
    const s = new DemoPreviewStorage();
    expect(s.persistsFiles).toBe(false);
    const file = new File([new Uint8Array(10)], "tagihan.jpg", { type: "image/jpeg" });
    const r = await s.store(file);
    expect(r).toMatchObject({ storageMode: "demo_preview", persisted: false });
  });
});
