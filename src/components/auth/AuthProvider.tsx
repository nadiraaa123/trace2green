"use client";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase/client";
import type { Role } from "@/lib/types";

export interface Claims {
  role: Role | null;
  supplierId: string | null;
  companyId: string | null;
  canVerify: boolean;
}

interface AuthState {
  user: User | null;
  claims: Claims;
  loading: boolean;
  /** Force-refresh the ID token so new custom claims (set by the server) apply. */
  refreshClaims: () => Promise<Claims>;
  signOut: () => Promise<void>;
}

const empty: Claims = { role: null, supplierId: null, companyId: null, canVerify: false };
const Ctx = createContext<AuthState | null>(null);

function pick(c: Record<string, unknown>): Claims {
  return {
    role: (c.role as Role) ?? null,
    supplierId: (c.supplierId as string) ?? null,
    companyId: (c.companyId as string) ?? null,
    canVerify: c.canVerify === true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Claims>(empty);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u);
        setClaims(u ? pick((await u.getIdTokenResult()).claims) : empty);
        setLoading(false);
      }),
    [],
  );

  const refreshClaims = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return empty;
    const c = pick((await u.getIdTokenResult(true)).claims);
    setClaims(c);
    return c;
  }, []);

  // Wait for Firebase to clear the session before navigating, so no page sees a stale user.
  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    router.replace("/masuk");
  }, [router]);

  const value = useMemo(
    () => ({ user, claims, loading, refreshClaims, signOut }),
    [user, claims, loading, refreshClaims, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
