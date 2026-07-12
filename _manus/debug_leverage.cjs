const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
(async () => {
  const c = await mysql2.createConnection(url);
  // Get the account
  const [accounts] = await c.query("SELECT * FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'");
  const account = accounts[0];
  console.log('Account leverage:', account.leverage, typeof account.leverage);
  console.log('Account positionSizePct:', account.positionSizePct, typeof account.positionSizePct);
  
  const riskPct = parseFloat(account.positionSizePct ?? "5.00") / 100;
  const leverage = parseFloat(account.leverage ?? "3.00");
  const positionSizePct = riskPct * leverage;
  console.log('riskPct:', riskPct);
  console.log('leverage:', leverage);
  console.log('positionSizePct (notional):', positionSizePct);
  console.log('positionValueUsd on $10000:', 10000 * positionSizePct);
  
  // TLMUSDT: 9.88% return
  const rawPnl = 10000 * positionSizePct * (9.88 / 100);
  const maxPnl = 10000 * riskPct * leverage;
  const pnl = Math.min(rawPnl, maxPnl);
  console.log('rawPnl:', rawPnl);
  console.log('maxPnl:', maxPnl);
  console.log('final pnl:', pnl);
  console.log('Expected (DB):', 49.40);
  
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
