// Workbook import: idempotency, preservation, Rekap checksums, and no clobbering of live data.
import { FieldValue } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { seedWorkbook } from "@/server/seed";
import { createInvite, claimSupplier, registerSupplier } from "@/server/suppliers";
import { setConsent } from "@/server/sharing";
import { readWorkbook } from "@/server/workbook";
import { auth, companyCaller, db, resetEmulators, supplierCaller } from "./helpers";

const wb = readWorkbook();
const count = async (col: string) => (await db.collection(col).count().get()).data().count;

describe("idempotent import", () => {
  beforeAll(async () => { await resetEmulators(); });

  it("first run writes everything; second run writes nothing and duplicates nothing", async () => {
    const first = await seedWorkbook(db, wb);
    expect(first.written).toBe(first.planned);
    expect(first.conflicts).toEqual([]);
    const second = await seedWorkbook(db, wb);
    expect(second.written).toBe(0);
    expect(second.skippedUnchanged).toBe(second.planned);
    expect(second.conflicts).toEqual([]);
    expect(await count("suppliers")).toBe(100);
    expect(await count("monthly_reports")).toBe(277);
    expect(await count("verification_records")).toBe(12);
    expect(await count("emission_factors")).toBe(7);
    expect(await count("companies")).toBe(2);
  });

  it("preserves the 100 supplier IDs and their workbook attributes", async () => {
    const snap = await db.collection("suppliers").get();
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toEqual(wb.suppliers.map((s) => s.supplierId).sort());
    expect(ids[0]).toBe("SUP-001");
    expect(ids[99]).toBe("SUP-100");
    const s4 = snap.docs.find((d) => d.id === "SUP-004")!.data();
    expect(s4).toMatchObject({ businessName: "Pemasok 04", sector: "Bumbu & olahan", region: "Jakarta", dataSource: "demo", isSimulated: true, ownerUid: null });
    const rel = (await db.doc("company_supplier_relationships/CMP-A_SUP-004").get()).data()!;
    expect(rel.isCritical).toBe(true); // "Pemasok Kritis = Ya"
  });

  it("preserves all 277 source reports with original values; none is marked verified", async () => {
    const snap = await db.collection("monthly_reports").get();
    expect(snap.docs.map((d) => d.id).sort()).toEqual(wb.submissions.map((s) => `${s.supplierId}_${s.period}`).sort());
    const periods = snap.docs.reduce<Record<string, number>>((m, d) => ({ ...m, [d.data().period]: (m[d.data().period] ?? 0) + 1 }), {});
    expect(periods).toEqual({ "2027-01": 90, "2027-02": 94, "2027-03": 93 });
    expect(new Set(snap.docs.map((d) => d.data().status))).toEqual(new Set(["imported_simulated"]));
    expect(snap.docs.every((d) => d.data().dataSource === "demo" && d.data().isSimulated === true)).toBe(true);
    const r = snap.docs.find((d) => d.id === "SUP-001_2027-01")!.data();
    expect(r.activity).toMatchObject({ electricityKwh: 214, fuelQuantity: null, packagingKg: 28.9, wasteKg: 22.2, transportMode: "Motor", transportKm: 250, efficiencyPractice: "Belum" });
    expect(r.workbook).toMatchObject({ evidenceStatus: "Belum ada bukti", billKwh: null });
    const evidenceCounts = snap.docs.reduce<Record<string, number>>((m, d) => ({ ...m, [d.data().workbook.evidenceStatus]: (m[d.data().workbook.evidenceStatus] ?? 0) + 1 }), {});
    expect(evidenceCounts).toEqual({ Cocok: 210, "Belum ada bukti": 56, "Tidak cocok": 11 });
  });

  it("stores audits as simulated sample-audit events that change no status", async () => {
    const snap = await db.collection("verification_records").get();
    expect(snap.docs.every((d) => d.data().action === "sample_audit" && d.data().simulatedEvent === true && d.data().toStatus === null)).toBe(true);
    const a = (await db.doc("verification_records/wb-audit-SUP-005_2027-03").get()).data()!;
    expect(a.audit).toEqual({ reportedKwh: 366, auditedKwh: 282, diff: 0.2978723404255319, result: "Tidak cocok" });
  });

  it("keeps the original workbook scores and matches the Rekap tab", async () => {
    const scores = (await db.collection("supplier_scores").get()).docs.map((d) => d.data());
    const emis = (await db.collection("emission_results").get()).docs.map((d) => d.data());
    expect(scores.every((s) => s.scoreType === "simulated" && s.calcSource === "workbook_simulated")).toBe(true);
    for (const rk of wb.rekap) {
      const ms = scores.filter((s) => s.period === rk.period);
      expect(ms.length).toBe(rk.submitted);
      expect(ms.filter((s) => s.color === "HIJAU").length).toBe(rk.hijau);
      expect(ms.filter((s) => s.color === "KUNING").length).toBe(rk.kuning);
      expect(ms.filter((s) => s.color === "MERAH").length).toBe(rk.merah);
      expect(ms.reduce((t, s) => t + s.final, 0) / ms.length).toBeCloseTo(rk.avgScore, 9);
      expect(emis.filter((e) => e.period === rk.period).reduce((t, e) => t + e.totalKgCO2e, 0)).toBeCloseTo(rk.totalEmission, 6);
    }
    const e1 = emis.find((e) => e.reportId === "SUP-001_2027-01")!;
    expect(e1.workbookBlankAsZero).toEqual(["bbm"]); // the workbook's blank-as-zero is recorded, not hidden
  });

  it("stores group averages as simulated benchmarks that are not usable for live scoring", async () => {
    const b = (await db.collection("benchmarks").get()).docs.map((d) => d.data());
    expect(b).toHaveLength(5);
    expect(b.every((x) => x.status === "simulated_sample_average" && x.usableForLiveScoring === false)).toBe(true);
  });
});

describe("live data after the import", () => {
  beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, wb); });

  it("a genuinely new supplier becomes SUP-101; logging in again creates nothing", async () => {
    const u = await auth.createUser({ email: "baru@umkm.test", password: "rahasia123" });
    const caller = { uid: u.uid, email: "baru@umkm.test", claims: {} as Record<string, unknown> };
    const profile = { picName: "Siti", businessName: "Pemasok 01", whatsapp: "081234567890", privacyConsent: true as const }; // same name as a seeded supplier
    expect((await registerSupplier(db, auth, caller, profile)).supplierId).toBe("SUP-101");
    expect((await registerSupplier(db, auth, caller, profile)).created).toBe(false);
    expect(await count("suppliers")).toBe(101);
    expect((await db.doc("suppliers/SUP-101").get()).data()!.dataSource).toBe("trial");
  });

  it("re-seeding keeps a claimed supplier's owner and edits, and a revoked consent", async () => {
    const { code } = await createInvite(db, companyCaller("CMP-A"), "SUP-010");
    const u = await auth.createUser({ email: "pemilik10@umkm.test", password: "rahasia123" });
    await claimSupplier(db, auth, { uid: u.uid, email: null, claims: {} }, { inviteCode: code, picName: "Budi", whatsapp: "081298765432", privacyConsent: true });
    await db.doc("suppliers/SUP-010").update({ businessName: "Toko Kue Budi" });
    await setConsent(db, supplierCaller(u.uid, "SUP-010"), { companyId: "CMP-A", granted: false });
    const res = await seedWorkbook(db, wb);
    const s = (await db.doc("suppliers/SUP-010").get()).data()!;
    expect(s).toMatchObject({ ownerUid: u.uid, businessName: "Toko Kue Budi", picName: "Budi", claimStatus: "claimed" });
    expect((await db.doc("supplier_data_sharing_consents/CMP-A_SUP-010").get()).data()!.granted).toBe(false);
    expect(res.conflicts.some((c) => c.includes("CMP-A_SUP-010"))).toBe(true);
    // Revocation stays effective: seeded report-family docs follow current consent, not the workbook.
    expect((await db.doc("monthly_reports/SUP-010_2027-01").get()).data()!.sharedWith).toEqual([]);
    expect(await count("suppliers")).toBe(101);
  });

  it("never overwrites a trial report that occupies a seeded report ID", async () => {
    await resetEmulators();
    await db.doc("monthly_reports/SUP-001_2027-01").set({ reportId: "SUP-001_2027-01", supplierId: "SUP-001", period: "2027-01", status: "draft", dataSource: "trial", isSimulated: false, createdAt: FieldValue.serverTimestamp() });
    const res = await seedWorkbook(db, wb);
    expect(res.conflicts).toContain("monthly_reports/SUP-001_2027-01: existing trial document kept");
    expect((await db.doc("monthly_reports/SUP-001_2027-01").get()).data()!.dataSource).toBe("trial");
    expect(await count("monthly_reports")).toBe(277);
  });
});
