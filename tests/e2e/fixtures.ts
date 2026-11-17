// Minimal fixtures for the Phase 1 browser smoke test (emulator only).
import { FieldValue } from "firebase-admin/firestore";
import { db, target } from "../../scripts/_admin";
import { createInvite } from "../../src/server/suppliers";

async function main() {
  if (!target.startsWith("emulator")) throw new Error("fixtures are emulator-only");
  const b = db.batch();
  for (let i = 1; i <= 3; i++) {
    const id = `SUP-00${i}`;
    b.set(db.doc(`suppliers/${id}`), { supplierId: id, businessName: `Pemasok 0${i}`, ownerUid: null, claimStatus: "unclaimed",
      linkedCompanies: ["CMP-A"], dataSource: "demo", isSimulated: true, createdAt: FieldValue.serverTimestamp() });
    b.set(db.doc(`company_supplier_relationships/CMP-A_${id}`), { companyId: "CMP-A", supplierId: id, isCritical: false, status: "active", dataSource: "demo", isSimulated: true });
  }
  b.set(db.doc("meta/counters"), { nextSupplierNumber: 101 });
  await b.commit();
  const { code } = await createInvite(db, { uid: "fixture", email: null, claims: { role: "company_admin", companyId: "CMP-A" } }, "SUP-002");
  console.log(`INVITE=${code}`);
  const connect = await createInvite(db, { uid: "fixture", email: null, claims: { role: "company_admin", companyId: "CMP-A" } }, null);
  console.log(`CONNECT=${connect.code}`);
}
main().then(() => process.exit(0));
