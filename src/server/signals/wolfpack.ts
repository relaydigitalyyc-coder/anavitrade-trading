/**
 * Wolfpack ID / AK Trend with Divergence — TypeScript port
 *
 * The simplest and most transparent indicator in the Market Cipher family.
 * It is literally MACD(3,8) plotted as a histogram, with divergence detection
 * on the oscillator.  When the histogram crosses zero, the trend changes.
 *
 * This is the core trend engine that Market Cipher B builds upon (MCB's
 * "WaveTrend" is a normalised EMA spread; Wolfpack is the raw spread).
 *
 * Signal types:
 *  - wp_zero_cross_bull:  histogram crosses above 0 → uptrend confirmed
 *  - wp_zero_cross_bear:  histogram crosses below 0 → downtrend confirmed
 *  - wp_regular_bull_div: price makes lower low, histogram makes higher low
 *  - wp_regular_bear_div: price makes higher high, histogram makes lower high
 *  - wp_hidden_bull_div:  price makes higher low, histogram makes lower low
 *  - wp_hidden_bear_div:  price makes lower high, histogram makes higher high
 *  - wp_pivot_high:       local histogram peak (potential reversal)
 *  - wp_pivot_low:        local histogram trough (potential reversal bottom)
 *
 * The divergence signals are PARTICULARLY valuable because they detect
 * weakening momentum BEFORE the zero cross happens — giving earlier entries
 * than waiting for the trend confirmation.
 */

export type WolfpackSignal = {
  type: "wp_zero_cross_bull" | "wp_zero_cross_bear" |
        "wp_regular_bull_div" | "wp_regular_bear_div" |
        "wp_hidden_bull_div" | "wp_hidden_bear_div" |
        "wp_pivot_low" | "wp_pivot_high";
  pair: string;
  period: string;
  price: number;
  spread: number;        // current MACD(3,8) spread value
  confidence: number;
};

type WolfpackParams = {
  fastLen: number;       // 3
  slowLen: number;       // 8
  divergenceLbL: number; // pivot lookback left  (default 10)
  divergenceLbR: number; // pivot lookback right (default 1)
  rangeMin: number;      // min bars between pivots (2)
  rangeMax: number;      // max bars between pivots (100)
};

const DEFAULTS: WolfpackParams = {
  fastLen: 3, slowLen: 8,
  divergenceLbL: 10, divergenceLbR: 1,
  rangeMin: 2, rangeMax: 100,
};

/* ─── Math ─────────────────────────────────────────────────────────── */

function ema(v: number[], p: number): number[] {
  const k = 2 / (p + 1); const r = [v[0]];
  for (let i = 1; i < v.length; i++) r.push(v[i] * k + r[i-1] * (1 - k));
  return r;
}

/* ─── Core ─────────────────────────────────────────────────────────── */

export function detectWolfpack(
  closes: number[], highs: number[], lows: number[],
  pair: string, period: string, params: Partial<WolfpackParams> = {},
): WolfpackSignal[] {
  const p = { ...DEFAULTS, ...params };
  const L = closes.length;
  if (L < p.slowLen + p.divergenceLbL + p.divergenceLbR + 5) return [];

  // ── MACD(3,8) spread = EMA(3) - EMA(8) ──
  const fast = ema(closes, p.fastLen);
  const slow = ema(closes, p.slowLen);
  const spread = fast.map((f, i) => (f - slow[i]) * 1.001); // ×1.001 matches original

  const signals: WolfpackSignal[] = [];
  const last = L - 1, prev = L - 2;

  // ── Zero cross ──
  if (spread[prev] <= 0 && spread[last] > 0) {
    signals.push({ type: "wp_zero_cross_bull", pair, period, price: closes[last], spread: spread[last], confidence: 50 });
  }
  if (spread[prev] >= 0 && spread[last] < 0) {
    signals.push({ type: "wp_zero_cross_bear", pair, period, price: closes[last], spread: spread[last], confidence: 50 });
  }

  // ── Pivot detection ──
  const lbL = p.divergenceLbL, lbR = p.divergenceLbR;
  const pivotLowIdx: number[] = [];
  const pivotHighIdx: number[] = [];
  for (let i = lbL; i < L - lbR; i++) {
    let isLow = true, isHigh = true;
    for (let j = i - lbL; j <= i + lbR && (isLow || isHigh); j++) {
      if (j !== i) {
        if (spread[j] <= spread[i]) isLow = false;
        if (spread[j] >= spread[i]) isHigh = false;
      }
    }
    if (isLow) pivotLowIdx.push(i);
    if (isHigh) pivotHighIdx.push(i);
  }

  // ── Pivot signals ──
  for (const idx of pivotLowIdx.slice(-1)) {
    if (spread[idx] < 0) {
      signals.push({ type: "wp_pivot_low", pair, period, price: closes[idx], spread: spread[idx], confidence: 40 });
    }
  }
  for (const idx of pivotHighIdx.slice(-1)) {
    if (spread[idx] > 0) {
      signals.push({ type: "wp_pivot_high", pair, period, price: closes[idx], spread: spread[idx], confidence: 40 });
    }
  }

  // ── Divergence detection ──
  function inRange(condIdx: number[], min: number, max: number): boolean {
    // Return true if a prior pivot exists and is within the lookback range
    if (condIdx.length < 2) return false;
    const bars = condIdx[condIdx.length - 1] - condIdx[condIdx.length - 2];
    return bars >= min && bars <= max;
  }

  // Regular Bullish: price lower low, spread higher low
  if (pivotLowIdx.length >= 2 && inRange(pivotLowIdx, p.rangeMin, p.rangeMax)) {
    const i1 = pivotLowIdx[pivotLowIdx.length - 2];
    const i2 = pivotLowIdx[pivotLowIdx.length - 1];
    const priceLL = lows[i2] < lows[i1];
    const oscHL = spread[i2] > spread[i1] && spread[i2] < 0;
    if (priceLL && oscHL) {
      signals.push({ type: "wp_regular_bull_div", pair, period, price: closes[last], spread: spread[last], confidence: 70 });
    }
  }

  // Regular Bearish: price higher high, spread lower high
  if (pivotHighIdx.length >= 2 && inRange(pivotHighIdx, p.rangeMin, p.rangeMax)) {
    const i1 = pivotHighIdx[pivotHighIdx.length - 2];
    const i2 = pivotHighIdx[pivotHighIdx.length - 1];
    const priceHH = highs[i2] > highs[i1];
    const oscLH = spread[i2] < spread[i1] && spread[i2] > 0;
    if (priceHH && oscLH) {
      signals.push({ type: "wp_regular_bear_div", pair, period, price: closes[last], spread: spread[last], confidence: 70 });
    }
  }

  // Hidden Bullish: price higher low, spread lower low (continuation)
  if (pivotLowIdx.length >= 2 && inRange(pivotLowIdx, p.rangeMin, p.rangeMax)) {
    const i1 = pivotLowIdx[pivotLowIdx.length - 2];
    const i2 = pivotLowIdx[pivotLowIdx.length - 1];
    const priceHL = lows[i2] > lows[i1];
    const oscLL = spread[i2] < spread[i1];
    if (priceHL && oscLL) {
      signals.push({ type: "wp_hidden_bull_div", pair, period, price: closes[last], spread: spread[last], confidence: 60 });
    }
  }

  // Hidden Bearish: price lower high, spread higher high (continuation)
  if (pivotHighIdx.length >= 2 && inRange(pivotHighIdx, p.rangeMin, p.rangeMax)) {
    const i1 = pivotHighIdx[pivotHighIdx.length - 2];
    const i2 = pivotHighIdx[pivotHighIdx.length - 1];
    const priceLH = highs[i2] < highs[i1];
    const oscHH = spread[i2] > spread[i1];
    if (priceLH && oscHH) {
      signals.push({ type: "wp_hidden_bear_div", pair, period, price: closes[last], spread: spread[last], confidence: 60 });
    }
  }

  return signals;
}
