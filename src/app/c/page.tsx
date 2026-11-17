"use client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Cloud, Gauge, Leaf, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompany } from "@/components/company/CompanyContext";
import { EmissionBars, ScoreDonut, TrendChart } from "@/components/company/charts";
import { EmptyNote, KpiCard, MethodBadges, Panel, SourceBadge, fmt, pct, tco2 } from "@/components/company/ui";
import { PageTop } from "@/components/company/Shell";
import { db } from "@/lib/firebase/client";
import { attentionReasons, completionTrend, filterRows, kpis, SOURCE_LABEL, type Source } from "@/lib/kpi";
import { formatPeriod, shortPeriod } from "@/lib/period";
import { formatDateTime } from "@/lib/supplier-data";

interface Activity { reportId: string; supplierId: string; action: string; createdAt: unknown; isSimulated?: boolean; actorCompanyId?: string; note?: string | null }
const ACTION: Record<string, string> = {
  submitted: "mengirim laporan", resubmitted: "mengirim ulang laporan", supplier_correction_request: "mengajukan koreksi",
  approve: "disetujui perusahaan Anda", request_revision: "diminta perbaikan", reject: "ditolak perusahaan Anda", sample_audit: "audit sampel (simulasi)",
};

export default function OverviewPage() {
  const c = useCompany();
  const rows = c.current?.rows ?? [];
  const groups = kpis(rows, c.source);
  const sources: Source[] = c.source === "all" ? ["demo", "trial"] : [c.source];
  const [activity, setActivity] = useState<Activity[]>([]);

  // Real-time, bounded: last 8 events visible to this company.
  useEffect(() => onSnapshot(
    query(collection(db, "verification_records"), where("sharedWith", "array-contains", c.companyId), orderBy("createdAt", "desc"), limit(8)),
    (s) => setActivity(s.docs.map((d) => d.data() as Activity)), () => setActivity([]),
  ), [c.companyId]);

  const series = Object.fromEntries(sources.map((s) => [s, completionTrend(c.periods, s)]));
  const trend = c.periods.map((p, i) => ({ label: shortPeriod(p.period), ...Object.fromEntries(sources.map((s) => [s, series[s][i]])) }));
  const bySource = Object.fromEntries(groups.map((k) => [k.source, k.emissions.byCategory])) as Record<Source, Record<string, number>>;
  const alerts = filterRows(rows, c.source).map((r) => ({ r, reasons: attentionReasons(r) })).filter((x) => x.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 6);
  const shownActivity = activity.filter((a) => c.source === "all" || (c.source === "demo" ? a.isSimulated : !a.isSimulated)).slice(0, 6);

  if (c.loading) return <div className="h-96 animate-pulse rounded-2xl bg-white" />;
  if (!c.current) {
    return (<><PageTop title="Ringkasan" /><EmptyNote>Belum ada ringkasan data. Hubungkan pemasok atau impor data contoh.</EmptyNote></>);
  }

  return (
    <>
      <PageTop title="Ringkasan" subtitle={`${c.company?.name ?? c.companyId} · kinerja pelaporan lingkungan pemasok, ${formatPeriod(c.period!)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard testId="kpi-suppliers" icon={Users} label="Total Pemasok" groups={groups}
          render={(k) => ({ value: fmt(k.related), sub: `${k.consented} mengizinkan berbagi data` })} />
        <KpiCard testId="kpi-completion" icon={ClipboardCheck} label="Tingkat Pelaporan" groups={groups}
          render={(k) => ({ value: pct(k.completionRate), sub: `${k.received} dari ${k.consented} laporan masuk` })} />
        <KpiCard testId="kpi-score" icon={Gauge} label="Skor Rata-rata" groups={groups}
          render={(k) => ({ value: k.avgScore == null ? "—" : `${fmt(k.avgScore, 1)}/100`, sub: k.avgScore == null ? `${k.unscored} laporan belum punya skor akhir` : `n = ${k.scored}${k.unscored ? ` · ${k.unscored} tanpa skor akhir` : ""}` })} />
        <KpiCard testId="kpi-emission" icon={Cloud} label="Estimasi Emisi" groups={groups}
          render={(k) => ({ value: tco2(k.emissions.totalKg), sub: k.source === "demo" ? "nilai workbook simulasi" : `${k.emissions.complete} lengkap · ${k.emissions.partial} sebagian · ${k.emissions.unavailable} tidak tersedia` })} />
        <KpiCard testId="kpi-attention" icon={AlertTriangle} label="Perlu Perhatian" groups={groups}
          render={(k) => ({ value: fmt(k.attention), sub: "belum lapor, MERAH, bukti tidak cocok, atau menunggu Anda" })} />
        <KpiCard testId="kpi-verification" icon={CheckCircle2} label="Progres Verifikasi" groups={groups}
          render={(k) => k.source === "demo"
            ? { value: "Tidak berlaku", sub: `simulasi · bukti workbook cocok ${k.received ? Math.round((k.evidence.match / k.received) * 100) : 0}%` }
            : { value: `${k.review.verified}/${k.received}`, sub: `${k.review.pending} menunggu · ${k.review.rejected} ditolak · ${k.review.revisionRequested} diminta perbaikan` }} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Tren Tingkat Pelaporan" subtitle="Laporan masuk ÷ pemasok yang mengizinkan berbagi data · hanya bulan dalam periode data tiap sumber" className="xl:col-span-2">
          <TrendChart data={trend} sources={sources} />
        </Panel>
        <Panel title="Distribusi Skor Pemasok" subtitle={`Laporan masuk ${formatPeriod(c.period!)}`}>
          <div className="space-y-5">
            {groups.map((k) => (
              <div key={k.source}>
                {groups.length > 1 && <div className="mb-2"><SourceBadge source={k.source} /></div>}
                <ScoreDonut counts={k.colors} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Estimasi Emisi per Kategori" subtitle="kg CO₂e; kategori kosong tidak dihitung, “tidak memakai” dihitung nol" className="xl:col-span-2">
          <EmissionBars bySource={bySource} sources={sources} />
          <MethodBadges />
        </Panel>
        <Panel title="Perlu Tindak Lanjut" action={<Link href="/c/insight" className="text-xs font-medium text-brand-600">Semua</Link>}>
          {alerts.length === 0 ? <EmptyNote>Tidak ada pemasok yang perlu perhatian.</EmptyNote> : (
            <ul className="divide-y divide-line">
              {alerts.map(({ r, reasons }) => (
                <li key={r.supplierId}>
                  <Link href={`/c/pemasok/${r.supplierId}`} className="flex items-center gap-3 py-2.5">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name} <span className="text-xs font-normal text-navy-500">{r.supplierId}</span></p>
                      <p className="truncate text-xs text-navy-500">{reasons.join(" · ")}</p>
                    </div>
                    <SourceBadge source={r.source} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Aktivitas Terbaru" subtitle="Diperbarui otomatis" className="mt-5">
        {shownActivity.length === 0 ? <EmptyNote>Belum ada aktivitas.</EmptyNote> : (
          <ul className="divide-y divide-line" data-testid="recent-activity">
            {shownActivity.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <Leaf className="size-4 shrink-0 text-brand-500" />
                <span className="flex-1"><b>{a.supplierId}</b> {ACTION[a.action] ?? a.action} · {formatPeriod(a.reportId.split("_")[1])}</span>
                <SourceBadge source={a.isSimulated ? "demo" : "trial"} />
                <span className="w-36 text-right text-xs text-navy-500">{a.isSimulated ? "data simulasi" : formatDateTime(a.createdAt)}</span>
                <Link href={a.isSimulated ? `/c/pemasok/${a.supplierId}` : `/c/verifikasi/${a.reportId}`} aria-label="Buka"><ChevronRight className="size-4 text-navy-300" /></Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-4 text-xs text-navy-300">{SOURCE_LABEL.demo}: data contoh workbook (fiktif). {SOURCE_LABEL.trial}: data yang dikirim pemasok melalui aplikasi.</p>
    </>
  );
}
