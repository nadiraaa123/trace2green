"use client";
import { deleteDoc, doc } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Circle, FileWarning, Paperclip, PencilLine, Send, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ReportSummary } from "@/components/supplier/ReportSummary";
import { Card, LinkButton, PageHeader, StatusBadge } from "@/components/supplier/ui";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { apiPost, authErrorMessage } from "@/lib/api";
import { reportId } from "@/lib/constants";
import { EVIDENCE_KIND_LABEL } from "@/lib/evidence/storage";
import { db } from "@/lib/firebase/client";
import { formatPeriod } from "@/lib/period";
import { missingItems } from "@/lib/report";
import { formatDateTime, useConsents, useEvidence, useRelationships, useReportHistory, useSupplierId } from "@/lib/supplier-data";
import type { MonthlyReportDoc, VerificationRecordDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";

const ACTION_LABEL: Record<VerificationRecordDoc["action"], string> = {
  submitted: "Laporan dikirim",
  resubmitted: "Laporan dikirim ulang",
  supplier_correction_request: "Anda mengajukan koreksi",
  approve: "Diverifikasi perusahaan",
  request_revision: "Perusahaan meminta perbaikan",
  reject: "Laporan ditolak",
  sample_audit: "Audit sampel",
};

export default function ReportDetailPage() {
  const { period } = useParams<{ period: string }>();
  const router = useRouter();
  const sid = useSupplierId()!;
  const rid = reportId(sid, period);
  const { data: r, loading } = useDoc<MonthlyReportDoc & { missingFields?: string[] }>(`monthly_reports/${rid}`);
  const history = useReportHistory(rid);
  const evidence = useEvidence(rid);
  const rels = useRelationships();
  const consents = useConsents();
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <><PageHeader title={`Laporan ${formatPeriod(period)}`} back="/s/laporan" /><Card className="h-40 animate-pulse" /></>;
  if (!r) {
    return (
      <>
        <PageHeader title={`Laporan ${formatPeriod(period)}`} back="/s/laporan" />
        <Alert tone="info">Belum ada laporan untuk bulan ini.</Alert>
        <LinkButton href={`/s/laporan/baru?period=${period}`} className="mt-4 w-full">Mulai laporan</LinkButton>
      </>
    );
  }

  const editable = r.status === "draft" || r.status === "revision_requested";
  const missing = missingItems(r.profile, r.activity);
  const sharedNames = (r.sharedWith ?? []).map((c) => rels.rows.find((x) => x.companyId === c)?.companyName ?? c);
  const latestReviewerNote = [...history.rows].reverse().find((h) => h.action === "request_revision" || h.action === "reject")?.note;

  async function submitCorrection() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/reports/correction", { period, reason });
      router.push(`/s/laporan/${period}/isi`);
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!confirm("Hapus draf ini? Isian yang belum dikirim akan hilang.")) return;
    await deleteDoc(doc(db, "monthly_reports", rid));
    router.push("/s/laporan");
  }

  return (
    <>
      <PageHeader title={`Laporan ${formatPeriod(period)}`} back="/s/laporan" />
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-navy-500">Status</span>
          <StatusBadge status={r.status} />
        </div>
        {r.status === "submitted" && (
          <p className="mt-3 text-sm text-navy-700">Laporan sudah diterima dan menunggu verifikasi oleh perusahaan pembeli. Skor muncul setelah verifikasi.</p>
        )}
        {r.status === "revision_requested" && (
          <div className="mt-3"><Alert tone="info">Laporan dibuka kembali untuk diperbaiki.{latestReviewerNote ? ` Catatan: ${latestReviewerNote}` : ""}</Alert></div>
        )}
        {r.version > 0 && <p className="mt-2 text-xs text-navy-500">Versi terkirim: {r.version} · {formatDateTime(r.submittedAt)}</p>}
        <p className="mt-2 text-xs text-navy-500">
          {r.status === "draft" ? "Draf belum dibagikan ke perusahaan mana pun." :
            sharedNames.length ? `Dibagikan ke: ${sharedNames.join(", ")}` : "Belum dibagikan ke perusahaan mana pun."}
        </p>
        {r.status !== "draft" && sharedNames.length === 0 && consents.rows.every((c) => !c.granted) && (
          <p className="mt-1 text-xs text-amber-700">Hubungkan usaha Anda dengan perusahaan pembeli di menu Perusahaan Terhubung agar laporan bisa diterima.</p>
        )}
        <div className="mt-4 grid gap-2">
          {editable && (
            <LinkButton href={`/s/laporan/${period}/isi`}><PencilLine className="size-4" /> {r.status === "draft" ? "Lanjutkan pengisian" : "Perbaiki laporan"}</LinkButton>
          )}
          {r.status === "submitted" && !correcting && (
            <Button variant="secondary" onClick={() => setCorrecting(true)}><FileWarning className="size-4" /> Ajukan koreksi</Button>
          )}
          {r.status === "draft" && (
            <Button variant="ghost" onClick={removeDraft} className="text-risk hover:bg-red-50"><Trash2 className="size-4" /> Hapus draf</Button>
          )}
        </div>
        {correcting && (
          <div className="mt-4 space-y-2">
            {error && <Alert>{error}</Alert>}
            <label className="block text-sm font-medium text-navy-700" htmlFor="reason">Apa yang perlu dikoreksi?</label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
              placeholder="Contoh: angka listrik salah ketik" />
            <p className="text-xs text-navy-500">Laporan akan dibuka kembali. Versi yang sudah dikirim tetap tersimpan sebagai riwayat.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setCorrecting(false)}>Batal</Button>
              <Button onClick={submitCorrection} loading={busy} disabled={reason.trim().length < 5}><Send className="size-4" /> Ajukan</Button>
            </div>
          </div>
        )}
      </Card>

      {history.rows.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">Riwayat status</h2>
          <ol className="relative ml-2 border-l border-line pl-5">
            {history.rows.map((h) => (
              <li key={h.id} className="mb-4 last:mb-0">
                <span className="absolute -left-[7px] mt-1 inline-flex size-3.5 items-center justify-center rounded-full bg-white">
                  {h.action === "approve" ? <CheckCircle2 className="size-3.5 text-brand-500" /> : <Circle className="size-3 fill-brand-200 text-brand-500" />}
                </span>
                <p className="text-sm font-medium">{ACTION_LABEL[h.action]}{h.version ? ` (v${h.version})` : ""}</p>
                <p className="text-xs text-navy-500">{formatDateTime(h.createdAt)}</p>
                {h.note && <p className="mt-1 text-xs text-navy-700">“{h.note}”</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {missing.length > 0 && (
        <section className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle className="size-4" /> {missing.length} isian belum lengkap</p>
          <p className="mt-1 text-xs text-amber-800/80">{missing.map((m) => m.label).join(", ")}</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">Isian laporan</h2>
        <ReportSummary profile={r.profile} activity={r.activity} />
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">Bukti pendukung</h2>
        {evidence.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-navy-500">Tidak ada bukti yang dicatat.</p>
        ) : (
          <Card className="divide-y divide-line">
            {evidence.rows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3.5 text-sm">
                <Paperclip className="size-4 text-navy-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.fileName}</p>
                  <p className="text-xs text-navy-500">{EVIDENCE_KIND_LABEL[e.kind]}</p>
                </div>
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Demo · tidak tersimpan</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
