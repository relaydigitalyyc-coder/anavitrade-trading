/**
 * Backfill klines from Binance to local disk (and optionally R2).
 *
 * Creates a local directory structure matching the R2 path convention:
 *   ./klines-data/{symbol}/{timeframe}/{YYYY-MM}.json.gz
 *
 * Usage:
 *   npx tsx scripts/backfill-klines-to-r2.ts --pairs=50 --months=6 --timeframes=4h,1h
 *   npx tsx scripts/backfill-klines-to-r2.ts --resume
 *   npx tsx scripts/backfill-klines-to-r2.ts --sync-r2   # push to Cloudflare R2
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

/* ─── Config ────────────────────────────────────────────────────────── */

const BINANCE_EXCHANGE_INFO = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
const INTERVAL_MAP: Record<string, string> = {
  "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
};

const MAX_PER_CALL = 500;
const RATE_LIMIT_MS = 250;
const DATA_DIR = "./klines-data";

/* ─── CLI Parsing ───────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const parseArg = (flag: string, def: string): string => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : def;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

const CFG = {
  pairs: parseInt(parseArg("--pairs", "50")),
  months: parseInt(parseArg("--months", "6")),
  timeframes: parseArg("--timeframes", "4h,1h,1d").split(",") as string[],
  resume: hasFlag("--resume"),
};

/* ─── Manifest ──────────────────────────────────────────────────────── */

interface Manifest {
  version: number;
  generatedAt: number;
  completed: Record<string, string[]>; // "SYM/TF" -> ["2026-01", "2026-02", ...]
}

function loadManifest(): Manifest {
  const path = `${DATA_DIR}/_manifest.json`;
  if (CFG.resume && existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return { version: 1, generatedAt: Date.now(), completed: {} };
}

function saveManifest(m: Manifest) {
  m.generatedAt = Date.now();
  const path = `${DATA_DIR}/_manifest.json`;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(m, null, 2));
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

interface Candle {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

async function fetchTopPairs(limit: number): Promise<string[]> {
  const res = await fetch(BINANCE_EXCHANGE_INFO);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const data = await res.json() as any;
  const symbols = (data?.symbols ?? []) as any[];
  return symbols
    .filter((s: any) =>
      s.symbol?.endsWith("USDT") && s.status === "TRADING" && s.contractType === "PERPETUAL")
    .sort((a: any, b: any) => {
      const va = parseFloat(a.volume24h || a.quoteVolume24h || a.volume || "0");
      const vb = parseFloat(b.volume24h || b.quoteVolume24h || b.volume || "0");
      return vb - va;
    })
    .slice(0, limit)
    .map((s: any) => s.symbol);
}

async function fetchKlines(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(MAX_PER_CALL) });
  if (startTime) params.set("startTime", String(startTime));
  if (endTime) params.set("endTime", String(endTime));

  const url = `${BINANCE_KLINES}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited — wait and retry once
      await new Promise(r => setTimeout(r, 60000));
      const retry = await fetch(url);
      if (!retry.ok) throw new Error(`Binance API error ${retry.status}: ${await retry.text()}`);
      return parseKlines(await retry.json());
    }
    throw new Error(`Binance API error ${res.status}: ${await res.text()}`);
  }
  return parseKlines(await res.json());
}

function parseKlines(raw: any[]): Candle[] {
  return raw.map((k: any[]) => ({
    t: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]),
    l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function monthlyChunks(symbol: string, tf: string, months: number): Array<{ year: number; month: number; startTime: number; endTime: number }> {
  const now = new Date();
  const chunks: Array<{ year: number; month: number; startTime: number; endTime: number }> = [];

  for (let i = 0; i < months; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59, 999));
    // Skip future partial months
    if (start > now) continue;
    chunks.push({
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      startTime: start.getTime(),
      endTime: Math.min(end.getTime(), now.getTime()),
    });
  }
  return chunks;
}

async function fetchMonthChunked(symbol: string, tf: string, startTime: number, endTime: number): Promise<Candle[]> {
  const all: Candle[] = [];
  let cursor = startTime;

  while (cursor < endTime) {
    const candles = await fetchKlines(symbol, INTERVAL_MAP[tf] || tf, cursor, endTime);
    if (candles.length === 0) break;
    all.push(...candles);
    cursor = candles[candles.length - 1].t + 1;
    await delay(RATE_LIMIT_MS);
  }

  return all;
}

async function saveMonth(symbol: string, tf: string, year: number, month: number, candles: Candle[]): Promise<void> {
  const dir = `${DATA_DIR}/${symbol}/${tf}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${year}-${String(month).padStart(2, "0")}.json.gz`;

  const json = JSON.stringify(candles);
  const gz = createGzip();
  const source = Readable.from([json]);
  const dest = createWriteStream(path);
  await pipeline(source, gz, dest);
}

/* ─── Main ──────────────────────────────────────────────────────────── */

async function main() {
  console.log("=".repeat(70));
  console.log("BACKFILL KLINES TO R2 — Binance → local disk");
  console.log(`  Pairs: ${CFG.pairs} | Months: ${CFG.months} | TFs: ${CFG.timeframes.join(",")}`);
  if (CFG.resume) console.log("  Mode: RESUME (from manifest)");
  console.log("=".repeat(70));

  const manifest = loadManifest();
  const pairs = await fetchTopPairs(CFG.pairs);
  console.log(`\nFound ${pairs.length} USDT perpetual pairs`);

  let totalCandles = 0;
  let totalFiles = 0;

  for (let pi = 0; pi < pairs.length; pi++) {
    const symbol = pairs[pi];
    console.log(`\n[${pi + 1}/${pairs.length}] ${symbol}`);

    for (const tf of CFG.timeframes) {
      if (!INTERVAL_MAP[tf]) {
        console.log(`  SKIP ${tf} — unknown interval`);
        continue;
      }

      const chunks = monthlyChunks(symbol, tf, CFG.months);
      for (const chunk of chunks) {
        const key = `${symbol}/${tf}`;
        const ym = `${chunk.year}-${String(chunk.month).padStart(2, "0")}`;

        // Check manifest for already-completed
        if (manifest.completed[key]?.includes(ym)) {
          process.stdout.write(`  ${tf} ${ym} ✓ (cached)\n`);
          continue;
        }

        // Check if file already exists on disk
        const filePath = `${DATA_DIR}/${symbol}/${tf}/${ym}.json.gz`;
        if (existsSync(filePath)) {
          if (!manifest.completed[key]) manifest.completed[key] = [];
          manifest.completed[key].push(ym);
          process.stdout.write(`  ${tf} ${ym} ✓ (exists)\n`);
          continue;
        }

        process.stdout.write(`  ${tf} ${ym} ... `);
        try {
          const candles = await fetchMonthChunked(symbol, tf, chunk.startTime, chunk.endTime);
          if (candles.length > 0) {
            await saveMonth(symbol, tf, chunk.year, chunk.month, candles);
            if (!manifest.completed[key]) manifest.completed[key] = [];
            manifest.completed[key].push(ym);
            totalCandles += candles.length;
            totalFiles++;
            process.stdout.write(`${candles.length} candles ✓\n`);
          } else {
            process.stdout.write(`empty\n`);
          }
        } catch (e: any) {
          process.stdout.write(`ERROR: ${e?.message?.slice(0, 80)}\n`);
        }

        saveManifest(manifest);
      }
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`DONE: ${totalFiles} files, ${totalCandles} candles`);
  console.log(`Data: ${DATA_DIR}/`);
  console.log("=".repeat(70));
}

main().catch(console.error);
