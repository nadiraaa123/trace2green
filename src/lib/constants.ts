import type { ReportStatus, Role } from "./types";

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const SUPPLIER_ID_RE = /^SUP-\d{3,}$/;

export const reportId = (supplierId: string, period: string) =>
  `${supplierId}_${period}`;

export const formatSupplierId = (n: number) =>
  `SUP-${String(n).padStart(3, "0")}`;

export const ROLE_HOME: Record<Role, string> = {
  supplier: "/s",
  company_admin: "/c",
  platform_admin: "/admin",
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draf",
  submitted: "Menunggu Verifikasi",
  revision_requested: "Perlu Perbaikan",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

/** Fields a supplier may write directly while a report is still editable. */
export const DRAFT_WRITABLE_FIELDS = [
  "profile",
  "activity",
  "draftStep",
  "updatedAt",
] as const;

export const SUPPLIER_PROFILE_WRITABLE_FIELDS = [
  "businessName",
  "picName",
  "sector",
  "region",
  "whatsapp",
  "mainProduct",
  "employees",
  "updatedAt",
] as const;

export const SECTORS = [
  "Roti & kue",
  "Kemasan",
  "Bahan baku segar",
  "Bumbu & olahan",
  "Minuman",
  "Lainnya",
] as const;
