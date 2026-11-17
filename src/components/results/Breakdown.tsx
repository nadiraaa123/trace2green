"use client";
import { clsx } from "clsx";
import { Info } from "lucide-react";
import { formatId } from "@/lib/numbers";
import { CATEGORY_LABEL } from "@/lib/report";
import type { ActivityCategory } from "@/lib/types";

export interface ScoreComponentView { key: "completeness" | "evidence" | "intensity"; weight: number; status: "available" | "unavailable"; score: number | null; detail: string }
export interface ScoreView {
  scoreType: "simulated" | "provisional" | "verified"; calcSource: string; components: ScoreComponentView[];
  final: number | null; color: "HIJAU" | "KUNING" | "MERAH" | null; colorReason?: string; availableWeight?: number; partialPoints?: number;
  methodNote?: string; reportStatus?: string;
}
export interface EmissionLineView { category: ActivityCategory; status: string; quantity: number | null; unit: string | null; qualifier: string | null; factorValue: number | null; factorStatus: string | null; kgCO2e: number | null; note: string }
export interface EmissionView {
  calcSource: string; lines?: EmissionLineView[]; byCategory?: Record<string, number>; totalKgCO2e: number | null;
  totalStatus?: string; intensity: number | null; intensityUnit: string | null; intensityNote?: string; usesSimulatedFactors: boolean; workbookBlankAsZero?: string[];
}

const LABEL = { completeness: "Kelengkapan data", evidence: "Kecocokan bukti", intensity: "Intensitas emisi" } as const;
const COLOR_STYLE = { HIJAU: "bg-brand-50 text-brand-700", KUNING: "bg-amber-50 text-amber-700", MERAH: "bg-red-50 text-risk" } as const;
const TYPE_LABEL = { simulated: "Skor simulasi (workbook)", provisional: "Sementara — belum diverifikasi", verified: "Komponen terverifikasi" } as const;

export function ColorChip({ color }: { color: ScoreView["color"] }) {
  if (!color) return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-navy-500">Belum Dinilai</span>;
  return <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", COLOR_STYLE[color])}>{color}</span>;
}

export function ScoreBreakdown({ score }: { score: ScoreView }) {
  const simulated = score.scoreType === "simulated";
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-navy-500">{TYPE_LABEL[score.scoreType]}</p>
          {score.final != null ? (
            <p className="mt-1 text-3xl font-semibold">{score.final}<span className="text-sm font-normal text-navy-500">/100</span></p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-navy-700">Skor akhir belum tersedia</p>
          )}
          {score.final == null && score.availableWeight != null && score.availableWeight > 0 && (
            <p className="text-xs text-navy-500">Komponen yang dapat dinilai: {Math.round(score.availableWeight * 100)}% bobot ({score.partialPoints} poin dari {Math.round(score.availableWeight * 100)})</p>
          )}
        </div>
        <ColorChip color={score.color} />
      </div>
      {score.colorReason && <p className="mt-2 text-xs text-navy-500">{score.colorReason}</p>}
      <ul className="mt-3 divide-y divide-line">
        {score.components.map((c) => (
          <li key={c.key} className="py-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{LABEL[c.key]} <span className="font-normal text-navy-500">({Math.round(c.weight * 100)}%)</span></span>
              {c.status === "available" ? <span className="font-semibold">{c.score}</span> : <span className="text-xs font-medium text-amber-700">Belum tersedia</span>}
            </div>
            <p className="mt-0.5 text-xs text-navy-500">{c.detail}</p>
          </li>
        ))}
      </ul>
      {simulated && score.methodNote && <p className="mt-2 rounded-lg bg-violet-50 p-2 text-xs text-violet-800">{score.methodNote}</p>}
    </div>
  );
}

export function EmissionBreakdown({ e }: { e: EmissionView }) {
  const workbook = e.calcSource === "workbook_simulated";
  const rows: { cat: string; text: string; kg: number | null; note: string }[] = workbook
    ? (["listrik", "bbm", "kemasan", "limbah", "transportasi"] as const).map((c) => ({
      cat: CATEGORY_LABEL[c], text: "", kg: e.byCategory?.[c] ?? null,
      note: e.workbookBlankAsZero?.includes(c) ? "Sel kosong, dihitung 0 oleh workbook" : "",
    }))
    : (e.lines ?? []).map((l) => ({
      cat: CATEGORY_LABEL[l.category],
      text: l.status === "calculated" ? `${formatId(l.quantity)} ${l.unit}${l.qualifier && l.qualifier !== "unspecified" ? ` (${l.qualifier})` : ""} × ${l.factorValue}` : "",
      kg: l.kgCO2e, note: l.status === "calculated" ? "" : l.note,
    }));
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-navy-500">Estimasi emisi {workbook ? "(nilai workbook simulasi)" : e.totalStatus === "partial" ? "(sebagian)" : ""}</p>
          <p className="mt-1 text-2xl font-semibold">{e.totalKgCO2e == null ? "—" : formatId(e.totalKgCO2e)} <span className="text-sm font-normal text-navy-500">kg CO₂e</span></p>
        </div>
        {e.usesSimulatedFactors && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">Faktor simulasi</span>}
      </div>
      <ul className="mt-3 divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.cat} className="flex items-start justify-between gap-3 py-2">
            <div>
              <p className="font-medium">{r.cat}</p>
              {r.text && <p className="text-xs text-navy-500">{r.text}</p>}
              {r.note && <p className="text-xs text-amber-700">{r.note}</p>}
            </div>
            <span className="shrink-0 font-medium">{r.kg == null ? "—" : `${formatId(r.kg)} kg`}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-navy-500">
        Intensitas: {e.intensity == null ? (e.intensityNote || "tidak tersedia") : `${e.intensity.toLocaleString("id-ID", { maximumFractionDigits: 4 })} ${e.intensityUnit}`}
      </p>
    </div>
  );
}

export function MethodNote() {
  return (
    <details className="rounded-2xl border border-line bg-white p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Info className="size-4 text-brand-500" /> Cara penilaian</summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-navy-700">
        <li><b>Emisi</b> = jumlah aktivitas × faktor emisi. Faktor yang dipakai saat ini adalah <b>angka ilustrasi (simulasi)</b> dari workbook, bukan faktor resmi.</li>
        <li>Isian kosong <b>tidak</b> dihitung nol; kategori yang dinyatakan “tidak memakai” dihitung sebagai aktivitas nol.</li>
        <li><b>Kelengkapan data (30%)</b>: jumlah dari 10 pertanyaan yang terjawab.</li>
        <li><b>Kecocokan bukti (30%)</b>: angka kWh dibandingkan dengan dokumen yang benar-benar diperiksa peninjau; cocok bila selisih ≤ 10%. Tanpa pemeriksaan: “Bukti Belum Dapat Diverifikasi”, bukan nol.</li>
        <li><b>Intensitas emisi (40%)</b>: emisi per unit produksi dibanding pembanding industri. Pembanding industri belum tersedia, sehingga komponen ini belum dinilai.</li>
        <li>Skor akhir hanya muncul bila ketiga komponen tersedia. Ini alat bantu pemantauan, bukan sertifikasi karbon atau jaminan kepatuhan PSPK.</li>
      </ul>
    </details>
  );
}
