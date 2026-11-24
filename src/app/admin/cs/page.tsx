"use client";
import { collection, getCountFromServer, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { EmptyNote, Panel } from "@/components/company/ui";
import { InternalTop, ProjectionNote } from "@/components/internal/InternalShell";
import { Pagination, usePaged } from "@/components/ui/Pagination";
import { db } from "@/lib/firebase/client";
import { buildScenarioPlan, CS_CAPACITY, planCounts, SCENARIO_YEARS } from "@/lib/scenario";

interface Staff { csId: string; name: string; email: string; active: boolean; scenario: boolean; projectedStartYear?: number }

function Bar({ n }: { n: number }) {
  const pctv = Math.min(100, (n / CS_CAPACITY) * 100);
  return <div className="h-2 w-full overflow-hidden rounded-full bg-surface"><div className={`h-full rounded-full ${n >= CS_CAPACITY ? "bg-risk" : n >= CS_CAPACITY * 0.85 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${pctv}%` }} /></div>;
}

export default function AdminCsPage() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [load, setLoad] = useState<Record<string, number>>({});
  const [year, setYear] = useState(2031);

  useEffect(() => onSnapshot(query(collection(db, "cs_staff"), where("scenario", "==", false)),
    (s) => setStaff(s.docs.map((d) => d.data() as Staff).sort((a, b) => a.csId.localeCompare(b.csId))), () => setStaff([])), []);
  useEffect(() => {
    if (!staff) return;
    let alive = true;
    Promise.all(staff.map(async (s) => [s.csId, (await getCountFromServer(query(collection(db, "cs_assignments"), where("csId", "==", s.csId)))).data().count] as const))
      .then((e) => { if (alive) setLoad(Object.fromEntries(e)); });
    return () => { alive = false; };
  }, [staff]);

  const plan = buildScenarioPlan();
  const pc = planCounts(plan, year as never);
  const perCs = plan.cs.map((c) => ({ ...c, n: plan.suppliers.filter((s) => s.csId === c.csId && s.cohortYear <= year).length })).filter((c) => c.n > 0);
  const real = usePaged(staff ?? [], staff?.length ?? 0);

  return (
    <>
      <InternalTop title="Tim Customer Success" subtitle={`Kapasitas ${CS_CAPACITY} pemasok unik per CS · satu CS utama per pemasok`} />
      <Panel title="CS Operasional (aktual)" subtitle="Akun dibuat lewat skrip provisioning; beban = jumlah pemasok yang ditugaskan">
        {staff === null ? <div className="h-24 animate-pulse rounded-xl bg-surface" /> : staff.length === 0 ? (
          <EmptyNote>Belum ada CS operasional. Buat dengan: npx tsx scripts/provision.ts customer-success CS-001 &quot;Nama&quot; email password</EmptyNote>
        ) : (
          <>
            <ul className="divide-y divide-line" data-testid="cs-directory">
              {real.slice.map((s) => (
                <li key={s.csId} className="grid items-center gap-3 py-3 text-sm sm:grid-cols-[1fr_1fr_12rem]">
                  <span><b>{s.csId}</b> · {s.name}{!s.active && <span className="ml-2 text-xs text-risk">nonaktif</span>}</span>
                  <span className="truncate text-navy-500">{s.email}</span>
                  <span><span className="mb-1 block text-xs">{load[s.csId] ?? "…"} / {CS_CAPACITY}</span><Bar n={load[s.csId] ?? 0} /></span>
                </li>
              ))}
            </ul>
            <Pagination page={real.page} total={real.total} onPage={real.setPage} />
          </>
        )}
      </Panel>

      <Panel title="CS dalam Skenario" className="mt-5" action={<select aria-label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">{SCENARIO_YEARS.map((y) => <option key={y}>{y}</option>)}</select>}>
        <ProjectionNote>13 akun CS skenario bukan karyawan aktif 2027.</ProjectionNote>
        <p className="mb-3 text-sm" data-testid="scenario-cs-summary">{year}: <b>{pc.payingSuppliers}</b> pemasok · <b>{pc.csNeeded}</b> CS · kapasitas {pc.csCapacity} · sisa {pc.csRemaining}{pc.csRemaining === 0 && <span className="ml-1 text-amber-700">(tanpa cadangan — pemasok tambahan butuh CS baru)</span>}</p>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {perCs.map((c) => (
            <li key={c.csId} className="rounded-xl border border-line p-3 text-sm"><p className="flex justify-between"><b>{c.csId}</b><span>{c.n} / {CS_CAPACITY}</span></p><p className="mb-2 text-xs text-navy-500">mulai (proyeksi) {c.projectedStartYear}</p><Bar n={c.n} /></li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
