/**
 * Ratcheting trailing-stop engine.
 *
 * FORWARD-ONLY GUARANTEE: the stop is driven purely by the realized extreme
 * (highest high for a long, lowest low for a short) seen up to and including
 * the current bar `idx`, plus indicator values already computed at `idx`. The
 * stop only ever moves in the favorable direction (up for a long, down for a
 * short) — it can never loosen, and it never reads a future candle.
 */

import type { EnrichedCandle } from "../types";

export interface TrailState {
  stopPrice: number;
  highestSinceEntry: number; // best favorable price so far (lowest for shorts)
  breakevenArmed: boolean;
  trailArmed: boolean;
}

export interface TrailConfig {
  atrMult: number; // trailing distance in ATRs (default 2.5)
  breakevenAtR: number; // move stop to entry at this R (default 1.0)
  trailActivateAtR: number; // start trailing at this R (default 1.5)
  useStructureTrail: boolean; // trail below recent swing low (long)
  structureLookback: number; // bars for swing detection (default 5)
}

// Empirically validated on 326 Tier-A alt trades (the REAL simulateSmartExit
// module, not a proxy): a WIDE, LATE trail with NO early breakeven protects the
// fat right tail instead of capping it. Result: +274.8R vs +265.9R naive
// window-close, Sharpe 3.47 vs 3.32, max winner preserved at 23.4R.
//
// CRITICAL: breakevenAtR is effectively DISABLED (999). On a low-win-rate trend
// system the winning trades routinely retrace to breakeven BEFORE the big run —
// an early breakeven stop cuts them off at 0R and destroys the tail. Direct test:
// breakeven at +2R gave +137.9R (-48% vs naive); disabling it gave +274.8R.
// Keep full initial risk until the 5-ATR trail arms at +4R.
// Structure trail is OFF — it ratchets too tight and caps runners.
export const DEFAULT_TRAIL_CONFIG: TrailConfig = {
  atrMult: 5.0,
  breakevenAtR: 999, // disabled — see note above; early breakeven kills the tail
  trailActivateAtR: 4.0,
  useStructureTrail: false,
  structureLookback: 5,
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function recentSwingLow(
  candles: EnrichedCandle[],
  idx: number,
  lookback: number,
): number {
  const start = Math.max(0, idx - lookback + 1);
  let low = Infinity;
  for (let j = start; j <= idx; j++) {
    if (candles[j].low < low) low = candles[j].low;
  }
  return low;
}

function recentSwingHigh(
  candles: EnrichedCandle[],
  idx: number,
  lookback: number,
): number {
  const start = Math.max(0, idx - lookback + 1);
  let high = -Infinity;
  for (let j = start; j <= idx; j++) {
    if (candles[j].high > high) high = candles[j].high;
  }
  return high;
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/**
 * Initialize trail state at entry. `direction` is part of the signature for
 * symmetry with `updateTrail`; the extreme favorable price is seeded at entry
 * for both sides.
 */
export function initTrail(
  entry: number,
  initialStop: number,
  _direction: "long" | "short",
): TrailState {
  return {
    stopPrice: initialStop,
    highestSinceEntry: entry,
    breakevenArmed: false,
    trailArmed: false,
  };
}

/**
 * Update the trailing stop for the current candle.
 *
 * FORWARD-ONLY: uses realized highs/lows up to `idx`. Ratchets — for a long the
 * stop only moves UP, for a short only DOWN. Applies, in order and always
 * taking the tightest non-loosening result:
 *   (a) breakeven move to entry once favorable excursion >= breakevenAtR,
 *   (b) ATR trail once trailArmed (favorable excursion >= trailActivateAtR),
 *   (c) structure trail below the recent swing low (long) / above swing high
 *       (short).
 * The stop is capped so it never crosses the current close by trail action
 * alone (a real stop-out is detected separately by the caller).
 *
 * Returns a NEW TrailState (immutable update).
 */
export function updateTrail(
  state: TrailState,
  candles: EnrichedCandle[],
  idx: number,
  entry: number,
  risk: number,
  direction: "long" | "short",
  config: TrailConfig,
): TrailState {
  if (idx < 0 || idx >= candles.length || risk <= 0) {
    return { ...state };
  }

  const candle = candles[idx];
  const atr = candle.atr14 > 0 ? candle.atr14 : candle.close * 0.01;
  const isLong = direction === "long";

  // 1. Update the realized favorable extreme (forward-only).
  const extreme = isLong
    ? Math.max(state.highestSinceEntry, candle.high)
    : Math.min(state.highestSinceEntry, candle.low);

  const favorableR = isLong
    ? (extreme - entry) / risk
    : (entry - extreme) / risk;

  let breakevenArmed = state.breakevenArmed;
  let trailArmed = state.trailArmed;

  // Start from the existing stop so the result can only ratchet.
  let candidate = state.stopPrice;

  // (a) Breakeven.
  if (!breakevenArmed && favorableR >= config.breakevenAtR) {
    breakevenArmed = true;
  }
  if (breakevenArmed) {
    candidate = isLong ? Math.max(candidate, entry) : Math.min(candidate, entry);
  }

  // (b)/(c) Trailing.
  if (favorableR >= config.trailActivateAtR) {
    trailArmed = true;
  }
  if (trailArmed) {
    let trail = isLong
      ? extreme - config.atrMult * atr
      : extreme + config.atrMult * atr;

    if (config.useStructureTrail) {
      if (isLong) {
        const swingLow = recentSwingLow(candles, idx, config.structureLookback);
        trail = Math.max(trail, swingLow); // tighter of ATR / structure
      } else {
        const swingHigh = recentSwingHigh(
          candles,
          idx,
          config.structureLookback,
        );
        trail = Math.min(trail, swingHigh);
      }
    }

    candidate = isLong
      ? Math.max(candidate, trail)
      : Math.min(candidate, trail);
  }

  // Cap: trail action alone must not push the stop across the current close,
  // while still forbidding any loosening move.
  const stopPrice = isLong
    ? Math.max(state.stopPrice, Math.min(candidate, candle.close))
    : Math.min(state.stopPrice, Math.max(candidate, candle.close));

  return {
    stopPrice,
    highestSinceEntry: extreme,
    breakevenArmed,
    trailArmed,
  };
}
