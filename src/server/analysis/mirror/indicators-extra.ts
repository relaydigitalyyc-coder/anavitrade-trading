/**
 * Extra technical indicators for the Coinlegs mirror detector.
 *
 * Complements indicators.ts with MACD, Stochastic, CCI, and Ichimoku
 * Cloud components. All functions are pure — they operate on arrays
 * and return new arrays. Positions without enough data are `null`.
 */

import { sma, ema } from "../indicators";

/* ─── MACD ───────────────────────────────────────────────────────────────── */

export interface MacdResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

/**
 * MACD: Moving Average Convergence Divergence.
 *
 * MACD Line   = EMA(close, fast) - EMA(close, slow)
 * Signal Line = EMA(MACD Line, signal)
 * Histogram   = MACD Line - Signal Line
 *
 * Uses EMA with SMA seeding (same as indicators.ts ema()).
 * Signal line EMA is seeded from the SMA of the first `signal` valid
 * MACD values so the entire result array stays aligned.
 */
export function macd(
  close: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): MacdResult {
  const n = close.length;
  const macdLine: (number | null)[] = new Array(n).fill(null);
  const signalLineFinal: (number | null)[] = new Array(n).fill(null);
  const histogram: (number | null)[] = new Array(n).fill(null);

  const fastEma = ema(close, fast);
  const slowEma = ema(close, slow);

  // MACD line = fast EMA - slow EMA (valid where both are non-null)
  let firstMacdIdx = -1;
  for (let i = 0; i < n; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      macdLine[i] = fastEma[i]! - slowEma[i]!;
      if (firstMacdIdx < 0) firstMacdIdx = i;
    }
  }

  if (firstMacdIdx < 0) {
    return { macdLine, signalLine: signalLineFinal, histogram };
  }

  // Signal line = EMA of MACD line, seeded with SMA of first `signal` values
  const signalAlpha = 2 / (signal + 1);
  let seedSum = 0;
  let seedCount = 0;
  let seedIdx = -1;

  for (let i = firstMacdIdx; i < n && seedCount < signal; i++) {
    if (macdLine[i] !== null) {
      seedSum += macdLine[i]!;
      seedCount++;
      if (seedCount === signal) {
        signalLineFinal[i] = seedSum / signal;
        seedIdx = i;
      }
    }
  }

  if (seedIdx >= 0) {
    let prev = signalLineFinal[seedIdx]!;
    for (let i = seedIdx + 1; i < n; i++) {
      if (macdLine[i] !== null) {
        prev = signalAlpha * macdLine[i]! + (1 - signalAlpha) * prev;
        signalLineFinal[i] = prev;
      }
    }
  }

  // Histogram = MACD line - signal line
  for (let i = 0; i < n; i++) {
    if (macdLine[i] !== null && signalLineFinal[i] !== null) {
      histogram[i] = macdLine[i]! - signalLineFinal[i]!;
    }
  }

  return { macdLine, signalLine: signalLineFinal, histogram };
}

/* ─── Stochastic ──────────────────────────────────────────────────────────── */

export interface StochasticResult {
  k: (number | null)[];
  d: (number | null)[];
}

/**
 * Stochastic Oscillator.
 *
 * %K = (close - lowestLow) / (highestHigh - lowestLow) * 100  over kPeriod
 * %D = SMA(%K, dPeriod)
 */
export function stochastic(
  high: number[],
  low: number[],
  close: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): StochasticResult {
  const n = close.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);

  // %K
  for (let i = kPeriod - 1; i < n; i++) {
    let highestHigh = high[i];
    let lowestLow = low[i];
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (high[j] > highestHigh) highestHigh = high[j];
      if (low[j] < lowestLow) lowestLow = low[j];
    }
    const range = highestHigh - lowestLow;
    k[i] = range > 0 ? ((close[i] - lowestLow) / range) * 100 : 50;
  }

  // %D = SMA of %K over dPeriod
  const dStart = kPeriod + dPeriod - 2;
  for (let i = dStart; i < n; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      sum += k[j]!;
    }
    d[i] = sum / dPeriod;
  }

  return { k, d };
}

/* ─── CCI ─────────────────────────────────────────────────────────────────── */

/**
 * Commodity Channel Index.
 *
 * TP  = (high + low + close) / 3
 * CCI = (TP - SMA(TP, period)) / (0.015 * meanDeviation)
 */
export function cci(
  high: number[],
  low: number[],
  close: number[],
  period: number = 20,
): (number | null)[] {
  const n = close.length;
  const result: (number | null)[] = new Array(n).fill(null);

  const tp: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    tp[i] = (high[i] + low[i] + close[i]) / 3;
  }

  const tpSma = sma(tp, period);

  for (let i = period - 1; i < n; i++) {
    const mean = tpSma[i];
    if (mean === null) continue;

    let sumDev = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumDev += Math.abs(tp[j] - mean);
    }
    const meanDev = sumDev / period;

    result[i] = meanDev > 0 ? (tp[i] - mean) / (0.015 * meanDev) : 0;
  }

  return result;
}

/* ─── Ichimoku Cloud ──────────────────────────────────────────────────────── */

export interface IchimokuResult {
  tenkanSen: (number | null)[];
  kijunSen: (number | null)[];
  senkouSpanA: (number | null)[];
  senkouSpanB: (number | null)[];
  chikouSpan: (number | null)[];
}

/**
 * Ichimoku Cloud (Ichimoku Kinko Hyo) components.
 *
 * Tenkan-sen  (Conversion Line):  (9p-high  + 9p-low)  / 2
 * Kijun-sen   (Base Line):        (26p-high + 26p-low) / 2
 * Senkou Span A (Leading A):      (Tenkan + Kijun) / 2, shifted forward 26
 * Senkou Span B (Leading B):      (52p-high + 52p-low) / 2, shifted forward 26
 * Chikou Span  (Lagging Span):    close value, referenced 26 periods back
 *
 * Senkou spans are shifted 26 periods FORWARD from their computation point.
 * At index i, senkouSpanA[i] = (tenkan[i] + kijun[i]) / 2
 * This value represents the cloud level at i+26 on the chart.
 *
 * Chikou Span at index i equals close[i].  For detection we compare
 * chikouSpan[i] (close[i]) against close[i-26] — the price level the
 * chikou line is drawn behind.
 */
export function ichimoku(
  high: number[],
  low: number[],
  close: number[],
): IchimokuResult {
  const n = close.length;
  const tenkanSen: (number | null)[] = new Array(n).fill(null);
  const kijunSen: (number | null)[] = new Array(n).fill(null);
  const senkouSpanA: (number | null)[] = new Array(n).fill(null);
  const senkouSpanB: (number | null)[] = new Array(n).fill(null);
  const chikouSpan: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    // Tenkan-sen: 9-period high/low midpoint
    if (i >= 8) {
      let hh = high[i];
      let ll = low[i];
      for (let j = i - 8; j <= i; j++) {
        if (high[j] > hh) hh = high[j];
        if (low[j] < ll) ll = low[j];
      }
      tenkanSen[i] = (hh + ll) / 2;
    }

    // Kijun-sen: 26-period high/low midpoint
    if (i >= 25) {
      let hh = high[i];
      let ll = low[i];
      for (let j = i - 25; j <= i; j++) {
        if (high[j] > hh) hh = high[j];
        if (low[j] < ll) ll = low[j];
      }
      kijunSen[i] = (hh + ll) / 2;
    }

    // Senkou Span A (Leading A)
    if (i >= 25 && tenkanSen[i] !== null && kijunSen[i] !== null) {
      senkouSpanA[i] = (tenkanSen[i]! + kijunSen[i]!) / 2;
    }

    // Senkou Span B (Leading B): 52-period high/low midpoint
    if (i >= 51) {
      let hh = high[i];
      let ll = low[i];
      for (let j = i - 51; j <= i; j++) {
        if (high[j] > hh) hh = high[j];
        if (low[j] < ll) ll = low[j];
      }
      senkouSpanB[i] = (hh + ll) / 2;
    }

    // Chikou Span: close value (used for cross-detection below)
    chikouSpan[i] = close[i];
  }

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}
