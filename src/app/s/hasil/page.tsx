"use client";
import { Award } from "lucide-react";
import Link from "next/link";
import { EmissionBreakdown, MethodNote, ScoreBreakdown } from "@/components/results/Breakdown";
import { Card, EmptyState, PageHeader, SimulatedTag, StatusBadge } from "@/components/supplier/ui";
import { formatPeriod } from "@/lib/period";
import { useMyEmissions, useMyReports, useMyScores } from "@/lib/supplier-data";

export default function ResultsPage() {
  const scores = useMyScores();
  const emissions = useMyEmissions();
  const reports = useMyReports();

  return (
    <>
      <PageHeader title="Hasil Penilaian" />
      <MethodNote />
      <div className="mt-4 space-y-5">
        {scores.loading ? <Card className="h-40 animate-pulse" /> : scores.rows.length === 0 ? (
          <EmptyState icon={Award} title="Belum Dinilai" body="Estimasi emisi dan penilaian muncul setelah laporan dikirim." />
        ) : scores.rows.map((s) => {
          const e = emissions.rows.find((x) => x.reportId === s.id);
          const r = reports.rows.find((x) => x.id === s.id);
          return (
            <section key={s.id}>
              <div className="mb-2 flex items-center justify-between">
                <Link href={`/s/laporan/${s.period}`} className="text-sm font-semibold">{formatPeriod(s.period)}</Link>
                {s.scoreType === "simulated" ? <SimulatedTag /> : r && <StatusBadge status={r.status} />}
              </div>
              <div className="space-y-2.5">
                <ScoreBreakdown score={s} />
                {e && <EmissionBreakdown e={e} />}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
