/**
 * Bollinger Bands + Awesome Oscillator — BBAWE R1.1 by JustUncleL
 * Ported from PineScript v4 → TypeScript for direct kline computation.
 *
 * Strategy: Bollinger squeeze (volatility contraction → expansion) confirmed
 * by Awesome Oscillator momentum and EMA-breakout timing.  Catches swing lows
 * and highs with high-edge entries at structural turning points.
 *
 * Best on: 1h, 4h | Volatile trending markets | Binance USDT altcoins
 * NOT for: sideways/chop markets (BB squeeze filter gates these out)
 *
 * Buy signal:
 *   1. Fast EMA (3) crosses ABOVE Bollinger middle band (20 EMA/SMA)
 *   2. Close > basis
 *   3. Awesome Oscillator is positive AND rising (state = 1)
 *   4. Close stays below upper BB (price still inside the channel)
 *   5. BB squeeze active (volatility in lowest 50% of recent range)
 *
 * Sell signal: inverse (fast EMA crosses below basis, AO negative+falling)
 */

export type BbaweSignal = {
  signal: "buy" | "sell";
  pair: string;
  period: string;
  price: number;         // entry price (candle close)
  bbUpper: number;       // upper Bollinger band
  bbBasis: number;       // middle band (20 EMA/SMA)
  bbLower: number;       // lower band
  bbSqueezePct: number;  // current BB width as % of average (0-100, lower = tighter)
  aoValue: number;       // Awesome Oscillator raw value
  aoState: number;       // 1=up+positive, 2=up+declining, -1=down+negative, -2=down+rising
  fastEma: number;       // EMA(3) value
  candlesSinceSqueeze: number; // how many candles ago squeeze was active
};

export type BbaweParams = {
  bbLength: number;       // Bollinger period (default 20)
  bbMultiplier: number;   // BB standard deviation multiplier (default 2.0)
  bbUseEma: boolean;      // use EMA instead of SMA for BB basis (default false)
  fastEmaLen: number;     // fast EMA period (default 3)
  aoSlowLen: number;      // Awesome slow MA period (default 34)
  aoFastLen: number;      // Awesome fast MA period (default 5)
  squeezeLen: number;     // lookback for relative BB width (default 100)
  squeezeThreshold: number; // percentile threshold for squeeze signal (default 50)
  requireSqueeze: boolean; // must squeeze be active? (default true)
  requireInsideBB: boolean; // must close stay inside BB? (default true)
};

const DEFAULTS: BbaweParams = {
  bbLength: 20,
  bbMultiplier: 2.0,
  bbUseEma: false,
  fastEmaLen: 3,
  aoSlowLen: 34,
  aoFastLen: 5,
  squeezeLen: 100,
  squeezeThreshold: 50,
  requireSqueeze: true,
  requireInsideBB: true,
};

/* ─── Math helpers ─────────────────────────────────────────────────── */

function sma(values: number[], window: number): number {
  if (values.length < window) return values[values.length - 1] || 0;
  return values.slice(-window).reduce((a, b) => a + b, 0) / window;
}

function ema(series: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [series[0]];
  for (let i = 1; i < series.length; i++) {
    result.push(series[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function stdev(values: number[], window: number): number {
  const avg = sma(values, window);
  const squaredDiffs = values.slice(-window).map(v => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / window);
}

/* ─── Core detector ────────────────────────────────────────────────── */

export function detectBbawe(
  closes: number[], highs: number[], lows: number[], pair: string, period: string,
  params: Partial<BbaweParams> = {},
): BbaweSignal | null {
  const p = { ...DEFAULTS, ...params };
  const len = closes.length;
  const minLen = Math.max(p.bbLength, p.aoSlowLen, p.squeezeLen) + 3;
  if (len < minLen) return null;

  const last = len - 1;
  const prev = len - 2;

  // ── Bollinger Bands ──
  // In PineScript: bb_basis uses either ema or sma, bb_source = close
  const bbBasisArr = p.bbUseEma ? ema(closes, p.bbLength) : closes.map((_, i) => sma(closes.slice(0, i+1), p.bbLength));
  const bbBasisCurr = bbBasisArr[last];
  const bbBasisPrev = bbBasisArr[prev];
  const bbDev = p.bbMultiplier * stdev(closes, p.bbLength);
  const bbUpper = bbBasisCurr + bbDev;
  const bbLower = bbBasisCurr - bbDev;

  // ── Fast EMA ──
  const fastEmaArr = ema(closes, p.fastEmaLen);
  const fastEmaCurr = fastEmaArr[last];
  const fastEmaPrev = fastEmaArr[prev];

  // ── Crossover detection ──
  const crossedUp = fastEmaPrev <= bbBasisPrev && fastEmaCurr > bbBasisCurr;   // EMA crosses ABOVE basis
  const crossedDown = fastEmaPrev >= bbBasisPrev && fastEmaCurr < bbBasisCurr; // EMA crosses BELOW basis

  // ── Awesome Oscillator ──
  const hl2 = closes.map((c, i) => (highs[i] + lows[i]) / 2);
  const aoFast = closes.map((_, i) => sma(hl2.slice(0, i+1), p.aoFastLen));
  const aoSlow = closes.map((_, i) => sma(hl2.slice(0, i+1), p.aoSlowLen));
  const aoCurr = aoFast[last] - aoSlow[last];
  const aoPrev = aoFast[prev] - aoSlow[prev];

  // PineScript AO state: 1=up+positive, 2=up+declining, -1=down+negative, -2=down+rising
  let aoState = 0;
  if (aoCurr >= 0) {
    aoState = aoCurr > aoPrev ? 1 : 2;
  } else {
    aoState = aoCurr > aoPrev ? -1 : -2;
  }

  // ── BB Spread / Squeeze ──
  const spread = bbUpper - bbLower;
  const spreadArr = closes.map((_, i) => {
    const d = p.bbMultiplier * stdev(closes.slice(0, i+1), p.bbLength);
    return 2 * d;
  });
  const avgSpread = sma(spreadArr, p.squeezeLen);
  const bbSqueezePct = avgSpread > 0 ? (spread / avgSpread) * 100 : 100;
  const isSqueeze = bbSqueezePct < p.squeezeThreshold;

  // ── Signal logic ──
  const closeInsideBB = closes[last] < bbUpper && closes[last] > bbLower;

  // Buy: EMA cross up + close above basis + AO positive AND rising (state 1)
  // + close inside BB or filter disabled + squeeze active or filter disabled
  const buy = crossedUp
    && closes[last] > bbBasisCurr
    && Math.abs(aoState) === 1 && aoState === 1  // positive + rising
    && (!p.requireInsideBB || closeInsideBB)
    && (!p.requireSqueeze || isSqueeze);

  // Sell: EMA cross down + close below basis + AO negative AND falling (state -1)
  const sell = crossedDown
    && closes[last] < bbBasisCurr
    && Math.abs(aoState) === 1 && aoState === -1  // negative + falling
    && (!p.requireInsideBB || closeInsideBB)
    && (!p.requireSqueeze || isSqueeze);

  if (!buy && !sell) return null;

  return {
    signal: buy ? "buy" : "sell",
    pair,
    period,
    price: closes[last],
    bbUpper, bbBasis: bbBasisCurr, bbLower,
    bbSqueezePct: Math.round(bbSqueezePct * 100) / 100,
    aoValue: Math.round(aoCurr * 1e8) / 1e8,
    aoState,
    fastEma: Math.round(fastEmaCurr * 1e8) / 1e8,
    candlesSinceSqueeze: isSqueeze ? 0 : 1,
  };
}

/* ─── Batch scanner ──────────────────────────────────────────────────
 * Run BBAWE across an array of kline sets and return all active signals. */

export type KlineData = { closes: number[]; highs: number[]; lows: number[]; pair: string; period: string };

export function scanBbawe(klineSets: KlineData[], params?: Partial<BbaweParams>): BbaweSignal[] {
  const results: BbaweSignal[] = [];
  for (const k of klineSets) {
    if (k.closes.length < 20) continue;
    const sig = detectBbawe(k.closes, k.highs, k.lows, k.pair, k.period, params);
    if (sig) results.push(sig);
  }
  return results;
}
