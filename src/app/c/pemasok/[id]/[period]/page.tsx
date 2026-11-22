"use client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, CircleAlert, FileX2, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCompany } from "@/components/company/CompanyContext";
import { ColorPill, EmptyNote, Panel, ReportPill, ReviewPill, fmt } from "@/components/company/ui";
import type { EmissionFactor, EmissionLine } from "@/lib/emissions";
import { db } from "@/lib/firebase/client";
import type { RowReportStatus, RowReviewStatus } from "@/lib/kpi";
import { formatPeriod } from "@/lib/period";
import { CATEGORY_LABEL } from "@/lib/report";
import { recommendationsFor, type ScoreResult } from "@/lib/scoring";
import type { ActivityCategory, EvidenceMetadataDoc, MonthlyReportDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";

interface Component { key: "completeness" | "evidence" | "intensity"; weight: number; status: "available" | "unavailable"; score: number | null; detail: string }
interface Score {
  scoreType: "simulated" | "provisional" | "verified"; calcSource: string; components: Component[]; final: number | null;
  color: "HIJAU" | "KUNING" | "MERAH" | null; colorReason?: string; groupAvg?: number | null; intensityRatio?: number | null;
  benchmark?: { sector: string; avgIntensity: number; unit: string; status: string; source: string } | null; benchmarkBasis?: string | null;
}
interface Emission { calcSource: string; lines?: EmissionLine[]; byCategory?: Record<string, number>; totalKgCO2e: number | null; totalStatus?: string; intensity: number | null; intensityUnit: string | null; intensityNote?: string; workbookBlankAsZero?: string[] }
interface Review { status: Exclude<RowReviewStatus, null>; reportVersion: number; score?: Score | null; evidence?: { checkedKwh: number | null; checkSourceLabel: string | null; outcome: { status: string; diffRatio?: number } } | null }
interface Audit { action: string; audit?: { reportedKwh: number; auditedKwh: number; result: string }; note?: string }

const NAME = { completeness: "Kelengkapan Data", evidence: "Kecocokan Bukti", intensity: "Intensitas Emisi" } as const;
const HOW = {
  completeness: "Persentase dari 10 pertanyaan yang terjawab.",
  evidence: "Angka listrik dibandingkan dengan dokumen yang diperiksa; cocok bila selisih ≤ 10%.",
  intensity: "Emisi per unit produksi dibandingkan rata-rata kelompok usaha.",
} as const;
const TYPE = { simulated: "Skor simulasi (data contoh workbook)", provisional: "Skor sementara — belum diperiksa perusahaan", verified: "Komponen sudah diperiksa perusahaan Anda" } as const;

function Bar({ value }: { value: number | null }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
      {value != null && value > 0 && <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />}
    </div>
  );
}

export default function ScoreDetailPage() {
  const { id, period } = useParams<{ id: string; period: string }>();
  const c = useCompany();
  const rid = `${id}_${period}`;
  const { data: report, loading, error } = useDoc<MonthlyReportDoc & { workbook?: { evidenceStatus: string; billKwh: number | null } }>(`monthly_reports/${rid}`);
  const { data: base } = useDoc<Score>(report ? `supplier_scores/${rid}` : null);
  const { data: review } = useDoc<Review>(report && !report.isSimulated ? `company_reviews/${c.companyId}_${rid}` : null);
  const { data: emission } = useDoc<Emission>(report ? `emission_results/${rid}` : null);
  const { data: recs } = useDoc<{ items: { code: string; text: string }[] }>(report ? `recommendations/${rid}` : null);
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [evidence, setEvidence] = useState<EvidenceMetadataDoc[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);

  useEffect(() => onSnapshot(collection(db, "emission_factors"), (s) => setFactors(s.docs.map((d) => d.data() as EmissionFactor)), () => setFactors([])), []);
  useEffect(() => {
    const q = (col: string) => query(collection(db, col), where("sharedWith", "array-contains", c.companyId), where("reportId", "==", rid));
    const u1 = onSnapshot(q("evidence_metadata"), (s) => setEvidence(s.docs.map((d) => d.data() as EvidenceMetadataDoc)), () => setEvidence([]));
    const u2 = onSnapshot(q("verification_records"), (s) => setAudits(s.docs.map((d) => d.data() as Audit).filter((a) => a.action === "sample_audit")), () => setAudits([]));
    return () => { u1(); u2(); };
  }, [c.companyId, rid]);

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  if (!report) {
    return (<><Link href={`/c/pemasok/${id}`} className="inline-flex items-center gap-1 text-sm text-navy-500"><ArrowLeft className="size-4" /> Kembali</Link>
      <div className="mt-4"><EmptyNote>{error ? "Laporan ini tidak dibagikan ke perusahaan Anda." : "Laporan tidak ditemukan."}</EmptyNote></div></>);
  }

  const simulated = !!report.isSimulated;
  const currentReview = review && review.reportVersion === report.version ? review : null;
  // This company's own checked score when it exists; otherwise the shared base score.
  const score = currentReview?.score ?? base ?? null;
  const unavailable = (score?.components ?? []).filter((x) => x.status === "unavailable");
  const missingCats = (emission?.lines ?? []).filter((l) => l.status === "missing_activity" || l.status === "missing_factor" || l.status === "unit_unknown");
  const factorFor = (cat: string) => factors.filter((f) => f.category === cat);
  // Live reports: suggestions follow the score shown (incl. this company's check), via the same rules engine.
  // Simulated reports keep the workbook's original suggestion.
  const suggestions = simulated || !score ? (recs?.items ?? []) : recommendationsFor(report.profile, report.activity, score as unknown as ScoreResult,
    (emission?.lines ?? []).filter((l) => l.status === "missing_factor").map((l) => CATEGORY_LABEL[l.category]));
  const benchmark = score?.benchmark ?? (simulated && score?.groupAvg != null ? { sector: report.profile.sector ?? "—", avgIntensity: score.groupAvg, unit: "kg CO₂e/unit", status: "simulated_sample_average", source: "Rata-rata kelompok dari workbook simulasi" } : null);

  return (
    <>
      <Link href={`/c/pemasok/${id}`} className="inline-flex items-center gap-1 text-sm text-navy-500 hover:text-navy-900"><ArrowLeft className="size-4" /> {report.profile.businessName ?? id}</Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Rincian Skor · {formatPeriod(period)}</h1>
        <ReportPill status={report.status as RowReportStatus} />
        {simulated && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Data simulasi</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <p className="text-sm text-navy-500">{score ? TYPE[score.scoreType] : "Belum ada penilaian"}</p>
          {score?.final != null ? (
            <p className="mt-2 text-5xl font-semibold tracking-tight" data-testid="final-score">{fmt(score.final, 1)}<span className="text-lg font-normal text-navy-500">/100</span></p>
          ) : (
            <p className="mt-2 text-xl font-semibold text-navy-700" data-testid="final-score">Skor akhir belum tersedia</p>
          )}
          <div className="mt-3"><ColorPill color={score?.color ?? null} /></div>
          {score?.colorReason && <p className="mt-2 text-xs text-navy-500">{score.colorReason}</p>}
          {score?.final == null && unavailable.length > 0 && <p className="mt-3 text-xs text-navy-500">Skor akhir muncul setelah semua komponen tersedia.</p>}
          {score?.benchmarkBasis === "simulated_sample_average" && !simulated && (
            <p className="mt-3 rounded-lg bg-violet-50 p-2 text-xs text-violet-800">Intensitas memakai benchmark simulasi untuk demonstrasi, bukan benchmark industri resmi.</p>
          )}
        </Panel>

        <Panel title="Komponen Skor" className="lg:col-span-2">
          {!score ? <EmptyNote>Belum ada penilaian untuk laporan ini.</EmptyNote> : (
            <ul className="space-y-5" data-testid="components">
              {score.components.map((x) => (
                <li key={x.key}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{NAME[x.key]} <span className="font-normal text-navy-500">· bobot {Math.round(x.weight * 100)}%</span></span>
                    {x.status === "available" ? <span className="font-semibold">{fmt(x.score, 1)}</span> : <span className="text-xs font-medium text-amber-700">Belum dapat dinilai</span>}
                  </div>
                  <Bar value={x.status === "available" ? x.score : null} />
                  <p className="mt-1.5 text-xs text-navy-500">{HOW[x.key]} {x.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Data Aktivitas & Faktor Emisi" subtitle={emission?.totalKgCO2e != null ? `Total ${fmt(emission.totalKgCO2e, 1)} kg CO₂e${emission.totalStatus === "partial" ? " (sebagian — ada data kosong)" : ""}` : undefined}>
          {!emission ? <EmptyNote>Belum ada estimasi emisi.</EmptyNote> : (
            <ul className="divide-y divide-line text-sm">
              {(emission.lines ?? (["listrik", "bbm", "kemasan", "limbah", "transportasi"] as ActivityCategory[]).map((cat) => ({ category: cat } as EmissionLine))).map((l) => {
                const wb = emission.byCategory;
                const f = l.factorValue != null ? null : factorFor(l.category)[0];
                return (
                  <li key={l.category} className="py-2.5">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{CATEGORY_LABEL[l.category]}</span>
                      <span>{wb ? `${fmt(wb[l.category] ?? null, 1)} kg` : l.kgCO2e == null ? "—" : `${fmt(l.kgCO2e, 1)} kg`}</span>
                    </div>
                    <p className="text-xs text-navy-500">
                      {wb
                        ? (emission.workbookBlankAsZero?.includes(l.category) ? "Data kosong di workbook (dihitung 0 oleh workbook). " : "") + (f ? `Faktor ${f.kgCO2ePerUnit} kg CO₂e/${f.activityUnit} · ${f.status === "simulated" ? "faktor simulasi" : "faktor resmi"}` : "")
                        : l.status === "calculated" ? `${fmt(l.quantity, 2)} ${l.unit} × ${l.factorValue} kg CO₂e/${l.unit} · ${l.factorStatus === "simulated" ? "faktor simulasi" : "faktor resmi"} (${l.factorSource})` : l.note}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-navy-500">Intensitas: {emission?.intensity != null ? `${emission.intensity.toLocaleString("id-ID", { maximumFractionDigits: 4 })} ${emission.intensityUnit ?? ""}` : emission?.intensityNote || "belum dapat dihitung"}</p>
        </Panel>

        <div className="space-y-5">
          <Panel title="Benchmark">
            {benchmark ? (
              <p className="text-sm text-navy-700">
                Rata-rata kelompok <b>{benchmark.sector}</b>: {benchmark.avgIntensity.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {benchmark.unit}{" "}
                <span className={benchmark.status === "industry_verified" ? "text-brand-700" : "text-violet-700"}>({benchmark.status === "industry_verified" ? "benchmark resmi" : "benchmark simulasi — hanya demonstrasi"})</span>
                {score?.intensityRatio != null && <> · rasio pemasok {score.intensityRatio.toFixed(2)}×</>}
              </p>
            ) : <p className="text-sm text-navy-500">Benchmark yang sesuai belum tersedia, sehingga intensitas emisi belum dinilai.</p>}
          </Panel>

          <Panel title="Verifikasi & Bukti">
            {simulated ? (
              <p className="text-sm text-navy-700">Data simulasi tidak masuk alur verifikasi. Hasil cocok-bukti di workbook: <b>{report.workbook?.evidenceStatus ?? "—"}</b> (simulasi).</p>
            ) : (
              <div className="space-y-2 text-sm text-navy-700">
                <p className="flex items-center gap-2">Status perusahaan Anda: <ReviewPill status={currentReview?.status ?? (report.status === "submitted" ? "pending" : null)} source="trial" /></p>
                {currentReview?.evidence?.checkedKwh != null
                  ? <p>Diperiksa: {fmt(currentReview.evidence.checkedKwh)} kWh ({currentReview.evidence.checkSourceLabel}) → {currentReview.evidence.outcome.status === "match" ? "cocok" : "tidak cocok"}</p>
                  : <p>Bukti belum dapat diverifikasi — belum ada dokumen yang diperiksa.</p>}
              </div>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-navy-500"><FileX2 className="mt-0.5 size-3.5 shrink-0" />
              {evidence.length ? `${evidence.length} bukti tercatat (${evidence.map((e) => e.fileName).join(", ")}); file tidak tersimpan di aplikasi.` : "Tidak ada bukti yang dicatat di aplikasi."}</p>
            {audits.map((a, i) => <p key={i} className="mt-1 text-xs text-navy-500">Audit sampel (simulasi): {a.audit?.reportedKwh} vs {a.audit?.auditedKwh} kWh → {a.audit?.result}</p>)}
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Belum Tersedia">
          {unavailable.length === 0 && missingCats.length === 0 ? <p className="text-sm text-navy-500">Semua komponen dan data aktivitas tersedia.</p> : (
            <ul className="space-y-1.5 text-sm text-navy-700">
              {unavailable.map((x) => <li key={x.key} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />{NAME[x.key]}: {x.detail}</li>)}
              {missingCats.map((l) => <li key={l.category} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />{CATEGORY_LABEL[l.category]}: {l.note}</li>)}
            </ul>
          )}
        </Panel>
        <Panel title="Saran Perbaikan">
          {suggestions.length ? (
            <ul className="space-y-1.5 text-sm text-navy-700" data-testid="suggestions">{suggestions.map((r) => <li key={r.code} className="flex gap-2"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-500" />{r.text}</li>)}</ul>
          ) : <p className="text-sm text-navy-500">Belum ada saran.</p>}
        </Panel>
      </div>
      <p className="mt-4 text-xs text-navy-500">Kategori warna merupakan hasil penilaian internal Trace2Green untuk membantu pemantauan pemasok, bukan sertifikasi lingkungan resmi. <Link href="/c/emisi-skor/cara-penilaian" className="text-brand-600">Cara penilaian</Link></p>
    </>
  );
}
