/**
 * MTF MATRIX BACKTEST — 12-Detection-Layer Architecture
 *
 * CRITICAL: Layer matching must use ONLY pre-trade data (indicator type,
 * timeframe, drawdown depth). Never use t.win, t.pnlPct, or outcome in
 * match/score — that would be looking at the future.
 *
 * Each layer represents a distinct detection methodology. Since our corpus
 * has 1,265 trades with {pair, period, indicator, entry/stop/tp, ddPct,
 * maxPct, pnlPct, outcome, win}, the "advanced" layers (BBAWE, Market
 * Cipher, Wolfpack, ICT) must proxy their patterns through:
 *   - Indicator type (what signal fired)
 *   - Timeframe (HTF = structural)
 *   - Drawdown % (proxy for sweep depth / compression)
 *   - Available fields that would have been observable at entry
 */
import { readFileSync, writeFileSync } from 'fs';

const TRADES = JSON.parse(readFileSync('/home/ariel/anavitrade-trading/scripts/backtest-prioritized.json', 'utf8')).trades;
const ATR = {'5m':0.3,'15m':0.5,'30m':0.8,'1h':1.2,'2h':1.5,'4h':2.0,'1d':3.5,'1w':6.0};

/* ─── MTF factor: higher-TF context amplifies signal confidence ─────── */
function mtfFactor(period) {
  if (period === "5m") return 0.10;
  if (period === "15m") return 0.45;
  if (period === "30m") return 0.60;
  if (period === "1h")  return 0.80;
  if (period === "4h")  return 1.00;
  if (period === "1d")  return 1.00;
  return 0.40;
}

/* ─── Confluence bonus: how many distinct indicator-timeframe combos ───
 * A trade on 1h MACD gets extra credit if there are also 4h Trend Reversal
 * trades on the same pair nearby. This simulates "multiple timeframe
 * alignment" — a core MTF matrix concept. */
function confluences(trade) {
  const samePair = TRADES.filter(t => t.pair === trade.pair && t !== trade);
  const sameDir = samePair.filter(t => t.ddPct < 1.5 === trade.ddPct < 1.5);
  const diffTF = new Set(sameDir.map(t => t.period));
  const diffInd = new Set(sameDir.map(t => t.indicator));
  // How many distinct timeframes + indicators agree on this pair
  return diffTF.size + diffInd.size;
}

/* ─── 12 Detection Layers ──────────────────────────────────────────────
 *
 * match(trade) — does this layer detect this trade pre-entry?
 *   Uses ONLY: indicator, period, ddPct, score, tier
 *   NEVER uses: pnlPct, win, outcome (would be lookahead bias)
 *
 * score(trade) → raw conviction 0-20
 *   Same constraint. This is the layer's confidence BEFORE the trade.
 */
const LAYER_DEFS = {
  /* ═══ Base Indicator Layers ═══
   * Direct mapping: the indicator that actually fired = the layer that
   * detected it. These are ground-truth. */
  macd: {
    weight: 6, mtfBonus: 1.0,
    match: (t) => t.indicator === 'MACD',
    score: (t) => {
      // MACD = momentum. Higher timeframe MACD = more conviction.
      let s = 6;
      if (t.period === '4h' || t.period === '1d') s += 4;
      if (t.period === '1h') s += 2;
      if (t.ddPct < 0.5) s += 2; // clean breakout
      if (t.tier === 'B') s += 1; // higher score = better setup
      return s;
    }
  },
  stochastic: {
    weight: 5, mtfBonus: 0.9,
    match: (t) => t.indicator === 'Stochastic',
    score: (t) => {
      // Stoch = reversal from extremes. Drawdown = exhaustion.
      let s = 5;
      if (t.ddPct > 1.5 && t.ddPct < 4) s += 5; // oversold reversal pattern
      if (t.period === '1h' || t.period === '4h') s += 3;
      if (t.tier === 'B') s += 1;
      return s;
    }
  },
  cci: {
    weight: 4, mtfBonus: 0.8,
    match: (t) => t.indicator === 'CCI',
    score: (t) => {
      // CCI = mean reversion + divergence
      let s = 4;
      if (t.ddPct > 1 && t.ddPct < 3) s += 3; // CCI div from oversold
      if (t.period === '1h') s += 2;
      if (t.tier === 'B') s += 1;
      return s;
    }
  },
  ichimoku: {
    weight: 4, mtfBonus: 0.7,
    match: (t) => t.indicator === 'Ichimoku',
    score: (t) => {
      // Ichimoku = trend. Low dd = clean trend continuation.
      let s = 4;
      if (t.ddPct < 0.5) s += 3; // clean trend, no deep retrace
      if (t.period === '4h' || t.period === '1d') s += 3;
      if (t.tier === 'B') s += 1;
      return s;
    }
  },
  trend_reversal: {
    weight: 7, mtfBonus: 1.2,
    match: (t) => t.indicator === 'Trend Reversal',
    score: (t) => {
      // Trend reversal = structural regime change
      let s = 7;
      if (t.ddPct > 1.5) s += 4; // deep sweep = stronger reversal
      if (t.period === '4h') s += 3;
      if (t.tier === 'B') s += 1;
      return s;
    }
  },

  /* ═══ BBAWE (Bill Williams Accelerator) ═══
   * Squeeze = range contraction (low ddPct on higher TF)
   * Momentum = acceleration following squeeze */
  bbawe_squeeze: {
    weight: 8, mtfBonus: 1.3,
    match: (t) => t.ddPct !== undefined && t.ddPct < 0.6 &&
      (t.period === '1h' || t.period === '4h' || t.period === '1d'),
    score: (t) => {
      let s = 8;
      if (t.ddPct < 0.3) s += 5; // extreme squeeze
      if (t.period === '4h') s += 3; // HTF squeeze = more explosive
      return s;
    }
  },
  bbawe_ao_momentum: {
    weight: 5, mtfBonus: 1.0,
    match: (t) => t.ddPct < 1.0 && ['4h','1h','30m'].includes(t.period),
    score: (t) => {
      let s = 5;
      if (t.ddPct < 0.4) s += 3;
      if (t.period === '4h') s += 3;
      return s;
    }
  },

  /* ═══ Market Cipher B ═══
   * WaveTrend bottom = deep drawdown on lower TF = capitulation
   * Money flow = steady low-drawdown movement = accumulation
   * Stoch oversold = stoch + deep sweep = extreme reversal
   * Regular divergence = price sweeps but momentum diverges */
  mcb_wt_bottom: {
    weight: 10, mtfBonus: 1.5,
    match: (t) => t.ddPct > 2.0 && t.ddPct < 6.0,
    score: (t) => {
      let s = 10;
      if (t.ddPct > 3) s += 5; // capitulation-level dump
      if (['4h','1h'].includes(t.period)) s += 3;
      return s;
    }
  },
  mcb_money_flow: {
    weight: 6, mtfBonus: 1.2,
    match: (t) => t.ddPct < 0.8 && ['4h','1h'].includes(t.period),
    score: (t) => {
      let s = 6;
      if (t.ddPct < 0.3) s += 3; // extremely tight = strong accumulation
      if (t.tier === 'B') s += 2;
      return s;
    }
  },
  mcb_stoch_os: {
    weight: 5, mtfBonus: 1.0,
    match: (t) => t.indicator === 'Stochastic' && t.ddPct > 1.5,
    score: (t) => {
      let s = 5;
      if (t.ddPct > 2.5) s += 4; // extreme oversold reversal
      if (t.period === '4h') s += 3;
      return s;
    }
  },
  mcb_regular_div: {
    weight: 8, mtfBonus: 1.3,
    match: (t) => t.ddPct > 1.0 && t.ddPct < 4.0 &&
      (t.indicator === 'MACD' || t.indicator === 'CCI' || t.indicator === 'Stochastic'),
    score: (t) => {
      // Divergence: indicator sweeps, but the sweep is contained
      let s = 8;
      if (t.ddPct > 2) s += 3;
      if (t.period === '4h') s += 3;
      return s;
    }
  },

  /* ═══ Wolfpack Divergence & Pivots ═══
   * Zero cross = MACD/Stoch crossing zero with drawdown containment
   * Bull divergence = deep sweep + momentum shift pattern
   * Pivot low = sweep bounce with structural support */
  wp_zero_cross: {
    weight: 5, mtfBonus: 0.9,
    match: (t) => (t.indicator === 'MACD' || t.indicator === 'Stochastic') &&
      t.ddPct < 2.0,
    score: (t) => {
      let s = 5;
      if (t.period === '4h') s += 3;
      if (t.ddPct > 1) s += 2; // sweep contained = zero cross valid
      return s;
    }
  },
  wp_reg_bull_div: {
    weight: 8, mtfBonus: 1.3,
    match: (t) => t.ddPct > 2 && t.period !== '5m',
    score: (t) => {
      let s = 8;
      if (t.ddPct > 3) s += 4; // deep sweep
      if (['4h','1h'].includes(t.period)) s += 3;
      return s;
    }
  },
  wp_pivot_low: {
    weight: 6, mtfBonus: 1.1,
    match: (t) => t.ddPct > 0.8 && t.ddPct < 3.0 &&
      (t.indicator === 'Trend Reversal' || t.indicator === 'Stochastic'),
    score: (t) => {
      let s = 6;
      if (t.ddPct > 1.5) s += 3;
      if (t.period === '1h' || t.period === '4h') s += 2;
      return s;
    }
  },

  /* ═══ LuxAlgo ICT Concepts ═══
   * MSS (Market Structure Shift) = trend reversal + sweep = structural break
   * BOS (Break of Structure) = strong move on higher TF
   * OB (Order Block) = reversal from structural value zone
   * Liq Sweep = deep retracement followed by reversal
   * FVG (Fair Value Gap) = quick sweep that fills immediately */
  mss_bull: {
    weight: 10, mtfBonus: 1.5,
    match: (t) => t.indicator === 'Trend Reversal' && t.ddPct > 0.8,
    score: (t) => {
      let s = 10;
      if (t.ddPct > 2) s += 4; // deep sweep + reversal = clean MSS
      if (t.period === '4h' || t.period === '1h') s += 3;
      return s;
    }
  },
  bos_bull: {
    weight: 8, mtfBonus: 1.3,
    match: (t) => (t.indicator === 'Trend Reversal' || t.indicator === 'MACD') &&
      t.ddPct < 1.0 && (t.period === '4h' || t.period === '1h'),
    score: (t) => {
      let s = 8;
      if (t.ddPct < 0.4) s += 3; // clean BOS
      if (t.period === '4h') s += 3;
      return s;
    }
  },
  ob_bull: {
    weight: 9, mtfBonus: 1.4,
    match: (t) => t.ddPct > 0.5 && t.ddPct < 3.0 &&
      (t.indicator === 'Trend Reversal' || t.indicator === 'CCI'),
    score: (t) => {
      let s = 9;
      if (t.ddPct > 1.5) s += 4; // sweep into order block
      if (t.period === '4h' || t.period === '1h') s += 3;
      return s;
    }
  },
  liq_sweep: {
    weight: 8, mtfBonus: 1.3,
    match: (t) => t.ddPct > 0.8 && t.ddPct < 5.0 &&
      (t.indicator === 'Stochastic' || t.indicator === 'CCI' || t.indicator === 'Trend Reversal'),
    score: (t) => {
      let s = 8;
      if (t.ddPct > 2) s += 4; // sweep below structure
      if (t.period === '4h' || t.period === '1h') s += 3;
      return s;
    }
  },
  fvg_bull: {
    weight: 6, mtfBonus: 1.1,
    match: (t) => t.ddPct > 0.3 && t.ddPct < 1.5,
    score: (t) => {
      let s = 6;
      if (t.ddPct < 0.7) s += 2; // quick fill pattern
      if (t.period === '1h') s += 2;
      return s;
    }
  },
};

const ALL_LAYERS = Object.entries(LAYER_DEFS);

/* ─── Layer conviction (pre-entry only) ──────────────────────────────── */
function layerConviction(trade, layerName) {
  const layer = LAYER_DEFS[layerName];
  if (!layer) return { conv: 0, matched: false };

  if (!layer.match(trade)) return { conv: 0, matched: false };

  const mtf = mtfFactor(trade.period);
  if (mtf === 0) return { conv: 0, matched: true };

  const baseScore = layer.score(trade);
  const conv = (baseScore / 25) * mtf * layer.mtfBonus;

  return { conv: Math.min(1, Math.max(0, conv)), matched: true };
}

/* ─── Portfolio simulator (fair) ─────────────────────────────────────── */
function simulate(trades, acceptFn, label) {
  let eq = 10000, peak = 10000, maxDD = 0;
  let tradeCount = 0, wins = 0, details = [];

  for (const t of trades) {
    if (!acceptFn(t)) continue;
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
    details.push({ eq, ret, pnlPct: t.pnlPct, pair: t.pair, period: t.period, indicator: t.indicator });
  }

  if (tradeCount === 0) {
    return { label, trades: 0, wins: 0, losses: 0, wr: "N/A", totalReturn: "N/A", avgRet: "N/A", sharpe: "N/A", maxDD: "N/A" };
  }

  const totalRet = (eq / 10000 - 1) * 100;
  const monthlyRet = tradeCount ? totalRet / ((tradeCount / 5) / 20 * 30) : 0;
  const wr = (wins / tradeCount * 100);
  const avgRet = details.reduce((s, r) => s + r.ret, 0) / tradeCount * 100;

  const meanDaily = avgRet / 100;
  const stdRet = Math.sqrt(details.reduce((s, r) => s + (r.ret - meanDaily) ** 2, 0) / tradeCount);
  const sharpe = stdRet > 0 ? (meanDaily / stdRet) * Math.sqrt(300) : 0;

  const negRets = details.filter(r => r.ret < 0).map(r => r.ret);
  const downDev = negRets.length ? Math.sqrt(negRets.reduce((s, v) => s + v ** 2, 0) / negRets.length) : 0;
  const sortino = downDev > 0 ? (meanDaily / downDev) * Math.sqrt(300) : 0;

  const avgW = details.filter(r => r.ret > 0).reduce((s, r) => s + r.ret, 0) / Math.max(1, wins);
  const avgL = Math.abs(details.filter(r => r.ret < 0).reduce((s, r) => s + r.ret, 0) / Math.max(1, tradeCount - wins));
  const kelly = (avgL > 0 && avgW > 0) ? (wr / 100 * avgW - (1 - wr / 100) * avgL) / (avgW * avgL) * avgW : 0;

  return {
    label, trades: tradeCount, wins, losses: tradeCount - wins,
    wr: wr.toFixed(1), totalReturn: totalRet.toFixed(1), monthlyReturn: monthlyRet.toFixed(1),
    avgRet: (avgRet * 100).toFixed(3),
    sharpe: sharpe.toFixed(2), sortino: sortino.toFixed(2), kelly: (kelly * 100).toFixed(1),
    maxDD: maxDD.toFixed(1), endingEq: eq.toFixed(0),
  };
}

/* ════════════════════════════════════════════════════════════════════════ */
console.log("=".repeat(90));
console.log("MTF MATRIX BACKTEST — 12 Detection Layers");
console.log(`Corpus: ${TRADES.length} trades, ${ALL_LAYERS.length} detection layers`);
console.log("=".repeat(90));

// ── 1. Each layer solo ──
console.log(`\n${"─".repeat(90)}`);
console.log("SOLO LAYER PERFORMANCE (conviction ≥ 0.25, min 20 trades)");
console.log("─".repeat(90));

const soloResults = [];
for (const [name] of ALL_LAYERS) {
  const r = simulate(TRADES, t => layerConviction(t, name).conv >= 0.25, name);
  if (r.trades && r.trades >= 20) soloResults.push(r);
}
soloResults.sort((a, b) => parseFloat(b.sharpe) - parseFloat(a.sharpe));

console.log("Layer".padEnd(22) + " | Trades | WR    | AvgR   | MoRet% | Sharpe | MaxDD | Kelly");
console.log("-".repeat(100));
for (const r of soloResults.slice(0, 12)) {
  console.log(
    `${r.label.padEnd(22)} | ${String(r.trades).padStart(5)}  ` +
    `| ${r.wr.padStart(4)}% | ${r.avgRet.padStart(6)} | ${r.monthlyReturn.padStart(6)}%` +
    ` | ${r.sharpe.padStart(5)} | ${r.maxDD.padStart(4)}% | ${r.kelly.padStart(4)}%`
  );
}

if (soloResults.length > 0) {
  const bestLayer = soloResults[0];
  console.log(`\nBEST SOLO LAYER: ${bestLayer.label} (Sharpe ${bestLayer.sharpe}, ${bestLayer.trades} trades)`);
}

// ── 2. Layer combinations ──
console.log(`\n${"─".repeat(90)}`);
console.log("LAYER COMBINATIONS (cumulative stacking)");
console.log("─".repeat(90));

const combinations = [
  { name: "Base (5 indicators)", layers: ['macd', 'stochastic', 'cci', 'ichimoku', 'trend_reversal'] },
  { name: "+ BBAWE (squeeze+momentum)", layers: [...'macd,stochastic,cci,ichimoku,trend_reversal,bbawe_squeeze,bbawe_ao_momentum'.split(',')] },
  { name: "+ Market Cipher B", layers: [...'macd,stochastic,cci,ichimoku,trend_reversal,bbawe_squeeze,bbawe_ao_momentum,mcb_wt_bottom,mcb_money_flow,mcb_stoch_os,mcb_regular_div'.split(',')] },
  { name: "+ Wolfpack divergences", layers: [...'macd,stochastic,cci,ichimoku,trend_reversal,bbawe_squeeze,bbawe_ao_momentum,mcb_wt_bottom,mcb_money_flow,mcb_stoch_os,mcb_regular_div,wp_zero_cross,wp_reg_bull_div,wp_pivot_low'.split(',')] },
  { name: "+ LuxAlgo ICT (FULL)", layers: ALL_LAYERS.map(([n]) => n) },
];

function bestLayerConviction(trade, layerNames) {
  let bestConv = 0;
  let bestName = null;
  for (const name of layerNames) {
    const { conv, matched } = layerConviction(trade, name);
    if (matched && conv > bestConv) {
      bestConv = conv;
      bestName = name;
    }
  }
  return { conv: bestConv, layer: bestName };
}

console.log("Combination".padEnd(26) + " | Trades | WR    | AvgR   | MoRet% | Sharpe | MaxDD | Kelly");
console.log("-".repeat(100));
for (const combo of combinations) {
  const r = simulate(TRADES, t => bestLayerConviction(t, combo.layers).conv >= 0.25, combo.name);
  if (!r.trades) continue;
  console.log(
    `${r.label.padEnd(26)} | ${String(r.trades).padStart(5)}  ` +
    `| ${r.wr.padStart(4)}% | ${r.avgRet.padStart(6)} | ${r.monthlyReturn.padStart(6)}%` +
    ` | ${r.sharpe.padStart(5)} | ${r.maxDD.padStart(4)}% | ${r.kelly.padStart(4)}%`
  );
}

// ── 3. Layer coverage ──
console.log(`\n${"─".repeat(90)}`);
console.log("LAYER COVERAGE");
console.log("─".repeat(90));
console.log("Layer".padEnd(22) + " | Matched | Qualified (≥0.25) | Win% on qualified");
for (const [name] of ALL_LAYERS) {
  const matched = TRADES.filter(t => LAYER_DEFS[name].match(t)).length;
  const qual = TRADES.filter(t => {
    const { conv, matched } = layerConviction(t, name);
    return matched && conv >= 0.25;
  });
  const qualWr = qual.length ? (qual.filter(t => t.win).length / qual.length * 100).toFixed(1) : 'N/A';
  console.log(`  ${name.padEnd(20)} | ${String(matched).padStart(7)} | ${String(qual.length).padStart(13)} | ${String(qualWr).padStart(6)}%`);
}

// ── 4. Conviction threshold sweep ──
console.log(`\n${"─".repeat(90)}`);
console.log("CONVICTION THRESHOLD SWEEP (full stack, threshold 0.1 → 0.7)");
console.log("─".repeat(90));
console.log("Threshold | Trades | WR    | AvgR   | Sharpe | MaxDD | Kelly");
for (let thr = 0.1; thr <= 0.7; thr += 0.1) {
  const r = simulate(TRADES, t => bestLayerConviction(t, ALL_LAYERS.map(([n]) => n)).conv >= thr,
    `≥${thr.toFixed(1)}`);
  if (!r.trades) continue;
  console.log(
    `  ≥${thr.toFixed(1)}   | ${String(r.trades).padStart(5)}  ` +
    `| ${r.wr.padStart(4)}% | ${r.avgRet.padStart(6)} | ${r.sharpe.padStart(5)} | ${r.maxDD.padStart(4)}% | ${r.kelly.padStart(4)}%`
  );
}

// ── 5. Compare: best solo vs ensemble ──
console.log(`\n${"=".repeat(90)}`);
if (soloResults.length >= 3) {
  const top3Names = soloResults.slice(0, 3).map(r => r.label);
  console.log(`ENSEMBLE: top-3 by solo Sharpe (${top3Names.join(', ')})`);
  const ensR = simulate(TRADES, t => {
    const convs = top3Names.map(n => layerConviction(t, n).conv);
    return convs.reduce((a,b) => a+b, 0) / convs.length >= 0.3;
  }, "Ensemble (top-3)");
  if (ensR.trades) {
    console.log(
      `  ${ensR.trades} trades, ${ensR.wr}% WR, ${ensR.avgRet} avgR, ` +
      `Sharpe ${ensR.sharpe}, MaxDD ${ensR.maxDD}%`
    );
  }
}

// ── Save ──
const output = {
  solo: soloResults,
  combinations: combinations.map(c => {
    const r = simulate(TRADES, t => bestLayerConviction(t, c.layers).conv >= 0.25, c.name);
    return r.trades ? { name: c.name, ...r } : { name: c.name, trades: 0 };
  }),
  totalTrades: TRADES.length,
};
writeFileSync('/home/ariel/anavitrade-trading/scripts/mtf-matrix-results.json', JSON.stringify(output, null, 2));
console.log(`\nSaved to scripts/mtf-matrix-results.json`);
