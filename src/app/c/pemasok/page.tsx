"use client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { ColorPill, EmptyNote, Panel, ReportPill, ReviewPill, SourceBadge, fmt } from "@/components/company/ui";
import { filterRows, type RowReportStatus } from "@/lib/kpi";
import { formatPeriod } from "@/lib/period";

const PAGE = 10;

export default function SuppliersPage() {
  const c = useCompany();
  const rows = filterRows(c.current?.rows ?? [], c.source);
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [region, setRegion] = useState("");
  const [color, setColor] = useState("");
  const [status, setStatus] = useState<"" | RowReportStatus>("");
  const [page, setPage] = useState(0);
  const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort() as string[];
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))].sort() as string[];

  const shown = rows.filter((r) =>
    (!q || `${r.name} ${r.supplierId}`.toLowerCase().includes(q.toLowerCase())) &&
    (!sector || r.sector === sector) && (!region || r.region === region) &&
    (!color || (color === "none" ? r.color == null : r.color === color)) && (!status || r.reportStatus === status));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = shown.slice(p * PAGE, p * PAGE + PAGE);
  const sel = "h-10 rounded-xl border border-line bg-white px-3 text-sm";
  const reset = (f: () => void) => { f(); setPage(0); };

  return (
    <>
      <PageTop title="Pemasok" subtitle={`Pemasok yang terhubung dengan perusahaan Anda · status ${c.period ? formatPeriod(c.period) : ""}`} />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <label className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-300" />
            <span className="sr-only">Cari pemasok</span>
            <input value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="Cari nama atau ID pemasok" className="h-10 w-full rounded-xl border border-line pl-9 pr-3 text-sm outline-none focus:border-brand-500" />
          </label>
          <select aria-label="Sektor" value={sector} onChange={(e) => reset(() => setSector(e.target.value))} className={sel}><option value="">Semua sektor</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
          <select aria-label="Wilayah" value={region} onChange={(e) => reset(() => setRegion(e.target.value))} className={sel}><option value="">Semua wilayah</option>{regions.map((s) => <option key={s}>{s}</option>)}</select>
          <select aria-label="Status skor" value={color} onChange={(e) => reset(() => setColor(e.target.value))} className={sel}>
            <option value="">Semua status skor</option><option value="HIJAU">HIJAU</option><option value="KUNING">KUNING</option><option value="MERAH">MERAH</option><option value="none">Belum Dinilai</option>
          </select>
          <select aria-label="Status laporan" value={status} onChange={(e) => reset(() => setStatus(e.target.value as RowReportStatus | ""))} className={sel}>
            <option value="">Semua status laporan</option><option value="imported_simulated">Data simulasi</option><option value="submitted">Terkirim</option>
            <option value="revision_requested">Perlu perbaikan</option><option value="draft">Draf</option><option value="missing">Belum mengirim</option><option value="no_consent">Belum izin data</option>
          </select>
        </div>
        {shown.length === 0 ? <EmptyNote>Tidak ada pemasok yang cocok dengan filter.</EmptyNote> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm" data-testid="supplier-table">
              <thead className="text-left text-xs text-navy-500">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Pemasok</th><th className="py-2 pr-3 font-medium">Sumber</th><th className="py-2 pr-3 font-medium">Sektor</th>
                  <th className="py-2 pr-3 font-medium">Wilayah</th><th className="py-2 pr-3 font-medium">Laporan</th><th className="py-2 pr-3 font-medium">Skor</th>
                  <th className="py-2 pr-3 font-medium">Verifikasi Anda</th><th className="py-2 pr-3 text-right font-medium">Emisi (kg CO₂e)</th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice.map((r) => (
                  <tr key={r.supplierId} className="hover:bg-surface/60">
                    <td className="py-2.5 pr-3"><p className="font-medium">{r.name}{r.critical && <span className="ml-1.5 rounded bg-red-50 px-1 text-[10px] font-semibold text-risk">KRITIS</span>}</p><p className="text-xs text-navy-500">{r.supplierId}</p></td>
                    <td className="py-2.5 pr-3"><SourceBadge source={r.source} /></td>
                    <td className="py-2.5 pr-3">{r.sector ?? "—"}</td>
                    <td className="py-2.5 pr-3">{r.region ?? "—"}</td>
                    <td className="py-2.5 pr-3"><ReportPill status={r.reportStatus} /></td>
                    <td className="py-2.5 pr-3"><span className="mr-2 font-semibold">{r.final ?? "—"}</span><ColorPill color={r.color} /></td>
                    <td className="py-2.5 pr-3"><ReviewPill status={r.reviewStatus} source={r.source} /></td>
                    <td className="py-2.5 pr-3 text-right">{r.totalKg == null ? "—" : fmt(r.totalKg)}{r.totalStatus === "partial" && <span className="ml-1 text-xs text-amber-700">(sebagian)</span>}</td>
                    <td className="py-2.5 text-right"><Link href={`/c/pemasok/${r.supplierId}`} className="inline-flex items-center text-brand-600" aria-label={`Profil ${r.name}`}><ChevronRight className="size-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-navy-500">
          <span>{shown.length} pemasok · halaman {p + 1} dari {pages}</span>
          <div className="flex gap-2">
            <button disabled={p === 0} onClick={() => setPage(p - 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40" aria-label="Halaman sebelumnya"><ChevronLeft className="size-4" /></button>
            <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40" aria-label="Halaman berikutnya"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </Panel>
    </>
  );
}
