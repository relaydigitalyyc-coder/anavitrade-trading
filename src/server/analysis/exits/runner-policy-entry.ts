/**
 * Clean integration entry point for the R1.2 runner exit policy.
 *
 * This is the single function the live dispatch path (and backtests) should call
 * to obtain the empirically proven exit for a position: it derives the
 * swing-pivot initial stop and simulates the tail-preserving runner exit.
 *
 * Dispatch integration (documented, not wired here — file ownership):
 *   import { planRunnerExit } from "../analysis/exits/runner-policy-entry";
 * Call at intent construction with the enriched candle history up to the entry
 * bar to get `{ initialStop, stopMethod }` for the ExecutionJob, and — for
 * backtest/paper accounting — the full `RunnerExitResult`.
 */

import type { EnrichedCandle } from "../types";
import {
  computeSwingInitialStop,
  DEFAULT_SWING_STOP_CONFIG,
  type SwingStopConfig,
  type StopMethod,
} from "./swing-stop";
import {
  simulateRunnerExit,
  DEFAULT_RUNNER_EXIT_CONFIG,
  type RunnerExitConfig,
  type RunnerExitResult,
} from "./runner-exit-policy";

export interface RunnerPolicyConfig {
  swingStop: SwingStopConfig;
  runner: RunnerExitConfig;
}

export const DEFAULT_RUNNER_POLICY_CONFIG: RunnerPolicyConfig = {
  swingStop: DEFAULT_SWING_STOP_CONFIG,
  runner: DEFAULT_RUNNER_EXIT_CONFIG,
};

export interface RunnerExitPlan {
  /** Swing-pivot initial stop to arm the position with. */
  initialStop: number;
  stopMethod: StopMethod;
  /** Per-unit risk implied by the stop (entryPrice → initialStop). */
  riskPerUnit: number;
  /** Full forward-only exit simulation (for backtest / paper accounting). */
  simulation: RunnerExitResult;
}

/**
 * Derive the swing-pivot stop and simulate the runner exit in one call.
 * FORWARD-ONLY. Returns a NEW plan object (immutable).
 */
export function planRunnerExit(
  candles: EnrichedCandle[],
  entryIdx: number,
  entryPrice: number,
  direction: "long" | "short",
  config: RunnerPolicyConfig = DEFAULT_RUNNER_POLICY_CONFIG,
): RunnerExitPlan {
  const stop = computeSwingInitialStop(
    candles,
    entryIdx,
    entryPrice,
    direction,
    config.swingStop,
  );

  const simulation = simulateRunnerExit(
    candles,
    entryIdx,
    entryPrice,
    stop.stopPrice,
    direction,
    config.runner,
  );

  const riskPerUnit =
    direction === "long"
      ? entryPrice - stop.stopPrice
      : stop.stopPrice - entryPrice;

  return {
    initialStop: stop.stopPrice,
    stopMethod: stop.method,
    riskPerUnit,
    simulation,
  };
}
