"use client";
import { collection, getCountFromServer, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyNote, Panel } from "@/components/company/ui";
import { InternalTop, ProjectionNote } from "@/components/internal/InternalShell";
import { Pagination } from "@/components/ui/Pagination";
import { db } from "@/lib/firebase/client";
import {
  buildScenarioPlan, checkFinancialModel, CS_CAPACITY, FINANCIAL_MODEL, MODEL_ASSUMPTIONS, planCounts, PROJECTED_STAGE_LABEL, projectedStage,
  SCENARIO_YEARS, type ScenarioSupplier, type ScenarioYear,
} from "@/lib/scenario";
import { useCursorPage } from "@/lib/useCursorPage";
import { StagePill } from "@/components/internal/lifecycle";
import { OPS_SIM_RATE_LABEL, OPS_SIM_RATES, simState, simYears } from "@/lib/opsSim";

const ROWS: { key: keyof (typeof FINANCIAL_MODEL)[2027]; label: string }[] = [
  { key: "totalCompanies", label: "Total perusahaan" }, { key: "newCompanies", label: "Perusahaan baru" }, { key: "renewingCompanies", label: "Perusahaan perpanjang" },
  { key: "existingSuppliers", label: "Pemasok existing" }, { key: "newSuppliers", label: "Pemasok baru" }, { key: "suppliersPerNewCompany", label: "Pemasok per perusahaan baru" },
  { key: "trialSuppliers", label: "Pemasok trial (Jan–Mar)" }, { key: "awaitingActivation", label: "Menunggu aktivasi" }, { key: "payingSuppliers", label: "Pemasok berbayar (Apr–Des)" },
];

function GrowthChart({ data, k, label }: { data: Record<string, number | string>[]; k: string; label: string }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e6ebf1" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
          <Tooltip formatter={(v) => [v, label]} />
          <Bar dataKey={k} fill="#168B73" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminScenarioPage() {
  const plan = useMemo(() => buildScenarioPlan(), []);
  const issues = checkFinancialModel();
  const sim = useMemo(() => simYears(plan), [plan]);
  const data = SCENARIO_YEARS.map((y) => ({ year: String(y), ...FINANCIAL_MODEL[y], cs: planCounts(plan, y).csNeeded }));
  const [year, setYear] = useState<ScenarioYear>(2031);
  const [month, setMonth] = useState(12);
  const [company, setCompany] = useState("");
  const [cs, setCs] = useState("");
  const [written, setWritten] = useState<number | null>(null);

  useEffect(() => { getCountFromServer(collection(db, "scenario_suppliers")).then((c) => setWritten(c.data().count)).catch(() => setWritten(null)); }, []);

  const key = `${year}|${company}|${cs}`;
  const base = useMemo(() => {
    const f: QueryConstraint[] = [where("cohortYear", "<=", year)];
    if (company) f.push(where("companyId", "==", company));
    if (cs) f.push(where("csId", "==", cs));
    return query(collection(db, "scenario_suppliers"), ...f, orderBy("cohortYear"), orderBy("supplierId"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every filter
  }, [key]);
  const page = useCursorPage<ScenarioSupplier>(written ? base : null, key);

  return (
    <>
      <InternalTop title="Skenario 2027–2031" subtitle="Model keuangan dan kapasitas Customer Success" />
      <ProjectionNote>Angka di halaman ini tidak masuk ke KPI operasional.</ProjectionNote>

      <Panel title="Model Keuangan" subtitle={issues.length ? `${issues.length} inkonsistensi` : "Semua identitas aritmetika terpenuhi"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm" data-testid="financial-table">
            <thead className="text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2.5 pr-3 text-left font-medium">Komponen</th>{SCENARIO_YEARS.map((y) => <th key={y} className="py-2.5 pr-3 text-right font-medium">{y}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((r) => <tr key={r.key}><td className="py-2.5 pr-3">{r.label}</td>{SCENARIO_YEARS.map((y) => <td key={y} className="py-2.5 pr-3 text-right tabular-nums">{FINANCIAL_MODEL[y][r.key]}</td>)}</tr>)}
              <tr className="font-semibold"><td className="py-2.5 pr-3">CS minimum (kapasitas {CS_CAPACITY})</td>{SCENARIO_YEARS.map((y) => <td key={y} className="py-2.5 pr-3 text-right tabular-nums">{planCounts(plan, y).csNeeded}</td>)}</tr>
              <tr><td className="py-2.5 pr-3">Kapasitas / sisa</td>{SCENARIO_YEARS.map((y) => { const c = planCounts(plan, y); return <td key={y} className={`py-2.5 pr-3 text-right tabular-nums ${c.csRemaining === 0 ? "text-amber-700" : ""}`}>{c.csCapacity} / {c.csRemaining}</td>; })}</tr>
            </tbody>
          </table>
        </div>
        {issues.length > 0 && <ul className="mt-3 text-sm text-risk">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        <div className="mt-4 rounded-xl bg-surface p-3 text-xs text-navy-700">
          <p className="mb-1 font-semibold">Asumsi tersirat model</p>
          <ul className="list-inside list-disc space-y-0.5">{MODEL_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="mt-2">2028: dua CS terisi penuh (140/140) — tanpa cadangan kapasitas.</p>
        </div>
      </Panel>

      <Panel title="Target vs Realisasi Simulasi" subtitle="Model keuangan mengasumsikan 100% konversi & tanpa churn; simulasi memakai angka ilustrasi di bawah" className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid="target-vs-sim">
            <thead className="text-xs text-navy-500"><tr className="border-b border-line">
              <th className="py-2.5 pr-3 text-left font-medium">Tahun</th><th className="py-2.5 pr-3 text-right font-medium">Target berbayar</th><th className="py-2.5 pr-3 text-right font-medium">Realisasi simulasi (Des)</th>
              <th className="py-2.5 pr-3 text-right font-medium">Selisih</th><th className="py-2.5 pr-3 text-right font-medium">Trial → bayar</th><th className="py-2.5 pr-3 text-right font-medium">Tidak aktif</th><th className="py-2.5 text-right font-medium">CS (target / realisasi)</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {sim.map((r) => (
                <tr key={r.year}><td className="py-2.5 pr-3">{r.year}</td><td className="py-2.5 pr-3 text-right tabular-nums">{r.target}</td><td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{r.realized}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-risk">−{r.gap} ({Math.round((r.gap / r.target) * 100)}%)</td><td className="py-2.5 pr-3 text-right tabular-nums">{r.trialConverted}/{r.trialStarted}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.churned}</td><td className="py-2.5 text-right tabular-nums">{r.csNeededTarget} / {r.csNeededRealized}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4" data-testid="sim-rates">
          {(Object.keys(OPS_SIM_RATES) as (keyof typeof OPS_SIM_RATES)[]).map((k) => (
            <p key={k} className="rounded-lg bg-surface px-3 py-2"><span className="block text-navy-500">{OPS_SIM_RATE_LABEL[k]}</span><b>{Math.round(OPS_SIM_RATES[k] * 100)}%</b> <span className="text-navy-500">(ilustrasi)</span></p>
          ))}
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Pertumbuhan Pemasok" subtitle="Berbayar Apr–Des (proyeksi)"><GrowthChart data={data} k="payingSuppliers" label="Pemasok" /></Panel>
        <Panel title="Pertumbuhan Perusahaan" subtitle="Total perusahaan (proyeksi)"><GrowthChart data={data} k="totalCompanies" label="Perusahaan" /></Panel>
        <Panel title="Kebutuhan CS" subtitle="Minimum berbasis kapasitas"><GrowthChart data={data} k="cs" label="CS" /></Panel>
      </div>

      <Panel title="Data Skenario Tersimpan" className="mt-5" subtitle={written == null ? "Memeriksa…" : `${written} dari ${plan.suppliers.length} profil pemasok skenario tertulis di database`}
        action={<div className="flex flex-wrap gap-2">
          <select aria-label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value) as ScenarioYear)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">{SCENARIO_YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          <select aria-label="Bulan" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">{["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <select aria-label="Perusahaan skenario" value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm"><option value="">Semua perusahaan</option>{plan.companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.companyId} ({c.cohortYear})</option>)}</select>
          <select aria-label="CS skenario" value={cs} onChange={(e) => setCs(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm"><option value="">Semua CS</option>{plan.cs.map((c) => <option key={c.csId} value={c.csId}>{c.csId}</option>)}</select>
        </div>}>
        {written === 0 || written == null ? (
          <EmptyNote>Data skenario belum ditulis. Jalankan dry run: npx tsx scripts/scenario.ts — penulisan butuh persetujuan.</EmptyNote>
        ) : page.loading ? <div className="h-40 animate-pulse rounded-xl bg-surface" /> : page.items.length === 0 ? <EmptyNote>Tidak ada pemasok skenario untuk filter ini.</EmptyNote> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="scenario-suppliers-table">
              <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2.5 pr-3 font-medium">Pemasok</th><th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">Kohort</th><th className="py-2.5 pr-3 font-medium">CS</th><th className="py-2.5 pr-3 font-medium">Model (proyeksi)</th><th className="py-2.5 font-medium">Simulasi</th></tr></thead>
              <tbody className="divide-y divide-line">
                {page.items.map((s) => (
                  <tr key={s.supplierId}><td className="py-3 pr-3"><p className="font-medium">{s.name}</p><p className="text-xs text-navy-500">{s.supplierId}</p></td><td className="py-3 pr-3">{s.companyName}</td><td className="py-3 pr-3">{s.cohortYear}</td><td className="py-3 pr-3">{s.csId}</td><td className="py-3 pr-3 text-xs">{PROJECTED_STAGE_LABEL[projectedStage(s, year, month)!]}</td><td className="py-3">{(() => { const st = simState(s, year, month); return st ? <StagePill stage={st.stage} /> : "—"; })()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!written && <Pagination page={page.page} total={page.total} onPage={page.setPage} hasNext={page.hasNext} numbers={false} />}
      </Panel>
    </>
  );
}
