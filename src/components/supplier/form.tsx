"use client";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { useId } from "react";
import { formatId } from "@/lib/numbers";

export function Stepper({ step, labels, onJump }: { step: number; labels: string[]; onJump?: (s: number) => void }) {
  return (
    <ol className="flex items-start" aria-label="Langkah pengisian">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center">
            {i > 0 && <span className={clsx("absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2", n <= step ? "bg-brand-500" : "bg-line")} />}
            <button type="button" onClick={() => onJump?.(n)} aria-current={active ? "step" : undefined}
              className={clsx("relative z-10 inline-flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition",
                done ? "border-brand-500 bg-brand-500 text-white" : active ? "border-brand-500 bg-white text-brand-600 ring-4 ring-brand-50" : "border-line bg-white text-navy-300")}>
              {done ? <Check className="size-4" /> : n}
            </button>
            <span className={clsx("mt-1.5 text-center text-[11px] leading-tight", active ? "font-semibold text-navy-900" : "text-navy-500")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function NumberField({ label, unit, value, error, hint, parsed, onChange, disabled }: {
  label: string; unit?: string; value: string; error?: string; hint?: string; parsed: number | null;
  onChange: (raw: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const showInterp = !error && parsed != null && value.trim() !== formatId(parsed);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-700">{label}</label>
      <div className={clsx("flex h-12 items-center rounded-xl border bg-white transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-50",
        error ? "border-risk" : "border-line", disabled && "opacity-50")}>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} placeholder="Kosongkan bila belum tahu" aria-invalid={!!error}
          className="h-full min-w-0 flex-1 rounded-xl bg-transparent px-3.5 text-sm outline-none placeholder:text-navy-300" />
        {unit && <span className="pr-3.5 text-sm text-navy-500">{unit}</span>}
      </div>
      {error ? <p className="mt-1 text-xs text-risk">{error}</p>
        : showInterp ? <p className="mt-1 text-xs text-navy-500">Terbaca: {formatId(parsed)} {unit}</p>
          : hint ? <p className="mt-1 text-xs text-navy-500">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-700">{label}</label>
      <input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none placeholder:text-navy-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-50 disabled:opacity-50" />
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, placeholder = "Pilih", disabled }: {
  label: string; value: T | null; options: readonly T[]; onChange: (v: T | null) => void; placeholder?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-700">{label}</label>
      <select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange((e.target.value || null) as T | null)}
        className="h-12 w-full appearance-none rounded-xl border border-line bg-white bg-[length:16px] bg-[right_14px_center] bg-no-repeat px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50 disabled:opacity-50"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6b82' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T | null; options: readonly T[]; onChange: (v: T | null) => void; disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className={disabled ? "opacity-50" : ""}>
      <legend className="mb-1.5 text-sm font-medium text-navy-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)}
            className={clsx("h-10 rounded-xl border px-4 text-sm font-medium transition",
              value === o ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-navy-700 hover:border-brand-200")}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A category block with an explicit "not used" switch (answered ≠ missing ≠ zero). */
export function CategoryBlock({ title, notUsedLabel, notUsed, onNotUsed, children }: {
  title: string; notUsedLabel: string; notUsed: boolean; onNotUsed: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <label className="mt-2 flex items-center gap-2 text-sm text-navy-700">
        <input type="checkbox" checked={notUsed} onChange={(e) => onNotUsed(e.target.checked)} className="size-4 accent-brand-500" />
        {notUsedLabel}
      </label>
      {!notUsed && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}
