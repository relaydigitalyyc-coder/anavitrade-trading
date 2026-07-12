const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
(async () => {
  const c = await mysql2.createConnection(url);
  
  const [accounts] = await c.query("SELECT id FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'");
  const account = accounts[0];
  if (!account) { console.log('No account found'); await c.end(); return; }
  const id = account.id;
  
  // Delete all trades and snapshots
  const [delTrades] = await c.query("DELETE FROM demo_trades WHERE demoAccountId=?", [id]);
  const [delSnaps] = await c.query("DELETE FROM portfolio_snapshots WHERE demoAccountId=?", [id]);
  console.log(`Deleted ${delTrades.affectedRows} trades, ${delSnaps.affectedRows} snapshots`);
  
  // Reset balance and sync cursor to BEFORE the first qualifying signal
  await c.query("UPDATE demo_accounts SET currentBalance='10000.00', lastSyncedSignalId=4590006 WHERE id=?", [id]);
  console.log('Reset balance to $10,000 and sync cursor to 4590006');
  
  await c.end();
  console.log('Done. Now triggering sync via API...');
})().catch(e => { console.error(e.message); process.exit(1); });
