"use client";
import { collection, getCountFromServer, limit, onSnapshot, query, where, type Query } from "firebase/firestore";
import { AlertTriangle, Building2, RefreshCw, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyNote, Panel, StatCard } from "@/components/company/ui";
import { InternalTop } from "@/components/internal/InternalShell";
import { StagePill, type LifecycleRow } from "@/components/internal/lifecycle";
import { Button } from "@/components/ui/Button";
import { db } from "@/lib/firebase/client";
import { LIFECYCLE_STAGES, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";
import { CS_CAPACITY, FINANCIAL_MODEL } from "@/lib/scenario";

const c = (name: string) => collection(db, name);
/** ACTUAL operational counts only (count() aggregations — no full reads). Projections never mixed in. */
const COUNTS: Record<string, Query> = {
  companies: query(c("companies")),
  demoCompanies: query(c("companies"), where("isSimulated", "==", true)),
  suppliers: query(c("suppliers")),
  demoSuppliers: query(c("suppliers"), where("dataSource", "==", "demo")),
  lifecycle: query(c("supplier_lifecycle")),
  unassigned: query(c("supplier_lifecycle"), where("csId", "==", null)),
  staff: query(c("cs_staff"), where("scenario", "==", false)),
  ...Object.fromEntries(LIFECYCLE_STAGES.map((s) => [`stage_${s}`, query(c("supplier_lifecycle"), where("stage", "==", s))])),
};

export default function AdminOverview() {
  const [n, setN] = useState<Record<string, number> | null>(null);
  const [tick, setTick] = useState(0);
  const [help, setHelp] = useState<LifecycleRow[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(COUNTS).map(async ([k, q]) => [k, (await getCountFromServer(q)).data().count] as const))
      .then((e) => { if (alive) setN(Object.fromEntries(e)); }).catch(() => { if (alive) setN({}); });
    return () => { alive = false; };
  }, [tick]);
  useEffect(() => onSnapshot(query(c("supplier_lifecycle"), where("needsAssistance", "==", true), limit(15)),
    (s) => setHelp(s.docs.map((d) => ({ id: d.id, ...d.data() }) as LifecycleRow)), () => setHelp([])), []);

  const v = (k: string) => (n ? (n[k] ?? 0) : null);
  const show = (k: string) => (v(k) == null ? "…" : v(k)!.toLocaleString("id-ID"));
  const realSuppliers = n ? (n.suppliers ?? 0) - (n.demoSuppliers ?? 0) : null;
  const realCompanies = n ? (n.companies ?? 0) - (n.demoCompanies ?? 0) : null;

  return (
    <>
      <InternalTop title="Ringkasan Platform" subtitle="Data operasional aktual. Proyeksi 2027–2031 ada di menu Skenario dan tidak dicampur ke angka ini."
        actions={<Button variant="secondary" className="h-10" onClick={() => setTick((t) => t + 1)}><RefreshCw className="size-4" /> Muat ulang angka</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId="admin-companies" icon={Building2} label="Perusahaan" value={show("companies")} hint={realCompanies == null ? "" : `${realCompanies} non-demo · ${v("demoCompanies")} demo`} />
        <StatCard testId="admin-suppliers" icon={Users} label="Profil Pemasok" value={show("suppliers")} hint={realSuppliers == null ? "" : `${realSuppliers} pendaftar aplikasi · ${v("demoSuppliers")} dataset analitis`} />
        <StatCard testId="admin-lifecycle" icon={UserCog} label="Pemasok Dilacak CS" value={show("lifecycle")} hint={`${show("unassigned")} belum punya CS · ${show("staff")} CS aktif`} />
        <StatCard icon={AlertTriangle} label="Perlu Tindak Lanjut" value={String(help.length)} hint="ditandai oleh CS" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Panel title="Distribusi Siklus Pemasok" subtitle="Relasi pemasok–perusahaan yang dilacak (aktual)" className="xl:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="stage-distribution">
            {LIFECYCLE_STAGES.map((s) => (
              <li key={s} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm"><StagePill stage={s as LifecycleStage} /><b>{show(`stage_${s}`)}</b></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-navy-500">Status “{STAGE_LABEL.active_subscription}” dan “{STAGE_LABEL.renewed}” hanya muncul setelah Platform Admin mencatat konfirmasi kontrak/pembayaran.</p>
        </Panel>
        <Panel title="Target vs Aktual" subtitle="Target model keuangan tahun pertama">
          <table className="w-full text-sm" data-testid="target-vs-actual">
            <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 font-medium" /><th className="py-2 font-medium">Target 2027</th><th className="py-2 font-medium">Aktual</th></tr></thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-2">Perusahaan</td><td className="py-2">{FINANCIAL_MODEL[2027].totalCompanies}</td><td className="py-2 font-semibold">{realCompanies ?? "…"}</td></tr>
              <tr><td className="py-2">Pemasok berbayar</td><td className="py-2">{FINANCIAL_MODEL[2027].payingSuppliers}</td><td className="py-2 font-semibold">{n ? (n.stage_active_subscription ?? 0) + (n.stage_renewed ?? 0) : "…"}</td></tr>
              <tr><td className="py-2">Kebutuhan CS</td><td className="py-2">1</td><td className="py-2 font-semibold">{show("staff")}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-navy-500">Aktual = data operasional dengan konfirmasi; dataset analitis dan skenario tidak dihitung. Kapasitas {CS_CAPACITY} pemasok per CS.</p>
          <Link href="/admin/skenario" className="mt-3 inline-block text-xs font-medium text-brand-600">Lihat skenario 2027–2031</Link>
        </Panel>
      </div>

      <Panel title="Pemasok yang Perlu Tindak Lanjut" className="mt-5">
        {help.length === 0 ? <EmptyNote>Tidak ada pemasok yang ditandai perlu bantuan.</EmptyNote> : (
          <ul className="divide-y divide-line">
            {help.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span><b>{r.supplierName ?? r.supplierId}</b> <span className="text-xs text-navy-500">{r.supplierId} · {r.companyName ?? r.companyId} · CS {r.csId ?? "belum ada"}</span></span>
                <StagePill stage={r.stage} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
