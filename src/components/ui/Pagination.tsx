"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export const PAGE_SIZE = 15;

/** Page numbers with gaps: 1 … 4 5 6 … 20 */
function pageList(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const set = new Set([0, count - 1, current - 1, current, current + 1].filter((p) => p >= 0 && p < count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push("gap"); out.push(p); });
  return out;
}

/**
 * One pagination pattern for every long list: "Menampilkan a–b dari N", Sebelumnya/Berikutnya
 * and page numbers. `pageCount` may be unknown (cursor paging) → numbers are hidden.
 */
export function Pagination({ page, total, pageSize = PAGE_SIZE, onPage, hasNext, numbers = true, testId = "pagination" }: {
  page: number; total: number | null; pageSize?: number; onPage: (p: number) => void; hasNext?: boolean;
  /** false for cursor paging (sequential only): shows "Halaman x dari y" instead of clickable numbers. */
  numbers?: boolean; testId?: string;
}) {
  const count = total == null ? null : Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = total == null ? page * pageSize + pageSize : Math.min(total, page * pageSize + pageSize);
  const next = hasNext ?? (count != null && page < count - 1);
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-40";
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 text-sm text-navy-500 sm:flex-row sm:items-center sm:justify-between" data-testid={testId}>
      <span>{total == null ? `Halaman ${page + 1}` : `Menampilkan ${from}–${to} dari ${total.toLocaleString("id-ID")}`}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={btn} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft className="size-4" /> <span className="ml-1 hidden sm:inline">Sebelumnya</span></button>
        {!numbers && count != null && <span className="px-2">Halaman {page + 1} dari {count}</span>}
        {numbers && count != null && pageList(page, count).map((p, i) => p === "gap"
          ? <span key={`g${i}`} className="px-1">…</span>
          : <button key={p} className={`${btn} ${p === page ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : ""}`} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>{p + 1}</button>)}
        <button className={btn} disabled={!next} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya"><span className="mr-1 hidden sm:inline">Berikutnya</span> <ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}

/** Client-side paging over an already-loaded, already-filtered list. Resets to page 1 when `resetKey` changes. */
export function usePaged<T>(items: T[], resetKey: unknown, pageSize = PAGE_SIZE) {
  const key = JSON.stringify(resetKey);
  const [state, setState] = useState({ key, page: 0 });
  const page = state.key === key ? state.page : 0; // filters/search changed → back to page 1
  const setPage = (n: number) => setState({ key, page: n });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(page, pages - 1);
  const slice = useMemo(() => items.slice(p * pageSize, p * pageSize + pageSize), [items, p, pageSize]);
  return { page: p, setPage, slice, total: items.length };
}
