const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
(async () => {
  const c = await mysql2.createConnection(url);
  const [rows] = await c.query("SELECT id, positionSizePct, leverage, strategyTier, currentBalance, lastSyncedSignalId FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'");
  console.log('Demo account:', JSON.stringify(rows[0], null, 2));
  const [trades] = await c.query("SELECT pair, pnl, pnlPct, entryPrice, exitPrice FROM demo_trades WHERE demoAccountId=? LIMIT 5", [rows[0]?.id]);
  console.log('Trades:', JSON.stringify(trades, null, 2));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
