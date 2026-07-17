/**
 * Swing-pivot initial-stop placement (R1.2 / PRD §3.3.4).
 *
 * The empirically proven entry stop for the ICR runner is anchored to the
 * nearest CONFIRMED swing pivot, offset by a fraction of ATR:
 *   - long  → nearest confirmed swing LOW  − offset·ATR
 *   - short → nearest confirmed swing HIGH + offset·ATR
 *
 * ── NO-LOOKAHEAD GUARANTEE ──────────────────────────────────────────────
 * A swing pivot is a fractal: a bar whose extreme is more extreme than the
 * `confirmationBars` bars on EACH side. The right-hand side is what makes it a
 * *confirmed* pivot, and it only exists `confirmationBars` bars AFTER the pivot.
 * Therefore a pivot at index `k` is not "confirmed" until bar `k + confirmationBars`.
 *
 * When placing the stop at entry bar `e`, we only ever consider pivots with
 *   k + confirmationBars <= e   (i.e. k <= e − confirmationBars)
 * and the fractal test for such a pivot reads candles no further than
 * `k + confirmationBars <= e`. No candle at an index > e is ever inspected, so
 * the stop is exactly what a live system would have known at bar `e`. This is
 * the "no retroactive swing-confirmation" gate from the PRD verification list.
 */

import type { EnrichedCandle } from "../types";

/** Named parameters — no magic numbers at call sites (coding-style rule). */
export interface SwingStopConfig {
  /** Bars required on each side of a pivot to confirm it. Right side = the lag. */
  confirmationBars: number;
  /** Stop offset beyond the pivot, expressed in ATRs (e.g. 0.2). */
  atrOffset: number;
  /** How far back from entry to search for a usable confirmed pivot. */
  lookback: number;
}

export const DEFAULT_SWING_STOP_CONFIG: SwingStopConfig = {
  confirmationBars: 3,
  atrOffset: 0.2,
  lookback: 50,
};

export type StopMethod = "swing_pivot" | "atr_fallback";

export interface InitialStopResult {
  /** The stop price to arm the position with. Always beyond entry (risk > 0). */
  stopPrice: number;
  /** How the stop was derived. */
  method: StopMethod;
  /** Index of the confirmed pivot used, or null on fallback. */
  pivotIdx: number | null;
  /** The raw pivot price (pre-offset), or null on fallback. */
  pivotPrice: number | null;
}

/**
 * Is `k` a confirmed swing LOW given `bars` bars on each side?
 * Strict fractal: candles[k].low is strictly below every neighbour within `bars`.
 * Reads candles[k − bars .. k + bars] only.
 */
function isConfirmedSwingLow(
  candles: EnrichedCandle[],
  k: number,
  bars: number,
): boolean {
  if (k - bars < 0 || k + bars >= candles.length) return false;
  const pivotLow = candles[k].low;
  for (let i = 1; i <= bars; i++) {
    if (!(pivotLow < candles[k - i].low)) return false;
    if (!(pivotLow < candles[k + i].low)) return false;
  }
  return true;
}

/**
 * Is `k` a confirmed swing HIGH given `bars` bars on each side?
 * Reads candles[k − bars .. k + bars] only.
 */
function isConfirmedSwingHigh(
  candles: EnrichedCandle[],
  k: number,
  bars: number,
): boolean {
  if (k - bars < 0 || k + bars >= candles.length) return false;
  const pivotHigh = candles[k].high;
  for (let i = 1; i <= bars; i++) {
    if (!(pivotHigh > candles[k - i].high)) return false;
    if (!(pivotHigh > candles[k + i].high)) return false;
  }
  return true;
}

function atrAt(candles: EnrichedCandle[], idx: number): number {
  const atr = candles[idx].atr14;
  // Explicit fallback so a missing/zero ATR never yields a zero-width stop.
  return atr > 0 ? atr : candles[idx].close * 0.01;
}

/**
 * Compute the swing-pivot initial stop for a position opened at `entryIdx`.
 *
 * Searches backwards from the last index that could POSSIBLY be confirmed at
 * `entryIdx` (`entryIdx − confirmationBars`) toward `entryIdx − lookback`, and
 * takes the NEAREST (most recent) confirmed pivot that lies beyond `entryPrice`
 * in the protective direction (below for longs, above for shorts), guaranteeing
 * a positive-risk stop.
 *
 * Falls back to a pure ATR stop (`entryPrice ∓ atrOffset·k·ATR`) only when no
 * usable confirmed pivot exists in the window — reported via `method`.
 *
 * Returns a NEW object (immutable).
 */
export function computeSwingInitialStop(
  candles: EnrichedCandle[],
  entryIdx: number,
  entryPrice: number,
  direction: "long" | "short",
  config: SwingStopConfig = DEFAULT_SWING_STOP_CONFIG,
): InitialStopResult {
  if (
    entryIdx < 0 ||
    entryIdx >= candles.length ||
    !Number.isFinite(entryPrice)
  ) {
    throw new Error(
      `computeSwingInitialStop: invalid entryIdx=${entryIdx} (n=${candles.length}) or entryPrice=${entryPrice}`,
    );
  }

  const atr = atrAt(candles, entryIdx);
  const offset = config.atrOffset * atr;

  // Newest index that can already be confirmed at the entry bar. Anything more
  // recent would require reading candles AFTER `entryIdx` → lookahead.
  const newestConfirmable = entryIdx - config.confirmationBars;
  const oldest = Math.max(0, entryIdx - config.lookback);

  const isLong = direction === "long";

  for (let k = newestConfirmable; k >= oldest; k--) {
    const confirmed = isLong
      ? isConfirmedSwingLow(candles, k, config.confirmationBars)
      : isConfirmedSwingHigh(candles, k, config.confirmationBars);
    if (!confirmed) continue;

    const pivotPrice = isLong ? candles[k].low : candles[k].high;
    // The pivot must sit on the protective side of entry to give positive risk.
    const protective = isLong ? pivotPrice < entryPrice : pivotPrice > entryPrice;
    if (!protective) continue;

    const stopPrice = isLong ? pivotPrice - offset : pivotPrice + offset;
    return {
      stopPrice,
      method: "swing_pivot",
      pivotIdx: k,
      pivotPrice,
    };
  }

  // Fallback: no confirmed pivot in range. Use a conservative ATR stop so the
  // caller always gets a positive-risk stop rather than throwing.
  const fallbackStop = isLong
    ? entryPrice - config.confirmationBars * offset
    : entryPrice + config.confirmationBars * offset;
  return {
    stopPrice: fallbackStop,
    method: "atr_fallback",
    pivotIdx: null,
    pivotPrice: null,
  };
}
