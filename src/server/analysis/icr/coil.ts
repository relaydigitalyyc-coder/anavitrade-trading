import type { EnrichedCandle, IcrConfig, CoilConfig, CoilResult } from "../types";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function clipScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function percentileRank(values: number[], current: number): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0 || !Number.isFinite(current)) return 50;
  const count = clean.filter((v) => v <= current).length;
  return (count / clean.length) * 100;
}

function linearSlope(values: number[]): number {
  const pts = values
    .map((v, idx) => ({ y: v, x: idx }))
    .filter((p) => Number.isFinite(p.y));
  if (pts.length < 3) return 0;

  const n = pts.length;
  const xMean = pts.reduce((s, p) => s + p.x, 0) / n;
  const yMean = pts.reduce((s, p) => s + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - xMean) * (p.y - yMean);
    den += (p.x - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

function safeDiv(num: number, den: number, defaultVal: number = 0): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-12)
    return defaultVal;
  return num / den;
}

function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Score a single candle for HTF coil / coiling-pump readiness.
 *
 * 11 weighted components — same logic as the Python
 * `score_coil_row()` in `icr_strategy/icr/coiling_pump.py`.
 */
export function scoreCoil(
  candles: EnrichedCandle[],
  i: number,
  cfg: CoilConfig,
): CoilResult {
  // The Python code uses percentile_lookback=180 and lookback=30.
  // Since our CoilConfig doesn't expose percentile_lookback, we approximate
  // it as 3x the configured lookback.
  const percentileLookback = cfg.lookback * 3;
  const start = Math.max(0, i - percentileLookback);
  const recentStart = Math.max(0, i - cfg.lookback + 1);

  const hist = candles.slice(start, i);
  const recent = candles.slice(recentStart, i + 1);

  if (
    hist.length < Math.max(60, cfg.lookback * 2) ||
    recent.length < cfg.lookback
  ) {
    return { score: 0, grade: "insufficient_history", components: {} };
  }

  const candle = candles[i];
  const close = candle.close;
  const atr = candle.atr14;
  const bb = candle.bbWidth;

  /* ── Percentile-based ───────────────────────────────────────────── */

  const atrRank = percentileRank(
    hist.map((c) => c.atr14),
    atr,
  );
  const bbRank = percentileRank(
    hist.map((c) => c.bbWidth),
    bb,
  );

  /* ── 1. Range contraction (16 %) ─────────────────────────────────── */
  const currentRange = recent.reduce((s, c) => s + c.range, 0) / recent.length;
  const longRange = median(hist.map((c) => c.range));
  const rangeRatio = safeDiv(currentRange, longRange, 1.0);
  const rangeContraction = clipScore(
    (1.0 - Math.min(rangeRatio, 1.5) / 1.5) * 100.0,
  );

  /* ── 2. ATR contraction (14 %) ───────────────────────────────────── */
  const atrContraction = clipScore(100.0 - atrRank);

  /* ── 3. BB squeeze (14 %) ────────────────────────────────────────── */
  const bbSqueeze = clipScore(100.0 - bbRank);

  /* ── 4. Volume dry-up (12 %) ─────────────────────────────────────── */
  const volMa20 = candle.volumeMa20;
  const longVol = median(hist.map((c) => c.volume));
  const volRatio = safeDiv(volMa20, longVol, 1.0);
  const volumeDryUp = clipScore(
    ((1.25 - Math.min(volRatio, 1.25)) / 1.25) * 100.0,
  );

  /* ── 5. Higher lows (12 %) ───────────────────────────────────────── */
  const lowSlope = linearSlope(recent.map((c) => c.low));
  const highSlope = linearSlope(recent.map((c) => c.high));
  const priceScale = Math.max(close, 1e-12);
  const higherLows = clipScore(
    50.0 + 5000.0 * safeDiv(lowSlope, priceScale, 0.0),
  );

  /* ── 6. High pressure (8 %) ──────────────────────────────────────── */
  const highPressure =
    lowSlope > 0
      ? clipScore(
          60.0 -
            5000.0 *
              safeDiv(Math.abs(Math.max(highSlope, 0.0)), priceScale, 0.0),
        )
      : 25.0;

  /* ── 7. MA context (10 %) ────────────────────────────────────────── */
  const ma7 = candle.ma7;
  const ma25 = candle.ma25;
  const ma99 = candle.ma99;
  const ma25Slope = candle.ma25Slope;

  let maContext = 0;
  if (Number.isFinite(ma7) && Number.isFinite(ma25) && Number.isFinite(ma99)) {
    if (close >= ma25 && ma7 >= ma25 && ma25 >= ma99) {
      maContext = 90;
    } else if (close >= ma25 && ma25Slope >= 0) {
      maContext = 72;
    } else if (close >= ma99) {
      maContext = 55;
    } else {
      maContext = 25;
    }
  }

  /* ── 8. MA squeeze (5 %) ─────────────────────────────────────────── */
  const effectiveAtr = atr > 0 ? atr : 1e-12;
  const maSqueeze = Math.abs(ma7 - ma25) / effectiveAtr;
  const maSqueezeScore = clipScore(
    100.0 - (Math.min(maSqueeze, 3.0) / 3.0) * 100.0,
  );

  /* ── 9. Near MA25 (4 %) ───────────────────────────────────────────── */
  const ma25DistAtr = Math.abs(close - ma25) / effectiveAtr;
  const nearMa25Score = clipScore(
    100.0 - (Math.min(ma25DistAtr, 3.0) / 3.0) * 100.0,
  );

  /* ── 10. Liquidity overhead (3 %) ──────────────────────────────────── */
  const priorHigh = Math.max(
    ...candles.slice(Math.max(0, i - 90), i).map((c) => c.high),
  );
  const distToHigh = safeDiv(priorHigh - close, close, NaN);

  let liquidityOverhead = 0;
  if (Number.isFinite(distToHigh)) {
    if (distToHigh >= 0.01 && distToHigh <= 0.22) {
      liquidityOverhead = 90 - Math.abs(distToHigh - 0.08) * 180;
    } else if (distToHigh >= 0.0 && distToHigh < 0.01) {
      liquidityOverhead = 60;
    } else if (distToHigh > 0.22) {
      liquidityOverhead = 35;
    } else {
      liquidityOverhead = 45;
    }
  }
  liquidityOverhead = clipScore(liquidityOverhead);

  /* ── 11. Reclaim readiness (2 %) ──────────────────────────────────── */
  const compressionHigh = Math.max(...recent.map((c) => c.high));
  const reclaimDistance = safeDiv(compressionHigh - close, close, 1.0);
  let reclaimReadiness = clipScore(
    100.0 - (Math.min(Math.max(reclaimDistance, 0), 0.08) / 0.08) * 100.0,
  );
  if (close > compressionHigh * 0.995) {
    reclaimReadiness = Math.max(reclaimReadiness, 82);
  }

  /* ── Weighted composite ──────────────────────────────────────────── */
  const baseScore =
    0.16 * rangeContraction +
    0.14 * atrContraction +
    0.14 * bbSqueeze +
    0.12 * volumeDryUp +
    0.12 * higherLows +
    0.08 * highPressure +
    0.1 * maContext +
    0.05 * maSqueezeScore +
    0.04 * nearMa25Score +
    0.03 * liquidityOverhead +
    0.02 * reclaimReadiness;

  const score = clipScore(baseScore);

  const grade =
    score >= 85 ? "A+" : score >= 78 ? "A" : score >= 70 ? "B" : score >= 60 ? "watch" : "ignore";

  return {
    score: round3(score),
    grade,
    components: {
      rangeContraction: round3(rangeContraction),
      atrContraction: round3(atrContraction),
      bbSqueeze: round3(bbSqueeze),
      volumeDryUp: round3(volumeDryUp),
      higherLows: round3(higherLows),
      highPressure: round3(highPressure),
      maContext: round3(maContext),
      maSqueezeScore: round3(maSqueezeScore),
      nearMa25Score: round3(nearMa25Score),
      liquidityOverhead: round3(liquidityOverhead),
      reclaimReadiness: round3(reclaimReadiness),
    },
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Return a new candle array with `coilScore` and `coilGrade` populated on
 * every candle that has sufficient history for a meaningful score.
 *
 * Candles before the warmup period are returned unchanged.
 */
export function annotateWithCoilScores(
  candles: EnrichedCandle[],
  _cfg: IcrConfig,
  coilCfg: CoilConfig,
): EnrichedCandle[] {
  // Start scoring once we have enough history for the percentile lookback.
  const warmupNeeded = coilCfg.lookback * 4;

  return candles.map((candle, i) => {
    if (i < warmupNeeded) return candle;

    const result = scoreCoil(candles, i, coilCfg);
    if (result.grade === "insufficient_history") return candle;

    return {
      ...candle,
      coilScore: result.score,
      coilGrade: result.grade,
    };
  });
}
