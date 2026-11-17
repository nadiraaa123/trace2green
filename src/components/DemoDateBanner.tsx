import { formatPeriod, referenceDate, toPeriod } from "@/lib/period";

/** Visible whenever the demo reference date override is active, so it is never silent. */
export function DemoDateBanner() {
  const v = process.env.NEXT_PUBLIC_REPORTING_REFERENCE_DATE;
  if (!v) return null;
  const d = referenceDate(v);
  return (
    <div role="note" className="mb-4 rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800">
      Mode demo: tanggal acuan {d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
      {" "}(periode laporan terakhir {formatPeriod(toPeriod(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))))}). Jam sistem tidak diubah.
    </div>
  );
}
