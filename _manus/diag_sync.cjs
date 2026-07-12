const mysql2 = require('mysql2/promise');
const url = process.env.DATABASE_URL;
(async () => {
  const c = await mysql2.createConnection(url);
  
  // Get the account
  const [accounts] = await c.query("SELECT id, createdAt, lastSyncedSignalId, positionSizePct, leverage, strategyTier FROM demo_accounts WHERE accessToken='anavitrade-public-demo-2026'");
  const account = accounts[0];
  console.log('Account:', JSON.stringify(account, null, 2));
  
  // Count Tier A signals with maxProfit > 0 that qualify
  const [signals] = await c.query(
    "SELECT COUNT(*) as cnt, MIN(id) as minId, MAX(id) as maxId FROM coinlegs_signals WHERE signal=1 AND qualityTier='A' AND maxProfit > 0 AND signalDate >= ?",
    [account.createdAt]
  );
  console.log('Qualifying Tier A signals since account creation:', JSON.stringify(signals[0], null, 2));
  
  // Show a few sample signals
  const [samples] = await c.query(
    "SELECT id, marketName, qualityTier, maxProfit, signalDate FROM coinlegs_signals WHERE signal=1 AND qualityTier='A' AND maxProfit > 0 ORDER BY id DESC LIMIT 5"
  );
  console.log('Sample Tier A signals:', JSON.stringify(samples, null, 2));
  
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
