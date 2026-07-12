/**
 * Coinlegs Mirror Detector — candle-based buy signal detection.
 *
 * Reverse-engineers the 5 Coinlegs indicator types (DetectionIds 47, 9, 8, 46, 7)
 * and detects buy signals at candle close — BEFORE Coinlegs publishes them.
 *
 * ALL detection is candle-based: we only look at completed candles,
 * comparing index i (now) against index i-1 (previous) to determine
 * if a crossover occurred at exactly this candle.  No future data is used.
 */

import type { Kline } from "../types";
import { sma } from "../indicators";
import {
  macd,
  stochastic,
  cci,
  ichimoku,
} from "./indicators-extra";

/* ─── Public types ─────────────────────────────────────────────────────────── */

export interface CoinlegsDetection {
  indicatorName: string;
  indicatorShortName: string;
  typeId: number;
  timeframe: string;
  symbol: string;
  price: number;
  candleTimestamp: number;
  confidence: number;
  thesis: string;
}

/* ─── Indicator-type constants matching Coinlegs DetectionIds ──────────────── */

const INDICATOR_META: Record<number, { name: string; shortName: string }> = {
  47: { name: "MACD", shortName: "MACD" },
  9: { name: "Stochastic", shortName: "Stoch" },
  8: { name: "CCI", shortName: "CCI" },
  46: { name: "Ichimoku", shortName: "Ichi" },
  7: { name: "Trend Reversal", shortName: "Trend" },
};

/* ─── Candle helpers ──────────────────────────────────────────────────────── */

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

/**
 * Round to 8 decimal places for consistent price display.
 */
function r8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/* ─── Main entry point ────────────────────────────────────────────────────── */

/**
 * Detect all Coinlegs-style indicator buy signals for a given symbol+timeframe
 * at the latest completed candle.
 *
 * Returns 0-5 CoinlegsDetection objects.  Each detection represents a buy
 * signal that fired on the latest completed candle.
 */
export function detectCoinlegsSignals(
  symbol: string,
  timeframe: string,
  candles: Kline[],
): CoinlegsDetection[] {
  const n = candles.length;
  if (n < 60) return []; // minimum data: 60 candles for warmup

  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume);

  // Pre-compute all indicators (shared across detectors)
  const macdResult = macd(close);
  const stochResult = stochastic(high, low, close);
  const cciResult = cci(high, low, close);
  const ichiResult = ichimoku(high, low, close);

  // Trend reversal uses existing SMA indicators
  const ma7 = sma(close, 7);
  const ma25 = sma(close, 25);
  const ma99 = sma(close, 99);

  const detections: CoinlegsDetection[] = [];

  const latestIdx = n - 1;
  const price = close[latestIdx];
  const ts = candles[latestIdx].timestamp;

  const base = { symbol, timeframe, price, candleTimestamp: ts };

  // Run each detector
  const macdSig = detectMACD(macdResult, base, latestIdx);
  if (macdSig) detections.push(macdSig);

  const stochSig = detectStochastic(stochResult, base, latestIdx);
  if (stochSig) detections.push(stochSig);

  const cciSig = detectCCI(cciResult, close, base, latestIdx);
  if (cciSig) detections.push(cciSig);

  const ichiSig = detectIchimoku(ichiResult, close, base, latestIdx);
  if (ichiSig) detections.push(ichiSig);

  const trendSig = detectTrendReversal(
    { ma7, ma25, ma99 },
    { close, high, volume },
    base,
    latestIdx,
  );
  if (trendSig) detections.push(trendSig);

  return detections;
}

/* ─── Base type for per-detector inputs ────────────────────────────────────── */

interface DetectionBase {
  symbol: string;
  timeframe: string;
  price: number;
  candleTimestamp: number;
}

/* ─── MACD Detector (DetectionId 47) ──────────────────────────────────────── */

/**
 * MACD bullish crossover detection.
 *
 * Conditions (ALL must be true at current candle):
 *  1. MACD line > signal line (crossover just happened)
 *  2. MACD line < signal line at previous candle (was below)
 *  3. Histogram is positive (confirmation)
 *  4. Histogram is larger (magnitude) than previous non-zero histogram (acceleration)
 *
 * Confidence: based on histogram magnitude relative to price.
 */
function detectMACD(
  m: ReturnType<typeof macd>,
  base: DetectionBase,
  i: number,
): CoinlegsDetection | null {
  const { macdLine, signalLine, histogram } = m;

  if (i < 1) return null;
  if (
    macdLine[i] === null || signalLine[i] === null || histogram[i] === null ||
    macdLine[i - 1] === null || signalLine[i - 1] === null || histogram[i - 1] === null
  ) {
    return null;
  }

  const curMacd = macdLine[i]!;
  const curSig = signalLine[i]!;
  const curHist = histogram[i]!;
  const prevMacd = macdLine[i - 1]!;
  const prevSig = signalLine[i - 1]!;
  const prevHist = histogram[i - 1]!;

  // Must have crossed (was below, now above) and histogram is positive
  const crossed = prevMacd <= prevSig && curMacd > curSig;
  if (!crossed || curHist <= 0) return null;

  // Histogram acceleration (optional; only penalizes confidence)
  const accelerating = curHist > prevHist;

  let thesis = "MACD bullish crossover";
  if (accelerating) thesis += " with histogram expansion";

  const conf = accelerating ? 85 : 65;

  return {
    indicatorName: INDICATOR_META[47].name,
    indicatorShortName: INDICATOR_META[47].shortName,
    typeId: 47,
    ...base,
    confidence: conf,
    thesis,
  };
}

/* ─── Stochastic Detector (DetectionId 9) ─────────────────────────────────── */

/**
 * Stochastic buy signal detection.
 *
 * Conditions (any of the following):
 *  A) %K crosses above %D AND %K was < 20 at previous candle (oversold reversal)
 *  B) %K > %D AND both rising (%K > prev%K, %D > prev%D) — confirmed uptrend
 *
 * Confidence: highest for oversold reversal (95); lower for rising trend (70).
 */
function detectStochastic(
  s: ReturnType<typeof stochastic>,
  base: DetectionBase,
  i: number,
): CoinlegsDetection | null {
  const { k, d } = s;

  if (i < 1) return null;
  if (k[i] === null || d[i] === null || k[i - 1] === null || d[i - 1] === null) {
    return null;
  }

  const curK = k[i]!;
  const curD = d[i]!;
  const prevK = k[i - 1]!;
  const prevD = d[i - 1]!;

  // Condition A: Oversold reversal — %K crosses above %D from below 20
  const kCrossAboveD = prevK <= prevD && curK > curD;
  const wasOversold = prevK < 20;
  if (kCrossAboveD && wasOversold) {
    return {
      indicatorName: INDICATOR_META[9].name,
      indicatorShortName: INDICATOR_META[9].shortName,
      typeId: 9,
      ...base,
      confidence: 95,
      thesis: `Stochastic oversold reversal: %K crossed above %D from ${r8(prevK)} (oversold)`,
    };
  }

  // Condition B: Both rising together (confirmed momentum)
  const bothRising = curK > curD && curK > prevK && curD > prevD;
  if (bothRising) {
    return {
      indicatorName: INDICATOR_META[9].name,
      indicatorShortName: INDICATOR_META[9].shortName,
      typeId: 9,
      ...base,
      confidence: 70,
      thesis: `Stochastic rising: %K=${r8(curK)} > %D=${r8(curD)}, momentum confirmed`,
    };
  }

  return null;
}

/* ─── CCI Detector (DetectionId 8) ────────────────────────────────────────── */

/**
 * CCI buy signal detection.
 *
 * Conditions (any of the following):
 *  A) CCI crosses above -100 (exiting oversold territory) with price > MA7
 *  B) CCI crosses above 0 (momentum turns positive)
 *
 * Confidence: 80 for -100 cross, 90 for 0 cross (stronger signal).
 */
function detectCCI(
  cciVals: (number | null)[],
  close: number[],
  base: DetectionBase,
  i: number,
): CoinlegsDetection | null {
  if (i < 1) return null;
  if (cciVals[i] === null || cciVals[i - 1] === null) return null;

  const curCci = cciVals[i]!;
  const prevCci = cciVals[i - 1]!;

  // Check price above MA7 for Condition A
  const ma7Vals = sma(close, 7);
  const priceAboveMa7 = i >= 6 && ma7Vals[i] !== null && close[i] > ma7Vals[i]!;

  // Condition A: CCI crosses above -100 (exiting oversold)
  if (prevCci <= -100 && curCci > -100 && priceAboveMa7) {
    return {
      indicatorName: INDICATOR_META[8].name,
      indicatorShortName: INDICATOR_META[8].shortName,
      typeId: 8,
      ...base,
      confidence: 80,
      thesis: `CCI crossed above -100 (exiting oversold) with price above MA7`,
    };
  }

  // Condition B: CCI crosses above 0 (stronger momentum shift)
  if (prevCci <= 0 && curCci > 0) {
    return {
      indicatorName: INDICATOR_META[8].name,
      indicatorShortName: INDICATOR_META[8].shortName,
      typeId: 8,
      ...base,
      confidence: 90,
      thesis: "CCI crossed above 0 (positive momentum confirmed)",
    };
  }

  return null;
}

/* ─── Ichimoku Detector (DetectionId 46) ──────────────────────────────────── */

/**
 * Ichimoku buy signal detection.
 *
 * Conditions (any of the following):
 *  A) Price crosses above Kumo cloud — the current cloud ceiling
 *     (max of Senkou Span A and B projected to current bar)
 *  B) Tenkan-sen crosses above Kijun-sen AND price above cloud
 *  C) Chikou Span crosses above price from below (lagging confirmation)
 *
 * The cloud at index i is formed by senkouSpanA[i-26] and senkouSpanB[i-26]
 * (computed 26 bars ago, effective now).  For candle-based detection we check
 * the cloud that was projected 26 bars back.
 */
function detectIchimoku(
  ichi: ReturnType<typeof ichimoku>,
  close: number[],
  base: DetectionBase,
  i: number,
): CoinlegsDetection | null {
  const { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan } = ichi;
  if (i < 52) return null; // need at least 52 candles for cloud projection

  // The cloud at current candle i is formed by spans computed 26 bars ago
  const cloudIdx = i - 26;
  const spanA = senkouSpanA[cloudIdx];
  const spanB = senkouSpanB[cloudIdx];
  const cloudTop = spanA !== null && spanB !== null ? Math.max(spanA, spanB) : null;
  const cloudBottom = spanA !== null && spanB !== null ? Math.min(spanA, spanB) : null;

  // Condition A: Price crosses above Kumo cloud ceiling
  if (cloudTop !== null && cloudBottom !== null && i >= 1) {
    const prevClose = close[i - 1];
    const curClose = close[i];
    const prevCloudTop = (() => {
      const a = senkouSpanA[cloudIdx - 1];
      const b = senkouSpanB[cloudIdx - 1];
      return a !== null && b !== null ? Math.max(a, b) : null;
    })();

    if (prevCloudTop !== null && prevClose <= prevCloudTop && curClose > cloudTop) {
      return {
        indicatorName: INDICATOR_META[46].name,
        indicatorShortName: INDICATOR_META[46].shortName,
        typeId: 46,
        ...base,
        confidence: 85,
        thesis: `Price crossed above Kumo cloud (cloud top=${r8(cloudTop)})`,
      };
    }
  }

  // Condition B: Tenkan-sen crosses above Kijun-sen AND price above cloud
  if (
    i >= 1 &&
    tenkanSen[i] !== null && kijunSen[i] !== null &&
    tenkanSen[i - 1] !== null && kijunSen[i - 1] !== null
  ) {
    const tkCross =
      tenkanSen[i - 1]! <= kijunSen[i - 1]! &&
      tenkanSen[i]! > kijunSen[i]!;

    const priceAboveCloud =
      cloudTop !== null && close[i] > cloudTop;

    if (tkCross && priceAboveCloud) {
      return {
        indicatorName: INDICATOR_META[46].name,
        indicatorShortName: INDICATOR_META[46].shortName,
        typeId: 46,
        ...base,
        confidence: 90,
        thesis: "Tenkan-sen crossed above Kijun-sen with price above Kumo cloud",
      };
    }
  }

  // Condition C: Chikou Span crosses above price (lagging confirmation)
  // chikouSpan[i] = close[i]; compare against close[i-26] (price 26 bars ago)
  if (i >= 27 && chikouSpan[i] !== null && chikouSpan[i - 1] !== null) {
    const curChikou = close[i]; // chikouSpan[i] = close[i]
    const prevChikou = close[i - 1];
    const priceThen = close[i - 26]; // the price at the visual position
    const priceThenPrev = close[i - 27];

    if (prevChikou <= priceThenPrev && curChikou > priceThen) {
      return {
        indicatorName: INDICATOR_META[46].name,
        indicatorShortName: INDICATOR_META[46].shortName,
        typeId: 46,
        ...base,
        confidence: 75,
        thesis: "Chikou Span crossed above price (lagging confirmation)",
      };
    }
  }

  return null;
}

/* ─── Trend Reversal Detector (DetectionId 7) ─────────────────────────────── */

/**
 * Trend Reversal buy signal detection.
 *
 * Conditions (any of the following):
 *  A) MA7 crosses above MA25 (short-term momentum shift)
 *  B) MA25 crosses above MA99 with volume above MA20 (medium-term trend shift)
 *  C) Price breaks above 20-period high with volume > 1.5x volume MA (breakout)
 */
function detectTrendReversal(
  mas: {
    ma7: (number | null)[];
    ma25: (number | null)[];
    ma99: (number | null)[];
  },
  data: {
    close: number[];
    high: number[];
    volume: number[];
  },
  base: DetectionBase,
  i: number,
): CoinlegsDetection | null {
  const { ma7, ma25, ma99 } = mas;
  const { close, high, volume } = data;

  if (i < 1) return null;

  // Condition A: MA7 crosses above MA25
  if (
    ma7[i] !== null && ma25[i] !== null &&
    ma7[i - 1] !== null && ma25[i - 1] !== null
  ) {
    if (ma7[i - 1]! <= ma25[i - 1]! && ma7[i]! > ma25[i]!) {
      return {
        indicatorName: INDICATOR_META[7].name,
        indicatorShortName: INDICATOR_META[7].shortName,
        typeId: 7,
        ...base,
        confidence: 75,
        thesis: "MA7 crossed above MA25 (short-term momentum shift)",
      };
    }
  }

  // Condition B: MA25 crosses above MA99 with volume expansion
  if (
    i >= 99 &&
    ma25[i] !== null && ma99[i] !== null &&
    ma25[i - 1] !== null && ma99[i - 1] !== null
  ) {
    const volumeMa = sma(volume, 20);
    const volExpanded =
      volumeMa[i] !== null && volume[i] > volumeMa[i]!;

    if (
      ma25[i - 1]! <= ma99[i - 1]! &&
      ma25[i]! > ma99[i]! &&
      volExpanded
    ) {
      return {
        indicatorName: INDICATOR_META[7].name,
        indicatorShortName: INDICATOR_META[7].shortName,
        typeId: 7,
        ...base,
        confidence: 85,
        thesis: "MA25 crossed above MA99 with volume expansion (medium-term trend shift)",
      };
    }
  }

  // Condition C: Price breaks above 20-period high with volume surge
  if (i >= 20) {
    // 20-period highest high (excluding current)
    let periodHigh = high[i - 1];
    for (let j = i - 20; j < i; j++) {
      if (high[j] > periodHigh) periodHigh = high[j];
    }

    const volumeMa20Vals = sma(volume, 20);
    const prevClose = close[i - 1];
    const curClose = close[i];
    const volOk =
      volumeMa20Vals[i] !== null &&
      volume[i] > volumeMa20Vals[i]! * 1.5;

    if (
      prevClose <= periodHigh &&
      curClose > periodHigh &&
      volOk
    ) {
      return {
        indicatorName: INDICATOR_META[7].name,
        indicatorShortName: INDICATOR_META[7].shortName,
        typeId: 7,
        ...base,
        confidence: 80,
        thesis: `Price broke above ${r8(periodHigh)} (20-bar high) with ${r8(volume[i] / (volumeMa20Vals[i]!))}x volume`,
      };
    }
  }

  return null;
}
