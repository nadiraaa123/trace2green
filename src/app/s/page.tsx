"use client";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { useDoc } from "@/lib/useDoc";
import type { SupplierDoc } from "@/lib/types";

// Phase 1 placeholder: proves auth → custom claims → rules → live read.
// The full supplier home (hero, status cards, features) is built in Phase 2.
export default function SupplierHome() {
  const { claims, signOut } = useAuth();
  const { data, loading, error } = useDoc<SupplierDoc>(claims.supplierId ? `suppliers/${claims.supplierId}` : null);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-white px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <button onClick={signOut} className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-900">
          <LogOut className="size-4" /> Keluar
        </button>
      </header>
      <h1 className="mt-8 text-xl font-semibold">
        Halo, {loading ? "…" : data?.businessName ?? "Pemasok"}!
      </h1>
      <p className="mt-1 text-sm text-navy-500">ID Pemasok: <span className="font-mono">{claims.supplierId}</span></p>
      {error && <div className="mt-4"><Alert>Gagal memuat profil ({error}).</Alert></div>}
      <div className="mt-6"><Alert tone="info">Portal pelaporan sedang disiapkan (Fase 2).</Alert></div>
    </main>
  );
}
