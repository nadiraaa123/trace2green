// Reporting periods are calendar months "YYYY-MM".
// Suppliers report LAST month's activity (proposal: data is filled on the 1st–7th),
// so the selectable window is the 12 full months before the reference month.
//
// The reference date defaults to today. For demos aligned with the simulated
// Jan–Mar 2027 dataset, set NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05.

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
  "Agustus", "September", "Oktober", "November", "Desember"];

export function referenceDate(env: string | undefined = process.env.NEXT_PUBLIC_REPORTING_REFERENCE_DATE): Date {
  if (env && /^\d{4}-\d{2}-\d{2}$/.test(env)) return new Date(`${env}T12:00:00Z`);
  return new Date();
}

export const toPeriod = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return toPeriod(d);
}

/** Most recent first: [last month, …, 12 months ago]. */
export function reportablePeriods(ref: Date = referenceDate(), count = 12): string[] {
  const current = toPeriod(ref);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -(i + 1)));
}

export const defaultPeriod = (ref: Date = referenceDate()) => reportablePeriods(ref)[0];

export function isReportable(period: string, ref: Date = referenceDate()) {
  return reportablePeriods(ref).includes(period);
}

export function formatPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
