"use client";
import { Copy, KeyRound, RefreshCw, Sheet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCompany } from "@/components/company/CompanyContext";
import { PageTop } from "@/components/company/Shell";
import { EmptyNote, Panel, SimTag } from "@/components/company/ui";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { auth } from "@/lib/firebase/client";
import { apiPost, authErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/supplier-data";
import { useDoc } from "@/lib/useDoc";

interface Invite { type: "claim" | "connect"; supplierId: string | null; createdAt: string | null; expiresAt: string | null; used: boolean }
interface User { email: string; displayName: string; role: string; canVerify: boolean }

async function apiGet<T>(path: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Gagal memuat");
  return json as T;
}
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function SettingsPage() {
  const { claims, user } = useAuth();
  const c = useCompany();
  const rows = c.current?.rows ?? [];
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [code, setCode] = useState<{ code: string; type: string; supplierId: string | null } | null>(null);
  const [claimFor, setClaimFor] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { data: sync } = useDoc<{ lastStatus?: string; lastError?: string | null; lastSyncAt?: unknown; rows?: Record<string, number> }>(`sheets_sync/${c.companyId}`);

  const load = useCallback(() => {
    apiGet<{ invites: Invite[] }>("/api/companies/invites").then((r) => setInvites(r.invites)).catch(() => setInvites([]));
    apiGet<{ users: User[] }>("/api/companies/users").then((r) => setUsers(r.users)).catch(() => setUsers([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createCode(supplierId: string | null) {
    setMsg(null); setBusy(supplierId ? "claim" : "connect");
    try {
      const r = await apiPost<{ code: string; type: string; supplierId: string | null }>("/api/companies/invites", { supplierId });
      setCode(r); load();
    } catch (e) { setMsg({ tone: "error", text: authErrorMessage(e) }); } finally { setBusy(null); }
  }
  async function refresh() {
    setMsg(null); setBusy("refresh");
    try { const r = await apiPost<{ summariesWritten: number }>("/api/companies/stats/refresh", {}); setMsg({ tone: "success", text: `Ringkasan diperbarui (${r.summariesWritten} dokumen berubah).` }); }
    catch (e) { setMsg({ tone: "error", text: authErrorMessage(e) }); } finally { setBusy(null); }
  }

  async function syncSheets() {
    setMsg(null); setBusy("sheets");
    try {
      const r = await apiPost<{ results: { status: string; tabsWritten: string[]; error?: string }[] }>("/api/sync/sheets", {});
      const x = r.results[0];
      setMsg(x.status === "ok" ? { tone: "success", text: `Sinkronisasi selesai: ${x.tabsWritten.length} tab diperbarui.` } : { tone: "error", text: `Sinkronisasi gagal: ${x.error}` });
    } catch (e) { setMsg({ tone: "error", text: authErrorMessage(e) }); } finally { setBusy(null); }
  }

  const consent = { yes: rows.filter((r) => r.consent), no: rows.filter((r) => !r.consent) };
  return (
    <>
      <PageTop title="Pengaturan" period={false} />
      {msg && <div className="mb-4 max-w-2xl"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Profil Perusahaan">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-navy-500">Nama</dt><dd className="font-medium">{c.company?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">ID perusahaan</dt><dd className="font-mono">{c.companyId}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">Paket</dt><dd>{c.company?.plan === "subscription" ? "Langganan" : "Uji coba"}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-500">Sumber data akun</dt><dd>{c.company?.isSimulated ? "Perusahaan contoh (simulasi)" : c.company?.dataSource ?? "—"}</dd></div>
          </dl>
          <Button variant="secondary" onClick={refresh} loading={busy === "refresh"} className="mt-4 h-10"><RefreshCw className="size-4" /> Perbarui ringkasan dasbor</Button>
          <p className="mt-2 text-[11px] text-navy-500">Ringkasan diperbarui otomatis setiap ada laporan, keputusan, atau perubahan izin. Tombol ini hanya cadangan.</p>
        </Panel>

        <Panel title="Undang Pemasok" subtitle="Kode 8 karakter, sekali pakai, berlaku 14 hari. Kode hanya ditampilkan sekali.">
          <div className="space-y-3">
            <Button onClick={() => createCode(null)} loading={busy === "connect"} className="h-10" data-testid="create-connect-code"><KeyRound className="size-4" /> Buat kode penghubung</Button>
            <p className="text-xs text-navy-500">Untuk UMKM yang mendaftar sendiri: masukkan di menu Perusahaan Terhubung.</p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Pemasok untuk kode klaim" value={claimFor} onChange={(e) => setClaimFor(e.target.value)} className="h-10 rounded-xl border border-line px-3 text-sm">
                <option value="">Pilih pemasok terdaftar…</option>
                {rows.map((r) => <option key={r.supplierId} value={r.supplierId}>{r.supplierId} · {r.name}</option>)}
              </select>
              <Button variant="secondary" disabled={!claimFor} onClick={() => createCode(claimFor)} loading={busy === "claim"} className="h-10">Buat kode klaim</Button>
            </div>
            <p className="text-xs text-navy-500">Untuk pemasok yang sudah ada di daftar Anda tetapi belum punya akun.</p>
            {code && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                <p className="text-xs text-brand-700">{code.type === "connect" ? "Kode penghubung" : `Kode klaim untuk ${code.supplierId}`}</p>
                <p className="mt-1 flex items-center gap-2 font-mono text-2xl font-semibold tracking-widest" data-testid="invite-code">{code.code}
                  <button onClick={() => navigator.clipboard?.writeText(code.code)} aria-label="Salin kode" className="text-brand-600"><Copy className="size-4" /></button></p>
                <p className="mt-1 text-xs text-brand-700">Kirim ke pemasok melalui WhatsApp. Kode tidak dapat ditampilkan lagi.</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Riwayat Undangan">
          {invites.length === 0 ? <EmptyNote>Belum ada undangan.</EmptyNote> : (
            <table className="w-full text-sm"><thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 font-medium">Jenis</th><th className="py-2 font-medium">Pemasok</th><th className="py-2 font-medium">Dibuat</th><th className="py-2 font-medium">Berlaku s.d.</th><th className="py-2 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-line">{invites.slice(0, 15).map((i, k) => (
                <tr key={k}><td className="py-2">{i.type === "connect" ? "Penghubung" : "Klaim"}</td><td className="py-2">{i.supplierId ?? "—"}</td><td className="py-2">{d(i.createdAt)}</td><td className="py-2">{d(i.expiresAt)}</td>
                  <td className="py-2">{i.used ? "Dipakai" : i.expiresAt && new Date(i.expiresAt) < new Date() ? "Kedaluwarsa" : "Aktif"}</td></tr>
              ))}</tbody></table>
          )}
        </Panel>

        <Panel title="Pengguna & Hak Akses" subtitle="Hak akses diatur oleh tim Trace2Green (penyediaan terkontrol)">
          {users.length === 0 ? <EmptyNote>Memuat…</EmptyNote> : (
            <table className="w-full text-sm"><thead className="text-left text-xs text-navy-500"><tr className="border-b border-line"><th className="py-2 font-medium">Pengguna</th><th className="py-2 font-medium">Peran</th><th className="py-2 font-medium">Verifikasi</th></tr></thead>
              <tbody className="divide-y divide-line">{users.map((u) => (
                <tr key={u.email}><td className="py-2">{u.email}{u.email === user?.email && <span className="ml-1 text-xs text-navy-500">(Anda)</span>}</td><td className="py-2">Admin perusahaan</td><td className="py-2">{u.canVerify ? "Peninjau" : "Hanya melihat"}</td></tr>
              ))}</tbody></table>
          )}
          <p className="mt-2 text-[11px] text-navy-500">Hak akses Anda saat ini: {claims.canVerify ? "dapat memutuskan verifikasi" : "hanya melihat"}.</p>
        </Panel>
      </div>

      <Panel title="Google Sheets & Looker Studio" subtitle="Salinan analitik untuk Looker Studio. Dasbor ini tetap real-time; Looker Studio dapat tertunda." className="mt-5">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Sheet className="size-5 text-brand-600" />
          <span>Sinkronisasi terakhir: <b>{sync?.lastSyncAt ? formatDateTime(sync.lastSyncAt) : "belum pernah"}</b></span>
          {sync?.lastStatus === "error" && <span className="text-risk">Gagal: {sync.lastError}</span>}
          <Button variant="secondary" onClick={syncSheets} loading={busy === "sheets"} className="h-10">Sinkronkan sekarang</Button>
        </div>
        <p className="mt-2 text-[11px] text-navy-500">Spreadsheet khusus perusahaan Anda; hanya berisi data yang dibagikan pemasok kepada Anda. Sinkronisasi otomatis berjalan sekali sehari.</p>
      </Panel>

      <Panel title="Pemasok Terhubung & Izin Berbagi Data" subtitle="Pemasok mengatur izin sendiri; perusahaan hanya melihat statusnya" className="mt-5">
        <p className="mb-3 text-sm text-navy-700">{consent.yes.length} mengizinkan · {consent.no.length} belum mengizinkan · total {rows.length} pemasok terhubung</p>
        <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3" data-testid="consent-list">{[...consent.no, ...consent.yes].map((r) => (
          <li key={r.supplierId} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{r.name}<SimTag source={r.source} /> <span className="text-xs text-navy-500">{r.supplierId}</span></span>
            <span className={r.consent ? "shrink-0 text-xs text-brand-700" : "shrink-0 text-xs text-navy-500"}>{r.consent ? "mengizinkan" : "belum izin"}</span>
          </li>
        ))}</ul>
      </Panel>
    </>
  );
}
