"use client";
import {
  Award, Building2, CalendarCheck, ChevronDown, ChevronRight, ClipboardList, FilePlus2, HelpCircle,
  History, Lightbulb, LogOut, Store, UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportIllustration } from "@/components/illustrations/ReportIllustration";
import { Logo } from "@/components/ui/Logo";
import { Card, DerivedStatus, IconTile, StatusBadge } from "@/components/supplier/ui";
import { defaultPeriod, formatPeriod } from "@/lib/period";
import { useConsents, useMyReports, useMyReviews, useMyScores, useRelationships, useSupplier } from "@/lib/supplier-data";

const FEATURES = [
  { href: "/s/laporan/baru", label: "Isi Laporan", desc: "Laporan bulanan", icon: FilePlus2, tone: "brand" as const },
  { href: "/s/laporan", label: "Riwayat Laporan", desc: "Status & versi", icon: History, tone: "blue" as const },
  { href: "/s/hasil", label: "Hasil Penilaian", desc: "Skor & emisi", icon: Award, tone: "amber" as const },
  { href: "/s/rekomendasi", label: "Rekomendasi", desc: "Saran perbaikan", icon: Lightbulb, tone: "violet" as const },
  { href: "/s/profil", label: "Profil Usaha", desc: "Data usaha", icon: Store, tone: "slate" as const },
  { href: "/s/bantuan", label: "Bantuan", desc: "Panduan & FAQ", icon: HelpCircle, tone: "slate" as const },
];

export default function SupplierHome() {
  const { user, signOut } = useAuth();
  const { data: supplier } = useSupplier();
  const reports = useMyReports();
  const scores = useMyScores();
  const rels = useRelationships();
  const consents = useConsents();
  const reviews = useMyReviews();
  const [menu, setMenu] = useState(false);

  const period = defaultPeriod();
  const current = reports.rows.find((r) => r.period === period) ?? null;
  const submittedCount = reports.rows.filter((r) => r.status !== "draft").length;
  const awaiting = reports.rows.some((r) => r.status === "submitted");
  const latestScore = scores.rows[0] ?? null;
  const sharing = consents.rows.filter((c) => c.granted).length;

  const ctaHref = !current
    ? "/s/laporan/baru"
    : current.status === "draft" || current.status === "revision_requested"
      ? `/s/laporan/${period}/isi`
      : `/s/laporan/${period}`;
  const ctaLabel = !current ? "Isi Laporan Bulanan" : current.status === "draft" ? "Lanjutkan Draf" : current.status === "revision_requested" ? "Perbaiki Laporan" : "Lihat Laporan";

  return (
    <>
      <header className="flex items-center justify-between pt-5">
        <Logo size="sm" />
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu profil"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-1 pr-2 text-navy-700">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {(supplier?.picName ?? user?.displayName ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <ChevronDown className="size-4" />
          </button>
          {menu && (
            <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-lg">
              <p className="truncate px-4 py-2 text-xs text-navy-500">{user?.email}</p>
              <Link href="/s/profil" className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface"><UserRound className="size-4" /> Profil Usaha</Link>
              <Link href="/s/perusahaan" className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface"><Building2 className="size-4" /> Perusahaan Terhubung</Link>
              <button onClick={signOut} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-risk hover:bg-surface"><LogOut className="size-4" /> Keluar</button>
            </div>
          )}
        </div>
      </header>

      <p className="mt-6 text-sm text-navy-500">Halo, {supplier?.businessName ?? "…"}!</p>

      <Card className="relative mt-2 overflow-hidden border-brand-100 bg-gradient-to-br from-white to-brand-50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Catat · Kirim · Pantau</p>
        <h1 className="mt-2 max-w-[13rem] text-[1.6rem] font-semibold leading-tight tracking-tight">
          Pelaporan Lingkungan Jadi <span className="text-brand-500">Lebih Mudah</span>
        </h1>
        <p className="mt-2 max-w-[15rem] text-sm leading-relaxed text-navy-500">
          Catat aktivitas usaha setiap bulan dan pantau perkembangan lingkungan usaha Anda.
        </p>
        <Link href={ctaHref} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">
          <FilePlus2 className="size-4" /> {ctaLabel}
        </Link>
        <ReportIllustration className="pointer-events-none absolute -bottom-3 -right-8 w-40 opacity-90" />
      </Card>

      <section aria-label="Ringkasan" className="mt-4 grid grid-cols-2 gap-3">
        <StatCard icon={CalendarCheck} label={`Status ${formatPeriod(period)}`} loading={reports.loading}>
          {current ? <DerivedStatus report={current} reviews={reviews.rows} /> : <StatusBadge status={null} />}
        </StatCard>
        <StatCard icon={ClipboardList} label="Laporan Sebelumnya" loading={reports.loading}>
          <span className="text-2xl font-semibold">{submittedCount}</span>
          <span className="ml-1 text-xs text-navy-500">terkirim</span>
        </StatCard>
        <StatCard icon={Award} label="Skor Terakhir" loading={scores.loading}>
          {latestScore?.final != null ? (
            <span className="text-2xl font-semibold">{latestScore.final}<span className="text-sm text-navy-500">/100</span></span>
          ) : (
            <span className="text-sm font-medium text-navy-700">{awaiting ? "Menunggu Verifikasi" : "Belum Dinilai"}</span>
          )}
        </StatCard>
        <StatCard icon={Building2} label="Perusahaan Terhubung" loading={rels.loading} href="/s/perusahaan">
          <span className="text-2xl font-semibold">{rels.rows.length}</span>
          <span className="ml-1 text-xs text-navy-500">{sharing} menerima data</span>
        </StatCard>
      </section>

      <section className="mt-7">
        <h2 className="text-base font-semibold">Menu</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-card)] transition hover:border-brand-200">
              <IconTile icon={f.icon} tone={f.tone} />
              <span className="text-[13px] font-semibold leading-tight">{f.label}</span>
              <span className="-mt-1.5 text-[11px] text-navy-500">{f.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Laporan Terbaru</h2>
          <Link href="/s/laporan" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600">Lihat semua <ChevronRight className="size-4" /></Link>
        </div>
        <div className="mt-3 space-y-2.5">
          {reports.loading ? (
            <Card className="h-16 animate-pulse" />
          ) : reports.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-navy-500">
              Belum ada laporan. Mulai dengan laporan {formatPeriod(period)}.
            </p>
          ) : (
            reports.rows.slice(0, 3).map((r) => (
              <Link key={r.id} href={`/s/laporan/${r.period}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-[var(--shadow-card)]">
                <IconTile icon={ClipboardList} tone={r.status === "verified" ? "brand" : "blue"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Laporan {formatPeriod(r.period)}</p>
                  <p className="text-xs text-navy-500">{r.version > 0 ? `Versi ${r.version}` : "Belum dikirim"}</p>
                </div>
                <DerivedStatus report={r} reviews={reviews.rows} />
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function StatCard({ icon: Icon, label, loading, children, href }: { icon: typeof Award; label: string; loading: boolean; children: React.ReactNode; href?: string }) {
  const body = (
    <Card className="flex h-full flex-col gap-2 p-3.5">
      <span className="flex items-center gap-1.5 text-xs text-navy-500"><Icon className="size-3.5 text-brand-500" /> {label}</span>
      <div className="flex min-h-8 items-baseline">{loading ? <span className="h-6 w-16 animate-pulse rounded bg-surface" /> : children}</div>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
