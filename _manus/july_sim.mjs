import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// July Tier A+B Buy signals with profit
const [signals] = await conn.execute(`
  SELECT maxProfit, signalDate, marketName, qualityTier, qualityScore
  FROM coinlegs_signals
  WHERE signal = 1
    AND qualityTier IN ('A','B')
    AND maxProfit > 0
    AND signalDate >= '2026-07-01'
    AND signalDate < '2026-08-01'
  ORDER BY signalDate ASC
`);

console.log(`Total July Tier A+B signals with profit: ${signals.length}`);

// Simulate $10,000 starting, 0.5% per trade
let balance = 10000;
let wins = 0, losses = 0;
let peak = balance;
let maxDD = 0;
let totalPnl = 0;
let bestPnlPct = 0;
let bestPair = '';

for (const s of signals) {
  const mp = parseFloat(s.maxProfit);
  const pos = balance * 0.005;
  const pnl = pos * (mp / 100);
  balance += pnl;
  totalPnl += pnl;
  if (pnl > 0) wins++; else losses++;
  if (balance > peak) peak = balance;
  const dd = ((peak - balance) / peak) * 100;
  if (dd > maxDD) maxDD = dd;
  if (mp > bestPnlPct) { bestPnlPct = mp; bestPair = s.marketName; }
}

const tradeCount = signals.length;
const winRate = tradeCount > 0 ? (wins / tradeCount * 100) : 0;
const avgPnlUsd = tradeCount > 0 ? totalPnl / tradeCount : 0;
const avgRetPct = tradeCount > 0 ? signals.reduce((a, s) => a + parseFloat(s.maxProfit), 0) / tradeCount : 0;
const totalRetPct = ((balance - 10000) / 10000) * 100;
const profitFactor = losses > 0 ? (wins * avgPnlUsd) / (losses * Math.abs(avgPnlUsd)) : Infinity;

console.log('\n=== JULY 2026 SIMULATION ($10,000 starting, 0.5% per trade) ===');
console.log(`Trades:           ${tradeCount}`);
console.log(`Final balance:    $${balance.toFixed(2)}`);
console.log(`Total P&L:        $${totalPnl.toFixed(2)}`);
console.log(`Total return:     +${totalRetPct.toFixed(2)}%`);
console.log(`Win rate:         ${winRate.toFixed(1)}% (${wins}W / ${losses}L)`);
console.log(`Avg P&L/trade:    $${avgPnlUsd.toFixed(3)}`);
console.log(`Avg return/trade: ${avgRetPct.toFixed(3)}%`);
console.log(`Max drawdown:     ${maxDD.toFixed(3)}%`);
console.log(`Best trade:       +${bestPnlPct.toFixed(2)}% on ${bestPair}`);

// Tier breakdown
const tierA = signals.filter(s => s.qualityTier === 'A').length;
const tierB = signals.filter(s => s.qualityTier === 'B').length;
console.log(`\nTier A: ${tierA}, Tier B: ${tierB}`);

// Avg quality score
const avgScore = signals.reduce((a, s) => a + (s.qualityScore ?? 0), 0) / tradeCount;
console.log(`Avg quality score: ${avgScore.toFixed(2)}`);

await conn.end();
