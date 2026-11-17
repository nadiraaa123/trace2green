"use client";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { CalendarDays, Check } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { Card, PageHeader, StatusBadge } from "@/components/supplier/ui";
import { reportId } from "@/lib/constants";
import { db } from "@/lib/firebase/client";
import { formatPeriod, reportablePeriods } from "@/lib/period";
import { emptyActivity, emptyProfile } from "@/lib/report";
import { useMyReports, useSupplier, useSupplierId } from "@/lib/supplier-data";

function NewReport() {
  const router = useRouter();
  const params = useSearchParams();
  const sid = useSupplierId()!;
  const { data: supplier } = useSupplier();
  const reports = useMyReports();
  const periods = reportablePeriods();
  const existing = new Map(reports.rows.map((r) => [r.period, r]));
  const firstFree = periods.find((p) => !existing.has(p)) ?? null;
  const requested = params.get("period");
  const [selected, setSelected] = useState<string | null>(requested && periods.includes(requested) ? requested : null);
  const chosen = selected ?? firstFree;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!chosen) return;
    const ex = existing.get(chosen);
    if (ex) return router.push(ex.status === "draft" || ex.status === "revision_requested" ? `/s/laporan/${chosen}/isi` : `/s/laporan/${chosen}`);
    setBusy(true);
    setError(null);
    const rid = reportId(sid, chosen);
    try {
      const ref = doc(db, "monthly_reports", rid);
      if ((await getDoc(ref)).exists()) return router.push(`/s/laporan/${chosen}/isi`);
      // Business identity is prefilled from the profile; activity data always starts empty.
      await setDoc(ref, {
        reportId: rid, supplierId: sid, period: chosen, status: "draft",
        profile: {
          ...emptyProfile(),
          businessName: supplier?.businessName ?? null,
          sector: supplier?.sector ?? null,
          mainProduct: supplier?.mainProduct ?? null,
          employees: supplier?.employees ?? null,
        },
        activity: emptyActivity(), draftStep: 1, version: 0, sharedWith: [], submittedAt: null,
        dataSource: "trial", isSimulated: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      router.push(`/s/laporan/${chosen}/isi`);
    } catch (e) {
      setError(`Gagal membuat draf (${(e as { code?: string }).code ?? "error"}).`);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Isi Laporan Bulanan" back="/s" />
      <p className="text-sm text-navy-500">Pilih bulan yang ingin dilaporkan. Laporan berisi aktivitas usaha selama satu bulan penuh.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Card className="mt-4 divide-y divide-line">
        {periods.map((p) => {
          const r = existing.get(p);
          const active = chosen === p;
          return (
            <button key={p} type="button" onClick={() => setSelected(p)} aria-pressed={active}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${active ? "bg-brand-50/60" : ""}`}>
              <CalendarDays className={`size-5 ${active ? "text-brand-600" : "text-navy-300"}`} />
              <span className="flex-1 text-sm font-medium">{formatPeriod(p)}</span>
              {r ? <StatusBadge status={r.status} /> : active ? <Check className="size-5 text-brand-600" /> : null}
            </button>
          );
        })}
      </Card>
      <div className="mt-5 space-y-2">
        <Button onClick={start} loading={busy} disabled={!chosen || reports.loading} className="w-full">
          {chosen && existing.has(chosen) ? `Buka laporan ${formatPeriod(chosen)}` : chosen ? `Mulai laporan ${formatPeriod(chosen)}` : "Semua bulan sudah dilaporkan"}
        </Button>
        <p className="text-center text-xs text-navy-500">Satu laporan per bulan. Laporan yang sudah ada akan dibuka, bukan dibuat ulang.</p>
        <p className="text-center text-xs"><Link href="/s/bantuan" className="text-brand-600">Data apa yang perlu disiapkan?</Link></p>
      </div>
    </>
  );
}

export default function NewReportPage() {
  return <Suspense><NewReport /></Suspense>;
}
