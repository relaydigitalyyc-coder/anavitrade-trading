/**
 * Heikin Ashi computation and HA-based exit signals.
 *
 * FORWARD-ONLY GUARANTEE: every HA candle at index `i` is derived only from
 * the raw candle at `i` and the previously-computed HA candle at `i-1`. No
 * function in this module ever reads a candle at an index greater than the one
 * being asked about.
 */

import type { Kline } from "../types";

export interface HeikinAshiCandle {
  timestamp: number;
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
  color: "green" | "red";
  upperWick: number; // haHigh - max(haOpen, haClose)
  lowerWick: number; // min(haOpen, haClose) - haLow
  bodySize: number; // abs(haClose - haOpen)
}

/* ─── Internal helper ──────────────────────────────────────────────────── */

function makeHa(
  timestamp: number,
  haOpen: number,
  haHigh: number,
  haLow: number,
  haClose: number,
): HeikinAshiCandle {
  return {
    timestamp,
    haOpen,
    haHigh,
    haLow,
    haClose,
    color: haClose >= haOpen ? "green" : "red",
    upperWick: haHigh - Math.max(haOpen, haClose),
    lowerWick: Math.min(haOpen, haClose) - haLow,
    bodySize: Math.abs(haClose - haOpen),
  };
}

/* ─── Base Heikin Ashi ─────────────────────────────────────────────────── */

/**
 * Compute Heikin Ashi candles from raw klines.
 *
 * HA_close = (open+high+low+close)/4
 * HA_open  = (prevHaOpen + prevHaClose)/2  (first bar: (open+close)/2)
 * HA_high  = max(high, haOpen, haClose)
 * HA_low   = min(low, haOpen, haClose)
 *
 * FORWARD-ONLY: bar `i` uses raw candle `i` and HA bar `i-1` only.
 */
export function computeHeikinAshi(candles: Kline[]): HeikinAshiCandle[] {
  const result: HeikinAshiCandle[] = [];
  let prevHaOpen: number | null = null;
  let prevHaClose: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      prevHaOpen === null || prevHaClose === null
        ? (c.open + c.close) / 2
        : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result.push(makeHa(c.timestamp, haOpen, haHigh, haLow, haClose));
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return result;
}

/* ─── Higher-timeframe Heikin Ashi ─────────────────────────────────────── */

/**
 * Aggregate raw klines into a higher timeframe, then compute HA on that
 * series, aligned back to the source timeframe.
 *
 * For each source candle we return the HA candle of the HTF bar it is
 * currently inside. That forming HTF bar is aggregated only from source
 * candles up to and including the current one (a partial bar), and its HA
 * seed (prevHaOpen/prevHaClose) comes exclusively from COMPLETED HTF bars.
 *
 * FORWARD-ONLY: for source index `i` the returned candle never incorporates
 * any source candle beyond `i`. The HA seed is locked in only when an HTF bar
 * has fully closed at or before `i`.
 */
export function computeHtfHeikinAshi(
  candles: Kline[],
  aggregationFactor: number,
): (HeikinAshiCandle | null)[] {
  const n = candles.length;
  const result: (HeikinAshiCandle | null)[] = new Array(n).fill(null);
  if (n === 0 || aggregationFactor <= 0) return result;

  // Seed from the last COMPLETED higher-timeframe HA bar.
  let prevHaOpen: number | null = null;
  let prevHaClose: number | null = null;

  for (let i = 0; i < n; i++) {
    const barIndex = Math.floor(i / aggregationFactor);
    const barStart = barIndex * aggregationFactor;

    // Partial aggregate of the forming HTF bar: barStart..i (inclusive).
    let high = -Infinity;
    let low = Infinity;
    const open = candles[barStart].open;
    for (let j = barStart; j <= i; j++) {
      if (candles[j].high > high) high = candles[j].high;
      if (candles[j].low < low) low = candles[j].low;
    }
    const close = candles[i].close;

    const haClose = (open + high + low + close) / 4;
    const haOpen =
      prevHaOpen === null || prevHaClose === null
        ? (open + close) / 2
        : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(high, haOpen, haClose);
    const haLow = Math.min(low, haOpen, haClose);

    result[i] = makeHa(candles[i].timestamp, haOpen, haHigh, haLow, haClose);

    // Lock the seed only when this HTF bar has fully closed.
    if (i === barStart + aggregationFactor - 1) {
      prevHaOpen = haOpen;
      prevHaClose = haClose;
    }
  }

  return result;
}

/* ─── HA exit signals ──────────────────────────────────────────────────── */

/**
 * Exit signal: HA color flip against the position.
 *
 * For a long: true when HA has turned red (haClose < haOpen).
 * `requireConsecutive` (default 1) demands that many consecutive
 * against-direction HA candles ending at `idx` before firing.
 *
 * FORWARD-ONLY: inspects only haCandles[idx-(n-1)..idx].
 */
export function haColorFlipExit(
  haCandles: HeikinAshiCandle[],
  idx: number,
  direction: "long" | "short",
  requireConsecutive: number = 1,
): boolean {
  const need = Math.max(1, requireConsecutive);
  if (idx < need - 1 || idx >= haCandles.length) return false;

  const againstColor = direction === "long" ? "red" : "green";
  for (let k = 0; k < need; k++) {
    const ha = haCandles[idx - k];
    if (!ha || ha.color !== againstColor) return false;
  }
  return true;
}

/**
 * HA exhaustion score (0-1).
 *
 * For a long: a long UPPER wick on a green HA candle following an extended
 * green run signals buyer exhaustion. Mirror for shorts (long lower wick on a
 * red candle after an extended red run).
 *
 * FORWARD-ONLY: walks backwards from `idx` only.
 */
export function haExhaustion(
  haCandles: HeikinAshiCandle[],
  idx: number,
  direction: "long" | "short",
): number {
  if (idx < 0 || idx >= haCandles.length) return 0;

  const wantColor = direction === "long" ? "green" : "red";
  const current = haCandles[idx];
  if (current.color !== wantColor) return 0;

  // Length of the consecutive same-direction run ending at idx.
  let run = 0;
  for (let k = idx; k >= 0; k--) {
    if (haCandles[k].color === wantColor) run++;
    else break;
  }

  const wick = direction === "long" ? current.upperWick : current.lowerWick;
  const wickRatio =
    current.bodySize > 0 ? wick / current.bodySize : wick > 0 ? 2 : 0;

  const runScore = Math.min(1, run / 6); // ~6-bar run is "extended"
  const wickScore = Math.min(1, wickRatio / 1.5); // wick >= 1.5x body is full

  const score = 0.5 * runScore + 0.5 * wickScore;

  // Only meaningful once the run is genuinely extended.
  return run >= 3 ? score : score * 0.3;
}
