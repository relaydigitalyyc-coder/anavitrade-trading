/**
 * Parameter sweep: test different score thresholds, gate minimums,
 * and weight configurations against historical data to find
 * empirically optimal values.
 */

import type { IcrConfig } from "./types";
import { DEFAULT_ICR_CONFIG } from "./icr/config";
import { runBacktest } from "./backtest";
import type { BacktestConfig, BacktestResult } from "./backtest";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface ParameterSweepConfig {
  symbol: string;
  timeframe: string;
  lookbackBars: number;
  parameters: {
    scoreThreshold: number[];     // e.g. [55, 60, 65, 70, 75, 80, 85]
    minCoilScore: number[];       // e.g. [60, 66, 72, 78]
    minRr: number[];              // e.g. [1.5, 2.0, 2.5, 3.0, 3.5]
    enableCoilGate: boolean[];    // [true, false]
  };
}

export interface SweepResult {
  combo: Record<string, number | boolean>;
  signalCount: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  sharpeApprox: number;
}

/* ─── Default sweep config ───────────────────────────────────────────── */

export const DEFAULT_SWEEP_CONFIG: ParameterSweepConfig = {
  symbol: "BTCUSDT",
  timeframe: "4h",
  lookbackBars: 500,
  parameters: {
    scoreThreshold: [55, 60, 65, 70, 75, 80, 85],
    minCoilScore: [60, 66, 72, 78],
    minRr: [1.5, 2.0, 2.5, 3.0, 3.5],
    enableCoilGate: [true, false],
  },
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Generate all combinations from a sweep parameter space.
 * Returns an array of partial IcrConfig overrides.
 */
function generateCombinations(
  params: ParameterSweepConfig["parameters"],
): Array<Partial<IcrConfig>> {
  const combos: Array<Partial<IcrConfig>> = [];

  for (const scoreThreshold of params.scoreThreshold) {
    for (const minCoilScore of params.minCoilScore) {
      for (const minRr of params.minRr) {
        for (const enableCoilGate of params.enableCoilGate) {
          combos.push({
            scoreThreshold,
            minCoilScore,
            minRr,
            enableCoilGate,
          });
        }
      }
    }
  }

  return combos;
}

/**
 * Convert a SweepResult into a human-readable combo string for sorting.
 */
function comboKey(combo: Record<string, number | boolean>): string {
  return Object.entries(combo)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Grid search over parameter combinations.
 * For each combo: run backtest, collect statistics, rank by totalR.
 *
 * Each backtest is stateless — reads klines from DB, computes in-memory.
 * This may take a while for large parameter spaces.
 *
 * @returns Results sorted by totalR descending (best first).
 */
export async function runParameterSweep(
  config: ParameterSweepConfig,
  icrBaseConfig?: IcrConfig,
  backtestBaseConfig?: Partial<Omit<BacktestConfig, "symbol">>,
): Promise<SweepResult[]> {
  const baseIcr = icrBaseConfig ?? DEFAULT_ICR_CONFIG;
  const combos = generateCombinations(config.parameters);
  const results: SweepResult[] = [];

  for (const combo of combos) {
    // Merge combo into ICR config
    const icrConfig: IcrConfig = { ...baseIcr, ...combo };

    const backtestConfig: BacktestConfig = {
      symbol: config.symbol,
      timeframe: config.timeframe,
      lookbackBars: config.lookbackBars,
      minScore: combo.scoreThreshold ?? baseIcr.scoreThreshold,
      forwardBars: backtestBaseConfig?.forwardBars ?? 48,
      stopAtrMult: backtestBaseConfig?.stopAtrMult ?? 1.0,
      tpRMultiples: backtestBaseConfig?.tpRMultiples ?? [2.0, 3.0],
    };

    try {
      const btResult = await runBacktest(backtestConfig, icrConfig);

      results.push({
        combo: {
          scoreThreshold: icrConfig.scoreThreshold,
          minCoilScore: icrConfig.minCoilScore,
          minRr: icrConfig.minRr,
          enableCoilGate: icrConfig.enableCoilGate,
        },
        signalCount: btResult.summary.totalSignals,
        winRate: btResult.summary.winRate,
        avgR: btResult.summary.avgR,
        totalR: btResult.summary.totalR,
        profitFactor: btResult.summary.profitFactor,
        sharpeApprox: btResult.summary.sharpeApprox,
      });
    } catch (e: any) {
      console.warn(
        `[parameter-sweep] ${comboKey(combo)} failed: ${e?.message}`,
      );
    }
  }

  // Sort by totalR descending
  results.sort((a, b) => b.totalR - a.totalR);

  return results;
}

/**
 * Find the Pareto-optimal parameter set: best totalR with signalCount >= minSignals.
 *
 * This prefers the parameter combo that generates the most total R while
 * maintaining a viable signal frequency.
 */
export function selectOptimalParams(
  results: SweepResult[],
  minSignals: number = 50,
): SweepResult | null {
  // Filter to combos with enough signals
  const viable = results.filter((r) => r.signalCount >= minSignals);

  if (viable.length === 0) {
    // Fall back to the best among all results
    return results.length > 0 ? results[0] : null;
  }

  // Among viable, find the one with best totalR
  return viable.reduce((best, curr) =>
    curr.totalR > best.totalR ? curr : best,
  );
}

/**
 * Compute summary statistics across all sweep results.
 */
export function sweepSummary(
  results: SweepResult[],
): {
  totalCombos: number;
  avgSignalCount: number;
  avgWinRate: number;
  avgTotalR: number;
  bestTotalR: SweepResult | null;
  worstTotalR: SweepResult | null;
  sensitivity: Record<string, { highAvgR: number; lowAvgR: number; range: number }>;
} {
  if (results.length === 0) {
    return {
      totalCombos: 0,
      avgSignalCount: 0,
      avgWinRate: 0,
      avgTotalR: 0,
      bestTotalR: null,
      worstTotalR: null,
      sensitivity: {},
    };
  }

  const totalCombos = results.length;
  const avgSignalCount =
    results.reduce((s, r) => s + r.signalCount, 0) / totalCombos;
  const avgWinRate =
    results.reduce((s, r) => s + r.winRate, 0) / totalCombos;
  const avgTotalR =
    results.reduce((s, r) => s + r.totalR, 0) / totalCombos;

  const bestTotalR = results[0];
  const worstTotalR = results[results.length - 1];

  // Parameter sensitivity analysis
  const sensitivity: Record<
    string,
    { highAvgR: number; lowAvgR: number; range: number }
  > = {};

  const paramKeys = results.length > 0
    ? Object.keys(results[0].combo).filter(
        (k) => typeof results[0].combo[k] === "number",
      )
    : [];

  for (const key of paramKeys) {
    const sorted = [...results].sort((a, b) => {
      const va = a.combo[key] as number;
      const vb = b.combo[key] as number;
      return va - vb;
    });

    // Top third vs bottom third by this parameter
    const split = Math.max(1, Math.floor(sorted.length / 3));
    const top = sorted.slice(-split);
    const bottom = sorted.slice(0, split);

    const highAvgR =
      top.reduce((s, r) => s + r.avgR, 0) / top.length;
    const lowAvgR =
      bottom.reduce((s, r) => s + r.avgR, 0) / bottom.length;

    sensitivity[key] = {
      highAvgR,
      lowAvgR,
      range: highAvgR - lowAvgR,
    };
  }

  return {
    totalCombos,
    avgSignalCount,
    avgWinRate,
    avgTotalR,
    bestTotalR,
    worstTotalR,
    sensitivity,
  };
}
