"use client";
// Shell for INTERNAL Trace2Green workspaces (Platform Admin, Customer Success).
// Deliberately separate from the company portal so it never becomes an internal console.
import { clsx } from "clsx";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoMark } from "@/components/ui/Logo";

export interface NavItem { href: string; label: string; icon: LucideIcon; exact?: boolean }

export function InternalShell({ nav, workspace, children }: { nav: NavItem[]; workspace: string; children: React.ReactNode }) {
  const path = usePathname();
  const { user, claims, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const active = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(`${n.href}/`));
  return (
    <div className="min-h-dvh bg-surface lg:pl-64">
      <aside className={clsx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 py-5 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-2 flex items-center justify-between px-6">
          <span className="inline-flex items-center gap-2 text-lg font-semibold text-white"><LogoMark className="size-10" /> trace2green</span>
          <button className="text-white/80 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="size-5" /></button>
        </div>
        <p className="mb-5 px-6 text-[11px] font-semibold uppercase tracking-wider text-white/50">{workspace} · internal</p>
        <nav aria-label={`Menu ${workspace}`} className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active(n) ? "page" : undefined}
              className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active(n) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
              <n.icon className="size-[18px]" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mx-3 mt-4 rounded-xl bg-white/10 p-3 text-xs text-white/80">
          <p className="font-semibold text-white">{workspace}{claims.csId ? ` · ${claims.csId}` : ""}</p>
          <p className="truncate">{user?.email}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-1.5 font-medium text-white hover:underline"><LogOut className="size-3.5" /> Keluar</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <button className="mb-3 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm lg:hidden" onClick={() => setOpen(true)}><Menu className="size-4" /> Menu</button>
        {children}
      </div>
    </div>
  );
}

export function InternalTop({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Marks projection content so it is never read as operational traction. */
export function ProjectionNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="projection-note">
      <b>Proyeksi model keuangan 2027–2031</b> — target bisnis, bukan pelanggan, pembayaran, atau kontrak nyata. {children}
    </p>
  );
}
