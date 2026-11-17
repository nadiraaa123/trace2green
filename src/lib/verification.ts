/**
 * How a reviewer obtained an independently checked kWh value. A filename or
 * metadata in the app is deliberately NOT an option: in demo mode no file is
 * stored, so nothing can be inspected inside the app.
 */
export const CHECK_SOURCES = {
  dokumen_asli: "Dokumen asli diperiksa langsung",
  salinan_di_luar_sistem: "Salinan dokumen diterima di luar sistem (WhatsApp/email)",
  kunjungan_lapangan: "Kunjungan/audit lapangan",
} as const;
export type CheckSource = keyof typeof CHECK_SOURCES;
