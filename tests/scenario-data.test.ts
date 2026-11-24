// Scenario generator against the emulator: dry run, create-only apply, idempotency, preservation.
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { applyScenario, diffScenario } from "@/server/scenario";
import { seedWorkbook } from "@/server/seed";
import { readWorkbook } from "@/server/workbook";
import { auth, db, resetEmulators } from "./helpers";

async function fingerprint(col: string) {
  const s = await db.collection(col).get();
  const rows = s.docs.map((d) => `${d.id}:${JSON.stringify(d.data(), Object.keys(d.data()).sort())}`).sort();
  return { n: s.size, hash: createHash("sha256").update(rows.join("\n")).digest("hex") };
}

describe("scenario data layer", () => {
  beforeAll(async () => { await resetEmulators(); await seedWorkbook(db, readWorkbook()); });

  it("dry run lists exactly what would be created and writes nothing", async () => {
    const d = await diffScenario(db, auth);
    expect(d.byCollection).toEqual({
      meta: { create: 1, unchanged: 0, conflict: 0 },
      scenario_companies: { create: 16, unchanged: 0, conflict: 0 },
      scenario_suppliers: { create: 880, unchanged: 0, conflict: 0 },
      cs_staff: { create: 13, unchanged: 0, conflict: 0 },
    });
    expect(d.csAccounts.filter((a) => a.action === "create")).toHaveLength(13);
    expect(d.preserved).toMatchObject({ suppliers: 100, workbookReports: 277, companies: 2 });
    expect((await db.collection("scenario_suppliers").count().get()).data().count).toBe(0);
  });

  it("apply creates the layer, preserves the workbook data, and is idempotent", async () => {
    const before = { suppliers: await fingerprint("suppliers"), reports: await fingerprint("monthly_reports"), companies: await fingerprint("companies"), stats: await fingerprint("company_period_stats") };
    const r1 = await applyScenario(db, auth, "rahasia-demo-123");
    expect(r1).toEqual({ created: 910, accounts: 13, skippedConflicts: 0, accountConflicts: 0 });
    expect(await fingerprint("suppliers")).toEqual(before.suppliers); // 100 workbook suppliers untouched
    expect(await fingerprint("monthly_reports")).toEqual(before.reports); // 277 reports untouched
    expect(await fingerprint("companies")).toEqual(before.companies);
    expect(await fingerprint("company_period_stats")).toEqual(before.stats); // company dashboards unchanged
    expect((await db.collection("scenario_suppliers").where("cohortYear", "==", 2027).count().get()).data().count).toBe(40);
    const s1 = (await db.doc("scenario_suppliers/SCN-S0001").get()).data()!;
    expect(s1).toMatchObject({ basis: "scenario_projection", isProjection: true, csId: "CS-S01", companyId: "SCN-C01", trialPlanned: true });
    expect(Object.keys(s1)).not.toContain("subscriptionStatus"); // nothing marked paid/active
    const u = await auth.getUserByEmail("cs13@scenario.trace2green.test");
    expect(u.customClaims).toMatchObject({ role: "customer_success", csId: "CS-S13", scenario: true });

    const r2 = await applyScenario(db, auth, "rahasia-demo-123");
    expect(r2).toEqual({ created: 0, accounts: 0, skippedConflicts: 0, accountConflicts: 0 });
    expect((await db.collection("scenario_suppliers").count().get()).data().count).toBe(880);
  });

  it("a differing existing doc is reported as a conflict and never overwritten", async () => {
    await db.doc("scenario_suppliers/SCN-S0002").update({ csId: "CS-S99" });
    const d = await diffScenario(db, auth);
    expect(d.conflicts).toEqual(["scenario_suppliers/SCN-S0002"]);
    await applyScenario(db, auth, "rahasia-demo-123");
    expect((await db.doc("scenario_suppliers/SCN-S0002").get()).data()!.csId).toBe("CS-S99");
  });
});
