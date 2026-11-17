"use client";
import { clsx } from "clsx";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STATUS_LABEL } from "@/lib/constants";
import type { ReportStatus } from "@/lib/types";

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={clsx("rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function PageHeader({ title, back = "/s", action }: { title: string; back?: string | null; action?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 -mx-5 mb-4 flex h-14 items-center gap-2 border-b border-line/70 bg-white/90 px-3 backdrop-blur">
      {back !== null && (
        <button type="button" aria-label="Kembali" onClick={() => (back ? router.push(back) : router.back())}
          className="inline-flex size-10 items-center justify-center rounded-full text-navy-700 hover:bg-surface">
          <ArrowLeft className="size-5" />
        </button>
      )}
      <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      {action}
    </header>
  );
}

const STATUS_STYLE: Record<ReportStatus | "none", string> = {
  draft: "bg-slate-100 text-navy-700",
  submitted: "bg-amber-50 text-amber-700",
  revision_requested: "bg-orange-50 text-orange-700",
  verified: "bg-brand-50 text-brand-700",
  rejected: "bg-red-50 text-risk",
  none: "bg-slate-100 text-navy-500",
};

export function StatusBadge({ status }: { status: ReportStatus | null }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[status ?? "none"])}>
      {status ? STATUS_LABEL[status] : "Belum diisi"}
    </span>
  );
}

export function IconTile({ icon: Icon, tone = "brand" }: { icon: LucideIcon; tone?: "brand" | "blue" | "amber" | "violet" | "slate" }) {
  const t = { brand: "bg-brand-50 text-brand-600", blue: "bg-blue-50 text-info", amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600", slate: "bg-slate-100 text-navy-700" }[tone];
  return <span className={clsx("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", t)}><Icon className="size-5" /></span>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-500"><Icon className="size-6" /></span>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-navy-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link href={href} className={clsx(
      "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition",
      variant === "primary" ? "bg-brand-500 text-white hover:bg-brand-600" : "border border-line bg-white text-navy-900 hover:bg-surface",
      className)}>
      {children}
    </Link>
  );
}

export function SimulatedTag() {
  return <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">Data simulasi</span>;
}
