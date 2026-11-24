// Operational simulation: deterministic, not all-success, never above target, honest states.
import { describe, expect, it } from "vitest";
import { OPS_SIM_RATES, simState, simYear, simYears, unit } from "@/lib/opsSim";
import { buildScenarioPlan, FINANCIAL_MODEL, SCENARIO_YEARS } from "@/lib/scenario";

const plan = buildScenarioPlan();

describe("operational simulation", () => {
  it("is deterministic (same supplier, same answer)", () => {
    expect(unit("SCN-S0001", "reg")).toBe(unit("SCN-S0001", "reg"));
    expect(simState(plan.suppliers[5], 2028, 7)).toEqual(simState(plan.suppliers[5], 2028, 7));
  });
  it("realization is below target every year and targets are untouched", () => {
    for (const r of simYears(plan)) {
      expect(r.target).toBe(FINANCIAL_MODEL[r.year].payingSuppliers);
      expect(r.realized).toBeLessThan(r.target);
      expect(r.realized).toBeGreaterThan(r.target * 0.6);
      expect(r.csNeededRealized).toBeLessThanOrEqual(r.csNeededTarget);
    }
    expect(simYear(plan, 2031).target).toBe(880);
  });
  it("rates come out close to the illustrative parameters", () => {
    const s = plan.suppliers;
    expect(s.filter((x) => unit(x.supplierId, "reg") < OPS_SIM_RATES.registration).length / s.length).toBeCloseTo(0.95, 1);
    const trial = s.filter((x) => x.trialPlanned);
    const conv = trial.filter((x) => simState(x, x.cohortYear, 12)!.stage === "active_subscription").length / trial.length;
    expect(conv).toBeGreaterThan(0.65);
    expect(conv).toBeLessThan(0.85);
  });
  it("produces every kind of process outcome, not only success", () => {
    const stages = new Set<string>();
    let notReported = 0, help = 0;
    for (const y of SCENARIO_YEARS) for (const m of [2, 5, 12]) for (const x of plan.suppliers) {
      const st = simState(x, y, m);
      if (!st) continue;
      stages.add(st.stage);
      if (st.reported === false) notReported++;
      if (st.needsHelp) help++;
    }
    expect([...stages].sort()).toEqual(["active_subscription", "awaiting_activation", "expired", "onboarding", "renewal_due", "renewed", "trial"]);
    expect(notReported).toBeGreaterThan(0);
    expect(help).toBeGreaterThan(0);
  });
  it("states are coherent: nothing before cohort, expired stays expired, no report expected when inactive", () => {
    for (const x of plan.suppliers.slice(0, 200)) {
      expect(simState(x, x.cohortYear - 1, 6)).toBeNull();
      let wasExpired = false;
      for (const y of SCENARIO_YEARS.filter((yy) => yy >= x.cohortYear)) for (let m = 1; m <= 12; m++) {
        const st = simState(x, y, m)!;
        if (wasExpired) expect(st.stage).toBe("expired");
        if (st.stage === "expired") { wasExpired = true; expect(st.reported).toBeNull(); expect(st.needsHelp).toBe(false); }
        if (["onboarding", "awaiting_activation"].includes(st.stage)) expect(st.reported).toBeNull();
      }
    }
  });
});
