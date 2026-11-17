// Evidence storage abstraction.
//
// Firestore keeps METADATA only. File bytes go to an EvidenceStorage
// implementation. Today only the demo preview exists: the file is shown in the
// browser via an object URL and is never uploaded or kept. A future
// implementation (private bucket + server-issued signed upload URL) can be added
// without changing the wizard: it would return storageMode "object_storage".
import type { EvidenceKind, EvidenceStorageMode } from "@/lib/types";

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  tagihan_listrik: "Tagihan listrik / token",
  nota_bbm: "Nota pembelian bahan bakar",
  bukti_material: "Bukti pemakaian material/kemasan",
  lainnya: "Bukti lainnya",
};

export interface StoredEvidence {
  storageMode: EvidenceStorageMode;
  /** True only when bytes are durably stored in private storage. */
  persisted: boolean;
  /** Browser-only URL for previewing; never saved to Firestore. */
  previewUrl: string | null;
}

export interface EvidenceStorage {
  readonly mode: EvidenceStorageMode;
  readonly persistsFiles: boolean;
  store(file: File, ctx: { supplierId: string; reportId: string; kind: EvidenceKind }): Promise<StoredEvidence>;
}

export function validateEvidenceFile(file: { size: number; type: string }): string | null {
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) return "Format harus JPG, PNG, WEBP, HEIC, atau PDF";
  if (file.size <= 0) return "File kosong";
  if (file.size > MAX_EVIDENCE_BYTES) return "Ukuran file maksimal 5 MB";
  return null;
}

export class DemoPreviewStorage implements EvidenceStorage {
  readonly mode = "demo_preview" as const;
  readonly persistsFiles = false;
  async store(file: File): Promise<StoredEvidence> {
    const err = validateEvidenceFile(file);
    if (err) throw new Error(err);
    const previewUrl = typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : null;
    return { storageMode: this.mode, persisted: false, previewUrl };
  }
}

/** Single place to swap in a real private object storage later. */
export function getEvidenceStorage(): EvidenceStorage {
  return new DemoPreviewStorage();
}
