"use client";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Cloud, CloudOff, Loader2, Save, Send } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceStep } from "@/components/supplier/EvidenceStep";
import { CategoryBlock, Choice, NumberField, SelectField, Stepper, TextField } from "@/components/supplier/form";
import { ReportSummary } from "@/components/supplier/ReportSummary";
import { Card, LinkButton } from "@/components/supplier/ui";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { apiPost, authErrorMessage } from "@/lib/api";
import { reportId, SECTORS } from "@/lib/constants";
import { db } from "@/lib/firebase/client";
import { parseIdNumber, toInput } from "@/lib/numbers";
import { formatPeriod } from "@/lib/period";
import {
  CATEGORY_LABEL, FUEL_TYPES, fuelUnitFor, missingItems, NOT_USED_LABEL, ORIGINS, plausibilityWarnings,
  PRACTICES, PRODUCTION_UNITS, SECTOR_HINTS, submitBlockers, TRANSPORT_MODES,
} from "@/lib/report";
import { useConsents, useRelationships, useSupplierId } from "@/lib/supplier-data";
import type { ActivityCategory, ActivityData, MonthlyReportDoc, ReportProfile } from "@/lib/types";

const STEPS = ["Profil Usaha", "Data Aktivitas", "Unggah Bukti", "Tinjau"];
type NumKey = "productionVolume" | "employees" | "electricityKwh" | "fuelQuantity" | "packagingKg" | "wasteKg" | "transportKm";
const PROFILE_NUMS: NumKey[] = ["productionVolume", "employees"];
const CATEGORY_FIELDS: Record<ActivityCategory, (keyof ActivityData)[]> = {
  listrik: ["electricityKwh"],
  bbm: ["fuelQuantity", "fuelType", "fuelUnit"],
  kemasan: ["packagingKg", "packagingMaterial"],
  limbah: ["wasteKg", "wasteHandling"],
  transportasi: ["transportMode", "transportKm"],
};
type SaveState = "saved" | "saving" | "unsaved" | "invalid" | "error";

export default function ReportWizardPage() {
  const { period } = useParams<{ period: string }>();
  const router = useRouter();
  const sid = useSupplierId()!;
  const rid = reportId(sid, period);
  const rels = useRelationships();
  const consents = useConsents();

  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<MonthlyReportDoc["status"]>("draft");
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<ReportProfile | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [raw, setRaw] = useState<Record<NumKey, string>>({} as Record<NumKey, string>);
  const [errors, setErrors] = useState<Partial<Record<NumKey, string>>>({});
  const [save, setSave] = useState<SaveState>("saved");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = useRef(false);

  // Load once. A listener would overwrite in-progress typing with older snapshots.
  useEffect(() => {
    getDoc(doc(db, "monthly_reports", rid)).then((s) => {
      if (!s.exists()) return router.replace(`/s/laporan/baru?period=${period}`);
      const r = s.data() as MonthlyReportDoc;
      if (r.status !== "draft" && r.status !== "revision_requested") return router.replace(`/s/laporan/${period}`);
      setStatus(r.status);
      setProfile(r.profile);
      setActivity({ ...r.activity, notApplicable: r.activity.notApplicable ?? [] });
      setStep(Math.min(Math.max(r.draftStep ?? 1, 1), 4));
      setRaw({
        productionVolume: toInput(r.profile.productionVolume), employees: toInput(r.profile.employees),
        electricityKwh: toInput(r.activity.electricityKwh), fuelQuantity: toInput(r.activity.fuelQuantity),
        packagingKg: toInput(r.activity.packagingKg), wasteKg: toInput(r.activity.wasteKg), transportKm: toInput(r.activity.transportKm),
      });
      setLoaded(true);
    }).catch(() => setSave("error"));
  }, [rid, period, router]);

  const hasErrors = Object.values(errors).some(Boolean);

  const persist = useCallback(async () => {
    if (!profile || !activity) return false;
    if (hasErrors) { setSave("invalid"); return false; }
    setSave("saving");
    try {
      await updateDoc(doc(db, "monthly_reports", rid), { profile, activity, draftStep: step, updatedAt: serverTimestamp() });
      dirty.current = false;
      setSave("saved");
      return true;
    } catch {
      setSave("error");
      return false;
    }
  }, [profile, activity, step, rid, hasErrors]);

  // Debounced autosave.
  useEffect(() => {
    if (!loaded || !dirty.current || hasErrors) return;
    const t = setTimeout(persist, 1200);
    return () => clearTimeout(t);
  }, [profile, activity, step, loaded, hasErrors, persist]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const touch = () => { dirty.current = true; setSave("unsaved"); };
  const setP = <K extends keyof ReportProfile>(k: K, v: ReportProfile[K]) => { touch(); setProfile((p) => ({ ...p!, [k]: v })); };
  const setA = <K extends keyof ActivityData>(k: K, v: ActivityData[K]) => { touch(); setActivity((a) => ({ ...a!, [k]: v })); };

  function setNum(k: NumKey, input: string) {
    setRaw((r) => ({ ...r, [k]: input }));
    const res = parseIdNumber(input);
    let err = res.ok ? null : res.error;
    if (res.ok && k === "employees" && res.value != null && !Number.isInteger(res.value)) err = "Jumlah pekerja harus bilangan bulat";
    setErrors((e) => ({ ...e, [k]: err ?? undefined }));
    if (err || !res.ok) { touch(); return; }
    if (PROFILE_NUMS.includes(k)) setP(k as "productionVolume" | "employees", res.value);
    else setA(k as "electricityKwh", res.value);
  }

  function setNotUsed(cat: ActivityCategory, on: boolean) {
    touch();
    setActivity((a) => {
      const next = { ...a! };
      const set = new Set(next.notApplicable);
      if (on) {
        set.add(cat);
        // Clear values of a category the supplier does not use, so no stale numbers remain.
        for (const f of CATEGORY_FIELDS[cat]) (next as Record<string, unknown>)[f] = null;
      } else set.delete(cat);
      next.notApplicable = [...set];
      return next;
    });
    if (on) {
      const nums = (CATEGORY_FIELDS[cat] as string[]).filter((f): f is NumKey => f in raw);
      setRaw((r) => ({ ...r, ...Object.fromEntries(nums.map((f) => [f, ""])) }));
      setErrors((e) => ({ ...e, ...Object.fromEntries(nums.map((f) => [f, undefined])) }));
    }
  }

  const goto = (s: number) => { touch(); setStep(s); window.scrollTo({ top: 0 }); };

  const missing = useMemo(() => (profile && activity ? missingItems(profile, activity) : []), [profile, activity]);
  const blockers = profile ? submitBlockers(profile) : [];
  const warnings = activity ? plausibilityWarnings(activity) : [];
  const receivers = consents.rows.filter((c) => c.granted).map((c) => rels.rows.find((r) => r.companyId === c.companyId)?.companyName ?? c.companyId);

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    const ok = await persist();
    if (!ok) { setSubmitting(false); setSubmitError("Draf belum tersimpan. Periksa isian yang salah lalu coba lagi."); return; }
    try {
      await apiPost("/api/reports/submit", { period });
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSubmitError(authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded || !profile || !activity) return <FullPageSpinner />;

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-500"><CheckCircle2 className="size-9" /></span>
        <h1 className="mt-5 text-xl font-semibold">Laporan terkirim</h1>
        <p className="mt-2 max-w-xs text-sm text-navy-500">Laporan {formatPeriod(period)} berstatus <b className="text-navy-900">Menunggu Verifikasi</b>.
          {receivers.length ? ` Diteruskan ke ${receivers.join(", ")}.` : " Belum ada perusahaan yang menerima laporan ini."}</p>
        <div className="mt-8 grid w-full gap-2">
          <LinkButton href={`/s/laporan/${period}`}>Lihat status laporan</LinkButton>
          <LinkButton href="/s" variant="secondary">Kembali ke beranda</LinkButton>
        </div>
      </div>
    );
  }

  const na = new Set(activity.notApplicable);

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 -mx-5 border-b border-line/70 bg-white/95 px-3 pb-3 backdrop-blur">
        <div className="flex h-14 items-center gap-2">
          <Link href={`/s/laporan/${period}`} aria-label="Kembali" className="inline-flex size-10 items-center justify-center rounded-full text-navy-700 hover:bg-surface">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">Laporan {formatPeriod(period)}</h1>
            <SaveIndicator state={hasErrors ? "invalid" : save} />
          </div>
        </div>
        <Stepper step={step} labels={STEPS} onJump={goto} />
      </header>

      {status === "revision_requested" && step === 1 && (
        <div className="mt-4"><Alert tone="info">Laporan sedang diperbaiki. Kirim ulang setelah selesai; versi sebelumnya tetap tersimpan.</Alert></div>
      )}

      {step === 1 && (
        <section className="mt-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">1. Profil usaha</h2>
            <p className="text-sm text-navy-500">Data usaha untuk periode {formatPeriod(period)}.</p>
          </div>
          <TextField label="Nama usaha" value={profile.businessName ?? ""} onChange={(v) => setP("businessName", v.trim() ? v : null)} />
          <SelectField label="Sektor usaha" value={profile.sector as (typeof SECTORS)[number] | null} options={SECTORS} onChange={(v) => setP("sector", v)} />
          {profile.sector && SECTOR_HINTS[profile.sector] && <p className="-mt-2 rounded-xl bg-brand-50 p-3 text-xs text-brand-700">{SECTOR_HINTS[profile.sector]}</p>}
          <TextField label="Produk utama" value={profile.mainProduct ?? ""} onChange={(v) => setP("mainProduct", v.trim() ? v : null)} placeholder="mis. Roti tawar" />
          <div className="grid grid-cols-[1fr_7.5rem] gap-3">
            <NumberField label="Jumlah produksi" value={raw.productionVolume} parsed={profile.productionVolume} error={errors.productionVolume} onChange={(v) => setNum("productionVolume", v)} />
            <SelectField label="Satuan" value={profile.productionUnit as (typeof PRODUCTION_UNITS)[number] | null} options={PRODUCTION_UNITS} onChange={(v) => setP("productionUnit", v)} />
          </div>
          <NumberField label="Jumlah pekerja" unit="orang" value={raw.employees} parsed={profile.employees} error={errors.employees} onChange={(v) => setNum("employees", v)} hint="Termasuk pemilik yang ikut bekerja." />
        </section>
      )}

      {step === 2 && (
        <section className="mt-5 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">2. Data aktivitas</h2>
            <p className="text-sm text-navy-500">Isi angka selama {formatPeriod(period)}. Kosongkan bila belum tahu; centang “tidak memakai” bila memang tidak ada.</p>
          </div>
          <CategoryBlock title={CATEGORY_LABEL.listrik} notUsedLabel={NOT_USED_LABEL.listrik} notUsed={na.has("listrik")} onNotUsed={(v) => setNotUsed("listrik", v)}>
            <NumberField label="Pemakaian listrik" unit="kWh" value={raw.electricityKwh} parsed={activity.electricityKwh} error={errors.electricityKwh} onChange={(v) => setNum("electricityKwh", v)} hint="Lihat angka kWh di tagihan PLN atau riwayat token." />
          </CategoryBlock>
          <CategoryBlock title={CATEGORY_LABEL.bbm} notUsedLabel={NOT_USED_LABEL.bbm} notUsed={na.has("bbm")} onNotUsed={(v) => setNotUsed("bbm", v)}>
            <Choice label="Jenis bahan bakar" value={activity.fuelType} options={FUEL_TYPES} onChange={(v) => { touch(); setActivity((a) => ({ ...a!, fuelType: v, fuelUnit: fuelUnitFor(v) })); }} />
            <NumberField label="Jumlah per bulan" unit={activity.fuelUnit ?? (activity.fuelType ? "" : "liter/kg")} value={raw.fuelQuantity} parsed={activity.fuelQuantity}
              error={errors.fuelQuantity} onChange={(v) => setNum("fuelQuantity", v)} hint={activity.fuelType === "LPG" ? "LPG dihitung dalam kg (tabung 3 kg = 3)." : "Bensin dan solar dalam liter."} />
          </CategoryBlock>
          <CategoryBlock title={CATEGORY_LABEL.kemasan} notUsedLabel={NOT_USED_LABEL.kemasan} notUsed={na.has("kemasan")} onNotUsed={(v) => setNotUsed("kemasan", v)}>
            <NumberField label="Berat kemasan dipakai" unit="kg" value={raw.packagingKg} parsed={activity.packagingKg} error={errors.packagingKg} onChange={(v) => setNum("packagingKg", v)} />
            <TextField label="Jenis kemasan (opsional)" value={activity.packagingMaterial ?? ""} onChange={(v) => setA("packagingMaterial", v.trim() ? v : null)} placeholder="mis. plastik, kertas, kardus" />
          </CategoryBlock>
          <CategoryBlock title={CATEGORY_LABEL.limbah} notUsedLabel={NOT_USED_LABEL.limbah} notUsed={na.has("limbah")} onNotUsed={(v) => setNotUsed("limbah", v)}>
            <NumberField label="Jumlah limbah" unit="kg" value={raw.wasteKg} parsed={activity.wasteKg} error={errors.wasteKg} onChange={(v) => setNum("wasteKg", v)} />
            <TextField label="Cara pengelolaan (opsional)" value={activity.wasteHandling ?? ""} onChange={(v) => setA("wasteHandling", v.trim() ? v : null)} placeholder="mis. diangkut petugas, didaur ulang" />
          </CategoryBlock>
          <section className="rounded-2xl border border-line bg-white p-4">
            <Choice label="Asal bahan baku utama" value={activity.rawMaterialOrigin} options={ORIGINS} onChange={(v) => setA("rawMaterialOrigin", v)} />
          </section>
          <CategoryBlock title={CATEGORY_LABEL.transportasi} notUsedLabel={NOT_USED_LABEL.transportasi} notUsed={na.has("transportasi")} onNotUsed={(v) => setNotUsed("transportasi", v)}>
            <Choice label="Moda pengiriman" value={activity.transportMode} options={TRANSPORT_MODES} onChange={(v) => setA("transportMode", v)} />
            <NumberField label="Total jarak pengiriman" unit="km" value={raw.transportKm} parsed={activity.transportKm} error={errors.transportKm} onChange={(v) => setNum("transportKm", v)} hint="Perkiraan total km selama sebulan." />
          </CategoryBlock>
          <section className="rounded-2xl border border-line bg-white p-4">
            <Choice label="Upaya hemat energi atau daur ulang" value={activity.efficiencyPractice} options={PRACTICES} onChange={(v) => setA("efficiencyPractice", v)} />
          </section>
          {warnings.map((w) => <Alert key={w} tone="info">{w}</Alert>)}
        </section>
      )}

      {step === 3 && <EvidenceStep supplierId={sid} reportId={rid} />}

      {step === 4 && (
        <section className="mt-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">4. Tinjau & kirim</h2>
            <p className="text-sm text-navy-500">Periksa kembali sebelum dikirim.</p>
          </div>
          {missing.length > 0 ? (
            <Card className="border-amber-100 bg-amber-50/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle className="size-4" /> {missing.length} isian belum lengkap</p>
              <p className="mt-1 text-xs text-amber-800/80">Laporan tetap bisa dikirim, tetapi isian kosong mengurangi kelengkapan data dan tidak dihitung sebagai nol.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {missing.map((m) => (
                  <li key={m.field}><button type="button" onClick={() => goto(m.step)} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-800">{m.label}</button></li>
                ))}
              </ul>
            </Card>
          ) : (
            <Alert tone="success">Semua pertanyaan sudah dijawab.</Alert>
          )}
          {warnings.map((w) => <Alert key={w} tone="info">{w}</Alert>)}
          <ReportSummary profile={profile} activity={activity} onEdit={goto} />
          <Card className="p-4 text-sm">
            <p className="font-semibold">Penerima laporan</p>
            <p className="mt-1 text-navy-500">{receivers.length ? receivers.join(", ") : "Belum ada perusahaan yang Anda izinkan menerima data."}</p>
            {!receivers.length && <Link href="/s/perusahaan" className="mt-2 inline-block font-medium text-brand-600">Atur perusahaan terhubung</Link>}
          </Card>
          {blockers.map((b) => <Alert key={b}>{b}</Alert>)}
          {submitError && <Alert>{submitError}</Alert>}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => goto(step - 1)} className="px-4" aria-label="Langkah sebelumnya"><ArrowLeft className="size-4" /></Button>
          ) : (
            <Button variant="secondary" onClick={() => persist()} className="px-4"><Save className="size-4" /> Simpan</Button>
          )}
          {step < 4 ? (
            <Button onClick={() => goto(step + 1)} className="flex-1">Lanjut <ArrowRight className="size-4" /></Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => persist()} className="px-4" aria-label="Simpan draf"><Save className="size-4" /></Button>
              <Button onClick={submit} loading={submitting} disabled={blockers.length > 0 || hasErrors} className="flex-1">
                <Send className="size-4" /> {status === "revision_requested" ? "Kirim Ulang" : "Kirim Laporan"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; text: string; cls: string }> = {
    saved: { icon: <Cloud className="size-3.5" />, text: "Draf tersimpan", cls: "text-navy-500" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Menyimpan…", cls: "text-navy-500" },
    unsaved: { icon: <Cloud className="size-3.5" />, text: "Perubahan belum tersimpan", cls: "text-navy-500" },
    invalid: { icon: <CloudOff className="size-3.5" />, text: "Perbaiki isian yang salah agar bisa disimpan", cls: "text-risk" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Gagal menyimpan. Periksa koneksi.", cls: "text-risk" },
  };
  const s = map[state];
  return <p role="status" className={`flex items-center gap-1 text-xs ${s.cls}`}>{s.icon} {s.text}</p>;
}
