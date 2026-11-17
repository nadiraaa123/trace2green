"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportIllustration } from "@/components/illustrations/ReportIllustration";
import { Logo } from "@/components/ui/Logo";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ROLE_HOME } from "@/lib/constants";

export default function Home() {
  const { user, claims, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(claims.role ? ROLE_HOME[claims.role] : "/daftar");
  }, [loading, user, claims.role, router]);

  if (loading || user) return <FullPageSpinner />;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface">
      <div className="flex min-h-dvh w-full max-w-md flex-col bg-white px-6 pb-8 pt-16 sm:min-h-0 sm:rounded-3xl sm:border sm:border-line sm:py-12 sm:shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" />
          <p className="mt-6 max-w-xs text-base leading-relaxed text-navy-700">
            Laporkan data lingkungan usaha Anda dengan mudah dan gratis.
          </p>
          <ReportIllustration className="mt-10 w-60" />
        </div>
        <div className="mt-auto space-y-3 pt-10">
          <Link
            href="/daftar"
            className="flex h-12 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Mulai
          </Link>
          <p className="text-center text-sm text-navy-500">
            Sudah punya akun?{" "}
            <Link href="/masuk" className="font-semibold text-brand-600">Masuk</Link>
          </p>
          <p className="pt-4 text-center text-xs text-navy-300">
            Akun perusahaan dibuat oleh tim Trace2Green. Masuk melalui halaman yang sama.
          </p>
        </div>
      </div>
    </main>
  );
}
