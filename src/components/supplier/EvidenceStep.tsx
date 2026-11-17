"use client";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { FileText, ImagePlus, Info, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Field";
import { Card } from "@/components/supplier/ui";
import { EVIDENCE_KIND_LABEL, getEvidenceStorage, validateEvidenceFile } from "@/lib/evidence/storage";
import { db } from "@/lib/firebase/client";
import { useEvidence } from "@/lib/supplier-data";
import type { EvidenceKind } from "@/lib/types";

// Browser-only preview URLs for this tab session. Never written to Firestore.
const previews = new Map<string, string>();
const KINDS = Object.keys(EVIDENCE_KIND_LABEL) as EvidenceKind[];
const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function EvidenceStep({ supplierId, reportId }: { supplierId: string; reportId: string }) {
  const storage = getEvidenceStorage();
  const evidence = useEvidence(reportId);
  const [kind, setKind] = useState<EvidenceKind>("tagihan_listrik");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const invalid = validateEvidenceFile(file);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    try {
      const stored = await storage.store(file, { supplierId, reportId, kind });
      const ref = await addDoc(collection(db, "evidence_metadata"), {
        supplierId, reportId, kind, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size,
        storageMode: stored.storageMode, sharedWith: [], dataSource: "trial", isSimulated: false, createdAt: serverTimestamp(),
      });
      if (stored.previewUrl) previews.set(ref.id, stored.previewUrl);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Gagal mencatat bukti.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    try {
      await deleteDoc(doc(db, "evidence_metadata", id));
    } catch {
      setError("Bukti yang sudah dikirim bersama laporan tidak dapat dihapus (tetap tercatat sebagai riwayat).");
      return;
    }
    const url = previews.get(id);
    if (url) URL.revokeObjectURL(url);
    previews.delete(id);
  }

  return (
    <section className="mt-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">3. Bukti pendukung</h2>
        <p className="text-sm text-navy-500">Opsional. Bukti membantu perusahaan memeriksa kecocokan data.</p>
      </div>

      {!storage.persistsFiles && (
        <div role="note" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Mode demo: file tidak diunggah</p>
            <p className="mt-1 text-amber-900/80">
              File hanya ditampilkan di perangkat ini sebagai pratinjau dan <b>tidak disimpan</b> di server.
              Yang tercatat hanya nama, jenis, dan ukuran file. Bukti ini belum dianggap terverifikasi.
            </p>
          </div>
        </div>
      )}

      <Card className="space-y-3 p-4">
        <label className="block text-sm font-medium text-navy-700" htmlFor="ev-kind">Jenis bukti</label>
        <select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}
          className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-brand-500">
          {KINDS.map((k) => <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>)}
        </select>
        <input ref={input} id="ev-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        <label htmlFor="ev-file" aria-disabled={busy}
          className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 text-sm font-medium text-brand-700 hover:bg-brand-50">
          <ImagePlus className="size-6" />
          {busy ? "Memproses…" : "Pilih foto atau PDF (maks. 5 MB)"}
        </label>
        {error && <Alert>{error}</Alert>}
      </Card>

      {evidence.rows.length > 0 && (
        <Card className="divide-y divide-line">
          {evidence.rows.map((e) => {
            const url = previews.get(e.id);
            return (
              <div key={e.id} className="flex items-center gap-3 p-3">
                {url && e.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={url} alt={`Pratinjau ${e.fileName}`} className="size-14 shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                  <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface text-navy-300"><FileText className="size-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.fileName}</p>
                  <p className="text-xs text-navy-500">{EVIDENCE_KIND_LABEL[e.kind]} · {fmtSize(e.sizeBytes)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                    {url ? "Pratinjau demo · tidak tersimpan" : "File tidak tersimpan · hanya data file yang tercatat"}
                  </p>
                </div>
                <button type="button" onClick={() => remove(e.id)} aria-label={`Hapus ${e.fileName}`} className="inline-flex size-9 items-center justify-center rounded-full text-navy-500 hover:bg-red-50 hover:text-risk">
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
