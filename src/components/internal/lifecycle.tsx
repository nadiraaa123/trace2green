"use client";
// Shared lifecycle widgets for the Platform Admin and CS workspaces (actual records only).
import { clsx } from "clsx";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiPost } from "@/lib/api";
import { db } from "@/lib/firebase/client";
import { canTransition, LIFECYCLE_STAGES, NEEDS_CONFIRMATION, roleMayTransition, STAGE_LABEL, type LifecycleStage } from "@/lib/lifecycle";
import { formatDateTime } from "@/lib/supplier-data";

export interface LifecycleRow {
  id: string; companyId: string; companyName?: string; supplierId: string; supplierName?: string; csId: string | null;
  stage: LifecycleStage; trialYear: number | null; trialEnd: string | null; activationDate: string | null;
  contractStart: string | null; contractEnd: string | null; renewalDate: string | null;
  lastReportPeriod: string | null; needsAssistance?: boolean; nextFollowUpAt?: string | null;
  confirmation?: { reference: string } | null;
}

const STAGE_TONE: Record<LifecycleStage, string> = {
  onboarding: "bg-slate-100 text-navy-700",
  trial: "bg-blue-50 text-info",
  awaiting_activation: "bg-amber-50 text-amber-800",
  active_subscription: "bg-brand-50 text-brand-700",
  renewal_due: "bg-orange-50 text-orange-700",
  renewed: "bg-brand-50 text-brand-700",
  expired: "bg-red-50 text-risk",
};

export function StagePill({ stage }: { stage: LifecycleStage }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STAGE_TONE[stage])}>{STAGE_LABEL[stage]}</span>;
}

/** "Needs help": flagged by CS, or no report yet / last report older than the previous month. */
export function needsHelp(r: LifecycleRow, currentPeriod: string) {
  if (r.stage === "expired") return false;
  if (r.needsAssistance) return true;
  if (["trial", "active_subscription", "renewed"].includes(r.stage) && (!r.lastReportPeriod || r.lastReportPeriod < previousPeriod(currentPeriod))) return true;
  return false;
}
export function previousPeriod(p: string) {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";

/** Stage change + follow-up form + history for one record. Server re-checks every permission. */
export function LifecycleDetail({ row, role }: { row: LifecycleRow; role: "platform_admin" | "customer_success" }) {
  const [to, setTo] = useState<LifecycleStage | "">("");
  const [note, setNote] = useState("");
  const [trialYear, setTrialYear] = useState(String(row.trialYear ?? new Date().getFullYear()));
  const [ref, setRef] = useState("");
  const [cs, setCs] = useState("");
  const [ce, setCe] = useState("");
  const [fu, setFu] = useState("");
  const [due, setDue] = useState("");
  const [help, setHelp] = useState(!!row.needsAssistance);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; from: string; to: LifecycleStage; note: string | null; createdAt: unknown; confirmationReference: string | null }[]>([]);

  useEffect(() => onSnapshot(query(collection(db, `supplier_lifecycle/${row.id}/history`), orderBy("createdAt", "desc")),
    (s) => setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() }) as never)), () => setHistory([])), [row.id]);

  const options = LIFECYCLE_STAGES.filter((s) => canTransition(row.stage, s) && roleMayTransition(role, s));
  const needsConf = to !== "" && NEEDS_CONFIRMATION.includes(to);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  const changeStage = () => run(() => apiPost("/api/lifecycle/stage", {
    companyId: row.companyId, supplierId: row.supplierId, to, note: note || undefined,
    ...(to === "trial" ? { trialYear: Number(trialYear) } : {}),
    ...(needsConf ? { confirmation: { reference: ref, contractStart: cs, contractEnd: ce } } : {}),
  }).then(() => { setTo(""); setNote(""); }), "Status diperbarui.");
  const addFollowUp = () => run(() => apiPost("/api/lifecycle/followup", {
    companyId: row.companyId, supplierId: row.supplierId, note: fu, dueDate: due || null, needsAssistance: help,
  }).then(() => { setFu(""); setDue(""); }), "Tindak lanjut dicatat.");

  return (
    <div className="space-y-5" data-testid="lifecycle-detail">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-navy-500">Status</dt><dd><StagePill stage={row.stage} /></dd>
        <dt className="text-navy-500">Perusahaan</dt><dd>{row.companyName ?? row.companyId}</dd>
        <dt className="text-navy-500">CS utama</dt><dd>{row.csId ?? "Belum ditugaskan"}</dd>
        <dt className="text-navy-500">Trial</dt><dd>{row.trialYear ? `Jan–Mar ${row.trialYear}` : "—"}</dd>
        <dt className="text-navy-500">Aktivasi</dt><dd>{row.activationDate ?? "—"}</dd>
        <dt className="text-navy-500">Kontrak</dt><dd>{row.contractStart ? `${row.contractStart} s.d. ${row.contractEnd}` : "—"}</dd>
        <dt className="text-navy-500">Perpanjangan</dt><dd>{row.renewalDate ?? "—"}</dd>
        <dt className="text-navy-500">Laporan terakhir</dt><dd>{row.lastReportPeriod ?? "Belum ada"}</dd>
        {row.confirmation && <><dt className="text-navy-500">Konfirmasi</dt><dd className="truncate">{row.confirmation.reference}</dd></>}
      </dl>

      {options.length > 0 && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">Ubah status</p>
          <select aria-label="Status baru" value={to} onChange={(e) => setTo(e.target.value as LifecycleStage)} className={input}>
            <option value="">Pilih status…</option>
            {options.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          {to === "trial" && <input aria-label="Tahun trial" type="number" value={trialYear} onChange={(e) => setTrialYear(e.target.value)} className={input} />}
          {needsConf && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-2">
              <p className="text-xs text-amber-900">Status berbayar hanya boleh diset setelah ada konfirmasi (kontrak/pembayaran). Tidak pernah dari target keuangan.</p>
              <input aria-label="Nomor referensi konfirmasi" placeholder="No. kontrak / bukti pembayaran" value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Mulai kontrak" type="date" value={cs} onChange={(e) => setCs(e.target.value)} className={input} />
                <input aria-label="Akhir kontrak" type="date" value={ce} onChange={(e) => setCe(e.target.value)} className={input} />
              </div>
            </div>
          )}
          <input aria-label="Catatan perubahan" placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          <Button onClick={changeStage} loading={busy} disabled={!to} className="h-10">Simpan status</Button>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-line p-3">
        <p className="text-sm font-semibold">Catat tindak lanjut</p>
        <textarea aria-label="Catatan tindak lanjut" value={fu} onChange={(e) => setFu(e.target.value)} rows={2} className="w-full rounded-xl border border-line px-3 py-2 text-sm" placeholder="Contoh: telepon PIC, bantu isi laporan Maret" />
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Tenggat tindak lanjut" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-xl border border-line px-3 text-sm" />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> Butuh bantuan</label>
        </div>
        <Button variant="secondary" onClick={addFollowUp} loading={busy} disabled={fu.trim().length < 3} className="h-10">Simpan tindak lanjut</Button>
      </div>

      {msg && <p className={clsx("text-sm", msg.ok ? "text-brand-700" : "text-risk")} role="status">{msg.text}</p>}

      <div>
        <p className="mb-2 text-sm font-semibold">Riwayat status</p>
        {history.length === 0 ? <p className="text-xs text-navy-500">Belum ada perubahan status.</p> : (
          <ul className="space-y-1.5 text-xs" data-testid="lifecycle-history">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg bg-surface px-2.5 py-1.5">
                <b>{STAGE_LABEL[h.from as LifecycleStage] ?? h.from} → {STAGE_LABEL[h.to]}</b> · {formatDateTime(h.createdAt)}
                {h.note && <span className="block text-navy-500">{h.note}</span>}
                {h.confirmationReference && <span className="block text-navy-500">Konfirmasi: {h.confirmationReference}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
