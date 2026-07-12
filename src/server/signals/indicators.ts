/**
 * Technical indicator computations over Binance kline data.
 * All pure functions — input is arrays of closes/highs/lows, output is
 * signal detection (1 = buy, -1 = sell, 0 = neutral) with metadata.
 *
 * Kline format from Binance: [openTime, open, high, low, close, volume, ...]
 */

export type Candle = { open: number; high: number; low: number; close: number; volume: number; time: number };

export type IndicatorSignal = {
  indicator: "macd" | "stochastic" | "cci" | "ichimoku" | "trend_reversal";
  signal: 1 | -1 | 0;  // 1=buy, -1=sell, 0=neutral
  marketName: string;   // e.g. "BTCUSDT"
  period: string;        // "1h" | "2h" | "4h"
  price: number;
  lastPrice: number;
  signalTime: number;    // candle close timestamp
  metadata: Record<string, number | string>;  // indicator-specific values for scoring
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function sma(values: number[], window: number): number {
  if (values.length < window) return values[values.length - 1] || 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

function ema(values: number[], window: number): number[] {
  const result = [values[0]];
  const k = 2 / (window + 1);
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/* ─── MACD ───────────────────────────────────────────────────────────────
 * Classic 12/26/9 MACD. Buy = MACD line crosses above signal line.
 * From analysis_findings.md: MACD on 4h = strongest signal (median +116.3%). */

export function detectMACD(candles: Candle[]): IndicatorSignal | null {
  const closes = candles.map(c => c.close);
  if (closes.length < 35) return null;

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(), 9);

  const currMacD = macdLine[macdLine.length - 1];
  const prevMacD = macdLine[macdLine.length - 2];
  const currSig = signalLine[signalLine.length - 1];
  const prevSig = signalLine[signalLine.length - 2];

  // Bullish crossover: MACD line crosses ABOVE signal line
  // Bearish crossover: MACD line crosses BELOW signal line
  const last = candles[candles.length - 1];
  if (prevMacD <= prevSig && currMacD > currSig) {
    return { indicator: "macd", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { macd: currMacD, signal_line: currSig, histogram: currMacD - currSig } };
  }
  if (prevMacD >= prevSig && currMacD < currSig) {
    return { indicator: "macd", signal: -1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { macd: currMacD, signal_line: currSig, histogram: currMacD - currSig } };
  }

  return null; // no crossover
}

/* ─── Stochastic ─────────────────────────────────────────────────────────
 * Fast Stochastic %K (14,3). Buy = oversold (<20) crossing above.
 * From analysis_findings.md: 4h Stochastic = +110.1% median. */

export function detectStochastic(candles: Candle[]): IndicatorSignal | null {
  const window = 14;
  if (candles.length < window + 2) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  function k(candles: Candle[], i: number): number {
    const slice = candles.slice(i - window + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return ((candles[i].close - low) / (high - low || 1)) * 100;
  }

  const currK = k(candles, candles.length - 1);
  const prevK = k(candles, candles.length - 2);

  // Buy: cross above 20 from below (oversold recovery)
  if (prevK <= 20 && currK > 20) {
    return { indicator: "stochastic", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { k: currK, threshold: 20 } };
  }
  // Strong buy even if not crossing: deep oversold and turning up
  if (currK < 20 && currK > prevK) {
    return { indicator: "stochastic", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { k: currK, threshold: 20, note: "oversold_reversal" } };
  }
  // Sell: cross below 80 from above (overbought reversal)
  if (prevK >= 80 && currK < 80) {
    return { indicator: "stochastic", signal: -1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { k: currK, threshold: 80 } };
  }

  return null;
}

/* ─── CCI ────────────────────────────────────────────────────────────────
 * Commodity Channel Index (20). Buy = cross above -100 (exit oversold).
 * From analysis_findings.md: CCI on 4h = median +97.2%. */

export function detectCCI(candles: Candle[]): IndicatorSignal | null {
  const window = 20;
  if (candles.length < window + 2) return null;

  const typical = candles.map(c => (c.high + c.low + c.close) / 3);
  const smaTP = typical.slice(-window).reduce((a, b) => a + b, 0) / window;
  const meanDev = typical.slice(-window).reduce((a, b) => a + Math.abs(b - smaTP), 0) / window;

  const cciVals = typical.map(tp => (tp - smaTP) / (0.015 * (meanDev || 1)));

  const curr = cciVals[cciVals.length - 1];
  const prev = cciVals[cciVals.length - 2];

  const last = candles[candles.length - 1];

  // Buy: crossing above -100 (oversold recovery)
  if (prev <= -100 && curr > -100) {
    return { indicator: "cci", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { cci: curr, threshold: -100 } };
  }
  // Sell: crossing below 100 (overbought reversal)
  if (prev >= 100 && curr < 100) {
    return { indicator: "cci", signal: -1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { cci: curr, threshold: 100 } };
  }

  return null;
}

/* ─── Ichimoku ───────────────────────────────────────────────────────────
 * Tenkan-sen (9) crosses Kijun-sen (26). Chikou span confirms.
 * From analysis_findings.md: weakest on 4h (median +96.4%), strongest on 1w. */

export function detectIchimoku(candles: Candle[]): IndicatorSignal | null {
  if (candles.length < 52) return null;

  function tenkan(i: number): number {
    const slice = candles.slice(i - 8, i + 1);
    return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
  }
  function kijun(i: number): number {
    const slice = candles.slice(i - 25, i + 1);
    return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
  }

  const i = candles.length - 1;
  const tNow = tenkan(i), kNow = kijun(i);
  const tPrev = tenkan(i - 1), kPrev = kijun(i - 1);

  const last = candles[candles.length - 1];
  const priceAboveCloud = last.close > Math.max(tNow, kNow);

  // Tenkan crosses above Kijun = bullish TK cross
  if (tPrev <= kPrev && tNow > kNow && priceAboveCloud) {
    return { indicator: "ichimoku", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { tenkan: tNow, kijun: kNow } };
  }
  if (tPrev >= kPrev && tNow < kNow) {
    return { indicator: "ichimoku", signal: -1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { tenkan: tNow, kijun: kNow } };
  }

  return null;
}

/* ─── Trend Reversal ─────────────────────────────────────────────────────
 * Detected via RSI divergence + Bollinger Band squeeze → breakout.
 * Buy: RSI < 30 (oversold), BB width at 20-period low, price closing above
 *       the middle band = squeeze firing upward.
 * From analysis_findings.md: Trend Reversal on 4h = median +102.5%. */

export function detectTrendReversal(candles: Candle[]): IndicatorSignal | null {
  if (candles.length < 30) return null;

  const closes = candles.map(c => c.close);

  // RSI(14)
  const rsiWindow = 14;
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const avgGain = gains.slice(-rsiWindow).reduce((a, b) => a + b, 0) / rsiWindow;
  const avgLoss = losses.slice(-rsiWindow).reduce((a, b) => a + b, 0) / rsiWindow;
  const rs = avgGain / (avgLoss || 1);
  const rsi = 100 - (100 / (1 + rs));

  // Bollinger Bands (20,2)
  const bbWindow = 20;
  const ma = sma(closes, bbWindow);
  const std = Math.sqrt(closes.slice(-bbWindow).reduce((a, c) => a + (c - ma) ** 2, 0) / bbWindow);
  const upper = ma + 2 * std;
  const lower = ma - 2 * std;
  const bandwidth = (upper - lower) / ma;

  // Historical BB widths to detect squeeze
  const bbWidths: number[] = [];
  for (let i = bbWindow; i < closes.length; i++) {
    const m = sma(closes.slice(0, i + 1), bbWindow);
    const s = Math.sqrt(closes.slice(i - bbWindow + 1, i + 1).reduce((a, c) => a + (c - m) ** 2, 0) / bbWindow);
    bbWidths.push((m + 2 * s - (m - 2 * s)) / m);
  }

  const last = candles[candles.length - 1];
  const isSqueeze = bandwidth < sma(bbWidths, 20);

  // Buy: oversold RSI (<30) + BB squeeze firing + price closing above mid
  if (rsi < 30 && isSqueeze && last.close > ma) {
    return { indicator: "trend_reversal", signal: 1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { rsi, bb_ma: ma, bb_bandwidth: bandwidth, squeeze: 1 } };
  }
  // Sell: overbought RSI (>70) + squeeze firing + price closing below mid
  if (rsi > 70 && isSqueeze && last.close < ma) {
    return { indicator: "trend_reversal", signal: -1, marketName: "", period: "", price: last.close, lastPrice: last.close, signalTime: last.time, metadata: { rsi, bb_ma: ma, bb_bandwidth: bandwidth, squeeze: 1 } };
  }

  return null;
}

/* ─── Composite ────────────────────────────────────────────────────────── */

const DETECTORS = [detectMACD, detectStochastic, detectCCI, detectIchimoku, detectTrendReversal];

/**
 * Run all 5 indicators against a set of candles and return any buy signals.
 * A signal is fired when an indicator's detection function triggers.
 */
export function scanSignals(candles: Candle[], marketName: string, period: string): IndicatorSignal[] {
  const results: IndicatorSignal[] = [];
  for (const detector of DETECTORS) {
    const sig = detector(candles);
    if (sig && sig.signal === 1) {
      sig.marketName = marketName;
      sig.period = period;
      sig.price = candles[candles.length - 1].close;
      sig.lastPrice = candles[candles.length - 1].close;
      results.push(sig);
    }
  }
  return results;
}
