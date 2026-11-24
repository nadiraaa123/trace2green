// Operational supplier/company lifecycle (pure). Applies to ACTUAL records only;
// the 2027–2031 scenario uses projections in ./scenario.ts and never these statuses.

export const LIFECYCLE_STAGES = [
  "onboarding", "trial", "awaiting_activation", "active_subscription", "renewal_due", "renewed", "expired",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  onboarding: "Onboarding",
  trial: "Trial Berlangsung",
  awaiting_activation: "Menunggu Aktivasi",
  active_subscription: "Aktif",
  renewal_due: "Jatuh Tempo Perpanjangan",
  renewed: "Diperpanjang",
  expired: "Kedaluwarsa / Tidak Aktif",
};

/** Paid states: can only be entered with a recorded confirmation (never inferred from targets). */
export const NEEDS_CONFIRMATION: LifecycleStage[] = ["active_subscription", "renewed"];

const NEXT: Record<LifecycleStage, LifecycleStage[]> = {
  onboarding: ["trial", "awaiting_activation", "expired"],
  trial: ["awaiting_activation", "active_subscription", "expired"],
  awaiting_activation: ["active_subscription", "expired"],
  active_subscription: ["renewal_due", "expired"],
  renewal_due: ["renewed", "expired"],
  renewed: ["renewal_due", "expired"],
  expired: ["onboarding"],
};

export const canTransition = (from: LifecycleStage, to: LifecycleStage) => NEXT[from].includes(to);

/** Who may move a record to `to`: Platform Admin always; CS only for non-paid, non-terminal steps. */
export function roleMayTransition(role: "platform_admin" | "customer_success", to: LifecycleStage) {
  if (role === "platform_admin") return true;
  return !NEEDS_CONFIRMATION.includes(to) && to !== "expired";
}

/** Trial window for a trial year: 1 Jan – 31 Mar (inclusive), as YYYY-MM-DD. */
export const trialWindow = (year: number) => ({ start: `${year}-01-01`, end: `${year}-03-31` });

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
