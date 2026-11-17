// Post-run database assertions for the e2e flows (emulator only).
import { db, target } from "../../scripts/_admin";

async function main() {
  if (!target.startsWith("emulator")) throw new Error("emulator only");
  const suppliers = (await db.collection("suppliers").count().get()).data().count;
  const reports = await db.collection("monthly_reports").get();
  const fail = (m: string) => { console.error("FAIL", m); process.exit(1); };
  // 3 seeded fixtures; Phase 1 registers SUP-101 (and claims SUP-002, no new doc); Phase 2 registers SUP-102.
  if (suppliers !== 5) fail(`expected 5 suppliers, got ${suppliers}`);
  console.log("PASS supplier count 3 seeded + 2 registered = 5 (claims and re-logins added none)");
  if (reports.size !== 1) fail(`expected exactly 1 monthly report, got ${reports.size}`);
  const r = reports.docs[0].data();
  if (r.reportId !== "SUP-102_2027-03" || r.status !== "submitted" || r.version !== 2) fail(`unexpected report ${JSON.stringify({ id: r.reportId, s: r.status, v: r.version })}`);
  if (r.activity.wasteKg !== 22.2 || r.activity.electricityKwh !== 1250 || r.activity.packagingKg !== 28.9) fail("activity values not parsed as expected");
  if (r.activity.fuelQuantity !== null || !r.activity.notApplicable.includes("bbm")) fail("not-applicable fuel must stay null + flagged");
  if (JSON.stringify(r.sharedWith) !== '["CMP-A"]') fail(`sharedWith ${JSON.stringify(r.sharedWith)}`);
  const v1 = (await db.doc("monthly_reports/SUP-102_2027-03/versions/v1").get()).data()!;
  if (v1.activity.wasteKg !== null) fail("v1 snapshot must keep waste as missing (null), not 0");
  console.log("PASS report v2 stored; v1 snapshot preserved with missing waste = null");
  const ev = await db.collection("evidence_metadata").get();
  const ALLOWED = ["supplierId", "reportId", "kind", "fileName", "mimeType", "sizeBytes", "storageMode", "sharedWith", "dataSource", "isSimulated", "createdAt"];
  const evDoc = ev.docs[0]?.data() ?? {};
  const extra = Object.keys(evDoc).filter((k) => !ALLOWED.includes(k));
  if (ev.size !== 1 || evDoc.storageMode !== "demo_preview" || extra.length) fail(`evidence metadata wrong: size=${ev.size} extra=${extra}`);
  if (JSON.stringify(evDoc.sharedWith) !== '["CMP-A"]') fail("evidence should be shared after submission");
  console.log("PASS evidence stored as metadata only (demo_preview, no file bytes)");
  console.log("ALL DB CHECKS PASSED");
}
main().then(() => process.exit(0));
