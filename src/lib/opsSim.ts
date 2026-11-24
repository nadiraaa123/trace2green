// Operational SIMULATION for the 2027–2031 scenario (pure, deterministic, no I/O).
//
// The financial model assumes 100% conversion and 0% churn. This layer shows what a CS
// portfolio realistically looks like when not every step succeeds, using ILLUSTRATIVE rates
// (not measured data). Each supplier's outcome is derived from a hash of its ID, so the same
// supplier always shows the same history — nothing is stored, nothing is random per page load.
// Realized numbers are compared with the model's TARGETS, never substituted for them.
import { CS_CAPACITY, FINANCIAL_MODEL, SCENARIO_YEARS, type ScenarioPlan, type ScenarioSupplier, type ScenarioYear } from "./scenario";
import type { LifecycleStage } from "./lifecycle";

/** Illustrative rates — change here only. Shown in the UI as "angka ilustrasi". */
export const OPS_SIM_RATES = {
  registration: 0.95, // supplier creates its account during onboarding
  trialToPaid: 0.8, // trial supplier converts in April
  activationOnTime: 0.85, // awaiting-activation supplier activates in April
  activationLate: 0.07, // …activates late (June); the rest never activates
  monthlyReporting: 0.75, // active supplier submits its monthly report on time
  needsHelp: 0.15, // supplier-month flagged for CS assistance
  renewal: 0.9, // paying supplier renews each year
} as const;

export const OPS_SIM_RATE_LABEL: Record<keyof typeof OPS_SIM_RATES, string> = {
  registration: "Pemasok menyelesaikan pendaftaran akun",
  trialToPaid: "Trial → berlangganan (April)",
  activationOnTime: "Aktivasi tepat waktu (April)",
  activationLate: "Aktivasi terlambat (Juni)",
  monthlyReporting: "Laporan bulanan tepat waktu",
  needsHelp: "Perlu bantuan CS per bulan",
  renewal: "Perpanjangan tahunan",
};

/** FNV-1a → [0,1). Deterministic per supplier and key. */
export function unit(supplierId: string, key: string): number {
  let h = 0x811c9dc5;
  const s = `${supplierId}|${key}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 0x100000000;
}

export interface SimState {
  stage: LifecycleStage;
  registered: boolean;
  /** null when no report is expected this month (onboarding, awaiting activation, expired). */
  reported: boolean | null;
  needsHelp: boolean;
  note: string;
  renewalDate: string | null;
}

const REPORTING: LifecycleStage[] = ["trial", "active_subscription", "renewal_due", "renewed"];
type S = Pick<ScenarioSupplier, "supplierId" | "cohortYear" | "trialPlanned">;

function stageOf(s: S, year: number, month: number): { stage: LifecycleStage; note: string; renewalDate: string | null } | null {
  if (year < s.cohortYear) return null;
  const R = OPS_SIM_RATES;
  const registered = unit(s.supplierId, "reg") < R.registration;
  if (year === s.cohortYear) {
    const q1 = month <= 3;
    if (!registered) return q1
      ? { stage: "onboarding", note: "Belum menyelesaikan pendaftaran akun", renewalDate: null }
      : { stage: "expired", note: "Tidak pernah aktif (pendaftaran tidak selesai)", renewalDate: null };
    const renewal = `${year + 1}-03-31`;
    if (s.trialPlanned) {
      if (q1) return { stage: "trial", note: "Trial berjalan (Jan–Mar)", renewalDate: null };
      return unit(s.supplierId, "trial") < R.trialToPaid
        ? { stage: "active_subscription", note: "Trial berhasil → berlangganan sejak April", renewalDate: renewal }
        : { stage: "expired", note: "Trial tidak dilanjutkan", renewalDate: null };
    }
    const a = unit(s.supplierId, "act");
    if (q1) return { stage: "awaiting_activation", note: "Menunggu aktivasi April", renewalDate: null };
    if (a < R.activationOnTime) return { stage: "active_subscription", note: "Aktif sejak April", renewalDate: renewal };
    if (a < R.activationOnTime + R.activationLate) return month < 6
      ? { stage: "awaiting_activation", note: "Aktivasi tertunda", renewalDate: null }
      : { stage: "active_subscription", note: "Aktif sejak Juni (terlambat)", renewalDate: renewal };
    return { stage: "expired", note: "Batal aktivasi", renewalDate: null };
  }
  const prev = stageOf(s, year - 1, 12)!;
  if (prev.stage !== "active_subscription" && prev.stage !== "renewed") return { stage: "expired", note: prev.note, renewalDate: null };
  if (month <= 3) return { stage: "renewal_due", note: `Kontrak berakhir 31 Mar ${year}`, renewalDate: `${year}-03-31` };
  return unit(s.supplierId, `renew${year}`) < OPS_SIM_RATES.renewal
    ? { stage: "renewed", note: `Diperpanjang April ${year}`, renewalDate: `${year + 1}-03-31` }
    : { stage: "expired", note: `Tidak memperpanjang (${year})`, renewalDate: null };
}

/** Simulated state of one scenario supplier in a month; null before its cohort year. */
export function simState(s: S, year: number, month: number): SimState | null {
  const st = stageOf(s, year, month);
  if (!st) return null;
  const registered = unit(s.supplierId, "reg") < OPS_SIM_RATES.registration;
  const reports = REPORTING.includes(st.stage);
  const reported = reports ? unit(s.supplierId, `rep${year}-${month}`) < OPS_SIM_RATES.monthlyReporting : null;
  const needsHelp = st.stage !== "expired" && (!registered || unit(s.supplierId, `help${year}-${month}`) < OPS_SIM_RATES.needsHelp);
  return { ...st, registered, reported, needsHelp };
}

/** Suggested CS follow-up for a simulated state (rule-based, no AI). */
export function simFollowUp(st: SimState): string | null {
  if (!st.registered && st.stage === "onboarding") return "Bantu pemasok menyelesaikan pendaftaran akun.";
  if (st.stage === "awaiting_activation") return "Konfirmasi jadwal aktivasi dengan perusahaan dan pemasok.";
  if (st.stage === "renewal_due") return "Siapkan perpanjangan kontrak sebelum 31 Maret.";
  if (st.reported === false) return "Ingatkan pemasok mengirim laporan bulan ini.";
  if (st.needsHelp) return "Jadwalkan pendampingan pengisian data.";
  return null;
}

const ACTIVE: LifecycleStage[] = ["active_subscription", "renewed"];

/** Target (financial model) vs simulated realization for one year, measured in December. */
export function simYear(plan: ScenarioPlan, year: ScenarioYear) {
  const states = plan.suppliers.map((s) => ({ s, st: simState(s, year, 12) })).filter((x) => x.st);
  const fresh = states.filter((x) => x.s.cohortYear === year);
  const trial = fresh.filter((x) => x.s.trialPlanned);
  const realized = states.filter((x) => ACTIVE.includes(x.st!.stage)).length;
  const target = FINANCIAL_MODEL[year].payingSuppliers;
  return {
    year, target, realized, gap: target - realized,
    trialStarted: trial.length,
    trialConverted: trial.filter((x) => ACTIVE.includes(x.st!.stage)).length,
    churned: states.filter((x) => x.st!.stage === "expired").length,
    csNeededTarget: Math.ceil(target / CS_CAPACITY),
    csNeededRealized: Math.ceil(realized / CS_CAPACITY),
  };
}
export const simYears = (plan: ScenarioPlan) => SCENARIO_YEARS.map((y) => simYear(plan, y));
