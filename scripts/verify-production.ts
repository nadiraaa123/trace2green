/**
 * Read-only production check (no writes): project, seeded data, companies, admin claims.
 *   FIREBASE_SERVICE_ACCOUNT_KEY=... npx tsx scripts/verify-production.ts CMP-A CMP-B
 */
import { auth, db, target } from "./_admin";

async function main() {
  const companies = process.argv.slice(2);
  const fail: string[] = [];
  const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
  const projectId = (db as unknown as { projectId?: string }).projectId ?? process.env.FIREBASE_PROJECT_ID;
  console.log(`Target: ${target}  project: ${projectId}`);

  const demoSuppliers = await count(db.collection("suppliers").where("dataSource", "==", "demo"));
  const allSuppliers = await count(db.collection("suppliers"));
  const demoReports = await count(db.collection("monthly_reports").where("dataSource", "==", "demo"));
  const allReports = await count(db.collection("monthly_reports"));
  const audits = await count(db.collection("verification_records").where("action", "==", "sample_audit"));
  console.log(`suppliers: ${demoSuppliers} demo / ${allSuppliers} total`);
  console.log(`monthly_reports: ${demoReports} demo / ${allReports} total`);
  console.log(`sample audits: ${audits}`);
  if (demoSuppliers !== 100) fail.push("expected 100 demo suppliers");
  if (demoReports !== 277) fail.push("expected 277 demo reports");
  if (audits !== 12) fail.push("expected 12 sample audits");

  for (const cid of companies) {
    const c = await db.doc(`companies/${cid}`).get();
    const stats = await count(db.collection("company_period_stats").where("companyId", "==", cid));
    const admins = await db.collection("users").where("companyId", "==", cid).get();
    let reviewers = 0;
    for (const u of admins.docs) {
      const claims = (await auth.getUser(u.id)).customClaims ?? {};
      if (claims.role === "company_admin" && claims.companyId === cid) reviewers++;
    }
    console.log(`${cid}: ${c.exists ? c.data()!.name : "MISSING"} · dashboard summaries ${stats} · admin accounts with claims ${reviewers}`);
    if (!c.exists) fail.push(`${cid} missing`);
    if (stats < 3) fail.push(`${cid} has no dashboard summaries`);
    if (reviewers < 1) fail.push(`${cid} has no admin account`);
  }
  if (fail.length) { console.error("FAIL: " + fail.join("; ")); process.exit(1); }
  console.log("OK: production data and accounts verified (read-only check).");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
