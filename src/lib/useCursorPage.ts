"use client";
// Real-time, cursor-based Firestore paging: only `pageSize + 1` docs are read per page and
// the total comes from a count() aggregation, so long lists (e.g. 880 scenario suppliers)
// are never loaded in full. Rules still apply to every query.
import {
  getCountFromServer, limit, onSnapshot, query, startAfter, type DocumentData, type Query, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { PAGE_SIZE } from "@/components/ui/Pagination";

export function useCursorPage<T>(base: Query<DocumentData> | null, key: string, pageSize = PAGE_SIZE) {
  const [state, setState] = useState<{ key: string; page: number; cursors: (QueryDocumentSnapshot | null)[] }>({ key, page: 0, cursors: [null] });
  const cur = state.key === key ? state : { key, page: 0, cursors: [null] }; // filter change → page 1
  const [rows, setRows] = useState<{ key: string; page: number; items: T[]; last: QueryDocumentSnapshot | null; hasNext: boolean } | null>(null);
  const [total, setTotal] = useState<{ key: string; n: number } | null>(null);
  const cursor = cur.cursors[cur.page] ?? null;

  useEffect(() => {
    if (!base) return;
    const q = cursor ? query(base, startAfter(cursor), limit(pageSize + 1)) : query(base, limit(pageSize + 1));
    return onSnapshot(q, (s) => {
      const docs = s.docs.slice(0, pageSize);
      setRows({ key, page: cur.page, items: docs.map((d) => ({ id: d.id, ...d.data() }) as T), last: docs.at(-1) ?? null, hasNext: s.docs.length > pageSize });
    }, () => setRows({ key, page: cur.page, items: [], last: null, hasNext: false }));
  }, [base, key, cursor, cur.page, pageSize]);

  useEffect(() => {
    if (!base) return;
    let alive = true;
    getCountFromServer(base).then((c) => { if (alive) setTotal({ key, n: c.data().count }); }).catch(() => { if (alive) setTotal(null); });
    return () => { alive = false; };
  }, [base, key]);

  const ready = rows && rows.key === key && rows.page === cur.page;
  return {
    items: ready ? rows.items : [],
    loading: !ready,
    page: cur.page,
    total: total?.key === key ? total.n : null,
    hasNext: ready ? rows.hasNext : false,
    setPage: (p: number) => {
      if (p < cur.page) setState({ key, page: Math.max(0, p), cursors: cur.cursors });
      else if (p === cur.page + 1 && ready && rows.hasNext) {
        const cursors = [...cur.cursors.slice(0, cur.page + 1), rows.last];
        setState({ key, page: p, cursors });
      }
    },
  };
}
