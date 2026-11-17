"use client";
import { ClipboardList, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, DerivedStatus, EmptyState, IconTile, LinkButton, PageHeader } from "@/components/supplier/ui";
import { STATUS_LABEL } from "@/lib/constants";
import { formatPeriod } from "@/lib/period";
import { formatDateTime, useMyReports, useMyReviews } from "@/lib/supplier-data";
import type { ReportStatus } from "@/lib/types";

const FILTERS: (ReportStatus | "all")[] = ["all", "draft", "submitted", "revision_requested", "imported_simulated"];

export default function ReportHistoryPage() {
  const { rows, loading, error } = useMyReports();
  const reviews = useMyReviews();
  const [filter, setFilter] = useState<ReportStatus | "all">("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <>
      <PageHeader title="Riwayat Laporan" action={
        <Link href="/s/laporan/baru" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white">
          <FilePlus2 className="size-4" /> Baru
        </Link>} />
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium ${filter === f ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-navy-500"}`}>
            {f === "all" ? "Semua" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {error && <p className="text-sm text-risk">Gagal memuat laporan ({error}).</p>}
        {loading ? (
          [0, 1, 2].map((i) => <Card key={i} className="h-[72px] animate-pulse" />)
        ) : shown.length === 0 ? (
          <EmptyState icon={ClipboardList} title={rows.length ? "Tidak ada laporan dengan status ini" : "Belum ada laporan"}
            body="Laporan bulanan yang Anda isi akan muncul di sini beserta statusnya."
            action={!rows.length && <LinkButton href="/s/laporan/baru">Isi Laporan Bulanan</LinkButton>} />
        ) : (
          shown.map((r) => (
            <Link key={r.id} href={`/s/laporan/${r.period}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-[var(--shadow-card)]">
              <IconTile icon={ClipboardList} tone={r.status === "verified" ? "brand" : r.status === "draft" ? "slate" : "blue"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Laporan {formatPeriod(r.period)}</p>
                <p className="truncate text-xs text-navy-500">
                  {r.submittedAt ? `Dikirim ${formatDateTime(r.submittedAt)} · v${r.version}` : `Draf · langkah ${r.draftStep ?? 1} dari 4`}
                </p>
              </div>
              <DerivedStatus report={r} reviews={reviews.rows} />
            </Link>
          ))
        )}
      </div>
    </>
  );
}
