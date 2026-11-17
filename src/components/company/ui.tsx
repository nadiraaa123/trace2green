"use client";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { SOURCE_LABEL, type RowReportStatus, type RowReviewStatus, type Source, type SourceKpis } from "@/lib/kpi";

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

export function SourceDot({ source }: { source: Source }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: SOURCE_COLOR[source] }} />;
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", source === "demo" ? "bg-violet-50 text-violet-700" : "bg-orange-50 text-orange-700")}>
      <SourceDot source={source} /> {SOURCE_LABEL[source]}
    </span>
  );
}

/** A KPI tile. With several sources each gets its own labeled line — never a blended number. */
export function KpiCard({ icon: Icon, label, groups, render, note, testId }: {
  icon: LucideIcon; label: string; groups: SourceKpis[];
  render: (k: SourceKpis) => { value: string; sub?: string };
  note?: string; testId?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]" data-testid={testId}>
      <div className="flex items-center gap-2 text-sm text-navy-500">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" /></span>
        {label}
      </div>
      <div className="mt-3 space-y-2">
        {groups.map((k) => {
          const v = render(k);
          return (
            <div key={k.source} data-testid={testId ? `${testId}-${k.source}` : undefined}>
              {groups.length > 1 && <p className="flex items-center gap-1.5 text-[11px] font-medium text-navy-500"><SourceDot source={k.source} /> {SOURCE_LABEL[k.source]}</p>}
              <p className={clsx("font-semibold tracking-tight", groups.length > 1 ? "text-xl" : "text-[1.7rem]")}>{v.value}</p>
              {v.sub && <p className="text-xs text-navy-500">{v.sub}</p>}
            </div>
          );
        })}
      </div>
      {note && <p className="mt-2 text-[11px] text-navy-300">{note}</p>}
    </div>
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
    <p className="text-[11px] leading-relaxed text-navy-500">
      <SourceBadge source="demo" /> nilai asli workbook simulasi (faktor & rata-rata kelompok ilustrasi).{" "}
      <SourceBadge source="trial" /> dihitung mesin Trace2Green dari data pemasok; komponen yang belum tersedia tidak dihitung nol.
      Bukan sertifikasi karbon dan bukan jaminan kepatuhan PSPK.
    </p>
  );
}
