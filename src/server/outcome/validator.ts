/**
 * Outcome Validator — verifies Coinlegs signal claimed maxProfit against
 * actual Binance price data (public klines, no API key required).
 *
 * Called by cron (worker.ts scheduled handler) and via POST /api/outcome/validate
 * for manual triggering.
 */
import { eq, and, lte, sql } from "drizzle-orm";
import { coinlegsSignals } from "../../drizzle/schema";
import { getDb } from "../db";

/* ─── Kline types ─────────────────────────────────────────────────────── */

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

function parseKline(raw: (string | number)[]): Kline {
  return {
    openTime: Number(raw[0]),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    closeTime: Number(raw[6]),
  };
}

/* ─── Duration parsing ────────────────────────────────────────────────── */

function durMs(d: string | null | undefined): number {
  if (!d) return 24 * 60 * 60 * 1000; // default 24h
  const s = d.toLowerCase().trim();
  const v = parseFloat(s.split(/\s+/)[0]);
  if (isNaN(v)) return 24 * 60 * 60 * 1000;
  if (s.includes("day")) return v * 24 * 60 * 60 * 1000;
  if (s.includes("hour") || s.includes("hr")) return v * 60 * 60 * 1000;
  if (s.includes("min")) return v * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/** Map a Coinlegs period string to a Binance kline interval. */
function periodToInterval(period: string): string {
  const p = period.toLowerCase().trim();
  switch (p) {
    case "5m": return "5m";
    case "15m": return "15m";
    case "30m": return "30m";
    case "1h": return "1h";
    case "4h": return "4h";
    case "1d": return "1d";
    case "1w": return "1w";
    default: return "1h";
  }
}

/* ─── Binance klines fetch ────────────────────────────────────────────── */

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  // Binance expects symbols like BTCUSDT (no slash)
  const cleanSymbol = symbol.replace("/", "").toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance klines HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json() as (string | number)[][];
  if (!Array.isArray(data)) {
    throw new Error("Binance klines returned non-array");
  }
  return data.map(parseKline);
}

/* ─── Core validation ─────────────────────────────────────────────────── */

export interface OutcomeValidationSummary {
  status: "success" | "error" | "partial";
  signalsValidated: number;
  avgActualProfit: number;
  avgClaimedProfit: number;
  accuracyPct: number;
  warnings: number;
  errors: number;
  errorMessages: string[];
  durationMs: number;
}

/**
 * Validate all unvalidated signals where enough time has elapsed
 * (1 hour after scraping) for the claimed maxProfit duration to have passed.
 */
export async function validateSignalOutcomes(): Promise<OutcomeValidationSummary> {
  const db = getDb();
  const startedAt = Date.now();
  const errors: string[] = [];
  let signalsValidated = 0;
  let warnings = 0;
  let totalActualProfit = 0;
  let totalClaimedProfit = 0;
  let accuracySum = 0;

  // Only validate signals older than 1 hour so their maxProfit duration has elapsed.
  const cutoff = Date.now() - 60 * 60 * 1000;

  const pending = await db.select()
    .from(coinlegsSignals)
    .where(
      and(
        eq(coinlegsSignals.outcomeValidated, 0),
        eq(coinlegsSignals.signal, 1),
        sql`${coinlegsSignals.scrapedAt} <= ${cutoff}`,
      ),
    )
    .limit(50) // batch size for cron safety
    .all();

  if (pending.length === 0) {
    return {
      status: "success",
      signalsValidated: 0,
      avgActualProfit: 0,
      avgClaimedProfit: 0,
      accuracyPct: 100,
      warnings: 0,
      errors: 0,
      errorMessages: [],
      durationMs: Date.now() - startedAt,
    };
  }

  for (const signal of pending) {
    try {
      const claimedProfit = parseFloat(signal.maxProfit ?? "0");
      const durationMs = durMs(signal.maxProfitDuration);
      const interval = periodToInterval(signal.period);

      // Fetch klines — request enough candles to cover the signal date + duration
      const klines = await fetchKlines(signal.marketName, interval, 50);
      if (klines.length === 0) {
        errors.push(`${signal.marketName}: no klines returned`);
        continue;
      }

      const signalTs = Number(signal.signalDate);
      const windowEnd = signalTs + durationMs;

      // Find the candle closest to signalDate (entry)
      let entryCandle = klines[0];
      let minDist = Infinity;
      for (const k of klines) {
        const dist = Math.abs(k.openTime - signalTs);
        if (dist < minDist) {
          minDist = dist;
          entryCandle = k;
        }
      }

      const entryPrice = entryCandle.close;

      // Scan candles within the maxProfitDuration window
      let maxHigh = entryPrice;
      let minLow = entryPrice;

      for (const k of klines) {
        if (k.openTime >= signalTs && k.openTime <= windowEnd) {
          if (k.high > maxHigh) maxHigh = k.high;
          if (k.low < minLow) minLow = k.low;
        }
        // Also include candles that overlap with the window boundary
        if (k.closeTime >= signalTs && k.openTime <= windowEnd) {
          if (k.high > maxHigh) maxHigh = k.high;
          if (k.low < minLow) minLow = k.low;
        }
      }

      // If no candles fell in the window, mark as validated but with 0 profit (inconclusive)
      const hasData = maxHigh !== entryPrice || minLow !== entryPrice;

      const actualMaxProfitPct = hasData
        ? ((maxHigh - entryPrice) / entryPrice) * 100
        : 0;
      const actualDrawdownPct = hasData
        ? ((entryPrice - minLow) / entryPrice) * 100
        : 0;

      // Flag warning if actual differs from claimed by more than 20%
      let outcomeWarning = 0;
      if (claimedProfit > 0 && actualMaxProfitPct > 0) {
        const diff = Math.abs(actualMaxProfitPct - claimedProfit) / claimedProfit;
        if (diff > 0.2) {
          outcomeWarning = 1;
          warnings++;
        }
      } else if (claimedProfit > 0 && actualMaxProfitPct <= 0) {
        // Claimed profit but none realized — significant discrepancy
        outcomeWarning = 1;
        warnings++;
      }

      // Update the signal row
      await db.update(coinlegsSignals)
        .set({
          outcomeValidated: 1,
          actualMaxProfitPct: actualMaxProfitPct.toFixed(4),
          actualDrawdownPct: actualDrawdownPct.toFixed(4),
          outcomeWarning,
        } as any)
        .where(eq(coinlegsSignals.id, signal.id));

      signalsValidated++;
      totalActualProfit += actualMaxProfitPct;
      totalClaimedProfit += claimedProfit;

      if (claimedProfit > 0) {
        accuracySum += Math.min(actualMaxProfitPct, claimedProfit) / Math.max(actualMaxProfitPct, claimedProfit);
      } else {
        accuracySum += 1;
      }
    } catch (e: any) {
      errors.push(`${signal.marketName} ${signal.period}: ${e?.message ?? String(e)}`);
    }
  }

  const avgActualProfit = signalsValidated > 0 ? totalActualProfit / signalsValidated : 0;
  const avgClaimedProfit = signalsValidated > 0 ? totalClaimedProfit / signalsValidated : 0;
  const accuracyPct = signalsValidated > 0 ? (accuracySum / signalsValidated) * 100 : 100;

  return {
    status: errors.length > 0 ? "partial" : "success",
    signalsValidated,
    avgActualProfit: Math.round(avgActualProfit * 100) / 100,
    avgClaimedProfit: Math.round(avgClaimedProfit * 100) / 100,
    accuracyPct: Math.round(accuracyPct * 100) / 100,
    warnings,
    errors: errors.length,
    errorMessages: errors.slice(0, 10),
    durationMs: Date.now() - startedAt,
  };
}

/* ─── Dashboard stats ─────────────────────────────────────────────────── */

export interface OutcomeStats {
  totalSignals: number;
  validatedCount: number;
  validatedPct: number;
  avgActualProfit: number;
  avgClaimedProfit: number;
  accuracyPct: number;
  warningCount: number;
  warningPct: number;
}

/**
 * Aggregate outcome validation statistics for the dashboard.
 */
export async function getOutcomeStats(): Promise<OutcomeStats> {
  const db = getDb();

  const [{ totalSignals }] = await db
    .select({ totalSignals: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(eq(coinlegsSignals.signal, 1));

  const [{ validatedCount }] = await db
    .select({ validatedCount: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(and(eq(coinlegsSignals.signal, 1), eq(coinlegsSignals.outcomeValidated, 1)));

  const [{ warningCount }] = await db
    .select({ warningCount: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(and(eq(coinlegsSignals.signal, 1), eq(coinlegsSignals.outcomeWarning, 1)));

  const validatedRows = await db
    .select({
      actualMaxProfitPct: coinlegsSignals.actualMaxProfitPct,
      maxProfit: coinlegsSignals.maxProfit,
    })
    .from(coinlegsSignals)
    .where(and(eq(coinlegsSignals.signal, 1), eq(coinlegsSignals.outcomeValidated, 1)))
    .all();

  let totalActual = 0;
  let totalClaimed = 0;
  let accuracySum = 0;

  for (const row of validatedRows) {
    const actual = parseFloat(row.actualMaxProfitPct ?? "0");
    const claimed = parseFloat(row.maxProfit ?? "0");
    totalActual += actual;
    totalClaimed += claimed;
    if (claimed > 0) {
      accuracySum += Math.min(actual, claimed) / Math.max(actual, claimed);
    } else {
      accuracySum += 1;
    }
  }

  const avgActualProfit = validatedRows.length > 0 ? totalActual / validatedRows.length : 0;
  const avgClaimedProfit = validatedRows.length > 0 ? totalClaimed / validatedRows.length : 0;
  const accuracyPct = validatedRows.length > 0 ? (accuracySum / validatedRows.length) * 100 : 100;

  return {
    totalSignals: Number(totalSignals),
    validatedCount: Number(validatedCount),
    validatedPct: Number(totalSignals) > 0 ? Math.round((Number(validatedCount) / Number(totalSignals)) * 10000) / 100 : 0,
    avgActualProfit: Math.round(avgActualProfit * 100) / 100,
    avgClaimedProfit: Math.round(avgClaimedProfit * 100) / 100,
    accuracyPct: Math.round(accuracyPct * 100) / 100,
    warningCount: Number(warningCount),
    warningPct: Number(validatedCount) > 0 ? Math.round((Number(warningCount) / Number(validatedCount)) * 10000) / 100 : 0,
  };
}
