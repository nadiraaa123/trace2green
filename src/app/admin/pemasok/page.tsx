"use client";
import { collection, onSnapshot, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { EmptyNote, Panel } from "@/components/company/ui";
import { InternalTop } from "@/components/internal/InternalShell";
import { LifecycleDetail, StagePill, type LifecycleRow } from "@/components/internal/lifecycle";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { apiPost } from "@/lib/api";
import { db } from "@/lib/firebase/client";
import { LIFECYCLE_STAGES, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";
import { formatPeriod } from "@/lib/period";
import { useCursorPage } from "@/lib/useCursorPage";

interface Staff { csId: string; name: string }

export default function AdminSuppliersPage() {
  const [stage, setStage] = useState<"" | LifecycleStage>("");
  const [cs, setCs] = useState(""); // "" all · "none" unassigned · csId
  const [idq, setIdq] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<LifecycleRow | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => onSnapshot(query(collection(db, "cs_staff"), where("scenario", "==", false)),
    (s) => setStaff(s.docs.map((d) => d.data() as Staff).sort((a, b) => a.csId.localeCompare(b.csId))), () => setStaff([])), []);

  const key = `${stage}|${cs}|${idq.trim().toUpperCase()}`;
  const base = useMemo(() => {
    const f: QueryConstraint[] = [];
    if (idq.trim()) f.push(where("supplierId", "==", idq.trim().toUpperCase()));
    if (stage) f.push(where("stage", "==", stage));
    if (cs === "none") f.push(where("csId", "==", null));
    else if (cs) f.push(where("csId", "==", cs));
    return query(collection(db, "supplier_lifecycle"), ...f, orderBy("supplierId"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every filter
  }, [key]);
  const page = useCursorPage<LifecycleRow>(base, key);
  const live = page.items.find((r) => r.id === selected?.id) ?? selected;

  async function assign() {
    if (!live) return;
    setMsg(null);
    try { await apiPost("/api/admin/cs-assign", { supplierId: live.supplierId, csId: assignTo || null }); setMsg("Penugasan CS disimpan."); }
    catch (e) { setMsg((e as Error).message); }
  }

  return (
    <>
      <InternalTop title="Pemasok & Siklus" subtitle="Semua relasi pemasok–perusahaan yang dilacak (aktual). Hanya Platform Admin yang dapat menugaskan CS." />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <input aria-label="Cari ID pemasok" value={idq} onChange={(e) => setIdq(e.target.value)} placeholder="ID pemasok, mis. SUP-101" className="h-10 min-w-48 flex-1 rounded-xl border border-line px-3 text-sm" />
            <select aria-label="Status siklus" value={stage} onChange={(e) => setStage(e.target.value as LifecycleStage | "")} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">
              <option value="">Semua status</option>{LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <select aria-label="Filter CS" value={cs} onChange={(e) => setCs(e.target.value)} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">
              <option value="">Semua CS</option><option value="none">Belum punya CS</option>{staff.map((s) => <option key={s.csId} value={s.csId}>{s.csId} · {s.name}</option>)}
            </select>
          </div>
          {page.loading ? <div className="h-40 animate-pulse rounded-xl bg-surface" /> : page.items.length === 0 ? <EmptyNote>Tidak ada data siklus yang cocok.</EmptyNote> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="admin-lifecycle-table">
                <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                  <th className="py-2.5 pr-3 font-medium">Pemasok</th><th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">CS</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th><th className="py-2.5 font-medium">Laporan terakhir</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {page.items.map((r) => (
                    <tr key={r.id} onClick={() => { setSelected(r); setAssignTo(r.csId ?? ""); setMsg(null); }} className={`cursor-pointer hover:bg-surface/60 ${live?.id === r.id ? "bg-brand-50/50" : ""}`}>
                      <td className="py-3 pr-3"><p className="font-medium">{r.supplierName ?? r.supplierId}</p><p className="text-xs text-navy-500">{r.supplierId}</p></td>
                      <td className="py-3 pr-3">{r.companyName ?? r.companyId}</td>
                      <td className="py-3 pr-3">{r.csId ?? <span className="text-amber-700">Belum ada</span>}</td>
                      <td className="py-3 pr-3"><StagePill stage={r.stage} /></td>
                      <td className="py-3">{r.lastReportPeriod ? formatPeriod(r.lastReportPeriod) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page.page} total={page.total} onPage={page.setPage} hasNext={page.hasNext} numbers={false} />
        </Panel>
        <Panel title={live ? (live.supplierName ?? live.supplierId) : "Detail"}>
          {!live ? <EmptyNote>Pilih baris untuk menugaskan CS atau mengubah status.</EmptyNote> : (
            <div className="space-y-5">
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-sm font-semibold">CS utama (satu per pemasok)</p>
                <select aria-label="Tugaskan CS" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm">
                  <option value="">— Tanpa CS —</option>{staff.map((s) => <option key={s.csId} value={s.csId}>{s.csId} · {s.name}</option>)}
                </select>
                <Button onClick={assign} className="h-10" disabled={(live.csId ?? "") === assignTo}>Simpan penugasan</Button>
                {msg && <p className="text-sm text-navy-700" role="status">{msg}</p>}
              </div>
              <LifecycleDetail key={live.id} row={live} role="platform_admin" />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
