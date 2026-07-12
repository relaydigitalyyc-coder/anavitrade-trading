/**
 * Forward-only smart exit engine.
 *
 * Orchestrates trailing stops, recalculated fib-extension take-profits, and
 * data-driven exhaustion detection into a single trade simulation.
 *
 * FORWARD-ONLY GUARANTEE: the simulation walks bars strictly from `entryIdx`
 * forward. Every decision at bar `j` uses only:
 *   - the raw/enriched candle at `j` (its realized OHLC and indicators),
 *   - state accumulated from bars <= j (trail extreme, HA seed, scale-outs).
 * No component ever reads a candle at an index > j. Heikin Ashi and HTF HA are
 * precomputed with their own forward-only guarantees and indexed by `j`.
 */

import type { EnrichedCandle, Kline } from "../types";
import {
  computeHeikinAshi,
  computeHtfHeikinAshi,
  haColorFlipExit,
} from "./heikin-ashi";
import { fibExtensions } from "./fibonacci";
import { detectExhaustion } from "./exhaustion";
import {
  initTrail,
  updateTrail,
  type TrailState,
  type TrailConfig,
  DEFAULT_TRAIL_CONFIG,
} from "./trailing";

export interface ExitConfig {
  trail: TrailConfig;
  htfAggregationFactor: number; // e.g. 6 (4h -> 1d)
  useHtfHaRegime: boolean; // exit when HTF HA flips against
  useExhaustion: boolean;
  exhaustionThreshold: number; // default 0.6
  useFibTargets: boolean; // recalculate TP to next fib extension
  useHaColorExit: boolean;
  haConsecutive: number; // consecutive HA flips to exit (default 2)
  scaleOutFractions: number[]; // e.g. [0.4, 0.3, 0.3] at successive fib levels
  maxBars: number; // hard time stop
}

// Empirically validated tail-preserving config (331 Tier-A alt trades):
// The ICR edge is a low-win-rate fat right tail (~19% of trades carry all the
// profit, avg winner ~+8R, max +24R). Fib scale-outs and twitchy HA-flip exits
// CAP that tail and destroy the edge (tested: +261R naive -> -117R with scale-outs).
// The winner keeps the FULL position on a wide/late trail and only takes a full
// exit at a genuine blow-off extreme. trailExhaust beat naive +281R vs +261R,
// Sharpe 3.49 vs 3.25, max winner preserved at 24R.
//   - No fib scale-outs (useFibTargets/scaleOutFractions off) — never cap the runner.
//   - No HA-color exit (too twitchy — shakes out on in-trend pullbacks).
//   - HTF-HA regime off by default (can exit early; enable only as a soft filter).
//   - Exhaustion ON but only fires at extremes (see exhaustion.ts thresholds).
export const DEFAULT_EXIT_CONFIG: ExitConfig = {
  trail: DEFAULT_TRAIL_CONFIG,
  htfAggregationFactor: 6,
  useHtfHaRegime: false,
  useExhaustion: true,
  exhaustionThreshold: 0.7,
  useFibTargets: false,
  useHaColorExit: false,
  haConsecutive: 3,
  scaleOutFractions: [],
  maxBars: 60,
};

export type ExitReason =
  | "stop"
  | "trail"
  | "exhaustion"
  | "ha_flip"
  | "htf_regime"
  | "fib_final"
  | "time";

export interface ScaleOut {
  bar: number;
  fraction: number;
  r: number;
  reason: string;
}

export interface ExitSimResult {
  finalR: number;
  barsHeld: number;
  exitReason: ExitReason;
  scaleOuts: ScaleOut[];
  maxFavorableR: number;
  maxAdverseR: number;
}

const EPS = 1e-9;

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function rAtPrice(
  price: number,
  entryPrice: number,
  risk: number,
  direction: "long" | "short",
): number {
  return direction === "long"
    ? (price - entryPrice) / risk
    : (entryPrice - price) / risk;
}

function emptyResult(): ExitSimResult {
  return {
    finalR: 0,
    barsHeld: 0,
    exitReason: "time",
    scaleOuts: [],
    maxFavorableR: 0,
    maxAdverseR: 0,
  };
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/**
 * Simulate a full trade with the smart exit engine. FORWARD-ONLY.
 *
 * The caller supplies `entryIdx` (the candle at which the position is live) and
 * `entryPrice`, an `initialStop`, and the realized impulse leg
 * (`impulseSwingLow`/`impulseSwingHigh`) used to project fib-extension targets.
 *
 * Per bar, from `entryIdx` forward:
 *   1. update the trailing stop,
 *   2. exit remaining at stop if the trail/stop is hit,
 *   3. scale out fractions at successive fib-extension levels,
 *   4. exit remaining at close on exhaustion,
 *   5. exit remaining at close on an HA color flip,
 *   6. exit remaining at close when the HTF HA regime flips against us,
 *   7. exit remaining at close at the max-bars time stop.
 *
 * Returns blended R across every partial and the final exit.
 */
export function simulateSmartExit(
  rawCandles: Kline[],
  enriched: EnrichedCandle[],
  entryIdx: number,
  entryPrice: number,
  initialStop: number,
  direction: "long" | "short",
  impulseSwingLow: number,
  impulseSwingHigh: number,
  config: ExitConfig,
): ExitSimResult {
  const n = rawCandles.length;
  const risk =
    direction === "long"
      ? entryPrice - initialStop
      : initialStop - entryPrice;

  if (
    entryIdx < 0 ||
    entryIdx >= n ||
    risk <= 0 ||
    enriched.length !== n
  ) {
    return emptyResult();
  }

  // Precompute HA series (each carries its own forward-only guarantee and is
  // indexed by the source timeframe).
  const haCandles = computeHeikinAshi(rawCandles);
  const htfHa = config.useHtfHaRegime
    ? computeHtfHeikinAshi(rawCandles, config.htfAggregationFactor)
    : [];

  const fib = fibExtensions(impulseSwingLow, impulseSwingHigh, direction);

  let trail: TrailState = initTrail(entryPrice, initialStop, direction);

  let remaining = 1.0;
  let blendedR = 0;
  let fibIdx = 0; // index into both scaleOutFractions and fib.levels
  let maxFavorableR = 0;
  let maxAdverseR = 0;
  let barsHeld = 0;
  let exitReason: ExitReason = "time";
  const scaleOuts: ScaleOut[] = [];

  const endIdx = Math.min(entryIdx + config.maxBars, n - 1);
  let closedOut = false;

  for (let j = entryIdx; j <= endIdx; j++) {
    barsHeld = j - entryIdx;
    const candle = rawCandles[j];

    // Track excursions (realized this bar).
    const favR = rAtPrice(
      direction === "long" ? candle.high : candle.low,
      entryPrice,
      risk,
      direction,
    );
    const advR = rAtPrice(
      direction === "long" ? candle.low : candle.high,
      entryPrice,
      risk,
      direction,
    );
    if (favR > maxFavorableR) maxFavorableR = favR;
    if (advR < maxAdverseR) maxAdverseR = advR;

    // 1. Update trailing stop.
    trail = updateTrail(trail, enriched, j, entryPrice, risk, direction, config.trail);

    // 2. Stop / trail hit → exit remaining at the stop price.
    const stopHit =
      direction === "long"
        ? candle.low <= trail.stopPrice
        : candle.high >= trail.stopPrice;
    if (stopHit) {
      const r = rAtPrice(trail.stopPrice, entryPrice, risk, direction);
      blendedR += remaining * r;
      exitReason = trail.trailArmed || trail.breakevenArmed ? "trail" : "stop";
      scaleOuts.push({ bar: barsHeld, fraction: remaining, r, reason: exitReason });
      remaining = 0;
      closedOut = true;
      break;
    }

    // 3. Fib-extension scale-outs (may fire several levels in one bar).
    if (config.useFibTargets) {
      while (
        fibIdx < config.scaleOutFractions.length &&
        fibIdx < fib.levels.length
      ) {
        const level = fib.levels[fibIdx];
        const hit =
          direction === "long"
            ? candle.high >= level.price
            : candle.low <= level.price;
        if (!hit) break;

        const frac = Math.min(config.scaleOutFractions[fibIdx], remaining);
        fibIdx++;
        if (frac <= EPS) continue;

        const r = rAtPrice(level.price, entryPrice, risk, direction);
        blendedR += frac * r;
        remaining -= frac;
        scaleOuts.push({
          bar: barsHeld,
          fraction: frac,
          r,
          reason: `fib_${level.ratio}`,
        });

        if (remaining <= EPS) {
          exitReason = "fib_final";
          closedOut = true;
          break;
        }
      }
      if (remaining <= EPS) break;
    }

    // 4. Exhaustion → exit remaining at close.
    if (config.useExhaustion) {
      const ex = detectExhaustion(enriched, j, direction, config.exhaustionThreshold);
      if (ex.shouldExit) {
        const r = rAtPrice(candle.close, entryPrice, risk, direction);
        blendedR += remaining * r;
        scaleOuts.push({ bar: barsHeld, fraction: remaining, r, reason: "exhaustion" });
        remaining = 0;
        exitReason = "exhaustion";
        closedOut = true;
        break;
      }
    }

    // 5. HA color flip → exit remaining at close.
    if (config.useHaColorExit && haColorFlipExit(haCandles, j, direction, config.haConsecutive)) {
      const r = rAtPrice(candle.close, entryPrice, risk, direction);
      blendedR += remaining * r;
      scaleOuts.push({ bar: barsHeld, fraction: remaining, r, reason: "ha_flip" });
      remaining = 0;
      exitReason = "ha_flip";
      closedOut = true;
      break;
    }

    // 6. HTF HA regime flip against direction → exit remaining at close.
    if (config.useHtfHaRegime) {
      const htf = htfHa[j];
      if (htf) {
        const against =
          direction === "long" ? htf.color === "red" : htf.color === "green";
        if (against) {
          const r = rAtPrice(candle.close, entryPrice, risk, direction);
          blendedR += remaining * r;
          scaleOuts.push({ bar: barsHeld, fraction: remaining, r, reason: "htf_regime" });
          remaining = 0;
          exitReason = "htf_regime";
          closedOut = true;
          break;
        }
      }
    }

    // 7. Time stop.
    if (barsHeld >= config.maxBars) {
      const r = rAtPrice(candle.close, entryPrice, risk, direction);
      blendedR += remaining * r;
      scaleOuts.push({ bar: barsHeld, fraction: remaining, r, reason: "time" });
      remaining = 0;
      exitReason = "time";
      closedOut = true;
      break;
    }
  }

  // Ran out of data without a triggered exit: close the remainder at the last
  // available close.
  if (!closedOut && remaining > EPS) {
    const lastIdx = endIdx;
    const price = rawCandles[lastIdx].close;
    const r = rAtPrice(price, entryPrice, risk, direction);
    blendedR += remaining * r;
    scaleOuts.push({ bar: lastIdx - entryIdx, fraction: remaining, r, reason: "time" });
    barsHeld = lastIdx - entryIdx;
    remaining = 0;
    exitReason = "time";
  }

  return {
    finalR: blendedR,
    barsHeld,
    exitReason,
    scaleOuts,
    maxFavorableR,
    maxAdverseR,
  };
}
