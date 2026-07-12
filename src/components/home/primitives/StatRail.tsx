import type { ReactNode } from "react";
import Reveal from "./Reveal";
import AnimatedNumber from "./AnimatedNumber";
import Explainer from "./Explainer";

export type StatItem = {
  /** Numeric value to count up to. If omitted, `display` is shown as-is. */
  value?: number;
  /** Static display string (used when there's no numeric count-up). */
  display?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  separator?: boolean;
  label: string;
  /** Optional plain-language explanation of the stat. */
  hint?: string;
  icon?: ReactNode;
  /** Tone for the value. */
  tone?: "default" | "gold" | "green";
};

const toneColor: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "oklch(0.98 0.004 220)",
  gold: "oklch(0.82 0.16 85)",
  green: "oklch(0.74 0.18 145)",
};

/**
 * A friendly, readable stat strip — not a dense terminal rail. Numbers count up
 * on view, labels are plain language, and any jargon can carry an Explainer.
 * Solid surface (no glass) so the numbers stay legible.
 */
export default function StatRail({ items }: { items: StatItem[] }) {
  return (
    <Reveal>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 data-surface"
        style={{ overflow: "hidden" }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="flex flex-col items-center text-center gap-1.5 px-4 py-6 stat-rail-cell"
          >
            {item.icon && (
              <div
                className="p-2 rounded-lg mb-1"
                style={{ background: "oklch(0.60 0.22 220 / 0.10)", color: "oklch(0.68 0.20 220)" }}
              >
                {item.icon}
              </div>
            )}
            <p
              className="text-xl font-heading font-bold tabular"
              style={{ color: toneColor[item.tone ?? "default"] }}
            >
              {item.value != null ? (
                <AnimatedNumber
                  value={item.value}
                  prefix={item.prefix}
                  suffix={item.suffix}
                  decimals={item.decimals ?? 0}
                  separator={item.separator}
                  delay={i * 80}
                />
              ) : (
                <>
                  {item.prefix}
                  {item.display}
                  {item.suffix}
                </>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground/70 leading-tight flex items-center gap-1 justify-center">
              {item.label}
              {item.hint && <Explainer text={item.hint} label={item.label} />}
            </p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}
