/**
 * Paper trading mode: runs the full analysis pipeline but does NOT dispatch
 * real orders. Instead, logs all signals to the analysis_signals table
 * with dispatched=0 and tracks outcomes over time.
 */

import { getDb } from "../db";
import { analysisSignals } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { UnifiedSignal, EnrichedCandle } from "./types";
import { DEFAULT_ICR_CONFIG } from "./icr/config";
import { KlineFetcher } from "./kline-fetcher";
import { DerivativesFetcher } from "./derivatives/fetcher";
import { computeAlpha } from "./derivatives/alpha";
import { getKlines } from "./kline-repository";
import { enrichCandles } from "./indicators";
import { findSignals } from "./icr/signals";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface PaperTradeConfig {
  enabled: boolean;
  /** Only simulate — never create real TradeIntents */
  maxPaperPositions: number;
  /** Minimum score to paper-trade (lower than live threshold to collect data) */
  minPaperScore: number;
  /** Tiers to paper-trade */
  paperTiers: ("A" | "B")[];
  /** Track outcomes for N hours after signal */
  outcomeTrackHours: number;
}

export const DEFAULT_PAPER_CONFIG: PaperTradeConfig = {
  enabled: true,
  maxPaperPositions: 5,
  minPaperScore: 50,  // lower than live 75
  paperTiers: ["A", "B"],
  outcomeTrackHours: 24,
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Convert ms to a Binance kline interval string that covers the outcome window.
 */
function outcomeWindowToInterval(trackHours: number): string {
  if (trackHours <= 6) return "15m";
  if (trackHours <= 24) return "1h";
  if (trackHours <= 96) return "4h";
  return "1d";
}

/**
 * Fetch Binance klines for outcome validation.
 * Falls back gracefully if the network call fails.
 */
async function fetchActualKlines(
  symbol: string,
  interval: string,
  sinceMs: number,
  limit: number,
): Promise<{ openTime: number; open: number; high: number; low: number; close: number }[]> {
  try {
    const cleanSymbol = symbol.replace("/", "").toUpperCase();
    const params = new URLSearchParams({
      symbol: cleanSymbol,
      interval,
      limit: String(limit),
      startTime: String(sinceMs),
    });
    const url = `https://api.binance.com/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any[] = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((k: any) => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
    }));
  } catch {
    return [];
  }
}

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Run engine in paper-trading mode: generate signals, log them,
 * but DO NOT call dispatchSignal(). Instead, store with dispatched=0
 * and schedule outcome tracking.
 *
 * NOTE: Does NOT dispatch — only records to analysis_signals.
 */
export async function runPaperEngine(
  config: PaperTradeConfig = DEFAULT_PAPER_CONFIG,
): Promise<{
  signalsFound: number;
  qualified: UnifiedSignal[];
  skipped: number;
}> {
  const db = getDb();
  const fetcher = new KlineFetcher();
  const watchlist = fetcher.getWatchlist();

  const qualified: UnifiedSignal[] = [];
  let signalsFound = 0;
  let skipped = 0;

  for (const symbol of watchlist) {
    try {
      // Fetch + enrich — same pipeline as live engine
      const klines = await getKlines(symbol, "4h", 200);
      if (klines.length < 100) continue;

      const enriched = enrichCandles(klines, DEFAULT_ICR_CONFIG);
      const signals = findSignals(enriched, symbol, "4h", DEFAULT_ICR_CONFIG);
      signalsFound += signals.length;

      for (const sig of signals) {
        if (
          sig.score >= config.minPaperScore &&
          config.paperTiers.includes(sig.tier as "A" | "B")
        ) {
          // Record with dispatched=0 (paper only — no live order)
          try {
            await db.insert(analysisSignals).values({
              source: sig.source,
              symbol: sig.symbol,
              timeframe: sig.timeframe,
              direction: sig.direction,
              entry: String(sig.entry),
              stopLoss: sig.stopLoss !== undefined ? String(sig.stopLoss) : null,
              takeProfit: sig.takeProfit !== undefined ? String(sig.takeProfit) : null,
              score: sig.score,
              tier: sig.tier,
              thesis: sig.thesis?.slice(0, 500) ?? null,
              componentsJson: JSON.stringify(sig.components),
              structuralScore: sig.structuralScore,
              structuralConfidence: String(sig.confidence),
              metadataJson: JSON.stringify(sig.metadata),
              dispatched: 0, // PAPER ONLY
              createdAt: Date.now(),
            } as any);
            qualified.push(sig);
          } catch {
            skipped++;
          }
        }
      }
    } catch {
      skipped++;
    }
  }

  return { signalsFound, qualified, skipped };
}

/**
 * Check outcomes of paper-traded signals that have aged enough.
 * Compares signal entry price against actual subsequent Binance klines.
 *
 * Only validates signals older than outcomeTrackHours that haven't been
 * validated yet.
 */
export async function validatePaperOutcomes(
  trackHours: number = 24,
): Promise<{
  validated: number;
  avgOutcome: number;
  winners: number;
  losers: number;
  summary: Record<string, { count: number; avgR: number; winRate: number }>;
}> {
  const db = getDb();
  const cutoff = Date.now() - trackHours * 60 * 60 * 1000;

  // Find paper signals (dispatched=0) older than trackHours that haven't had
  // their metadata updated with outcome data.
  const pending = await db
    .select()
    .from(analysisSignals)
    .where(
      and(
        eq(analysisSignals.dispatched, 0),
        lte(analysisSignals.createdAt, cutoff),
        sql`${analysisSignals.metadataJson} NOT LIKE '%"paperOutcomeR"%'`,
      ),
    )
    .limit(100)
    .all();

  let validated = 0;
  let totalR = 0;
  let winners = 0;
  let losers = 0;
  const summaryMap: Record<
    string,
    { totalR: number; winnerCount: number; signalCount: number }
  > = {};

  for (const paper of pending) {
    try {
      const interval = outcomeWindowToInterval(trackHours);
      const klines = await fetchActualKlines(
        paper.symbol,
        interval,
        paper.createdAt,
        Math.ceil(trackHours * 4), // enough candles to cover the window
      );

      if (klines.length < 2) continue;

      const entryPrice = parseFloat(paper.entry);
      let maxHigh = entryPrice;
      let minLow = entryPrice;

      for (const k of klines) {
        if (k.high > maxHigh) maxHigh = k.high;
        if (k.low < minLow) minLow = k.low;
      }

      // Direction-aware R computation
      const dir = paper.direction;
      let outcomeR: number;
      if (dir === "long") {
        const bestPct = (maxHigh - entryPrice) / entryPrice;
        const worstPct = (minLow - entryPrice) / entryPrice;
        // Reward favorable moves, penalize adverse moves
        outcomeR = bestPct * 100;
        if (worstPct < -(Math.abs(bestPct) * 0.5)) {
          // If worst drawdown exceeded 50% of best excursion, cap the R
          outcomeR = Math.max(outcomeR, worstPct * 100);
        }
      } else {
        const bestPct = (entryPrice - minLow) / entryPrice;
        const worstPct = (entryPrice - maxHigh) / entryPrice;
        outcomeR = bestPct * 100;
        if (worstPct < -(Math.abs(bestPct) * 0.5)) {
          outcomeR = Math.max(outcomeR, worstPct * 100);
        }
      }

      // Persist outcome in metadata
      const meta = paper.metadataJson
        ? JSON.parse(paper.metadataJson as string)
        : {};
      meta.paperOutcomeR = outcomeR;
      meta.paperOutcomeValidatedAt = Date.now();

      await db
        .update(analysisSignals)
        .set({
          metadataJson: JSON.stringify(meta),
        } as any)
        .where(eq(analysisSignals.id, paper.id));

      validated++;
      totalR += outcomeR;
      if (outcomeR > 0) winners++;
      else losers++;

      const sourceKey = paper.source ?? "unknown";
      if (!summaryMap[sourceKey]) {
        summaryMap[sourceKey] = { totalR: 0, winnerCount: 0, signalCount: 0 };
      }
      summaryMap[sourceKey].totalR += outcomeR;
      summaryMap[sourceKey].signalCount++;
      if (outcomeR > 0) summaryMap[sourceKey].winnerCount++;
    } catch {
      // best effort — skip failed validations
    }
  }

  const avgOutcome = validated > 0 ? totalR / validated : 0;

  const summary: Record<string, { count: number; avgR: number; winRate: number }> = {};
  for (const [key, data] of Object.entries(summaryMap)) {
    summary[key] = {
      count: data.signalCount,
      avgR: data.signalCount > 0 ? data.totalR / data.signalCount : 0,
      winRate: data.signalCount > 0 ? data.winnerCount / data.signalCount : 0,
    };
  }

  return { validated, avgOutcome, winners, losers, summary };
}
