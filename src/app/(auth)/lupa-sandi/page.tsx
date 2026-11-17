"use client";
import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Field } from "@/components/ui/Field";
import { authErrorMessage } from "@/lib/api";
import { auth } from "@/lib/firebase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("busy");
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      // Do not reveal whether an email is registered; only surface format/network errors.
      const code = (err as { code?: string }).code;
      if (code !== "auth/user-not-found") {
        setError(authErrorMessage(err));
        setState("idle");
        return;
      }
    }
    setState("sent");
  }

  return (
    <>
      <Link href="/masuk" aria-label="Kembali" className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-navy-700 hover:bg-surface">
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Atur ulang kata sandi</h1>
      <p className="mt-1 text-sm text-navy-500">Kami kirim tautan pengaturan ulang ke email Anda.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}
        {state === "sent" ? (
          <Alert tone="success">Jika email terdaftar, tautan pengaturan ulang sudah dikirim. Periksa kotak masuk Anda.</Alert>
        ) : (
          <>
            <Field label="Email" icon={Mail} type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="nama@usaha.com" required />
            <Button type="submit" loading={state === "busy"} className="w-full">Kirim tautan</Button>
          </>
        )}
      </form>
    </>
  );
}
