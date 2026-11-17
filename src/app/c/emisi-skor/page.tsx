"use client";
import { useCompany } from "@/components/company/CompanyContext";
import { EmissionBars, ScoreDonut, TrendChart } from "@/components/company/charts";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, MethodBadges, Panel, SourceBadge, fmt, pct, tco2 } from "@/components/company/ui";
import { filterRows, kpis, kpisFor, type Source } from "@/lib/kpi";
import { formatPeriod, shortPeriod } from "@/lib/period";

export default function EmissionsScorePage() {
  const c = useCompany();
  const rows = c.current?.rows ?? [];
  const groups = kpis(rows, c.source);
  const sources: Source[] = c.source === "all" ? ["demo", "trial"] : [c.source];
  const trend = c.periods.map((p) => ({
    label: shortPeriod(p.period),
    ...Object.fromEntries(sources.map((s) => { const k = kpisFor(p.rows, s); return [s, k.received ? Math.round(k.emissions.totalKg) : null]; })),
  }));
  const bySource = Object.fromEntries(groups.map((k) => [k.source, k.emissions.byCategory])) as Record<Source, Record<string, number>>;

  // Intensity vs benchmark, per sector, from received reports with a computed intensity.
  const sectorRows = filterRows(rows, c.source).filter((r) => ["submitted", "revision_requested", "imported_simulated"].includes(r.reportStatus));
  const sectors = [...new Set(sectorRows.map((r) => `${r.source}|${r.sector ?? "—"}`))].sort();
  const intensity = sectors.map((key) => {
    const [source, sector] = key.split("|") as [Source, string];
    const rs = sectorRows.filter((r) => r.source === source && (r.sector ?? "—") === sector);
    const withRatio = rs.filter((r) => r.intensityRatio != null);
    return {
      source, sector, n: rs.length,
      avgIntensity: rs.filter((r) => r.intensity != null).length ? rs.filter((r) => r.intensity != null).reduce((t, r) => t + r.intensity!, 0) / rs.filter((r) => r.intensity != null).length : null,
      below: withRatio.filter((r) => r.intensityRatio! <= 1).length,
      around: withRatio.filter((r) => r.intensityRatio! > 1 && r.intensityRatio! <= 1.15).length,
      high: withRatio.filter((r) => r.intensityRatio! > 1.15).length,
      unavailable: rs.length - withRatio.length,
    };
  });

  if (!c.current) return (<><PageTop title="Emisi & Skor" /><EmptyNote>Belum ada data.</EmptyNote></>);
  return (
    <>
      <PageTop title="Emisi & Skor" subtitle={`Estimasi emisi dan penilaian pemasok · ${formatPeriod(c.period!)}`} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Tren Estimasi Emisi" subtitle="Total kg CO₂e laporan masuk per bulan (sumber terpisah)" className="xl:col-span-2">
          <TrendChart data={trend} sources={sources} unit="kg" />
        </Panel>
        <Panel title="Ringkasan Emisi">
          <ul className="space-y-4">
            {groups.map((k) => (
              <li key={k.source}>
                <SourceBadge source={k.source} />
                <p className="mt-1 text-2xl font-semibold" data-testid={`emission-total-${k.source}`}>{tco2(k.emissions.totalKg)}</p>
                <p className="text-xs text-navy-500">{k.source === "demo" ? `${k.emissions.workbook} laporan · nilai workbook` : `${k.emissions.complete} lengkap · ${k.emissions.partial} sebagian (kategori kosong tidak dihitung) · ${k.emissions.unavailable} tidak tersedia`}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Emisi per Kategori" subtitle="kg CO₂e" className="xl:col-span-2"><EmissionBars bySource={bySource} sources={sources} /></Panel>
        <Panel title="Distribusi Skor">
          <div className="space-y-5">{groups.map((k) => <div key={k.source}>{groups.length > 1 && <div className="mb-2"><SourceBadge source={k.source} /></div>}<ScoreDonut counts={k.colors} /></div>)}</div>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Kelengkapan Data & Penilaian Bukti" subtitle="Komponen skor 30% + 30%">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 font-medium">Sumber</th><th className="py-2 font-medium">Rata-rata kelengkapan</th><th className="py-2 font-medium">Cocok</th><th className="py-2 font-medium">Tidak cocok</th><th className="py-2 font-medium">Belum dapat diverifikasi</th></tr></thead>
            <tbody className="divide-y divide-line">
              {groups.map((k) => (
                <tr key={k.source}><td className="py-2.5"><SourceBadge source={k.source} /></td><td className="py-2.5 font-semibold">{pct(k.avgCompleteness)}</td>
                  <td className="py-2.5">{k.evidence.match}</td><td className="py-2.5">{k.evidence.mismatch}</td><td className="py-2.5">{k.evidence.unverifiable}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-navy-500">Simulasi: hasil cocok-bukti workbook (sel “Belum ada bukti” diberi skor 0 oleh workbook). Trial: hanya nilai yang benar-benar diperiksa peninjau perusahaan Anda; tanpa pemeriksaan = belum dapat diverifikasi, tidak dihitung nol.</p>
        </Panel>
        <Panel title="Intensitas Emisi per Sektor" subtitle="Dibanding rata-rata kelompok — pembanding SIMULASI, bukan pembanding industri resmi">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 pr-3 text-left font-medium">Sektor</th><th className="py-2 pr-3 text-right font-medium">n</th><th className="py-2 pr-3 text-right font-medium">Rata-rata intensitas</th><th className="py-2 pr-3 text-right font-medium">≤ rata-rata</th><th className="py-2 pr-3 text-right font-medium">1–1,15×</th><th className="py-2 pr-3 text-right font-medium">&gt; 1,15×</th><th className="py-2 text-right font-medium">Tidak tersedia</th></tr></thead>
              <tbody className="divide-y divide-line">
                {intensity.map((x) => (
                  <tr key={`${x.source}${x.sector}`}><td className="py-2 pr-3"><SourceBadge source={x.source} /> {x.sector}</td><td className="py-2 pr-3 text-right tabular-nums">{x.n}</td><td className="py-2 pr-3 text-right tabular-nums">{fmt(x.avgIntensity, 4)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{x.below}</td><td className="py-2 pr-3 text-right tabular-nums">{x.around}</td><td className="py-2 pr-3 text-right tabular-nums">{x.high}</td><td className="py-2 text-right tabular-nums">{x.unavailable}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-navy-500">Intensitas dalam kg CO₂e per unit produksi. Rata-rata kelompok berasal dari sampel workbook simulasi dan dipakai hanya untuk demonstrasi. Intensitas trial dibandingkan hanya bila total emisi lengkap dan satuan produksi berupa jumlah (unit/pcs).</p>
        </Panel>
      </div>
      <Panel title="Metodologi" className="mt-5"><MethodBadges /></Panel>
    </>
  );
}
