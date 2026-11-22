import Image from "next/image";
import mark from "../../../public/brand/trace2green-mark-512.png";

/** Trace2Green brand mark: the supplied logo image, unaltered (cropped to the symbol, square, not redrawn). */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden="true" priority sizes="64px" className={`${className} shrink-0 object-contain`} />;
}

export function Logo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const text = { sm: "text-base", md: "text-lg", lg: "text-3xl" }[size];
  const mark = { sm: "size-7", md: "size-9", lg: "size-16" }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={mark} />
      <span className={`${text} font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-navy-900"}`}>
        trace<span className="text-brand-500">2</span>green
      </span>
    </span>
  );
}
