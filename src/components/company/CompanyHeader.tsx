"use client";
import { clsx } from "clsx";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DemoDateBanner } from "@/components/DemoDateBanner";
import { Logo } from "@/components/ui/Logo";

// Interim company navigation (Phase 3). Phase 4 replaces it with the full dashboard sidebar.
const NAV = [{ href: "/c", label: "Ringkasan" }, { href: "/c/verifikasi", label: "Verifikasi" }];

export function CompanyHeader() {
  const { user, signOut } = useAuth();
  const path = usePathname();
  return (
    <>
      <DemoDateBanner />
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => {
              const active = n.href === "/c" ? path === "/c" : path.startsWith(n.href);
              return <Link key={n.href} href={n.href} className={clsx("rounded-lg px-3 py-1.5 font-medium", active ? "bg-brand-50 text-brand-700" : "text-navy-500 hover:text-navy-900")}>{n.label}</Link>;
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-navy-500">
          <span>{user?.email}</span>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 hover:text-navy-900"><LogOut className="size-4" /> Keluar</button>
        </div>
      </header>
    </>
  );
}
