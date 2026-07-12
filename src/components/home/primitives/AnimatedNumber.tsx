import { useCountUp } from "../hooks/useCountUp";

type AnimatedNumberProps = {
  /** The value to count up to. */
  value: number;
  /** Text before the number, e.g. "$" or "+". */
  prefix?: string;
  /** Text after the number, e.g. "%" or "+". */
  suffix?: string;
  /** Decimal places. */
  decimals?: number;
  /** Insert thousands separators (locale-aware). */
  separator?: boolean;
  /** Animation duration in ms. */
  duration?: number;
  /** Delay before starting, in ms. */
  delay?: number;
  className?: string;
};

/**
 * A number that counts up when it scrolls into view. Uses tabular figures so
 * the width doesn't jitter while animating. Reduced-motion aware via useCountUp.
 */
export default function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  separator = false,
  duration = 1400,
  delay = 0,
  className,
}: AnimatedNumberProps) {
  const { ref, value: current } = useCountUp({ to: value, decimals, duration, delay });

  const formatted = separator
    ? current.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : current.toFixed(decimals);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
