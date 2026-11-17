// Live submission → calculation → review workflow on top of the seeded workbook.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { referenceDate } from "@/lib/period";
import { requestCorrection, submitReport } from "@/server/reports";
import { seedWorkbook } from "@/server/seed";
import { connectWithInvite } from "@/server/sharing";
import { createInvite, registerSupplier } from "@/server/suppliers";
import { reviewReport } from "@/server/verification";
import { readWorkbook } from "@/server/workbook";
import { auth, companyCaller, db, resetEmulators, supplierCaller, writeDraft } from "./helpers";

const wb = readWorkbook();
const REF = referenceDate("2027-04-05");
const reviewerA = { uid: "revA", email: null, claims: { role: "company_admin", companyId: "CMP-A", canVerify: true } };
const viewerA = { uid: "viewA", email: null, claims: { role: "company_admin", companyId: "CMP-A" } };
const reviewerB = { uid: "revB", email: null, claims: { role: "company_admin", companyId: "CMP-B", canVerify: true } };
const platform = { uid: "plat", email: null, claims: { role: "platform_admin" } };

const profile = { businessName: "Roti Rina", sector: "Roti & kue", mainProduct: "Roti tawar", productionVolume: 2000, productionUnit: "pcs", employees: 3 };
const activity = { electricityKwh: 400, packagingKg: 20, wasteKg: 10, rawMaterialOrigin: "Lokal", transportMode: "Motor", transportKm: 300,
  efficiencyPractice: "Sebagian", notApplicable: ["bbm"] };

let supplier: ReturnType<typeof supplierCaller>;
let sid: string;

async function newConnectedSupplier(email: string) {
  const u = await auth.createUser({ email, password: "rahasia123" });
  const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email, claims: {} }, { picName: "Rina", businessName: "Roti Rina", whatsapp: "081377788899", privacyConsent: true });
  const s = supplierCaller(u.uid, supplierId);
  const { code } = await createInvite(db, companyCaller("CMP-A"), null);
  await connectWithInvite(db, s, { inviteCode: code, shareData: true });
  return { s, supplierId };
}

beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, wb); });
beforeEach(async () => {
  const n = Math.random().toString(36).slice(2, 8);
  ({ s: supplier, supplierId: sid } = await newConnectedSupplier(`rina-${n}@umkm.test`));
});

const rid = () => `${sid}_2027-03`;
async function submitted(over: { activity?: object } = {}) {
  await writeDraft(sid, "2027-03", { profile, activity: { ...activity, ...over.activity } });
  await submitReport(db, supplier, "2027-03", REF);
  return rid();
}

describe("live submission enters the same structure with dataSource trial", () => {
  it("calculates emissions with simulated factors and a provisional, incomplete score", async () => {
    await submitted({ activity: { wasteKg: null } });
    const r = (await db.doc(`monthly_reports/${rid()}`).get()).data()!;
    expect(r).toMatchObject({ status: "submitted", dataSource: "trial", isSimulated: false, sharedWith: ["CMP-A"] });
    const e = (await db.doc(`emission_results/${rid()}`).get()).data()!;
    expect(e).toMatchObject({ calcSource: "engine_v1", totalStatus: "partial", usesSimulatedFactors: true, intensity: null, dataSource: "trial" });
    const byCat = Object.fromEntries(e.lines.map((l: { category: string; status: string; kgCO2e: number | null }) => [l.category, [l.status, l.kgCO2e]]));
    expect(byCat).toEqual({ listrik: ["calculated", 340], bbm: ["not_used", 0], kemasan: ["calculated", 50], limbah: ["missing_activity", null], transportasi: ["calculated", 30] });
    expect(e.totalKgCO2e).toBe(420);
    const acts = await db.collection("activity_records").where("reportId", "==", rid()).get();
    const st = Object.fromEntries(acts.docs.map((d) => [d.data().category, [d.data().status, d.data().quantity]]));
    expect(st.bbm).toEqual(["declared_not_used", 0]);
    expect(st.limbah).toEqual(["missing", null]);
    const sc = (await db.doc(`supplier_scores/${rid()}`).get()).data()!;
    expect(sc).toMatchObject({ scoreType: "provisional", final: null, color: null, availableWeight: 0.3 });
    expect(sc.components.map((c: { key: string; status: string }) => c.status)).toEqual(["available", "unavailable", "unavailable"]);
    expect(sc.components[1].detail).toContain("Bukti Belum Dapat Diverifikasi");
    expect(sc.components[2].detail).toContain("Pembanding industri belum tersedia");
    const recs = (await db.doc(`recommendations/${rid()}`).get()).data()!;
    expect(recs.items.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(["complete_data", "provide_bill"]));
    expect(await (await db.collection("suppliers").count().get()).data().count).toBeGreaterThan(100);
  });
});

describe("role-based verification permissions", () => {
  it("only reviewers of a company the report is shared with (or platform admins) can decide", async () => {
    await submitted();
    const approve = { reportId: rid(), action: "approve" as const };
    await expect(reviewReport(db, supplier, approve)).rejects.toMatchObject({ code: "forbidden" });
    await expect(reviewReport(db, viewerA, approve)).rejects.toMatchObject({ code: "forbidden" }); // no canVerify
    await expect(reviewReport(db, reviewerB, approve)).rejects.toMatchObject({ code: "forbidden" }); // not shared with B
    expect((await db.doc(`monthly_reports/${rid()}`).get()).data()!.status).toBe("submitted");
    await expect(reviewReport(db, platform, approve)).resolves.toMatchObject({ status: "verified" });
  });

  it("simulated workbook reports cannot enter the verification workflow", async () => {
    await expect(reviewReport(db, reviewerA, { reportId: "SUP-001_2027-01", action: "approve" })).rejects.toMatchObject({ code: "simulated_record" });
    expect((await db.doc("monthly_reports/SUP-001_2027-01").get()).data()!.status).toBe("imported_simulated");
  });

  it("requires reasons for reject/revision and a source for any checked value", async () => {
    await submitted();
    await expect(reviewReport(db, reviewerA, { reportId: rid(), action: "reject", note: "" })).rejects.toThrow(/Alasan/);
    await expect(reviewReport(db, reviewerA, { reportId: rid(), action: "approve", checkedKwh: 400 })).rejects.toThrow(/sumber/);
    await expect(reviewReport(db, reviewerA, { reportId: rid(), action: "approve", checkSource: "dokumen_asli" })).rejects.toThrow(/kWh/);
  });
});

describe("evidence checking", () => {
  it("approval without a checked value: evidence stays unverifiable and no in-app inspection is claimed", async () => {
    await submitted();
    const res = await reviewReport(db, reviewerA, { reportId: rid(), action: "approve", note: "Data wajar" });
    expect(res.evidence.status).toBe("unverifiable");
    const rec = (await db.collection("verification_records").where("reportId", "==", rid()).where("action", "==", "approve").get()).docs[0].data();
    expect(rec.evidenceCheck).toMatchObject({ checkedKwh: null, inAppDocumentInspected: false, tolerance: 0.1 });
    const sc = (await db.doc(`supplier_scores/${rid()}`).get()).data()!;
    expect(sc).toMatchObject({ scoreType: "verified", final: null }); // verified components, but no final score
    expect(sc.components[1].status).toBe("unavailable");
  });

  it("checked value within 10% → Cocok (100); beyond → Tidak cocok (0) and MERAH", async () => {
    await submitted();
    const res = await reviewReport(db, reviewerA, { reportId: rid(), action: "approve", checkedKwh: 370, checkSource: "dokumen_asli" }); // 400 vs 370 = 8.1%
    expect(res.evidence.status).toBe("match");
    expect((await db.doc(`supplier_scores/${rid()}`).get()).data()!.components[1]).toMatchObject({ status: "available", score: 100 });

    const other = await newConnectedSupplier(`lain-${Date.now()}@umkm.test`);
    await writeDraft(other.supplierId, "2027-03", { profile, activity });
    await submitReport(db, other.s, "2027-03", REF);
    const res2 = await reviewReport(db, reviewerA, { reportId: `${other.supplierId}_2027-03`, action: "request_revision", note: "kWh tidak sesuai tagihan", checkedKwh: 300, checkSource: "salinan_di_luar_sistem" });
    expect(res2).toMatchObject({ status: "revision_requested", color: "MERAH" });
    expect(res2.evidence.status).toBe("mismatch");
  });
});

describe("report and score version history", () => {
  it("revision → resubmission → approval keeps every report version, decision and score calculation", async () => {
    await submitted();
    await reviewReport(db, reviewerA, { reportId: rid(), action: "request_revision", note: "Angka listrik beda dengan tagihan", checkedKwh: 300, checkSource: "dokumen_asli" });
    await expect(reviewReport(db, reviewerA, { reportId: rid(), action: "approve" })).rejects.toMatchObject({ code: "not_reviewable" });
    await db.doc(`monthly_reports/${rid()}`).update({ "activity.electricityKwh": 310 });
    await submitReport(db, supplier, "2027-03", REF);
    await reviewReport(db, reviewerA, { reportId: rid(), action: "approve", checkedKwh: 300, checkSource: "dokumen_asli" });

    const versions = await db.collection(`monthly_reports/${rid()}/versions`).get();
    expect(versions.docs.map((d) => d.id).sort()).toEqual(["v1", "v2"]);
    expect((await db.doc(`monthly_reports/${rid()}/versions/v1`).get()).data()!.activity.electricityKwh).toBe(400);
    const hist = (await db.collection("verification_records").where("reportId", "==", rid()).orderBy("createdAt").get()).docs.map((d) => d.data().action);
    expect(hist).toEqual(["submitted", "request_revision", "resubmitted", "approve"]);
    const scoreVersions = (await db.collection(`supplier_scores/${rid()}/versions`).orderBy("createdAt").get()).docs.map((d) => d.data());
    expect(scoreVersions.map((v) => [v.trigger, v.reportVersion, v.scoreType])).toEqual([
      ["submission", 1, "provisional"], ["review:request_revision", 1, "provisional"], ["resubmission", 2, "provisional"], ["review:approve", 2, "verified"],
    ]);
    expect(scoreVersions[1].color).toBe("MERAH");
    expect(scoreVersions[3].components[1].score).toBe(100); // 310 vs 300 = 3.3%
    expect((await db.doc(`monthly_reports/${rid()}`).get()).data()!.status).toBe("verified");
  });

  it("supplier corrections before review also create a new score version", async () => {
    await submitted();
    await requestCorrection(db, supplier, { period: "2027-03", reason: "Lupa isi limbah" });
    await submitReport(db, supplier, "2027-03", REF);
    expect((await db.collection(`supplier_scores/${rid()}/versions`).get()).size).toBe(2);
  });
});

describe("isolation between simulated and trial records", () => {
  it("demo and trial records are distinguishable on every collection a dashboard reads", async () => {
    await submitted();
    for (const col of ["monthly_reports", "emission_results", "supplier_scores", "activity_records"]) {
      const trial = await db.collection(col).where("supplierId", "==", sid).get();
      expect(trial.size).toBeGreaterThan(0);
      expect(trial.docs.every((d) => d.data().dataSource === "trial" && d.data().isSimulated === false)).toBe(true);
      const demo = await db.collection(col).where("supplierId", "==", "SUP-001").get();
      expect(demo.docs.every((d) => d.data().dataSource === "demo" && d.data().isSimulated === true)).toBe(true);
    }
    const trialQueue = await db.collection("monthly_reports").where("sharedWith", "array-contains", "CMP-A").where("status", "==", "submitted").get();
    expect(trialQueue.docs.every((d) => d.data().dataSource === "trial")).toBe(true); // seeded rows never sit in the review queue
  });
});
