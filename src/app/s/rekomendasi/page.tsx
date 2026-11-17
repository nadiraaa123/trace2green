"use client";
import { Lightbulb } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/supplier/ui";
import { formatPeriod } from "@/lib/period";
import { useMyRecommendations } from "@/lib/supplier-data";

export default function RecommendationsPage() {
  const { rows, loading } = useMyRecommendations();
  const sorted = [...rows].sort((a, b) => b.period.localeCompare(a.period));
  return (
    <>
      <PageHeader title="Rekomendasi Perbaikan" />
      <p className="text-sm text-navy-500">Saran berbasis aturan dari data laporan Anda yang sudah dinilai.</p>
      <div className="mt-4 space-y-2.5">
        {loading ? <Card className="h-24 animate-pulse" /> : sorted.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Belum ada rekomendasi" body="Rekomendasi muncul setelah laporan diverifikasi dan dinilai." />
        ) : sorted.map((r) => (
          <Card key={r.id} className="p-4">
            <p className="text-sm font-semibold">{formatPeriod(r.period)}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">{r.items.map((i) => <li key={i.code}>{i.text}</li>)}</ul>
          </Card>
        ))}
      </div>
    </>
  );
}
