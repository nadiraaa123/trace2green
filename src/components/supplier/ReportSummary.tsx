"use client";
import { formatId } from "@/lib/numbers";
import { CATEGORY_LABEL } from "@/lib/report";
import type { ActivityCategory, ActivityData, ReportProfile } from "@/lib/types";

const MISSING = <span className="font-normal text-amber-600">Belum diisi</span>;
const NA = <span className="font-normal text-navy-500">Tidak memakai</span>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-navy-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, step, onEdit, children }: { title: string; step: number; onEdit?: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-2">
      <div className="flex items-center justify-between pt-1.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onEdit && <button type="button" onClick={() => onEdit(step)} className="text-sm font-medium text-brand-600">Ubah</button>}
      </div>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  );
}

const val = (n: number | null, unit: string) => (n == null ? MISSING : `${formatId(n)} ${unit}`);
const txt = (s: string | null) => s ?? MISSING;

export function ReportSummary({ profile, activity, onEdit }: { profile: ReportProfile; activity: ActivityData; onEdit?: (step: number) => void }) {
  const na = new Set<ActivityCategory>(activity.notApplicable ?? []);
  return (
    <div className="space-y-3">
      <Section title="1. Profil & produksi" step={1} onEdit={onEdit}>
        <Row label="Nama usaha">{txt(profile.businessName)}</Row>
        <Row label="Sektor usaha">{txt(profile.sector)}</Row>
        <Row label="Produk utama">{txt(profile.mainProduct)}</Row>
        <Row label="Jumlah produksi">{val(profile.productionVolume, profile.productionUnit ?? "")}</Row>
        <Row label="Jumlah pekerja">{val(profile.employees, "orang")}</Row>
      </Section>
      <Section title="2. Data aktivitas" step={2} onEdit={onEdit}>
        <Row label={CATEGORY_LABEL.listrik}>{na.has("listrik") ? NA : val(activity.electricityKwh, "kWh")}</Row>
        <Row label={CATEGORY_LABEL.bbm}>
          {na.has("bbm") ? NA : <>{val(activity.fuelQuantity, activity.fuelUnit ?? "")}{activity.fuelType ? ` · ${activity.fuelType}` : ""}</>}
        </Row>
        <Row label={CATEGORY_LABEL.kemasan}>
          {na.has("kemasan") ? NA : <>{val(activity.packagingKg, "kg")}{activity.packagingMaterial ? ` · ${activity.packagingMaterial}` : ""}</>}
        </Row>
        <Row label={CATEGORY_LABEL.limbah}>
          {na.has("limbah") ? NA : <>{val(activity.wasteKg, "kg")}{activity.wasteHandling ? ` · ${activity.wasteHandling}` : ""}</>}
        </Row>
        <Row label="Asal bahan baku">{txt(activity.rawMaterialOrigin)}</Row>
        <Row label={CATEGORY_LABEL.transportasi}>
          {na.has("transportasi") ? NA : <>{txt(activity.transportMode)} · {val(activity.transportKm, "km")}</>}
        </Row>
        <Row label="Upaya hemat energi/daur ulang">{txt(activity.efficiencyPractice)}</Row>
      </Section>
    </div>
  );
}
