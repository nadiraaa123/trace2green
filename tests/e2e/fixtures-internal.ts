// Internal workspaces e2e fixtures: workbook seed + 2 live suppliers connected to CMP-A + scenario layer.
import { auth, db, target } from "../../scripts/_admin";
import { applyScenario } from "../../src/server/scenario";
import { seedWorkbook } from "../../src/server/seed";
import { connectWithInvite } from "../../src/server/sharing";
import { createInvite, registerSupplier } from "../../src/server/suppliers";
import { readWorkbook } from "../../src/server/workbook";

async function live(email: string, business: string, wa: string) {
  const u = await auth.createUser({ email, password: "rahasia123" });
  const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email, claims: {} }, { picName: "PIC", businessName: business, whatsapp: wa, privacyConsent: true });
  const { code } = await createInvite(db, { uid: "x", email: null, claims: { role: "company_admin", companyId: "CMP-A" } }, null);
  await connectWithInvite(db, { uid: u.uid, email, claims: { role: "supplier", supplierId } }, { inviteCode: code, shareData: true });
  return supplierId;
}

async function main() {
  if (!target.startsWith("emulator")) throw new Error("emulator only");
  await seedWorkbook(db, readWorkbook());
  const a = await live("rina@umkm.test", "Roti Rina", "081377788899");
  const b = await live("dedi@umkm.test", "Keripik Dedi", "081377788898");
  await applyScenario(db, auth, "rahasia-demo-123");
  console.log("IDS=" + JSON.stringify({ a, b }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
