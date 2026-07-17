/**
 * Runner exit policy — the empirically proven, tail-preserving exit (R1.2).
 *
 * This is the SERVER-SIDE, live-dispatch encoding of the exit rules validated in
 * `docs/analysis/EMPIRICAL_FINDINGS.md` → "Exit Engine: The Tail is Sacred".
 *
 * Rules encoded (and NOTHING else):
 *   1. Initial stop  — swing-pivot based (see `swing-stop.ts`): nearest CONFIRMED
 *      swing low − 0.2·ATR for longs (swing high + 0.2·ATR for shorts).
 *   2. Trail         — a 5-ATR RATCHET that ARMS ONLY at +4R and, once armed,
 *      only ever moves in the favorable direction (never loosens, never tightens
 *      beyond the ratchet rule).
 *   3. Exhaustion    — a full exit at a genuine blow-off/capitulation extreme,
 *      threshold 0.7 (kept from the validated engine).
 *   4. Time stop     — hard bar cap; a time exit is booked as a LOSS at 0R by the
 *      metrics helper below (PRD verification gate: "time exits counted as losses
 *      at 0R, not dropped").
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  BANNED — DO NOT RE-ADD.  These are impossible here BY CONSTRUCTION, not   │
 * │  merely defaulted off.  There is no config flag and no code path for them. │
 * │                                                                            │
 * │   ✗ early breakeven stop      ✗ partial scale-outs / fib targets           │
 * │   ✗ HTF / Heikin-Ashi flip exits                                           │
 * │                                                                            │
 * │  Empirical proof (EMPIRICAL_FINDINGS.md, "The Tail is Sacred"): every      │
 * │  mechanism that touches the exit CAPS the fat right tail and destroys the  │
 * │  edge. Fib scale-outs + tight trail + HA flip took TotalR from +274.8R to  │
 * │  −117R. Early breakeven at +2R gave −48% vs naive. A 20% partial dropped   │
 * │  the max winner 24.4R → 19.4R. The pure runner on a WIDE, LATE ratchet     │
 * │  wins: +274.8R, Sharpe 3.47, max winner preserved at 23.4R.                │
 * │                                                                            │
 * │  If a future agent "improves" exits by adding any of the above, they are   │
 * │  re-introducing a known, measured regression. Re-backtest before touching. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * FORWARD-ONLY: the simulation walks bars strictly from `entryIdx + 1` forward.
 * Every decision at bar `j` uses only candles[0..j] and state accumulated from
 * bars ≤ j. No candle at index > j is ever read.
 */

import type { EnrichedCandle } from "../types";
import { detectExhaustion } from "./exhaustion";

/** Named parameters — no magic numbers (coding-style rule). */
export interface RunnerExitConfig {
  /** Trailing distance in ATRs. Wide by design (5) to never cap the runner. */
  trailAtrMult: number;
  /** Favorable excursion (in R) at which the ratchet trail ARMS. */
  trailArmAtR: number;
  /** Exhaustion aggregate score that triggers a full exit at a blow-off. */
  exhaustionThreshold: number;
  /** Hard time stop, in bars held. A time exit is booked as a 0R loss. */
  maxBars: number;
}

// The single blessed config. Values are the empirically validated ones; they
// are NOT tunable knobs to be relaxed casually — read EMPIRICAL_FINDINGS.md.
export const DEFAULT_RUNNER_EXIT_CONFIG: RunnerExitConfig = {
  trailAtrMult: 5.0,
  trailArmAtR: 4.0,
  exhaustionThreshold: 0.7,
  maxBars: 60,
};

// Note: there is deliberately NO `breakevenAtR`, NO `scaleOutFractions`, and NO
// `useHtfHaRegime` / `useHaColorExit` field. Those cannot be expressed here.

/** A runner exit can only end one of these four ways. */
export type RunnerExitReason = "stop" | "trail" | "exhaustion" | "time";

export interface RunnerExitResult {
  /** Realized R at the actual fill (trail/stop price, or close for exhaustion/time). */
  realizedR: number;
  barsHeld: number;
  exitReason: RunnerExitReason;
  /** True once the 5-ATR ratchet armed (favorable excursion reached +armAtR). */
  trailArmed: boolean;
  maxFavorableR: number;
  maxAdverseR: number;
  /** The fill price used to realize `realizedR`. */
  exitPrice: number;
}

/* ─── Ratchet trail (self-contained; no breakeven concept exists) ────────── */

/**
 * Immutable ratchet state. Exposed so the live dispatch loop can advance the
 * trail bar-by-bar (per-bar `advanceRatchetTrail`) with the same guarantees the
 * backtest uses. There is deliberately no `breakevenArmed` field: breakeven does
 * not exist in this policy.
 */
export interface RatchetState {
  stopPrice: number;
  extreme: number; // best favorable price so far (highest for long / lowest for short)
  armed: boolean;
}

/** Seed the ratchet at entry: stop at the swing-pivot stop, not yet armed. */
export function initRatchet(
  entryPrice: number,
  initialStop: number,
): RatchetState {
  return { stopPrice: initialStop, extreme: entryPrice, armed: false };
}

function rAtPrice(
  price: number,
  entry: number,
  risk: number,
  direction: "long" | "short",
): number {
  return direction === "long"
    ? (price - entry) / risk
    : (entry - price) / risk;
}

function atrAt(candle: EnrichedCandle): number {
  return candle.atr14 > 0 ? candle.atr14 : candle.close * 0.01;
}

/**
 * Advance the ratchet by one bar. Returns a NEW state (immutable).
 *
 * Monotonic guarantee: for a long the stop can only move UP, for a short only
 * DOWN — it is `max(prevStop, …)` / `min(prevStop, …)`. The trail contributes
 * nothing until `armed` (favorable excursion ≥ armAtR). There is no breakeven
 * branch: before the trail arms, the stop stays exactly at the swing-pivot stop.
 */
export function advanceRatchetTrail(
  state: RatchetState,
  candle: EnrichedCandle,
  entry: number,
  risk: number,
  direction: "long" | "short",
  config: RunnerExitConfig,
): RatchetState {
  const isLong = direction === "long";
  const atr = atrAt(candle);

  const extreme = isLong
    ? Math.max(state.extreme, candle.high)
    : Math.min(state.extreme, candle.low);

  const favorableR = isLong
    ? (extreme - entry) / risk
    : (entry - extreme) / risk;

  const armed = state.armed || favorableR >= config.trailArmAtR;

  let stopPrice = state.stopPrice;
  if (armed) {
    const candidate = isLong
      ? extreme - config.trailAtrMult * atr
      : extreme + config.trailAtrMult * atr;
    // Ratchet: never loosen; never push the stop across the current close.
    stopPrice = isLong
      ? Math.max(state.stopPrice, Math.min(candidate, candle.close))
      : Math.min(state.stopPrice, Math.max(candidate, candle.close));
  }

  return { stopPrice, extreme, armed };
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Simulate the runner exit for a live/backtested position. FORWARD-ONLY.
 *
 * Per bar j (from entryIdx+1 to entryIdx+maxBars):
 *   1. advance the ratchet trail,
 *   2. if the stop/trail is touched → exit the FULL position at the stop,
 *   3. else if exhaustion fires → exit the FULL position at the close,
 *   4. else if the time cap is reached → exit the FULL position at the close.
 *
 * There are no partials: the position is always closed in one piece.
 *
 * @throws if inputs are structurally invalid (bad index, non-positive risk).
 */
export function simulateRunnerExit(
  candles: EnrichedCandle[],
  entryIdx: number,
  entryPrice: number,
  initialStop: number,
  direction: "long" | "short",
  config: RunnerExitConfig = DEFAULT_RUNNER_EXIT_CONFIG,
): RunnerExitResult {
  const n = candles.length;
  const risk =
    direction === "long" ? entryPrice - initialStop : initialStop - entryPrice;

  if (entryIdx < 0 || entryIdx >= n) {
    throw new Error(
      `simulateRunnerExit: entryIdx ${entryIdx} out of range (n=${n})`,
    );
  }
  if (!(risk > 0)) {
    throw new Error(
      `simulateRunnerExit: non-positive risk (entry=${entryPrice}, stop=${initialStop}, dir=${direction})`,
    );
  }

  const isLong = direction === "long";
  let ratchet: RatchetState = initRatchet(entryPrice, initialStop);

  let maxFavorableR = 0;
  let maxAdverseR = 0;

  const endIdx = Math.min(entryIdx + config.maxBars, n - 1);

  for (let j = entryIdx + 1; j <= endIdx; j++) {
    const candle = candles[j];
    const barsHeld = j - entryIdx;

    // Track excursions on the realized bar.
    const favR = rAtPrice(
      isLong ? candle.high : candle.low,
      entryPrice,
      risk,
      direction,
    );
    const advR = rAtPrice(
      isLong ? candle.low : candle.high,
      entryPrice,
      risk,
      direction,
    );
    if (favR > maxFavorableR) maxFavorableR = favR;
    if (advR < maxAdverseR) maxAdverseR = advR;

    // 1. Advance the ratchet (may arm and/or tighten this bar).
    ratchet = advanceRatchetTrail(ratchet, candle, entryPrice, risk, direction, config);

    // 2. Stop / trail hit → full exit at the stop price.
    const stopHit = isLong
      ? candle.low <= ratchet.stopPrice
      : candle.high >= ratchet.stopPrice;
    if (stopHit) {
      return {
        realizedR: rAtPrice(ratchet.stopPrice, entryPrice, risk, direction),
        barsHeld,
        exitReason: ratchet.armed ? "trail" : "stop",
        trailArmed: ratchet.armed,
        maxFavorableR,
        maxAdverseR,
        exitPrice: ratchet.stopPrice,
      };
    }

    // 3. Exhaustion at a genuine extreme → full exit at close.
    const ex = detectExhaustion(candles, j, direction, config.exhaustionThreshold);
    if (ex.shouldExit) {
      return {
        realizedR: rAtPrice(candle.close, entryPrice, risk, direction),
        barsHeld,
        exitReason: "exhaustion",
        trailArmed: ratchet.armed,
        maxFavorableR,
        maxAdverseR,
        exitPrice: candle.close,
      };
    }

    // 4. Time stop → full exit at close (booked as 0R loss by the metrics helper).
    if (barsHeld >= config.maxBars) {
      return {
        realizedR: rAtPrice(candle.close, entryPrice, risk, direction),
        barsHeld,
        exitReason: "time",
        trailArmed: ratchet.armed,
        maxFavorableR,
        maxAdverseR,
        exitPrice: candle.close,
      };
    }
  }

  // Ran out of data before any trigger — treat as a time exit at the last close.
  const lastIdx = endIdx;
  const lastClose = candles[lastIdx].close;
  return {
    realizedR: rAtPrice(lastClose, entryPrice, risk, direction),
    barsHeld: lastIdx - entryIdx,
    exitReason: "time",
    trailArmed: ratchet.armed,
    maxFavorableR,
    maxAdverseR,
    exitPrice: lastClose,
  };
}

/* ─── Metrics ────────────────────────────────────────────────────────────── */

export interface RunnerExitMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  avgR: number;
  profitFactor: number; // gross profit / gross loss (Infinity if no losses)
  timeExits: number;
}

/**
 * Aggregate a batch of runner-exit results into headline metrics.
 *
 * CRITICAL (PRD verification gate): a TIME exit is booked as a LOSS and its R is
 * counted as 0 — never dropped, never counted at its realized value. Every other
 * exit uses its realized R. `profitFactor` = gross profit / gross loss.
 */
export function summarizeRunnerExits(
  results: RunnerExitResult[],
): RunnerExitMetrics {
  let wins = 0;
  let losses = 0;
  let totalR = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let timeExits = 0;

  for (const r of results) {
    const isTime = r.exitReason === "time";
    // Time exits: force 0R and classify as a loss.
    const metricR = isTime ? 0 : r.realizedR;
    totalR += metricR;

    if (isTime) {
      timeExits += 1;
      losses += 1; // 0R time exit counts as a loss, contributes 0 to gross loss
      continue;
    }

    if (metricR > 0) {
      wins += 1;
      grossProfit += metricR;
    } else {
      losses += 1;
      grossLoss += Math.abs(metricR);
    }
  }

  const trades = results.length;
  return {
    trades,
    wins,
    losses,
    winRate: trades > 0 ? wins / trades : 0,
    totalR,
    avgR: trades > 0 ? totalR / trades : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
    timeExits,
  };
}
