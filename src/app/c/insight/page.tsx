"use client";
import { AlertTriangle, FileQuestion, Flame, MailWarning, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, Panel, SourceBadge } from "@/components/company/ui";
import { consumptionFlags, filterRows, type StatsRow } from "@/lib/kpi";
import { formatPeriod } from "@/lib/period";

/** Deterministic follow-up text from the row state (no AI). */
function followUp(r: StatsRow): string | null {
  if (r.reportStatus === "missing") return "Ingatkan pemasok untuk mengirim laporan bulan ini.";
  if (r.reportStatus === "revision_requested") return "Pantau perbaikan laporan dan tinjau kembali setelah dikirim ulang.";
  if (r.evidence === "mismatch") return "Minta pemasok memeriksa ulang angka listrik dan menyiapkan tagihan asli.";
  if (r.reviewStatus === "pending") return "Tinjau laporan yang menunggu verifikasi perusahaan Anda.";
  if (r.color === "MERAH") return "Jadwalkan pendampingan; status MERAH menandakan data minim, bukti tidak cocok, atau intensitas tinggi.";
  if (r.evidence === "unverifiable" && r.source === "trial") return "Periksa dokumen tagihan pemasok bila tersedia agar kecocokan bukti dapat dinilai.";
  return null;
}

function List({ items, render }: { items: StatsRow[]; render?: (r: StatsRow) => string }) {
  return items.length === 0 ? <EmptyNote>Tidak ada.</EmptyNote> : (
    <ul className="max-h-72 divide-y divide-line overflow-y-auto">
      {items.map((r) => (
        <li key={r.supplierId}><Link href={`/c/pemasok/${r.supplierId}`} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="min-w-0 truncate"><b>{r.name}</b> <span className="text-xs text-navy-500">{r.supplierId}{render ? ` · ${render(r)}` : ""}</span></span><SourceBadge source={r.source} />
        </Link></li>
      ))}
    </ul>
  );
}

export default function InsightsPage() {
  const c = useCompany();
  const rows = filterRows(c.current?.rows ?? [], c.source).filter((r) => r.consent);
  const prev = filterRows(c.previous?.rows ?? [], c.source);
  const missing = rows.filter((r) => r.reportStatus === "missing");
  const noEvidence = rows.filter((r) => r.evidence === "unverifiable");
  const revisions = rows.filter((r) => r.reportStatus === "revision_requested");
  const flags = consumptionFlags(rows, c.previous ? prev : null);
  const followUps = rows.map((r) => ({ r, text: followUp(r) })).filter((x) => x.text);

  if (!c.current) return (<><PageTop title="Insight & Rekomendasi" /><EmptyNote>Belum ada data.</EmptyNote></>);
  return (
    <>
      <PageTop title="Insight & Rekomendasi" subtitle={`Saran berbasis aturan dari data ${formatPeriod(c.period!)} — bukan prediksi AI`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Belum mengirim laporan (${missing.length})`} action={<MailWarning className="size-5 text-risk" />}><List items={missing} /></Panel>
        <Panel title={`Bukti belum dapat diverifikasi (${noEvidence.length})`} subtitle="Simulasi: workbook “Belum ada bukti”. Trial: belum ada nilai yang diperiksa perusahaan Anda." action={<FileQuestion className="size-5 text-amber-600" />}><List items={noEvidence} /></Panel>
        <Panel title={`Konsumsi tinggi (${flags.length})`} subtitle={c.previous ? `Listrik naik > 20% dibanding ${formatPeriod(c.previous.period)} atau intensitas > 1,15× rata-rata kelompok (pembanding simulasi)` : "Intensitas > 1,15× rata-rata kelompok (pembanding simulasi); belum ada bulan sebelumnya untuk perbandingan listrik"} action={<Flame className="size-5 text-orange-600" />}>
          {flags.length === 0 ? <EmptyNote>Tidak ada.</EmptyNote> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto" data-testid="consumption-flags">
              {flags.map((f, i) => (
                <li key={i}><Link href={`/c/pemasok/${f.supplierId}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0"><b>{f.name}</b> <span className="text-xs text-navy-500">{f.supplierId}</span><span className="block text-xs text-navy-700">{f.detail}</span></span><SourceBadge source={f.source} />
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Permintaan perbaikan terbuka (${revisions.length})`} action={<RotateCcw className="size-5 text-orange-600" />}><List items={revisions} /></Panel>
      </div>
      <Panel title={`Rekomendasi tindak lanjut (${followUps.length})`} className="mt-5" action={<AlertTriangle className="size-5 text-amber-600" />}>
        {followUps.length === 0 ? <EmptyNote>Tidak ada tindak lanjut.</EmptyNote> : (
          <ul className="divide-y divide-line">
            {followUps.slice(0, 40).map(({ r, text }) => (
              <li key={r.supplierId} className="flex items-center gap-3 py-2.5 text-sm">
                <Link href={`/c/pemasok/${r.supplierId}`} className="w-56 shrink-0 truncate font-medium">{r.name} <span className="text-xs font-normal text-navy-500">{r.supplierId}</span></Link>
                <span className="flex-1 text-navy-700">{text}</span><SourceBadge source={r.source} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
