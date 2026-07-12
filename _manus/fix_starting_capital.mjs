/**
 * Fix: reset startingCapital to $10,000 for all registered-user demo accounts.
 * The backfill script reset their currentBalance to $10,000 but the startingCapital
 * column still shows $50,000 (the original default), causing incorrect return % display.
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

const [result] = await conn.execute(
  'UPDATE demo_accounts SET startingCapital = "10000.00" WHERE accessToken != "anavitrade-public-demo-2026"'
);
console.log(`Updated ${result.affectedRows} accounts: startingCapital set to $10,000`);

// Verify
const [rows] = await conn.execute(
  'SELECT id, username, startingCapital, currentBalance FROM demo_accounts ORDER BY id LIMIT 15'
);
rows.forEach(r => {
  const ret = ((parseFloat(r.currentBalance) - parseFloat(r.startingCapital)) / parseFloat(r.startingCapital) * 100).toFixed(1);
  console.log(`id=${r.id} user=${r.username} start=$${r.startingCapital} balance=$${parseFloat(r.currentBalance).toFixed(2)} return=+${ret}%`);
});

await conn.end();
