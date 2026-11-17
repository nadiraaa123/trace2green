import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { useId } from "react";

export function Field({
  label,
  icon: Icon,
  error,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-700">
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-navy-300" />}
        <input
          id={id}
          {...props}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={clsx(
            "h-12 w-full rounded-xl border bg-white text-sm text-navy-900 placeholder:text-navy-300 outline-none transition",
            "focus:border-brand-500 focus:ring-4 focus:ring-brand-50",
            Icon ? "pl-10 pr-3.5" : "px-3.5",
            error ? "border-risk" : "border-line",
          )}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-risk">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-navy-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: React.ReactNode }) {
  const t = {
    error: "bg-red-50 text-risk border-red-100",
    info: "bg-blue-50 text-info border-blue-100",
    success: "bg-brand-50 text-brand-700 border-brand-100",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${t}`}>{children}</div>;
}
