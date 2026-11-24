// Writes the 2027–2031 growth scenario as a SEPARATE projection layer.
// - Create-only: an existing doc is never overwritten; a differing one is reported as a conflict and skipped.
// - Never touches suppliers/, companies/, monthly_reports/ or any operational collection.
// - No environmental reports, payments, invoices or contracts are generated.
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  buildScenarioPlan, CS_CAPACITY, FINANCIAL_MODEL, MODEL_ASSUMPTIONS, planCounts, SCENARIO_YEARS, TRIAL_QUOTA_PER_NEW_COMPANY, type ScenarioPlan,
} from "@/lib/scenario";

export const SCENARIO_PLAN_VERSION = 1;
const META = { basis: "scenario_projection", isProjection: true, dataSource: "demo", isSimulated: true, planVersion: SCENARIO_PLAN_VERSION, generatedBy: "scripts/scenario.ts" } as const;

interface Desired { path: string; core: Record<string, unknown> }

function desiredDocs(plan: ScenarioPlan): Desired[] {
  return [
    { path: "meta/financial_scenario", core: { model: FINANCIAL_MODEL, assumptions: MODEL_ASSUMPTIONS, csCapacity: CS_CAPACITY, trialQuotaPerNewCompany: TRIAL_QUOTA_PER_NEW_COMPANY } },
    ...plan.companies.map((c) => ({ path: `scenario_companies/${c.companyId}`, core: { ...c } })),
    ...plan.suppliers.map((s) => ({ path: `scenario_suppliers/${s.supplierId}`, core: { ...s } })),
    ...plan.cs.map((c) => ({ path: `cs_staff/${c.csId}`, core: { csId: c.csId, name: c.name, email: c.email, projectedStartYear: c.projectedStartYear, capacity: CS_CAPACITY, scenario: true, active: true } })),
  ];
}

const same = (core: Record<string, unknown>, existing: Record<string, unknown>) =>
  Object.entries(core).every(([k, v]) => JSON.stringify(existing[k]) === JSON.stringify(v));

export interface ScenarioDiff {
  toCreate: string[]; unchanged: string[]; conflicts: string[];
  csAccounts: { email: string; csId: string; action: "create" | "exists" | "conflict"; detail?: string }[];
  byCollection: Record<string, { create: number; unchanged: number; conflict: number }>;
  preserved: { suppliers: number; workbookReports: number; liveReports: number; companies: number };
  yearly: ReturnType<typeof planCounts>[];
}

/** Read-only diff of what applying the scenario would do. */
export async function diffScenario(db: Firestore, auth: Auth | null, plan = buildScenarioPlan()): Promise<ScenarioDiff> {
  const want = desiredDocs(plan);
  const out: ScenarioDiff = { toCreate: [], unchanged: [], conflicts: [], csAccounts: [], byCollection: {}, preserved: { suppliers: 0, workbookReports: 0, liveReports: 0, companies: 0 }, yearly: SCENARIO_YEARS.map((y) => planCounts(plan, y)) };
  for (let i = 0; i < want.length; i += 300) {
    const chunk = want.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((d) => db.doc(d.path)));
    snaps.forEach((snap, j) => {
      const d = chunk[j];
      const col = d.path.split("/")[0] === "meta" ? "meta" : d.path.split("/")[0];
      const bucket = (out.byCollection[col] ??= { create: 0, unchanged: 0, conflict: 0 });
      if (!snap.exists) { out.toCreate.push(d.path); bucket.create++; }
      else if (same(d.core, snap.data()!)) { out.unchanged.push(d.path); bucket.unchanged++; }
      else { out.conflicts.push(d.path); bucket.conflict++; }
    });
  }
  if (auth) {
    for (const c of plan.cs) {
      try {
        const u = await auth.getUserByEmail(c.email);
        const role = u.customClaims?.role;
        if (role === "customer_success" && u.customClaims?.csId === c.csId) out.csAccounts.push({ email: c.email, csId: c.csId, action: "exists" });
        else out.csAccounts.push({ email: c.email, csId: c.csId, action: "conflict", detail: `role=${role ?? "-"} csId=${u.customClaims?.csId ?? "-"}` });
      } catch {
        out.csAccounts.push({ email: c.email, csId: c.csId, action: "create" });
      }
    }
  }
  const [sup, wbRep, liveRep, comp] = await Promise.all([
    db.collection("suppliers").count().get(),
    db.collection("monthly_reports").where("dataSource", "==", "demo").count().get(),
    db.collection("monthly_reports").where("dataSource", "==", "trial").count().get(),
    db.collection("companies").count().get(),
  ]);
  out.preserved = { suppliers: sup.data().count, workbookReports: wbRep.data().count, liveReports: liveRep.data().count, companies: comp.data().count };
  return out;
}

/** Applies the diff: creates missing docs and CS demo accounts only. Returns what was written. */
export async function applyScenario(db: Firestore, auth: Auth, csPassword: string, plan = buildScenarioPlan()) {
  if (csPassword.length < 10) throw new Error("SCENARIO_CS_PASSWORD must be at least 10 characters");
  const diff = await diffScenario(db, auth, plan);
  const byPath = new Map(desiredDocs(plan).map((d) => [d.path, d]));
  const now = FieldValue.serverTimestamp();
  let created = 0;
  for (let i = 0; i < diff.toCreate.length; i += 400) {
    const batch = db.batch();
    for (const path of diff.toCreate.slice(i, i + 400)) {
      batch.create(db.doc(path), { ...byPath.get(path)!.core, ...META, createdAt: now });
      created++;
    }
    await batch.commit(); // create() fails the batch if a doc appeared meanwhile → nothing overwritten
  }
  let accounts = 0;
  for (const a of diff.csAccounts.filter((x) => x.action === "create")) {
    const c = plan.cs.find((x) => x.csId === a.csId)!;
    const u = await auth.createUser({ email: c.email, password: csPassword, displayName: c.name, emailVerified: true });
    await auth.setCustomUserClaims(u.uid, { role: "customer_success", csId: c.csId, scenario: true });
    await db.doc(`users/${u.uid}`).create({ uid: u.uid, email: c.email, displayName: c.name, role: "customer_success", csId: c.csId,
      companyId: null, supplierId: null, ...META, createdAt: now, updatedAt: now });
    accounts++;
  }
  return { created, accounts, skippedConflicts: diff.conflicts.length, accountConflicts: diff.csAccounts.filter((x) => x.action === "conflict").length };
}
