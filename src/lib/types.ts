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

/** All fields optional + nullable: missing must stay missing, never zero. */
export interface ActivityData {
  electricityKwh: number | null;
  fuelLiters: number | null;
  fuelType: string | null;
  packagingKg: number | null;
  packagingMaterial: string | null;
  wasteKg: number | null;
  wasteHandling: string | null;
  rawMaterialOrigin: "Lokal" | "Regional" | "Impor" | null;
  transportMode: "Motor" | "Mobil bak" | "Truk" | null;
  transportKm: number | null;
  efficiencyPractice: "Belum" | "Sebagian" | "Sudah ada" | null;
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
