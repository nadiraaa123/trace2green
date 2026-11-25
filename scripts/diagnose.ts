/**
 * READ-ONLY check: why a supplier does (not) show up for a CS.
 *   npx tsx scripts/diagnose.ts <supplier-email> [cs-email]
 * Prints each link in the chain: account → supplier → company link → lifecycle → CS assignment → CS account.
 * Writes nothing.
 */
import { auth, db, target } from "./_admin";

const ok = (b: boolean) => (b ? "OK " : "XX ");

async function main() {
  const [supEmail, csEmail] = process.argv.slice(2);
  if (!supEmail) throw new Error("Usage: diagnose.ts <supplier-email> [cs-email]");
  console.log(`Target: ${target}\n`);

  const u = await auth.getUserByEmail(supEmail).catch(() => null);
  console.log(`${ok(!!u)}1. Akun pemasok ${supEmail}: ${u ? `role=${u.customClaims?.role ?? "-"} supplierId=${u.customClaims?.supplierId ?? "-"}` : "tidak ditemukan"}`);
  const sid = u?.customClaims?.supplierId as string | undefined;
  if (!sid) return console.log("   → Akun belum selesai daftar sebagai pemasok.");

  const sup = (await db.doc(`suppliers/${sid}`).get()).data();
  console.log(`${ok(!!sup)}2. Profil ${sid}: ${sup ? `${sup.businessName} · linkedCompanies=${JSON.stringify(sup.linkedCompanies ?? [])}` : "tidak ada"}`);

  const rels = await db.collection("company_supplier_relationships").where("supplierId", "==", sid).get();
  console.log(`${ok(!rels.empty)}3. Terhubung ke perusahaan: ${rels.empty ? "BELUM — masukkan kode penghubung di Profil → Perusahaan" : rels.docs.map((d) => `${d.data().companyId} (${d.data().status})`).join(", ")}`);

  const lc = await db.collection("supplier_lifecycle").where("supplierId", "==", sid).get();
  console.log(`${ok(!lc.empty)}4. Catatan siklus (muncul di Admin › Pemasok & Siklus): ${lc.empty ? "TIDAK ADA" : lc.docs.map((d) => `${d.id} stage=${d.data().stage} csId=${d.data().csId ?? "null"}`).join(", ")}`);

  const as = (await db.doc(`cs_assignments/${sid}`).get()).data();
  console.log(`${ok(!!as)}5. Penugasan CS: ${as ? as.csId : "BELUM ditugaskan — Admin › Pemasok & Siklus › Tugaskan CS › Simpan penugasan"}`);

  if (csEmail) {
    const c = await auth.getUserByEmail(csEmail).catch(() => null);
    const csId = c?.customClaims?.csId as string | undefined;
    console.log(`${ok(c?.customClaims?.role === "customer_success" && !!csId)}6. Akun CS ${csEmail}: ${c ? `role=${c.customClaims?.role ?? "-"} csId=${csId ?? "-"} scenario=${c.customClaims?.scenario === true}` : "tidak ditemukan"}`);
    if (csId) {
      const staff = (await db.doc(`cs_staff/${csId}`).get()).data();
      console.log(`${ok(!!staff && staff.scenario === false)}7. Direktori ${csId}: ${staff ? `scenario=${staff.scenario} active=${staff.active}` : "tidak ada"}`);
      const match = lc.docs.some((d) => d.data().csId === csId);
      console.log(`${ok(match)}8. Pemasok tampil di portofolio ${csId}: ${match ? "YA" : "TIDAK — csId di catatan siklus tidak sama"}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
