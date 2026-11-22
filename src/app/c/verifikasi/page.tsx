"use client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { clsx } from "clsx";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, Panel, ReviewPill } from "@/components/company/ui";
import { Alert } from "@/components/ui/Field";
import { db } from "@/lib/firebase/client";
import { formatId } from "@/lib/numbers";
import { formatPeriod } from "@/lib/period";
import { formatDateTime } from "@/lib/supplier-data";
import type { MonthlyReportDoc } from "@/lib/types";

interface Review { reportId: string; status: "pending" | "verified" | "revision_requested" | "rejected" | "awaiting_resubmission"; reportVersion: number }
interface Decision { reportId: string; supplierId: string; action: string; note: string | null; version: number; createdAt: unknown; evidenceCheck?: { checkedKwh: number | null; checkSourceLabel: string | null; outcome: { status: string } } }
type Tab = "queue" | "revision" | "history";
const ACTION: Record<string, string> = { approve: "Disetujui", reject: "Ditolak", request_revision: "Diminta perbaikan" };

export default function VerificationPage() {
  const { claims } = useAuth();
  const c = useCompany();
  const [tab, setTab] = useState<Tab>("queue");
  const [open, setOpen] = useState<MonthlyReportDoc[] | null>(null);
  const [reviews, setReviews] = useState<Map<string, Review>>(new Map());
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);

  // All bounded, all real-time, all scoped to this company.
  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "monthly_reports"), where("sharedWith", "array-contains", c.companyId), where("status", "in", ["submitted", "revision_requested"])),
      (s) => setOpen(s.docs.map((d) => d.data() as MonthlyReportDoc)), (e) => setError(e.code));
    const u2 = onSnapshot(query(collection(db, "company_reviews"), where("sharedWith", "array-contains", c.companyId), where("companyId", "==", c.companyId)),
      (s) => setReviews(new Map(s.docs.map((d) => [d.data().reportId as string, d.data() as Review]))), () => setReviews(new Map()));
    const u3 = onSnapshot(query(collection(db, "verification_records"), where("sharedWith", "array-contains", c.companyId), where("companyId", "==", c.companyId), orderBy("createdAt", "desc"), limit(50)),
      (s) => setDecisions(s.docs.map((d) => d.data() as Decision)), () => setDecisions([]));
    return () => { u1(); u2(); u3(); };
  }, [c.companyId]);

  const mine = (r: MonthlyReportDoc) => { const v = reviews.get(r.reportId); return v && v.reportVersion === r.version ? v.status : "pending"; };
  const queue = (open ?? []).filter((r) => r.status === "submitted" && mine(r) === "pending").sort((a, b) => a.reportId.localeCompare(b.reportId));
  const revision = (open ?? []).filter((r) => r.status === "revision_requested");
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "queue", label: "Menunggu verifikasi", n: queue.length }, { key: "revision", label: "Permintaan perbaikan", n: revision.length }, { key: "history", label: "Riwayat keputusan", n: decisions.length },
  ];

  return (
    <>
      <PageTop title="Verifikasi" subtitle="Keputusan verifikasi berlaku untuk perusahaan Anda saja. Data simulasi tidak masuk alur ini." period={false} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4" data-testid="verification-summary">
        {([["Menunggu", queue.length], ["Terverifikasi", [...reviews.values()].filter((v) => v.status === "verified").length],
          ["Ditolak", [...reviews.values()].filter((v) => v.status === "rejected").length], ["Diminta perbaikan", revision.length]] as const).map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm text-navy-500">{label}</p><p className="mt-1 text-2xl font-semibold">{n}</p>
          </div>
        ))}
      </div>
      {!claims.canVerify && <div className="mb-4 max-w-xl"><Alert tone="info">Akun Anda hanya dapat melihat. Keputusan memerlukan akses peninjau.</Alert></div>}
      {error && <div className="mb-4"><Alert>Gagal memuat ({error}).</Alert></div>}
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={clsx("rounded-full border px-3 py-1.5 text-sm font-medium", tab === t.key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-navy-700")}>
            {t.label} <span className="ml-1 text-xs">{t.n}</span>
          </button>
        ))}
      </div>
      <Panel>
        {open === null ? <div className="h-24 animate-pulse" /> : tab !== "history" ? (
          (tab === "queue" ? queue : revision).length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-sm text-navy-500"><ClipboardCheck className="mb-2 size-8 text-brand-500" />{tab === "queue" ? "Tidak ada laporan yang menunggu verifikasi." : "Tidak ada permintaan perbaikan terbuka."}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" data-testid={`table-${tab}`}>
                <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Pemasok</th><th className="py-2 pr-3 font-medium">Periode</th><th className="py-2 pr-3 font-medium">Dikirim</th>
                  <th className="py-2 pr-3 font-medium">Versi</th><th className="py-2 pr-3 font-medium">Bukti di aplikasi</th><th className="py-2 pr-3 font-medium">Status Anda</th><th />
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {(tab === "queue" ? queue : revision).map((r) => (
                    <tr key={r.reportId} className="hover:bg-surface/60">
                      <td className="py-2.5 pr-3"><p className="font-medium">{r.profile.businessName ?? r.supplierId}</p><p className="text-xs text-navy-500">{r.supplierId}</p></td>
                      <td className="py-2.5 pr-3">{formatPeriod(r.period)}</td>
                      <td className="py-2.5 pr-3">{formatDateTime(r.submittedAt)}</td>
                      <td className="py-2.5 pr-3">v{r.version}</td>
                      <td className="py-2.5 pr-3">{(r as MonthlyReportDoc & { evidenceCount?: number }).evidenceCount ? `${(r as MonthlyReportDoc & { evidenceCount?: number }).evidenceCount} metadata (file tidak tersimpan)` : "Tidak ada"}</td>
                      <td className="py-2.5 pr-3"><ReviewPill status={tab === "queue" ? "pending" : reviews.get(r.reportId)?.status ?? "awaiting_resubmission"} source="trial" /></td>
                      <td className="py-2.5 text-right"><Link href={`/c/verifikasi/${r.reportId}`} className="inline-flex items-center gap-1 font-medium text-brand-600">Tinjau <ChevronRight className="size-4" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : decisions.length === 0 ? <EmptyNote>Perusahaan Anda belum membuat keputusan.</EmptyNote> : (
          <ul className="divide-y divide-line" data-testid="decision-history">
            {decisions.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="w-40 font-medium">{ACTION[d.action] ?? d.action}</span>
                <span className="flex-1"><b>{d.supplierId}</b> · {formatPeriod(d.reportId.split("_")[1])} · v{d.version}{d.note ? ` · “${d.note}”` : ""}</span>
                <span className="text-xs text-navy-500">{d.evidenceCheck?.checkedKwh != null ? `Diperiksa ${formatId(d.evidenceCheck.checkedKwh)} kWh (${d.evidenceCheck.checkSourceLabel}) → ${d.evidenceCheck.outcome.status === "match" ? "cocok" : "tidak cocok"}` : "Bukti Belum Dapat Diverifikasi"}</span>
                <span className="w-36 text-right text-xs text-navy-500">{formatDateTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
