import type { ReactNode } from "react";
import Reveal from "./Reveal";

type SectionHeaderProps = {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Left-aligned reads editorial; centered is reserved for pricing/CTA. */
  align?: "left" | "center";
  /** Tone of the eyebrow accent. */
  accent?: "azure" | "electric" | "gold";
  className?: string;
  /** Max width for the subtitle, for comfortable line length. */
  subtitleClassName?: string;
};

const accentColor: Record<NonNullable<SectionHeaderProps["accent"]>, string> = {
  azure: "oklch(0.68 0.20 220)",
  electric: "",
  gold: "oklch(0.82 0.16 85)",
};

/**
 * One header for every section — kills the copy-pasted eyebrow/h2/subhead trio.
 * Defaults to left-aligned (editorial). Pass align="center" for pricing/CTA.
 */
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  accent = "azure",
  className = "",
  subtitleClassName = "",
}: SectionHeaderProps) {
  const isCenter = align === "center";

  return (
    <div
      className={`${isCenter ? "text-center mx-auto" : ""} ${className}`}
    >
      {eyebrow && (
        <Reveal y={16} duration={0.5}>
          <span
            className={`text-[0.7rem] font-medium tracking-[0.18em] uppercase mb-4 block ${
              accent === "electric" ? "text-electric" : ""
            }`}
            style={accent === "electric" ? undefined : { color: accentColor[accent] }}
          >
            {eyebrow}
          </span>
        </Reveal>
      )}
      <Reveal y={24} duration={0.6} delay={0.05}>
        <h2
          className={`font-heading font-medium tracking-[-0.035em] text-foreground ${
            isCenter ? "text-4xl sm:text-5xl" : "text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.05]"
          }`}
        >
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal y={20} duration={0.6} delay={0.1}>
          <p
            className={`text-muted-foreground mt-4 ${
              isCenter ? "max-w-xl mx-auto" : "max-w-xl"
            } ${subtitleClassName}`}
          >
            {subtitle}
          </p>
        </Reveal>
      )}
    </div>
  );
}
