// Customer Success + lifecycle server logic against the emulator.
import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { referenceDate } from "@/lib/period";
import { addFollowUp, assertSubscriptionAccess, assignCs, ensureLifecycleOnConnect, setCompanySubscription, setSupplierStage } from "@/server/lifecycle";
import { submitReport } from "@/server/reports";
import { connectWithInvite } from "@/server/sharing";
import { createInvite, registerSupplier } from "@/server/suppliers";
import { auth, companyCaller, db, resetEmulators, supplierCaller, writeDraft } from "./helpers";

const admin = { uid: "pa", email: null, claims: { role: "platform_admin" } };
const cs = (csId: string) => ({ uid: `u-${csId}`, email: null, claims: { role: "customer_success", csId } });
const REF = referenceDate("2027-12-15"); // before the 2028 trial window
const confirmation = { reference: "INV-2028-001 / PO dikonfirmasi", contractStart: "2028-04-01", contractEnd: "2029-03-31" };
const sid = (n: number) => `SUP-${String(n).padStart(3, "0")}`;

async function setup() {
  await resetEmulators();
  const now = FieldValue.serverTimestamp();
  await db.doc("companies/CMP-N").set({ companyId: "CMP-N", name: "Perusahaan Baru", dataSource: "trial", isSimulated: false, createdAt: now });
  await db.doc("cs_staff/CS01").set({ csId: "CS01", name: "CS Satu", active: true, scenario: false });
  await db.doc("cs_staff/CS02").set({ csId: "CS02", name: "CS Dua", active: true, scenario: false });
  await db.doc("cs_staff/CS99").set({ csId: "CS99", name: "CS Skenario", active: true, scenario: true });
}
const stage = async (cid: string, s: string) => (await db.doc(`supplier_lifecycle/${cid}_${s}`).get()).data()!;

describe("lifecycle records", () => {
  beforeEach(setup);

  it("connecting creates one onboarding record and never overwrites it", async () => {
    const u = await auth.createUser({ email: "lc@umkm.test", password: "rahasia123" });
    const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email: "lc@umkm.test", claims: {} }, { picName: "Lia", businessName: "Kopi Lia", whatsapp: "081377788800", privacyConsent: true });
    const { code } = await createInvite(db, companyCaller("CMP-N"), null);
    await connectWithInvite(db, supplierCaller(u.uid, supplierId), { inviteCode: code, shareData: true });
    expect(await stage("CMP-N", supplierId)).toMatchObject({ stage: "onboarding", basis: "actual", supplierName: "Kopi Lia", csId: null });
    await db.doc(`supplier_lifecycle/CMP-N_${supplierId}`).update({ stage: "trial" });
    await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", supplierId, "Kopi Lia");
    expect((await stage("CMP-N", supplierId)).stage).toBe("trial");
  });

  it("one primary CS per supplier, capacity 70, scenario CS refused, reassignment updates records", async () => {
    await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", "SUP-101", "Kopi Lia");
    await assignCs(db, admin, { supplierId: "SUP-101", csId: "CS01" });
    expect((await stage("CMP-N", "SUP-101")).csId).toBe("CS01");
    await assignCs(db, admin, { supplierId: "SUP-101", csId: "CS02" }); // reassign, not duplicate
    expect((await db.collection("cs_assignments").where("supplierId", "==", "SUP-101").get()).size).toBe(1);
    expect((await stage("CMP-N", "SUP-101")).csId).toBe("CS02");
    await expect(assignCs(db, admin, { supplierId: "SUP-101", csId: "CS99" })).rejects.toMatchObject({ code: "cs_scenario" });
    await expect(assignCs(db, cs("CS01"), { supplierId: "SUP-101", csId: "CS01" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(assignCs(db, companyCaller("CMP-N"), { supplierId: "SUP-101", csId: "CS01" })).rejects.toMatchObject({ code: "forbidden" });

    const batch = db.batch();
    for (let i = 200; i < 270; i++) batch.set(db.doc(`cs_assignments/${sid(i)}`), { supplierId: sid(i), csId: "CS01" });
    await batch.commit(); // CS01 now holds 70
    await expect(assignCs(db, admin, { supplierId: "SUP-300", csId: "CS01" })).rejects.toMatchObject({ code: "cs_full" });
    await assignCs(db, admin, { supplierId: sid(200), csId: "CS01" }); // same CS again is not a new slot
  });

  it("trial quota: max 10 unique suppliers per new company for the whole Jan–Mar window", async () => {
    await expect(setCompanySubscription(db, admin, { companyId: "CMP-N", status: "trial" })).rejects.toMatchObject({ code: "trial_year_required" });
    await setCompanySubscription(db, admin, { companyId: "CMP-N", status: "trial", trialYear: 2028, isNewCompany: true });
    for (let i = 101; i <= 111; i++) await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", sid(i), `UMKM ${i}`);
    for (let i = 101; i <= 110; i++) await setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: sid(i), to: "trial", trialYear: 2028 }, REF);
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: sid(111), to: "trial", trialYear: 2028 }, REF)).rejects.toMatchObject({ code: "trial_quota" });
    // A trial supplier that moves on still counts as one of the 10 (unique per trial period, not per month).
    await setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: sid(101), to: "awaiting_activation" }, REF);
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: sid(111), to: "trial", trialYear: 2028 }, REF)).rejects.toMatchObject({ code: "trial_quota" });
    expect(await stage("CMP-N", sid(102))).toMatchObject({ trialYear: 2028, trialStart: "2028-01-01", trialEnd: "2028-03-31" });
    // Window closed → no new trial.
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: sid(111), to: "trial", trialYear: 2028 }, referenceDate("2028-04-02"))).rejects.toMatchObject({ code: "trial_window_closed" });
  });

  it("company without a trial plan cannot start supplier trials", async () => {
    await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", "SUP-101", "x");
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: "SUP-101", to: "trial", trialYear: 2028 }, REF)).rejects.toMatchObject({ code: "trial_not_allowed" });
  });

  it("paid states need a confirmation from Platform Admin; history is kept", async () => {
    await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", "SUP-101", "x");
    await assignCs(db, admin, { supplierId: "SUP-101", csId: "CS01" });
    await setSupplierStage(db, cs("CS01"), { companyId: "CMP-N", supplierId: "SUP-101", to: "awaiting_activation", note: "siap aktivasi" }, REF);
    await expect(setSupplierStage(db, cs("CS01"), { companyId: "CMP-N", supplierId: "SUP-101", to: "active_subscription", confirmation }, REF)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: "SUP-101", to: "active_subscription" }, REF)).rejects.toMatchObject({ code: "confirmation_required" });
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: "SUP-101", to: "active_subscription", confirmation: { ...confirmation, contractEnd: "2028-01-01" } }, REF)).rejects.toMatchObject({ code: "bad_dates" });
    await setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: "SUP-101", to: "active_subscription", confirmation }, REF);
    expect(await stage("CMP-N", "SUP-101")).toMatchObject({ stage: "active_subscription", contractEnd: "2029-03-31", renewalDate: "2029-03-31", confirmation: { reference: confirmation.reference } });
    await expect(setSupplierStage(db, admin, { companyId: "CMP-N", supplierId: "SUP-101", to: "renewed", confirmation }, REF)).rejects.toMatchObject({ code: "bad_transition" });
    await setSupplierStage(db, cs("CS01"), { companyId: "CMP-N", supplierId: "SUP-101", to: "renewal_due" }, REF);
    const hist = await db.collection("supplier_lifecycle/CMP-N_SUP-101/history").orderBy("createdAt").get();
    expect(hist.docs.map((d) => d.data().to)).toEqual(["awaiting_activation", "active_subscription", "renewal_due"]);
  });

  it("CS can act only on its own portfolio; follow-ups are recorded", async () => {
    await ensureLifecycleOnConnect(db, "CMP-N", "Perusahaan Baru", "SUP-101", "x");
    await assignCs(db, admin, { supplierId: "SUP-101", csId: "CS01" });
    await expect(addFollowUp(db, cs("CS02"), { companyId: "CMP-N", supplierId: "SUP-101", note: "bukan milik saya" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setSupplierStage(db, cs("CS02"), { companyId: "CMP-N", supplierId: "SUP-101", to: "awaiting_activation" }, REF)).rejects.toMatchObject({ code: "forbidden" });
    await addFollowUp(db, cs("CS01"), { companyId: "CMP-N", supplierId: "SUP-101", note: "Telepon soal laporan Maret", dueDate: "2028-01-10", needsAssistance: true });
    const f = await db.collection("cs_followups").where("csId", "==", "CS01").get();
    expect(f.size).toBe(1);
    expect(await stage("CMP-N", "SUP-101")).toMatchObject({ needsAssistance: true, nextFollowUpAt: "2028-01-10" });
  });

  it("expired subscription blocks submission; reports and history stay intact", async () => {
    const u = await auth.createUser({ email: "exp@umkm.test", password: "rahasia123" });
    const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email: "exp@umkm.test", claims: {} }, { picName: "Eko", businessName: "Tahu Eko", whatsapp: "081377788801", privacyConsent: true });
    const s = supplierCaller(u.uid, supplierId);
    await assertSubscriptionAccess(db, supplierId); // no lifecycle → not blocked (legacy/pilot)
    const { code } = await createInvite(db, companyCaller("CMP-N"), null);
    await connectWithInvite(db, s, { inviteCode: code, shareData: true });
    const profile = { businessName: "Tahu Eko", sector: "Bumbu & olahan", mainProduct: "Tahu", productionVolume: 100, productionUnit: "kg", employees: 2 };
    await writeDraft(supplierId, "2027-11", { profile, activity: { electricityKwh: 100 } });
    await submitReport(db, s, "2027-11", REF);
    expect((await stage("CMP-N", supplierId)).lastReportPeriod).toBe("2027-11");
    await setSupplierStage(db, admin, { companyId: "CMP-N", supplierId, to: "expired", note: "tidak diperpanjang" }, REF);
    await writeDraft(supplierId, "2027-12", { profile, activity: { electricityKwh: 100 } });
    await expect(submitReport(db, s, "2027-12", referenceDate("2028-01-05"))).rejects.toMatchObject({ code: "subscription_inactive" });
    expect((await db.doc(`monthly_reports/${supplierId}_2027-11`).get()).data()!.status).toBe("submitted");
  });
});
