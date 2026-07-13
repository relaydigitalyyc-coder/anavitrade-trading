/**
 * Two-tier kline storage: D1 hot (7 days) + R2 cold (full history).
 *
 * R2 path convention (compressed JSON):
 *   klines/{symbol}/{timeframe}/{YYYY-MM}.json.gz
 *
 * Each monthly file is a gzipped JSON array of CompactCandle objects
 * sorted ascending by openTime.
 *
 * A manifest at klines/_manifest.json tracks which (symbol, timeframe, month)
 * combinations have been archived.
 */

export interface CompactCandle {
  t: number;  // openTime (ms)
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

export interface KlineWarehouseConfig {
  hotRetentionDays: number;
  r2Prefix: string; // e.g. "klines"
}

const DEFAULT_CONFIG: KlineWarehouseConfig = {
  hotRetentionDays: 7,
  r2Prefix: "klines",
};

export class KlineWarehouse {
  constructor(
    private r2: R2Bucket,
    private options: Partial<KlineWarehouseConfig> = {},
  ) {}

  private cfg(): KlineWarehouseConfig {
    return { ...DEFAULT_CONFIG, ...this.options };
  }

  /** R2 object key for a given month archive. */
  private r2Key(symbol: string, timeframe: string, year: number, month: number): string {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return `${this.cfg().r2Prefix}/${symbol.toUpperCase()}/${timeframe}/${ym}.json.gz`;
  }

  /** Manifest key in R2. */
  private manifestKey(): string {
    return `${this.cfg().r2Prefix}/_manifest.json`;
  }

  /* ─── R2 Read ─────────────────────────────────────────────────────── */

  /**
   * Fetch one month of klines from R2. Returns empty array if not archived.
   */
  async getMonth(
    symbol: string,
    timeframe: string,
    year: number,
    month: number,
  ): Promise<CompactCandle[]> {
    const key = this.r2Key(symbol, timeframe, year, month);
    try {
      const obj = await this.r2.get(key);
      if (!obj) return [];
      const buf = await obj.arrayBuffer();
      // Decompress gzip
      const ds = new DecompressionStream("gzip");
      const decompressed = await new Response(
        new ReadableStream({
          start(controller) { controller.enqueue(new Uint8Array(buf)); controller.close(); },
        }).pipeThrough(ds),
      ).text();
      return JSON.parse(decompressed) as CompactCandle[];
    } catch {
      return [];
    }
  }

  /**
   * Fetch klines for a date range, potentially spanning multiple months.
   */
  async getRange(
    symbol: string,
    timeframe: string,
    startTime: number,
    endTime: number,
  ): Promise<CompactCandle[]> {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const result: CompactCandle[] = [];

    let y = startDate.getUTCFullYear();
    let m = startDate.getUTCMonth() + 1;
    const endY = endDate.getUTCFullYear();
    const endM = endDate.getUTCMonth() + 1;

    while (y < endY || (y === endY && m <= endM)) {
      const monthData = await this.getMonth(symbol, timeframe, y, m);
      for (const c of monthData) {
        if (c.t >= startTime && c.t <= endTime) result.push(c);
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }

    return result.sort((a, b) => a.t - b.t);
  }

  /* ─── R2 Write ─────────────────────────────────────────────────────── */

  /**
   * Store a batch of candles to the correct monthly archive.
   * Merges with existing data for the same month (dedup by openTime).
   */
  async storeMonth(
    symbol: string,
    timeframe: string,
    candles: CompactCandle[],
  ): Promise<void> {
    if (candles.length === 0) return;

    // Determine the month from the first candle's timestamp
    const first = new Date(candles[0].t);
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;

    // Load existing data for this month and merge
    const existing = await this.getMonth(symbol, timeframe, year, month);
    const seen = new Map<number, CompactCandle>();
    for (const c of existing) seen.set(c.t, c);
    for (const c of candles) seen.set(c.t, c);
    const merged = [...seen.values()].sort((a, b) => a.t - b.t);

    // Compress and write
    const json = JSON.stringify(merged);
    const enc = new TextEncoder();
    const raw = enc.encode(json);
    const cs = new CompressionStream("gzip");
    const compressed = await new Response(
      new ReadableStream({
        start(controller) { controller.enqueue(raw); controller.close(); },
      }).pipeThrough(cs),
    ).arrayBuffer();

    await this.r2.put(this.r2Key(symbol, timeframe, year, month), compressed, {
      httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
    });
  }

  /* ─── Manifest ─────────────────────────────────────────────────────── */

  async getManifest(): Promise<Record<string, unknown>> {
    try {
      const obj = await this.r2.get(this.manifestKey());
      if (!obj) return { version: 1, archived: {} };
      return JSON.parse(await obj.text()) as Record<string, unknown>;
    } catch {
      return { version: 1, archived: {} };
    }
  }

  async updateManifest(symbol: string, timeframe: string, year: number, month: number, count: number): Promise<void> {
    const manifest = await this.getManifest();
    const archived = (manifest.archived as Record<string, unknown>) ?? {};
    const key = `${symbol}/${timeframe}`;
    const months = (archived[key] as Record<string, unknown>) ?? {};
    months[`${year}-${String(month).padStart(2, "0")}`] = { candles: count };
    archived[key] = months;
    manifest.archived = archived;
    manifest.updatedAt = Date.now();
    await this.r2.put(this.manifestKey(), JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  /* ─── Check ────────────────────────────────────────────────────────── */

  async monthExists(symbol: string, timeframe: string, year: number, month: number): Promise<boolean> {
    const key = this.r2Key(symbol, timeframe, year, month);
    try {
      const obj = await this.r2.get(key);
      return obj !== null;
    } catch {
      return false;
    }
  }

  /* ─── Purge ────────────────────────────────────────────────────────── */

  /**
   * Delete R2 archives older than the retention period.
   */
  async purgeOldMonths(retentionMonths: number = 12): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
    let deleted = 0;

    const manifest = await this.getManifest();
    const archived = (manifest.archived as Record<string, Record<string, unknown>>) ?? {};

    for (const [pairTf, months] of Object.entries(archived)) {
      for (const [ym] of Object.entries(months ?? {})) {
        const [y, m] = ym.split("-").map(Number);
        const d = new Date(y, m - 1);
        if (d < cutoff) {
          const [symbol, timeframe] = pairTf.split("/");
          const key = this.r2Key(symbol, timeframe, y, m);
          try {
            await this.r2.delete(key);
            deleted++;
            delete months[ym];
          } catch { /* best effort */ }
        }
      }
    }

    manifest.archived = archived;
    await this.r2.put(this.manifestKey(), JSON.stringify(manifest));
    return deleted;
  }
}
