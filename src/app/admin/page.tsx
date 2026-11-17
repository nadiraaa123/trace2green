"use client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Logo } from "@/components/ui/Logo";

export default function AdminHome() {
  const { user, signOut } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-8 py-8">
      <div className="flex items-center justify-between"><Logo /><button onClick={signOut} className="text-sm text-navy-500">Keluar</button></div>
      <h1 className="mt-10 text-2xl font-semibold">Admin Platform (lingkungan demo)</h1>
      <p className="mt-1 text-sm text-navy-500">{user?.email}</p>
    </main>
  );
}
