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
    });
  }

  return result;
}
