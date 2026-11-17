// Shared Firestore schema types. See docs/ARCHITECTURE.md §2.

export type DataSource = "demo" | "trial" | "production";
export type Role = "supplier" | "company_admin" | "platform_admin";

export type ReportStatus =
  | "draft"
  | "submitted" // Menunggu Verifikasi
  | "revision_requested"
  | "verified"
  | "rejected";

export type ScoreColor = "HIJAU" | "KUNING" | "MERAH";
export type ScoreType = "simulated" | "provisional" | "verified";
export type FactorStatus = "simulated" | "verified";

export type ActivityCategory =
  | "listrik"
  | "bbm"
  | "kemasan"
  | "limbah"
  | "transportasi";

export interface BaseDoc {
  dataSource: DataSource;
  isSimulated: boolean;
  createdAt: unknown; // Firestore Timestamp (client or admin SDK)
  updatedAt: unknown;
}

export interface UserDoc extends BaseDoc {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  companyId: string | null;
  supplierId: string | null;
}

export interface CompanyDoc extends BaseDoc {
  companyId: string;
  name: string;
  plan: "trial" | "subscription";
}

export interface SupplierDoc extends BaseDoc {
  supplierId: string;
  businessName: string;
  picName: string | null;
  sector: string | null;
  region: string | null;
  whatsapp: string | null;
  mainProduct: string | null;
  employees: number | null;
  ownerUid: string | null;
  claimStatus: "unclaimed" | "claimed" | "self_registered";
  /** Companies with a relationship; lets them read this basic profile. */
  linkedCompanies: string[];
  privacyConsentAt: unknown | null;
}

export interface RelationshipDoc extends BaseDoc {
  companyId: string;
  supplierId: string;
  isCritical: boolean;
  status: "invited" | "active" | "ended";
}

export interface ConsentDoc extends BaseDoc {
  companyId: string;
  supplierId: string;
  granted: boolean;
  method: "seed_simulated" | "supplier_in_app";
  grantedByUid: string | null;
  grantedAt: unknown | null;
  revokedAt: unknown | null;
}

/**
 * All fields nullable: null = not answered (missing), never coerced to zero.
 * A category the supplier explicitly does not use goes in `notApplicable`.
 */
export interface ActivityData {
  electricityKwh: number | null;
  fuelQuantity: number | null;
  fuelUnit: "liter" | "kg" | null;
  fuelType: "Bensin" | "Solar" | "LPG" | "Lainnya" | null;
  packagingKg: number | null;
  packagingMaterial: string | null;
  wasteKg: number | null;
  wasteHandling: string | null;
  rawMaterialOrigin: "Lokal" | "Regional" | "Impor" | null;
  transportMode: "Motor" | "Mobil bak" | "Truk" | null;
  transportKm: number | null;
  efficiencyPractice: "Belum" | "Sebagian" | "Sudah ada" | null;
  notApplicable: ActivityCategory[];
}

export interface ReportProfile {
  businessName: string | null;
  sector: string | null;
  mainProduct: string | null;
  productionVolume: number | null;
  productionUnit: string | null;
  employees: number | null;
}

export interface MonthlyReportDoc extends BaseDoc {
  reportId: string; // `${supplierId}_${period}`
  supplierId: string;
  period: string; // YYYY-MM
  status: ReportStatus;
  profile: ReportProfile;
  activity: ActivityData;
  draftStep: number;
  version: number;
  sharedWith: string[];
  submittedAt: unknown | null;
}

export type EvidenceKind = "tagihan_listrik" | "nota_bbm" | "bukti_material" | "lainnya";
/**
 * demo_preview: file is only previewed in the browser, never uploaded or kept.
 * object_storage: reserved for a future private bucket (written by the server only).
 */
export type EvidenceStorageMode = "demo_preview" | "object_storage";

export interface EvidenceMetadataDoc {
  supplierId: string;
  reportId: string;
  kind: EvidenceKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageMode: EvidenceStorageMode;
  sharedWith: string[];
  dataSource: DataSource;
  isSimulated: boolean;
  createdAt: unknown;
}

/** Append-only status history (supplier and reviewer actions). */
export interface VerificationRecordDoc {
  reportId: string;
  supplierId: string;
  action:
    | "submitted"
    | "resubmitted"
    | "supplier_correction_request"
    | "approve"
    | "request_revision"
    | "reject"
    | "sample_audit";
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus | null;
  actorUid: string | null;
  actorRole: Role | "system";
  note: string | null;
  version: number | null;
  sharedWith: string[];
  dataSource: DataSource;
  isSimulated: boolean;
  createdAt: unknown;
}
