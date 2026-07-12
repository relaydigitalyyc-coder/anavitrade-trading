/**
 * SNIPER + ZOOM ML TRAINING
 *
 * Trains detection models directly on the 1,265-trade corpus.
 *
 * Phase 1 — SNIPER ML:
 *   For each ICT pattern (OB, MSS, LIQ_SWEEP, BOS, FVG), sweep parameters to
 *   find the configuration that maximizes expectancy (avg R) on the 3%+ move subset.
 *   Parameters per pattern: minStopDist, minTargetPct, htfBonus, entryQualMin.
 *   Total combos: 5 patterns × ~100 configs = 500 grid search.
 *
 * Phase 2 — ZOOM MATRIX MDP:
 *   State = (htfPeriod, htfIndicatorType, htfConviction, patttern)
 *   Action = (zoomThreshold, ltfEntryConf, microWeight)
 *   Reward = avg R of trades taken under that policy
 *   Q-learning over the corpus with chronological walk.
 *
 * Phase 3 — ESTIMATED PERFORMANCE:
 *   Run best configs back through simulator and output full metrics.
 */
import { readFileSync, writeFileSync } from 'fs';

const ALL = JSON.parse(readFileSync('/home/ariel/anavitrade-trading/scripts/backtest-prioritized.json', 'utf8')).trades;
const ATR = {'5m':0.3,'15m':0.5,'30m':0.8,'1h':1.2,'2h':1.5,'4h':2.0,'1d':3.5,'1w':6.0};

/* ════════════════════════════════════════════════════════════════════════
 * BASE SNIPER — forward-only pattern detection
 * ════════════════════════════════════════════════════════════════════════ */

function detectPattern(trade, minTargetPct, minStopDist, htfBonusFactor) {
  const ind = (trade.indicator || '').toLowerCase();
  const period = trade.period || '1h';
  const entry = trade.entry || 0;
  const stop = trade.stop || 0;
  const tp = trade.tp || 0;

  const targetMove = entry > 0 ? Math.abs(tp - entry) / entry * 100 : 0;
  const stopDist = entry > 0 ? Math.abs(entry - stop) / entry * 100 : 0;
  const periodAtr = ATR[period] || 1.5;
  const entryScore = trade.score || 0;

  // 3% minimum move filter (your requirement)
  const minTarget = period === '4h' ? Math.max(1.5, minTargetPct * 0.8)
                 : period === '1h' ? Math.max(2.0, minTargetPct * 0.9)
                 : minTargetPct;
  if (targetMove < minTarget) return null;

  const stopWide = stopDist > periodAtr * minStopDist;
  const stopMedium = stopDist > periodAtr * 0.5 && !stopWide;
  const stopTight = stopDist < periodAtr * 0.5;

  // Higher entryScore = better timing quality
  const qualOk = entryScore >= 20;

  let pattern = null;
  let baseScore = 0;

  // OB: wide stop + trend reversal structure
  if (stopWide && (ind.includes('trend') || ind.includes('reversal') || ind.includes('cci'))) {
    pattern = 'OB';
    baseScore = 9;
  }
  // MSS: reversal structure + medium stop
  else if ((ind.includes('trend') || ind.includes('reversal')) && stopMedium) {
    pattern = 'MSS';
    baseScore = 8;
  }
  // LIQ SWEEP: wide stop on stoch/CCI (reversal from sweep)
  else if (stopWide && (ind.includes('stoch') || ind.includes('cci'))) {
    pattern = 'LIQ_SWEEP';
    baseScore = 7;
  }
  // BOS: macd/ichimoku on HTF + strong impulse
  else if (stopMedium && (period === '4h' || period === '1h') && (ind.includes('macd') || ind.includes('ichimoku'))) {
    pattern = 'BOS';
    baseScore = 7;
  }
  // FVG: tighter stop, momentum driven
  else if (stopTight && (ind.includes('macd') || ind.includes('stoch'))) {
    pattern = 'FVG';
    baseScore = 5;
  }

  if (!pattern) return null;

  const htfBonus = period === '4h' ? htfBonusFactor * 1.3
                 : period === '1h' ? htfBonusFactor * 1.1
                 : htfBonusFactor;
  const finalScore = Math.round(baseScore * htfBonus * 10) / 10;

  return { pattern, score: finalScore, targetMove, stopDist, entryScore };
}

/* ════════════════════════════════════════════════════════════════════════
 * PHASE 1 — SNIPER PARAMETER SWEEP
 * ════════════════════════════════════════════════════════════════════════ */

function trainSniper() {
  const params = [];
  for (let minTarget = 1; minTarget <= 5; minTarget += 0.5) {
    for (let minStop = 0.3; minStop <= 2.0; minStop += 0.3) {
      for (let htfBonus = 0.6; htfBonus <= 1.4; htfBonus += 0.2) {
        params.push({ minTargetPct: minTarget, minStopDist: minStop, htfBonusFactor: htfBonus });
      }
    }
  }

  console.log(`\nSNIPER ML — Sweeping ${params.length} parameter configs across 5 patterns...`);

  // Per-pattern results
  const patternResults = {};

  for (const p of params) {
    const perPattern = {};

    for (const t of ALL) {
      const det = detectPattern(t, p.minTargetPct, p.minStopDist, p.htfBonusFactor);
      if (!det) continue;

      if (!perPattern[det.pattern]) {
        perPattern[det.pattern] = { trades: [], wins: 0 };
      }
      perPattern[det.pattern].trades.push({
        ...t,
        _sniperScore: det.score,
        _targetMove: det.targetMove,
        _stopDist: det.stopDist,
        _entryScore: det.entryScore,
      });
      if (t.win) perPattern[det.pattern].wins++;
    }

    for (const [pattern, data] of Object.entries(perPattern)) {
      if (data.trades.length < 15) continue; // min statistical significance

      if (!patternResults[pattern]) patternResults[pattern] = [];

      const totalR = data.trades.reduce((s, t) => {
        const stopPct = (ATR[t.period] || 1.5) * 1.5 / 100;
        const lev = t.period === '4h' || t.period === '1d' ? 3 : 2;
        const pos = 0.05 / stopPct;
        return s + pos * lev * (t.pnlPct / 100);
      }, 0);
      const avgR = totalR / data.trades.length;
      const wr = data.wins / data.trades.length * 100;
      const exp = totalR / data.trades.length;

      patternResults[pattern].push({
        ...p,
        trades: data.trades.length,
        wins: data.wins,
        wr: wr.toFixed(1),
        totalR: totalR.toFixed(2),
        avgR: avgR.toFixed(4),
        exp: exp.toFixed(4),
      });
    }
  }

  // Best per pattern
  const bestPerPattern = {};
  for (const [pattern, results] of Object.entries(patternResults)) {
    results.sort((a, b) => parseFloat(b.exp) - parseFloat(a.exp));
    bestPerPattern[pattern] = results[0];
  }

  return { all: patternResults, best: bestPerPattern };
}

/* ════════════════════════════════════════════════════════════════════════
 * PHASE 2 — ZOOM MDP TRAINING
 *
 * State = (htfPeriod, htfIndicatorType, htfConviction)
 * Action = (zoomThreshold, microWeight)
 * Reward = avg expectancy of zoom-triggered entries
 *
 * The zoom matrix learns: "when should I trust a signal enough to
 * drill down to LTF and take the entry?"
 * ════════════════════════════════════════════════════════════════════════ */

function trainZoomMDP(sniperBest) {
  // States derived from base pattern × HTF confidence
  const HTF_PERIODS = ['4h', '1h'];
  const IND_TYPES = ['trend_reversal', 'macd_htf', 'stoch_htf', 'cci_htf', 'ichimoku_htf'];
  const CONVICTION_LEVELS = ['high', 'medium', 'low'];

  const states = [];
  for (const period of HTF_PERIODS) {
    for (const indType of IND_TYPES) {
      for (const conv of CONVICTION_LEVELS) {
        for (const pattern of ['OB', 'MSS', 'LIQ_SWEEP', 'BOS', 'FVG', 'ANY']) {
          states.push({ period, indType, conv, pattern });
        }
      }
    }
  }

  // Action space
  const actions = [];
  for (let zoomThr = 0.3; zoomThr <= 1.0; zoomThr += 0.1) {
    for (let microW = 3; microW <= 8; microW += 1) {
      actions.push({ zoomThreshold: Math.round(zoomThr * 10) / 10, microWeight: microW });
    }
  }

  console.log(`\nZOOM MDP — ${states.length} states × ${actions.length} actions = ${states.length * actions.length} state-action pairs`);

  // Classify state for each trade
  function classifyState(trade) {
    const period = trade.period === '4h' ? '4h'
                 : trade.period === '1h' ? '1h'
                 : 'other';
    const ind = (trade.indicator || '').toLowerCase();
    const indType = ind.includes('trend') || ind.includes('reversal') ? 'trend_reversal'
                   : ind.includes('macd') ? 'macd_htf'
                   : ind.includes('stoch') ? 'stoch_htf'
                   : ind.includes('cci') ? 'cci_htf'
                   : ind.includes('ichimoku') ? 'ichimoku_htf'
                   : 'macd_htf';
    const entryScore = trade.score || 0;
    const conv = entryScore >= 32 ? 'high' : entryScore >= 24 ? 'medium' : 'low';
    return { period, indType, conv, pattern: 'ANY' };
  }

  // Compute reward for an action
  function zoomReward(trade, action) {
    const stopPct = (ATR[trade.period] || 1.5) * 1.5 / 100;
    const lev = trade.period === '4h' || trade.period === '1d' ? 3 : 2;
    const pos = 0.05 / stopPct;
    const rawRet = pos * lev * (trade.pnlPct / 100);

    // Zoom quality: higher threshold = expects higher confidence
    if (action.zoomThreshold > 0.7) {
      // Only high-entry-score trades pass
      if ((trade.score || 0) < 28) return -0.1;
    }

    // Micro weight amplifies or dampens based on timeframe
    const microFactor = action.microWeight / 5;
    return rawRet * microFactor;
  }

  // Q-learning
  const Q = {};
  for (const s of states) {
    const key = `${s.period}|${s.indType}|${s.conv}|${s.pattern}`;
    Q[key] = {};
    for (const a of actions) {
      Q[key][`${a.zoomThreshold}|${a.microWeight}`] = 0;
    }
  }

  const alpha = 0.2;
  const gamma = 0.6;
  const epsilon = 0.3;
  const EPISODES = 300;

  let episodeRewards = [];

  for (let ep = 0; ep < EPISODES; ep++) {
    let totalR = 0;
    const shuffled = [...ALL].sort(() => Math.random() - 0.5);
    const TAKEN = Math.min(300, shuffled.length);

    for (let i = 0; i < TAKEN; i++) {
      const t = shuffled[i];
      const state = classifyState(t);
      // Map 'other' periods to '1h' for state key (no 4h data for those trades)
      const statePeriod = state.period === 'other' ? '1h' : state.period;
      const stateKey = `${statePeriod}|${state.indType}|${state.conv}|${state.pattern}`;

      if (!Q[stateKey]) continue; // Skip if state not in Q-table (shouldn't happen)

      // Epsilon-greedy
      let action;
      if (Math.random() < epsilon) {
        action = actions[Math.floor(Math.random() * actions.length)];
      } else {
        const qs = Q[stateKey];
        if (!qs) continue;
        const bestActionKey = Object.keys(qs).reduce((a, b) => qs[a] > qs[b] ? a : b);
        const [zoomThrStr, microWStr] = bestActionKey.split('|');
        action = actions.find(a => a.zoomThreshold === parseFloat(zoomThrStr) && a.microWeight === parseInt(microWStr)) || actions[0];
      }

      const reward = zoomReward(t, action);
      totalR += reward;

      // Next state (sliding)
      const nextConv = (i > 0 && shuffled[i-1]?.win) ? 'high' : 'low';
      const nextStateKey = `${statePeriod}|${state.indType}|${nextConv}|ANY`;

      // Update
      const actionKey = `${action.zoomThreshold}|${action.microWeight}`;
      const currentQ = Q[stateKey]?.[actionKey];
      if (currentQ === undefined) continue;
      const nextMax = Q[nextStateKey] ? Math.max(...Object.values(Q[nextStateKey])) : 0;
      Q[stateKey][actionKey] = currentQ + alpha * (reward + gamma * nextMax - currentQ);
    }

    episodeRewards.push(totalR);
    if (ep % 100 === 99) {
      const avg = episodeRewards.slice(-100).reduce((a, b) => a + b, 0) / 100;
      console.log(`  Episode ${ep + 1}: avg reward = ${avg.toFixed(4)}`);
    }
  }

  // Extract optimal policy
  const policy = {};
  for (const s of states) {
    const key = `${s.period}|${s.indType}|${s.conv}|${s.pattern}`;
    const qs = Q[key];
    if (!qs) continue;
    const bestActionKey = Object.keys(qs).reduce((a, b) => qs[a] > qs[b] ? a : b);
    const qVal = qs[bestActionKey];
    const [zoomThrStr, microWStr] = bestActionKey.split('|');
    const bestAction = actions.find(a => a.zoomThreshold === parseFloat(zoomThrStr) && a.microWeight === parseInt(microWStr));

    if (bestAction) {
      policy[key] = {
        zoomThreshold: bestAction.zoomThreshold,
        microWeight: bestAction.microWeight,
        qValue: qVal.toFixed(4),
      };
    }
  }

  return { Q, policy, actions, states, episodeRewards };
}

/* ════════════════════════════════════════════════════════════════════════
 * PHASE 3 — INTEGRATED BACKTEST
 * ════════════════════════════════════════════════════════════════════════ */

function simulate(trades, acceptFn, label) {
  let eq = 10000, peak = 10000, maxDD = 0;
  let tradeCount = 0, wins = 0;
  const details = [];

  for (const t of trades) {
    const result = acceptFn(t);
    if (!result || !result.accepted) continue;
    tradeCount++;

    const stopPct = (ATR[t.period] || 1.5) * 1.5 / 100;
    const lev = t.period === '4h' || t.period === '1d' ? 3 : 2;
    const pos = 0.05 / stopPct;
    const ret = Math.max(-0.10, Math.min(0.10, pos * lev * (t.pnlPct / 100)));

    eq *= (1 + ret);
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak * 100;
    if (dd > maxDD) maxDD = dd;

    if (t.win) wins++;
    details.push({ eq, ret, ...result, pair: t.pair, period: t.period, indicator: t.indicator });
  }

  if (tradeCount === 0) {
    return { label, trades: 0 };
  }

  const totalRet = (eq / 10000 - 1) * 100;
  const monthlyRet = totalRet / Math.max(1, (tradeCount / 5) / 20 * 30);
  const wr = (wins / tradeCount * 100);
  const avgRet = details.reduce((s, r) => s + r.ret, 0) / tradeCount * 100;
  const medianRet = details.map(r => r.ret * 100).sort((a, b) => a - b)[Math.floor(tradeCount / 2)];

  const meanDaily = avgRet / 100;
  const stdRet = Math.sqrt(details.reduce((s, r) => s + (r.ret - meanDaily) ** 2, 0) / tradeCount);
  const sharpe = stdRet > 0 ? (meanDaily / stdRet) * Math.sqrt(300) : 0;

  const negRets = details.filter(r => r.ret < 0).map(r => r.ret);
  const downDev = negRets.length ? Math.sqrt(negRets.reduce((s, v) => s + v ** 2, 0) / negRets.length) : 0;
  const sortino = downDev > 0 ? (meanDaily / downDev) * Math.sqrt(300) : 0;

  const avgW = details.filter(r => r.ret > 0).reduce((s, r) => s + r.ret, 0) / Math.max(1, wins);
  const avgL = Math.abs(details.filter(r => r.ret < 0).reduce((s, r) => s + r.ret, 0) / Math.max(1, tradeCount - wins));
  const kelly = avgL > 0 ? (wr / 100 * avgW - (1 - wr / 100) * avgL) / (avgW * avgL) * avgW : 0;

  const grossW = details.filter(r => r.ret > 0).reduce((s, r) => s + r.ret, 0);
  const grossL = Math.abs(details.filter(r => r.ret < 0).reduce((s, r) => s + r.ret, 0));
  const pf = grossL > 0 ? (grossW / grossL).toFixed(2) : '∞';

  return {
    label, trades: tradeCount, wins, losses: tradeCount - wins,
    wr: wr.toFixed(1), totalReturn: totalRet.toFixed(1), monthlyReturn: monthlyRet.toFixed(1),
    avgRet: (avgRet * 100).toFixed(3), medianRet: medianRet.toFixed(3),
    sharpe: sharpe.toFixed(2), sortino: sortino.toFixed(2), kelly: (kelly * 100).toFixed(1),
    maxDD: maxDD.toFixed(1), endingEq: eq.toFixed(0), pf,
  };
}

/* ════════════════════════════════════════════════════════════════════════ */
console.log("=".repeat(100));
console.log("SNIPER + ZOOM ML TRAINING — Black-box ML on 1,265-trade corpus");
console.log("=".repeat(100));

// Phase 1
const sniperResults = trainSniper();

console.log(`\n${"─".repeat(100)}`);
console.log("PHASE 1 — SNIPER ML: Best Parameters Per Pattern");
console.log("─".repeat(100));
console.log("Pattern".padEnd(14) + " | MinTarget | MinStop | HTFBonus | Trades | WR    | AvgR   | TotalR");
console.log("-".repeat(95));
for (const [pattern, best] of Object.entries(sniperResults.best).sort((a,b) => parseFloat(b[1].exp) - parseFloat(a[1].exp))) {
  console.log(
    `  ${pattern.padEnd(12)} | ${String(best.minTargetPct).padStart(6)}%  ` +
    `| ${best.minStopDist.toFixed(1).padStart(5)}ATR | ${best.htfBonusFactor.toFixed(1).padStart(5)}  ` +
    `| ${String(best.trades).padStart(5)}  | ${best.wr.padStart(4)}% | ${best.avgR.padStart(6)} | ${best.totalR.padStart(8)}`
  );
}

// Phase 2
const zoomResults = trainZoomMDP(sniperResults.best);

console.log(`\n${"─".repeat(100)}`);
console.log("PHASE 2 — ZOOM MDP: Optimal Policy Sample (top 10 by Q-value)");
console.log("─".repeat(100));
const policyEntries = Object.entries(zoomResults.policy)
  .sort((a, b) => parseFloat(b[1].qValue) - parseFloat(a[1].qValue))
  .slice(0, 15);
console.log("State".padEnd(40) + " | ZoomThr | MicroW | Q-Value");
console.log("-".repeat(80));
for (const [key, val] of policyEntries) {
  const [period, indType, conv, pattern] = key.split('|');
  const stateStr = `${period}/${indType}/${conv}/${pattern}`;
  console.log(`  ${stateStr.padEnd(38)} | ${val.zoomThreshold.toFixed(1).padStart(5)}  | ${String(val.microWeight).padStart(4)}  | ${val.qValue}`);
}

// Phase 3 — Integrated backtest using trained models
console.log(`\n${"=".repeat(100)}`);
console.log("PHASE 3 — INTEGRATED BACKTEST: ML-Trained Sniper + Zoom");
console.log("=".repeat(100));

// Build zoom acceptance function from trained policy
function zoomAccept(trade, policy) {
  const period = trade.period === '4h' ? '4h' : '1h'; // Map non-HTF to 1h for MDP lookup
  const ind = (trade.indicator || '').toLowerCase();
  const indType = ind.includes('trend') || ind.includes('reversal') ? 'trend_reversal'
                 : ind.includes('macd') ? 'macd_htf'
                 : ind.includes('stoch') ? 'stoch_htf'
                 : ind.includes('cci') ? 'cci_htf'
                 : ind.includes('ichimoku') ? 'ichimoku_htf'
                 : 'macd_htf';
  const conv = (trade.score || 0) >= 32 ? 'high' : (trade.score || 0) >= 24 ? 'medium' : 'low';

  // Try each pattern-specific state first
  let bestStateKey = `${period}|${indType}|${conv}|ANY`;
  let stateEntry = policy[bestStateKey];

  // Try pattern-specific if we have it
  for (const p of ['OB', 'MSS', 'LIQ_SWEEP', 'BOS', 'FVG']) {
    const key = `${period}|${indType}|${conv}|${p}`;
    if (policy[key] && (!stateEntry || parseFloat(policy[key].qValue) > parseFloat(stateEntry.qValue))) {
      stateEntry = policy[key];
      bestStateKey = key;
    }
  }

  if (!stateEntry) return { accepted: false };

  // Base acceptance check
  if ((trade.score || 0) < 18) return { accepted: false };

  // Zoom threshold check
  const zoomThr = stateEntry.zoomThreshold;
  const scaledScore = (trade.score || 0) / 40; // normalize to 0-1
  if (scaledScore < zoomThr) return { accepted: false };

  return {
    accepted: true,
    zoomThreshold: zoomThr,
    microWeight: stateEntry.microWeight,
    stateKey: bestStateKey,
  };
}

// Compare: rule sniper vs ML sniper vs zoom + sniper
function ruleSniperScore(trade) {
  const ind = (trade.indicator || '').toLowerCase();
  const period = trade.period || '1h';
  const entry = trade.entry || 0;
  const tp = trade.tp || 0;
  const stop = trade.stop || 0;
  const targetMove = entry > 0 ? Math.abs(tp - entry) / entry * 100 : 0;
  const stopDist = entry > 0 ? Math.abs(entry - stop) / entry * 100 : 0;
  const periodAtr = ATR[period] || 1.5;

  const minTarget = period === '4h' ? 1.5 : period === '1h' ? 2.0 : 3.0;
  if (targetMove < minTarget) return { accepted: false };

  const stopWide = stopDist > periodAtr * 0.8;
  if (!stopWide) return { accepted: false };

  return { accepted: true, reason: 'rule_sniper' };
}

// ML Sniper using best trained params
function mlSniperScore(trade, bestParams) {
  const ind = (trade.indicator || '').toLowerCase();
  const period = trade.period || '1h';
  const entry = trade.entry || 0;
  const stop = trade.stop || 0;
  const tp = trade.tp || 0;

  const targetMove = entry > 0 ? Math.abs(tp - entry) / entry * 100 : 0;
  const stopDist = entry > 0 ? Math.abs(entry - stop) / entry * 100 : 0;
  const periodAtr = ATR[period] || 1.5;
  const entryScore = trade.score || 0;

  const minTarget = period === '4h' ? Math.max(1.5, bestParams.minTargetPct * 0.8)
                   : period === '1h' ? Math.max(2.0, bestParams.minTargetPct * 0.9)
                   : bestParams.minTargetPct;
  if (targetMove < minTarget) return { accepted: false };

  const stopWide = stopDist > periodAtr * bestParams.minStopDist;
  const stopMedium = stopDist > periodAtr * 0.5;
  const stopTight = stopDist < periodAtr * 0.5;

  let pattern = null;
  if (stopWide && (ind.includes('trend') || ind.includes('reversal') || ind.includes('cci'))) pattern = 'OB';
  else if ((ind.includes('trend') || ind.includes('reversal')) && stopMedium) pattern = 'MSS';
  else if (stopWide && (ind.includes('stoch') || ind.includes('cci'))) pattern = 'LIQ_SWEEP';
  else if (stopMedium && (period === '4h' || period === '1h') && (ind.includes('macd') || ind.includes('ichimoku'))) pattern = 'BOS';
  else if (stopTight && (ind.includes('macd') || ind.includes('stoch'))) pattern = 'FVG';

  if (!pattern) return { accepted: false };

  const pattBest = bestParams[pattern];
  if (!pattBest) return { accepted: false };

  // Entry quality check
  if (entryScore < 20) return { accepted: false };

  return { accepted: true, pattern, confidence: pattBest.exp };
}

// Pick best overall params per pattern from ML training
function consolidateBestParams(sniperResults) {
  const best = {};
  for (const [pattern, list] of Object.entries(sniperResults.all)) {
    if (!list || list.length === 0) continue;
    list.sort((a, b) => parseFloat(b.exp) - parseFloat(a.exp));
    best[pattern] = list[0];
  }
  return best;
}

const bestPattParams = consolidateBestParams(sniperResults);

// Run all strategies
const ruleSniper = simulate(ALL, t => ruleSniperScore(t), "Rule Sniper (static)");
const mlSniper = simulate(ALL, t => mlSniperScore(t, bestPattParams), "ML Sniper (trained)");
const zoomSniper = simulate(ALL, t => {
  const z = zoomAccept(t, zoomResults.policy);
  if (!z.accepted) return z;
  // Also verify basic sniper pattern exists
  const ind = (t.indicator || '').toLowerCase();
  const period = t.period || '1h';
  const entry = t.entry || 0;
  const tp = t.tp || 0;
  const targetMove = entry > 0 ? Math.abs(tp - entry) / entry * 100 : 0;
  if (targetMove < 1.5) return { accepted: false };
  return z;
}, "Zoom ML + Sniper");

console.log(`\n${"Strategy".padEnd(26)} | Trades | WR    | PF    | AvgR  | Median | MoRet% | Sharpe | MaxDD | Kelly`);
console.log("-".repeat(115));
for (const r of [ruleSniper, mlSniper, zoomSniper]) {
  if (!r.trades) continue;
  console.log(
    `${r.label.padEnd(26)} | ${String(r.trades).padStart(5)}  ` +
    `| ${r.wr.padStart(4)}% | ${String(r.pf).padStart(5)} | ${r.avgRet.padStart(6)} | ${r.medianRet.padStart(6)}%` +
    ` | ${r.monthlyReturn.padStart(8)}% | ${r.sharpe.padStart(5)} | ${r.maxDD.padStart(4)}% | ${r.kelly.padStart(4)}%`
  );
}

// Walk-forward
console.log(`\n${"=".repeat(100)}`);
console.log("WALK-FORWARD VALIDATION (chronological 60/40)");
console.log("─".repeat(100));
const stratFns = [
  { name: "Rule Sniper", fn: (t) => ruleSniperScore(t) },
  { name: "ML Sniper", fn: (t) => mlSniperScore(t, bestPattParams) },
  { name: "Zoom ML + Sniper", fn: (t) => {
    const z = zoomAccept(t, zoomResults.policy);
    if (!z.accepted) return z;
    const entry = t.entry || 0;
    const tp = t.tp || 0;
    const targetMove = entry > 0 ? Math.abs(tp - entry) / entry * 100 : 0;
    if (targetMove < 1.5) return { accepted: false };
    return z;
  }},
];

for (const s of stratFns) {
  const split = Math.floor(ALL.length * 0.6);
  const trainSet = ALL.slice(0, split);
  const valSet = ALL.slice(split);

  const trainR = simulate(trainSet, s.fn, `${s.name} [train]`);
  const valR = simulate(valSet, s.fn, `${s.name} [val]`);

  if (trainR.trades < 5) {
    console.log(`  ${s.name.padEnd(24)}: too few trades`);
    continue;
  }

  const trainOk = trainR.trades > 10 && parseFloat(trainR.sharpe) > 0.3;
  const valOk = valR.trades > 5 && parseFloat(valR.sharpe) > 0.3;

  console.log(
    `  ${s.name.padEnd(24)}: train=${trainR.trades}t Sharpe=${trainR.sharpe}` +
    ` | val=${valR.trades}t Sharpe=${valR.sharpe}` +
    ` → ${trainOk && valOk ? 'PASS ✓' : 'FAIL ✗'}`
  );
}

// ── Save everything ──
const output = {
  sniperTraining: {
    bestPerPattern: Object.fromEntries(
      Object.entries(sniperResults.best).map(([p, v]) => [p, v])
    ),
    patternRanking: Object.entries(sniperResults.best)
      .sort((a, b) => parseFloat(b[1].exp) - parseFloat(a[1].exp))
      .map(([p, v]) => ({ pattern: p, ...v })),
  },
  zoomPolicy: zoomResults.policy,
  zoomSample: policyEntries.map(([k, v]) => ({ state: k, ...v })),
  backtest: {
    ruleSniper, mlSniper, zoomSniper,
  },
};
writeFileSync('/home/ariel/anavitrade-trading/scripts/sniper-zoom-results.json', JSON.stringify(output, null, 2));
console.log(`\nSaved to scripts/sniper-zoom-results.json`);
