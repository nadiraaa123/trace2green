"use client";
import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sub-navigation inside the Emisi & Skor menu (no extra sidebar item). */
export function EmisiTabs() {
  const path = usePathname();
  const tabs = [{ href: "/c/emisi-skor", label: "Ringkasan" }, { href: "/c/emisi-skor/cara-penilaian", label: "Cara Penilaian" }];
  return (
    <nav aria-label="Bagian Emisi & Skor" className="-mt-2 mb-6 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}
          className={clsx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium", path === t.href ? "border-brand-500 text-brand-700" : "border-transparent text-navy-500 hover:text-navy-900")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
