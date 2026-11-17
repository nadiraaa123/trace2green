"use client";
import { Download, Printer } from "lucide-react";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { ColorPill, EmptyNote, Panel, ReportPill, ReviewPill, SourceBadge, fmt, pct, tco2 } from "@/components/company/ui";
import { Button } from "@/components/ui/Button";
import { rowsToCsv } from "@/lib/csv";
import { filterRows, kpis, SOURCE_LABEL } from "@/lib/kpi";
import { formatPeriod } from "@/lib/period";

export default function ReportsPage() {
  const c = useCompany();
  const rows = filterRows(c.current?.rows ?? [], c.source);
  const groups = kpis(c.current?.rows ?? [], c.source);
  const name = c.company?.name ?? c.companyId;

  function download() {
    const blob = new Blob([rowsToCsv(rows, c.period!, name)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trace2green_${c.companyId}_${c.period}_${c.source}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!c.current) return (<><PageTop title="Laporan" /><EmptyNote>Belum ada data.</EmptyNote></>);
  return (
    <>
      <PageTop title="Laporan" subtitle="Ringkasan data lingkungan pemasok untuk periode terpilih"
        actions={<>
          <Button variant="secondary" onClick={download} className="h-10" data-testid="csv-export"><Download className="size-4" /> Unduh CSV</Button>
          <Button variant="secondary" onClick={() => window.print()} className="h-10"><Printer className="size-4" /> Cetak</Button>
        </>} />
      <article className="space-y-5 print:space-y-3">
        <header className="hidden print:block">
          <h1 className="text-xl font-semibold">Ringkasan Data Lingkungan Pemasok — {name}</h1>
          <p className="text-sm">Periode {formatPeriod(c.period!)} · sumber: {c.source === "all" ? "Simulasi dan Trial (ditampilkan terpisah)" : SOURCE_LABEL[c.source]}</p>
        </header>
        <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Estimasi emisi memakai faktor ilustrasi (simulasi). Ringkasan ini adalah alat bantu pemantauan, <b>bukan sertifikasi akuntansi karbon dan bukan laporan resmi PSPK</b>.
          Data berlabel Simulasi adalah data contoh fiktif dari workbook. Verifikasi berlaku per perusahaan; bukti file tidak tersimpan dalam versi demo.
        </div>
        <Panel title={`Ringkasan ${formatPeriod(c.period!)}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="report-summary">
              <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Sumber</th><th className="py-2 pr-3 font-medium">Pemasok (izin data)</th><th className="py-2 pr-3 font-medium">Laporan masuk</th>
                <th className="py-2 pr-3 font-medium">Tingkat pelaporan</th><th className="py-2 pr-3 font-medium">Skor rata-rata (n)</th><th className="py-2 pr-3 font-medium">HIJAU / KUNING / MERAH / belum</th>
                <th className="py-2 pr-3 font-medium">Estimasi emisi</th><th className="py-2 pr-3 font-medium">Terverifikasi oleh Anda</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {groups.map((k) => (
                  <tr key={k.source}>
                    <td className="py-2.5 pr-3"><SourceBadge source={k.source} /></td>
                    <td className="py-2.5 pr-3">{k.consented} / {k.related}</td>
                    <td className="py-2.5 pr-3">{k.received}</td>
                    <td className="py-2.5 pr-3">{pct(k.completionRate)}</td>
                    <td className="py-2.5 pr-3">{k.avgScore == null ? "—" : fmt(k.avgScore, 1)} ({k.scored})</td>
                    <td className="py-2.5 pr-3">{k.colors.HIJAU} / {k.colors.KUNING} / {k.colors.MERAH} / {k.colors.none}</td>
                    <td className="py-2.5 pr-3">{tco2(k.emissions.totalKg)}{k.emissions.partial ? ` (${k.emissions.partial} sebagian)` : ""}</td>
                    <td className="py-2.5 pr-3">{k.source === "demo" ? "Tidak berlaku" : `${k.review.verified} dari ${k.received}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Rincian per Pemasok">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Pemasok</th><th className="py-2 pr-3 font-medium">Sumber</th><th className="py-2 pr-3 font-medium">Laporan</th><th className="py-2 pr-3 font-medium">Verifikasi Anda</th>
                <th className="py-2 pr-3 font-medium">Skor</th><th className="py-2 pr-3 font-medium">Kelengkapan</th><th className="py-2 pr-3 text-right font-medium">Emisi (kg CO₂e)</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.supplierId} className="break-inside-avoid">
                    <td className="py-2 pr-3">{r.name} <span className="text-xs text-navy-500">{r.supplierId}</span></td>
                    <td className="py-2 pr-3"><SourceBadge source={r.source} /></td>
                    <td className="py-2 pr-3"><ReportPill status={r.reportStatus} /></td>
                    <td className="py-2 pr-3"><ReviewPill status={r.reviewStatus} source={r.source} /></td>
                    <td className="py-2 pr-3"><span className="mr-1 font-semibold">{r.final ?? "—"}</span><ColorPill color={r.color} /></td>
                    <td className="py-2 pr-3">{pct(r.completeness)}</td>
                    <td className="py-2 pr-3 text-right">{r.totalKg == null ? "—" : fmt(r.totalKg)}{r.totalStatus === "partial" ? " (sebagian)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </article>
    </>
  );
}
