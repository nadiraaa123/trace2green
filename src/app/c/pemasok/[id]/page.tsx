"use client";
import { ArrowLeft, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company/CompanyContext";
import { TrendChart } from "@/components/company/charts";
import { ColorPill, EmptyNote, MethodBadges, Panel, ReportPill, ReviewPill, SourceBadge, fmt, pct } from "@/components/company/ui";
import { formatPeriod, shortPeriod } from "@/lib/period";
import type { SupplierDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";

const EVIDENCE = { match: "Cocok", mismatch: "Tidak cocok", unverifiable: "Belum dapat diverifikasi" } as const;

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const c = useCompany();
  const { data: s } = useDoc<SupplierDoc>(`suppliers/${id}`);
  // History comes from the company's own summaries — already authorized and real-time.
  const history = c.periods.map((p) => ({ period: p.period, row: p.rows.find((r) => r.supplierId === id) })).filter((h) => h.row);
  const latest = history.at(-1)?.row;
  const source = latest?.source ?? "demo";

  if (!c.loading && !latest) {
    return (<><Link href="/c/pemasok" className="inline-flex items-center gap-1 text-sm text-navy-500"><ArrowLeft className="size-4" /> Pemasok</Link>
      <div className="mt-4"><EmptyNote>Pemasok ini tidak terhubung dengan perusahaan Anda.</EmptyNote></div></>);
  }
  const scoreTrend = history.map((h) => ({ label: shortPeriod(h.period), [source]: h.row!.final }));
  const emissionTrend = history.map((h) => ({ label: shortPeriod(h.period), [source]: h.row!.totalKg == null ? null : Math.round(h.row!.totalKg) }));

  return (
    <>
      <Link href="/c/pemasok" className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-900"><ArrowLeft className="size-4" /> Pemasok</Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{s?.businessName ?? latest?.name}</h1>
        {latest && <SourceBadge source={latest.source} />}
        {latest?.critical && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-risk">Pemasok kritis</span>}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Profil">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-navy-500">ID Pemasok</dt><dd className="font-mono">{id}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-1 text-navy-500"><Store className="size-3.5" /> Sektor</dt><dd>{s?.sector ?? latest?.sector ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-1 text-navy-500"><MapPin className="size-3.5" /> Wilayah</dt><dd>{s?.region ?? latest?.region ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">Produk utama</dt><dd>{s?.mainProduct ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">Izin berbagi data</dt><dd>{latest?.consent ? "Diberikan" : "Belum"}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">Akun</dt><dd>{s?.claimStatus === "unclaimed" ? "Belum diklaim" : s?.claimStatus === "claimed" ? "Diklaim pemasok" : s ? "Terdaftar mandiri" : "—"}</dd></div>
          </dl>
        </Panel>
        <Panel title="Riwayat Skor" subtitle={source === "demo" ? "Skor workbook simulasi" : "Hanya bulan dengan skor akhir lengkap"} className="lg:col-span-2">
          {history.some((h) => h.row!.final != null) ? <TrendChart data={scoreTrend} sources={[source]} unit="" /> : <EmptyNote>Belum ada skor akhir.</EmptyNote>}
        </Panel>
      </div>
      <Panel title="Riwayat Pelaporan & Kinerja Lingkungan" className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Periode</th><th className="py-2 pr-3 font-medium">Laporan</th><th className="py-2 pr-3 font-medium">Verifikasi Anda</th>
              <th className="py-2 pr-3 font-medium">Skor</th><th className="py-2 pr-3 font-medium">Kelengkapan</th><th className="py-2 pr-3 font-medium">Bukti</th>
              <th className="py-2 pr-3 text-right font-medium">Listrik (kWh)</th><th className="py-2 pr-3 text-right font-medium">Emisi (kg CO₂e)</th><th />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {[...history].reverse().map(({ period, row: r }) => (
                <tr key={period}>
                  <td className="py-2.5 pr-3 font-medium">{formatPeriod(period)}</td>
                  <td className="py-2.5 pr-3"><ReportPill status={r!.reportStatus} /></td>
                  <td className="py-2.5 pr-3"><ReviewPill status={r!.reviewStatus} source={r!.source} /></td>
                  <td className="py-2.5 pr-3"><span className="mr-2 font-semibold">{r!.final ?? "—"}</span><ColorPill color={r!.color} /></td>
                  <td className="py-2.5 pr-3">{pct(r!.completeness)}</td>
                  <td className="py-2.5 pr-3">{r!.evidence ? EVIDENCE[r!.evidence] : "—"}</td>
                  <td className="py-2.5 pr-3 text-right">{fmt(r!.kwh)}</td>
                  <td className="py-2.5 pr-3 text-right">{r!.totalKg == null ? "—" : fmt(r!.totalKg)}{r!.blankAsZero.length > 0 && <span className="ml-1 text-[11px] text-violet-700" title={`Sel kosong dihitung 0 oleh workbook: ${r!.blankAsZero.join(", ")}`}>*</span>}{r!.totalStatus === "partial" && <span className="ml-1 text-xs text-amber-700">(sebagian)</span>}</td>
                  <td className="space-x-3 py-2.5 text-right whitespace-nowrap">
                    {["submitted", "revision_requested", "imported_simulated"].includes(r!.reportStatus) && <Link href={`/c/pemasok/${id}/${period}`} className="text-xs font-medium text-brand-600">Rincian skor</Link>}
                    {r!.source === "trial" && ["submitted", "revision_requested"].includes(r!.reportStatus) && <Link href={`/c/verifikasi/${id}_${period}`} className="text-xs font-medium text-brand-600">Tinjau</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-navy-500">* sel kosong yang dihitung 0 oleh workbook simulasi (nilai asli dipertahankan).</p>
      </Panel>
      <Panel title="Tren Estimasi Emisi" subtitle="kg CO₂e per bulan" className="mt-5">
        {history.some((h) => h.row!.totalKg != null) ? <TrendChart data={emissionTrend} sources={[source]} unit="kg" /> : <EmptyNote>Belum ada estimasi emisi.</EmptyNote>}
        <MethodBadges />
      </Panel>
    </>
  );
}
