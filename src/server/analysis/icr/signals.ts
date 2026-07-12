import type { EnrichedCandle, IcrConfig, UnifiedSignal } from "../types";
import type { Direction } from "./structure";
import {
  isBullishTrend,
  isBearishTrend,
  findRecentImpulse,
  validPullback,
  detectCompression,
} from "./structure";
import type { Impulse, Compression } from "./structure";

/* ─── Private helpers ────────────────────────────────────────────────────── */

/**
 * Rate the volume confirmation on the trigger candle against a baseline
 * (typically the compression average volume).
 *
 * Returns 0 (fail), 6, 8, or 10.
 */
function volumeConfirmation(
  candle: EnrichedCandle,
  baselineVolume: number,
): number {
  if (!Number.isFinite(baselineVolume) || baselineVolume <= 0) return 0;
  const volRatio = candle.volume / baselineVolume;
  const volumeZ = candle.volumeZscore;
  if (volRatio >= 1.35 || volumeZ >= 1.5) return 10;
  if (volRatio >= 1.15 || volumeZ >= 1.0) return 8;
  if (volRatio >= 1.0) return 6;
  return 0;
}

/**
 * Check whether the trigger candle decisively reclaims (long) or breaks down
 * (short) through the compression boundary.
 */
function triggerScore(
  candle: EnrichedCandle,
  compression: Compression,
  direction: Direction,
  cfg: IcrConfig,
): { triggered: boolean; score: number } {
  const close = candle.close;
  const ma7 = candle.ma7;
  let level: number;
  let decisive: boolean;

  if (direction === "long") {
    level = Math.max(compression.high, ma7);
    const closePositionOk =
      candle.closePosition >= cfg.candleClosePositionThreshold;
    decisive = close > level && closePositionOk;
  } else {
    level = Math.min(compression.low, ma7);
    const closePositionOk =
      candle.closePosition <= 1.0 - cfg.candleClosePositionThreshold;
    decisive = close < level && closePositionOk;
  }

  if (!decisive) return { triggered: false, score: 0 };

  let score = 10;
  const distance =
    direction === "long" ? close - level : level - close;
  if (candle.atr14 > 0 && distance >= 0.2 * candle.atr14) score += 3;
  if (candle.bodyRatio >= 0.5) score += 2;
  if (candle.displacement >= 1.0) score += 1;

  return { triggered: true, score: Math.min(15, score) };
}

/**
 * Compute the take-profit level and the risk-to-reward ratio.
 *
 * Uses 3 R as the baseline TP multiplier. The TP is also bounded by the
 * impulse extreme and 75 % of the impulse range.
 */
function targets(
  direction: Direction,
  entry: number,
  stop: number,
  impulse: Impulse,
): { takeProfit: number; rr: number } {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return { takeProfit: entry, rr: 0 };

  let takeProfit: number;
  let rr: number;

  if (direction === "long") {
    takeProfit = Math.max(
      impulse.extreme,
      entry + 3.0 * risk,
      entry + 0.75 * impulse.rangeValue,
    );
    rr = (takeProfit - entry) / risk;
  } else {
    takeProfit = Math.min(
      impulse.extreme,
      entry - 3.0 * risk,
      entry - 0.75 * impulse.rangeValue,
    );
    rr = (entry - takeProfit) / risk;
  }

  return { takeProfit, rr };
}

function rrScore(rrValue: number, minRr: number): number {
  if (rrValue < minRr) return 0;
  if (rrValue >= 4.0) return 5;
  if (rrValue >= 3.0) return 4;
  return 3;
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Build a single ICR signal at candle index `i`.
 *
 * Sequential gates (each must pass):
 * 1. Coil gate (optional)        — minCoilScore check + bonus delta
 * 2. Trend gate                  — 20 pts
 * 3. Impulse detection           — 0–20 pts
 * 4. Pullback validation         — 0–15 pts (min 10)
 * 5. Compression detection       — 0–15 pts (min 8)
 * 6. Compression after impulse   — must be sequential
 * 7. Trigger confirmation        — 0–15 pts
 * 8. Volume confirmation         — 6, 8, or 10 pts (0 = fail)
 * 9. Stop / target computation   — RR gate 3–5 pts
 * 10. Composite >= scoreThreshold
 *
 * @param coilScore - Optional pre-computed coil score for the coil gate.
 */
export function buildIcrSignal(
  candles: EnrichedCandle[],
  i: number,
  symbol: string,
  timeframe: string,
  direction: Direction,
  cfg: IcrConfig,
  coilScore?: number,
): UnifiedSignal | null {
  const candle = candles[i];
  if (!candle) return null;

  /* ── 1. Coil gate ──────────────────────────────────────────────────── */
  let coilGateDelta = 0;
  if (cfg.enableCoilGate) {
    if (coilScore === undefined || !Number.isFinite(coilScore)) return null;
    if (coilScore < cfg.minCoilScore) return null;
    coilGateDelta = Math.min(5, Math.round((coilScore - cfg.minCoilScore) / 5));
  }

  /* ── 1b. Momentum-exhaustion entry filter ──────────────────────────────
   * Do NOT chase a move that is already extended. Empirically validated on
   * 326 Tier-A alt trades (forward, runner exit): rejecting longs entered with
   * RSI >= 70 (shorts with RSI <= 30) raised win rate 20.9%->22.7%, avg R
   * +0.84->+1.07, total R +274.8->+292.7, Sharpe 3.47->3.79 — while preserving
   * the fat tail (max winner unchanged at 23.4R). 70/30 was the total-R and
   * Sharpe optimum across a threshold sweep. Market intelligence belongs at
   * ENTRY, not the exit (capping the exit destroys the edge). */
  const entryRsiMax = cfg.entryRsiMax ?? 70;
  const entryRsiMin = cfg.entryRsiMin ?? 30;
  if (Number.isFinite(candle.rsi14)) {
    if (direction === "long" && candle.rsi14 >= entryRsiMax) return null;
    if (direction === "short" && candle.rsi14 <= entryRsiMin) return null;
  }

  /* ── 2. Trend gate (20 pts) ────────────────────────────────────────── */
  const trendOk =
    direction === "long"
      ? isBullishTrend(candles, i, cfg)
      : isBearishTrend(candles, i, cfg);
  if (!trendOk) return null;
  const trendScore = 20;

  /* ── 3. Impulse detection (0–20 pts) ────────────────────────────────── */
  const impulse = findRecentImpulse(candles, i, direction, cfg);
  if (!impulse) return null;

  /* ── 4. Pullback validation (0–15 pts, min 10) ──────────────────────── */
  const pullback = validPullback(candles, i, impulse, cfg);
  if (!pullback.valid) return null;

  /* ── 5. Compression detection (0–15 pts, min 8) ─────────────────────── */
  const compression = detectCompression(candles, i, direction, cfg);
  if (!compression) return null;

  /* ── 6. Compression must resolve after the impulse ──────────────────── */
  if (compression.end <= impulse.end) return null;

  /* ── 7. Trigger confirmation (0–15 pts) ─────────────────────────────── */
  if (!Number.isFinite(candle.atr14) || !Number.isFinite(candle.ma7))
    return null;
  const trigger = triggerScore(candle, compression, direction, cfg);
  if (!trigger.triggered) return null;

  /* ── 8. Volume confirmation (6–10 pts, 0 = fail) ────────────────────── */
  const volumeScore = volumeConfirmation(candle, compression.avgVolume);
  if (volumeScore === 0) return null;

  /* ── 9. Entry, stop, targets & RR score (3–5 pts) ──────────────────── */
  const entry = candle.close;
  const atrBuffer = cfg.stopAtrBuffer * candle.atr14;

  let stop: number;
  if (direction === "long") {
    stop = compression.low - atrBuffer;
    if (stop >= entry) return null;
  } else {
    stop = compression.high + atrBuffer;
    if (stop <= entry) return null;
  }

  const { takeProfit, rr } = targets(direction, entry, stop, impulse);
  if (!Number.isFinite(rr) || rr <= 0) return null;

  const rrScoreVal = rrScore(rr, cfg.minRr);

  /* ── 10. Composite score ────────────────────────────────────────────── */
  const composite =
    trendScore +
    impulse.score +
    pullback.score +
    compression.score +
    trigger.score +
    volumeScore +
    rrScoreVal +
    coilGateDelta;

  if (composite < cfg.scoreThreshold || rr < cfg.minRr) return null;

  const tierA = cfg.tierAThreshold ?? 80;
  const tierB = cfg.tierBThreshold ?? 65;
  const tier: "A" | "B" | "C" =
    composite >= tierA ? "A" : composite >= tierB ? "B" : "C";

  const confidence = Math.min(1, composite / 100);

  const components: Record<string, number> = {
    trend: trendScore,
    impulse: impulse.score,
    pullback: pullback.score,
    compression: compression.score,
    trigger: trigger.score,
    volume: volumeScore,
    rr: rrScoreVal,
    coilBonus: coilGateDelta,
  };

  return {
    source: "icr",
    symbol,
    timeframe,
    direction,
    entry,
    stopLoss: stop,
    takeProfit,
    score: composite,
    tier,
    thesis: `ICR ${direction} on ${symbol} ${timeframe}: trend ${trendScore}, impulse ${impulse.score}, compression ${compression.score}, trigger ${trigger.score}`,
    components,
    structuralScore: composite - volumeScore - rrScoreVal - coilGateDelta,
    confidence,
    timestamp: candle.timestamp,
    metadata: {
      impulseStart: impulse.start,
      impulseEnd: impulse.end,
      compressionStart: compression.start,
      compressionEnd: compression.end,
      coilScore: coilScore ?? null,
      rr,
      // Impulse swing levels for the smart-exit fib engine. The impulse leg is
      // (origin -> extreme) in the trade direction; low/high normalized so
      // swingLow < swingHigh regardless of direction.
      impulseSwingLow: Math.min(impulse.origin, impulse.extreme),
      impulseSwingHigh: Math.max(impulse.origin, impulse.extreme),
    },
  };
}

/**
 * Scan only the most recent candle for valid ICR signals.
 *
 * Used by the analysis engine to avoid re-scanning historical candles
 * and reduce the effective N for multiple-testing correction.
 */
export function findLatestSignals(
  candles: EnrichedCandle[],
  symbol: string,
  timeframe: string,
  cfg: IcrConfig,
): UnifiedSignal[] {
  const signals: UnifiedSignal[] = [];
  const i = candles.length - 1;
  if (i < cfg.slowMa) return signals;

  const coilScore = candles[i].coilScore;
  for (const dir of ["long", "short"] as Direction[]) {
    const sig = buildIcrSignal(candles, i, symbol, timeframe, dir, cfg, coilScore);
    if (sig) signals.push(sig);
  }
  return signals;
}

/**
 * Scan every candle index for valid ICR signals.
 *
 * Starts after `cfg.slowMa` (MA99 warmup) and tests both long and short
 * directions at each position.
 */
export function findSignals(
  candles: EnrichedCandle[],
  symbol: string,
  timeframe: string,
  cfg: IcrConfig,
): UnifiedSignal[] {
  const signals: UnifiedSignal[] = [];
  const startIdx = cfg.slowMa; // ensure MA99 is warm
  for (let i = startIdx; i < candles.length; i++) {
    const coilScore = candles[i].coilScore;
    for (const dir of ["long", "short"] as Direction[]) {
      const sig = buildIcrSignal(candles, i, symbol, timeframe, dir, cfg, coilScore);
      if (sig) signals.push(sig);
    }
  }
  return signals;
}
