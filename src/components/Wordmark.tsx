import { Link } from "wouter";

/**
 * Typographic wordmark. Replaces the missing logo PNG with a real,
 * distinctive mark: a soft arctic-gradient monogram tile + light-weight
 * Satoshi wordmark. Scales cleanly and never 404s.
 */
export default function Wordmark({
  className = "",
  size = "md",
  href = "/",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string | null;
}) {
  const dims = size === "sm" ? "h-7" : size === "lg" ? "h-10" : "h-8";
  const tile = size === "sm" ? "w-7 h-7 text-[15px]" : size === "lg" ? "w-10 h-10 text-xl" : "w-8 h-8 text-[17px]";
  const word = size === "sm" ? "text-lg" : size === "lg" ? "text-[1.6rem]" : "text-xl";

  const mark = (
    <span className={`inline-flex items-center gap-2.5 ${dims} ${className}`}>
      <span
        className={`${tile} inline-flex items-center justify-center rounded-[10px] font-heading font-bold`}
        style={{
          background: "var(--grad-arctic)",
          color: "oklch(0.14 0.02 255)",
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.4), 0 2px 12px oklch(0.72 0.20 195 / 0.25)",
        }}
      >
        @
      </span>
      <span
        className={`${word} font-heading font-medium tracking-[-0.02em]`}
        style={{ color: "oklch(0.98 0.004 220)" }}
      >
        navi
      </span>
    </span>
  );

  if (href === null) return mark;
  return (
    <Link href={href} className="inline-flex items-center group">
      <span className="transition-opacity duration-200 group-hover:opacity-80">{mark}</span>
    </Link>
  );
}
