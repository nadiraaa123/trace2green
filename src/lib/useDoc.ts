"use client";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";

/** Real-time listener for a single document. */
export function useDoc<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null, loading: !!path, error: null,
  });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      (s) => setState({ data: s.exists() ? (s.data() as T) : null, loading: false, error: null }),
      (e) => setState({ data: null, loading: false, error: e.code }),
    );
  }, [path]);
  return state;
}
