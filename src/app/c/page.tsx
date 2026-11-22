"use client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AlertTriangle, ChevronRight, ClipboardCheck, Cloud, FileText, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompany } from "@/components/company/CompanyContext";
import { EmissionBars, ScoreDonut, TrendChart } from "@/components/company/charts";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, Panel, ReportPill, SimTag, StatCard, fmt } from "@/components/company/ui";
import { db } from "@/lib/firebase/client";
import { attentionReasons, combinedCompletionTrend, combinedKpis } from "@/lib/kpi";
import { formatPeriod, shortPeriod } from "@/lib/period";
import { formatDateTime } from "@/lib/supplier-data";

interface Submission { reportId: string; supplierId: string; action: string; createdAt: unknown }

export default function OverviewPage() {
  const c = useCompany();
  const rows = c.current?.rows ?? [];
  const k = combinedKpis(rows);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Real-time, bounded: latest reports submitted through the app and shared with this company.
  useEffect(() => onSnapshot(
    query(collection(db, "verification_records"), where("sharedWith", "array-contains", c.companyId), where("action", "in", ["submitted", "resubmitted"]), orderBy("createdAt", "desc"), limit(6)),
    (s) => setSubmissions(s.docs.map((d) => d.data() as Submission)), () => setSubmissions([]),
  ), [c.companyId]);

  const trendValues = combinedCompletionTrend(c.periods);
  const trend = c.periods.map((p, i) => ({ label: shortPeriod(p.period), all: trendValues[i] }));
  const byName = new Map(rows.map((r) => [r.supplierId, r]));
  const alerts = rows.map((r) => ({ r, reasons: attentionReasons(r) })).filter((x) => x.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 5);
  // Latest app submissions first, then this period's other received reports.
  const live = submissions.map((s) => ({ key: s.reportId, supplierId: s.supplierId, period: s.reportId.split("_")[1], when: formatDateTime(s.createdAt), row: byName.get(s.supplierId) }));
  const rest = rows.filter((r) => ["submitted", "revision_requested", "imported_simulated"].includes(r.reportStatus) && !live.some((l) => l.supplierId === r.supplierId && l.period === c.period))
    .map((r) => ({ key: `${r.supplierId}_${c.period}`, supplierId: r.supplierId, period: c.period!, when: null as string | null, row: r }));
  const latest = [...live, ...rest].slice(0, 6);

  if (c.loading) return <div className="h-96 animate-pulse rounded-2xl bg-white" />;
  if (!c.current) {
    return (<><PageTop title="Ringkasan" /><EmptyNote>Belum ada data. Hubungkan pemasok atau impor data contoh.</EmptyNote></>);
  }

  return (
    <>
      <PageTop title="Ringkasan" subtitle={`${c.company?.name ?? c.companyId} · ${formatPeriod(c.period!)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId="kpi-suppliers" icon={Users} label="Total Pemasok" value={fmt(k.related)} hint="pemasok terhubung" />
        <StatCard testId="kpi-reports" icon={ClipboardCheck} label="Laporan Bulan Ini" value={`${k.received} dari ${k.expected}`} hint="laporan sudah dikirim" />
        <StatCard testId="kpi-emission" icon={Cloud} label="Emisi Tercatat" value={`${(k.emissionsKg / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ton CO₂e`} hint="estimasi dari laporan bulan ini" />
        <StatCard testId="kpi-attention" icon={AlertTriangle} label="Butuh Tindak Lanjut" value={fmt(k.attention)} hint="pemasok perlu dicek" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Panel title="Pemasok yang Mengirim Laporan" subtitle="Persentase pemasok yang sudah melapor tiap bulan" className="xl:col-span-2">
          <TrendChart data={trend} sources={["all"]} />
        </Panel>
        <Panel title="Kondisi Lingkungan Pemasok" subtitle="Berdasarkan laporan bulan ini">
          <ScoreDonut counts={k.colors} />
          <Link href="/c/emisi-skor/cara-penilaian" className="mt-4 inline-block text-xs font-medium text-brand-600">Bagaimana warna ditentukan?</Link>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Sumber Emisi Terbesar" subtitle="Estimasi emisi bulan ini per sumber" className="xl:col-span-2">
          <EmissionBars bySource={{ all: k.byCategory }} sources={["all"]} sortDesc />
        </Panel>
        <Panel title="Butuh Tindak Lanjut" action={<Link href="/c/insight" className="text-xs font-medium text-brand-600">Lihat semua</Link>}>
          {alerts.length === 0 ? <EmptyNote>Semua pemasok dalam kondisi baik.</EmptyNote> : (
            <ul className="divide-y divide-line">
              {alerts.map(({ r, reasons }) => (
                <li key={r.supplierId}>
                  <Link href={`/c/pemasok/${r.supplierId}`} className="flex items-center gap-3 py-2.5">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">{r.name}<SimTag source={r.source} /></p>
                      <p className="truncate text-xs text-navy-500">{reasons.join(" · ")}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Laporan Terbaru" subtitle="Diperbarui otomatis" className="mt-5">
        {latest.length === 0 ? <EmptyNote>Belum ada laporan.</EmptyNote> : (
          <ul className="divide-y divide-line" data-testid="recent-activity">
            {latest.map((x) => (
              <li key={x.key}>
                <Link href={`/c/pemasok/${x.supplierId}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-brand-500" />
                  <span className="min-w-0 flex-1 truncate"><b>{x.row?.name ?? x.supplierId}</b> mengirim laporan {formatPeriod(x.period)}</span>
                  {x.row && <ReportPill status={x.row.reportStatus} />}
                  <span className="hidden w-32 text-right text-xs text-navy-500 sm:block">{x.when ?? ""}</span>
                  <ChevronRight className="size-4 text-navy-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
