import type { Kline } from "./types";
import { getLatestTimestamp, upsertKlines } from "./kline-repository";

const BINANCE_REST = "https://api.binance.com";

// Timeframe mapping: our labels → Binance interval params
const INTERVAL_MAP: Record<string, string> = {
  "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
};

// Max candles per REST call (Binance limit is 1000)
const MAX_PER_CALL = 500;

// Top USDT perpetual pairs by volume — fetched live so the watchlist
// adapts automatically as market volume shifts. No hardcoded altcoin list.
const BINANCE_EXCHANGE_INFO = "https://fapi.binance.com/fapi/v1/exchangeInfo";

async function fetchTopUsdtPairs(limit?: number): Promise<string[]> {
  const res = await fetch(BINANCE_EXCHANGE_INFO);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const data = await res.json() as any;
  const symbols = (data?.symbols ?? []) as any[];
  return symbols
    .filter((s: any) =>
      s.symbol?.endsWith("USDT") &&
      s.status === "TRADING" &&
      s.contractType === "PERPETUAL")
    .sort((a: any, b: any) => {
      const va = parseFloat(a.volume24h || a.quoteVolume24h || a.volume || "0");
      const vb = parseFloat(b.volume24h || b.quoteVolume24h || b.volume || "0");
      return vb - va;
    })
    // No slice when no limit — scan every USDT perpetual on Binance.
    // The market decides what's worth trading, not a hard cutoff.
    .slice(0, limit ?? undefined)
    .map((s: any) => s.symbol);
}

export class KlineFetcher {
  private watchlist: string[] | null = null;
  private watchlistSize: number | undefined;
  private minDelayMs: number;

  constructor(watchlistSize?: number, minDelayMs = 200) {
    this.watchlistSize = watchlistSize;
    this.minDelayMs = minDelayMs;
  }

  /**
   * Fetch klines from Binance REST API for one symbol+interval.
   * Returns candles in chronological order (oldest first).
   */
  async fetchKlines(
    symbol: string,
    interval: string,
    limit: number = MAX_PER_CALL,
    startTime?: number,
    endTime?: number,
  ): Promise<Kline[]> {
    const binanceInterval = INTERVAL_MAP[interval];
    if (!binanceInterval) throw new Error(`Unknown interval: ${interval}`);

    const params = new URLSearchParams({
      symbol,
      interval: binanceInterval,
      limit: String(Math.min(limit, MAX_PER_CALL)),
    });
    if (startTime) params.set("startTime", String(Math.floor(startTime)));
    if (endTime) params.set("endTime", String(Math.floor(endTime)));

    const url = `${BINANCE_REST}/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance API error ${res.status}: ${await res.text()}`);
    }

    const data: any[] = await res.json();
    return data.map((k: any) => ({
      symbol,
      timeframe: interval,
      timestamp: k[0],                    // Kline open time
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * Backfill historical data for a symbol+interval.
   * Fetches data in chunks to stay within Binance limits.
   */
  async backfill(
    symbol: string,
    interval: string,
    lookbackBars: number = 500,
  ): Promise<Kline[]> {
    const allCandles: Kline[] = [];
    let remaining = lookbackBars;
    let endTime: number | undefined;

    while (remaining > 0) {
      const batch = Math.min(remaining, MAX_PER_CALL);
      const candles = await this.fetchKlines(symbol, interval, batch, undefined, endTime);
      if (candles.length === 0) break;

      allCandles.unshift(...candles); // prepend since we're fetching backwards
      remaining -= candles.length;
      endTime = candles[0].timestamp; // move window back

      await this.delay();
    }

    if (allCandles.length > 0) {
      await upsertKlines(allCandles);
    }

    return allCandles;
  }

  /**
   * Fetch latest candles for a symbol+interval and merge into DB.
   * Uses the latest stored timestamp to only fetch what's new.
   * Returns the number of new candles stored.
   */
  async updateSymbol(symbol: string, interval: string): Promise<number> {
    const latestTs = await getLatestTimestamp(symbol, interval);
    const newCandles = await this.fetchKlines(
      symbol,
      interval,
      MAX_PER_CALL,
      latestTs ?? undefined,
    );

    // Filter out the partial candle that might overlap with latestTs
    const fresh = latestTs
      ? newCandles.filter((c) => c.timestamp > latestTs)
      : newCandles;

    if (fresh.length > 0) {
      await upsertKlines(fresh);
    }

    return fresh.length;
  }

  /**
   * Update all watchlist symbols for a given timeframe.
   */
  async updateTimeframe(interval: string): Promise<number> {
    if (!this.watchlist) this.watchlist = await fetchTopUsdtPairs(this.watchlistSize);
    let total = 0;
    for (const symbol of this.watchlist) {
      const n = await this.updateSymbol(symbol, interval);
      total += n;
      await this.delay();
    }
    return total;
  }

  /**
   * Update all watchlist symbols across all timeframes.
   * Primary method called by cron.
   */
  async updateAll(): Promise<Record<string, number>> {
    if (!this.watchlist) this.watchlist = await fetchTopUsdtPairs(this.watchlistSize);
    const results: Record<string, number> = {};
    for (const interval of Object.keys(INTERVAL_MAP)) {
      const n = await this.updateTimeframe(interval);
      results[interval] = n;
    }
    return results;
  }

  /**
   * Initial backfill for all watchlist symbols across all timeframes.
   * Call this once on first deploy.
   */
  async backfillAll(lookbackBars: number = 500): Promise<Record<string, number>> {
    if (!this.watchlist) this.watchlist = await fetchTopUsdtPairs(this.watchlistSize);
    const results: Record<string, number> = {};
    for (const interval of Object.keys(INTERVAL_MAP)) {
      let total = 0;
      for (const symbol of this.watchlist) {
        const candles = await this.backfill(symbol, interval, lookbackBars);
        total += candles.length;
        console.error(`  ${symbol} ${interval}: ${candles.length} candles`);
      }
      results[interval] = total;
    }
    return results;
  }

  async getWatchlist(): Promise<string[]> {
    if (!this.watchlist) this.watchlist = await fetchTopUsdtPairs(this.watchlistSize);
    return [...this.watchlist];
  }

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.minDelayMs));
  }
}
