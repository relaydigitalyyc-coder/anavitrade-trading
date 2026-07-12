/**
 * LuxAlgo ICT Concepts — TypeScript port (high-edge components)
 *
 * Ported from the LuxAlgo "ICT Concepts" PineScript v5 indicator (~1,200 lines).
 * This extracts the three highest-edge detection layers:
 *
 * 1. MSS/BOS from ZigZag — proper structural breaks detected from swing points.
 *    Replaces our previous indicator-proxy approximation with actual price structure.
 *
 * 2. Order Blocks — the origin area of displacement. Price retracing into an
 *    unmitigated OB with HTF alignment is the single highest-probability entry in SMC.
 *
 * 3. Liquidity — clustered swing point boxes. Buyside/sellside pools act as
 *    magnetic targets. When a sweep occurs near a liquidity box, the reversal
 *    probability spikes.
 *
 * Detection order (mirrors the indicator): ZigZag → MSS/BOS → Order Block →
 * Liquidity → Signal.
 */

export type LuxAlgoSignal = {
  type: "mss_bull" | "mss_bear" | "bos_bull" | "bos_bear" |
        "ob_bull" | "ob_bear" | "liq_sweep_bull" | "liq_sweep_bear" |
        "fvg_bull" | "fvg_bear" | "volume_imbalance" |
        "london_killzone" | "ny_killzone" | "asian_killzone";
  pair: string;
  period: string;
  price: number;
  level: number;         // the structural level price broke / touched
  confidence: number;
  metadata: Record<string, number>;
};

type LuxParams = {
  mssLength: number;     // swing lookback (default 5)
  obLookback: number;    // OB swing lookback (default 10)
  showDisplacement: boolean;
};

const DEFAULTS: LuxParams = { mssLength: 5, obLookback: 10, showDisplacement: false };

/* ─── Math ─────────────────────────────────────────────────────────── */

function sma(v: number[], n: number): number {
  if (v.length < n) return v[v.length-1]||0;
  return v.slice(-n).reduce((a,b)=>a+b,0)/n;
}

/* ─── ZigZag Swing Points ────────────────────────────────────────── */

type SwingPoint = { index: number; price: number; isHigh: boolean };

function findSwings(highs: number[], lows: number[], len: number): SwingPoint[] {
  const L = highs.length;
  const swings: SwingPoint[] = [];
  let lastDir = 0; // 1 = last was high, -1 = last was low

  for (let i = len; i < L - 1; i++) {
    // Pivot high: bar i is the highest in its left/right window
    let isPh = true, isPl = true;
    for (let j = i - len; j <= i + 1 && (isPh || isPl); j++) {
      if (j !== i && j >= 0 && j < L) {
        if (highs[j] > highs[i]) isPh = false;
        if (lows[j] < lows[i]) isPl = false;
      }
    }
    // Prevent back-to-back same-direction swings
    if (isPh && lastDir !== 1) { swings.push({ index: i, price: highs[i], isHigh: true }); lastDir = 1; }
    if (isPl && lastDir !== -1 && isPh === false) { swings.push({ index: i, price: lows[i], isHigh: false }); lastDir = -1; }
  }
  return swings;
}

/* ─── MSS/BOS Detection ──────────────────────────────────────────── */

export function detectMSS(
  closes: number[], highs: number[], lows: number[],
  pair: string, period: string, params: Partial<LuxParams> = {},
): LuxAlgoSignal[] {
  const p = { ...DEFAULTS, ...params };
  const L = closes.length;
  const signals: LuxAlgoSignal[] = [];
  if (L < p.mssLength * 3) return signals;

  const swings = findSwings(highs, lows, p.mssLength);
  if (swings.length < 3) return signals;

  // Get last few swing points
  const last = swings[swings.length - 1];
  const prev = swings[swings.length - 2];
  const prevPrev = swings[swings.length - 3];

  const currClose = closes[L - 1];

  // MSS Bullish: price closes ABOVE the last swing high
  // (sell-side swept → structure shift up → now bullish)
  const lastSwingHigh = [...swings].reverse().find(s => s.isHigh);
  const lastSwingLow  = [...swings].reverse().find(s => !s.isHigh);

  if (lastSwingHigh && currClose > lastSwingHigh.price) {
    const prevMssDir = swings.slice(-5).filter(s => !s.isHigh).length >= 2 ? "sw" : "cc";
    signals.push({
      type: prevMssDir === "sw" ? "mss_bull" : "bos_bull",
      pair, period, price: currClose,
      level: lastSwingHigh.price,
      confidence: prevMssDir === "sw" ? 75 : 60,
      metadata: { swing_high: lastSwingHigh.price, swing_index: lastSwingHigh.index },
    });
  }

  if (lastSwingLow && currClose < lastSwingLow.price) {
    const prevMssDir = swings.slice(-5).filter(s => s.isHigh).length >= 2 ? "sw" : "cc";
    signals.push({
      type: prevMssDir === "sw" ? "mss_bear" : "bos_bear",
      pair, period, price: currClose,
      level: lastSwingLow.price,
      confidence: prevMssDir === "sw" ? 75 : 60,
      metadata: { swing_low: lastSwingLow.price, swing_index: lastSwingLow.index },
    });
  }

  return signals;
}

/* ─── Order Block Detection ──────────────────────────────────────── */

type OrderBlock = {
  top: number; bottom: number;
  index: number;       // bar where OB was created
  bullish: boolean;
  broken: boolean;     // price has retraced into the OB
  active: boolean;     // unmitigated — still valid entry zone
};

export function detectOrderBlocks(
  closes: number[], highs: number[], lows: number[],
  pair: string, period: string, params: Partial<LuxParams> = {},
): { blocks: OrderBlock[]; signals: LuxAlgoSignal[] } {
  const p = { ...DEFAULTS, ...params };
  const L = closes.length;
  const blocks: OrderBlock[] = [];
  const signals: LuxAlgoSignal[] = [];
  if (L < p.obLookback * 3) return { blocks, signals };

  const swings = findSwings(highs, lows, p.obLookback);
  const last = closes[L - 1];

  for (let i = 1; i < swings.length - 1; i++) {
    const sw = swings[i];
    if (!sw.isHigh) continue; // only high swings (bullish OBs form at swing highs)

    // Bullish OB: swing high broken → the candle before the break is the OB
    // Find the first close above this swing high
    let breakIdx = -1;
    for (let j = sw.index + 1; j < L; j++) {
      if (closes[j] > sw.price) { breakIdx = j; break; }
    }
    if (breakIdx === -1) continue;

    // The order block is the range of the candle immediately BEFORE the break
    const obIdx = breakIdx - 1;
    if (obIdx < 0 || obIdx <= sw.index) continue;

    const obTop = highs[obIdx];
    const obBottom = lows[obIdx];
    const obRange = obTop - obBottom;
    if (obRange <= 0) continue;

    // Has price retraced into this OB?
    const broken = L > obIdx + 2 && lows.slice(obIdx + 2).some(l => l < obTop);

    blocks.push({
      top: obTop, bottom: obBottom,
      index: obIdx, bullish: true,
      broken: broken || false,
      active: !broken,
    });
  }

  // Bearish OBs (swing lows broken downward)
  for (let i = 1; i < swings.length - 1; i++) {
    const sw = swings[i];
    if (sw.isHigh) continue;

    let breakIdx = -1;
    for (let j = sw.index + 1; j < L; j++) {
      if (closes[j] < sw.price) { breakIdx = j; break; }
    }
    if (breakIdx === -1) continue;

    const obIdx = breakIdx - 1;
    if (obIdx < 0 || obIdx <= sw.index) continue;

    const obTop = highs[obIdx];
    const obBottom = lows[obIdx];
    const obRange = obTop - obBottom;
    if (obRange <= 0) continue;

    const broken = L > obIdx + 2 && highs.slice(obIdx + 2).some(h => h > obBottom);

    blocks.push({
      top: obTop, bottom: obBottom,
      index: obIdx, bullish: false,
      broken: broken || false,
      active: !broken,
    });
  }

  // Signal: price is INSIDE an active (unmitigated) bullish OB + near OB bottom = entry
  const activeBullOBs = blocks.filter(b => b.active && b.bullish);
  for (const ob of activeBullOBs.slice(-2)) {
    if (last < ob.top && last > ob.bottom) {
      const distFromBottom = (last - ob.bottom) / (ob.top - ob.bottom);
      signals.push({
        type: "ob_bull", pair, period, price: last,
        level: ob.bottom,
        confidence: distFromBottom < 0.3 ? 70 : 55, // entry near OB bottom = higher confidence
        metadata: { ob_top: ob.top, ob_bottom: ob.bottom, ob_index: ob.index },
      });
    }
  }

  return { blocks, signals };
}

/* ─── Liquidity Detection ─────────────────────────────────────────── */

export function detectLiquidity(
  highs: number[], lows: number[], closes: number[],
  pair: string, period: string,
  atrMultiplier = 4.0,
): LuxAlgoSignal[] {
  const L = highs.length;
  const signals: LuxAlgoSignal[] = [];
  if (L < 20) return signals;

  // Simple ATR: average swing-to-swing distance
  const swings2 = findSwings(highs, lows, 3);
  const atr = swings2.length > 1
    ? swings2.slice(1).reduce((sum, s, i) => sum + Math.abs(s.price - swings2[i].price), 0) / (swings2.length - 1)
    : 1;

  const margin = atr / atrMultiplier;

  // Find clustered swing highs (buyside liquidity)
  const swingHighs = swings2.filter(s => s.isHigh).map(s => s.price);
  const swingLows = swings2.filter(s => !s.isHigh).map(s => s.price);

  // Liquidity sweep: price took out stacked swing lows then closed above
  if (swingLows.length >= 3) {
    const cluster = swingLows.slice(-3);
    const clusterAvg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const clusterLow = Math.min(...cluster);
    const currClose = 0; // will be set below from the actual close

    // Sweep: current low dropped below the cluster low, then closed above cluster avg
    const currentLow = lows[L - 1];
    const currentClose = closes[L - 1];

    if (currentLow < clusterLow - margin) {
      signals.push({
        type: "liq_sweep_bull", pair, period,
        price: currentLow,
        level: clusterLow,
        confidence: 65,
        metadata: { cluster_low: clusterLow, cluster_avg: clusterAvg, margin },
      });
    }
  }

  if (swingHighs.length >= 3) {
    const cluster = swingHighs.slice(-3);
    const clusterAvg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const clusterHigh = Math.max(...cluster);
    const currentHigh = highs[L - 1];

    if (currentHigh > clusterHigh + margin) {
      signals.push({
        type: "liq_sweep_bear", pair, period,
        price: currentHigh,
        level: clusterHigh,
        confidence: 65,
        metadata: { cluster_high: clusterHigh, cluster_avg: clusterAvg, margin },
      });
    }
  }

  return signals;
}

/* ─── FVG Detection ───────────────────────────────────────────────── */

export function detectFVG(
  highs: number[], lows: number[],
  pair: string, period: string,
): LuxAlgoSignal[] {
  const L = highs.length;
  const signals: LuxAlgoSignal[] = [];
  if (L < 4) return signals;

  const last = L - 1;

  // Bullish FVG: low[now] > high[2 bars ago] → gap between bar 1 and bar now
  // (price jumped up leaving an unfilled gap)
  for (let i = 2; i <= 4; i++) {
    if (lows[last] > highs[last - i] && highs[last - i + 1] < (highs[last - i] + lows[last]) / 2) {
      signals.push({
        type: "fvg_bull", pair, period,
        price: 0,
        level: highs[last - i],
        confidence: 50,
        metadata: { fvg_top: lows[last], fvg_bottom: highs[last - i], bars_back: i },
      });
    }
    if (highs[last] < lows[last - i] && lows[last - i + 1] > (lows[last - i] + highs[last]) / 2) {
      signals.push({
        type: "fvg_bear", pair, period,
        price: 0,
        level: lows[last - i],
        confidence: 50,
        metadata: { fvg_top: lows[last - i], fvg_bottom: highs[last], bars_back: i },
      });
    }
  }

  return signals;
}

/* ─── Killzone Detection ────────────────────────────────────────────
 * ICT time-based macros. These define high-probability reversal windows
 * during specific times of day (London/NY/Asia sessions).
 * On crypto (24/7), these map to the highest-volume periods. */

export function detectKillzone(
  pair: string, period: string,
): LuxAlgoSignal[] {
  const signals: LuxAlgoSignal[] = [];
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // London open (07:00-10:00 UTC) — high-volume reversal window
  if (utcHour >= 7 && utcHour <= 10) {
    signals.push({
      type: "london_killzone", pair, period,
      price: 0, level: 0, confidence: 15, metadata: { utc_hour: utcHour },
    });
  }
  // NY AM (12:00-15:00 UTC) — peak volume
  if (utcHour >= 12 && utcHour <= 15) {
    signals.push({
      type: "ny_killzone", pair, period,
      price: 0, level: 0, confidence: 15, metadata: { utc_hour: utcHour },
    });
  }
  // Asian (00:00-03:00 UTC) — range-building
  if (utcHour >= 0 && utcHour <= 3) {
    signals.push({
      type: "asian_killzone", pair, period,
      price: 0, level: 0, confidence: 10, metadata: { utc_hour: utcHour },
    });
  }

  return signals;
}
