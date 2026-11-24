"use client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyNote, Panel } from "@/components/company/ui";
import { InternalTop, ProjectionNote } from "@/components/internal/InternalShell";
import { Pagination, usePaged } from "@/components/ui/Pagination";
import { db } from "@/lib/firebase/client";
import { CS_CAPACITY, PROJECTED_STAGE_LABEL, projectedStage, SCENARIO_YEARS, type ScenarioSupplier } from "@/lib/scenario";

export default function CsScenarioPage() {
  const { claims } = useAuth();
  const [all, setAll] = useState<ScenarioSupplier[] | null>(null);
  const [year, setYear] = useState<number>(2031);
  const [q1, setQ1] = useState(false);

  useEffect(() => {
    if (!claims.csId) return;
    return onSnapshot(query(collection(db, "scenario_suppliers"), where("csId", "==", claims.csId)),
      (s) => setAll(s.docs.map((d) => d.data() as ScenarioSupplier).sort((a, b) => a.supplierId.localeCompare(b.supplierId))), () => setAll([]));
  }, [claims.csId]);

  const month = q1 ? 2 : 6;
  const inYear = (all ?? []).filter((s) => projectedStage(s, year, month) != null);
  const paged = usePaged(inYear, [year, q1]);

  return (
    <>
      <InternalTop title="Skenario 2027–2031" subtitle="Portofolio proyeksi untuk akun CS skenario"
        actions={<>
          <select aria-label="Tahun skenario" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-10 rounded-xl border border-line bg-white px-3 text-sm">{SCENARIO_YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          <select aria-label="Posisi" value={q1 ? "q1" : "rest"} onChange={(e) => setQ1(e.target.value === "q1")} className="h-10 rounded-xl border border-line bg-white px-3 text-sm"><option value="q1">Jan–Mar (trial)</option><option value="rest">Apr–Des</option></select>
        </>} />
      <ProjectionNote>Akun CS skenario tidak dihitung sebagai karyawan aktif 2027.</ProjectionNote>
      <Panel title={`Pemasok proyeksi ${year}: ${inYear.length} / ${CS_CAPACITY}`}>
        {all === null ? <div className="h-40 animate-pulse rounded-xl bg-surface" /> : all.length === 0 ? (
          <EmptyNote>Tidak ada portofolio skenario untuk akun ini.</EmptyNote>
        ) : inYear.length === 0 ? <EmptyNote>Belum ada pemasok proyeksi pada {year} untuk akun ini.</EmptyNote> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm" data-testid="cs-scenario-table">
                <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2.5 pr-3 font-medium">Pemasok</th><th className="py-2.5 pr-3 font-medium">Perusahaan</th><th className="py-2.5 pr-3 font-medium">Kohort</th><th className="py-2.5 font-medium">Tahap (proyeksi)</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {paged.slice.map((s) => (
                    <tr key={s.supplierId}><td className="py-3 pr-3"><p className="font-medium">{s.name}</p><p className="text-xs text-navy-500">{s.supplierId}</p></td><td className="py-3 pr-3">{s.companyName}</td><td className="py-3 pr-3">{s.cohortYear}</td><td className="py-3">{PROJECTED_STAGE_LABEL[projectedStage(s, year, month)!]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={paged.page} total={paged.total} onPage={paged.setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
