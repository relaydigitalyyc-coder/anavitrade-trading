/**
 * Fibonacci extension projection for recalculated take-profit targets.
 *
 * FORWARD-ONLY GUARANTEE: levels are projected purely from an already-realized
 * impulse leg (swingLow -> swingHigh). Selecting the next target compares
 * against the current price only; no future price is consulted.
 */

export interface FibLevels {
  entry: number;
  levels: { ratio: number; price: number }[]; // 1.272, 1.414, 1.618, 2.0, 2.618
}

const EXTENSION_RATIOS = [1.272, 1.414, 1.618, 2.0, 2.618];

/**
 * Project Fibonacci extension levels from an impulse leg.
 *
 * Standard fib extension price = swingLow + (swingHigh - swingLow) * ratio.
 * For a long the swingLow -> swingHigh leg projects extensions ABOVE swingHigh.
 * For a short we mirror: price = swingHigh - (swingHigh - swingLow) * ratio,
 * projecting extensions BELOW swingLow.
 *
 * `entry` is set to the impulse extreme in the trade direction (swingHigh for
 * a long, swingLow for a short) — the reference from which extensions extend.
 */
export function fibExtensions(
  swingLow: number,
  swingHigh: number,
  direction: "long" | "short",
): FibLevels {
  const range = swingHigh - swingLow;

  const levels = EXTENSION_RATIOS.map((ratio) => ({
    ratio,
    price:
      direction === "long"
        ? swingLow + range * ratio
        : swingHigh - range * ratio,
  }));

  const entry = direction === "long" ? swingHigh : swingLow;
  return { entry, levels };
}

/**
 * Given the current price and fib levels, return the next unhit extension
 * target in the trade direction — the "recalculated TP".
 *
 * For a long: the lowest-priced level still above `currentPrice`.
 * For a short: the highest-priced level still below `currentPrice`.
 * Returns null when every level has already been passed.
 *
 * FORWARD-ONLY: depends only on `currentPrice`.
 */
export function nextFibTarget(
  fib: FibLevels,
  currentPrice: number,
  direction: "long" | "short",
): { ratio: number; price: number } | null {
  let best: { ratio: number; price: number } | null = null;

  for (const level of fib.levels) {
    if (direction === "long") {
      if (level.price > currentPrice && (!best || level.price < best.price)) {
        best = level;
      }
    } else {
      if (level.price < currentPrice && (!best || level.price > best.price)) {
        best = level;
      }
    }
  }

  return best;
}
