// Phase 2 server workflow tests: submission, history, correction, consent, connect.
import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { referenceDate } from "@/lib/period";
import { requestCorrection, submitReport } from "@/server/reports";
import { connectWithInvite, setConsent } from "@/server/sharing";
import { createInvite, registerSupplier } from "@/server/suppliers";
import { auth, companyCaller, db, resetEmulators, supplierCaller, writeDraft } from "./helpers";

const REF = referenceDate("2027-04-05");
const S1 = supplierCaller("u1", "SUP-001");
const fullProfile = { businessName: "Pemasok 01", sector: "Roti & kue", mainProduct: "Roti tawar", productionVolume: 2870, productionUnit: "unit", employees: 2 };

beforeEach(async () => {
  await resetEmulators();
  const b = db.batch();
  const base = { dataSource: "demo", isSimulated: true };
  b.set(db.doc("companies/CMP-A"), { ...base, companyId: "CMP-A", name: "Perusahaan Mitra A" });
  b.set(db.doc("companies/CMP-B"), { ...base, companyId: "CMP-B", name: "Perusahaan Mitra B" });
  b.set(db.doc("suppliers/SUP-001"), { ...base, supplierId: "SUP-001", businessName: "Pemasok 01", ownerUid: "u1", linkedCompanies: ["CMP-A"] });
  b.set(db.doc("company_supplier_relationships/CMP-A_SUP-001"), { ...base, companyId: "CMP-A", companyName: "Perusahaan Mitra A", supplierId: "SUP-001", status: "active" });
  b.set(db.doc("supplier_data_sharing_consents/CMP-A_SUP-001"), { ...base, companyId: "CMP-A", supplierId: "SUP-001", granted: true });
  b.set(db.doc("meta/counters"), { nextSupplierNumber: 101 });
  await b.commit();
});

const count = async (col: string) => (await db.collection(col).count().get()).data().count;

describe("submitReport", () => {
  it("moves a draft to Menunggu Verifikasi, shares only with consented companies, keeps nulls", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile, activity: { electricityKwh: 214, notApplicable: ["bbm"] } });
    const res = await submitReport(db, S1, "2027-03", REF);
    expect(res).toMatchObject({ reportId: rid, version: 1, status: "submitted", sharedWith: ["CMP-A"] });
    const r = (await db.doc(`monthly_reports/${rid}`).get()).data()!;
    expect(r.status).toBe("submitted");
    expect(r.submittedAt).toBeTruthy();
    expect(r.activity.packagingKg).toBeNull(); // missing stays missing
    expect(r.activity.fuelQuantity).toBeNull(); // not applicable is not converted to 0 either
    expect(r.missingFields).toContain("packagingKg");
    expect(r.missingFields).not.toContain("fuelQuantity");
    const v1 = (await db.doc(`monthly_reports/${rid}/versions/v1`).get()).data()!;
    expect(v1.activity.electricityKwh).toBe(214);
    const hist = await db.collection("verification_records").where("reportId", "==", rid).get();
    expect(hist.docs.map((d) => d.data().action)).toEqual(["submitted"]);
    expect(await count("notifications")).toBe(1);
  });

  it("rejects a second submission of the same month (no duplicate, no overwrite)", async () => {
    await writeDraft("SUP-001", "2027-03", { profile: fullProfile });
    await submitReport(db, S1, "2027-03", REF);
    await expect(submitReport(db, S1, "2027-03", REF)).rejects.toMatchObject({ code: "not_editable" });
    expect(await count("monthly_reports")).toBe(1);
    expect((await db.collection("monthly_reports/SUP-001_2027-03/versions").get()).size).toBe(1);
  });

  it("blocks missing business name/sector, future periods, and other suppliers' drafts", async () => {
    await writeDraft("SUP-001", "2027-03");
    await expect(submitReport(db, S1, "2027-03", REF)).rejects.toMatchObject({ code: "incomplete" });
    await writeDraft("SUP-001", "2027-04", { profile: fullProfile });
    await expect(submitReport(db, S1, "2027-04", REF)).rejects.toMatchObject({ code: "period_not_allowed" });
    await writeDraft("SUP-002", "2027-03", { profile: fullProfile });
    await expect(submitReport(db, supplierCaller("u1", "SUP-002x"), "2027-03", REF)).rejects.toMatchObject({ code: "not_found" });
    await expect(submitReport(db, companyCaller("CMP-A"), "2027-03", REF)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects malformed stored data (e.g. LPG measured in liters)", async () => {
    await writeDraft("SUP-001", "2027-03", { profile: fullProfile, activity: { fuelType: "LPG", fuelUnit: "liter", fuelQuantity: 12 } });
    await expect(submitReport(db, S1, "2027-03", REF)).rejects.toThrow(/LPG/);
  });

  it("shares draft evidence metadata on submission, not before", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile });
    const ev = await db.collection("evidence_metadata").add({
      supplierId: "SUP-001", reportId: rid, kind: "tagihan_listrik", fileName: "tagihan.jpg", mimeType: "image/jpeg",
      sizeBytes: 1000, storageMode: "demo_preview", sharedWith: [], dataSource: "trial", isSimulated: false, createdAt: FieldValue.serverTimestamp(),
    });
    await setConsent(db, S1, { companyId: "CMP-A", granted: true }); // re-propagation must skip drafts
    expect((await ev.get()).data()!.sharedWith).toEqual([]);
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual([]);
    const res = await submitReport(db, S1, "2027-03", REF);
    expect((await ev.get()).data()!.sharedWith).toEqual(["CMP-A"]);
    expect((await db.doc(`monthly_reports/${rid}/versions/v1`).get()).data()!.evidenceIds).toEqual([ev.id]);
    expect(res.status).toBe("submitted");
  });
});

describe("correction requests and history", () => {
  it("supplier reopens before verification, resubmits as v2; v1 snapshot is untouched", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile, activity: { electricityKwh: 214 } });
    await submitReport(db, S1, "2027-03", REF);
    await expect(requestCorrection(db, S1, { period: "2027-03", reason: "ok" })).rejects.toThrow();
    await requestCorrection(db, S1, { period: "2027-03", reason: "Angka listrik salah ketik" });
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.status).toBe("revision_requested");
    await db.doc(`monthly_reports/${rid}`).update({ "activity.electricityKwh": 241 });
    const res = await submitReport(db, S1, "2027-03", REF);
    expect(res.version).toBe(2);
    expect((await db.doc(`monthly_reports/${rid}/versions/v1`).get()).data()!.activity.electricityKwh).toBe(214);
    expect((await db.doc(`monthly_reports/${rid}/versions/v2`).get()).data()!.activity.electricityKwh).toBe(241);
    const hist = await db.collection("verification_records").where("reportId", "==", rid).orderBy("createdAt").get();
    expect(hist.docs.map((d) => d.data().action)).toEqual(["submitted", "supplier_correction_request", "resubmitted"]);
  });

  it("cannot reopen a verified report", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile });
    await submitReport(db, S1, "2027-03", REF);
    await db.doc(`monthly_reports/${rid}`).update({ status: "verified" });
    await expect(requestCorrection(db, S1, { period: "2027-03", reason: "Mau ubah angka" })).rejects.toMatchObject({ code: "not_correctable" });
  });
});

describe("consent and company connection", () => {
  it("revoking consent removes the company from every shared doc; granting restores it", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile });
    await submitReport(db, S1, "2027-03", REF);
    const r1 = await setConsent(db, S1, { companyId: "CMP-A", granted: false });
    expect(r1.docsUpdated).toBeGreaterThanOrEqual(3); // report, version, history record
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual([]);
    expect((await db.doc(`monthly_reports/${rid}/versions/v1`).get()).data()!.sharedWith).toEqual([]);
    const hist = await db.collection("verification_records").where("reportId", "==", rid).get();
    expect(hist.docs.every((d) => d.data().sharedWith.length === 0)).toBe(true);
    await setConsent(db, S1, { companyId: "CMP-A", granted: true });
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual(["CMP-A"]);
  });

  it("cannot grant consent to a company without a relationship", async () => {
    await expect(setConsent(db, S1, { companyId: "CMP-B", granted: true })).rejects.toMatchObject({ code: "not_related" });
  });

  it("new self-registered supplier connects with a company code and shares submitted reports", async () => {
    const u = await auth.createUser({ email: "baru@umkm.test", password: "rahasia123" });
    const caller = { uid: u.uid, email: "baru@umkm.test", claims: {} as Record<string, unknown> };
    const { supplierId } = await registerSupplier(db, auth, caller, { picName: "Siti", businessName: "Kue Siti", whatsapp: "081234567890", privacyConsent: true });
    const s = supplierCaller(u.uid, supplierId);
    const rid = await writeDraft(supplierId, "2027-03", { profile: fullProfile });
    await submitReport(db, s, "2027-03", REF);
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual([]); // nobody yet

    const { code, type } = await createInvite(db, companyCaller("CMP-B"), null);
    expect(type).toBe("connect");
    const res = await connectWithInvite(db, s, { inviteCode: code, shareData: true });
    expect(res).toMatchObject({ companyId: "CMP-B", companyName: "Perusahaan Mitra B", shared: true });
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual(["CMP-B"]);
    expect((await db.doc(`suppliers/${supplierId}`).get()).data()!.linkedCompanies).toEqual(["CMP-B"]);
    await expect(connectWithInvite(db, s, { inviteCode: code, shareData: true })).rejects.toMatchObject({ code: "invite_used" });
  });

  it("connecting without sharing creates the link but shares nothing", async () => {
    const rid = await writeDraft("SUP-001", "2027-03", { profile: fullProfile });
    await submitReport(db, S1, "2027-03", REF);
    const { code } = await createInvite(db, companyCaller("CMP-B"), null);
    await connectWithInvite(db, S1, { inviteCode: code, shareData: false });
    expect((await db.doc(`monthly_reports/${rid}`).get()).data()!.sharedWith).toEqual(["CMP-A"]);
    expect((await db.doc("supplier_data_sharing_consents/CMP-B_SUP-001").get()).data()!.granted).toBe(false);
  });

  it("a claim code cannot be used to connect, and connecting twice is refused", async () => {
    await db.doc("suppliers/SUP-002").set({ supplierId: "SUP-002", ownerUid: null, linkedCompanies: ["CMP-A"], dataSource: "demo" });
    await db.doc("company_supplier_relationships/CMP-A_SUP-002").set({ companyId: "CMP-A", supplierId: "SUP-002" });
    const { code: claimCode } = await createInvite(db, companyCaller("CMP-A"), "SUP-002");
    await expect(connectWithInvite(db, S1, { inviteCode: claimCode, shareData: true })).rejects.toMatchObject({ code: "invite_wrong_type" });
    const { code: connectCode } = await createInvite(db, companyCaller("CMP-A"), null);
    await expect(connectWithInvite(db, S1, { inviteCode: connectCode, shareData: true })).rejects.toMatchObject({ code: "already_connected" });
  });
});
