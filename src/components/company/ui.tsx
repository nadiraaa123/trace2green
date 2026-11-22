"use client";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import type { RowReportStatus, RowReviewStatus, Source } from "@/lib/kpi";

/** Validated categorical pair (dataviz validator: CVD ΔE 29, normal ΔE 35). */
export const SOURCE_COLOR: Record<Source, string> = { demo: "#6250d6", trial: "#eb6834" };
/** Reserved status colors; always shown with a text label. */
export const STATUS_COLOR = { HIJAU: "#168B73", KUNING: "#d99a1e", MERAH: "#d6453d", none: "#a3afc0" } as const;

export function Panel({ title, subtitle, action, className, children }: { title?: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={clsx("rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const REPORT_LABEL: Record<RowReportStatus, [string, string]> = {
  no_consent: ["Belum izin data", "bg-slate-100 text-navy-500"],
  missing: ["Belum mengirim", "bg-red-50 text-risk"],
  draft: ["Draf", "bg-slate-100 text-navy-700"],
  submitted: ["Terkirim", "bg-blue-50 text-info"],
  revision_requested: ["Perlu perbaikan", "bg-orange-50 text-orange-700"],
  imported_simulated: ["Data simulasi", "bg-violet-50 text-violet-700"],
};
export function ReportPill({ status }: { status: RowReportStatus }) {
  const [t, c] = REPORT_LABEL[status];
  return <span className={clsx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", c)}>{t}</span>;
}

const REVIEW_LABEL: Record<Exclude<RowReviewStatus, null>, [string, string]> = {
  pending: ["Menunggu Verifikasi", "bg-amber-50 text-amber-700"],
  verified: ["Terverifikasi", "bg-brand-50 text-brand-700"],
  revision_requested: ["Diminta perbaikan", "bg-orange-50 text-orange-700"],
  rejected: ["Ditolak", "bg-red-50 text-risk"],
  awaiting_resubmission: ["Menunggu kiriman ulang", "bg-slate-100 text-navy-700"],
};
export function ReviewPill({ status, source }: { status: RowReviewStatus; source: Source }) {
  if (source === "demo") return <span className="text-xs text-navy-300">Tidak berlaku</span>;
  if (!status) return <span className="text-xs text-navy-300">—</span>;
  const [t, c] = REVIEW_LABEL[status];
  return <span className={clsx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", c)}>{t}</span>;
}

export function ColorPill({ color }: { color: "HIJAU" | "KUNING" | "MERAH" | null }) {
  if (!color) return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-navy-500">Belum Dinilai</span>;
  const c = { HIJAU: "bg-brand-50 text-brand-700", KUNING: "bg-amber-50 text-amber-700", MERAH: "bg-red-50 text-risk" }[color];
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", c)}>{color}</span>;
}

export const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("id-ID", { maximumFractionDigits: d }));
export const tco2 = (kg: number) => `${(kg / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} tCO₂e`;

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-navy-500">{children}</p>;
}

export function MethodBadges() {
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-navy-500">
      Estimasi memakai faktor emisi ilustrasi. Data kosong tidak dihitung nol. Pemasok bertanda “simulasi” adalah data contoh fiktif.
      Bukan sertifikasi karbon dan bukan jaminan kepatuhan PSPK.
    </p>
  );
}

/** Small marker so simulated suppliers are never mistaken for real customers. */
export function SimTag({ source }: { source: Source }) {
  return source === "demo" ? <span className="ml-1.5 inline-flex rounded bg-violet-50 px-1.5 py-0.5 align-middle text-[10px] font-medium text-violet-700">simulasi</span> : null;
}

/** Simple KPI tile: one main number and a short label. */
export function StatCard({ icon: Icon, label, value, hint, testId }: { icon: LucideIcon; label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]" data-testid={testId}>
      <div className="flex items-center gap-2.5 text-sm font-medium text-navy-500">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-[18px]" /></span>
        {label}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-sm text-navy-500">{hint}</p>}
    </div>
  );
}
