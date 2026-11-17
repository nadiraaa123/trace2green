"use client";
import { firebaseConfigured } from "@/lib/firebase/client";

/** Visible warning when the deployment lacks Firebase web config (instead of silent failures). */
export function ConfigNotice() {
  if (firebaseConfigured) return null;
  return (
    <div role="alert" className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Firebase belum dikonfigurasi pada deployment ini (variabel NEXT_PUBLIC_FIREBASE_* kosong). Masuk dan pelaporan belum dapat digunakan.
    </div>
  );
}
