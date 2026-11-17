"use client";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Card, EmptyState, PageHeader } from "@/components/supplier/ui";
import { Button } from "@/components/ui/Button";
import { Alert, Field } from "@/components/ui/Field";
import { apiPost, authErrorMessage } from "@/lib/api";
import { useConsents, useRelationships } from "@/lib/supplier-data";

export default function CompaniesPage() {
  const rels = useRelationships();
  const consents = useConsents();
  const [code, setCode] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy("connect");
    try {
      const r = await apiPost<{ companyName: string; shared: boolean }>("/api/suppliers/connect", { inviteCode: code, shareData: share });
      setMsg({ tone: "success", text: `Terhubung dengan ${r.companyName}.${r.shared ? " Laporan terkirim Anda kini dapat dilihat perusahaan ini." : ""}` });
      setCode("");
    } catch (err) {
      setMsg({ tone: "error", text: authErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(companyId: string, granted: boolean) {
    setMsg(null);
    setBusy(companyId);
    try {
      await apiPost("/api/suppliers/consent", { companyId, granted });
    } catch (err) {
      setMsg({ tone: "error", text: authErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Perusahaan Terhubung" back="/s" />
      <div className="flex gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-700">
        <ShieldCheck className="size-5 shrink-0" />
        <p>Data usaha tetap milik Anda. Perusahaan hanya dapat melihat laporan yang sudah dikirim setelah Anda memberi izin, dan izin dapat dicabut kapan saja.</p>
      </div>
      {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <section className="mt-5 space-y-2.5">
        {rels.loading ? <Card className="h-20 animate-pulse" /> : rels.rows.length === 0 ? (
          <EmptyState icon={Building2} title="Belum terhubung dengan perusahaan" body="Masukkan kode dari perusahaan pembeli Anda di bawah ini." />
        ) : rels.rows.map((r) => {
          const c = consents.rows.find((x) => x.companyId === r.companyId);
          const granted = !!c?.granted;
          return (
            <Card key={r.id} className="flex items-center gap-3 p-4">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-50 text-info"><Building2 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.companyName ?? r.companyId}</p>
                <p className="text-xs text-navy-500">{granted ? "Boleh melihat laporan terkirim" : "Belum diizinkan melihat laporan"}</p>
              </div>
              <button type="button" role="switch" aria-checked={granted} aria-label={`Izinkan ${r.companyName ?? r.companyId} melihat laporan`}
                disabled={busy === r.companyId} onClick={() => toggle(r.companyId, !granted)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${granted ? "bg-brand-500" : "bg-line"} disabled:opacity-50`}>
                <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${granted ? "left-[1.375rem]" : "left-0.5"}`} />
              </button>
            </Card>
          );
        })}
      </section>

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Hubungkan dengan kode perusahaan</h2>
        <p className="mt-1 text-xs text-navy-500">Kode 8 karakter dikirim oleh perusahaan pembeli Anda. Satu kode untuk satu usaha.</p>
        <form onSubmit={connect} className="mt-3 space-y-3">
          <Field label="Kode perusahaan" icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. K7M2Q9XA" autoCapitalize="characters" />
          <label className="flex items-start gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
            Izinkan perusahaan ini melihat laporan yang sudah saya kirim
          </label>
          <Button type="submit" loading={busy === "connect"} disabled={code.trim().length !== 8} className="w-full">Hubungkan</Button>
        </form>
      </Card>
    </>
  );
}
