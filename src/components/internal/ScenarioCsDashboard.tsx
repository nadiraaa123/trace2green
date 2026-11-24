"use client";
// Portfolio dashboard for SCENARIO CS accounts (CS-S01…13): the assigned scenario suppliers with a
// deterministic operational simulation (opsSim) — not everyone succeeds. Read-only, labeled simulation.
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AlertTriangle, CalendarClock, FileWarning, Gauge, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyNote, Panel, StatCard } from "@/components/company/ui";
import { InternalTop } from "@/components/internal/InternalShell";
import { StagePill } from "@/components/internal/lifecycle";
import { Pagination, usePaged } from "@/components/ui/Pagination";
import { db } from "@/lib/firebase/client";
import { LIFECYCLE_STAGES, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";
import { simFollowUp, simState, type SimState } from "@/lib/opsSim";
import { formatPeriod, referenceDate } from "@/lib/period";
import { CS_CAPACITY, SCENARIO_YEARS, type ScenarioSupplier } from "@/lib/scenario";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
type Row = ScenarioSupplier & { st: SimState };

function defaultYm() {
  const r = referenceDate();
  const y = r.getUTCFullYear();
  return y >= 2027 && y <= 2031 ? { y, m: r.getUTCMonth() + 1 } : { y: 2027, m: 2 };
}

export function ScenarioCsDashboard() {
  const { claims } = useAuth();
  const [all, setAll] = useState<ScenarioSupplier[] | null>(null);
  const [ym, setYm] = useState(defaultYm);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"" | LifecycleStage>("");
  const [flag, setFlag] = useState<"" | "help" | "noreport">("");
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    if (!claims.csId) return;
    return onSnapshot(query(collection(db, "scenario_suppliers"), where("csId", "==", claims.csId)),
      (s) => setAll(s.docs.map((d) => d.data() as ScenarioSupplier).sort((a, b) => a.supplierId.localeCompare(b.supplierId))), () => setAll([]));
  }, [claims.csId]);

  const rows: Row[] = useMemo(() => (all ?? []).flatMap((s) => { const st = simState(s, ym.y, ym.m); return st ? [{ ...s, st }] : []; }), [all, ym]);
  const live = rows.filter((r) => r.st.stage !== "expired");
  const count = (st: LifecycleStage) => rows.filter((r) => r.st.stage === st).length;
  const help = live.filter((r) => r.st.needsHelp);
  const noReport = rows.filter((r) => r.st.reported === false);
  const expecting = rows.filter((r) => r.st.reported != null).length;
  const shown = rows.filter((r) => (!q || `${r.name} ${r.supplierId} ${r.companyName}`.toLowerCase().includes(q.toLowerCase()))
    && (!stage || r.st.stage === stage) && (flag !== "help" || r.st.needsHelp) && (flag !== "noreport" || r.st.reported === false));
  const paged = usePaged(shown, [q, stage, flag, ym]);
  const selected = rows.find((r) => r.supplierId === sel) ?? null;
  const followUps = live.map((r) => ({ r, text: simFollowUp(r.st) })).filter((x) => x.text);
  const fuPaged = usePaged(followUps, [ym]);
  const period = `${ym.y}-${String(ym.m).padStart(2, "0")}`;

  return (
    <>
      <InternalTop title="Portofolio Saya" subtitle={`${claims.csId} · simulasi operasional ${formatPeriod(period)}`}
        actions={<>
          <select aria-label="Tahun" value={ym.y} onChange={(e) => setYm({ y: Number(e.target.value), m: ym.m })} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">{SCENARIO_YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          <select aria-label="Bulan" value={ym.m} onChange={(e) => setYm({ y: ym.y, m: Number(e.target.value) })} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </>} />
      <p className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900" data-testid="sim-note">
        <b>Simulasi skenario 2027–2031</b> — pemasok fiktif dengan hasil proses berdasarkan angka ilustrasi (tidak semua berhasil). Bukan pelanggan atau kontrak nyata.
      </p>
      {all === null ? <div className="h-40 animate-pulse rounded-2xl bg-white" /> : all.length === 0 ? <EmptyNote>Tidak ada portofolio skenario untuk akun ini.</EmptyNote> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard testId="cs-capacity" icon={Gauge} label="Kapasitas" value={`${live.length} / ${CS_CAPACITY}`} hint={`${rows.length} ditugaskan · ${rows.length - live.length} tidak aktif`} />
            <StatCard testId="cs-onboarding" icon={CalendarClock} label="Onboarding & Trial" value={String(count("onboarding") + count("trial") + count("awaiting_activation"))} hint={`${count("trial")} trial · ${count("awaiting_activation")} menunggu aktivasi · ${count("onboarding")} belum daftar`} />
            <StatCard testId="cs-help" icon={AlertTriangle} label="Perlu Bantuan" value={String(help.length)} hint="bulan ini" />
            <StatCard testId="cs-noreport" icon={FileWarning} label="Belum Melapor" value={`${noReport.length}`} hint={`dari ${expecting} pemasok yang wajib lapor`} />
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
                  <option value="">Semua status</option>{LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]} ({count(s)})</option>)}
                </select>
                <select aria-label="Tanda" value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">
                  <option value="">Semua</option><option value="help">Perlu bantuan ({help.length})</option><option value="noreport">Belum melapor ({noReport.length})</option>
                </select>
              </div>
              {rows.length === 0 ? <EmptyNote>Belum ada pemasok pada {formatPeriod(period)} untuk akun ini.</EmptyNote> : shown.length === 0 ? <EmptyNote>Tidak ada pemasok yang cocok dengan filter.</EmptyNote> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm" data-testid="cs-table">
                    <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                      <th className="py-2.5 pr-3 font-medium">Pemasok</th><th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">Status</th>
                      <th className="py-2.5 pr-3 font-medium">Laporan {MONTHS[ym.m - 1]}</th><th className="py-2.5 font-medium">Catatan</th>
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {paged.slice.map((r) => (
                        <tr key={r.supplierId} onClick={() => setSel(r.supplierId)} className={`cursor-pointer hover:bg-surface/60 ${sel === r.supplierId ? "bg-brand-50/50" : ""}`}>
                          <td className="py-3 pr-3"><p className="font-medium">{r.name}</p><p className="text-xs text-navy-500">{r.supplierId}{r.st.needsHelp && <span className="ml-1.5 text-amber-700">· perlu bantuan</span>}</p></td>
                          <td className="py-3 pr-3">{r.companyName}</td>
                          <td className="py-3 pr-3"><StagePill stage={r.st.stage} /></td>
                          <td className="py-3 pr-3">{r.st.reported == null ? <span className="text-navy-300">—</span> : r.st.reported ? <span className="text-brand-700">Sudah</span> : <span className="font-medium text-risk">Belum</span>}</td>
                          <td className="py-3 text-xs text-navy-700">{r.st.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {shown.length > 0 && <Pagination page={paged.page} total={paged.total} onPage={paged.setPage} />}
            </Panel>
            <Panel title={selected ? selected.name : "Detail Pemasok"}>
              {!selected ? <EmptyNote>Pilih pemasok di tabel untuk melihat riwayat simulasinya.</EmptyNote> : (
                <div className="space-y-4" data-testid="sim-detail">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-navy-500">ID</dt><dd>{selected.supplierId}</dd>
                    <dt className="text-navy-500">Perusahaan</dt><dd>{selected.companyName}</dd>
                    <dt className="text-navy-500">Kohort</dt><dd>{selected.cohortYear}{selected.trialPlanned ? " · peserta trial" : ""}</dd>
                    <dt className="text-navy-500">Status</dt><dd><StagePill stage={selected.st.stage} /></dd>
                    <dt className="text-navy-500">Perpanjangan</dt><dd>{selected.st.renewalDate ?? "—"}</dd>
                  </dl>
                  {simFollowUp(selected.st) && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Saran tindak lanjut: {simFollowUp(selected.st)}</p>}
                  <div>
                    <p className="mb-2 text-sm font-semibold">Riwayat {ym.y}</p>
                    <ul className="grid grid-cols-3 gap-1.5 text-[11px]">
                      {MONTHS.map((m, i) => {
                        const st = simState(selected, ym.y, i + 1);
                        return (
                          <li key={m} className="rounded-lg bg-surface px-2 py-1.5">
                            <b>{m}</b> <span className="block truncate">{st ? STAGE_LABEL[st.stage] : "—"}</span>
                            {st?.reported != null && <span className={st.reported ? "text-brand-700" : "text-risk"}>{st.reported ? "lapor" : "tidak lapor"}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <p className="text-[11px] text-navy-500">Data simulasi bersifat baca-saja; perubahan status hanya untuk pemasok nyata.</p>
                </div>
              )}
            </Panel>
          </div>

          <Panel title={`Saran Tindak Lanjut (${followUps.length})`} className="mt-5">
            {followUps.length === 0 ? <EmptyNote>Tidak ada tindak lanjut bulan ini.</EmptyNote> : (
              <>
                <ul className="divide-y divide-line" data-testid="cs-followups">
                  {fuPaged.slice.map(({ r, text }) => (
                    <li key={r.supplierId} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><b>{r.name}</b> <span className="text-xs text-navy-500">{r.supplierId} · {r.companyName}</span></span><span className="text-right text-navy-700">{text}</span></li>
                  ))}
                </ul>
                <Pagination page={fuPaged.page} total={fuPaged.total} onPage={fuPaged.setPage} testId="cs-followups-pagination" />
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
