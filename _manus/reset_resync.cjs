const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
(async () => {
  const c = await mysql2.createConnection(url);
  
  // Get the account
  const [accounts] = await c.query("SELECT id FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'");
  const account = accounts[0];
  if (!account) { console.log('No public demo account found'); await c.end(); return; }
  
  const id = account.id;
  console.log('Resetting account', id);
  
  // Delete all trades and snapshots
  await c.query("DELETE FROM demo_trades WHERE demoAccountId=?", [id]);
  await c.query("DELETE FROM portfolio_snapshots WHERE demoAccountId=?", [id]);
  
  // Reset balance and sync cursor
  await c.query("UPDATE demo_accounts SET currentBalance='10000.00', lastSyncedSignalId=NULL WHERE id=?", [id]);
  
  console.log('Reset complete. Account will re-sync on next Heartbeat or manual Sync.');
  
  const [check] = await c.query("SELECT positionSizePct, leverage, strategyTier, currentBalance, lastSyncedSignalId FROM demo_accounts WHERE id=?", [id]);
  console.log('Account state:', JSON.stringify(check[0], null, 2));
  
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
