// Fixtures for deck mockups (emulator only): workbook seed, two live suppliers with real
// submissions through the normal server flows, one company verification, scenario layer.
import { FieldValue } from "firebase-admin/firestore";
import { auth, db, target } from "../../scripts/_admin";
import { emptyActivity, emptyProfile } from "../../src/lib/report";
import { referenceDate } from "../../src/lib/period";
import { submitReport } from "../../src/server/reports";
import { applyScenario } from "../../src/server/scenario";
import { seedWorkbook } from "../../src/server/seed";
import { connectWithInvite } from "../../src/server/sharing";
import { createInvite, registerSupplier } from "../../src/server/suppliers";
import { reviewReport } from "../../src/server/verification";
import { readWorkbook } from "../../src/server/workbook";

const REF = referenceDate("2027-04-05");
const company = { uid: "fx", email: null, claims: { role: "company_admin", companyId: "CMP-A", canVerify: true } };

async function live(email: string, business: string, pic: string, wa: string) {
  const u = await auth.createUser({ email, password: "rahasia123" });
  const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email, claims: {} }, { picName: pic, businessName: business, whatsapp: wa, privacyConsent: true });
  const s = { uid: u.uid, email, claims: { role: "supplier", supplierId } };
  const { code } = await createInvite(db, company, null);
  await connectWithInvite(db, s, { inviteCode: code, shareData: true });
  return { s, supplierId };
}
async function draft(supplierId: string, period: string, profile: object, activity: object, step = 1) {
  const rid = `${supplierId}_${period}`;
  await db.doc(`monthly_reports/${rid}`).set({
    reportId: rid, supplierId, period, status: "draft", profile: { ...emptyProfile(), ...profile }, activity: { ...emptyActivity(), ...activity },
    draftStep: step, version: 0, sharedWith: [], submittedAt: null, dataSource: "trial", isSimulated: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
}

async function main() {
  if (!target.startsWith("emulator")) throw new Error("emulator only");
  await seedWorkbook(db, readWorkbook());
  const rina = await live("rina@umkm.test", "Roti Rina", "Rina Lestari", "081377788899");
  const dedi = await live("dedi@umkm.test", "Keripik Dedi", "Dedi Saputra", "081377788898");
  const profile = { businessName: "Roti Rina", sector: "Roti & kue", mainProduct: "Roti manis", productionVolume: 2400, productionUnit: "unit", employees: 4 };
  const act = { electricityKwh: 410, fuelQuantity: 18, fuelUnit: "liter", fuelType: "Bensin", packagingKg: 24, packagingMaterial: "Plastik", wasteKg: 9,
    wasteHandling: "Dipilah", rawMaterialOrigin: "Lokal", transportMode: "Motor", transportKm: 320, efficiencyPractice: "Sebagian", notApplicable: [] };
  await draft(rina.supplierId, "2027-02", profile, act);
  await submitReport(db, rina.s, "2027-02", REF);
  await reviewReport(db, company, { reportId: `${rina.supplierId}_2027-02`, action: "approve", note: "Tagihan PLN sesuai", checkedKwh: 405, checkSource: "dokumen_asli" });
  await draft(rina.supplierId, "2027-03", profile, { ...act, electricityKwh: 388, wasteKg: 7 });
  await submitReport(db, rina.s, "2027-03", REF);
  await draft(dedi.supplierId, "2027-03", { businessName: "Keripik Dedi", sector: "Bumbu & olahan", mainProduct: "Keripik singkong", productionVolume: 900, productionUnit: "kg", employees: 3 },
    { electricityKwh: 260, fuelQuantity: 12, fuelUnit: "kg", fuelType: "LPG" }, 2);
  await applyScenario(db, auth, "rahasia-demo-123");
  console.log("MOCK FIXTURES OK", rina.supplierId, dedi.supplierId);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
