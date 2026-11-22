"use client";
// Company dashboard state: real-time summaries (≤ 12 small docs), company profile,
// and the shared source/period filters.
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import type { StatsRow } from "@/lib/kpi";
import type { CompanyDoc } from "@/lib/types";

export interface PeriodDoc { period: string; rows: StatsRow[]; generatedAt?: unknown }

interface Ctx {
  companyId: string;
  company: CompanyDoc | null;
  periods: PeriodDoc[]; // oldest → newest
  loading: boolean;
  error: string | null;
  /** True when the summaries include simulated (demo) suppliers → show the disclosure. */
  hasDemo: boolean;
  period: string | null;
  setPeriod: (p: string) => void;
  current: PeriodDoc | null;
  previous: PeriodDoc | null;
}

const C = createContext<Ctx | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { claims } = useAuth();
  const companyId = claims.companyId!;
  const [company, setCompany] = useState<CompanyDoc | null>(null);
  const [periods, setPeriods] = useState<PeriodDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => onSnapshot(doc(db, "companies", companyId), (s) => setCompany(s.exists() ? (s.data() as CompanyDoc) : null), () => setCompany(null)), [companyId]);
  useEffect(() => onSnapshot(
    query(collection(db, "company_period_stats"), where("companyId", "==", companyId), orderBy("period", "desc"), limit(12)),
    (s) => { setPeriods(s.docs.map((d) => d.data() as PeriodDoc).reverse()); setLoading(false); setError(null); },
    (e) => { setError(e.code); setLoading(false); },
  ), [companyId]);

  // Default period: most recent one that has any received report.
  const auto = useMemo(() => {
    const withData = [...periods].reverse().find((p) => p.rows.some((r) => ["submitted", "revision_requested", "imported_simulated"].includes(r.reportStatus)));
    return withData?.period ?? periods.at(-1)?.period ?? null;
  }, [periods]);
  const period = chosen && periods.some((p) => p.period === chosen) ? chosen : auto;
  const idx = periods.findIndex((p) => p.period === period);

  const value: Ctx = {
    companyId, company, periods, loading, error,
    hasDemo: periods.some((p) => p.rows.some((r) => r.source === "demo")),
    period, setPeriod: setChosen,
    current: idx >= 0 ? periods[idx] : null,
    previous: idx > 0 ? periods[idx - 1] : null,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useCompany() {
  const v = useContext(C);
  if (!v) throw new Error("useCompany outside CompanyProvider");
  return v;
}
