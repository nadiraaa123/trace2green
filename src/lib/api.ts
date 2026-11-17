"use client";
import { auth } from "@/lib/firebase/client";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** POST to our own /api routes with the current user's Firebase ID token. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? "error", json.message ?? "Terjadi kesalahan.", res.status);
  return json as T;
}

/** Firebase Auth error codes → Indonesian messages. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "Email sudah terdaftar. Silakan masuk.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/weak-password": "Kata sandi minimal 8 karakter.",
    "auth/invalid-credential": "Email atau kata sandi salah.",
    "auth/user-not-found": "Email atau kata sandi salah.",
    "auth/wrong-password": "Email atau kata sandi salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi beberapa saat.",
    "auth/network-request-failed": "Koneksi bermasalah. Periksa internet Anda.",
  };
  if (map[code]) return map[code];
  if (err instanceof ApiError) return err.message;
  return "Terjadi kesalahan. Silakan coba lagi.";
}
