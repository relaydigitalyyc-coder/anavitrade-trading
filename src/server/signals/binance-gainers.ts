/**
 * Binance perp top-gainers / volume-breakout scanner.
 *
 * Single call to Binance Futures' /ticker/24hr (no symbol param returns all
 * USDT perpetuals in one response) — no per-symbol kline fetches, so this
 * stays well under the Worker's 50-subrequest cap and can run every cron
 * fire (~60s). Ranks by 24h % gain plus a volume-participation floor, scores
 * a composite 0-100, and routes qualifying candidates through the same
 * dispatchSignal() pipeline every other signal source uses (idempotency →
 * SMC validation → analysisSignals → TradeIntent → execution jobs).
 */
import type { UnifiedSignal } from "../analysis/types";
import { dispatchSignal } from "../analysis/dispatcher";

const FUTURES_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";

/** Liquidity floor — reject movers with too little 24h quote volume to be
 *  tradeable at size without excessive slippage (avoids illiquid pump traps). */
export const MIN_QUOTE_VOLUME_USD = 3_000_000;

/** How many top-gainer candidates (after the liquidity floor) to consider per scan. */
export const MAX_CANDIDATES = 25;

/** Pure USDT perpetual symbols only — excludes quarterly/delivery contracts,
 *  which carry a date suffix like BTCUSDT_240329. */
const PERP_SYMBOL_RE = /^[A-Z0-9]+USDT$/;

export interface BinanceTickerRow {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
}

export interface GainerCandidate {
  symbol: string;
  pct24: number;
  price: number;
  quoteVolume: number;
  volumeRank: number; // 0-1 percentile within this scan's qualifying set
  score: number; // 0-100 composite
  tier: "A" | "B" | "C";
}

export interface BinanceGainersResult {
  fetched: number;
  qualified: number;
  candidates: GainerCandidate[];
  tierA: number;
  tierB: number;
  tierC: number;
  intentsCreated: number;
  durationMs: number;
  error?: string;
}

export type FetchTickerFn = () => Promise<BinanceTickerRow[]>;
export type DispatchFn = (signal: UnifiedSignal) => Promise<{ intentId: number | null; error?: string }>;

async function defaultFetchTicker(): Promise<BinanceTickerRow[]> {
  const res = await fetch(FUTURES_TICKER_URL);
  if (!res.ok) throw new Error(`Binance ticker/24hr HTTP ${res.status}`);
  return (await res.json()) as BinanceTickerRow[];
}

/** Composite 0-100 score: 60% weight on gain magnitude (saturates at +25%),
 *  40% weight on volume percentile rank within this scan's qualifying set. */
export function scoreCandidate(pct24: number, volumeRank: number): number {
  const gainScore = Math.max(0, Math.min(100, (pct24 / 25) * 100));
  const volumeScore = Math.max(0, Math.min(100, volumeRank * 100));
  return Math.round(gainScore * 0.6 + volumeScore * 0.4);
}

export function tierFromScore(score: number): "A" | "B" | "C" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  return "C";
}

/** Volatility-scaled stop distance: a flat 2% generic stop is too tight for a
 *  symbol that already moved 15-30% in a day. Scale with the realized move,
 *  clamped to a sane range. */
export function stopPctForMove(pct24: number): number {
  return Math.max(0.03, Math.min(0.12, (Math.abs(pct24) / 100) * 0.25));
}

export function rankAndScoreCandidates(rows: BinanceTickerRow[]): GainerCandidate[] {
  const parsed = rows
    .filter((r) => PERP_SYMBOL_RE.test(r.symbol))
    .map((r) => ({
      symbol: r.symbol,
      pct24: parseFloat(r.priceChangePercent),
      price: parseFloat(r.lastPrice),
      quoteVolume: parseFloat(r.quoteVolume),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.pct24) &&
        Number.isFinite(r.price) &&
        r.price > 0 &&
        Number.isFinite(r.quoteVolume) &&
        r.quoteVolume >= MIN_QUOTE_VOLUME_USD &&
        r.pct24 > 0, // top GAINERS — upside moves only
    )
    .sort((a, b) => b.pct24 - a.pct24)
    .slice(0, MAX_CANDIDATES);

  if (parsed.length === 0) return [];

  const volumes = [...parsed.map((r) => r.quoteVolume)].sort((a, b) => a - b);
  const volumeRank = (v: number) => {
    // Fraction of the qualifying set at or below this volume.
    let idx = 0;
    while (idx < volumes.length && volumes[idx] <= v) idx++;
    return volumes.length > 1 ? idx / volumes.length : 1;
  };

  return parsed.map((r) => {
    const vr = volumeRank(r.quoteVolume);
    const score = scoreCandidate(r.pct24, vr);
    return {
      symbol: r.symbol,
      pct24: r.pct24,
      price: r.price,
      quoteVolume: r.quoteVolume,
      volumeRank: vr,
      score,
      tier: tierFromScore(score),
    };
  });
}

export function buildUnifiedSignal(c: GainerCandidate): UnifiedSignal {
  const stopPct = stopPctForMove(c.pct24);
  const rrMultiplier = 2;
  const stopLoss = parseFloat((c.price * (1 - stopPct)).toFixed(8));
  const takeProfit = parseFloat((c.price * (1 + stopPct * rrMultiplier)).toFixed(8));

  return {
    source: "binance-gainers",
    symbol: c.symbol.replace(/USDT$/, ""),
    timeframe: "1d",
    direction: "long",
    entry: c.price,
    stopLoss,
    takeProfit,
    score: c.score,
    tier: c.tier,
    thesis: `Binance perp top gainer: ${c.symbol} +${c.pct24.toFixed(2)}% 24h, quoteVolume $${(c.quoteVolume / 1_000_000).toFixed(1)}M`,
    components: { gain24h: c.pct24, volumeRank: Math.round(c.volumeRank * 100) },
    structuralScore: c.score,
    confidence: c.score / 100,
    timestamp: Date.now(),
    metadata: {
      pct24: c.pct24,
      quoteVolume: c.quoteVolume,
      indicatorName: "binance_top_gainer",
    },
  };
}

/**
 * Run one scan: fetch, rank, score, dispatch Tier A candidates.
 * Tier A only for now (mirrors the native generator's dispatch discipline —
 * loosen to Tier B once this source has a track record).
 */
export async function runBinanceGainersScan(
  fetchTicker: FetchTickerFn = defaultFetchTicker,
  dispatch: DispatchFn = dispatchSignal,
): Promise<BinanceGainersResult> {
  const startedAt = Date.now();
  try {
    const rows = await fetchTicker();
    const candidates = rankAndScoreCandidates(rows);

    let tierA = 0, tierB = 0, tierC = 0, intentsCreated = 0;
    for (const c of candidates) {
      if (c.tier === "A") tierA++;
      else if (c.tier === "B") tierB++;
      else tierC++;

      if (c.tier !== "A") continue;

      try {
        const result = await dispatch(buildUnifiedSignal(c));
        if (result.intentId !== null) intentsCreated++;
      } catch (e: any) {
        console.warn(`[binance-gainers] dispatch error ${c.symbol}: ${e?.message}`);
      }
    }

    return {
      fetched: rows.length,
      qualified: candidates.length,
      candidates,
      tierA,
      tierB,
      tierC,
      intentsCreated,
      durationMs: Date.now() - startedAt,
    };
  } catch (e: any) {
    return {
      fetched: 0,
      qualified: 0,
      candidates: [],
      tierA: 0,
      tierB: 0,
      tierC: 0,
      intentsCreated: 0,
      durationMs: Date.now() - startedAt,
      error: e?.message ?? String(e),
    };
  }
}
