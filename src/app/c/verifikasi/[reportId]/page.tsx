"use client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, FileX2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReviewPill } from "@/components/company/ui";
import { EmissionBreakdown, MethodNote, ScoreBreakdown, type EmissionView, type ScoreView } from "@/components/results/Breakdown";
import { ReportSummary } from "@/components/supplier/ReportSummary";
import { StatusBadge } from "@/components/supplier/ui";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { apiPost, authErrorMessage } from "@/lib/api";
import { EVIDENCE_KIND_LABEL } from "@/lib/evidence/storage";
import { db } from "@/lib/firebase/client";
import { formatId, parseIdNumber } from "@/lib/numbers";
import { formatPeriod } from "@/lib/period";
import { compareEvidence, WORKBOOK_SCORING_PARAMS, type ScoringParams } from "@/lib/scoring";
import { formatDateTime } from "@/lib/supplier-data";
import type { EvidenceMetadataDoc, MonthlyReportDoc, VerificationRecordDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";
import { CHECK_SOURCES, type CheckSource } from "@/lib/verification";

const SOURCES = CHECK_SOURCES;
type Source = CheckSource;
const ACTION_LABEL: Record<string, string> = {
  submitted: "Dikirim pemasok", resubmitted: "Dikirim ulang", supplier_correction_request: "Pemasok mengajukan koreksi",
  approve: "Disetujui perusahaan Anda", request_revision: "Diminta perbaikan oleh perusahaan Anda", reject: "Ditolak perusahaan Anda", sample_audit: "Audit sampel (simulasi)",
};

export default function ReviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const { claims } = useAuth();
  const cid = claims.companyId!;
  const { data: r, loading, error } = useDoc<MonthlyReportDoc>(`monthly_reports/${reportId}`);
  const { data: score } = useDoc<ScoreView>(r ? `supplier_scores/${reportId}` : null);
  const { data: emission } = useDoc<EmissionView>(r ? `emission_results/${reportId}` : null);
  const { data: params } = useDoc<ScoringParams>("meta/scoring_params");
  const { data: myReview } = useDoc<{ status: "pending" | "verified" | "revision_requested" | "rejected" | "awaiting_resubmission"; reportVersion: number; score?: ScoreView }>(r ? `company_reviews/${cid}_${reportId}` : null);
  const myStatus = r?.status === "submitted" && (!myReview || myReview.reportVersion !== r.version) ? "pending" : myReview?.status ?? null;
  const [evidence, setEvidence] = useState<EvidenceMetadataDoc[]>([]);
  const [history, setHistory] = useState<(VerificationRecordDoc & { evidenceCheck?: { checkedKwh: number | null; checkSourceLabel: string | null; outcome: { status: string; diffRatio?: number } } })[]>([]);
  const [kwh, setKwh] = useState("");
  const [source, setSource] = useState<Source | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const q = (col: string) => query(collection(db, col), where("sharedWith", "array-contains", cid), where("reportId", "==", reportId));
    const u1 = onSnapshot(q("evidence_metadata"), (s) => setEvidence(s.docs.map((d) => d.data() as EvidenceMetadataDoc)), () => setEvidence([]));
    const u2 = onSnapshot(q("verification_records"), (s) => setHistory(s.docs.map((d) => d.data() as never).sort((a: { createdAt?: { toMillis?: () => number } }, b: { createdAt?: { toMillis?: () => number } }) => (a.createdAt?.toMillis?.() ?? 9e15) - (b.createdAt?.toMillis?.() ?? 9e15))), () => setHistory([]));
    return () => { u1(); u2(); };
  }, [cid, reportId]);

  const tolerance = (params ?? WORKBOOK_SCORING_PARAMS).evidenceTolerance;
  const parsed = parseIdNumber(kwh);
  const preview = useMemo(() => {
    if (!r || !parsed.ok || parsed.value == null) return null;
    return compareEvidence(r.activity.electricityKwh, parsed.value, tolerance, (r.activity.notApplicable ?? []).includes("listrik"));
  }, [r, parsed, tolerance]);

  async function decide(action: "approve" | "request_revision" | "reject") {
    setMsg(null);
    if (!parsed.ok) return setMsg({ tone: "error", text: parsed.error });
    setBusy(action);
    try {
      const res = await apiPost<{ reviewStatus: string }>("/api/reports/review", {
        reportId, action, note, checkedKwh: parsed.value, checkSource: parsed.value != null ? source || null : null,
      });
      setMsg({ tone: "success", text: `Keputusan tersimpan. Status: ${res.reviewStatus === "verified" ? "Terverifikasi" : res.reviewStatus === "rejected" ? "Ditolak" : "Perlu Perbaikan"}.` });
    } catch (e) {
      setMsg({ tone: "error", text: authErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <Link href="/c/verifikasi" className="inline-flex items-center gap-1 text-sm font-medium text-navy-500 hover:text-navy-900"><ArrowLeft className="size-4" /> Antrean verifikasi</Link>
      {loading ? <div className="mt-6 h-40 animate-pulse rounded-2xl bg-white" /> : !r ? (
        <div className="mt-6 max-w-xl"><Alert>{error ? "Anda tidak memiliki akses ke laporan ini." : "Laporan tidak ditemukan."}</Alert></div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{r.profile.businessName ?? r.supplierId} · {formatPeriod(r.period)}</h1>
            <StatusBadge status={r.status} />
            <span className="text-xs text-navy-500">Status untuk perusahaan Anda:</span> <ReviewPill status={myStatus} source="trial" />
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-info">{r.dataSource}</span>
          </div>
          <p className="mt-1 text-sm text-navy-500">{r.supplierId} · versi {r.version} · dikirim {formatDateTime(r.submittedAt)}</p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold">Data yang dikirim</h2>
              <ReportSummary profile={r.profile} activity={r.activity} />
              <h2 className="pt-2 text-sm font-semibold">Bukti di aplikasi</h2>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold"><FileX2 className="size-4" /> File bukti tidak tersimpan (mode demo)</p>
                <p className="mt-1 text-amber-900/80">Aplikasi hanya mencatat nama, jenis, dan ukuran file. Isi dokumen tidak dapat diperiksa di sini. Isi nilai pemeriksaan hanya bila Anda benar-benar melihat dokumennya di luar aplikasi.</p>
                {evidence.length ? (
                  <ul className="mt-3 space-y-1">{evidence.map((e) => <li key={e.fileName + e.sizeBytes}>• {e.fileName} — {EVIDENCE_KIND_LABEL[e.kind]}</li>)}</ul>
                ) : <p className="mt-3">Pemasok tidak mencatat bukti apa pun.</p>}
              </div>
              {myReview?.score && myReview.reportVersion === r.version ? (
                <><p className="text-xs font-medium text-navy-500">Skor menurut pemeriksaan perusahaan Anda</p><ScoreBreakdown score={myReview.score} /></>
              ) : score && <ScoreBreakdown score={score} />}
              {emission && <EmissionBreakdown e={emission} />}
              <MethodNote />
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
                <h2 className="text-sm font-semibold">Pemeriksaan & keputusan</h2>
                {r.status !== "submitted" || myStatus !== "pending" ? (
                  <p className="mt-2 text-sm text-navy-500">{r.status !== "submitted" ? "Laporan ini tidak sedang menunggu verifikasi." : "Perusahaan Anda sudah memutuskan versi laporan ini."}</p>
                ) : !claims.canVerify ? (
                  <p className="mt-2 text-sm text-navy-500">Akun Anda tidak memiliki akses peninjau.</p>
                ) : (
                  <div className="mt-3 space-y-3 text-sm">
                    <p className="text-navy-500">Listrik dilaporkan: <b className="text-navy-900">{r.activity.electricityKwh == null ? "belum diisi" : `${formatId(r.activity.electricityKwh)} kWh`}</b></p>
                    <label className="block font-medium text-navy-700" htmlFor="ck">kWh hasil pemeriksaan dokumen (opsional)</label>
                    <input id="ck" inputMode="decimal" value={kwh} onChange={(e) => { setKwh(e.target.value); setMsg(null); }} placeholder="Kosongkan bila tidak memeriksa dokumen"
                      className="h-11 w-full rounded-xl border border-line px-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />
                    {!parsed.ok && <p className="text-xs text-risk">{parsed.error}</p>}
                    {parsed.ok && parsed.value != null && (
                      <>
                        <label className="block font-medium text-navy-700" htmlFor="src">Sumber pemeriksaan</label>
                        <select id="src" value={source} onChange={(e) => { setSource(e.target.value as Source); setMsg(null); }} className="h-11 w-full rounded-xl border border-line px-3">
                          <option value="">Pilih sumber</option>
                          {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </>
                    )}
                    <p className={`rounded-lg p-2 text-xs ${preview?.status === "match" ? "bg-brand-50 text-brand-700" : preview?.status === "mismatch" ? "bg-red-50 text-risk" : "bg-slate-100 text-navy-700"}`}>
                      {preview == null ? "Bukti Belum Dapat Diverifikasi — belum ada nilai hasil pemeriksaan."
                        : preview.status === "unverifiable" ? `Bukti Belum Dapat Diverifikasi — ${preview.reason}.`
                          : `${preview.status === "match" ? "Cocok" : "Tidak cocok"}: selisih ${(preview.diffRatio * 100).toFixed(1)}% (toleransi ${(tolerance * 100).toFixed(0)}%).`}
                    </p>
                    <label className="block font-medium text-navy-700" htmlFor="note">Catatan / alasan</label>
                    <textarea id="note" rows={3} value={note} onChange={(e) => { setNote(e.target.value); setMsg(null); }} placeholder="Wajib untuk tolak atau minta perbaikan"
                      className="w-full rounded-xl border border-line p-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />
                    {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
                    <div className="grid gap-2">
                      <Button onClick={() => decide("approve")} loading={busy === "approve"} disabled={!!busy}>Setujui</Button>
                      <Button variant="secondary" onClick={() => decide("request_revision")} loading={busy === "request_revision"} disabled={!!busy}>Minta Perbaikan</Button>
                      <Button variant="danger" onClick={() => decide("reject")} loading={busy === "reject"} disabled={!!busy}>Tolak</Button>
                    </div>
                  </div>
                )}
                {msg && (r.status !== "submitted" || myStatus !== "pending") && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
              </div>

              <div className="rounded-2xl border border-line bg-white p-4">
                <h2 className="text-sm font-semibold">Riwayat</h2>
                <ol className="mt-2 space-y-3 text-sm">
                  {history.map((h, i) => (
                    <li key={i}>
                      <p className="font-medium">{ACTION_LABEL[h.action] ?? h.action}{h.version ? ` · v${h.version}` : ""}</p>
                      <p className="text-xs text-navy-500">{formatDateTime(h.createdAt)}</p>
                      {h.note && <p className="text-xs text-navy-700">“{h.note}”</p>}
                      {h.evidenceCheck?.checkedKwh != null && (
                        <p className="text-xs text-navy-500">Diperiksa: {formatId(h.evidenceCheck.checkedKwh)} kWh ({h.evidenceCheck.checkSourceLabel}) → {h.evidenceCheck.outcome.status === "match" ? "cocok" : "tidak cocok"}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
