// 2027–2031 financial growth scenario (pure, no I/O).
//
// These are PROJECTED BUSINESS TARGETS, not customers, payments or contracts.
// The table is copied verbatim from the financial model; everything else here is
// derived from it and checked against it (tests/scenario.test.ts). The scenario is a
// separate layer: it never touches the analytical workbook dataset (SUP-001…100,
// CMP-A/CMP-B) or live registrations (SUP-101+ from the counter).

export const SCENARIO_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
export type ScenarioYear = (typeof SCENARIO_YEARS)[number];

export interface FinancialYear {
  totalCompanies: number;
  newCompanies: number;
  renewingCompanies: number;
  existingSuppliers: number;
  newSuppliers: number;
  suppliersPerNewCompany: number;
  trialSuppliers: number; // Jan–Mar
  awaitingActivation: number;
  payingSuppliers: number; // Apr–Dec
}

/** The financial model, exactly as provided. */
export const FINANCIAL_MODEL: Record<ScenarioYear, FinancialYear> = {
  2027: { totalCompanies: 2, newCompanies: 2, renewingCompanies: 0, existingSuppliers: 0, newSuppliers: 40, suppliersPerNewCompany: 20, trialSuppliers: 20, awaitingActivation: 20, payingSuppliers: 40 },
  2028: { totalCompanies: 4, newCompanies: 2, renewingCompanies: 2, existingSuppliers: 40, newSuppliers: 100, suppliersPerNewCompany: 50, trialSuppliers: 20, awaitingActivation: 80, payingSuppliers: 140 },
  2029: { totalCompanies: 7, newCompanies: 3, renewingCompanies: 4, existingSuppliers: 140, newSuppliers: 150, suppliersPerNewCompany: 50, trialSuppliers: 30, awaitingActivation: 120, payingSuppliers: 290 },
  2030: { totalCompanies: 11, newCompanies: 4, renewingCompanies: 7, existingSuppliers: 290, newSuppliers: 240, suppliersPerNewCompany: 60, trialSuppliers: 40, awaitingActivation: 200, payingSuppliers: 530 },
  2031: { totalCompanies: 16, newCompanies: 5, renewingCompanies: 11, existingSuppliers: 530, newSuppliers: 350, suppliersPerNewCompany: 70, trialSuppliers: 50, awaitingActivation: 300, payingSuppliers: 880 },
};

export const CS_CAPACITY = 70; // max unique suppliers per Customer Success
export const TRIAL_QUOTA_PER_NEW_COMPANY = 10; // unique suppliers per new company, whole trial (not per month)
export const TRIAL_MONTHS = [1, 2, 3] as const; // January–March

/** Implicit assumptions of the model — stated, not hidden. */
export const MODEL_ASSUMPTIONS = [
  "100% pemasok trial dan menunggu aktivasi menjadi berbayar mulai April.",
  "100% pemasok dan perusahaan memperpanjang setiap tahun (tanpa churn).",
  "Perusahaan yang memperpanjang tidak menambah pemasok baru; pemasok baru hanya dari perusahaan baru.",
  "Kebutuhan CS dihitung dari kapasitas 70 pemasok per CS (pembulatan ke atas).",
];

/** Minimum CS needed for a supplier count (capacity-based). */
export const minCs = (suppliers: number) => Math.ceil(suppliers / CS_CAPACITY);

/** Identities the table must satisfy; returns human-readable violations (empty = consistent). */
export function checkFinancialModel(model: Record<ScenarioYear, FinancialYear> = FINANCIAL_MODEL): string[] {
  const out: string[] = [];
  SCENARIO_YEARS.forEach((y, i) => {
    const m = model[y];
    const prev = i ? model[SCENARIO_YEARS[i - 1]] : null;
    const eq = (label: string, a: number, b: number) => { if (a !== b) out.push(`${y}: ${label} (${a} ≠ ${b})`); };
    eq("total = baru + perpanjang", m.totalCompanies, m.newCompanies + m.renewingCompanies);
    eq("perpanjang = total tahun lalu", m.renewingCompanies, prev?.totalCompanies ?? 0);
    eq("existing = berbayar tahun lalu", m.existingSuppliers, prev?.payingSuppliers ?? 0);
    eq("pemasok baru = perusahaan baru × pemasok/perusahaan", m.newSuppliers, m.newCompanies * m.suppliersPerNewCompany);
    eq("trial = perusahaan baru × kuota trial", m.trialSuppliers, m.newCompanies * TRIAL_QUOTA_PER_NEW_COMPANY);
    eq("menunggu aktivasi = baru − trial", m.awaitingActivation, m.newSuppliers - m.trialSuppliers);
    eq("berbayar = existing + baru", m.payingSuppliers, m.existingSuppliers + m.newSuppliers);
  });
  return out;
}

// ---------- deterministic scenario plan ----------

export interface ScenarioCompany { companyId: string; name: string; cohortYear: ScenarioYear; plannedSuppliers: number; trialQuota: number }
export interface ScenarioSupplier {
  supplierId: string; name: string; companyId: string; companyName: string;
  cohortYear: ScenarioYear; trialPlanned: boolean; csId: string;
}
export interface ScenarioCs { csId: string; name: string; email: string; projectedStartYear: ScenarioYear }
export interface ScenarioPlan { companies: ScenarioCompany[]; suppliers: ScenarioSupplier[]; cs: ScenarioCs[] }

const pad = (n: number, w: number) => String(n).padStart(w, "0");
/** IDs are distinct from SUP-### (workbook + live registrations) and CMP-* (real/demo companies). */
export const scenarioCompanyId = (n: number) => `SCN-C${pad(n, 2)}`;
export const scenarioSupplierId = (n: number) => `SCN-S${pad(n, 4)}`;
/** Scenario CS IDs are namespaced (CS-S01…) so they never collide with real CS staff (CS-001…). */
export const scenarioCsId = (n: number) => `CS-S${pad(n, 2)}`;
export const SCENARIO_CS_EMAIL_DOMAIN = "scenario.trace2green.test";

/**
 * Companies by cohort; each new company gets `suppliersPerNewCompany` suppliers, of which
 * the first 10 are planned trial suppliers and the rest await activation. CS are filled
 * sequentially in cohort order (max 70 each), so the CS count each year is exactly minCs.
 */
export function buildScenarioPlan(model: Record<ScenarioYear, FinancialYear> = FINANCIAL_MODEL): ScenarioPlan {
  const companies: ScenarioCompany[] = [];
  const suppliers: ScenarioSupplier[] = [];
  const cs: ScenarioCs[] = [];
  let c = 0;
  let s = 0;
  for (const year of SCENARIO_YEARS) {
    const m = model[year];
    for (let i = 0; i < m.newCompanies; i++) {
      const companyId = scenarioCompanyId(++c);
      const name = `Perusahaan Skenario ${pad(c, 2)}`;
      companies.push({ companyId, name, cohortYear: year, plannedSuppliers: m.suppliersPerNewCompany, trialQuota: TRIAL_QUOTA_PER_NEW_COMPANY });
      for (let k = 0; k < m.suppliersPerNewCompany; k++) {
        const idx = s++; // 0-based global order → CS index
        const csNo = Math.floor(idx / CS_CAPACITY) + 1;
        if (csNo > cs.length) {
          cs.push({ csId: scenarioCsId(csNo), name: `CS Skenario ${pad(csNo, 2)}`, email: `cs${pad(csNo, 2)}@${SCENARIO_CS_EMAIL_DOMAIN}`, projectedStartYear: year });
        }
        suppliers.push({
          supplierId: scenarioSupplierId(idx + 1), name: `UMKM Skenario ${pad(idx + 1, 4)}`, companyId, companyName: name,
          cohortYear: year, trialPlanned: k < TRIAL_QUOTA_PER_NEW_COMPANY, csId: scenarioCsId(csNo),
        });
      }
    }
  }
  return { companies, suppliers, cs };
}

// ---------- projections (never operational status) ----------

export type ProjectedStage = "trial" | "awaiting_activation" | "active_subscription" | "renewal_due" | "renewed";

/** Projected stage of a scenario supplier in a given month; null before its cohort year. */
export function projectedStage(s: Pick<ScenarioSupplier, "cohortYear" | "trialPlanned">, year: number, month: number): ProjectedStage | null {
  if (year < s.cohortYear) return null;
  const q1 = month <= 3;
  if (year === s.cohortYear) return q1 ? (s.trialPlanned ? "trial" : "awaiting_activation") : "active_subscription";
  return q1 ? "renewal_due" : "renewed";
}

/** Counts reproduced from the plan for one year (tests compare these to FINANCIAL_MODEL). */
export function planCounts(plan: ScenarioPlan, year: ScenarioYear) {
  const inYear = plan.suppliers.filter((x) => x.cohortYear <= year);
  const fresh = inYear.filter((x) => x.cohortYear === year);
  const companies = plan.companies.filter((x) => x.cohortYear <= year);
  const perCs = new Map<string, number>();
  for (const x of inYear) perCs.set(x.csId, (perCs.get(x.csId) ?? 0) + 1);
  const load = [...perCs.values()];
  return {
    totalCompanies: companies.length,
    newCompanies: companies.filter((x) => x.cohortYear === year).length,
    renewingCompanies: companies.filter((x) => x.cohortYear < year).length,
    existingSuppliers: inYear.length - fresh.length,
    newSuppliers: fresh.length,
    trialSuppliers: fresh.filter((x) => x.trialPlanned).length,
    awaitingActivation: fresh.filter((x) => !x.trialPlanned).length,
    payingSuppliers: inYear.length,
    csNeeded: perCs.size,
    csCapacity: perCs.size * CS_CAPACITY,
    csRemaining: perCs.size * CS_CAPACITY - inYear.length,
    maxLoad: load.length ? Math.max(...load) : 0,
    trialPerCompanyMax: Math.max(0, ...plan.companies.filter((x) => x.cohortYear === year)
      .map((co) => fresh.filter((x) => x.companyId === co.companyId && x.trialPlanned).length)),
  };
}

export const PROJECTED_STAGE_LABEL: Record<ProjectedStage, string> = {
  trial: "Trial (proyeksi)",
  awaiting_activation: "Menunggu Aktivasi (proyeksi)",
  active_subscription: "Berlangganan (proyeksi)",
  renewal_due: "Jatuh Tempo Perpanjangan (proyeksi)",
  renewed: "Diperpanjang (proyeksi)",
};
