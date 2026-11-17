"use client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { clsx } from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, Panel, ReportPill, SourceBadge, fmt, pct } from "@/components/company/ui";
import { db } from "@/lib/firebase/client";
import { filterRows, kpis, SOURCE_LABEL, type RowReportStatus } from "@/lib/kpi";
import { formatPeriod } from "@/lib/period";
import type { ActivityData, MonthlyReportDoc } from "@/lib/types";

type Tab = "received" | "missing" | "draft" | "revision";
const TABS: { key: Tab; label: string; match: RowReportStatus[] }[] = [
  { key: "received", label: "Terkirim", match: ["submitted", "imported_simulated", "revision_requested"] },
  { key: "missing", label: "Belum mengirim", match: ["missing"] },
  { key: "draft", label: "Draf", match: ["draft"] },
  { key: "revision", label: "Perlu perbaikan", match: ["revision_requested"] },
];

/** Missing stays visibly missing; "tidak memakai" shows as 0 with a note. */
function cell(a: ActivityData, value: number | null, cat?: string) {
  if (cat && (a.notApplicable ?? []).includes(cat as never)) return <span className="text-navy-500" title="Dinyatakan tidak memakai">0*</span>;
  return value == null ? <span className="text-amber-700">kosong</span> : fmt(value, 1);
}

export default function DataCollectionPage() {
  const c = useCompany();
  const rows = filterRows(c.current?.rows ?? [], c.source);
  const [tab, setTab] = useState<Tab>("received");
  const [sector, setSector] = useState("");
  const [reports, setReports] = useState<MonthlyReportDoc[]>([]);
  const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort() as string[];

  // Bounded real-time query: only this month's reports shared with this company.
  useEffect(() => {
    if (!c.period) return;
    return onSnapshot(query(collection(db, "monthly_reports"), where("sharedWith", "array-contains", c.companyId), where("period", "==", c.period)),
      (s) => setReports(s.docs.map((d) => d.data() as MonthlyReportDoc)), () => setReports([]));
  }, [c.companyId, c.period]);

  const bySector = rows.filter((r) => !sector || r.sector === sector);
  const consented = bySector.filter((r) => r.consent);
  const list = consented.filter((r) => TABS.find((t) => t.key === tab)!.match.includes(r.reportStatus));
  const activity = reports
    .filter((r) => (c.source === "all" || (c.source === "demo" ? r.isSimulated : !r.isSimulated)) && (!sector || r.profile.sector === sector))
    .sort((a, b) => a.supplierId.localeCompare(b.supplierId));

  return (
    <>
      <PageTop title="Pengumpulan Data" subtitle="Progres pelaporan bulanan pemasok yang mengizinkan berbagi data"
        actions={<select aria-label="Sektor" value={sector} onChange={(e) => setSector(e.target.value)} className="h-10 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Semua sektor</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis(bySector, c.source).map((k) => (
          <Panel key={k.source} className="xl:col-span-2">
            <div className="flex items-center justify-between"><SourceBadge source={k.source} /><span className="text-sm text-navy-500">{c.period && formatPeriod(c.period)}</span></div>
            <p className="mt-3 text-3xl font-semibold" data-testid={`collection-rate-${k.source}`}>{pct(k.completionRate)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${(k.completionRate ?? 0) * 100}%`, background: k.source === "demo" ? "#6250d6" : "#eb6834" }} /></div>
            <p className="mt-3 text-sm text-navy-700">{k.received} terkirim · {k.missing} belum mengirim · {k.draft} draf · {k.revision} perlu perbaikan</p>
            <p className="text-xs text-navy-500">dari {k.consented} pemasok {SOURCE_LABEL[k.source].toLowerCase()} yang mengizinkan berbagi data</p>
          </Panel>
        ))}
      </div>

      <Panel className="mt-5">
        <div role="tablist" className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const n = consented.filter((r) => t.match.includes(r.reportStatus)).length;
            return (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={clsx("rounded-full border px-3 py-1.5 text-sm font-medium", tab === t.key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-navy-700")}>
                {t.label} <span className="ml-1 text-xs">{n}</span>
              </button>
            );
          })}
        </div>
        {tab === "draft" && <p className="mb-3 text-xs text-navy-500">Hanya keberadaan draf yang terlihat; isi draf tidak dibagikan ke perusahaan.</p>}
        {list.length === 0 ? <EmptyNote>Tidak ada pemasok pada status ini.</EmptyNote> : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => (
              <li key={r.supplierId}>
                <Link href={`/c/pemasok/${r.supplierId}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 hover:border-brand-200">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.name}</span><span className="text-xs text-navy-500">{r.supplierId} · {r.sector ?? "—"}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><SourceBadge source={r.source} /><ReportPill status={r.reportStatus} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Data Aktivitas Lingkungan" subtitle={`${c.period ? formatPeriod(c.period) : ""} · laporan yang dibagikan ke perusahaan Anda`} className="mt-5">
        {activity.length === 0 ? <EmptyNote>Belum ada laporan pada periode ini.</EmptyNote> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm" data-testid="activity-table">
              <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Pemasok</th><th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">Listrik (kWh)</th><th className="py-2 pr-3 text-right font-medium">BBM/LPG</th>
                <th className="py-2 pr-3 text-right font-medium">Produksi</th><th className="py-2 pr-3 text-right font-medium">Kemasan (kg)</th>
                <th className="py-2 pr-3 text-right font-medium">Limbah (kg)</th><th className="py-2 pr-3 font-medium">Pengiriman</th><th className="py-2 pr-3 font-medium">Bahan baku</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {activity.map((r) => {
                  const a = r.activity;
                  return (
                    <tr key={r.reportId}>
                      <td className="py-2 pr-3"><span className="font-medium">{r.profile.businessName ?? r.supplierId}</span> <span className="text-xs text-navy-500">{r.supplierId}</span> <SourceBadge source={r.isSimulated ? "demo" : "trial"} /></td>
                      <td className="py-2 pr-3"><ReportPill status={r.status as RowReportStatus} /></td>
                      <td className="py-2 pr-3 text-right">{cell(a, a.electricityKwh, "listrik")}</td>
                      <td className="py-2 pr-3 text-right">{cell(a, a.fuelQuantity, "bbm")} {a.fuelQuantity != null && <span className="text-xs text-navy-500">{a.fuelUnit}{a.fuelType ? ` ${a.fuelType}` : ""}</span>}</td>
                      <td className="py-2 pr-3 text-right">{cell(a, r.profile.productionVolume)} <span className="text-xs text-navy-500">{r.profile.productionUnit ?? ""}</span></td>
                      <td className="py-2 pr-3 text-right">{cell(a, a.packagingKg, "kemasan")}</td>
                      <td className="py-2 pr-3 text-right">{cell(a, a.wasteKg, "limbah")}</td>
                      <td className="py-2 pr-3">{(a.notApplicable ?? []).includes("transportasi") ? "Tidak ada" : <>{a.transportMode ?? <span className="text-amber-700">kosong</span>} · {cell(a, a.transportKm)} km</>}</td>
                      <td className="py-2 pr-3">{a.rawMaterialOrigin ?? <span className="text-amber-700">kosong</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-navy-500"><span className="text-amber-700">kosong</span> = belum diisi (tidak dihitung nol) · 0* = pemasok menyatakan tidak memakai (aktivitas nol).</p>
      </Panel>
    </>
  );
}
