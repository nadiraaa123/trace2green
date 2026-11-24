// Security rules tests (Test E: data isolation) — run via `npm test` (emulator).
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT = "demo-trace2green";
let env: RulesTestEnvironment;

const emptyActivity = {
  electricityKwh: null, fuelQuantity: null, fuelUnit: null, fuelType: null, packagingKg: null, packagingMaterial: null,
  wasteKg: null, wasteHandling: null, rawMaterialOrigin: null, transportMode: null, transportKm: null,
  efficiencyPractice: null, notApplicable: [],
};
const emptyProfile = {
  businessName: null, sector: null, mainProduct: null, productionVolume: null, productionUnit: null, employees: null,
};
function draft(supplierId: string, period: string, extra: Record<string, unknown> = {}) {
  return {
    reportId: `${supplierId}_${period}`, supplierId, period, status: "draft",
    profile: emptyProfile, activity: emptyActivity, draftStep: 1, version: 0, sharedWith: [],
    submittedAt: null, dataSource: "trial", isSimulated: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}

const companyA = () => env.authenticatedContext("uA", { role: "company_admin", companyId: "CMP-A" }).firestore();
const companyB = () => env.authenticatedContext("uB", { role: "company_admin", companyId: "CMP-B" }).firestore();
const sup1 = () => env.authenticatedContext("s1", { role: "supplier", supplierId: "SUP-001" }).firestore();
const sup51 = () => env.authenticatedContext("s51", { role: "supplier", supplierId: "SUP-051" }).firestore();
const stranger = () => env.authenticatedContext("rnd").firestore(); // signed in, no claims
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { dataSource: "demo", isSimulated: true };
    await setDoc(doc(db, "suppliers/SUP-001"), { ...base, supplierId: "SUP-001", businessName: "Pemasok 01", whatsapp: null, ownerUid: "s1", linkedCompanies: ["CMP-A"] });
    await setDoc(doc(db, "suppliers/SUP-002"), { ...base, supplierId: "SUP-002", businessName: "Pemasok 02", ownerUid: null, linkedCompanies: ["CMP-A"] });
    await setDoc(doc(db, "suppliers/SUP-051"), { ...base, supplierId: "SUP-051", businessName: "Pemasok 51", ownerUid: "s51", linkedCompanies: ["CMP-B"] });
    await setDoc(doc(db, "monthly_reports/SUP-001_2027-01"), { ...draft("SUP-001", "2027-01"), ...base, status: "verified", sharedWith: ["CMP-A"] });
    await setDoc(doc(db, "monthly_reports/SUP-002_2027-01"), { ...draft("SUP-002", "2027-01"), ...base, status: "submitted", sharedWith: [] });
    await setDoc(doc(db, "monthly_reports/SUP-051_2027-01"), { ...draft("SUP-051", "2027-01"), ...base, status: "submitted", sharedWith: ["CMP-B"] });
    await setDoc(doc(db, "supplier_scores/SUP-001_2027-01"), { supplierId: "SUP-001", sharedWith: ["CMP-A"], final: 67 });
    await setDoc(doc(db, "company_supplier_relationships/CMP-A_SUP-001"), { companyId: "CMP-A", supplierId: "SUP-001" });
    await setDoc(doc(db, "supplier_invites/abc"), { supplierId: "SUP-002", companyId: "CMP-A" });
    await setDoc(doc(db, "users/uA"), { role: "company_admin", companyId: "CMP-A" });
    await setDoc(doc(db, "notifications/n1"), { recipientUid: "s1", read: false, title: "x" });
    await setDoc(doc(db, "emission_factors/listrik"), { category: "listrik", kgCO2ePerUnit: 0.85 });
  });
});

describe("company isolation", () => {
  it("company A reads its consented supplier report", async () => {
    await assertSucceeds(getDoc(doc(companyA(), "monthly_reports/SUP-001_2027-01")));
  });
  it("company A cannot read company B's supplier report", async () => {
    await assertFails(getDoc(doc(companyA(), "monthly_reports/SUP-051_2027-01")));
  });
  it("company A cannot read a related supplier's report without consent (sharedWith empty)", async () => {
    await assertFails(getDoc(doc(companyA(), "monthly_reports/SUP-002_2027-01")));
  });
  it("company queries must filter by sharedWith", async () => {
    const ok = await assertSucceeds(getDocs(query(collection(companyA(), "monthly_reports"), where("sharedWith", "array-contains", "CMP-A"))));
    expect(ok.docs.map((d) => d.id)).toEqual(["SUP-001_2027-01"]);
    await assertFails(getDocs(collection(companyA(), "monthly_reports")));
    await assertFails(getDocs(query(collection(companyA(), "monthly_reports"), where("sharedWith", "array-contains", "CMP-B"))));
  });
  it("company B cannot read company A's supplier profile or scores", async () => {
    await assertFails(getDoc(doc(companyB(), "suppliers/SUP-001")));
    await assertFails(getDoc(doc(companyB(), "supplier_scores/SUP-001_2027-01")));
    await assertSucceeds(getDoc(doc(companyA(), "supplier_scores/SUP-001_2027-01")));
  });
  it("companies cannot write reports, scores or verification directly", async () => {
    await assertFails(updateDoc(doc(companyA(), "monthly_reports/SUP-001_2027-01"), { status: "rejected" }));
    await assertFails(setDoc(doc(companyA(), "supplier_scores/SUP-001_2027-01"), { final: 100 }));
    await assertFails(setDoc(doc(companyA(), "verification_records/x"), { supplierId: "SUP-001", sharedWith: ["CMP-A"] }));
  });
  it("company reads only its own company doc and relationships", async () => {
    await assertFails(getDoc(doc(companyA(), "companies/CMP-B")));
    await assertSucceeds(getDocs(query(collection(companyA(), "company_supplier_relationships"), where("companyId", "==", "CMP-A"))));
    await assertFails(getDocs(query(collection(companyB(), "company_supplier_relationships"), where("companyId", "==", "CMP-A"))));
  });
});

describe("supplier isolation", () => {
  it("supplier reads own report but not another supplier's", async () => {
    await assertSucceeds(getDoc(doc(sup1(), "monthly_reports/SUP-001_2027-01")));
    await assertFails(getDoc(doc(sup1(), "monthly_reports/SUP-051_2027-01")));
    await assertFails(getDocs(query(collection(sup1(), "monthly_reports"), where("supplierId", "==", "SUP-051"))));
    await assertSucceeds(getDocs(query(collection(sup1(), "monthly_reports"), where("supplierId", "==", "SUP-001"))));
  });
  it("supplier can check for a not-yet-existing own draft (get returns empty)", async () => {
    const snap = await assertSucceeds(getDoc(doc(sup1(), "monthly_reports/SUP-001_2027-04")));
    expect(snap.exists()).toBe(false);
  });
  it("supplier creates a valid draft with missing values left null", async () => {
    await assertSucceeds(setDoc(doc(sup1(), "monthly_reports/SUP-001_2027-04"), draft("SUP-001", "2027-04")));
  });
  it("supplier cannot create drafts that bypass the workflow", async () => {
    const db = sup1();
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-051_2027-04"), draft("SUP-051", "2027-04")));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"), draft("SUP-001", "2027-04", { status: "verified" })));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"), draft("SUP-001", "2027-04", { sharedWith: ["CMP-A"] })));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-05"), draft("SUP-001", "2027-04")));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-13"), draft("SUP-001", "2027-13")));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"),
      draft("SUP-001", "2027-04", { activity: { ...emptyActivity, electricityKwh: -5 } })));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"),
      draft("SUP-001", "2027-04", { activity: { ...emptyActivity, electricityKwh: "200" } })));
  });
  it("supplier cannot overwrite an existing (verified) month — no duplicates, no silent edits", async () => {
    await assertFails(setDoc(doc(sup1(), "monthly_reports/SUP-001_2027-01"), draft("SUP-001", "2027-01")));
  });
  it("supplier edits draft content but cannot change its status", async () => {
    const db = sup1();
    const ref = doc(db, "monthly_reports/SUP-001_2027-04");
    await assertSucceeds(setDoc(ref, draft("SUP-001", "2027-04")));
    await assertSucceeds(updateDoc(ref, { activity: { ...emptyActivity, electricityKwh: 210 }, draftStep: 2, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: "submitted" }));
    await assertFails(updateDoc(ref, { sharedWith: ["CMP-A"] }));
    await assertSucceeds(deleteDoc(ref));
  });
  it("supplier cannot write computed or verification collections", async () => {
    await assertFails(setDoc(doc(sup1(), "supplier_scores/SUP-001_2027-02"), { supplierId: "SUP-001", final: 100 }));
    await assertFails(setDoc(doc(sup1(), "emission_results/SUP-001_2027-02"), { supplierId: "SUP-001" }));
    await assertFails(setDoc(doc(sup1(), "verification_records/v1"), { supplierId: "SUP-001", action: "approve" }));
  });
  it("supplier updates allowed profile fields only", async () => {
    await assertSucceeds(updateDoc(doc(sup1(), "suppliers/SUP-001"), { whatsapp: "081234567890" }));
    await assertFails(updateDoc(doc(sup1(), "suppliers/SUP-001"), { linkedCompanies: ["CMP-A", "CMP-B"] }));
    await assertFails(updateDoc(doc(sup1(), "suppliers/SUP-001"), { ownerUid: "someone" }));
    await assertFails(updateDoc(doc(sup51(), "suppliers/SUP-001"), { whatsapp: "081234567890" }));
  });
});

describe("unauthorized users and seeded profiles", () => {
  it("a signed-in user without claims sees nothing and cannot self-elevate", async () => {
    const db = stranger();
    await assertFails(getDoc(doc(db, "suppliers/SUP-002")));
    await assertFails(getDoc(doc(db, "monthly_reports/SUP-002_2027-01")));
    await assertFails(setDoc(doc(db, "users/rnd"), { role: "company_admin", companyId: "CMP-A" }));
    await assertFails(updateDoc(doc(db, "suppliers/SUP-002"), { ownerUid: "rnd" }));
  });
  it("seeded unclaimed supplier cannot be claimed by writing to it", async () => {
    await assertFails(updateDoc(doc(sup1(), "suppliers/SUP-002"), { ownerUid: "s1" }));
  });
  it("invite codes are never readable by clients", async () => {
    await assertFails(getDoc(doc(companyA(), "supplier_invites/abc")));
    await assertFails(getDoc(doc(stranger(), "supplier_invites/abc")));
  });
  it("users read only their own user doc", async () => {
    await assertSucceeds(getDoc(doc(companyA(), "users/uA")));
    await assertFails(getDoc(doc(companyB(), "users/uA")));
  });
  it("anonymous users can read nothing, including reference data", async () => {
    await assertFails(getDoc(doc(anon(), "emission_factors/listrik")));
    await assertSucceeds(getDoc(doc(sup1(), "emission_factors/listrik")));
  });
  it("notifications: recipient can only mark as read", async () => {
    await assertSucceeds(updateDoc(doc(sup1(), "notifications/n1"), { read: true }));
    await assertFails(updateDoc(doc(sup1(), "notifications/n1"), { title: "hacked" }));
    await assertFails(getDoc(doc(sup51(), "notifications/n1")));
  });
});

describe("Phase 2: evidence metadata and not-applicable categories", () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    supplierId: "SUP-001", reportId: "SUP-001_2027-04", kind: "tagihan_listrik", fileName: "tagihan.jpg",
    mimeType: "image/jpeg", sizeBytes: 120000, storageMode: "demo_preview", sharedWith: [],
    dataSource: "trial", isSimulated: false, createdAt: serverTimestamp(), ...over,
  });
  it("supplier records demo-preview metadata for its own editable draft", async () => {
    const db = sup1();
    await assertSucceeds(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"), draft("SUP-001", "2027-04")));
    await assertSucceeds(setDoc(doc(db, "evidence_metadata/e1"), ev()));
  });
  it("rejects file bytes, fake storage modes, shared or oversized evidence, and locked reports", async () => {
    const db = sup1();
    await assertSucceeds(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"), draft("SUP-001", "2027-04")));
    await assertFails(setDoc(doc(db, "evidence_metadata/e2"), ev({ storageMode: "object_storage" })));
    await assertFails(setDoc(doc(db, "evidence_metadata/e3"), ev({ storageMode: "firestore_inline" })));
    await assertFails(setDoc(doc(db, "evidence_metadata/e4"), ev({ dataBase64: "AAAA" })));
    await assertFails(setDoc(doc(db, "evidence_metadata/e5"), ev({ sharedWith: ["CMP-A"] })));
    await assertFails(setDoc(doc(db, "evidence_metadata/e6"), ev({ sizeBytes: 6 * 1024 * 1024 })));
    await assertFails(setDoc(doc(db, "evidence_metadata/e7"), ev({ mimeType: "text/html" })));
    // SUP-001_2027-01 is verified: no new evidence can be attached
    await assertFails(setDoc(doc(db, "evidence_metadata/e8"), ev({ reportId: "SUP-001_2027-01" })));
    // other supplier's report
    await assertFails(setDoc(doc(sup51(), "evidence_metadata/e9"), ev({ supplierId: "SUP-051" })));
  });
  it("notApplicable accepts known categories only", async () => {
    const db = sup1();
    await assertSucceeds(setDoc(doc(db, "monthly_reports/SUP-001_2027-04"),
      draft("SUP-001", "2027-04", { activity: { ...emptyActivity, notApplicable: ["bbm", "transportasi"] } })));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-05"),
      draft("SUP-001", "2027-05", { activity: { ...emptyActivity, notApplicable: ["semua"] } })));
    await assertFails(setDoc(doc(db, "monthly_reports/SUP-001_2027-05"),
      draft("SUP-001", "2027-05", { activity: { ...emptyActivity, fuelUnit: "galon" } })));
  });
  it("a report under revision stays editable; a submitted one does not", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "monthly_reports/SUP-001_2027-02"), { ...draft("SUP-001", "2027-02"), status: "revision_requested", sharedWith: ["CMP-A"] });
      await setDoc(doc(ctx.firestore(), "monthly_reports/SUP-001_2027-03"), { ...draft("SUP-001", "2027-03"), status: "submitted", sharedWith: ["CMP-A"] });
    });
    await assertSucceeds(updateDoc(doc(sup1(), "monthly_reports/SUP-001_2027-02"), { activity: { ...emptyActivity, electricityKwh: 300 } }));
    await assertFails(updateDoc(doc(sup1(), "monthly_reports/SUP-001_2027-03"), { activity: { ...emptyActivity, electricityKwh: 300 } }));
    await assertFails(deleteDoc(doc(sup1(), "monthly_reports/SUP-001_2027-02")));
  });
});

describe("Phase 3: score history and verification are server-only", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "supplier_scores/SUP-001_2027-01/versions/a"), { supplierId: "SUP-001", sharedWith: ["CMP-A"], trigger: "submission" });
      await setDoc(doc(db, "benchmarks/wb-minuman"), { status: "simulated_sample_average" });
    });
  });
  it("score versions follow the same isolation as scores", async () => {
    await assertSucceeds(getDoc(doc(sup1(), "supplier_scores/SUP-001_2027-01/versions/a")));
    await assertSucceeds(getDoc(doc(companyA(), "supplier_scores/SUP-001_2027-01/versions/a")));
    await assertFails(getDoc(doc(companyB(), "supplier_scores/SUP-001_2027-01/versions/a")));
    await assertFails(getDoc(doc(sup51(), "supplier_scores/SUP-001_2027-01/versions/a")));
  });
  it("nobody writes scores, versions, emissions, factors or status from the client — even a reviewer", async () => {
    const reviewer = env.authenticatedContext("rv", { role: "company_admin", companyId: "CMP-A", canVerify: true }).firestore();
    await assertFails(setDoc(doc(reviewer, "supplier_scores/SUP-001_2027-01/versions/b"), { supplierId: "SUP-001", sharedWith: ["CMP-A"] }));
    await assertFails(updateDoc(doc(reviewer, "monthly_reports/SUP-001_2027-01"), { status: "verified" }));
    await assertFails(setDoc(doc(reviewer, "emission_factors/x"), { kgCO2ePerUnit: 0 }));
    await assertFails(setDoc(doc(reviewer, "benchmarks/x"), { status: "industry_verified" }));
    await assertSucceeds(getDoc(doc(reviewer, "benchmarks/wb-minuman")));
  });
});

describe("Phase 4: company summaries and company-scoped reviews", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "company_period_stats/CMP-A_2027-03"), { companyId: "CMP-A", period: "2027-03", rows: [] });
      await setDoc(doc(db, "company_period_stats/CMP-B_2027-03"), { companyId: "CMP-B", period: "2027-03", rows: [] });
      await setDoc(doc(db, "company_reviews/CMP-A_SUP-001_2027-01"), { companyId: "CMP-A", supplierId: "SUP-001", reportId: "SUP-001_2027-01", period: "2027-01", status: "verified", sharedWith: ["CMP-A"], scopeCompanyId: "CMP-A" });
      await setDoc(doc(db, "company_reviews/CMP-B_SUP-001_2027-01"), { companyId: "CMP-B", supplierId: "SUP-001", reportId: "SUP-001_2027-01", period: "2027-01", status: "pending", sharedWith: ["CMP-B"], scopeCompanyId: "CMP-B" });
    });
  });
  it("each company reads only its own summaries (get and list); suppliers and strangers read none", async () => {
    await assertSucceeds(getDoc(doc(companyA(), "company_period_stats/CMP-A_2027-03")));
    await assertSucceeds(getDoc(doc(companyA(), "company_period_stats/CMP-A_2099-01"))); // not yet built → empty, not an error
    await assertFails(getDoc(doc(companyA(), "company_period_stats/CMP-B_2027-03")));
    const own = await assertSucceeds(getDocs(query(collection(companyA(), "company_period_stats"), where("companyId", "==", "CMP-A"))));
    expect(own.size).toBe(1);
    await assertFails(getDocs(query(collection(companyA(), "company_period_stats"), where("companyId", "==", "CMP-B"))));
    await assertFails(getDocs(collection(companyA(), "company_period_stats")));
    await assertFails(getDoc(doc(sup1(), "company_period_stats/CMP-A_2027-03")));
    await assertFails(getDoc(doc(stranger(), "company_period_stats/CMP-A_2027-03")));
  });
  it("a company never reads another company's review; the supplier reads both; nobody writes", async () => {
    await assertSucceeds(getDoc(doc(companyA(), "company_reviews/CMP-A_SUP-001_2027-01")));
    await assertFails(getDoc(doc(companyA(), "company_reviews/CMP-B_SUP-001_2027-01")));
    await assertFails(getDoc(doc(companyB(), "company_reviews/CMP-A_SUP-001_2027-01")));
    await assertSucceeds(getDocs(query(collection(sup1(), "company_reviews"), where("supplierId", "==", "SUP-001"))));
    await assertFails(getDocs(query(collection(sup51(), "company_reviews"), where("supplierId", "==", "SUP-001"))));
    const reviewer = env.authenticatedContext("rv", { role: "company_admin", companyId: "CMP-A", canVerify: true }).firestore();
    await assertFails(updateDoc(doc(reviewer, "company_reviews/CMP-A_SUP-001_2027-01"), { status: "rejected" }));
    await assertFails(setDoc(doc(reviewer, "company_period_stats/CMP-A_2027-03"), { companyId: "CMP-A", rows: [] }));
  });
});

describe("Phase 5: Google Sheets sync status and logs", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "sheets_sync/CMP-A"), { companyId: "CMP-A", lastStatus: "ok" });
      await setDoc(doc(ctx.firestore(), "sync_logs/l1"), { companyId: "CMP-A", status: "ok" });
    });
  });
  it("a company reads only its own sync status; logs are admin-only; nobody writes", async () => {
    await assertSucceeds(getDoc(doc(companyA(), "sheets_sync/CMP-A")));
    await assertFails(getDoc(doc(companyB(), "sheets_sync/CMP-A")));
    await assertFails(getDoc(doc(sup1(), "sheets_sync/CMP-A")));
    await assertFails(getDocs(collection(companyA(), "sheets_sync")));
    await assertFails(setDoc(doc(companyA(), "sheets_sync/CMP-A"), { lastStatus: "ok" }));
    await assertFails(getDoc(doc(companyA(), "sync_logs/l1")));
  });
});

describe("Customer Success, lifecycle and scenario isolation", () => {
  const cs1 = () => env.authenticatedContext("c1", { role: "customer_success", csId: "CS01" }).firestore();
  const cs2 = () => env.authenticatedContext("c2", { role: "customer_success", csId: "CS02" }).firestore();
  const admin = () => env.authenticatedContext("pa", { role: "platform_admin" }).firestore();
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "cs_staff/CS01"), { csId: "CS01", name: "CS 1" });
      await setDoc(doc(db, "cs_staff/CS02"), { csId: "CS02", name: "CS 2" });
      await setDoc(doc(db, "cs_assignments/SUP-101"), { supplierId: "SUP-101", csId: "CS01" });
      await setDoc(doc(db, "supplier_lifecycle/CMP-A_SUP-101"), { companyId: "CMP-A", supplierId: "SUP-101", csId: "CS01", stage: "onboarding" });
      await setDoc(doc(db, "supplier_lifecycle/CMP-A_SUP-101/history/h1"), { from: "onboarding", to: "trial" });
      await setDoc(doc(db, "supplier_lifecycle/CMP-B_SUP-102"), { companyId: "CMP-B", supplierId: "SUP-102", csId: "CS02", stage: "trial" });
      await setDoc(doc(db, "cs_followups/f1"), { supplierId: "SUP-101", csId: "CS01", note: "telepon" });
      await setDoc(doc(db, "company_subscriptions/CMP-A"), { companyId: "CMP-A", status: "trial" });
      await setDoc(doc(db, "scenario_suppliers/SCN-S0001"), { supplierId: "SCN-S0001", csId: "CS01" });
      await setDoc(doc(db, "scenario_suppliers/SCN-S0071"), { supplierId: "SCN-S0071", csId: "CS02" });
      await setDoc(doc(db, "scenario_companies/SCN-C01"), { companyId: "SCN-C01" });
      await setDoc(doc(db, "meta/financial_scenario"), { version: 1 });
    });
  });

  it("CS reads only its own portfolio", async () => {
    await assertSucceeds(getDoc(doc(cs1(), "supplier_lifecycle/CMP-A_SUP-101")));
    await assertSucceeds(getDocs(query(collection(cs1(), "supplier_lifecycle"), where("csId", "==", "CS01"))));
    await assertSucceeds(getDoc(doc(cs1(), "supplier_lifecycle/CMP-A_SUP-101/history/h1")));
    await assertSucceeds(getDoc(doc(cs1(), "cs_followups/f1")));
    await assertSucceeds(getDoc(doc(cs1(), "cs_staff/CS01")));
    await assertSucceeds(getDocs(query(collection(cs1(), "scenario_suppliers"), where("csId", "==", "CS01"))));
  });
  it("CS cannot read other portfolios, the CS directory, or list without its own filter", async () => {
    await assertFails(getDoc(doc(cs1(), "supplier_lifecycle/CMP-B_SUP-102")));
    await assertFails(getDocs(collection(cs1(), "supplier_lifecycle")));
    await assertFails(getDocs(query(collection(cs1(), "supplier_lifecycle"), where("csId", "==", "CS02"))));
    await assertFails(getDoc(doc(cs1(), "cs_staff/CS02")));
    await assertFails(getDocs(collection(cs1(), "cs_staff")));
    await assertFails(getDoc(doc(cs2(), "cs_followups/f1")));
    await assertFails(getDoc(doc(cs1(), "scenario_suppliers/SCN-S0071")));
    await assertFails(getDoc(doc(cs1(), "company_subscriptions/CMP-A")));
    await assertFails(getDoc(doc(cs1(), "meta/financial_scenario")));
  });
  it("CS gets no company or supplier report access", async () => {
    await assertFails(getDoc(doc(cs1(), "monthly_reports/SUP-001_2027-01")));
    await assertFails(getDoc(doc(cs1(), "suppliers/SUP-001")));
    await assertFails(getDoc(doc(cs1(), "companies/CMP-A")));
  });
  it("company admins and suppliers get no internal CS/lifecycle/scenario access", async () => {
    for (const f of [companyA, sup1]) {
      await assertFails(getDoc(doc(f(), "supplier_lifecycle/CMP-A_SUP-101")));
      await assertFails(getDoc(doc(f(), "cs_assignments/SUP-101")));
      await assertFails(getDoc(doc(f(), "cs_followups/f1")));
      await assertFails(getDoc(doc(f(), "company_subscriptions/CMP-A")));
      await assertFails(getDoc(doc(f(), "scenario_suppliers/SCN-S0001")));
      await assertFails(getDocs(collection(f(), "scenario_companies")));
    }
  });
  it("nobody writes internal collections from the client; platform admin reads all", async () => {
    await assertFails(setDoc(doc(cs1(), "cs_assignments/SUP-102"), { supplierId: "SUP-102", csId: "CS01" }));
    await assertFails(updateDoc(doc(cs1(), "supplier_lifecycle/CMP-A_SUP-101"), { stage: "active_subscription" }));
    await assertFails(setDoc(doc(admin(), "company_subscriptions/CMP-A"), { status: "renewed" }));
    await assertSucceeds(getDocs(collection(admin(), "supplier_lifecycle")));
    await assertSucceeds(getDocs(collection(admin(), "cs_staff")));
    await assertSucceeds(getDocs(collection(admin(), "scenario_suppliers")));
    await assertSucceeds(getDoc(doc(admin(), "meta/financial_scenario")));
  });
});
