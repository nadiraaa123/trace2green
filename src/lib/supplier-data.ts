"use client";
// Real-time Firestore hooks for the supplier portal. Every query filters on the
// caller's supplierId so it satisfies the security rules.
import { collection, onSnapshot, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import type { ConsentDoc, EvidenceMetadataDoc, MonthlyReportDoc, RelationshipDoc, SupplierDoc, VerificationRecordDoc } from "@/lib/types";
import { useDoc } from "@/lib/useDoc";
import type { EmissionView, ScoreView } from "@/components/results/Breakdown";

type Row<T> = T & { id: string };
export interface ListState<T> { rows: Row<T>[]; loading: boolean; error: string | null }

export function useQuery<T>(col: string, constraints: QueryConstraint[] | null, deps: unknown[]): ListState<T> {
  const [state, setState] = useState<ListState<T>>({ rows: [], loading: true, error: null });
  useEffect(() => {
    if (!constraints) return;
    return onSnapshot(
      query(collection(db, col), ...constraints),
      (s) => setState({ rows: s.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false, error: null }),
      (e) => setState({ rows: [], loading: false, error: e.code }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useSupplierId() {
  return useAuth().claims.supplierId;
}

export function useSupplier() {
  const sid = useSupplierId();
  return useDoc<SupplierDoc>(sid ? `suppliers/${sid}` : null);
}

export function useMyReports() {
  const sid = useSupplierId();
  return useQuery<MonthlyReportDoc>("monthly_reports", sid ? [where("supplierId", "==", sid), orderBy("period", "desc")] : null, [sid]);
}

export function useRelationships() {
  const sid = useSupplierId();
  return useQuery<RelationshipDoc & { companyName?: string }>("company_supplier_relationships", sid ? [where("supplierId", "==", sid)] : null, [sid]);
}

export function useConsents() {
  const sid = useSupplierId();
  return useQuery<ConsentDoc & { propagation?: string }>("supplier_data_sharing_consents", sid ? [where("supplierId", "==", sid)] : null, [sid]);
}

export function useReportHistory(reportId: string) {
  const sid = useSupplierId();
  const s = useQuery<VerificationRecordDoc>("verification_records", sid ? [where("supplierId", "==", sid), where("reportId", "==", reportId)] : null, [sid, reportId]);
  const rows = [...s.rows].sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
  return { ...s, rows };
}

export function useEvidence(reportId: string) {
  const sid = useSupplierId();
  return useQuery<EvidenceMetadataDoc>("evidence_metadata", sid ? [where("supplierId", "==", sid), where("reportId", "==", reportId)] : null, [sid, reportId]);
}

export type ScoreDoc = ScoreView & { supplierId: string; period: string; reportId: string };
export type EmissionDoc = EmissionView & { supplierId: string; period: string; reportId: string };
export function useMyEmissions() {
  const sid = useSupplierId();
  return useQuery<EmissionDoc>("emission_results", sid ? [where("supplierId", "==", sid)] : null, [sid]);
}
export function useMyScores() {
  const sid = useSupplierId();
  return useQuery<ScoreDoc>("supplier_scores", sid ? [where("supplierId", "==", sid), orderBy("period", "desc")] : null, [sid]);
}

export interface RecommendationDoc { supplierId: string; period: string; items: { code: string; text: string; severity: string }[] }
export function useMyRecommendations() {
  const sid = useSupplierId();
  return useQuery<RecommendationDoc>("recommendations", sid ? [where("supplierId", "==", sid)] : null, [sid]);
}

/** Firestore Timestamp | Date | null → epoch ms (pending server timestamps sort last). */
export function ts(v: unknown): number {
  if (!v) return Number.MAX_SAFE_INTEGER;
  if (typeof v === "object" && v && "toMillis" in v) return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return Number.MAX_SAFE_INTEGER;
}

export function formatDateTime(v: unknown) {
  const ms = ts(v);
  if (ms === Number.MAX_SAFE_INTEGER) return "baru saja";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
}

export function useMyReviews() {
  const sid = useSupplierId();
  return useQuery<import("./review-status").ReviewLite>("company_reviews", sid ? [where("supplierId", "==", sid)] : null, [sid]);
}
