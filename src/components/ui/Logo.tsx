/** Trace2Green mark: a trace loop that ends in a leaf. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M8 26a7 7 0 1 1 7-7c0 4 3 7 7 7a7 7 0 1 0-7-7"
        fill="none"
        stroke="#114B55"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M24 13c1-6 7-9 13-8-1 6-5 11-13 8Z" fill="#168B73" />
      <path d="M24 13c3-2 6-4 9-6" stroke="#E8F5EF" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const text = { sm: "text-base", md: "text-lg", lg: "text-3xl" }[size];
  const mark = { sm: "size-6", md: "size-8", lg: "size-14" }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={mark} />
      <span className={`${text} font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-navy-900"}`}>
        trace<span className="text-brand-500">2</span>green
      </span>
    </span>
  );
}
