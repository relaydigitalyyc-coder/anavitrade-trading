/**
 * ICR WaveTrend Experiment — honest comparison of the WaveTrend extreme filter.
 *
 * Loads 49 pairs from klines-mtf-extended.json. For each pair, for 4h and 1h:
 *   1. enrichCandles() → findSignals() with DEFAULT_ICR_CONFIG (baseline)
 *   2. enrichCandles() → findSignals() with config + enableWaveTrendExtremeFilter (candidate)
 *   3. simulateSmartExit() for each signal (using DEFAULT_EXIT_CONFIG, untouched)
 *
 * Chronological 60/40 walk-forward split per pair before generating signals.
 * Reports: trade count, win rate, profit factor, Sharpe, max drawdown %, PASS/FAIL.
 */
import { readFileSync } from "fs";
import { enrichCandles } from "../src/server/analysis/indicators";
import { DEFAULT_ICR_CONFIG } from "../src/server/analysis/icr/config";
import { findSignals } from "../src/server/analysis/icr/signals";
import type { Kline, EnrichedCandle, UnifiedSignal } from "../src/server/analysis/types";
import { simulateSmartExit, DEFAULT_EXIT_CONFIG } from "../src/server/analysis/exits/exit-engine";
import type { ExitConfig } from "../src/server/analysis/exits/exit-engine";

// ─── Types ───────────────────────────────────────────────────────────────

interface KlinesDataItem {
  symbol: string;
  klines: Record<string, Kline[]>;
}

interface TradeRecord {
  r: number;
  direction: string;
  symbol: string;
  timeframe: string;
}

interface Metrics {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  wr: string;
  profitFactor: string;
  totalR: string;
  avgR: string;
  sharpe: string;
  maxDD: string;
  pass: boolean;
  reason?: string;
}

// ─── Data loading ────────────────────────────────────────────────────────

const DATA_PATH = "/home/ariel/anavitrade-trading/scripts/data/klines-mtf-extended.json";
const data: KlinesDataItem[] = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

console.log(`Loaded ${data.length} pairs from klines-mtf-extended.json`);

// Only 4h and 1h timeframes
const TARGET_TFS = ["4h", "1h"];

// ─── Walk-forward split ──────────────────────────────────────────────────

function chronoSplit(
  candles: Kline[],
  trainFraction: number = 0.6,
): { train: Kline[]; val: Kline[] } {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const cut = Math.floor(sorted.length * trainFraction);
  return {
    train: sorted.slice(0, cut),
    val: sorted.slice(cut),
  };
}

// ─── Metrics computation ─────────────────────────────────────────────────

function computeMetrics(records: TradeRecord[], label: string): Metrics {
  const n = records.length;
  if (n === 0) {
    return { label, trades: 0, wins: 0, losses: 0, wr: "0.0", profitFactor: "0.00", totalR: "0.0", avgR: "0.000", sharpe: "0.00", maxDD: "0.0", pass: false, reason: "no trades" };
  }

  const wins = records.filter(r => r.r > 0).length;
  const losses = n - wins;
  const wr = (wins / n) * 100;

  const totalR = records.reduce((s, r) => s + r.r, 0);
  const avgR = totalR / n;

  // Profit factor
  const grossWin = records.filter(r => r.r > 0).reduce((s, r) => s + r.r, 0);
  const grossLoss = Math.abs(records.filter(r => r.r < 0).reduce((s, r) => s + r.r, 0));
  const pf = grossLoss > 0 ? (grossWin / grossLoss) : grossWin > 0 ? Infinity : 0;

  // Sharpe (annualized, assuming ~365 4h bars / ~365*4 1h bars per year? 
  // Use daily R approximation: treat each trade return as daily, sqrt(365))
  // Actually simpler: compute Sharpe as mean(R) / std(R) * sqrt(num periods)
  // Since trades are not on every bar, use the trade returns directly.
  const meanR = avgR;
  const stdR = n > 1 ? Math.sqrt(records.reduce((s, r) => s + (r.r - meanR) ** 2, 0) / (n - 1)) : 0;
  const sharpe = stdR > 0 ? meanR / stdR * Math.sqrt(365) : 0;

  // Max drawdown of cumulative R
  let peak = 0;
  let maxDD = 0;
  let cumR = 0;
  for (const r of records) {
    cumR += r.r;
    if (cumR > peak) peak = cumR;
    const dd = peak > 0 ? (peak - cumR) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    label,
    trades: n,
    wins,
    losses,
    wr: wr.toFixed(1),
    profitFactor: pf === Infinity ? "∞" : pf.toFixed(2),
    totalR: totalR.toFixed(1),
    avgR: avgR.toFixed(3),
    sharpe: sharpe.toFixed(2),
    maxDD: (maxDD * 100).toFixed(1),
    pass: true,
  };
}

// ─── Run one config on one split ─────────────────────────────────────────

function runOnSplit(
  candles: Kline[],
  config: typeof DEFAULT_ICR_CONFIG,
  symbol: string,
  timeframe: string,
): TradeRecord[] {
  const enriched = enrichCandles(candles, config);
  const signals = findSignals(enriched, symbol, timeframe, config);

  const trades: TradeRecord[] = [];
  for (const sig of signals) {
    // Find the index of the entry candle
    const entryIdx = enriched.findIndex(c => c.timestamp === sig.timestamp);
    if (entryIdx < 0) continue;

    const result = simulateSmartExit(
      candles,
      enriched,
      entryIdx,
      sig.entry,
      sig.stopLoss,
      sig.direction,
      sig.metadata?.impulseSwingLow as number,
      sig.metadata?.impulseSwingHigh as number,
      DEFAULT_EXIT_CONFIG as ExitConfig,
    );

    trades.push({
      r: result.finalR,
      direction: sig.direction,
      symbol,
      timeframe,
    });
  }

  return trades;
}

// ─── Main ────────────────────────────────────────────────────────────────

console.log("\nProcessing pairs...\n");

const baselineTrainTrades: TradeRecord[] = [];
const baselineValTrades: TradeRecord[] = [];
const candidateTrainTrades: TradeRecord[] = [];
const candidateValTrades: TradeRecord[] = [];
const candidate2TrainTrades: TradeRecord[] = [];
const candidate2ValTrades: TradeRecord[] = [];
const candidate3TrainTrades: TradeRecord[] = [];
const candidate3ValTrades: TradeRecord[] = [];

let pairsWithTrainTradesBaseline = 0;
let pairsWithValTradesBaseline = 0;
let pairsWithTrainTradesCandidate = 0;
let pairsWithValTradesCandidate = 0;
let pairsWithTrainTradesCandidate2 = 0;
let pairsWithValTradesCandidate2 = 0;
let pairsWithTrainTradesCandidate3 = 0;
let pairsWithValTradesCandidate3 = 0;

for (const item of data) {
  for (const tf of TARGET_TFS) {
    const klines = item.klines[tf];
    if (!klines || klines.length < 200) continue; // need enough data

    // Chronological 60/40 split
    const { train: trainCandles, val: valCandles } = chronoSplit(klines, 0.6);

    // ── BASELINE (no WaveTrend filter) ──
    const baseTrain = runOnSplit(trainCandles, DEFAULT_ICR_CONFIG, item.symbol, tf);
    const baseVal = runOnSplit(valCandles, DEFAULT_ICR_CONFIG, item.symbol, tf);
    baselineTrainTrades.push(...baseTrain);
    baselineValTrades.push(...baseVal);
    if (baseTrain.length > 0) pairsWithTrainTradesBaseline++;
    if (baseVal.length > 0) pairsWithValTradesBaseline++;

    // ── CANDIDATE (with WaveTrend filter) ──
    const candConfig = {
      ...DEFAULT_ICR_CONFIG,
      enableWaveTrendExtremeFilter: true,
    };
    const candTrain = runOnSplit(trainCandles, candConfig, item.symbol, tf);
    const candVal = runOnSplit(valCandles, candConfig, item.symbol, tf);
    candidateTrainTrades.push(...candTrain);
    candidateValTrades.push(...candVal);
    if (candTrain.length > 0) pairsWithTrainTradesCandidate++;
    if (candVal.length > 0) pairsWithValTradesCandidate++;

    // ── CANDIDATE 2 (simple single-bar WaveTrend threshold, mirrors RSI filter) ──
    const cand2Config = {
      ...DEFAULT_ICR_CONFIG,
      enableWaveTrendSimpleFilter: true,
    };
    const cand2Train = runOnSplit(trainCandles, cand2Config, item.symbol, tf);
    const cand2Val = runOnSplit(valCandles, cand2Config, item.symbol, tf);
    candidate2TrainTrades.push(...cand2Train);
    candidate2ValTrades.push(...cand2Val);
    if (cand2Train.length > 0) pairsWithTrainTradesCandidate2++;
    if (cand2Val.length > 0) pairsWithValTradesCandidate2++;

    // ── CANDIDATE 3 (Money Flow direction confirmation) ──
    const cand3Config = {
      ...DEFAULT_ICR_CONFIG,
      enableMoneyFlowFilter: true,
    };
    const cand3Train = runOnSplit(trainCandles, cand3Config, item.symbol, tf);
    const cand3Val = runOnSplit(valCandles, cand3Config, item.symbol, tf);
    candidate3TrainTrades.push(...cand3Train);
    candidate3ValTrades.push(...cand3Val);
    if (cand3Train.length > 0) pairsWithTrainTradesCandidate3++;
    if (cand3Val.length > 0) pairsWithValTradesCandidate3++;
  }
}

// ─── Compute metrics ─────────────────────────────────────────────────────

const baseTrainMetrics = computeMetrics(baselineTrainTrades, "Baseline [train]");
const baseValMetrics = computeMetrics(baselineValTrades, "Baseline [val]");
const candTrainMetrics = computeMetrics(candidateTrainTrades, "Candidate [train]");
const candValMetrics = computeMetrics(candidateValTrades, "Candidate [val]");
const cand2TrainMetrics = computeMetrics(candidate2TrainTrades, "Candidate2 [train]");
const cand2ValMetrics = computeMetrics(candidate2ValTrades, "Candidate2 [val]");

// Walk-forward PASS/FAIL: train has trades AND val has trades
baseTrainMetrics.pass = baseTrainMetrics.trades > 0 && baseValMetrics.trades > 0;
baseValMetrics.pass = baseTrainMetrics.trades > 0 && baseValMetrics.trades > 0;
candTrainMetrics.pass = candTrainMetrics.trades > 0 && candValMetrics.trades > 0;
candValMetrics.pass = candTrainMetrics.trades > 0 && candValMetrics.trades > 0;
cand2TrainMetrics.pass = cand2TrainMetrics.trades > 0 && cand2ValMetrics.trades > 0;
cand2ValMetrics.pass = cand2TrainMetrics.trades > 0 && cand2ValMetrics.trades > 0;

const cand3TrainMetrics = computeMetrics(candidate3TrainTrades, "Candidate3 [train]");
const cand3ValMetrics = computeMetrics(candidate3ValTrades, "Candidate3 [val]");
cand3TrainMetrics.pass = cand3TrainMetrics.trades > 0 && cand3ValMetrics.trades > 0;
cand3ValMetrics.pass = cand3TrainMetrics.trades > 0 && cand3ValMetrics.trades > 0;

// ─── Print results ───────────────────────────────────────────────────────

const SEP = "=".repeat(100);
const SEP2 = "-".repeat(100);

console.log("\n" + SEP);
console.log("ICR WAVETREND EXTREME FILTER EXPERIMENT — HONEST COMPARISON");
console.log("Baseline: DEFAULT_ICR_CONFIG (no WaveTrend filter)");
console.log("Candidate: DEFAULT_ICR_CONFIG + enableWaveTrendExtremeFilter: true");
console.log(`Data: ${data.length} pairs × ${TARGET_TFS.join(", ")}`);
console.log(`Walk-forward: chronological 60/40 split per pair`);
console.log(SEP);

console.log(`\n${"Metric".padEnd(24)} | ${"Baseline Train".padEnd(18)} | ${"Baseline Val".padEnd(18)} | ${"Candidate Train".padEnd(18)} | ${"Candidate Val".padEnd(18)}`);
console.log(SEP2);

function printRow(label: string, bt: Metrics, bv: Metrics, ct: Metrics, cv: Metrics) {
  const get = (m: Metrics, field: string) => {
    if (field === "trades") return String(m.trades).padStart(6);
    if (field === "wr") return m.wr.padStart(6) + "%";
    if (field === "pf") return m.profitFactor.padStart(6);
    if (field === "sharpe") return m.sharpe.padStart(6);
    if (field === "maxDD") return m.maxDD.padStart(6) + "%";
    if (field === "totalR") return m.totalR.padStart(8);
    if (field === "avgR") return m.avgR.padStart(8);
    return "";
  };
  console.log(
    `${label.padEnd(24)} | ${get(bt, label === "Trades" ? "trades" : label.toLowerCase())} | ${get(bv, label === "Trades" ? "trades" : label.toLowerCase())} | ${get(ct, label === "Trades" ? "trades" : label.toLowerCase())} | ${get(cv, label === "Trades" ? "trades" : label.toLowerCase())}`
  );
}

// Manual print for clean formatting
const metrics = [
  { label: "Trades", get: (m: Metrics) => String(m.trades).padStart(6) },
  { label: "Win Rate", get: (m: Metrics) => m.wr.padStart(6) + "%" },
  { label: "Profit Factor", get: (m: Metrics) => m.profitFactor.padStart(6) },
  { label: "Sharpe", get: (m: Metrics) => m.sharpe.padStart(6) },
  { label: "Max DD", get: (m: Metrics) => m.maxDD.padStart(6) + "%" },
  { label: "Total R", get: (m: Metrics) => m.totalR.padStart(8) },
  { label: "Avg R", get: (m: Metrics) => m.avgR.padStart(8) },
];

for (const m of metrics) {
  console.log(
    `${m.label.padEnd(24)} | ${m.get(baseTrainMetrics)} | ${m.get(baseValMetrics)} | ${m.get(candTrainMetrics)} | ${m.get(candValMetrics)}`
  );
}

console.log(SEP2);
const passStr = (p: boolean) => p ? "PASS" : "FAIL";
console.log(
  `Walk-Forward PASS/FAIL    | ${passStr(baseTrainMetrics.pass).padStart(18)} | ${passStr(baseValMetrics.pass).padStart(18)} | ${passStr(candTrainMetrics.pass).padStart(18)} | ${passStr(candValMetrics.pass).padStart(18)}`
);

console.log(`\nPairs with train trades (baseline):  ${pairsWithTrainTradesBaseline}`);
console.log(`Pairs with val trades (baseline):    ${pairsWithValTradesBaseline}`);
console.log(`Pairs with train trades (candidate): ${pairsWithTrainTradesCandidate}`);
console.log(`Pairs with val trades (candidate):   ${pairsWithValTradesCandidate}`);

console.log("\n" + SEP);
console.log("CANDIDATE 2 — WaveTrend SIMPLE threshold (single-bar, no lookback/turn)");
console.log(SEP);
console.log(`\n${"Metric".padEnd(24)} | ${"Baseline Train".padEnd(18)} | ${"Baseline Val".padEnd(18)} | ${"Cand2 Train".padEnd(18)} | ${"Cand2 Val".padEnd(18)}`);
console.log(SEP2);
for (const m of metrics) {
  console.log(
    `${m.label.padEnd(24)} | ${m.get(baseTrainMetrics)} | ${m.get(baseValMetrics)} | ${m.get(cand2TrainMetrics)} | ${m.get(cand2ValMetrics)}`
  );
}
console.log(SEP2);
console.log(
  `Walk-Forward PASS/FAIL    | ${passStr(baseTrainMetrics.pass).padStart(18)} | ${passStr(baseValMetrics.pass).padStart(18)} | ${passStr(cand2TrainMetrics.pass).padStart(18)} | ${passStr(cand2ValMetrics.pass).padStart(18)}`
);
console.log(`\nPairs with train trades (candidate2): ${pairsWithTrainTradesCandidate2}`);
console.log(`Pairs with val trades (candidate2):   ${pairsWithValTradesCandidate2}`);

console.log("\n" + SEP);
console.log("CANDIDATE 3 — Money Flow direction confirmation (single-bar)");
console.log(SEP);
console.log(`\n${"Metric".padEnd(24)} | ${"Baseline Train".padEnd(18)} | ${"Baseline Val".padEnd(18)} | ${"Cand3 Train".padEnd(18)} | ${"Cand3 Val".padEnd(18)}`);
console.log(SEP2);
for (const m of metrics) {
  console.log(
    `${m.label.padEnd(24)} | ${m.get(baseTrainMetrics)} | ${m.get(baseValMetrics)} | ${m.get(cand3TrainMetrics)} | ${m.get(cand3ValMetrics)}`
  );
}
console.log(SEP2);
console.log(
  `Walk-Forward PASS/FAIL    | ${passStr(baseTrainMetrics.pass).padStart(18)} | ${passStr(baseValMetrics.pass).padStart(18)} | ${passStr(cand3TrainMetrics.pass).padStart(18)} | ${passStr(cand3ValMetrics.pass).padStart(18)}`
);
console.log(`\nPairs with train trades (candidate3): ${pairsWithTrainTradesCandidate3}`);
console.log(`Pairs with val trades (candidate3):   ${pairsWithValTradesCandidate3}`);

// ── Honest verdict ───────────────────────────────────────────────────────
console.log("\n" + SEP);
console.log("HONEST VERDICT");
console.log(SEP);

const baseValPf = baseValMetrics.trades > 0 ? parseFloat(baseValMetrics.profitFactor) || 0 : 0;
const candValPf = candValMetrics.trades > 0 ? parseFloat(candValMetrics.profitFactor) || 0 : 0;
const baseValSharpe = parseFloat(baseValMetrics.sharpe) || 0;
const candValSharpe = parseFloat(candValMetrics.sharpe) || 0;

console.log(`Baseline validation PF:    ${baseValPf.toFixed(2)}`);
console.log(`Candidate validation PF:   ${candValPf.toFixed(2)}`);
console.log(`Baseline validation Sharpe: ${baseValSharpe.toFixed(2)}`);
console.log(`Candidate validation Sharpe: ${candValSharpe.toFixed(2)}`);

const valTradesDropped = baseValMetrics.trades - candValMetrics.trades;
const pctDropped = baseValMetrics.trades > 0 ? ((valTradesDropped / baseValMetrics.trades) * 100).toFixed(1) : "N/A";

console.log(`Trades dropped by filter:  ${valTradesDropped} (${pctDropped}% of baseline)`);

if (candValMetrics.trades === 0) {
  console.log("\n>> VERDICT: REJECTION — candidate filter eliminated all validation trades (walk-forward FAIL).");
} else if (candValPf < baseValPf * 0.9) {
  console.log("\n>> VERDICT: REJECTION — candidate validation PF significantly below baseline.");
} else if (candValPf >= baseValPf && candValSharpe >= baseValSharpe * 0.95) {
  console.log("\n>> VERDICT: INCONCLUSIVE — candidate preserves or improves validation metrics, but sample may be too small. Needs more data on a larger corpus with more signals.");
} else {
  console.log("\n>> VERDICT: INCONCLUSIVE — mixed signals. Candidate changes trade count and metrics but no clear improvement. Needs more data.");
}

const cand2ValPf = cand2ValMetrics.trades > 0 ? parseFloat(cand2ValMetrics.profitFactor) || 0 : 0;
const cand2ValSharpe = parseFloat(cand2ValMetrics.sharpe) || 0;

console.log(`\nCandidate2 validation PF:     ${cand2ValPf.toFixed(2)}`);
console.log(`Candidate2 validation Sharpe: ${cand2ValSharpe.toFixed(2)}`);
const val2TradesDropped = baseValMetrics.trades - cand2ValMetrics.trades;
const pct2Dropped = baseValMetrics.trades > 0 ? ((val2TradesDropped / baseValMetrics.trades) * 100).toFixed(1) : "N/A";
console.log(`Trades dropped by filter2:   ${val2TradesDropped} (${pct2Dropped}% of baseline)`);

if (cand2ValMetrics.trades === 0) {
  console.log("\n>> VERDICT (candidate2): REJECTION — eliminated all validation trades (walk-forward FAIL).");
} else if (cand2ValPf < baseValPf * 0.9) {
  console.log("\n>> VERDICT (candidate2): REJECTION — validation PF significantly below baseline.");
} else if (cand2ValPf >= baseValPf && cand2ValSharpe >= baseValSharpe * 0.95) {
  console.log("\n>> VERDICT (candidate2): ADOPT-CANDIDATE — preserves or improves validation PF/Sharpe with fewer/different trades.");
} else {
  console.log("\n>> VERDICT (candidate2): INCONCLUSIVE — mixed signals, needs more data.");
}

const cand3ValPf = cand3ValMetrics.trades > 0 ? parseFloat(cand3ValMetrics.profitFactor) || 0 : 0;
const cand3ValSharpe = parseFloat(cand3ValMetrics.sharpe) || 0;
const cand3ValMaxDD = parseFloat(cand3ValMetrics.maxDD) || 0;
const baseValMaxDD = parseFloat(baseValMetrics.maxDD) || 0;

console.log(`\nCandidate3 validation PF:     ${cand3ValPf.toFixed(2)}`);
console.log(`Candidate3 validation Sharpe: ${cand3ValSharpe.toFixed(2)}`);
console.log(`Candidate3 validation MaxDD:  ${cand3ValMaxDD.toFixed(1)}% (baseline: ${baseValMaxDD.toFixed(1)}%)`);
const val3TradesDropped = baseValMetrics.trades - cand3ValMetrics.trades;
const pct3Dropped = baseValMetrics.trades > 0 ? ((val3TradesDropped / baseValMetrics.trades) * 100).toFixed(1) : "N/A";
console.log(`Trades dropped by filter3:   ${val3TradesDropped} (${pct3Dropped}% of baseline)`);

if (cand3ValMetrics.trades === 0) {
  console.log("\n>> VERDICT (candidate3): REJECTION — eliminated all validation trades (walk-forward FAIL).");
} else if (cand3ValPf < baseValPf * 0.9) {
  console.log("\n>> VERDICT (candidate3): REJECTION — validation PF significantly below baseline.");
} else if (cand3ValPf >= baseValPf && cand3ValSharpe >= baseValSharpe * 0.95) {
  console.log("\n>> VERDICT (candidate3): ADOPT-CANDIDATE — preserves or improves validation PF/Sharpe.");
} else {
  console.log("\n>> VERDICT (candidate3): INCONCLUSIVE — mixed signals, needs more data.");
}
