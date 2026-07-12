/**
 * Data-driven exhaustion detection.
 *
 * FORWARD-ONLY GUARANTEE: `detectExhaustion` reads only candles[0..idx]. Every
 * sub-signal looks backwards from `idx` (or at `idx` itself). No candle beyond
 * `idx` is ever inspected, so the result is exactly what a live system would
 * see at bar `idx`.
 */

import type { EnrichedCandle } from "../types";

export interface ExhaustionResult {
  score: number; // 0-1 aggregate exhaustion
  signals: string[]; // which fired
  shouldExit: boolean; // score >= threshold
}

/* ─── Signal weights (sum = 1.0) ───────────────────────────────────────── */

const WEIGHTS = {
  rsiDivergence: 0.25,
  volumeClimax: 0.2,
  overextension: 0.2,
  bollingerReturn: 0.2,
  bodyCollapse: 0.15,
} as const;

const RSI_DIVERGENCE_LOOKBACK = 14;
const RSI_LONG_EXTREME = 68;
const RSI_SHORT_EXTREME = 32;

/* ─── Sub-signals (all forward-only) ───────────────────────────────────── */

/**
 * RSI extreme + regular bearish/bullish divergence.
 * Long: price makes a higher high but RSI makes a lower high, RSI extreme.
 * Short: price makes a lower low but RSI makes a higher low, RSI extreme.
 */
function rsiDivergence(
  candles: EnrichedCandle[],
  idx: number,
  direction: "long" | "short",
): boolean {
  const start = idx - RSI_DIVERGENCE_LOOKBACK;
  if (start < 0) return false;

  const current = candles[idx];

  if (direction === "long") {
    if (current.rsi14 < RSI_LONG_EXTREME) return false;
    // Find the prior swing high (excluding the last 2 bars to be a distinct peak).
    let priorHigh = -Infinity;
    let priorRsi = 0;
    for (let j = start; j <= idx - 2; j++) {
      if (candles[j].high > priorHigh) {
        priorHigh = candles[j].high;
        priorRsi = candles[j].rsi14;
      }
    }
    if (!Number.isFinite(priorHigh)) return false;
    return current.high > priorHigh && current.rsi14 < priorRsi;
  }

  if (current.rsi14 > RSI_SHORT_EXTREME) return false;
  let priorLow = Infinity;
  let priorRsi = 0;
  for (let j = start; j <= idx - 2; j++) {
    if (candles[j].low < priorLow) {
      priorLow = candles[j].low;
      priorRsi = candles[j].rsi14;
    }
  }
  if (!Number.isFinite(priorLow)) return false;
  return current.low < priorLow && current.rsi14 > priorRsi;
}

/**
 * Volume climax: blow-off top / capitulation bottom.
 * Volume >= 2.5x volumeMa20, a large range, and a close that rejects
 * (closed weak for a long / strong for a short).
 */
function volumeClimax(
  candle: EnrichedCandle,
  direction: "long" | "short",
): boolean {
  if (candle.volumeMa20 <= 0) return false;
  const volSpike = candle.volume >= 2.5 * candle.volumeMa20;
  const wideRange = candle.atr14 > 0 && candle.range >= 1.5 * candle.atr14;
  if (!volSpike || !wideRange) return false;

  // Reversal: long closes in the lower part of the bar; short in the upper part.
  return direction === "long"
    ? candle.closePosition < 0.45
    : candle.closePosition > 0.55;
}

/**
 * Overextension from the fast MA (parabolic displacement).
 * displacement = (close - ma7) / atr14.
 */
function overextension(
  candle: EnrichedCandle,
  direction: "long" | "short",
): boolean {
  return direction === "long"
    ? candle.displacement >= 3.0
    : candle.displacement <= -3.0;
}

/**
 * Bollinger walk-and-return: closed outside the band in the last 3 bars and is
 * now closing back inside.
 */
function bollingerReturn(
  candles: EnrichedCandle[],
  idx: number,
  direction: "long" | "short",
): boolean {
  if (idx < 3) return false;
  const current = candles[idx];

  if (direction === "long") {
    if (!(current.bbUpper > 0 && current.close < current.bbUpper)) return false;
    for (let j = idx - 3; j <= idx - 1; j++) {
      const c = candles[j];
      if (c.bbUpper > 0 && c.close > c.bbUpper) return true;
    }
    return false;
  }

  if (!(current.bbLower > 0 && current.close > current.bbLower)) return false;
  for (let j = idx - 3; j <= idx - 1; j++) {
    const c = candles[j];
    if (c.bbLower > 0 && c.close < c.bbLower) return true;
  }
  return false;
}

/**
 * Momentum body collapse: >= 3 consecutive large directional bodies followed
 * by a small body / doji at idx.
 */
function bodyCollapse(
  candles: EnrichedCandle[],
  idx: number,
  direction: "long" | "short",
): boolean {
  if (idx < 3) return false;
  const current = candles[idx];
  if (current.bodyRatio >= 0.3) return false; // idx must be a small body / doji

  for (let j = idx - 3; j <= idx - 1; j++) {
    const c = candles[j];
    const largeBody = c.bodyRatio >= 0.6;
    const directional =
      direction === "long" ? c.close > c.open : c.close < c.open;
    if (!largeBody || !directional) return false;
  }
  return true;
}

/* ─── Aggregate ────────────────────────────────────────────────────────── */

/**
 * Combine all exhaustion sub-signals into a weighted 0-1 score for a position
 * in `direction`. `shouldExit` fires when the aggregate reaches
 * `exitThreshold` (default 0.6).
 *
 * FORWARD-ONLY: uses candles[0..idx] exclusively.
 */
export function detectExhaustion(
  candles: EnrichedCandle[],
  idx: number,
  direction: "long" | "short",
  exitThreshold: number = 0.6,
): ExhaustionResult {
  if (idx < 0 || idx >= candles.length) {
    return { score: 0, signals: [], shouldExit: false };
  }

  const candle = candles[idx];
  const signals: string[] = [];
  let score = 0;

  if (rsiDivergence(candles, idx, direction)) {
    score += WEIGHTS.rsiDivergence;
    signals.push("rsi_divergence");
  }
  if (volumeClimax(candle, direction)) {
    score += WEIGHTS.volumeClimax;
    signals.push("volume_climax");
  }
  if (overextension(candle, direction)) {
    score += WEIGHTS.overextension;
    signals.push("overextension");
  }
  if (bollingerReturn(candles, idx, direction)) {
    score += WEIGHTS.bollingerReturn;
    signals.push("bollinger_return");
  }
  if (bodyCollapse(candles, idx, direction)) {
    score += WEIGHTS.bodyCollapse;
    signals.push("body_collapse");
  }

  return {
    score,
    signals,
    shouldExit: score >= exitThreshold,
  };
}
