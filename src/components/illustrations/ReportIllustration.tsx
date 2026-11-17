/** Original illustration: a monthly report sheet with a growing leaf and bar chart. */
export function ReportIllustration({ className = "w-56" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden="true">
      <ellipse cx="120" cy="164" rx="92" ry="10" fill="#E8F5EF" />
      <rect x="66" y="22" width="112" height="136" rx="12" fill="#fff" stroke="#D1EBE0" strokeWidth="2" />
      <rect x="82" y="40" width="58" height="8" rx="4" fill="#114B55" opacity=".85" />
      <rect x="82" y="56" width="80" height="6" rx="3" fill="#E3E9EF" />
      <rect x="82" y="68" width="70" height="6" rx="3" fill="#E3E9EF" />
      <rect x="82" y="80" width="76" height="6" rx="3" fill="#E3E9EF" />
      <rect x="128" y="122" width="10" height="22" rx="2" fill="#A6D8C4" />
      <rect x="142" y="112" width="10" height="32" rx="2" fill="#168B73" opacity=".75" />
      <rect x="156" y="100" width="10" height="44" rx="2" fill="#168B73" />
      <path d="M58 150c-2-26 6-46 22-58" stroke="#114B55" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M80 92c-18-2-30 8-32 24 16 2 28-6 32-24Z" fill="#168B73" />
      <path d="M66 120c-14-6-28-2-36 10 12 6 26 4 36-10Z" fill="#A6D8C4" />
      <circle cx="186" cy="40" r="14" fill="#168B73" />
      <path d="m180 40 4.5 4.5L193 36" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
