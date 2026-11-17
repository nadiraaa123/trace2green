// Supplier-facing status that reflects company-scoped decisions.
import type { MonthlyReportDoc } from "./types";

export interface ReviewLite { companyId: string; reportId: string; reportVersion: number; status: "pending" | "verified" | "revision_requested" | "rejected" | "awaiting_resubmission"; note?: string | null; score?: import("@/components/results/Breakdown").ScoreView | null }

export function supplierStatus(r: Pick<MonthlyReportDoc, "status" | "version" | "sharedWith" | "reportId">, reviews: ReviewLite[]): { label: string; tone: "draft" | "submitted" | "revision_requested" | "verified" | "rejected" | "imported_simulated" | "partial" } {
  if (r.status === "draft") return { label: "Draf", tone: "draft" };
  if (r.status === "imported_simulated") return { label: "Data Simulasi", tone: "imported_simulated" };
  if (r.status === "revision_requested") return { label: "Perlu Perbaikan", tone: "revision_requested" };
  const current = reviews.filter((v) => v.reportId === r.reportId && v.reportVersion === r.version && (r.sharedWith ?? []).includes(v.companyId));
  const n = (r.sharedWith ?? []).length;
  const verified = current.filter((v) => v.status === "verified").length;
  const rejected = current.filter((v) => v.status === "rejected").length;
  if (n > 0 && verified === n) return { label: "Terverifikasi", tone: "verified" };
  if (n > 0 && rejected === n) return { label: "Ditolak", tone: "rejected" };
  if (verified + rejected > 0) return { label: `Diputuskan ${verified + rejected} dari ${n} perusahaan`, tone: "partial" };
  return { label: "Menunggu Verifikasi", tone: "submitted" };
}
