"use client";
import { clsx } from "clsx";
import { FileText, Home, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/s", label: "Beranda", icon: Home, match: (p: string) => p === "/s" },
  { href: "/s/laporan", label: "Laporan", icon: FileText, match: (p: string) => p.startsWith("/s/laporan") },
  { href: "/s/profil", label: "Profil", icon: User, match: (p: string) => p.startsWith("/s/profil") || p.startsWith("/s/perusahaan") },
];

export function BottomNav() {
  const path = usePathname();
  if (/^\/s\/laporan\/[^/]+\/isi/.test(path)) return null; // wizard has its own action bar
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={clsx("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-brand-600" : "text-navy-500")}>
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
