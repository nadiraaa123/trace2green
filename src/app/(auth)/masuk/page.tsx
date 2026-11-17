"use client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Alert, Field } from "@/components/ui/Field";
import { authErrorMessage } from "@/lib/api";
import { ROLE_HOME } from "@/lib/constants";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const { user, claims, loading, refreshClaims } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && !busy) router.replace(claims.role ? ROLE_HOME[claims.role] : "/daftar");
  }, [loading, user, claims.role, busy, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const c = await refreshClaims();
      router.replace(c.role ? ROLE_HOME[c.role] : "/daftar");
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/" aria-label="Kembali" className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-navy-700 hover:bg-surface">
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Masuk ke Trace2Green</h1>
      <p className="mt-1 text-sm text-navy-500">Untuk pemasok UMKM dan admin perusahaan.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" icon={Mail} type="email" autoComplete="email" inputMode="email"
          placeholder="nama@usaha.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Kata sandi" icon={Lock} type="password" autoComplete="current-password"
          placeholder="Kata sandi" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="text-right">
          <Link href="/lupa-sandi" className="text-sm font-medium text-brand-600">Lupa kata sandi?</Link>
        </div>
        <Button type="submit" loading={busy} className="w-full">Masuk</Button>
      </form>

      <p className="mt-8 text-center text-sm text-navy-500">
        Belum punya akun pemasok?{" "}
        <Link href="/daftar" className="font-semibold text-brand-600">Daftar</Link>
      </p>
    </>
  );
}
