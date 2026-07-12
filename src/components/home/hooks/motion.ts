import type { Variants } from "framer-motion";

/**
 * Shared motion tokens for the homepage.
 * One house easing curve, one reveal, one stagger — so every section
 * moves with the same calm, purposeful rhythm.
 */

// The house easing curve — used across hero, navbar, and every section.
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Standard scroll-reveal: fade + gentle rise.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

// Smaller rise for dense/secondary content.
export const fadeUpSm: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// Parent that staggers its children on reveal.
export const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.12 } },
};

// Tighter stagger for longer lists so they don't feel slow.
export const staggerTight: Variants = {
  visible: { transition: { staggerChildren: 0.06 } },
};

// Cap per-item delay so long grids stay snappy.
export function cappedDelay(index: number, step = 0.06, max = 0.4): number {
  return Math.min(index * step, max);
}
