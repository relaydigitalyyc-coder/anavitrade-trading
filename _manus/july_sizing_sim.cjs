"use strict";
const mysql = require("/home/ubuntu/anavitrade-platform/node_modules/mysql2/promise");

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || "");

  // Get all July Tier A+B Buy signals with maxProfit
  const [rows] = await conn.execute(`
    SELECT marketName, qualityTier, qualityScore, maxProfit, signalDate, indicatorShortName, period
    FROM coinlegs_signals
    WHERE signal = 1
      AND qualityTier IN ('A','B')
      AND maxProfit IS NOT NULL
      AND maxProfit > 0
      AND signalDate >= '2026-07-01'
      AND signalDate < '2026-08-01'
    ORDER BY signalDate ASC
  `);

  const signals = rows;
  console.log(`Total July Tier A+B Buy signals: ${signals.length}`);

  // Simulate different position sizing strategies
  const strategies = [
    { name: "0.5% per trade (current)", pct: 0.005 },
    { name: "1% per trade", pct: 0.01 },
    { name: "2% per trade", pct: 0.02 },
    { name: "3% per trade", pct: 0.03 },
    { name: "5% per trade", pct: 0.05 },
    { name: "Tier A: 3%, Tier B: 1%", pct: null, tiered: true },
    { name: "Top 20 by score only (2%)", pct: 0.02, topN: 20 },
    { name: "Tier A only (5%)", pct: 0.05, tierAOnly: true },
  ];

  for (const strat of strategies) {
    let balance = 10000;
    let trades = 0;
    let wins = 0;

    let subset = [...signals];
    if (strat.topN) {
      subset = [...signals].sort((a, b) => parseFloat(b.qualityScore) - parseFloat(a.qualityScore)).slice(0, strat.topN);
    }
    if (strat.tierAOnly) {
      subset = signals.filter(s => s.qualityTier === 'A');
    }

    for (const sig of subset) {
      const mp = parseFloat(sig.maxProfit) / 100; // e.g. 4.89% → 0.0489
      let positionPct;
      if (strat.tiered) {
        positionPct = sig.qualityTier === 'A' ? 0.03 : 0.01;
      } else {
        positionPct = strat.pct;
      }
      const positionSize = balance * positionPct;
      const pnl = positionSize * mp;
      balance += pnl;
      trades++;
      if (pnl > 0) wins++;
    }

    const ret = ((balance - 10000) / 10000 * 100).toFixed(2);
    const finalBal = balance.toFixed(2);
    console.log(`\n${strat.name}`);
    console.log(`  Trades: ${trades} | Win rate: ${((wins/trades)*100).toFixed(0)}%`);
    console.log(`  $10,000 → $${finalBal} | Return: +${ret}%`);
  }

  // Show top 10 signals by maxProfit
  const top10 = [...signals].sort((a, b) => parseFloat(b.maxProfit) - parseFloat(a.maxProfit)).slice(0, 10);
  console.log("\n--- Top 10 July Signals by MaxProfit ---");
  for (const s of top10) {
    console.log(`  ${s.marketName} | ${s.qualityTier} | Score ${s.qualityScore} | +${parseFloat(s.maxProfit).toFixed(2)}% | ${s.signalDate}`);
  }

  // Tier breakdown
  const tierA = signals.filter(s => s.qualityTier === 'A');
  const tierB = signals.filter(s => s.qualityTier === 'B');
  const avgA = tierA.reduce((s, r) => s + parseFloat(r.maxProfit), 0) / tierA.length;
  const avgB = tierB.reduce((s, r) => s + parseFloat(r.maxProfit), 0) / tierB.length;
  console.log(`\n--- Tier Breakdown ---`);
  console.log(`  Tier A: ${tierA.length} signals | Avg MaxProfit: ${avgA.toFixed(2)}%`);
  console.log(`  Tier B: ${tierB.length} signals | Avg MaxProfit: ${avgB.toFixed(2)}%`);

  await conn.end();
}

main().catch(console.error);
