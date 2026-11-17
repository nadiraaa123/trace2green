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
  electricityKwh: null, fuelLiters: null, fuelType: null, packagingKg: null, packagingMaterial: null,
  wasteKg: null, wasteHandling: null, rawMaterialOrigin: null, transportMode: null, transportKm: null,
  efficiencyPractice: null,
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
