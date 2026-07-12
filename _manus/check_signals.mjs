import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

const [rows] = await conn.execute(
  'SELECT DATE(signalDate) as d, qualityTier, COUNT(*) as cnt FROM coinlegs_signals WHERE signalDate >= "2026-07-01" AND signalDate < "2026-07-06" AND qualityTier = "A" AND signal = 1 GROUP BY DATE(signalDate), qualityTier ORDER BY d'
);
console.log('Jul 1-5 Tier A signals:', JSON.stringify(rows, null, 2));

const [acct] = await conn.execute(
  'SELECT id, createdAt, lastSyncedSignalId, currentBalance FROM demo_accounts WHERE accessToken = "anavitrade-public-demo-2026"'
);
console.log('Demo account:', JSON.stringify(acct, null, 2));

const [range] = await conn.execute(
  'SELECT MIN(id) as min_id, MAX(id) as max_id FROM coinlegs_signals WHERE signalDate >= "2026-07-01" AND signalDate < "2026-07-06" AND qualityTier = "A" AND signal = 1'
);
console.log('Jul 1-5 id range:', JSON.stringify(range, null, 2));

const [allRange] = await conn.execute(
  'SELECT MIN(signalDate) as earliest, MAX(signalDate) as latest, COUNT(*) as total FROM coinlegs_signals WHERE qualityTier = "A" AND signal = 1'
);
console.log('All Tier A signals range:', JSON.stringify(allRange, null, 2));

await conn.end();
