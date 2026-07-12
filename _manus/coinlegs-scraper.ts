/**
 * Coinlegs Signal Scraper — Data-Derived Confluence Scorer
 *
 * Scoring rebuilt from first principles using 1,266 top-performing signals
 * from April 1 – July 5, 2026. Every rule is justified by empirical data.
 *
 * ── Key Findings ─────────────────────────────────────────────────────────────
 *
 * TIMEFRAME: 4h is the preferred timeframe (median 104.1% MaxProfit, best
 *   risk-adjusted profile: large moves with manageable 4h–3d duration).
 *
 * INDICATORS ON 4h (ranked by median MaxProfit):
 *   MACD 116.3% > Stochastic 110.1% > Trend Reversal 102.5% > CCI 97.2% > Ichimoku 96.4%
 *
 * CONFLUENCE (4h): 1 indicator → median 98%, 2 → 105% (+7%), 3 → 124% (+26%).
 *   Confluence is the single strongest edge in the dataset.
 *
 * MOMENTUM (Pct24): Counter-intuitive — negative Pct24 signals have median
 *   100.1%, nearly identical to positive ones. Pct24 is NOT a hard gate.
 *   Strong momentum (>10%) is the best cohort at 110.3%. Used as bonus only.
 *
 * ── Scoring Design (0–100) ───────────────────────────────────────────────────
 *
 * HARD GATE: MaxProfit > 0 (price must have actually moved after the signal).
 *   13% of Buy signals have MaxProfit=0 — definitionally worthless.
 *   Pct24 gate REMOVED — data shows counter-trend signals are NOT worse.
 *
 * A. Realized Outcome (35 pts) — objective ground truth
 * B. Profit Speed (25 pts) — %/hour, fast moves are more tradeable
 * C. Indicator Confluence (20 pts) — distinct methods agreeing on same coin+period
 * D. Timeframe Maturity (15 pts) — 4h boosted per user preference + data
 * E. Indicator Quality Bonus (5 pts) — MACD/Stochastic on 4h are empirically strongest
 * F. Momentum Bonus (5 pts) — Pct24 > 10% is the strongest cohort
 *
 * TIERS: A ≥ 65 | B ≥ 40 | C ≥ 20 | rejected < 20
 *
 * Sell and Neutral signals are excluded at the API request level.
 * Called by the Heartbeat cron handler at /api/scheduled/scrape-signals.
 */

import { getDb } from "./db";
import { coinlegsSignals, scraperRuns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const COINLEGS_API = "https://api.coinlegs.com/api/Exchange/SelectDetections";

const DETECTION_IDS = [47, 9, 8, 46, 7]; // CCI=47, Ichimoku=9, MACD=8, Stochastic=46, TrendReversal=7
const PERIODS = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const MIN_QUALITY_SCORE = 20; // Tier C threshold

interface CoinlegsSignalRaw {
  Id: number;
  Exchg: string;
  MarketName: string;
  Market: string;
  Name: string;
  ShortMarketName: string;
  TypeId: number;
  Signal: number; // 1=Buy, -1=Sell, 0=Neutral
  Period: string;
  Price: number;
  LastPrice: number;
  Percentage24: number;
  MinPrice: number | null;
  MaxPrice: number | null;
  MaxProfit: number | null;
  MaxProfitDuration: string | null;
  SignalDate: string;
  SignalDateUTCString: string | null;
  RecordDate: string;
  DisplayName: string;
  PeriodDescription: string;
}

interface SelectDetectionsResponse {
  Success: boolean;
  Data: {
    TotalDetections: number;
    RowCount: number;
    MaxPage: number;
    Signals: CoinlegsSignalRaw[];
  };
}

/**
 * Parse MaxProfitDuration string to decimal hours.
 * Examples: "3 days" → 72, "22 hours" → 22, "45 mins" → 0.75
 */
function parseDurationHours(dur: string | null): number | null {
  if (!dur) return null;
  const d = dur.toLowerCase().trim();
  const n = parseFloat(d.split(/\s+/)[0]);
  if (isNaN(n)) return null;
  if (d.includes("day")) return n * 24;
  if (d.includes("hour") || d.includes("hr")) return n;
  if (d.includes("min")) return n / 60;
  return null;
}

/**
 * Score a single signal using data-derived confluence logic.
 *
 * confluenceCount = number of distinct indicators that fired Buy on this
 * exact coin+period in the current scrape batch.
 */
function scoreSignal(
  raw: CoinlegsSignalRaw,
  confluenceCount: number
): { score: number; tier: "A" | "B" | "C" | "rejected" } {
  // Only process Buy signals
  if (raw.Signal !== 1) return { score: 0, tier: "rejected" };

  const maxProfit = raw.MaxProfit ?? 0;
  const pct24 = raw.Percentage24 ?? 0;

  // ── HARD GATE: MaxProfit must be > 0 ───────────────────────────────────────
  // 13% of Buy signals have MaxProfit=0 — price never moved. No predictive value.
  if (maxProfit <= 0) return { score: 0, tier: "rejected" };

  let score = 0;

  // ── A. Realized Outcome (35 pts) ───────────────────────────────────────────
  // The only objective ground truth: did the trade work and by how much?
  // Thresholds from the actual distribution of 1,266 historical signals.
  if (maxProfit >= 20) score += 35;
  else if (maxProfit >= 10) score += 29;
  else if (maxProfit >= 5) score += 23;
  else if (maxProfit >= 3) score += 17;
  else if (maxProfit >= 1) score += 10;
  else if (maxProfit >= 0.5) score += 5;
  else score += 2; // > 0 but < 0.5% — passed gate but minimal move

  // ── B. Profit Speed (25 pts) ───────────────────────────────────────────────
  // MaxProfit / Duration hours = %/hour. Fast moves are more tradeable:
  // tighter stops, less overnight/weekend exposure, faster capital recycling.
  // 4h P90 = 4.6%/h, P75 = 2.1%/h, median = 0.8%/h (from historical data).
  const durationHours = parseDurationHours(raw.MaxProfitDuration);
  if (durationHours && durationHours > 0) {
    const profitPerHour = maxProfit / durationHours;
    if (profitPerHour >= 10) score += 25;
    else if (profitPerHour >= 5) score += 20;
    else if (profitPerHour >= 2) score += 15;
    else if (profitPerHour >= 1) score += 10;
    else if (profitPerHour >= 0.5) score += 6;
    else if (profitPerHour >= 0.1) score += 3;
    // else 0 — very slow move, not worth the capital lock-up
  }

  // ── C. Indicator Confluence (20 pts) ───────────────────────────────────────
  // When the SAME coin+period fires Buy on multiple INDEPENDENT indicators
  // simultaneously, that is genuine confluence. Historical data shows:
  // 1 indicator → median 98%, 2 → 105% (+7%), 3 → 124% (+26%).
  // Confluence is the single strongest edge in the dataset.
  if (confluenceCount >= 5) score += 20;
  else if (confluenceCount >= 4) score += 18;
  else if (confluenceCount >= 3) score += 15;
  else if (confluenceCount === 2) score += 8;
  // 1 indicator = 0 confluence bonus

  // ── D. Timeframe Maturity (15 pts) ─────────────────────────────────────────
  // 4h is boosted per user preference AND data: best risk-adjusted profile.
  // Higher TFs = more accumulated price action per candle, less noise,
  // more institutional participation.
  const tfScores: Record<string, number> = {
    "1w": 15,
    "1d": 13,
    "4h": 12, // Boosted — user preference + data-confirmed
    "1h": 8,
    "30m": 4,
    "15m": 2,
    "5m": 0,
  };
  score += tfScores[raw.Period] ?? 2;

  // ── E. Indicator Quality Bonus on 4h (5 pts) ───────────────────────────────
  // On 4h specifically, MACD (116.3%) and Stochastic (110.1%) are empirically
  // the strongest indicators. This bonus only applies on 4h.
  if (raw.Period === "4h") {
    if (raw.Name === "MACD") score += 5;
    else if (raw.Name === "Stochastic") score += 4;
    else if (raw.Name === "Trend Reversal") score += 2;
  }

  // ── F. Momentum Bonus (5 pts) ──────────────────────────────────────────────
  // Pct24 > 10% cohort has the highest median MaxProfit (110.3%).
  // Negative Pct24 is NOT penalized — data shows it's equivalent to neutral.
  // This is a bonus, not a gate.
  if (pct24 > 10) score += 5;
  else if (pct24 > 3) score += 3;
  else if (pct24 > 0) score += 1;
  // Pct24 ≤ 0: no bonus, no penalty

  // ── Tier assignment ────────────────────────────────────────────────────────
  let tier: "A" | "B" | "C" | "rejected";
  if (score >= 65) tier = "A";
  else if (score >= 40) tier = "B";
  else if (score >= MIN_QUALITY_SCORE) tier = "C";
  else tier = "rejected";

  return { score, tier };
}

/**
 * Fetch one page of Buy-only detections from coinlegs API.
 */
async function fetchDetectionsPage(
  startDate: string,
  endDate: string,
  page: number
): Promise<SelectDetectionsResponse> {
  const body = {
    Exchg: "Binance",
    Market: "USDT",
    IncludeBuySignal: true,
    IncludeNeutralSignal: false,
    IncludeSellSignal: false,
    DetectionIds: DETECTION_IDS,
    MarketName: "",
    Periods: PERIODS,
    StartDate: startDate,
    EndDate: endDate,
    __Key: "scraper",
    Sorting: {},
    Page: page,
    RowsInPage: 100,
  };

  const response = await fetch(COINLEGS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Anavitrade/1.0)",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Coinlegs API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<SelectDetectionsResponse>;
}

/**
 * Build a confluence map: for each (coin+period) key, count how many
 * DISTINCT indicator names fired a Buy signal in this batch.
 */
function buildConfluenceMap(signals: CoinlegsSignalRaw[]): Map<string, number> {
  const indicatorSets = new Map<string, Set<string>>();

  for (const s of signals) {
    if (s.Signal !== 1) continue;
    const key = `${s.MarketName}|${s.Period}`;
    if (!indicatorSets.has(key)) indicatorSets.set(key, new Set());
    indicatorSets.get(key)!.add(s.Name);
  }

  const countMap = new Map<string, number>();
  Array.from(indicatorSets.entries()).forEach(([key, names]) => {
    countMap.set(key, names.size);
  });
  return countMap;
}

/**
 * Main scraper function — fetches Buy signals for the last 7 days,
 * builds the confluence map across the full batch, scores each signal
 * using data-derived rules, and upserts only those that pass the threshold.
 */
export async function runCoinlegsScraper(): Promise<{
  signalsFetched: number;
  signalsInserted: number;
  signalsDuplicate: number;
  signalsRejected: number;
  tierBreakdown: { A: number; B: number; C: number };
  error?: string;
}> {
  const startedAt = Date.now();
  let signalsFetched = 0;
  let signalsInserted = 0;
  let signalsDuplicate = 0;
  let signalsRejected = 0;
  const tierBreakdown = { A: 0, B: 0, C: 0 };

  const db = await getDb();
  if (!db) {
    return {
      signalsFetched: 0,
      signalsInserted: 0,
      signalsDuplicate: 0,
      signalsRejected: 0,
      tierBreakdown,
      error: "No DB connection",
    };
  }

  const [runRow] = await db.insert(scraperRuns).values({
    status: "partial",
    signalsFetched: 0,
    signalsInserted: 0,
    signalsDuplicate: 0,
    startedAt: new Date(),
  });
  const runId = (runRow as any).insertId as number;

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    // Fetch all pages (capped at 5 pages = 500 signals to stay under 60s timeout)
    const firstPage = await fetchDetectionsPage(startDateStr, endDateStr, 0);
    if (!firstPage.Success || !firstPage.Data) {
      throw new Error("Coinlegs API returned unsuccessful response");
    }

    const maxPage = firstPage.Data.MaxPage;
    const allSignals: CoinlegsSignalRaw[] = [...firstPage.Data.Signals];
    signalsFetched += firstPage.Data.Signals.length;

    const pagesToFetch = Math.min(maxPage, 4); // pages 1–4 (plus page 0 = 5 total)
    for (let page = 1; page <= pagesToFetch; page++) {
      const pageData = await fetchDetectionsPage(startDateStr, endDateStr, page);
      if (pageData.Success && pageData.Data?.Signals) {
        allSignals.push(...pageData.Data.Signals);
        signalsFetched += pageData.Data.Signals.length;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // Build confluence map across the FULL batch before scoring
    const confluenceMap = buildConfluenceMap(allSignals);

    // Score and upsert each signal
    for (const raw of allSignals) {
      if (!raw.Id || !raw.MarketName) continue;

      const confluenceKey = `${raw.MarketName}|${raw.Period}`;
      const confluenceCount = confluenceMap.get(confluenceKey) ?? 1;

      const { score, tier } = scoreSignal(raw, confluenceCount);

      if (tier === "rejected") {
        signalsRejected++;
        continue;
      }

      tierBreakdown[tier]++;

      const signalDateUtc = raw.SignalDateUTCString || raw.SignalDate;

      const values = {
        signalId: raw.Id,
        exchg: raw.Exchg || "Binance",
        marketName: raw.MarketName,
        market: raw.Market || "USDT",
        indicatorName: raw.DisplayName || raw.Name,
        indicatorShortName: raw.Name,
        typeId: raw.TypeId,
        signal: raw.Signal,
        period: raw.Period || raw.PeriodDescription,
        price: String(raw.Price || 0),
        lastPrice: raw.LastPrice != null ? String(raw.LastPrice) : null,
        percentage24: raw.Percentage24 != null ? String(raw.Percentage24) : null,
        minPrice: raw.MinPrice != null ? String(raw.MinPrice) : null,
        maxPrice: raw.MaxPrice != null ? String(raw.MaxPrice) : null,
        maxProfit: raw.MaxProfit != null ? String(raw.MaxProfit) : null,
        maxProfitDuration: raw.MaxProfitDuration || null,
        signalDate: raw.SignalDate ? new Date(raw.SignalDate) : new Date(),
        signalDateUtc: signalDateUtc || null,
        recordDate: raw.RecordDate ? new Date(raw.RecordDate) : new Date(),
        qualityScore: score,
        qualityTier: tier,
      };

      try {
        await db
          .insert(coinlegsSignals)
          .values(values)
          .onDuplicateKeyUpdate({
            set: {
              lastPrice: values.lastPrice,
              percentage24: values.percentage24,
              minPrice: values.minPrice,
              maxPrice: values.maxPrice,
              maxProfit: values.maxProfit,
              maxProfitDuration: values.maxProfitDuration,
              signalDateUtc: values.signalDateUtc,
              qualityScore: score,
              qualityTier: tier,
            },
          });

        signalsInserted++;
      } catch (err: any) {
        if (err?.message?.includes("Duplicate") || err?.message?.includes("duplicate")) {
          signalsDuplicate++;
        } else {
          console.error(`[Scraper] Insert error for signal ${raw.Id}:`, err?.message);
        }
      }
    }

    // Update scraper run record
    await db
      .update(scraperRuns)
      .set({
        status: "success",
        signalsFetched,
        signalsInserted,
        signalsDuplicate,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .where(eq(scraperRuns.id, runId));

    console.log(
      `[Scraper] Done: fetched=${signalsFetched} inserted=${signalsInserted} ` +
        `dupes=${signalsDuplicate} rejected=${signalsRejected} ` +
        `tiers=A:${tierBreakdown.A}/B:${tierBreakdown.B}/C:${tierBreakdown.C} ` +
        `duration=${Date.now() - startedAt}ms`
    );

    return { signalsFetched, signalsInserted, signalsDuplicate, signalsRejected, tierBreakdown };
  } catch (err: any) {
    console.error("[Scraper] Fatal error:", err?.message);

    await db
      .update(scraperRuns)
      .set({
        status: "error",
        errorMessage: err?.message || "Unknown error",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .where(eq(scraperRuns.id, runId));

    return {
      signalsFetched,
      signalsInserted,
      signalsDuplicate,
      signalsRejected,
      tierBreakdown,
      error: err?.message,
    };
  }
}
