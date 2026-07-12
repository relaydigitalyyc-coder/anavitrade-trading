const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
if (!url) { console.log('No DATABASE_URL'); process.exit(1); }
(async () => {
  const c = await mysql2.createConnection(url);
  // First check columns
  const [cols] = await c.query('DESCRIBE demo_accounts');
  console.log('Columns:', cols.map(x => x.Field).join(', '));
  // Update
  const [r] = await c.query(
    "UPDATE demo_accounts SET positionSizePct=5.00, leverage=3.00, strategyTier='A', lastSyncedSignalId=NULL, currentBalance=10000.00 WHERE accessToken='anavitrade-public-demo-2026'"
  );
  console.log('Updated rows:', r.affectedRows);
  // Also delete old trades and snapshots for this account
  const [acc] = await c.query("SELECT id FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'")
  if (acc.length > 0) {
    const id = acc[0].id;
    const [d1] = await c.query('DELETE FROM demo_trades WHERE demoAccountId=?', [id]);
    const [d2] = await c.query('DELETE FROM portfolio_snapshots WHERE demoAccountId=?', [id]);
    console.log('Deleted trades:', d1.affectedRows, 'snapshots:', d2.affectedRows);
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
