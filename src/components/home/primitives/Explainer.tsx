import { useState, useId } from "react";
import { HelpCircle } from "lucide-react";

type ExplainerProps = {
  /** The plain-language explanation shown on hover/focus/tap. */
  text: string;
  /** Optional label the "?" sits next to (for aria context). */
  label?: string;
  className?: string;
};

/**
 * A tiny "?" affordance that reveals a plain-language explanation of a brand
 * or finance term — so a complete beginner is never left guessing what
 * "Tier A" or "non-custodial" means. Keyboard + touch accessible (not
 * hover-only), and announced to screen readers.
 */
export default function Explainer({ text, label, className = "" }: ExplainerProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label={label ? `What does "${label}" mean?` : "More info"}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className="inline-flex items-center justify-center rounded-full transition-colors duration-200 -m-3 p-3"
        style={{ color: "oklch(0.62 0.020 240)" }}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-xl text-xs leading-relaxed z-50 pointer-events-none"
          style={{
            background: "linear-gradient(145deg, oklch(0.14 0.022 250 / 0.98), oklch(0.10 0.018 255 / 0.99))",
            border: "1px solid oklch(0.60 0.22 220 / 0.22)",
            color: "oklch(0.90 0.01 220)",
            boxShadow: "0 12px 32px oklch(0.07 0.015 255 / 0.6)",
            backdropFilter: "blur(12px)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
