"use client";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { EmptyNote, Panel } from "@/components/company/ui";
import { InternalTop } from "@/components/internal/InternalShell";
import { StagePill } from "@/components/internal/lifecycle";
import { Button } from "@/components/ui/Button";
import { Pagination, usePaged } from "@/components/ui/Pagination";
import { apiPost } from "@/lib/api";
import { db } from "@/lib/firebase/client";
import { canTransition, NEEDS_CONFIRMATION, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";

interface Company { companyId: string; name: string; isSimulated?: boolean }
interface Sub { companyId: string; status: LifecycleStage; trialYear?: number; isNewCompany?: boolean; contractStart?: string; contractEnd?: string; renewalDate?: string; confirmation?: { reference: string } }
const STATUSES: LifecycleStage[] = ["trial", "awaiting_activation", "active_subscription", "renewal_due", "renewed", "expired"];
const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [subs, setSubs] = useState<Map<string, Sub>>(new Map());
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState<LifecycleStage | "">("");
  const [trialYear, setTrialYear] = useState(String(new Date().getFullYear() + 1));
  const [ref, setRef] = useState("");
  const [cs, setCs] = useState("");
  const [ce, setCe] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "companies"), (s) => setCompanies(s.docs.map((d) => d.data() as Company).sort((a, b) => a.companyId.localeCompare(b.companyId))), () => setCompanies([]));
    const u2 = onSnapshot(collection(db, "company_subscriptions"), (s) => setSubs(new Map(s.docs.map((d) => [d.id, d.data() as Sub]))), () => setSubs(new Map()));
    return () => { u1(); u2(); };
  }, []);

  const paged = usePaged(companies ?? [], companies?.length ?? 0);
  const company = companies?.find((c) => c.companyId === sel) ?? null;
  const cur = sel ? subs.get(sel) : undefined;
  const options = STATUSES.filter((s) => !cur || s === cur.status || canTransition(cur.status, s));
  const needsConf = status !== "" && NEEDS_CONFIRMATION.includes(status);

  async function save() {
    if (!sel || !status) return;
    setMsg(null);
    try {
      await apiPost("/api/admin/company-subscription", {
        companyId: sel, status, ...(status === "trial" ? { trialYear: Number(trialYear), isNewCompany: true } : {}),
        ...(needsConf ? { confirmation: { reference: ref, contractStart: cs, contractEnd: ce } } : {}),
      });
      setMsg("Status langganan disimpan."); setStatus("");
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <>
      <InternalTop title="Perusahaan & Langganan" subtitle="Status langganan perusahaan dicatat terpisah dari status siklus tiap pemasok" />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          {companies === null ? <div className="h-32 animate-pulse rounded-xl bg-surface" /> : companies.length === 0 ? <EmptyNote>Belum ada perusahaan.</EmptyNote> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm" data-testid="admin-companies-table">
                  <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line">
                    <th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">Langganan</th><th className="py-2.5 pr-3 font-medium">Trial</th><th className="py-2.5 font-medium">Kontrak / perpanjangan</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {paged.slice.map((c) => {
                      const s = subs.get(c.companyId);
                      return (
                        <tr key={c.companyId} onClick={() => { setSel(c.companyId); setMsg(null); setStatus(""); }} className={`cursor-pointer hover:bg-surface/60 ${sel === c.companyId ? "bg-brand-50/50" : ""}`}>
                          <td className="py-3 pr-3"><p className="font-medium">{c.name}</p><p className="text-xs text-navy-500">{c.companyId}{c.isSimulated ? " · akun demo" : ""}</p></td>
                          <td className="py-3 pr-3">{s ? <StagePill stage={s.status} /> : <span className="text-navy-500">Belum dicatat</span>}</td>
                          <td className="py-3 pr-3">{s?.trialYear ? `Jan–Mar ${s.trialYear}` : "—"}</td>
                          <td className="py-3">{s?.contractStart ? `${s.contractStart} s.d. ${s.contractEnd}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={paged.page} total={paged.total} onPage={paged.setPage} />
            </>
          )}
        </Panel>
        <Panel title={company ? company.name : "Ubah Langganan"}>
          {!company ? <EmptyNote>Pilih perusahaan untuk mencatat status langganan.</EmptyNote> : (
            <div className="space-y-2">
              <p className="text-sm text-navy-700">Saat ini: {cur ? STAGE_LABEL[cur.status] : "belum dicatat"}{cur?.confirmation ? ` · konfirmasi ${cur.confirmation.reference}` : ""}</p>
              <select aria-label="Status langganan" value={status} onChange={(e) => setStatus(e.target.value as LifecycleStage)} className={input}>
                <option value="">Pilih status…</option>{options.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
              {status === "trial" && <><input aria-label="Tahun trial" type="number" value={trialYear} onChange={(e) => setTrialYear(e.target.value)} className={input} /><p className="text-xs text-navy-500">Perusahaan baru: maksimal 10 pemasok unik selama Januari–Maret.</p></>}
              {needsConf && (
                <div className="space-y-2 rounded-lg bg-amber-50 p-2">
                  <p className="text-xs text-amber-900">Wajib konfirmasi kontrak/pembayaran nyata. Target keuangan bukan konfirmasi.</p>
                  <input aria-label="Nomor referensi konfirmasi" placeholder="No. kontrak / bukti pembayaran" value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
                  <div className="grid grid-cols-2 gap-2"><input aria-label="Mulai kontrak" type="date" value={cs} onChange={(e) => setCs(e.target.value)} className={input} /><input aria-label="Akhir kontrak" type="date" value={ce} onChange={(e) => setCe(e.target.value)} className={input} /></div>
                </div>
              )}
              <Button onClick={save} disabled={!status} className="h-10">Simpan</Button>
              {msg && <p className="text-sm" role="status">{msg}</p>}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
