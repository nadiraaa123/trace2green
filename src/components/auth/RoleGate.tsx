"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_HOME } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { FullPageSpinner } from "@/components/ui/Spinner";

/**
 * Client-side routing guard for UX only. Real enforcement is in Firestore rules
 * and in every /api route, which re-verify the ID token.
 */
export function RoleGate({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, claims, loading } = useAuth();
  const router = useRouter();
  const allowed = !!user && claims.role === role;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/masuk");
    else if (!claims.role) router.replace("/daftar"); // signed up but profile not finished
    else if (claims.role !== role) router.replace(ROLE_HOME[claims.role]);
  }, [loading, user, claims.role, role, router]);

  if (!allowed) return <FullPageSpinner />;
  return <>{children}</>;
}
