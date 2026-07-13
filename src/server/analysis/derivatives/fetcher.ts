import type { DerivativesSnapshot } from "../types";

const BINANCE_EXCHANGE_INFO = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_FUTURES = "https://fapi.binance.com";

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
    .slice(0, limit ?? undefined)
    .map((s: any) => s.symbol);
}

export class DerivativesFetcher {
  private watchlist: string[] | null = null;
  private watchlistSize: number | undefined;
  private minDelayMs: number;

  constructor(watchlistSize?: number, minDelayMs = 200) {
    this.watchlistSize = watchlistSize;
    this.minDelayMs = minDelayMs;
  }

  private async ensureWatchlist(): Promise<string[]> {
    if (!this.watchlist) this.watchlist = await fetchTopUsdtPairs(this.watchlistSize);
    return this.watchlist;
  }

  /**
   * Fetch open interest for a symbol from Binance futures.
   * Public endpoint, no API key required.
   */
  async fetchOpenInterest(symbol: string): Promise<{ openInterest: number; oiChange24h: number }> {
    const url = `${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${symbol}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OI API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { openInterest: string };
    return {
      openInterest: parseFloat(data.openInterest),
      oiChange24h: 0, // Placeholder — needs two data points to compute
    };
  }

  /**
   * Fetch funding rate for a symbol.
   */
  async fetchFundingRate(symbol: string): Promise<{ rate: number; nextTime: number }> {
    const url = `${BINANCE_FUTURES}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Funding rate API error ${res.status}: ${await res.text()}`);
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      return { rate: 0, nextTime: 0 };
    }
    const record = raw[0] as { fundingRate: string; fundingTime: number };
    return {
      rate: parseFloat(record.fundingRate),
      nextTime: record.fundingTime,
    };
  }

  /**
   * Fetch long/short ratio (global accounts).
   */
  async fetchLongShortRatio(symbol: string): Promise<{ ratio: number; longPct: number; shortPct: number }> {
    const url = `${BINANCE_FUTURES}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`L/S ratio API error ${res.status}: ${await res.text()}`);
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ratio: 1.0, longPct: 50, shortPct: 50 };
    }
    const record = raw[0] as { longShortRatio: string; longAccount: string; shortAccount: string };
    return {
      ratio: parseFloat(record.longShortRatio),
      longPct: parseFloat(record.longAccount),
      shortPct: parseFloat(record.shortAccount),
    };
  }

  /**
   * Fetch a full snapshot for one symbol (OI + funding + L/S).
   */
  async snapshotSymbol(symbol: string): Promise<DerivativesSnapshot> {
    const [oi, fr, ls] = await Promise.all([
      this.fetchOpenInterest(symbol).catch(() => ({ openInterest: 0, oiChange24h: 0 })),
      this.fetchFundingRate(symbol).catch(() => ({ rate: 0, nextTime: 0 })),
      this.fetchLongShortRatio(symbol).catch(() => ({ ratio: 1.0, longPct: 50, shortPct: 50 })),
    ]);

    return {
      symbol,
      timestamp: Date.now(),
      openInterest: oi.openInterest,
      oiChange24h: oi.oiChange24h,
      fundingRate: fr.rate,
      longShortRatio: ls.ratio,
      longPct: ls.longPct,
      shortPct: ls.shortPct,
    };
  }

  /**
   * Fetch snapshots for all watchlist symbols.
   */
  async snapshotAll(): Promise<DerivativesSnapshot[]> {
    await this.ensureWatchlist();
    const snapshots: DerivativesSnapshot[] = [];
    for (const sym of this.watchlist!) {
      const snap = await this.snapshotSymbol(sym);
      snapshots.push(snap);
      await this.delay();
    }
    return snapshots;
  }

  async getWatchlist(): Promise<string[]> {
    await this.ensureWatchlist();
    return [...this.watchlist!];
  }

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.minDelayMs));
  }
}
