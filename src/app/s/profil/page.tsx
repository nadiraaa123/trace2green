"use client";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Building2, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NumberField, SelectField, TextField } from "@/components/supplier/form";
import { Card, PageHeader } from "@/components/supplier/ui";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { SECTORS } from "@/lib/constants";
import { db } from "@/lib/firebase/client";
import { parseIdNumber, toInput } from "@/lib/numbers";
import { useSupplier } from "@/lib/supplier-data";
import type { SupplierDoc } from "@/lib/types";

const REGIONS = ["Jakarta", "Bogor", "Depok", "Tangerang", "Bekasi", "Lainnya"] as const;
const WA_RE = /^(\+62|62|0)8\d{7,12}$/;

export default function ProfilePage() {
  const { data: s, loading } = useSupplier();
  return (
    <>
      <PageHeader title="Profil Usaha" />
      {loading || !s ? <Card className="h-64 animate-pulse" /> : <ProfileForm s={s} />}
    </>
  );
}

function ProfileForm({ s }: { s: SupplierDoc }) {
  const { user, signOut } = useAuth();
  const [f, setF] = useState({
    businessName: s.businessName ?? "", picName: s.picName ?? "", whatsapp: s.whatsapp ?? "", sector: s.sector, region: s.region,
    mainProduct: s.mainProduct ?? "", employees: toInput(s.employees),
  });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const emp = parseIdNumber(f.employees);
  const empError = !emp.ok ? emp.error : emp.value != null && !Number.isInteger(emp.value) ? "Harus bilangan bulat" : undefined;

  async function onSave() {
    setMsg(null);
    if (f.businessName.trim().length < 2) return setMsg({ tone: "error", text: "Nama usaha minimal 2 karakter." });
    if (f.whatsapp && !WA_RE.test(f.whatsapp.trim())) return setMsg({ tone: "error", text: "Nomor WhatsApp tidak valid." });
    if (empError || !emp.ok) return setMsg({ tone: "error", text: "Periksa jumlah pekerja." });
    setBusy(true);
    try {
      await updateDoc(doc(db, "suppliers", s.supplierId), {
        businessName: f.businessName.trim(), picName: f.picName.trim() || null, whatsapp: f.whatsapp.trim() || null,
        sector: f.sector, region: f.region, mainProduct: f.mainProduct.trim() || null, employees: emp.value, updatedAt: serverTimestamp(),
      });
      setMsg({ tone: "success", text: "Profil usaha tersimpan." });
    } catch (e) {
      setMsg({ tone: "error", text: `Gagal menyimpan (${(e as { code?: string }).code ?? "error"}).` });
    } finally {
      setBusy(false);
    }
  }

  return (
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <p className="text-navy-500">ID Pemasok</p>
            <p className="font-mono font-semibold">{s.supplierId}</p>
            <p className="mt-2 text-navy-500">Email akun</p>
            <p className="font-medium">{user?.email}</p>
          </Card>
          <TextField label="Nama usaha" value={f.businessName} onChange={(v) => setF({ ...f, businessName: v })} />
          <TextField label="Nama penanggung jawab" value={f.picName} onChange={(v) => setF({ ...f, picName: v })} />
          <TextField label="Nomor WhatsApp" value={f.whatsapp} onChange={(v) => setF({ ...f, whatsapp: v })} placeholder="0812xxxxxxxx" />
          <SelectField label="Sektor usaha" value={f.sector as (typeof SECTORS)[number] | null} options={SECTORS} onChange={(v) => setF({ ...f, sector: v })} />
          <SelectField label="Wilayah" value={f.region as (typeof REGIONS)[number] | null} options={REGIONS} onChange={(v) => setF({ ...f, region: v })} />
          <TextField label="Produk utama" value={f.mainProduct} onChange={(v) => setF({ ...f, mainProduct: v })} />
          <NumberField label="Jumlah pekerja" unit="orang" value={f.employees} parsed={emp.ok ? emp.value : null} error={empError} onChange={(v) => setF({ ...f, employees: v })} />
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button onClick={onSave} loading={busy} className="w-full">Simpan profil</Button>
          <p className="text-xs text-navy-500">Perubahan profil dipakai untuk laporan berikutnya. Laporan yang sudah dikirim tidak berubah.</p>
          <Link href="/s/perusahaan" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm font-medium">
            <Building2 className="size-5 text-brand-500" /> <span className="flex-1">Perusahaan terhubung & izin data</span> <ChevronRight className="size-4 text-navy-300" />
          </Link>
          <Button variant="ghost" onClick={signOut} className="w-full text-risk hover:bg-red-50"><LogOut className="size-4" /> Keluar</Button>
        </div>
  );
}
