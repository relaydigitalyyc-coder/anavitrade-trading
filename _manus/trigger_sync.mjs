/**
 * Trigger the demo sync by calling syncSignalsToDemoAccounts directly via DB.
 * This is equivalent to what the server does on the bootstrapPublicDemo endpoint.
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

// Fetch all active demo accounts
const [accounts] = await conn.execute(
  'SELECT id, lastSyncedSignalId, currentBalance, startingCapital, positionSizePct, leverage, strategyTier, pyramidingEnabled, pyramidMaxEntries, pyramidScalePct FROM demo_accounts WHERE status = "active"'
);

console.log(`Found ${accounts.length} active demo accounts`);

let totalTrades = 0;
let totalSnapshots = 0;

for (const account of accounts) {
  const lastId = account.lastSyncedSignalId ?? 0;
  const tierFilter = account.strategyTier === 'A' ? "'A'" : account.strategyTier === 'AB' ? "'A', 'B'" : "'A', 'B', 'C'";

  const [signals] = await conn.execute(
    `SELECT id, signalDate, marketName, price, maxProfit, maxProfitDuration, indicatorShortName, period, qualityScore, qualityTier
     FROM coinlegs_signals
     WHERE id > ? AND signal = 1 AND qualityTier IN (${tierFilter})
     ORDER BY signalDate ASC`,
    [lastId]
  );

  console.log(`Account ${account.id}: found ${signals.length} new signals (lastId=${lastId})`);

  if (signals.length === 0) continue;

  let currentBalance = parseFloat(account.currentBalance);
  let maxSignalId = lastId;
  let runningTradeCount = 0;

  // Get current trade count
  const [[{ cnt }]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM demo_trades WHERE demoAccountId = ?',
    [account.id]
  );
  runningTradeCount = Number(cnt);

  const snapshotRows = [];

  for (const signal of signals) {
    if (signal.id > maxSignalId) maxSignalId = signal.id;

    const maxProfitPct = parseFloat(signal.maxProfit ?? '0');
    if (maxProfitPct <= 0) continue;

    const entryPrice = parseFloat(signal.price);
    if (entryPrice <= 0) continue;

    const riskPct = parseFloat(account.positionSizePct ?? '5.00') / 100;
    const leverage = parseFloat(account.leverage ?? '3.00');
    const positionSizePct = riskPct * leverage;
    const effectivePositionPct = positionSizePct;

    const positionValueUsd = currentBalance * effectivePositionPct;
    const exitPrice = entryPrice * (1 + maxProfitPct / 100);
    const rawPnl = positionValueUsd * (maxProfitPct / 100);
    const maxPnl = currentBalance * riskPct * leverage;
    const pnl = Math.min(rawPnl, maxPnl);
    const pnlPct = maxProfitPct;

    // Parse duration
    let durationMs = 4 * 60 * 60 * 1000; // 4h default
    if (signal.maxProfitDuration) {
      const m = signal.maxProfitDuration.match(/^(\d+)([hHmMdD])$/);
      if (m) {
        const val = parseInt(m[1]);
        const unit = m[2].toLowerCase();
        if (unit === 'h') durationMs = val * 3600000;
        else if (unit === 'm') durationMs = val * 60000;
        else if (unit === 'd') durationMs = val * 86400000;
      }
    }

    const openedAt = new Date(signal.signalDate);
    const closedAt = new Date(openedAt.getTime() + durationMs);

    await conn.execute(
      `INSERT INTO demo_trades (demoAccountId, signalId, pair, side, entryPrice, exitPrice, quantity, pnl, pnlPct, tradeStatus, indicatorName, period, qualityScore, qualityTier, maxProfitPct, openedAt, closedAt)
       VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id, signal.id, signal.marketName,
        String(entryPrice), String(exitPrice),
        String((positionValueUsd / entryPrice).toFixed(8)),
        String(pnl.toFixed(2)), String(pnlPct.toFixed(4)),
        signal.indicatorShortName, signal.period,
        signal.qualityScore, signal.qualityTier,
        String(maxProfitPct),
        openedAt, closedAt,
      ]
    );

    currentBalance += pnl;
    totalTrades++;
    runningTradeCount++;

    snapshotRows.push([account.id, String(currentBalance.toFixed(2)), runningTradeCount, closedAt]);
  }

  // Update account
  await conn.execute(
    'UPDATE demo_accounts SET currentBalance = ?, lastSyncedSignalId = ? WHERE id = ?',
    [String(currentBalance.toFixed(2)), maxSignalId, account.id]
  );
  console.log(`Account ${account.id}: balance updated to $${currentBalance.toFixed(2)}, maxSignalId=${maxSignalId}`);

  // Batch insert snapshots
  for (const row of snapshotRows) {
    await conn.execute(
      'INSERT INTO portfolio_snapshots (demoAccountId, balance, tradeCount, snapshotAt) VALUES (?, ?, ?, ?)',
      row
    );
  }
  totalSnapshots += snapshotRows.length;
}

console.log(`\nSync complete: ${totalTrades} trades created, ${totalSnapshots} snapshots written`);
await conn.end();
