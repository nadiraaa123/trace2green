"use client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AlertTriangle, CalendarClock, Gauge, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyNote, Panel, StatCard } from "@/components/company/ui";
import { InternalTop } from "@/components/internal/InternalShell";
import { ScenarioCsDashboard } from "@/components/internal/ScenarioCsDashboard";
import { LifecycleDetail, needsHelp, StagePill, type LifecycleRow } from "@/components/internal/lifecycle";
import { Button } from "@/components/ui/Button";
import { Pagination, usePaged } from "@/components/ui/Pagination";
import { apiPost } from "@/lib/api";
import { db } from "@/lib/firebase/client";
import { isoDate, LIFECYCLE_STAGES, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";
import { defaultPeriod, formatPeriod, referenceDate } from "@/lib/period";
import { CS_CAPACITY } from "@/lib/scenario";

interface FollowUp { id: string; supplierId: string; supplierName: string | null; companyId: string; note: string; dueDate: string | null; done: boolean }

/** Scenario CS accounts get the simulated scenario portfolio; real CS staff get operational records. */
export default function CsPortfolioPage() {
  const { claims } = useAuth();
  return claims.scenario ? <ScenarioCsDashboard /> : <OperationalPortfolio />;
}

function OperationalPortfolio() {
  const { claims } = useAuth();
  const csId = claims.csId;
  const [rows, setRows] = useState<LifecycleRow[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"" | LifecycleStage>("");
  const [helpOnly, setHelpOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const period = defaultPeriod();
  const today = isoDate(referenceDate());

  // Rules only allow queries filtered on the CS's own csId → each CS sees only its portfolio, live.
  useEffect(() => {
    if (!csId) return;
    const u1 = onSnapshot(query(collection(db, "supplier_lifecycle"), where("csId", "==", csId)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LifecycleRow)), () => setRows([]));
    const u2 = onSnapshot(query(collection(db, "cs_followups"), where("csId", "==", csId), where("done", "==", false)),
      (s) => setFollowUps(s.docs.map((d) => ({ id: d.id, ...d.data() }) as FollowUp).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))), () => setFollowUps([]));
    return () => { u1(); u2(); };
  }, [csId]);

  const all = useMemo(() => rows ?? [], [rows]);
  const unique = new Set(all.map((r) => r.supplierId)).size;
  const help = all.filter((r) => needsHelp(r, period));
  const in60 = isoDate(new Date(referenceDate().getTime() + 60 * 86_400_000));
  const renewals = all.filter((r) => r.renewalDate && r.renewalDate <= in60 && r.stage !== "expired").sort((a, b) => a.renewalDate!.localeCompare(b.renewalDate!));
  const shown = all.filter((r) => (!q || `${r.supplierName ?? ""} ${r.supplierId} ${r.companyName ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    && (!stage || r.stage === stage) && (!helpOnly || needsHelp(r, period))).sort((a, b) => a.supplierId.localeCompare(b.supplierId));
  const paged = usePaged(shown, [q, stage, helpOnly]);
  const fuPaged = usePaged(followUps, followUps.length);
  const sel = all.find((r) => r.id === selected) ?? null;
  const counts = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, all.filter((r) => r.stage === s).length])) as Record<LifecycleStage, number>;

  return (
    <>
      <InternalTop title="Portofolio Saya" subtitle={`Pemasok yang ditugaskan kepada ${csId ?? "Anda"} · periode laporan ${formatPeriod(period)}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId="cs-capacity" icon={Gauge} label="Kapasitas" value={`${unique} / ${CS_CAPACITY}`} hint={`${Math.max(0, CS_CAPACITY - unique)} slot tersisa`} />
        <StatCard icon={Users} label="Onboarding & Trial" value={String(counts.onboarding + counts.trial + counts.awaiting_activation)} hint={`${counts.trial} trial · ${counts.awaiting_activation} menunggu aktivasi`} />
        <StatCard testId="cs-help" icon={AlertTriangle} label="Perlu Bantuan" value={String(help.length)} hint="ditandai, atau belum melapor" />
        <StatCard icon={CalendarClock} label="Perpanjangan ≤ 60 hari" value={String(renewals.length)} hint="kontrak yang segera berakhir" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Panel title="Daftar Pemasok" className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-300" />
              <span className="sr-only">Cari pemasok</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, ID, atau perusahaan" className="h-10 w-full rounded-xl border border-line pl-9 pr-3 text-sm" />
            </label>
            <select aria-label="Status" value={stage} onChange={(e) => setStage(e.target.value as LifecycleStage | "")} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">
              <option value="">Semua status</option>{LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]} ({counts[s]})</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={helpOnly} onChange={(e) => setHelpOnly(e.target.checked)} /> Perlu bantuan</label>
          </div>
          {rows === null ? <div className="h-40 animate-pulse rounded-xl bg-surface" /> : shown.length === 0 ? (
            <EmptyNote>{all.length === 0 ? "Belum ada pemasok yang ditugaskan kepada Anda. Penugasan dilakukan oleh Platform Admin." : "Tidak ada pemasok yang cocok dengan filter."}</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="cs-table">
                <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                  <th className="py-2.5 pr-3 font-medium">Pemasok</th><th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-3 font-medium">Laporan terakhir</th><th className="py-2.5 font-medium">Perpanjangan</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {paged.slice.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r.id)} className={`cursor-pointer hover:bg-surface/60 ${selected === r.id ? "bg-brand-50/50" : ""}`}>
                      <td className="py-3 pr-3"><p className="font-medium">{r.supplierName ?? r.supplierId}</p><p className="text-xs text-navy-500">{r.supplierId}{needsHelp(r, period) && <span className="ml-1.5 text-amber-700">· perlu bantuan</span>}</p></td>
                      <td className="py-3 pr-3">{r.companyName ?? r.companyId}</td>
                      <td className="py-3 pr-3"><StagePill stage={r.stage} /></td>
                      <td className="py-3 pr-3">{r.lastReportPeriod ? formatPeriod(r.lastReportPeriod) : <span className="text-amber-700">Belum ada</span>}</td>
                      <td className="py-3">{r.renewalDate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > 0 && <Pagination page={paged.page} total={paged.total} onPage={paged.setPage} />}
        </Panel>
        <Panel title={sel ? (sel.supplierName ?? sel.supplierId) : "Detail Pemasok"}>
          {sel ? <LifecycleDetail key={sel.id} row={sel} role="customer_success" /> : <EmptyNote>Pilih pemasok di tabel untuk melihat detail, mengubah status, atau mencatat tindak lanjut.</EmptyNote>}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title={`Tindak Lanjut Terbuka (${followUps.length})`}>
          {followUps.length === 0 ? <EmptyNote>Tidak ada tindak lanjut terbuka.</EmptyNote> : (
            <>
              <ul className="divide-y divide-line" data-testid="cs-followups">
                {fuPaged.slice.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0"><b>{f.supplierName ?? f.supplierId}</b>{f.dueDate && <span className={`ml-2 text-xs ${f.dueDate < today ? "text-risk" : "text-navy-500"}`}>tenggat {f.dueDate}</span>}<span className="block text-navy-700">{f.note}</span></span>
                    <Button variant="secondary" className="h-8 shrink-0 px-3 text-xs" onClick={() => apiPost("/api/lifecycle/followup-done", { id: f.id })}>Selesai</Button>
                  </li>
                ))}
              </ul>
              <Pagination page={fuPaged.page} total={fuPaged.total} onPage={fuPaged.setPage} testId="cs-followups-pagination" />
            </>
          )}
        </Panel>
        <Panel title="Kontrak & Perpanjangan Mendatang" subtitle="Berakhir dalam 60 hari">
          {renewals.length === 0 ? <EmptyNote>Tidak ada perpanjangan dalam 60 hari.</EmptyNote> : (
            <ul className="divide-y divide-line">
              {renewals.slice(0, 15).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm"><span>{r.supplierName ?? r.supplierId} <span className="text-xs text-navy-500">· {r.companyName ?? r.companyId}</span></span><span className="font-medium">{r.renewalDate}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
