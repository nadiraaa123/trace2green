"use client";
import { CheckCircle2, CircleAlert, CircleDot, FileSearch, Gauge, ListChecks } from "lucide-react";
import { EmisiTabs } from "@/components/company/EmisiTabs";
import { PageTop } from "@/components/company/Shell";
import { Panel } from "@/components/company/ui";
import { WORKBOOK_SCORING_PARAMS, type ScoringParams } from "@/lib/scoring";
import { useDoc } from "@/lib/useDoc";

const pctTxt = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export default function ScoringMethodPage() {
  // Same parameters the scoring engine uses (imported from the workbook into meta/scoring_params).
  const { data } = useDoc<ScoringParams>("meta/scoring_params");
  const P = data ?? WORKBOOK_SCORING_PARAMS;
  const w = P.weights;
  const ex = { k: 90, b: 80, i: 75 };
  const exTotal = ex.k * w.completeness + ex.b * w.evidence + ex.i * w.intensity;

  const components = [
    { icon: ListChecks, name: "Kelengkapan Data", weight: w.completeness, what: "Seberapa lengkap informasi lingkungan yang dilaporkan pemasok.",
      how: "Persentase dari 10 pertanyaan laporan yang terjawab. Kategori yang dinyatakan “tidak memakai” dihitung terjawab; isian kosong tidak." },
    { icon: FileSearch, name: "Kecocokan Bukti", weight: w.evidence, what: "Seberapa sesuai data yang dilaporkan dengan bukti yang benar-benar diperiksa.",
      how: `Angka listrik pemasok dibandingkan dengan dokumen yang diperiksa peninjau. Selisih ≤ ${pctTxt(P.evidenceTolerance)} = cocok (100), lebih dari itu = tidak cocok (0). Tanpa pemeriksaan dokumen, komponen ini “belum dapat dinilai” — bukan nol.` },
    { icon: Gauge, name: "Intensitas Emisi", weight: w.intensity, what: "Perbandingan estimasi emisi per unit produksi dengan benchmark yang sesuai.",
      how: `Rasio intensitas pemasok terhadap rata-rata kelompok usahanya: ≤ ${num(P.greenMaxRatio)}× = 100, ≤ ${num(P.redMinRatio)}× = 50, di atasnya = 0. Tanpa benchmark yang sesuai atau data emisi lengkap, komponen ini belum dapat dinilai.` },
  ];

  return (
    <>
      <PageTop title="Emisi & Skor" subtitle="Cara Trace2Green menilai pemasok" period={false} />
      <EmisiTabs />

      <div className="grid gap-5 lg:grid-cols-3">
        {components.map((c) => (
          <Panel key={c.name}>
            <div className="flex items-center justify-between">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><c.icon className="size-5" /></span>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">{pctTxt(c.weight)}</span>
            </div>
            <h2 className="mt-4 text-base font-semibold">{c.name}</h2>
            <p className="mt-1 text-sm text-navy-700">{c.what}</p>
            <p className="mt-3 text-xs leading-relaxed text-navy-500">{c.how}</p>
          </Panel>
        ))}
      </div>

      <Panel title="Rumus Skor Total" className="mt-5">
        <p className="rounded-xl bg-surface px-4 py-3 font-mono text-sm" data-testid="formula">
          Skor Total = (Skor Kelengkapan × {pctTxt(w.completeness)}) + (Skor Bukti × {pctTxt(w.evidence)}) + (Skor Intensitas × {pctTxt(w.intensity)})
        </p>
        <div className="mt-4 rounded-xl border border-dashed border-brand-200 p-4" data-testid="example">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Contoh ilustrasi (bukan data pemasok)</p>
          <p className="mt-2 text-sm text-navy-700">Kelengkapan {ex.k}, Bukti {ex.b}, Intensitas {ex.i}:</p>
          <p className="mt-1 font-mono text-sm">({ex.k} × {pctTxt(w.completeness)}) + ({ex.b} × {pctTxt(w.evidence)}) + ({ex.i} × {pctTxt(w.intensity)}) = {num(ex.k * w.completeness)} + {num(ex.b * w.evidence)} + {num(ex.i * w.intensity)} = <b>{num(exTotal)}</b></p>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-navy-700">
          <li>• Skor total hanya ditampilkan bila <b>ketiga komponen tersedia</b>. Selain itu ditulis “Skor akhir belum tersedia”.</li>
          <li>• Data yang tidak diisi <b>tidak dihitung nol</b>.</li>
          <li>• Skor bertanda <b>sementara</b> belum diperiksa perusahaan; skor <b>simulasi</b> berasal dari data contoh; benchmark <b>simulasi</b> hanya untuk demonstrasi.</li>
        </ul>
      </Panel>

      <Panel title="Kategori Warna" subtitle="Ditentukan oleh aturan pada komponen, bukan oleh batas skor total" className="mt-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 font-semibold text-brand-700"><CheckCircle2 className="size-5" /> Hijau</p>
            <p className="mt-2 text-sm text-navy-700">Semua syarat terpenuhi: data lengkap (100%), bukti cocok, dan intensitas emisi ≤ {num(P.greenMaxRatio)}× rata-rata kelompok.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-700"><CircleDot className="size-5" /> Kuning</p>
            <p className="mt-2 text-sm text-navy-700">Semua komponen tersedia, tidak ada syarat Merah, tetapi belum memenuhi semua syarat Hijau (misalnya data sebagian atau intensitas di sekitar rata-rata).</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 font-semibold text-risk"><CircleAlert className="size-5" /> Merah</p>
            <p className="mt-2 text-sm text-navy-700">Salah satu terjadi: kelengkapan data &lt; {pctTxt(P.minCompleteness)}, bukti tidak cocok, atau intensitas &gt; {num(P.redMinRatio)}× rata-rata kelompok.</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-navy-500">
          Batas di atas berasal dari workbook (tab “Faktor emisi”, parameter skor) dan dipakai langsung oleh mesin penilaian. Workbook tidak menetapkan batas skor total
          untuk tiap warna. Bila komponen belum lengkap dan tidak ada syarat Merah, status ditulis “Belum Dinilai”.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="disclaimer">
          Kategori warna merupakan hasil penilaian internal Trace2Green untuk membantu pemantauan pemasok, bukan sertifikasi lingkungan resmi.
        </p>
      </Panel>
    </>
  );
}
