// Financial model, scenario plan and lifecycle rules (pure).
import { describe, expect, it } from "vitest";
import { canTransition, NEEDS_CONFIRMATION, roleMayTransition, trialWindow } from "@/lib/lifecycle";
import {
  buildScenarioPlan, checkFinancialModel, CS_CAPACITY, FINANCIAL_MODEL, minCs, planCounts, projectedStage, SCENARIO_YEARS,
} from "@/lib/scenario";

const plan = buildScenarioPlan();

describe("financial model (exact figures)", () => {
  it("table is internally consistent", () => {
    expect(checkFinancialModel()).toEqual([]);
  });
  it("key totals", () => {
    expect(SCENARIO_YEARS.map((y) => FINANCIAL_MODEL[y].totalCompanies)).toEqual([2, 4, 7, 11, 16]);
    expect(SCENARIO_YEARS.map((y) => FINANCIAL_MODEL[y].payingSuppliers)).toEqual([40, 140, 290, 530, 880]);
    expect(FINANCIAL_MODEL[2027].payingSuppliers).toBe(40); // 880 is the 2031 projection, not 2027
  });
  it("detects a broken table", () => {
    const bad = structuredClone(FINANCIAL_MODEL);
    bad[2029].awaitingActivation = 121;
    expect(checkFinancialModel(bad)).toEqual(["2029: menunggu aktivasi = baru − trial (121 ≠ 120)"]);
  });
});

describe("scenario plan reproduces the model", () => {
  it.each(SCENARIO_YEARS)("%i counts match the table", (y) => {
    const c = planCounts(plan, y);
    const m = FINANCIAL_MODEL[y];
    expect(c).toMatchObject({
      totalCompanies: m.totalCompanies, newCompanies: m.newCompanies, renewingCompanies: m.renewingCompanies,
      existingSuppliers: m.existingSuppliers, newSuppliers: m.newSuppliers, trialSuppliers: m.trialSuppliers,
      awaitingActivation: m.awaitingActivation, payingSuppliers: m.payingSuppliers,
    });
  });
  it("880 distinct suppliers, 16 companies, IDs never collide with SUP-/CMP-", () => {
    expect(new Set(plan.suppliers.map((s) => s.supplierId)).size).toBe(880);
    expect(plan.companies).toHaveLength(16);
    expect(plan.suppliers.every((s) => /^SCN-S\d{4}$/.test(s.supplierId) && !s.supplierId.includes("_"))).toBe(true);
    expect(plan.companies.every((c) => /^SCN-C\d{2}$/.test(c.companyId))).toBe(true);
  });
  it("max 10 unique trial suppliers per new company", () => {
    for (const y of SCENARIO_YEARS) expect(planCounts(plan, y).trialPerCompanyMax).toBe(10);
    for (const co of plan.companies) expect(plan.suppliers.filter((s) => s.companyId === co.companyId && s.trialPlanned)).toHaveLength(10);
  });
});

describe("CS capacity", () => {
  it("minimum CS per year = 1/2/5/8/13", () => {
    expect(SCENARIO_YEARS.map((y) => minCs(FINANCIAL_MODEL[y].payingSuppliers))).toEqual([1, 2, 5, 8, 13]);
    expect(SCENARIO_YEARS.map((y) => planCounts(plan, y).csNeeded)).toEqual([1, 2, 5, 8, 13]);
  });
  it("2031: 880 suppliers across 13 CS, capacity 910, remaining 30, nobody over 70", () => {
    const c = planCounts(plan, 2031);
    expect(c).toMatchObject({ csNeeded: 13, csCapacity: 910, csRemaining: 30, payingSuppliers: 880 });
    expect(c.maxLoad).toBeLessThanOrEqual(CS_CAPACITY);
    expect(plan.cs).toHaveLength(13);
    expect(plan.cs.map((x) => x.projectedStartYear)).toEqual([2027, 2028, 2029, 2029, 2029, 2030, 2030, 2030, 2031, 2031, 2031, 2031, 2031]);
  });
  it("one primary CS per supplier", () => {
    expect(plan.suppliers.every((s) => typeof s.csId === "string")).toBe(true);
  });
});

describe("projections", () => {
  const t = { cohortYear: 2028 as const, trialPlanned: true };
  const a = { cohortYear: 2028 as const, trialPlanned: false };
  it("follow trial → active → renewal and are absent before the cohort", () => {
    expect(projectedStage(t, 2027, 6)).toBeNull();
    expect(projectedStage(t, 2028, 2)).toBe("trial");
    expect(projectedStage(a, 2028, 2)).toBe("awaiting_activation");
    expect(projectedStage(a, 2028, 4)).toBe("active_subscription");
    expect(projectedStage(a, 2029, 1)).toBe("renewal_due");
    expect(projectedStage(a, 2029, 12)).toBe("renewed");
  });
  it("only 40 scenario suppliers exist in 2027 — never all 880", () => {
    expect(plan.suppliers.filter((s) => projectedStage(s, 2027, 12) != null)).toHaveLength(40);
  });
});

describe("operational lifecycle rules", () => {
  it("paid states need confirmation and only admins may set them", () => {
    expect(NEEDS_CONFIRMATION).toEqual(["active_subscription", "renewed"]);
    expect(roleMayTransition("customer_success", "active_subscription")).toBe(false);
    expect(roleMayTransition("customer_success", "renewed")).toBe(false);
    expect(roleMayTransition("customer_success", "expired")).toBe(false);
    expect(roleMayTransition("customer_success", "trial")).toBe(true);
    expect(roleMayTransition("platform_admin", "renewed")).toBe(true);
  });
  it("transitions follow the lifecycle", () => {
    expect(canTransition("onboarding", "trial")).toBe(true);
    expect(canTransition("onboarding", "renewed")).toBe(false);
    expect(canTransition("renewal_due", "renewed")).toBe(true);
    expect(canTransition("expired", "active_subscription")).toBe(false);
  });
  it("trial window is Jan–Mar", () => {
    expect(trialWindow(2028)).toEqual({ start: "2028-01-01", end: "2028-03-31" });
  });
});
