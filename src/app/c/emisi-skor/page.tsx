"use client";
import { useCompany } from "@/components/company/CompanyContext";
import { EmissionBars, ScoreDonut, TrendChart } from "@/components/company/charts";
import { EmisiTabs } from "@/components/company/EmisiTabs";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, MethodBadges, Panel, tco2 } from "@/components/company/ui";
import { combinedKpis, receivedRows } from "@/lib/kpi";
import { formatPeriod, shortPeriod } from "@/lib/period";

export default function EmissionsScorePage() {
  const c = useCompany();
  const rows = c.current?.rows ?? [];
  const k = combinedKpis(rows);
  // Emission totals are additive, so one line for all suppliers; months without reports stay empty (not 0).
  const trend = c.periods.map((p) => { const x = combinedKpis(p.rows); return { label: shortPeriod(p.period), all: x.received ? Math.round(x.emissionsKg) : null }; });

  // Intensity vs the group benchmark, per sector — counts only (no cross-method averages).
  const received = receivedRows(rows);
  const sectors = [...new Set(received.map((r) => r.sector ?? "—"))].sort();
  const intensity = sectors.map((sector) => {
    const rs = received.filter((r) => (r.sector ?? "—") === sector);
    const withRatio = rs.filter((r) => r.intensityRatio != null);
    return {
      sector, n: rs.length,
      below: withRatio.filter((r) => r.intensityRatio! <= 1).length,
      around: withRatio.filter((r) => r.intensityRatio! > 1 && r.intensityRatio! <= 1.15).length,
      high: withRatio.filter((r) => r.intensityRatio! > 1.15).length,
      unavailable: rs.length - withRatio.length,
    };
  });
  const es = k.emissionStatus;
  const cb = k.completeness;

  if (!c.current) return (<><PageTop title="Emisi & Skor" /><EmptyNote>Belum ada data.</EmptyNote></>);
  return (
    <>
      <PageTop title="Emisi & Skor" subtitle={`Estimasi emisi dan penilaian pemasok · ${formatPeriod(c.period!)}`} />
      <EmisiTabs />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Tren Estimasi Emisi" subtitle="Total kg CO₂e dari laporan yang masuk tiap bulan" className="xl:col-span-2">
          <TrendChart data={trend} sources={["all"]} unit="kg" />
        </Panel>
        <Panel title="Ringkasan Emisi">
          <p className="text-3xl font-semibold" data-testid="emission-total">{tco2(k.emissionsKg)}</p>
          <p className="mt-1 text-sm text-navy-700">dari {k.received} laporan masuk</p>
          <ul className="mt-3 space-y-1 text-xs text-navy-500" data-testid="emission-status">
            {es.workbook > 0 && <li>{es.workbook} laporan simulasi (nilai workbook)</li>}
            <li>{es.complete} lengkap · {es.partial} sebagian (kategori kosong tidak dihitung)</li>
            <li>{es.unavailable} belum dapat dihitung</li>
          </ul>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Emisi per Kategori" subtitle="kg CO₂e" className="xl:col-span-2"><EmissionBars bySource={{ all: k.byCategory }} sources={["all"]} sortDesc /></Panel>
        <Panel title="Distribusi Status Pemasok" subtitle="Jumlah laporan per warna — bukan rata-rata skor">
          <ScoreDonut counts={k.colors} />
          <p className="mt-3 text-[11px] text-navy-500">“Belum Dinilai” = komponen skor belum lengkap. Skor simulasi (workbook) dan skor aplikasi tidak dirata-ratakan bersama.</p>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Kelengkapan Data & Kecocokan Bukti" subtitle="Jumlah laporan masuk per kategori">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm" data-testid="completeness-evidence">
            <dt className="text-navy-500">Data lengkap (100%)</dt><dd className="text-right font-semibold">{cb.full}</dd>
            <dt className="text-navy-500">Sebagian (60–99%)</dt><dd className="text-right font-semibold">{cb.partial}</dd>
            <dt className="text-navy-500">Kurang dari 60%</dt><dd className="text-right font-semibold">{cb.low}</dd>
            {cb.unknown > 0 && <><dt className="text-navy-500">Belum Dinilai</dt><dd className="text-right font-semibold">{cb.unknown}</dd></>}
            <hr className="col-span-2 my-1 border-line" />
            <dt className="text-navy-500">Bukti cocok</dt><dd className="text-right font-semibold">{k.evidence.match}</dd>
            <dt className="text-navy-500">Bukti tidak cocok</dt><dd className="text-right font-semibold">{k.evidence.mismatch}</dd>
            <dt className="text-navy-500">Belum dapat diverifikasi</dt><dd className="text-right font-semibold">{k.evidence.unverifiable}</dd>
          </dl>
          <p className="mt-3 text-[11px] text-navy-500">Bukti hanya dinilai bila angka tagihan benar-benar diperiksa; tanpa pemeriksaan = belum dapat diverifikasi, tidak dihitung nol. Data simulasi memakai hasil cocok-bukti dari workbook.</p>
        </Panel>
        <Panel title="Intensitas Emisi per Sektor" subtitle="Dibanding rata-rata kelompok — pembanding SIMULASI, bukan pembanding industri resmi">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm" data-testid="intensity-table">
              <thead className="text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 pr-3 text-left font-medium">Sektor</th><th className="py-2 pr-3 text-right font-medium">Laporan</th><th className="py-2 pr-3 text-right font-medium">≤ rata-rata</th><th className="py-2 pr-3 text-right font-medium">1–1,15×</th><th className="py-2 pr-3 text-right font-medium">&gt; 1,15×</th><th className="py-2 text-right font-medium">Belum Dinilai</th></tr></thead>
              <tbody className="divide-y divide-line">
                {intensity.map((x) => (
                  <tr key={x.sector}><td className="py-2 pr-3">{x.sector}</td><td className="py-2 pr-3 text-right tabular-nums">{x.n}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{x.below}</td><td className="py-2 pr-3 text-right tabular-nums">{x.around}</td><td className="py-2 pr-3 text-right tabular-nums">{x.high}</td><td className="py-2 text-right tabular-nums">{x.unavailable}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-navy-500">Rasio intensitas (kg CO₂e per unit produksi) terhadap rata-rata kelompok dari sampel workbook simulasi, hanya untuk demonstrasi. Laporan aplikasi dibandingkan hanya bila total emisi lengkap dan satuan produksi berupa jumlah (unit/pcs).</p>
        </Panel>
      </div>
      <Panel title="Metodologi" className="mt-5"><MethodBadges /></Panel>
    </>
  );
}
