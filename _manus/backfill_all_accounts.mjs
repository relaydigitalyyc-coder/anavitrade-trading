/**
 * Backfill script: resets ALL demo accounts (except the public demo) to cursor 0
 * so the next sync picks up all Tier A signals from Jul 1 onwards.
 *
 * Run once: node backfill_all_accounts.mjs
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

// 1. Find all non-public demo accounts
const [accounts] = await conn.execute(
  'SELECT id, username, currentBalance, lastSyncedSignalId FROM demo_accounts WHERE accessToken != "anavitrade-public-demo-2026"'
);
console.log(`Found ${accounts.length} registered-user demo accounts`);

if (accounts.length === 0) {
  console.log('No registered-user accounts to backfill.');
  await conn.end();
  process.exit(0);
}

for (const account of accounts) {
  console.log(`\nProcessing account id=${account.id} username=${account.username}`);

  // Delete existing trades
  const [delTrades] = await conn.execute(
    'DELETE FROM demo_trades WHERE demoAccountId = ?',
    [account.id]
  );
  console.log(`  Deleted ${delTrades.affectedRows} trades`);

  // Delete existing portfolio snapshots
  const [delSnaps] = await conn.execute(
    'DELETE FROM portfolio_snapshots WHERE demoAccountId = ?',
    [account.id]
  );
  console.log(`  Deleted ${delSnaps.affectedRows} snapshots`);

  // Reset cursor and balance
  const [upd] = await conn.execute(
    'UPDATE demo_accounts SET lastSyncedSignalId = 0, currentBalance = "10000.00" WHERE id = ?',
    [account.id]
  );
  console.log(`  Reset cursor and balance: ${upd.affectedRows} rows updated`);
}

console.log('\nAll registered-user demo accounts reset. They will be backfilled on next sync.');
await conn.end();
