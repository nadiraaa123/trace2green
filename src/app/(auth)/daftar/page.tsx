"use client";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowLeft, Building2, KeyRound, Lock, Mail, Phone, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Alert, Field } from "@/components/ui/Field";
import { apiPost, authErrorMessage } from "@/lib/api";
import { ROLE_HOME } from "@/lib/constants";
import { auth } from "@/lib/firebase/client";

type Mode = "baru" | "undangan";
type Errors = Partial<Record<string, string>>;

const WA_RE = /^(\+62|62|0)8\d{7,12}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { user, claims, loading, refreshClaims, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>("baru");
  const [form, setForm] = useState({
    picName: "", businessName: "", email: "", whatsapp: "", password: "", confirm: "", inviteCode: "",
  });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in but no role yet = account created, profile step failed earlier. Resume it.
  const resuming = !!user && !claims.role;

  useEffect(() => {
    if (!loading && user && claims.role && !busy) router.replace(ROLE_HOME[claims.role]);
  }, [loading, user, claims.role, busy, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (form.picName.trim().length < 2) e.picName = "Nama penanggung jawab wajib diisi";
    if (mode === "baru" && form.businessName.trim().length < 2) e.businessName = "Nama usaha wajib diisi";
    if (mode === "undangan" && !/^[A-Za-z2-9]{8}$/.test(form.inviteCode.trim())) e.inviteCode = "Kode undangan terdiri dari 8 karakter";
    if (!WA_RE.test(form.whatsapp.trim())) e.whatsapp = "Contoh: 081234567890";
    if (!resuming) {
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Format email tidak valid";
      if (form.password.length < 8) e.password = "Minimal 8 karakter";
      if (form.confirm !== form.password) e.confirm = "Konfirmasi kata sandi tidak sama";
    }
    if (!consent) e.consent = "Persetujuan wajib dicentang untuk melanjutkan";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (!auth.currentUser) {
        const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
        await updateProfile(cred.user, { displayName: form.picName.trim() });
      }
      if (mode === "baru") {
        await apiPost("/api/auth/register-supplier", {
          picName: form.picName, businessName: form.businessName, whatsapp: form.whatsapp, privacyConsent: true,
        });
      } else {
        await apiPost("/api/suppliers/claim", {
          inviteCode: form.inviteCode, picName: form.picName, whatsapp: form.whatsapp, privacyConsent: true,
        });
      }
      const c = await refreshClaims();
      router.replace(c.role ? ROLE_HOME[c.role] : "/");
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
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {resuming ? "Lengkapi profil usaha" : "Buat akun pemasok (UMKM)"}
      </h1>
      <p className="mt-1 text-sm text-navy-500">
        {resuming
          ? `Akun ${user?.email ?? ""} sudah dibuat. Lengkapi data berikut untuk mulai melapor.`
          : "Gratis untuk UMKM. Daftarkan usaha Anda untuk mulai melaporkan data lingkungan."}
      </p>

      <div role="tablist" aria-label="Jenis pendaftaran" className="mt-6 grid grid-cols-2 rounded-xl bg-surface p-1 text-sm font-medium">
        {(["baru", "undangan"] as Mode[]).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErrors({}); }}
            className={`h-10 rounded-lg transition ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"}`}>
            {m === "baru" ? "Usaha baru" : "Punya kode undangan"}
          </button>
        ))}
      </div>
      {mode === "undangan" && (
        <p className="mt-3 text-xs leading-relaxed text-navy-500">
          Gunakan kode dari perusahaan pembeli bila usaha Anda sudah terdaftar di daftar pemasok mereka.
          Kode hanya berlaku untuk satu akun.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        {mode === "undangan" && (
          <Field label="Kode undangan" icon={KeyRound} value={form.inviteCode} onChange={set("inviteCode")}
            placeholder="8 karakter, mis. K7M2Q9XA" autoCapitalize="characters" error={errors.inviteCode} />
        )}
        <Field label="Nama penanggung jawab" icon={User} value={form.picName} onChange={set("picName")}
          autoComplete="name" placeholder="Nama lengkap" error={errors.picName} />
        {mode === "baru" && (
          <Field label="Nama usaha" icon={Building2} value={form.businessName} onChange={set("businessName")}
            autoComplete="organization" placeholder="mis. Kue Bu Siti" error={errors.businessName} />
        )}
        {!resuming && (
          <Field label="Email" icon={Mail} type="email" inputMode="email" autoComplete="email" value={form.email}
            onChange={set("email")} placeholder="nama@usaha.com" error={errors.email} />
        )}
        <Field label="Nomor WhatsApp" icon={Phone} type="tel" inputMode="tel" autoComplete="tel" value={form.whatsapp}
          onChange={set("whatsapp")} placeholder="0812xxxxxxxx" error={errors.whatsapp}
          hint="Dipakai untuk pengingat laporan. Tidak dibagikan tanpa izin Anda." />
        {!resuming && (
          <>
            <Field label="Buat kata sandi" icon={Lock} type="password" autoComplete="new-password" value={form.password}
              onChange={set("password")} placeholder="Minimal 8 karakter" error={errors.password} />
            <Field label="Konfirmasi kata sandi" icon={Lock} type="password" autoComplete="new-password" value={form.confirm}
              onChange={set("confirm")} placeholder="Ulangi kata sandi" error={errors.confirm} />
          </>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-line p-3.5 text-sm leading-relaxed text-navy-700">
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (errors.consent) setErrors((prev) => ({ ...prev, consent: undefined })); }}
            className="mt-0.5 size-4 shrink-0 accent-brand-500" />
          <span>
            Saya menyetujui pengolahan data usaha sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
            Data saya hanya dibagikan ke perusahaan pembeli yang saya setujui.
          </span>
        </label>
        {errors.consent && <p className="-mt-2 text-xs text-risk">{errors.consent}</p>}

        <Button type="submit" loading={busy} className="w-full">
          {resuming ? "Simpan dan lanjutkan" : "Daftar"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-navy-500">
        {resuming ? (
          <button type="button" onClick={() => signOut()} className="font-semibold text-brand-600">Keluar</button>
        ) : (
          <>Sudah punya akun? <Link href="/masuk" className="font-semibold text-brand-600">Masuk</Link></>
        )}
      </p>
    </>
  );
}
