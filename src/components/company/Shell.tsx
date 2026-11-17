"use client";
import { clsx } from "clsx";
import { BarChart3, ClipboardCheck, Database, FileText, LayoutDashboard, Lightbulb, LogOut, Menu, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DemoDateBanner } from "@/components/DemoDateBanner";
import { LogoMark } from "@/components/ui/Logo";
import { formatPeriod } from "@/lib/period";
import type { SourceFilter } from "@/lib/kpi";
import { useCompany } from "./CompanyContext";

const NAV = [
  { href: "/c", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/c/pemasok", label: "Pemasok", icon: Users },
  { href: "/c/pengumpulan", label: "Pengumpulan Data", icon: Database },
  { href: "/c/verifikasi", label: "Verifikasi", icon: ClipboardCheck },
  { href: "/c/emisi-skor", label: "Emisi & Skor", icon: BarChart3 },
  { href: "/c/laporan", label: "Laporan", icon: FileText },
  { href: "/c/insight", label: "Insight & Rekomendasi", icon: Lightbulb },
  { href: "/c/pengaturan", label: "Pengaturan", icon: Settings },
];

const SOURCES: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "demo", label: "Simulasi" }, { key: "trial", label: "Trial" },
];

export function CompanyShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const { company, companyId } = useCompany();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/c" ? path === "/c" : path.startsWith(href));

  const nav = (
    <nav aria-label="Menu perusahaan" className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active(href) ? "page" : undefined}
          className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
            active(href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
          <Icon className="size-[18px]" /> {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-surface lg:pl-64 print:pl-0">
      <aside className={clsx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-700 py-5 transition-transform no-print lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-6 flex items-center justify-between px-6">
          <span className="inline-flex items-center gap-2 text-lg font-semibold text-white"><span className="rounded-lg bg-white p-1"><LogoMark className="size-6" /></span> trace2green</span>
          <button className="text-white/80 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="size-5" /></button>
        </div>
        {nav}
        <div className="mx-3 mt-4 rounded-xl bg-white/10 p-3 text-xs text-white/80">
          <p className="font-semibold text-white">{company?.name ?? companyId}</p>
          <p className="truncate">{user?.email}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-1.5 font-medium text-white hover:underline"><LogOut className="size-3.5" /> Keluar</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <button className="mb-3 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm lg:hidden no-print" onClick={() => setOpen(true)}>
          <Menu className="size-4" /> Menu
        </button>
        <div className="no-print"><DemoDateBanner /></div>
        {children}
      </div>
    </div>
  );
}

/** Page title + the shared filter row (source + period). */
export function PageTop({ title, subtitle, period = true, source = true, actions }: { title: string; subtitle?: string; period?: boolean; source?: boolean; actions?: React.ReactNode }) {
  const c = useCompany();
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 no-print">
        {source && (
          <div role="group" aria-label="Sumber data" className="inline-flex rounded-xl border border-line bg-white p-1 text-sm">
            {SOURCES.map((s) => (
              <button key={s.key} aria-pressed={c.source === s.key} onClick={() => c.setSource(s.key)}
                className={clsx("rounded-lg px-3 py-1.5 font-medium", c.source === s.key ? "bg-brand-500 text-white" : "text-navy-700 hover:bg-surface")}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        {period && c.periods.length > 0 && (
          <select aria-label="Periode" value={c.period ?? ""} onChange={(e) => c.setPeriod(e.target.value)}
            className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-medium">
            {[...c.periods].reverse().map((p) => <option key={p.period} value={p.period}>{formatPeriod(p.period)}</option>)}
          </select>
        )}
        {actions}
      </div>
    </div>
  );
}
