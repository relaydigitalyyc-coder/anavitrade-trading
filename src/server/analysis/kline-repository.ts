import { eq, and, desc, sql, lte } from "drizzle-orm";
import { getDb } from "../db";
import { klines } from "../../drizzle/schema";
import type { Kline } from "./types";

/**
 * Convert a DB row (stored as text columns for precision) to the numeric Kline interface.
 */
function toKline(row: typeof klines.$inferSelect): Kline {
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    timestamp: row.openTime,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume),
  };
}

/**
 * Fetch the most recent klines for a given symbol and timeframe.
 */
export async function getKlines(
  symbol: string,
  timeframe: string,
  limit: number = 200,
): Promise<Kline[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(klines)
    .where(and(eq(klines.symbol, symbol), eq(klines.timeframe, timeframe)))
    .orderBy(desc(klines.openTime))
    .limit(limit);

  return rows.reverse().map(toKline);
}

/**
 * Fetch klines since a specific timestamp (inclusive).
 */
export async function getKlinesSince(
  symbol: string,
  timeframe: string,
  sinceMs: number,
  limit?: number,
): Promise<Kline[]> {
  const db = getDb();
  const query = db
    .select()
    .from(klines)
    .where(
      and(
        eq(klines.symbol, symbol),
        eq(klines.timeframe, timeframe),
        sql`${klines.openTime} >= ${sinceMs}`,
      ),
    )
    .orderBy(desc(klines.openTime));

  if (limit !== undefined) {
    query.limit(limit);
  }

  const rows = await query;
  return rows.reverse().map(toKline);
}

/**
 * Upsert a batch of klines. Duplicates (same symbol, timeframe, openTime) are silently ignored.
 * Returns the number of rows that were inserted.
 */
export async function upsertKlines(batch: Kline[]): Promise<number> {
  if (batch.length === 0) return 0;

  const db = getDb();
  const values = batch.map((k) => ({
    symbol: k.symbol,
    timeframe: k.timeframe,
    openTime: k.timestamp,
    open: String(k.open),
    high: String(k.high),
    low: String(k.low),
    close: String(k.close),
    volume: String(k.volume),
    closeTime: k.timestamp,
    fetchedAt: Date.now(),
  }));

  const result = await db
    .insert(klines)
    .values(values)
    .onConflictDoNothing();

  // D1 returns `meta.changes` — number of rows modified
  return (result as any)?.meta?.changes ?? values.length;
}

/**
 * Get the latest (most recent) openTime for a given symbol and timeframe.
 * Returns null if no klines exist.
 */
export async function getLatestTimestamp(
  symbol: string,
  timeframe: string,
): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ maxOpenTime: sql<number>`MAX(${klines.openTime})` })
    .from(klines)
    .where(and(eq(klines.symbol, symbol), eq(klines.timeframe, timeframe)));

  return row?.maxOpenTime ?? null;
}

/**
 * Purge klines older than the given retention period (in days).
 * Returns the number of rows deleted.
 */
export async function purgeOldKlines(
  retentionDays: number = 30,
): Promise<number> {
  const db = getDb();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const result = await db
    .delete(klines)
    .where(lte(klines.openTime, cutoff));

  return (result as any)?.meta?.changes ?? 0;
}
