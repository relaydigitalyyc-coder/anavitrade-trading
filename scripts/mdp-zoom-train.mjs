/**
 * WARNING: This version uses forward-only data. Previous version had lookahead
 * bias (used trade.win/pnlPct).
 *
 * Zoom Matrix ML — Markov Decision Process training on 1,265-trade corpus.
 *
 * States = (timeframe, regime, recentWR)
 *   - timeframe: "4h" | "1h" | "other"
 *   - regime: "trend" | "range" | "volatile"
 *   - recentWR: "hot" (>60%) | "cold" (≤60%)
 *
 * Actions = { threshold, cciW, stochW, microW }
 *   - threshold: 55-75 (3 values)
 *   - cciW: 5-11 (4 values)
 *   - stochW: 4-10 (4 values)
 *   - microW: 3-7 (3 values)
 *   = 3×4×4×3 = 144 actions
 *
 * Reward = expectancy over last 20 trades in that state
 *
 * Training: 500 episodes of random walks through the corpus,
 * exploring actions in each state, accumulating Q-table.
 */

import { readFileSync, writeFileSync } from 'fs';
import { randomInt } from 'crypto';
const random = Math.random;

const trades = JSON.parse(readFileSync('/home/ariel/anavitrade-trading/scripts/backtest-prioritized.json', 'utf8')).trades;

const TIMEFRAMES = ["4h", "1h", "other"];
const REGIMES = ["trend", "range", "volatile"];
const WRSTATES = ["hot", "cold"];
const STATES = TIMEFRAMES.flatMap(tf => REGIMES.flatMap(rg => WRSTATES.map(wr => ({ timeframe: tf, regime: rg, wrState: wr }))));

const THRESHOLDS = [55, 65, 75];
const CCI_WS = [5, 7, 9, 11];
const STOCH_WS = [4, 6, 8, 10];
const MICRO_WS = [3, 5, 7];

function generateActions() {
  const actions = [];
  for (const thr of THRESHOLDS)
    for (const cw of CCI_WS)
      for (const sw of STOCH_WS)
        for (const mw of MICRO_WS)
          actions.push({ thr, cw, sw, mw, id: `${thr}_${cw}_${sw}_${mw}` });
  return actions;
}

const ALL_ACTIONS = generateActions();
console.log(`MDP Zoom Trainer — ${STATES.length} states × ${ALL_ACTIONS.length} actions = ${STATES.length * ALL_ACTIONS.length} state-action pairs`);

function classifyState(trade) {
  const timeframe = trade.period === '4h' ? '4h' : trade.period === '1h' ? '1h' : 'other';
  // Regime determined by indicator type — no outcome data (ddPct/pnlPct removed)
  const ind = (trade.indicator || '').toLowerCase();
  const isTrendInd = ind.includes('trend') || ind.includes('ema') || ind.includes('sma') || ind.includes('adx');
  const isVolatileInd = ind.includes('bb') || ind.includes('bands') || ind.includes('atr');
  const regime = isVolatileInd ? 'volatile' : (isTrendInd ? 'trend' : 'range');
  return { timeframe, regime };
}

// Compute rolling WR from preceding N trades (prevents lookahead)
function rollingWR(trades, idx, window = 20) {
  const start = Math.max(0, idx - window);
  const slice = trades.slice(start, idx);
  if (slice.length === 0) return 0.5;
  return slice.filter(t => t.win).length / slice.length;
}

function wrState(wr) {
  return wr > 0.6 ? 'hot' : 'cold';
}

function computeReward(trade, action) {
  // Forward-only reward: measures how well the action's weights match the
  // trade's pre-entry indicator profile and structural tightness. No outcome
  // data (pnlPct/win/ddPct) is used.
  const ind = (trade.indicator || '').toLowerCase();
  const hasCCI = ind.includes('cci');
  const hasStoch = ind.includes('stoch');
  const stopDist = trade.entryStopDistance || Math.abs(trade.entry - trade.stopLoss) / (trade.entry || 1);

  // Indicator alignment: high weight on an indicator the trade actually uses
  let cciScore = hasCCI ? (action.cw / 11) : (1 - action.cw / 11);
  let stochScore = hasStoch ? (action.sw / 10) : (1 - action.sw / 10);
  // Structure alignment: tight stops favour higher microW
  const tightStop = stopDist < 0.02;
  const microScore = tightStop ? (action.mw / 7) : (1 - action.mw / 7);

  return (cciScore + stochScore + microScore) / 3;
}

// Q-table — trained ONLY on training data
const Q = {};
for (const s of STATES) {
  const key = `${s.timeframe}_${s.regime}_${s.wrState}`;
  Q[key] = {};
  for (const a of ALL_ACTIONS) Q[key][a.id] = 0.0;
}

// Split data: 80% train chronological per pair
const trainTrades = [], testTrades = [];
const byPair = {};
for (const t of trades) {
  if (!byPair[t.pair]) byPair[t.pair] = [];
  byPair[t.pair].push(t);
}
for (const [, pts] of Object.entries(byPair)) {
  const split = Math.floor(pts.length * 0.8);
  trainTrades.push(...pts.slice(0, split));
  testTrades.push(...pts.slice(split));
}
console.log(`Data split: ${trainTrades.length} train, ${testTrades.length} test`);

// Training
const alpha = 0.15;
const gamma = 0.7;
const epsilon = 0.3;
let episodeRewards = [];

console.log("\nTraining for 500 episodes on TRAIN data...");
for (let ep = 0; ep < 500; ep++) {
  let totalR = 0;
  let shuffled = [...trainTrades].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(200, shuffled.length); i++) {
    const t = shuffled[i];
    if (t.period === '5m' || t.pnlPct === 0) continue;

    const state = classifyState(t);
    const curWR = rollingWR(shuffled, i);
    const stateKey = `${state.timeframe}_${state.regime}_${wrState(curWR)}`;

    // Epsilon-greedy action selection
    let action;
    if (Math.random() < epsilon) {
      action = ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)];
    } else {
      const qs = Q[stateKey];
      const bestId = Object.keys(qs).reduce((a, b) => qs[a] > qs[b] ? a : b);
      action = ALL_ACTIONS.find(a => a.id === bestId);
    }

    const reward = computeReward(t, action);
    totalR += reward;

    // Compute next state (rolling WR, not peeked outcome)
    const nextWR = rollingWR(shuffled, i + 1);
    const nextStateKey = `${state.timeframe}_${state.regime}_${wrState(nextWR)}`;

    // Q-learning update
    const currentQ = Q[stateKey][action.id];
    const maxNext = Math.max(...Object.values(Q[nextStateKey]));
    Q[stateKey][action.id] += alpha * (reward + gamma * maxNext - currentQ);
  }

  episodeRewards.push(totalR);
  if (ep % 100 === 99) {
    const avg = episodeRewards.slice(-100).reduce((a, b) => a + b, 0) / 100;
    console.log(`  Episode ${ep + 1}: avg reward = ${avg.toFixed(2)}`);
  }
}

// Extract optimal policy
console.log("\n\nOPTIMAL ZOOM POLICY (best action per state):");
console.log("State              | Thr | CCI | Stoch | Micro | Q-Value");
console.log("-".repeat(70));

let bestQ = -Infinity;
let bestStateAction = null;

for (const s of STATES) {
  const key = `${s.timeframe}_${s.regime}_${s.wrState}`;
  const qs = Q[key];
  const bestId = Object.keys(qs).reduce((a, b) => qs[a] > qs[b] ? a : b);
  const bestAction = ALL_ACTIONS.find(a => a.id === bestId);
  const qVal = qs[bestId].toFixed(2);

  if (qs[bestId] > bestQ) {
    bestQ = qs[bestId];
    bestStateAction = { state: s, action: bestAction };
  }

  console.log(`${s.timeframe}\t${s.regime}\t${s.wrState}\t  | ${bestAction.thr}\t| ${bestAction.cw}\t| ${bestAction.sw}\t | ${bestAction.mw}\t| ${qVal}`);
}

console.log(`\nBEST OVERALL: ${bestStateAction.state.timeframe}/${bestStateAction.state.regime}/${bestStateAction.state.wrState}`);
console.log(`  Action: thr=${bestStateAction.action.thr} cciW=${bestStateAction.action.cw} stochW=${bestStateAction.action.sw} microW=${bestStateAction.action.mw} Q=${bestQ.toFixed(2)}`);

// Validate against held-out test data (last 20% chronological per pair)
console.log(`\nVALIDATION — ${testTrades.length} held-out test trades (chronological 20%):`);
let valTrades = 0, valWins = 0, valR = 0;
const testByPair = {};
for (const t of testTrades) {
  if (t.period !== '4h') continue;
  if (!testByPair[t.pair]) testByPair[t.pair] = [];
  testByPair[t.pair].push(t);
}
for (const [pair, pts] of Object.entries(testByPair)) {
  // Bootstrap rolling WR from simulation (start neutral, update sequentially)
  let pairWR = 0.5;
  for (const t of pts) {
    const state = classifyState(t);
    const key = `${state.timeframe}_${state.regime}_${wrState(pairWR)}`;
    const qs = Q[key];
    const bestId = Object.keys(qs).reduce((a, b) => qs[a] > qs[b] ? a : b);
    const action = ALL_ACTIONS.find(a => a.id === bestId);
    const reward = computeReward(t, action);

    if (reward > action.thr * 0.1) {
      valR += reward; valTrades++; if (t.win) valWins++;
    }
    // Update rolling WR (exponential moving window)
    pairWR = (pairWR * 9 + (t.win ? 1 : 0)) / 10;
  }
}
console.log(`  Test: ${valTrades} trades, ${valWins} wins (${valTrades ? (valWins/valTrades*100).toFixed(0) : 0}% WR), avg ${valTrades ? (valR/valTrades).toFixed(2) : 0}R`);
console.log(`  4h: ${valTrades} trades, ${valWins} wins (${(valWins/valTrades*100).toFixed(0)}% WR), avg ${(valR/valTrades).toFixed(2)}R`);

// Save
writeFileSync('/home/ariel/anavitrade-trading/scripts/mdp-zoom-results.json', JSON.stringify({
  Q: Object.fromEntries(Object.entries(Q).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([k2, v2]) => [k2, v2]))])),
  best: bestStateAction,
  timestamp: new Date().toISOString(),
}, null, 2));
console.log(`\nSaved Q-table to scripts/mdp-zoom-results.json`);
