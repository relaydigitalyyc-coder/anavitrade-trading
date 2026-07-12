/**
 * Backfill script: resets the public demo account cursor to 0 and clears
 * existing trades/snapshots so the next sync picks up all Tier A signals
 * from Jul 1 onwards.
 *
 * Run once: node backfill_demo.mjs
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

// 1. Find the public demo account
const [accounts] = await conn.execute(
  'SELECT id, currentBalance, lastSyncedSignalId FROM demo_accounts WHERE accessToken = "anavitrade-public-demo-2026"'
);
if (accounts.length === 0) {
  console.error('Public demo account not found');
  process.exit(1);
}
const account = accounts[0];
console.log('Demo account found:', account);

// 2. Delete all existing trades for this account
const [delTrades] = await conn.execute(
  'DELETE FROM demo_trades WHERE demoAccountId = ?',
  [account.id]
);
console.log(`Deleted ${delTrades.affectedRows} existing trades`);

// 3. Delete all existing portfolio snapshots for this account
const [delSnaps] = await conn.execute(
  'DELETE FROM portfolio_snapshots WHERE demoAccountId = ?',
  [account.id]
);
console.log(`Deleted ${delSnaps.affectedRows} existing snapshots`);

// 4. Reset the account: cursor to 0, balance back to starting capital $10,000
const [upd] = await conn.execute(
  'UPDATE demo_accounts SET lastSyncedSignalId = 0, currentBalance = "10000.00" WHERE id = ?',
  [account.id]
);
console.log(`Reset account cursor and balance: ${upd.affectedRows} rows updated`);

console.log('Backfill reset complete. Trigger a sync via the /demo page Sync button or server startup.');

await conn.end();
