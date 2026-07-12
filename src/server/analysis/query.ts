/**
 * Unified Signal Dashboard API — query the analysis_signals table with
 * filtering, pagination, aggregate stats, and source comparison.
 */
import { getDb } from "../db";
import { analysisSignals } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import type { UnifiedSignal } from "./types";

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface SignalQuery {
  source?: string;
  tier?: string;
  timeframe?: string;
  symbol?: string;
  direction?: string;
  minScore?: number;
  since?: number;
  until?: number;
  dispatched?: boolean;
  limit?: number;
  offset?: number;
}

export interface SignalStats {
  total: number;
  bySource: Record<string, number>;
  byTier: Record<string, number>;
  avgScore: number;
  dispatchedTotal: number;
  pendingTotal: number;
  bestPerformer: { symbol: string; avgScore: number } | null;
}

/* ─── Row converter ──────────────────────────────────────────────────── */

/**
 * Convert an analysis_signals DB row back into the unified response shape.
 */
function rowToResponse(row: typeof analysisSignals.$inferSelect) {
  return {
    source: row.source,
    externalSignalId: row.externalSignalId,
    symbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    entry: parseFloat(row.entry),
    stopLoss: row.stopLoss ? parseFloat(row.stopLoss) : 0,
    takeProfit: row.takeProfit ? parseFloat(row.takeProfit) : 0,
    score: row.score,
    tier: row.tier,
    thesis: row.thesis,
    components: row.componentsJson ? JSON.parse(row.componentsJson as string) : {},
    structuralScore: row.structuralScore ?? 0,
    confidence: row.structuralConfidence ? parseFloat(row.structuralConfidence) : 0,
    timestamp: row.createdAt,
    metadata: row.metadataJson ? JSON.parse(row.metadataJson as string) : {},
    dispatched: row.dispatched === 1,
    dispatchedAt: row.dispatchedAt,
    id: row.id,
  };
}

/* ─── Condition builder ──────────────────────────────────────────────── */

/**
 * Build an array of Drizzle where conditions from SignalQuery filters.
 */
function buildConditions(
  query: SignalQuery,
): ReturnType<typeof eq>[] {
  const conditions: ReturnType<typeof eq>[] = [];

  if (query.source) conditions.push(eq(analysisSignals.source, query.source));
  if (query.tier) conditions.push(eq(analysisSignals.tier, query.tier));
  if (query.timeframe) conditions.push(eq(analysisSignals.timeframe, query.timeframe));
  if (query.symbol) conditions.push(eq(analysisSignals.symbol, query.symbol));
  if (query.direction) conditions.push(eq(analysisSignals.direction, query.direction));
  if (query.minScore !== undefined) conditions.push(gte(analysisSignals.score, query.minScore));
  if (query.since !== undefined) conditions.push(gte(analysisSignals.createdAt, query.since));
  if (query.until !== undefined) conditions.push(lte(analysisSignals.createdAt, query.until));
  if (query.dispatched !== undefined) {
    conditions.push(eq(analysisSignals.dispatched, query.dispatched ? 1 : 0));
  }

  return conditions;
}

/* ─── Stats (shared by querySignals and getSignalStats) ───────────────── */

/**
 * Compute aggregate stats scoped to a set of conditions.
 */
async function computeStats(
  conditions: ReturnType<typeof eq>[],
): Promise<SignalStats> {
  const db = getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const queryTotal = whereClause
    ? db.select({ total: sql<number>`count(*)` }).from(analysisSignals).where(whereClause)
    : db.select({ total: sql<number>`count(*)` }).from(analysisSignals);

  const queryBySource = whereClause
    ? db.select({ source: analysisSignals.source, cnt: sql<number>`count(*)` }).from(analysisSignals).where(whereClause).groupBy(analysisSignals.source)
    : db.select({ source: analysisSignals.source, cnt: sql<number>`count(*)` }).from(analysisSignals).groupBy(analysisSignals.source);

  const queryByTier = whereClause
    ? db.select({ tier: analysisSignals.tier, cnt: sql<number>`count(*)` }).from(analysisSignals).where(whereClause).groupBy(analysisSignals.tier)
    : db.select({ tier: analysisSignals.tier, cnt: sql<number>`count(*)` }).from(analysisSignals).groupBy(analysisSignals.tier);

  const queryAvgScore = whereClause
    ? db.select({ avgScore: sql<number>`AVG(${analysisSignals.score})` }).from(analysisSignals).where(whereClause)
    : db.select({ avgScore: sql<number>`AVG(${analysisSignals.score})` }).from(analysisSignals);

  const dispatchedCond = whereClause
    ? and(whereClause, eq(analysisSignals.dispatched, 1))
    : eq(analysisSignals.dispatched, 1);
  const queryDispatched = db.select({ dispatchedTotal: sql<number>`count(*)` }).from(analysisSignals).where(dispatchedCond);

  const pendingCond = whereClause
    ? and(whereClause, eq(analysisSignals.dispatched, 0))
    : eq(analysisSignals.dispatched, 0);
  const queryPending = db.select({ pendingTotal: sql<number>`count(*)` }).from(analysisSignals).where(pendingCond);

  const queryBest = whereClause
    ? db.select({ symbol: analysisSignals.symbol, avgScore: sql<number>`AVG(${analysisSignals.score})` }).from(analysisSignals).where(whereClause).groupBy(analysisSignals.symbol).orderBy(sql`AVG(${analysisSignals.score}) DESC`).limit(1)
    : db.select({ symbol: analysisSignals.symbol, avgScore: sql<number>`AVG(${analysisSignals.score})` }).from(analysisSignals).groupBy(analysisSignals.symbol).orderBy(sql`AVG(${analysisSignals.score}) DESC`).limit(1);

  const [
    [{ total }],
    bySourceRows,
    byTierRows,
    [{ avgScore }],
    [{ dispatchedTotal }],
    [{ pendingTotal }],
    bestRows,
  ] = await Promise.all([
    queryTotal.all(),
    queryBySource.all(),
    queryByTier.all(),
    queryAvgScore.all(),
    queryDispatched.all(),
    queryPending.all(),
    queryBest.all(),
  ]);

  const bySource: Record<string, number> = {};
  for (const r of bySourceRows as Array<{ source: string; cnt: number }>) {
    bySource[r.source] = Number(r.cnt);
  }

  const byTier: Record<string, number> = {};
  for (const r of byTierRows as Array<{ tier: string; cnt: number }>) {
    byTier[r.tier] = Number(r.cnt);
  }

  const bestPerformer = bestRows.length > 0
    ? { symbol: (bestRows[0] as any).symbol, avgScore: Number((bestRows[0] as any).avgScore) }
    : null;

  return {
    total: Number(total),
    bySource,
    byTier,
    avgScore: Number(avgScore ?? 0),
    dispatchedTotal: Number(dispatchedTotal),
    pendingTotal: Number(pendingTotal),
    bestPerformer,
  };
}

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Query analysis_signals with filtering and pagination.
 * Returns paginated signals, total count, and scoped aggregate stats.
 */
export async function querySignals(query: SignalQuery): Promise<{
  signals: ReturnType<typeof rowToResponse>[];
  total: number;
  stats: SignalStats;
}> {
  const db = getDb();
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const conditions = buildConditions(query);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch rows + count + stats in parallel
  const rowsPromise = whereClause
    ? db.select().from(analysisSignals).where(whereClause)
        .orderBy(desc(analysisSignals.createdAt)).limit(limit).offset(offset).all()
    : db.select().from(analysisSignals)
        .orderBy(desc(analysisSignals.createdAt)).limit(limit).offset(offset).all();

  const countPromise = whereClause
    ? db.select({ total: sql<number>`count(*)` }).from(analysisSignals).where(whereClause).all()
    : db.select({ total: sql<number>`count(*)` }).from(analysisSignals).all();

  const [rows, [{ total }]] = await Promise.all([
    rowsPromise,
    countPromise,
  ]);

  const stats = await computeStats(conditions);

  const signals = rows.map(rowToResponse);

  return { signals, total: Number(total), stats };
}

/**
 * Get aggregate stats across all signal sources, optionally scoped to a
 * time window (since timestamp).
 */
export async function getSignalStats(since?: number): Promise<SignalStats> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (since !== undefined) {
    conditions.push(gte(analysisSignals.createdAt, since));
  }
  return computeStats(conditions);
}

/**
 * Get side-by-side comparison of Coinlegs vs ICR signal quality.
 */
export async function compareSources(): Promise<{
  coinlegs: { count: number; avgScore: number; tierDistribution: Record<string, number> };
  icr: { count: number; avgScore: number; tierDistribution: Record<string, number> };
}> {
  const db = getDb();

  const sources = ["coinlegs", "icr"] as const;
  const results = await Promise.all(
    sources.map(async (source) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(analysisSignals)
        .where(eq(analysisSignals.source, source))
        .all();

      const [{ avgScore }] = await db
        .select({ avgScore: sql<number>`AVG(${analysisSignals.score})` })
        .from(analysisSignals)
        .where(eq(analysisSignals.source, source))
        .all();

      const tierRows = await db
        .select({ tier: analysisSignals.tier, cnt: sql<number>`count(*)` })
        .from(analysisSignals)
        .where(eq(analysisSignals.source, source))
        .groupBy(analysisSignals.tier)
        .all();

      const tierDistribution: Record<string, number> = {};
      for (const r of tierRows as Array<{ tier: string; cnt: number }>) {
        tierDistribution[r.tier] = Number(r.cnt);
      }

      return {
        source,
        count: Number(count),
        avgScore: Number(avgScore ?? 0),
        tierDistribution,
      };
    }),
  );

  const coinlegs = results.find((r) => r.source === "coinlegs")!;
  const icr = results.find((r) => r.source === "icr")!;

  return {
    coinlegs: { count: coinlegs.count, avgScore: coinlegs.avgScore, tierDistribution: coinlegs.tierDistribution },
    icr: { count: icr.count, avgScore: icr.avgScore, tierDistribution: icr.tierDistribution },
  };
}
