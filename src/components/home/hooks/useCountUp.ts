import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

type UseCountUpOptions = {
  /** Final value to count to. */
  to: number;
  /** Starting value (defaults to 0). */
  from?: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Decimal places to render. */
  decimals?: number;
  /** Delay before starting, in ms. */
  delay?: number;
};

/**
 * Counts a number up when it scrolls into view — the highest-ROI "premium and
 * alive" micro-interaction. Respects prefers-reduced-motion: reduced users see
 * the final value immediately with no animation.
 *
 * Returns a ref to attach to the element and the current display value.
 */
export function useCountUp({
  to,
  from = 0,
  duration = 1400,
  decimals = 0,
  delay = 0,
}: UseCountUpOptions) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const prefersReduced = useReducedMotion();
  const [value, setValue] = useState(from);
  const started = useRef(false);

  useEffect(() => {
    if (!isInView || started.current) return;
    started.current = true;

    if (prefersReduced) {
      setValue(to);
      return;
    }

    let raf = 0;
    let startTime: number | null = null;
    const startTimer = setTimeout(() => {
      const tick = (now: number) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // easeOutCubic — decelerates into the final value.
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (to - from) * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setValue(to);
      };
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(raf);
    };
  }, [isInView, prefersReduced, to, from, duration, delay]);

  const display = value.toFixed(decimals);
  return { ref, value, display };
}
