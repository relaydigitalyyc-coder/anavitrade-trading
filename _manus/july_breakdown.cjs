const mysql = require('mysql2/promise');

mysql.createConnection(process.env.DATABASE_URL).then(async conn => {
  const [all] = await conn.execute(`
    SELECT marketName, indicatorShortName, period, qualityTier, qualityScore, maxProfit, signalDate, price
    FROM coinlegs_signals
    WHERE signal = 1 AND qualityTier IN ('A','B')
      AND signalDate >= '2026-07-01' AND signalDate < '2026-08-01'
    ORDER BY signalDate ASC
  `);

  const wins = all.filter(s => s.maxProfit !== null && parseFloat(s.maxProfit) > 0);
  const losses = all.filter(s => s.maxProfit === null || parseFloat(s.maxProfit) <= 0);

  console.log('Total:', all.length, '| Wins:', wins.length, '| Losses:', losses.length);
  console.log('Win rate:', (wins.length / all.length * 100).toFixed(1) + '%');

  console.log('\nLOSSES (signals our filters took that had null/0 maxProfit):');
  losses.forEach(s => {
    const mp = s.maxProfit !== null ? parseFloat(s.maxProfit).toFixed(2) : 'null';
    console.log(String(s.signalDate).slice(0,10), s.marketName, s.period, 'Tier:' + s.qualityTier, 'Score:' + s.qualityScore, 'MaxProfit:' + mp + '%');
  });

  console.log('\nTOP 15 WINS by MaxProfit:');
  wins.sort((a, b) => parseFloat(b.maxProfit) - parseFloat(a.maxProfit)).slice(0, 15).forEach(s => {
    console.log(String(s.signalDate).slice(0,10), s.marketName, s.period, 'Tier:' + s.qualityTier, '+' + parseFloat(s.maxProfit).toFixed(2) + '%');
  });

  // Simulate full P&L including losses (assume -0.5% stop loss on losses)
  let balance = 10000;
  let totalPnl = 0;
  let winPnl = 0, lossPnl = 0;
  const sorted = [...all].sort((a, b) => new Date(a.signalDate) - new Date(b.signalDate));
  for (const s of sorted) {
    const mp = s.maxProfit !== null ? parseFloat(s.maxProfit) : 0;
    const pos = balance * 0.005;
    const pnl = mp > 0 ? pos * (mp / 100) : -pos * 0.5; // -0.5% stop loss on losses
    balance += pnl;
    totalPnl += pnl;
    if (pnl > 0) winPnl += pnl; else lossPnl += pnl;
  }
  console.log('\n=== FULL SIMULATION (wins + losses with -0.5% SL) ===');
  console.log('Final balance: $' + balance.toFixed(2));
  console.log('Total P&L: $' + totalPnl.toFixed(2));
  console.log('Total return: ' + ((balance - 10000) / 10000 * 100).toFixed(2) + '%');
  console.log('Win P&L: $' + winPnl.toFixed(2));
  console.log('Loss P&L: $' + lossPnl.toFixed(2));

  await conn.end();
}).catch(console.error);
