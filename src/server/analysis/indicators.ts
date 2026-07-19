/**
 * Pure computation module for the unified analysis engine.
 *
 * All functions are stateless — they operate on arrays of numbers and
 * return new arrays.  No side effects.
 *
 * When there aren't enough data points to compute an indicator, `null` is
 * returned for that position so consumers can filter.
 */

import type { Kline, EnrichedCandle, IcrConfig } from "./types";

/* ─── Simple Moving Average ─────────────────────────────────────────────── */

export function sma(values: number[], length: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sum += values[j];
    }
    result[i] = sum / length;
  }
  return result;
}

/* ─── Exponential Moving Average ────────────────────────────────────────── */

export function ema(values: number[], length: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  if (values.length === 0) return result;

  const alpha = 2 / (length + 1);

  // SMA seed
  let prevEma: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    if (prevEma === null) {
      let sum = 0;
      for (let j = 0; j < length; j++) {
        sum += values[j];
      }
      prevEma = sum / length;
      result[i] = prevEma;
    } else {
      prevEma = alpha * values[i] + (1 - alpha) * prevEma;
      result[i] = prevEma;
    }
  }
  return result;
}

/* ─── Average True Range ────────────────────────────────────────────────── */

export function atr(
  high: number[],
  low: number[],
  close: number[],
  length: number,
): (number | null)[] {
  const n = high.length;
  const tr: number[] = new Array(n);

  if (n > 0) {
    tr[0] = high[0] - low[0];
    for (let i = 1; i < n; i++) {
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i - 1]);
      const lc = Math.abs(low[i] - close[i - 1]);
      tr[i] = Math.max(hl, hc, lc);
    }
  }

  return sma(tr, length);
}

/* ─── Relative Strength Index ───────────────────────────────────────────── */

export function rsi(close: number[], length: number): (number | null)[] {
  const result: (number | null)[] = new Array(close.length);

  // Need at least length + 1 values: 1 for diff, `length` for warmup.
  if (close.length < length + 1) {
    for (let i = 0; i < close.length; i++) result[i] = null;
    return result;
  }

  // Accumulate initial gains / losses for the SMA seed
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const delta = close[i] - close[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= length;
  avgLoss /= length;

  // First RSI value at position `length` (0-indexed)
  if (avgLoss === 0) {
    result[length] = 50;
  } else {
    const rs = avgGain / avgLoss;
    result[length] = 100 - 100 / (1 + rs);
  }

  // Wilder's smoothing for remaining bars
  for (let i = length + 1; i < close.length; i++) {
    const delta = close[i] - close[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    if (avgLoss === 0) {
      result[i] = 50;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  // Fill early positions
  for (let i = 0; i < length; i++) {
    result[i] = null;
  }

  return result;
}

/* ─── Rolling Z-Score ──────────────────────────────────────────────────── */

export function rollingZscore(
  values: number[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sum += values[j];
    }
    const mean = sum / length;

    let sqDiff = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sqDiff += (values[j] - mean) ** 2;
    }
    const std = Math.sqrt(sqDiff / length); // population std (ddof=0)

    result[i] = std === 0 ? 0 : (values[i] - mean) / std;
  }
  return result;
}

/* ─── Bollinger Bands ──────────────────────────────────────────────────── */

export function bollinger(
  close: number[],
  length: number,
  stdMult: number,
): {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  width: (number | null)[];
} {
  const mid = sma(close, length);
  const n = close.length;
  const upper: (number | null)[] = new Array(n);
  const lower: (number | null)[] = new Array(n);
  const width: (number | null)[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const m = mid[i];
    if (m === null) {
      upper[i] = null;
      lower[i] = null;
      width[i] = null;
      continue;
    }

    let sqDiff = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sqDiff += (close[j] - m) ** 2;
    }
    const std = Math.sqrt(sqDiff / length);
    upper[i] = m + std * stdMult;
    lower[i] = m - std * stdMult;
    width[i] = m !== 0 ? (upper[i]! - lower[i]!) / m : 0;
  }

  return { mid, upper, lower, width };
}

/* ─── Rolling Median ───────────────────────────────────────────────────── */

export function rollingMedian(
  values: number[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    const window: number[] = [];
    for (let j = i - length + 1; j <= i; j++) {
      window.push(values[j]);
    }
    const sorted = window.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    result[i] =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
  }
  return result;
}

/* ─── Percent Rank ─────────────────────────────────────────────────────── */

export function percentRank(
  values: number[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    let count = 0;
    for (let j = i - length + 1; j <= i; j++) {
      if (values[j] <= values[i]) count++;
    }
    result[i] = count / length;
  }
  return result;
}

/* ─── Rolling Min ──────────────────────────────────────────────────────── */

export function rollingMin(
  values: number[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    let minVal = values[i];
    for (let j = i - length + 1; j < i; j++) {
      if (values[j] < minVal) minVal = values[j];
    }
    result[i] = minVal;
  }
  return result;
}

/* ─── Rolling Max ──────────────────────────────────────────────────────── */

export function rollingMax(
  values: number[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      result[i] = null;
      continue;
    }
    let maxVal = values[i];
    for (let j = i - length + 1; j < i; j++) {
      if (values[j] > maxVal) maxVal = values[j];
    }
    result[i] = maxVal;
  }
  return result;
}

/* ─── WaveTrend (Market Cipher B) ──────────────────────────────────────── */

/**
 * WaveTrend oscillator (Market Cipher B / LazyBear): a faster, more normalized
 * momentum oscillator than RSI. WT1 is the main line; WT2 is its 2-period SMA.
 * Ported from scripts/ml/pipeline/features.py _wavetrend.
 */
export function waveTrend(
  close: number[],
  n1: number = 9,
  n2: number = 21,
): { wt1: (number | null)[]; wt2: (number | null)[] } {
  const n = close.length;
  const wt1: (number | null)[] = new Array(n).fill(null);
  const wt2: (number | null)[] = new Array(n).fill(null);

  if (n < n1 + n2) return { wt1, wt2 };

  // 1. ESA = EMA(close, n1)
  const esa = ema(close, n1);

  // 2. |close - ESA|
  const absDiff: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    absDiff[i] = esa[i] !== null ? Math.abs(close[i] - esa[i]!) : 0;
  }

  // 3. D = EMA(|close - ESA|, n1)
  const d = ema(absDiff, n1);

  // 4. CI = (close - ESA) / (0.015 * D), with safe division
  const ci: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (esa[i] === null || d[i] === null) {
      ci[i] = 0;
    } else {
      const dSafe = Math.abs(d[i]!) > 1e-12 ? d[i]! : 1;
      ci[i] = (close[i] - esa[i]!) / (0.015 * dSafe);
    }
  }

  // 5. TCI = EMA(CI, n2)
  const tci = ema(ci, n2);

  // 6. WT1 = TCI
  for (let i = 0; i < n; i++) {
    wt1[i] = tci[i];
  }

  // 7. WT2 = SMA(WT1, 2) — 2-period simple mean of consecutive non-null WT1 values
  for (let i = 1; i < n; i++) {
    if (wt1[i] !== null && wt1[i - 1] !== null) {
      wt2[i] = (wt1[i]! + wt1[i - 1]!) / 2;
    }
  }

  return { wt1, wt2 };
}

/* ─── Money Flow (Market Cipher B) ─────────────────────────────────────── */

/**
 * Market Cipher B money flow: volume-free price-position oscillator.
 * Ported from scripts/ml/pipeline/features.py _money_flow.
 */
export function moneyFlow(
  high: number[],
  low: number[],
  close: number[],
  period: number = 9,
): (number | null)[] {
  const n = high.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (n < period) return result;

  // HLC3 = (high + low + close) / 3
  const hlc3: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    hlc3[i] = (high[i] + low[i] + close[i]) / 3;
  }

  // SMA(hlc3, period)
  const smaHlc3 = sma(hlc3, period);

  // hlc3 - SMA(hlc3, period)
  const diff: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    diff[i] = smaHlc3[i] !== null ? hlc3[i] - smaHlc3[i]! : 0;
  }

  // numerator = 2 * SMA(diff, period)
  const numeratorRaw = sma(diff, period);
  const numerator: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    numerator[i] = numeratorRaw[i] !== null ? 2 * numeratorRaw[i]! : null;
  }

  // denominator = SMA(high - low, period)
  const hlDiff: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    hlDiff[i] = high[i] - low[i];
  }
  const denom = sma(hlDiff, period);

  // result = numerator / denominator (safe division)
  for (let i = 0; i < n; i++) {
    if (numerator[i] === null || denom[i] === null) {
      result[i] = null;
    } else if (Math.abs(denom[i]!) > 1e-12) {
      result[i] = numerator[i]! / denom[i]!;
    } else {
      result[i] = 0;
    }
  }

  return result;
}

/* ─── Stochastic RSI ───────────────────────────────────────────────────── */

/**
 * Stochastic RSI: RSI's own position within its recent [min, max] range.
 * Ported from scripts/ml/pipeline/features.py _stoch_rsi.
 */
export function stochRsi(
  rsiValues: number[],
  period: number = 14,
  smoothK: number = 3,
  smoothD: number = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const n = rsiValues.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);

  if (n < period + smoothK + smoothD) return { k, d };

  // Rolling min/max of RSI
  const rsiMin = rollingMin(rsiValues, period);
  const rsiMax = rollingMax(rsiValues, period);

  // raw = (rsi - rsi_min) / (rsi_max - rsi_min) * 100
  const raw: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (rsiMin[i] === null || rsiMax[i] === null) {
      raw[i] = 50;
    } else {
      const span = rsiMax[i]! - rsiMin[i]!;
      if (Math.abs(span) > 1e-12) {
        raw[i] = ((rsiValues[i] - rsiMin[i]!) / span) * 100;
      } else {
        raw[i] = 50;
      }
    }
  }

  // K = SMA(raw, smoothK)
  const rawSma = sma(raw, smoothK);

  // D = SMA(K, smoothD)
  const kArr: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    kArr[i] = rawSma[i];
  }

  const kValues: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    kValues[i] = rawSma[i] !== null ? rawSma[i]! : 50;
  }
  const dArr = sma(kValues, smoothD);

  for (let i = 0; i < n; i++) {
    k[i] = kArr[i];
    d[i] = dArr[i];
  }

  return { k, d };
}

/* ─── Enrich Candles ───────────────────────────────────────────────────── */

/**
 * Takes raw Kline[] candles and returns EnrichedCandle[] with all indicators
 * computed.
 *
 * The caller should provide a lookback buffer (extra candles before the
 * "real" candles) so that early output positions have valid indicator values.
 * The maximum warmup is `Math.max(slowMa, atrLength, volumeMaLength,
 * bollingerLength, 14)` candles.
 *
 * Edge cases:
 *  - bodyRatio = 0 when range is 0
 *  - closePosition = 0.5 when range is 0
 *  - displacement = 0 when atr14 is 0
 *  - bbWidth = 0 when bbMid is 0
 */
export function enrichCandles(
  candles: Kline[],
  config: IcrConfig,
): EnrichedCandle[] {
  const n = candles.length;
  if (n === 0) return [];

  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume);

  const ma7 = sma(close, config.fastMa);
  const ma25 = sma(close, config.midMa);
  const ma99 = sma(close, config.slowMa);
  const atr14 = atr(high, low, close, config.atrLength);
  const volumeMa20 = sma(volume, config.volumeMaLength);
  const volumeZscore = rollingZscore(volume, config.volumeMaLength);
  const rsi14 = rsi(close, 14);
  const bb = bollinger(close, config.bollingerLength, config.bollingerStd);

  // WaveTrend, Money Flow, Stochastic RSI (ported from ML pipeline)
  const wt = waveTrend(close, 9, 21);
  const mf = moneyFlow(high, low, close, 9);
  const sr = stochRsi(
    close.map((_, i) => rsi14[i] ?? 50),
    14, 3, 3,
  );

  const result: EnrichedCandle[] = [];
  for (let i = 0; i < n; i++) {
    const candle = candles[i];
    const range = high[i] - low[i];
    const body = Math.abs(close[i] - open[i]);
    const bodyRatio = range > 0 ? body / range : 0;
    const closePosition = range > 0 ? (close[i] - low[i]) / range : 0.5;

    const ma25Val = ma25[i];
    const ma25Prev =
      i >= config.maSlopeLookback ? ma25[i - config.maSlopeLookback] : null;
    const ma25Slope =
      ma25Val !== null && ma25Prev !== null ? ma25Val - ma25Prev : 0;

    const ma7Val = ma7[i];
    const atr14Val = atr14[i];
    const displacement =
      ma7Val !== null && atr14Val !== null && atr14Val > 0
        ? (close[i] - ma7Val) / atr14Val
        : 0;

    result.push({
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      timestamp: candle.timestamp,
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
      volume: volume[i],

      ma7: ma7Val ?? 0,
      ma25: ma25Val ?? 0,
      ma99: ma99[i] ?? 0,
      atr14: atr14Val ?? 0,
      volumeMa20: volumeMa20[i] ?? 0,
      volumeZscore: volumeZscore[i] ?? 0,
      range,
      body,
      bodyRatio,
      closePosition,
      ma25Slope,
      rsi14: rsi14[i] ?? 0,
      bbMid: bb.mid[i] ?? 0,
      bbUpper: bb.upper[i] ?? 0,
      bbLower: bb.lower[i] ?? 0,
      bbWidth: bb.width[i] ?? 0,
      displacement,
      wt1: wt.wt1[i] ?? 0,
      wt2: wt.wt2[i] ?? 0,
      moneyFlow: mf[i] ?? 0,
      stochRsiK: sr.k[i] ?? 0,
      stochRsiD: sr.d[i] ?? 0,
    });
  }

  return result;
}
