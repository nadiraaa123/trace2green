"use client";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CompanyHeader } from "@/components/company/CompanyHeader";
import { Alert } from "@/components/ui/Field";
import { db } from "@/lib/firebase/client";
import { formatPeriod } from "@/lib/period";
import { formatDateTime } from "@/lib/supplier-data";
import type { MonthlyReportDoc } from "@/lib/types";

export default function VerificationQueuePage() {
  const { claims } = useAuth();
  const [rows, setRows] = useState<MonthlyReportDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Real-time queue: reports shared with this company that await review.
  // Seeded workbook rows have status "imported_simulated" and never appear here.
  useEffect(() => {
    if (!claims.companyId) return;
    return onSnapshot(
      query(collection(db, "monthly_reports"), where("sharedWith", "array-contains", claims.companyId), where("status", "==", "submitted"), orderBy("submittedAt", "desc")),
      (s) => setRows(s.docs.map((d) => d.data() as MonthlyReportDoc)),
      (e) => setError(e.code),
    );
  }, [claims.companyId]);

  return (
    <main className="mx-auto max-w-5xl px-8 py-8">
      <CompanyHeader />
      <h1 className="mt-8 text-2xl font-semibold">Antrean Verifikasi</h1>
      <p className="mt-1 text-sm text-navy-500">Laporan berstatus Menunggu Verifikasi yang dibagikan pemasok ke perusahaan Anda. Diperbarui otomatis.</p>
      {!claims.canVerify && <div className="mt-4 max-w-xl"><Alert tone="info">Akun Anda hanya dapat melihat. Keputusan verifikasi memerlukan akses peninjau.</Alert></div>}
      {error && <div className="mt-4"><Alert>Gagal memuat antrean ({error}).</Alert></div>}
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
        {rows === null ? <div className="h-24 animate-pulse" /> : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-navy-500">
            <ClipboardCheck className="mb-2 size-8 text-brand-500" /> Tidak ada laporan yang menunggu verifikasi.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-navy-500">
              <tr><th className="px-4 py-2.5 font-medium">Pemasok</th><th className="px-4 py-2.5 font-medium">Periode</th><th className="px-4 py-2.5 font-medium">Dikirim</th><th className="px-4 py-2.5 font-medium">Versi</th><th className="px-4 py-2.5 font-medium">Sumber</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.reportId} className="hover:bg-surface/60">
                  <td className="px-4 py-3"><p className="font-medium">{r.profile.businessName ?? r.supplierId}</p><p className="text-xs text-navy-500">{r.supplierId}</p></td>
                  <td className="px-4 py-3">{formatPeriod(r.period)}</td>
                  <td className="px-4 py-3">{formatDateTime(r.submittedAt)}</td>
                  <td className="px-4 py-3">v{r.version}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-info">{r.dataSource}</span></td>
                  <td className="px-4 py-3 text-right"><Link href={`/c/verifikasi/${r.reportId}`} className="inline-flex items-center gap-1 font-medium text-brand-600">Tinjau <ChevronRight className="size-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
