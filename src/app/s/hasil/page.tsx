"use client";
import { Award } from "lucide-react";
import { Card, EmptyState, PageHeader, SimulatedTag, StatusBadge } from "@/components/supplier/ui";
import { formatPeriod } from "@/lib/period";
import { useMyReports, useMyScores } from "@/lib/supplier-data";

const COLOR: Record<string, string> = { HIJAU: "bg-brand-50 text-brand-700", KUNING: "bg-amber-50 text-amber-700", MERAH: "bg-red-50 text-risk" };
const TYPE_LABEL = { simulated: "Simulasi", provisional: "Sementara", verified: "Terverifikasi" } as const;

export default function ResultsPage() {
  const scores = useMyScores();
  const reports = useMyReports();
  const waiting = reports.rows.filter((r) => r.status === "submitted" || r.status === "revision_requested");

  return (
    <>
      <PageHeader title="Hasil Penilaian" />
      <p className="text-sm text-navy-500">Skor terdiri dari kelengkapan data (30%), kecocokan bukti (30%), dan intensitas emisi (40%). Skor hanya dihitung bila datanya cukup.</p>
      {waiting.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="text-sm font-semibold">Menunggu verifikasi</p>
          <ul className="mt-2 space-y-2">
            {waiting.map((r) => <li key={r.id} className="flex items-center justify-between text-sm">{formatPeriod(r.period)} <StatusBadge status={r.status} /></li>)}
          </ul>
        </Card>
      )}
      <div className="mt-4 space-y-2.5">
        {scores.loading ? <Card className="h-24 animate-pulse" /> : scores.rows.length === 0 ? (
          <EmptyState icon={Award} title="Belum Dinilai" body="Hasil penilaian dan estimasi emisi muncul setelah laporan Anda diverifikasi." />
        ) : scores.rows.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{formatPeriod(s.period)}</p>
              {s.scoreType === "simulated" ? <SimulatedTag /> : <span className="text-xs text-navy-500">{TYPE_LABEL[s.scoreType]}</span>}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-semibold">{s.final ?? "—"}</span>
              {s.color && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR[s.color]}`}>{s.color}</span>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
