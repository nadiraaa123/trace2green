// Phase 3 e2e fixtures: full workbook seed + codes (emulator only).
import { db, target } from "../../scripts/_admin";
import { seedWorkbook } from "../../src/server/seed";
import { createInvite } from "../../src/server/suppliers";
import { readWorkbook } from "../../src/server/workbook";

async function main() {
  if (!target.startsWith("emulator")) throw new Error("emulator only");
  const s = await seedWorkbook(db, readWorkbook());
  if (s.written !== s.planned) throw new Error("seed did not write all docs");
  const admin = { uid: "fixture", email: null, claims: { role: "company_admin", companyId: "CMP-A" } };
  console.log(`CONNECT=${(await createInvite(db, admin, null)).code}`);
  console.log(`CLAIM=${(await createInvite(db, admin, "SUP-004")).code}`);
}
main().then(() => process.exit(0));
