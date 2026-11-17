"use client";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { db } from "@/lib/firebase/client";
import type { CompanyDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";

// Phase 1 placeholder: verifies company-scoped reads. Full dashboard is Phase 4.
export default function CompanyHome() {
  const { claims, signOut, user } = useAuth();
  const { data } = useDoc<CompanyDoc>(claims.companyId ? `companies/${claims.companyId}` : null);
  const [related, setRelated] = useState<number | null>(null);

  useEffect(() => {
    if (!claims.companyId) return;
    getCountFromServer(query(collection(db, "company_supplier_relationships"), where("companyId", "==", claims.companyId)))
      .then((s) => setRelated(s.data().count))
      .catch(() => setRelated(null));
  }, [claims.companyId]);

  return (
    <main className="mx-auto max-w-5xl px-8 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4 text-sm text-navy-500">
          <span>{user?.email}</span>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 hover:text-navy-900">
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      </header>
      <h1 className="mt-10 text-2xl font-semibold">{data?.name ?? claims.companyId}</h1>
      <p className="mt-1 text-sm text-navy-500">Pemasok terhubung: {related ?? "—"}</p>
      <div className="mt-6 max-w-xl"><Alert tone="info">Dasbor perusahaan dibangun pada Fase 4.</Alert></div>
    </main>
  );
}
