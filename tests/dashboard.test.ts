// Phase 4: company summaries (KPI accuracy), source filters, company-scoped verification,
// demo benchmark labeling and trial/simulated separation.
import { beforeAll, describe, expect, it } from "vitest";
import { consumptionFlags, filterRows, kpis, kpisFor, type StatsRow } from "@/lib/kpi";
import { referenceDate } from "@/lib/period";
import { calculate, loadReferenceData } from "@/server/calculation";
import { createDraft, deleteDraft } from "@/server/drafts";
import { submitReport } from "@/server/reports";
import { seedWorkbook } from "@/server/seed";
import { connectWithInvite, setConsent } from "@/server/sharing";
import { createInvite, registerSupplier } from "@/server/suppliers";
import { reviewReport } from "@/server/verification";
import { readWorkbook } from "@/server/workbook";
import { auth, companyCaller, db, resetEmulators, supplierCaller, writeDraft } from "./helpers";

const wb = readWorkbook();
const REF = referenceDate("2027-04-05");
const buyerOf = new Map(wb.suppliers.map((s) => [s.supplierId, s.buyer === "Perusahaan Mitra A" ? "CMP-A" : "CMP-B"]));
const reviewer = (cid: string) => ({ uid: `rev-${cid}`, email: null, claims: { role: "company_admin", companyId: cid, canVerify: true } });
const rowsOf = async (cid: string, period: string) => ((await db.doc(`company_period_stats/${cid}_${period}`).get()).data()?.rows ?? []) as StatsRow[];
const profile = { businessName: "Roti Rina", sector: "Roti & kue", mainProduct: "Roti", productionVolume: 2000, productionUnit: "unit", employees: 3 };
const activity = { electricityKwh: 400, packagingKg: 20, wasteKg: 10, rawMaterialOrigin: "Lokal", transportMode: "Motor", transportKm: 300, efficiencyPractice: "Sebagian", notApplicable: ["bbm"] };

async function newSupplier(email: string, companies: string[]) {
  const u = await auth.createUser({ email, password: "rahasia123" });
  const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email, claims: {} }, { picName: "Rina", businessName: "Roti Rina", whatsapp: "081377788899", privacyConsent: true });
  const s = supplierCaller(u.uid, supplierId);
  for (const cid of companies) {
    const { code } = await createInvite(db, companyCaller(cid), null);
    await connectWithInvite(db, s, { inviteCode: code, shareData: true });
  }
  return { s, supplierId };
}

describe("seeded summaries reproduce the workbook (KPI accuracy)", () => {
  beforeAll(async () => { await resetEmulators(); });

  it("seeding builds one summary per company and period; re-seeding rewrites none", async () => {
    const first = await seedWorkbook(db, wb);
    expect(first.statsWritten).toBeGreaterThanOrEqual(6);
    const second = await seedWorkbook(db, wb);
    expect(second.statsWritten).toBe(0);
    for (const cid of ["CMP-A", "CMP-B"]) for (const p of ["2027-01", "2027-02", "2027-03"]) expect((await rowsOf(cid, p)).length).toBe(50);
  });

  it("per-company KPIs equal independent calculations from the workbook rows", async () => {
    for (const cid of ["CMP-A", "CMP-B"]) {
      for (const period of ["2027-01", "2027-02", "2027-03"]) {
        const k = kpisFor(await rowsOf(cid, period), "demo");
        const src = wb.scores.filter((s) => s.period === period && buyerOf.get(s.supplierId) === cid);
        expect(k.consented).toBe(50);
        expect(k.received).toBe(src.length);
        expect(k.missing).toBe(50 - src.length);
        expect(k.completionRate).toBeCloseTo(src.length / 50, 12);
        expect(k.scored).toBe(src.length);
        expect(k.avgScore!).toBeCloseTo(src.reduce((t, s) => t + s.final, 0) / src.length, 9);
        expect(k.colors).toEqual({ HIJAU: src.filter((s) => s.color === "HIJAU").length, KUNING: src.filter((s) => s.color === "KUNING").length, MERAH: src.filter((s) => s.color === "MERAH").length, none: 0 });
        expect(k.emissions.totalKg).toBeCloseTo(src.reduce((t, s) => t + s.emis.total, 0), 6);
        expect(k.emissions.byCategory.listrik).toBeCloseTo(src.reduce((t, s) => t + s.emis.listrik, 0), 6);
        expect(k.evidence).toEqual({
          match: src.filter((s) => s.evidenceStatus === "Cocok").length,
          mismatch: src.filter((s) => s.evidenceStatus === "Tidak cocok").length,
          unverifiable: src.filter((s) => s.evidenceStatus === "Belum ada bukti").length,
        });
        expect(k.avgCompleteness!).toBeCloseTo(src.reduce((t, s) => t + s.completeness, 0) / src.length, 9);
        expect(k.review).toEqual({ pending: 0, verified: 0, rejected: 0, revisionRequested: 0, awaiting: 0 }); // simulated: no workflow
      }
    }
  });

  it("both companies together equal the Rekap tab", async () => {
    for (const rk of wb.rekap) {
      const a = kpisFor(await rowsOf("CMP-A", rk.period), "demo");
      const b = kpisFor(await rowsOf("CMP-B", rk.period), "demo");
      expect(a.received + b.received).toBe(rk.submitted);
      expect(a.colors.HIJAU + b.colors.HIJAU).toBe(rk.hijau);
      expect(a.colors.MERAH + b.colors.MERAH).toBe(rk.merah);
      expect(a.emissions.totalKg + b.emissions.totalKg).toBeCloseTo(rk.totalEmission, 6);
    }
  });

  it("high-consumption flags come from real period-over-period comparisons", async () => {
    const [jan, feb] = [await rowsOf("CMP-A", "2027-01"), await rowsOf("CMP-A", "2027-02")];
    const flags = consumptionFlags(feb, jan).filter((f) => f.kind === "kwh_increase").map((f) => f.supplierId).sort();
    const sub = (p: string) => new Map(wb.submissions.filter((s) => s.period === p && buyerOf.get(s.supplierId) === "CMP-A").map((s) => [s.supplierId, s.kwh]));
    const j = sub("2027-01"); const f = sub("2027-02");
    const expected = [...f].filter(([sid, k]) => k != null && j.get(sid) != null && j.get(sid)! > 0 && (k - j.get(sid)!) / j.get(sid)! > 0.2).map(([sid]) => sid).sort();
    expect(flags).toEqual(expected);
  });
});

describe("trial data joins without touching simulated KPIs", () => {
  beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, wb); });

  it("draft → submit appear live in the summary; demo KPIs stay identical", async () => {
    const before = kpisFor(await rowsOf("CMP-A", "2027-03"), "demo");
    const { s, supplierId } = await newSupplier("trial1@umkm.test", ["CMP-A"]);
    let row = (await rowsOf("CMP-A", "2027-03")).find((r) => r.supplierId === supplierId)!;
    expect(row).toMatchObject({ source: "trial", consent: true, reportStatus: "missing" });
    await createDraft(db, s, "2027-03", REF);
    row = (await rowsOf("CMP-A", "2027-03")).find((r) => r.supplierId === supplierId)!;
    expect(row.reportStatus).toBe("draft");
    expect(row.totalKg).toBeNull(); // draft contents never reach the company
    await deleteDraft(db, s, "2027-03");
    expect((await rowsOf("CMP-A", "2027-03")).find((r) => r.supplierId === supplierId)!.reportStatus).toBe("missing");
    await writeDraft(supplierId, "2027-03", { profile, activity: { ...activity, wasteKg: null } });
    await submitReport(db, s, "2027-03", REF);
    row = (await rowsOf("CMP-A", "2027-03")).find((r) => r.supplierId === supplierId)!;
    expect(row).toMatchObject({ reportStatus: "submitted", reviewStatus: "pending", scoreBasis: "engine_provisional", totalStatus: "partial", final: null });
    expect(row.byCategory).toMatchObject({ bbm: 0, limbah: null }); // genuine zero vs missing
    const after = kpisFor(await rowsOf("CMP-A", "2027-03"), "demo");
    expect(after).toEqual(before);
    const trial = kpisFor(await rowsOf("CMP-A", "2027-03"), "trial");
    expect(trial).toMatchObject({ consented: 1, received: 1, scored: 0, unscored: 1, avgScore: null });
    expect((await rowsOf("CMP-B", "2027-03")).some((r) => r.supplierId === supplierId)).toBe(false);
  });

  it("source filters never blend averages", async () => {
    const rows = await rowsOf("CMP-A", "2027-03");
    expect(kpis(rows, "all").map((k) => k.source)).toEqual(["demo", "trial"]);
    expect(kpis(rows, "trial")).toHaveLength(1);
    expect(filterRows(rows, "demo").every((r) => r.source === "demo")).toBe(true);
    expect(filterRows(rows, "trial").every((r) => r.source === "trial")).toBe(true);
  });
});

describe("company-scoped verification", () => {
  beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, wb); });

  it("company A's approval does not approve the report for company B", async () => {
    const { s, supplierId } = await newSupplier("dua@umkm.test", ["CMP-A", "CMP-B"]);
    const rid = `${supplierId}_2027-03`;
    await writeDraft(supplierId, "2027-03", { profile, activity });
    await submitReport(db, s, "2027-03", REF);
    expect((await db.doc(`company_reviews/CMP-A_${rid}`).get()).data()!.status).toBe("pending");
    expect((await db.doc(`company_reviews/CMP-B_${rid}`).get()).data()!.status).toBe("pending");

    await reviewReport(db, reviewer("CMP-A"), { reportId: rid, action: "approve", checkedKwh: 390, checkSource: "dokumen_asli" });
    expect((await db.doc(`company_reviews/CMP-A_${rid}`).get()).data()!.status).toBe("verified");
    expect((await db.doc(`company_reviews/CMP-B_${rid}`).get()).data()!.status).toBe("pending");
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.status).toBe("submitted");
    expect((await rowsOf("CMP-A", "2027-03")).find((r) => r.supplierId === supplierId)!).toMatchObject({ reviewStatus: "verified", scoreBasis: "engine_company_review", evidence: "match" });
    expect((await rowsOf("CMP-B", "2027-03")).find((r) => r.supplierId === supplierId)!).toMatchObject({ reviewStatus: "pending", scoreBasis: "engine_provisional", evidence: "unverifiable" });
    await expect(reviewReport(db, reviewer("CMP-A"), { reportId: rid, action: "reject", note: "berubah pikiran" })).rejects.toMatchObject({ code: "not_reviewable" });

    // A's decision record, review and score are visible to A only (and the supplier).
    const decision = (await db.collection("verification_records").where("reportId", "==", rid).where("action", "==", "approve").get()).docs[0].data();
    expect(decision.sharedWith).toEqual(["CMP-A"]);
    // Re-granting B never leaks A-scoped documents to B.
    await setConsent(db, s, { companyId: "CMP-B", granted: false });
    await setConsent(db, s, { companyId: "CMP-B", granted: true });
    expect((await db.doc(`company_reviews/CMP-A_${rid}`).get()).data()!.sharedWith).toEqual(["CMP-A"]);
    const again = (await db.collection("verification_records").where("reportId", "==", rid).where("action", "==", "approve").get()).docs[0].data();
    expect(again.sharedWith).toEqual(["CMP-A"]);
    const scoped = await db.collection(`supplier_scores/${rid}/versions`).where("companyId", "==", "CMP-A").get();
    expect(scoped.docs.every((d) => JSON.stringify(d.data().sharedWith) === '["CMP-A"]')).toBe(true);

    // B rejects independently.
    await reviewReport(db, reviewer("CMP-B"), { reportId: rid, action: "reject", note: "Data produksi tidak wajar" });
    expect((await db.doc(`company_reviews/CMP-A_${rid}`).get()).data()!.status).toBe("verified");
    expect((await db.doc(`company_reviews/CMP-B_${rid}`).get()).data()!.status).toBe("rejected");
  });

  it("a revision request reopens the report for everyone and resubmission resets every review", async () => {
    const { s, supplierId } = await newSupplier("tiga@umkm.test", ["CMP-A", "CMP-B"]);
    const rid = `${supplierId}_2027-03`;
    await writeDraft(supplierId, "2027-03", { profile, activity });
    await submitReport(db, s, "2027-03", REF);
    await reviewReport(db, reviewer("CMP-B"), { reportId: rid, action: "request_revision", note: "kWh tidak sesuai tagihan" });
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.status).toBe("revision_requested");
    expect((await db.doc(`company_reviews/CMP-A_${rid}`).get()).data()!.status).toBe("awaiting_resubmission");
    await expect(reviewReport(db, reviewer("CMP-A"), { reportId: rid, action: "approve" })).rejects.toMatchObject({ code: "not_reviewable" });
    await submitReport(db, s, "2027-03", REF);
    for (const cid of ["CMP-A", "CMP-B"]) expect((await db.doc(`company_reviews/${cid}_${rid}`).get()).data()).toMatchObject({ status: "pending", reportVersion: 2 });
  });
});

describe("demo benchmark (explicitly labeled, opt-in)", () => {
  beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, wb); });
  const p = { ...profile, sector: "Roti & kue" };
  const a = { electricityKwh: 400, fuelQuantity: null, fuelUnit: null, fuelType: null, packagingKg: 20, packagingMaterial: null, wasteKg: 10, wasteHandling: null,
    rawMaterialOrigin: "Lokal" as const, transportMode: "Motor" as const, transportKm: 300, efficiencyPractice: "Sebagian" as const, notApplicable: ["bbm" as const] };

  it("off by default: intensity unavailable", async () => {
    const c = calculate(p, a, null, await loadReferenceData(db, { allowSimulatedBenchmark: false }));
    expect(c.score.components[2].status).toBe("unavailable");
    expect(c.benchmark).toBeNull();
  });
  it("on: uses the simulated group average, labeled, only for count units", async () => {
    const ref = await loadReferenceData(db, { allowSimulatedBenchmark: true });
    const c = calculate(p, a, 400, ref);
    expect(c.benchmark).toMatchObject({ status: "simulated_sample_average", sector: "Roti & kue" });
    expect(c.score.components[2].status).toBe("available");
    expect(c.score.components[2].detail).toContain("pembanding simulasi");
    expect(c.score.final).not.toBeNull();
    expect(calculate({ ...p, productionUnit: "kg" }, a, 400, ref).score.components[2].status).toBe("unavailable");
  });
});

describe("trend honesty", () => {
  const row = (source: "demo" | "trial", status: string): StatsRow => ({ supplierId: Math.random().toString(), name: "x", sector: null, region: null, source, critical: false, consent: true,
    reportStatus: status as StatsRow["reportStatus"], reportVersion: null, reviewStatus: null, evidenceCount: null, final: null, color: null, scoreBasis: null, benchmarkBasis: null,
    completeness: null, evidence: null, intensity: null, intensityRatio: null, totalKg: null, totalStatus: null, byCategory: null, blankAsZero: [], kwh: null });
  it("no fabricated 0% outside a source's reporting window", async () => {
    const { completionTrend } = await import("@/lib/kpi");
    const periods = [
      { period: "2026-10", rows: [row("demo", "missing"), row("trial", "missing")] },
      { period: "2027-01", rows: [row("demo", "imported_simulated"), row("trial", "missing")] },
      { period: "2027-02", rows: [row("demo", "imported_simulated"), row("trial", "submitted")] },
      { period: "2027-03", rows: [row("demo", "missing"), row("trial", "missing")] },
    ];
    expect(completionTrend(periods, "demo")).toEqual([null, 100, 100, null]);
    expect(completionTrend(periods, "trial")).toEqual([null, null, 100, 0]); // a real miss after the first report counts
  });
});

describe("unified dashboard view", () => {
  const mk = (source: "demo" | "trial", status: string, extra: Partial<StatsRow> = {}): StatsRow => ({ supplierId: Math.random().toString(), name: "x", sector: null, region: null, source, critical: false, consent: true,
    reportStatus: status as StatsRow["reportStatus"], reportVersion: null, reviewStatus: null, evidenceCount: null, final: null, color: null, scoreBasis: null, benchmarkBasis: null,
    completeness: null, evidence: null, intensity: null, intensityRatio: null, totalKg: null, totalStatus: null, byCategory: null, blankAsZero: [], kwh: null, ...extra });
  it("combines only additive quantities and never averages scores", async () => {
    const { combinedKpis } = await import("@/lib/kpi");
    const rows = [
      mk("demo", "imported_simulated", { final: 80, color: "HIJAU", totalKg: 100, totalStatus: "workbook", byCategory: { listrik: 60, bbm: 40, kemasan: 0, limbah: 0, transportasi: 0 } }),
      mk("demo", "missing"),
      mk("trial", "submitted", { totalKg: 50, totalStatus: "partial", byCategory: { listrik: 50, bbm: 0, kemasan: null, limbah: null, transportasi: null } }),
    ];
    const k = combinedKpis(rows);
    expect(k).toMatchObject({ related: 3, expected: 3, received: 2, emissionsKg: 150, hasDemo: true, hasTrial: true });
    expect(k.byCategory.listrik).toBe(110);
    expect(k.colors).toEqual({ HIJAU: 1, KUNING: 0, MERAH: 0, none: 1 });
    expect(Object.keys(k)).not.toContain("avgScore");
  });
  it("combined trend counts each source only inside its own window", async () => {
    const { combinedCompletionTrend } = await import("@/lib/kpi");
    const periods = [
      { period: "2027-01", rows: [mk("demo", "imported_simulated"), mk("demo", "missing"), mk("trial", "missing")] },
      { period: "2027-03", rows: [mk("demo", "imported_simulated"), mk("demo", "imported_simulated"), mk("trial", "submitted")] },
    ];
    // Jan: trial has no report yet → only demo counts (1/2), not 1/3.
    expect(combinedCompletionTrend(periods)).toEqual([50, 100]);
  });
});
