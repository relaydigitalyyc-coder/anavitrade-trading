/**
 * CORPUS BUILDER — Massive backtest corpus from real Binance klines.
 *
 * For each (pair, timeframe):
 *   1. Load klines from local disk (R2-style paths: ./klines-data/)
 *   2. Run enrichCandles() to compute all indicators
 *   3. For each candle index (progressive window), run ALL detection modules
 *   4. For each signal that has stop/TP levels, simulate smart exit
 *   5. Store results to a local SQLite database (corpus.db)
 *   6. Checkpoint/resume via manifest
 *
 * Usage:
 *   npx tsx scripts/build-corpus.ts --pairs=50 --months=6 --timeframes=4h,1h
 *   npx tsx scripts/build-corpus.ts --resume
 *   npx tsx scripts/build-corpus.ts --pairs=5 --months=1 --timeframes=4h --dry-run
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createGunzip, createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable, Writable } from "stream";

// ─── Imports from the codebase (pure functions only) ──────────────────
import { enrichCandles } from "../src/server/analysis/indicators";
import { DEFAULT_ICR_CONFIG, DEFAULT_COIL_CONFIG } from "../src/server/analysis/icr/config";
import { findSignals } from "../src/server/analysis/icr/signals";
import { annotateWithCoilScores } from "../src/server/analysis/icr/coil";
import type { Kline, EnrichedCandle, UnifiedSignal } from "../src/server/analysis/types";
import { simulateSmartExit } from "../src/server/analysis/exits/exit-engine";
import { DEFAULT_EXIT_CONFIG } from "../src/server/analysis/exits/exit-engine";

// Note: detector modules take (closes[], highs[], lows[], pair, period)
// We import them for type reference but call them dynamically per candle
import type { IndicatorSignal } from "../src/server/signals/indicators";

// ─── Config ───────────────────────────────────────────────────────────

const DATA_DIR = "./klines-data";
const OUTPUT_DIR = "./corpus-data";
const BATCH_SIZE = 100; // rows per SQL insert batch

const EXIT_CFG = {
  ...DEFAULT_EXIT_CONFIG,
  // Tail-preserving config — matches live behavior
  // (5ATR trail, activate at +4R, no early BE, no fib scale-outs)
};

interface CorpusCandle {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

interface DetectorRow {
  symbol: string;
  timeframe: string;
  openTime: number;
  detectorName: string;
  signal: number;
  direction?: string;
  confidence?: number;
  score?: number;
  tier?: string;
  metadata: Record<string, unknown>;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitSimR?: string;
  exitReason?: string;
}

// ─── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const parseArg = (flag: string, def: string): string => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : def;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

const CFG = {
  pairs: parseInt(parseArg("--pairs", "50")),
  months: parseInt(parseArg("--months", "6")),
  timeframes: parseArg("--timeframes", "4h,1h,1d").split(","),
  resume: hasFlag("--resume"),
  dryRun: hasFlag("--dry-run"),
};

// ─── Manifest ─────────────────────────────────────────────────────────

interface Manifest {
  version: number;
  startedAt: number;
  completed: Record<string, string[]>; // "SYM/TF" -> ["2026-01", "2026-02", ...]
  pairs: number;
  months: number;
  totalSignals: number;
}

function loadManifest(): Manifest {
  const path = `${OUTPUT_DIR}/_manifest.json`;
  if (CFG.resume && existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return { version: 1, startedAt: Date.now(), completed: {}, pairs: 0, months: 0, totalSignals: 0 };
}

function saveManifest(m: Manifest) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/_manifest.json`, JSON.stringify(m, null, 2));
}

// ─── Kline Loader ─────────────────────────────────────────────────────

function loadKlines(symbol: string, tf: string, year: number, month: number): CorpusCandle[] {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const path = `${DATA_DIR}/${symbol}/${tf}/${ym}.json.gz`;
  if (!existsSync(path)) return [];

  const buf = readFileSync(path);
  const json = require("zlib").gunzipSync(buf).toString("utf-8");
  return JSON.parse(json) as CorpusCandle[];
}

function toKline(c: CorpusCandle): Kline {
  return {
    symbol: "",
    timeframe: "",
    timestamp: c.t,
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v,
  };
}

function closes(arr: CorpusCandle[]): number[] { return arr.map(c => c.c); }
function highs(arr: CorpusCandle[]): number[] { return arr.map(c => c.h); }
function lows(arr: CorpusCandle[]): number[] { return arr.map(c => c.l); }
function volumes(arr: CorpusCandle[]): number[] { return arr.map(c => c.v); }

// ─── Dynamic Detector Imports (lazy, may not exist) ───────────────────

let _detectors: Record<string, any> | null = null;
async function getDetectors(): Promise<Record<string, any>> {
  if (_detectors) return _detectors;
  const d: Record<string, any> = {};

  try {
    const mod = await import("../src/server/signals/indicators");
    d.scanSignals = mod.scanSignals;
  } catch { console.warn("[corpus] indicators.ts not available"); }

  try {
    const mod = await import("../src/server/signals/bbawe");
    d.detectBbawe = mod.detectBbawe;
  } catch { console.warn("[corpus] bbawe.ts not available"); }

  try {
    const mod = await import("../src/server/signals/market-cipher");
    d.detectMarketCipher = mod.detectMarketCipher;
  } catch { console.warn("[corpus] market-cipher.ts not available"); }

  try {
    const mod = await import("../src/server/signals/wolfpack");
    d.detectWolfpack = mod.detectWolfpack;
  } catch { console.warn("[corpus] wolfpack.ts not available"); }

  try {
    const mod = await import("../src/server/signals/luxalgo-ict");
    d.detectMSS = mod.detectMSS;
    d.detectOrderBlocks = mod.detectOrderBlocks;
    d.detectLiquidity = mod.detectLiquidity;
    d.detectFVG = mod.detectFVG;
    d.detectKillzone = mod.detectKillzone;
  } catch { console.warn("[corpus] luxalgo-ict.ts not available"); }

  try {
    const mod = await import("../src/server/signals/swing-sniper");
    d.detectSwingSniper = mod.detectSwingSniper;
  } catch { console.warn("[corpus] swing-sniper.ts not available"); }

  _detectors = d;
  return d;
}

// ─── Per-Candle Detection Runner ──────────────────────────────────────

async function runDetectorsOnWindow(
  candles: CorpusCandle[],
  enriched: EnrichedCandle[],
  symbol: string,
  tf: string,
  i: number,
  det: Record<string, any>,
): Promise<DetectorRow[]> {
  const rows: DetectorRow[] = [];
  const window = candles.slice(0, i + 1);
  const cl = closes(window);
  const hi = highs(window);
  const lo = lows(window);
  const vo = volumes(window);
  const candle = candles[i];
  const enrichedCandle = enriched[i];
  if (!candle || !enrichedCandle) return rows;

  // ── 1. Standard 5 indicators (scanSignals) ──
  if (det.scanSignals) {
    try {
      const sigs: IndicatorSignal[] = det.scanSignals(
        window.map(c => ({ open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v, time: c.t })),
        symbol, tf,
      );
      for (const sig of sigs) {
        // scanSignals only returns buy signals (signal=1)
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: sig.indicator,
          signal: sig.signal, direction: "long",
          confidence: 0, score: 0,
          metadata: sig.metadata as Record<string, unknown>,
        });
      }
    } catch { /* detector error on this window — skip */ }
  }

  // ── 2. BBAWE ──
  if (det.detectBbawe && cl.length >= 103) {
    try {
      const bbawe = det.detectBbawe(cl, hi, lo, symbol, tf, { requireSqueeze: true, squeezeThreshold: 50 });
      if (bbawe) {
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: "bbawe",
          signal: bbawe.signal === "buy" ? 1 : bbawe.signal === "sell" ? -1 : 0,
          confidence: bbawe.aoState, score: Math.round(bbawe.bbSqueezePct),
          metadata: { bbSqueezePct: bbawe.bbSqueezePct, aoValue: bbawe.aoValue, aoState: bbawe.aoState },
        });
      }
    } catch { /* skip */ }
  }

  // ── 3. Market Cipher ──
  if (det.detectMarketCipher && cl.length >= 70) {
    try {
      const mcb = det.detectMarketCipher(cl, hi, lo, symbol, tf);
      for (const sig of mcb) {
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: `mcb_${sig.type}`,
          signal: sig.type.includes("bull") || sig.type.includes("buy") || sig.type.includes("bottom") ? 1 : -1,
          confidence: sig.confidence,
          metadata: sig.details ?? {},
        });
      }
    } catch { /* skip */ }
  }

  // ── 4. Wolfpack ──
  if (det.detectWolfpack && cl.length >= 25) {
    try {
      const wp = det.detectWolfpack(cl, hi, lo, symbol, tf);
      for (const sig of wp) {
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: `wp_${sig.type}`,
          signal: sig.type.includes("bull") || sig.type.includes("low") ? 1 : -1,
          confidence: sig.confidence, score: Math.round(sig.spread ?? 0),
          metadata: { spread: sig.spread, type: sig.type },
        });
      }
    } catch { /* skip */ }
  }

  // ── 5. LuxAlgo ICT ──
  if (cl.length >= 15) {
    try {
      // MSS / BOS
      if (det.detectMSS) {
        const mss = det.detectMSS(cl, hi, lo, symbol, tf);
        for (const sig of mss) {
          rows.push({
            symbol, timeframe: tf, openTime: candle.t,
            detectorName: sig.type,
            signal: sig.type.includes("bull") ? 1 : -1,
            confidence: sig.confidence,
            metadata: { level: sig.level },
          });
        }
      }

      // Order Blocks
      if (det.detectOrderBlocks && cl.length >= 30) {
        const { signals: obSigs } = det.detectOrderBlocks(cl, hi, lo, symbol, tf);
        for (const sig of obSigs) {
          rows.push({
            symbol, timeframe: tf, openTime: candle.t,
            detectorName: sig.type,
            signal: sig.type.includes("bull") ? 1 : -1,
            confidence: sig.confidence,
            metadata: { level: sig.level },
          });
        }
      }

      // Liquidity sweeps
      if (det.detectLiquidity && cl.length >= 20) {
        const liq = det.detectLiquidity(hi, lo, cl, symbol, tf);
        for (const sig of liq) {
          rows.push({
            symbol, timeframe: tf, openTime: candle.t,
            detectorName: sig.type,
            signal: sig.type.includes("bull") ? 1 : -1,
            confidence: sig.confidence,
            metadata: { level: sig.level },
          });
        }
      }

      // FVGs
      if (det.detectFVG && cl.length >= 4) {
        const fvg = det.detectFVG(hi, lo, symbol, tf);
        for (const sig of fvg) {
          rows.push({
            symbol, timeframe: tf, openTime: candle.t,
            detectorName: sig.type,
            signal: sig.type.includes("bull") ? 1 : -1,
            confidence: sig.confidence,
            metadata: { barsBack: sig.metadata?.bars_back ?? 0 },
          });
        }
      }
    } catch { /* skip */ }
  }

  // ── 6. Swing Sniper ──
  if (det.detectSwingSniper && cl.length >= 26) {
    try {
      const sniper = det.detectSwingSniper(cl, hi, lo, symbol, tf);
      for (const sig of sniper) {
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: "swing_sniper",
          signal: sig.type === "sniper_long" ? 1 : -1,
          confidence: sig.confidence,
          metadata: { confluence: sig.confluence, narrative: sig.narrative?.slice(0, 200) },
          entryPrice: sig.price,
          stopLoss: sig.stopLoss,
          takeProfit: sig.takeProfit,
        });
      }
    } catch { /* skip */ }
  }

  // ── 7. ICR Engine ──
  if (enrichedCandle.coilScore !== undefined && i >= DEFAULT_ICR_CONFIG.slowMa) {
    try {
      // findSignals scans all candles — but we only want the signal at index i.
      // So we pass enriched[0..i] and filter results by timestamp.
      const icrResults = findSignals(
        enriched.slice(0, i + 1),
        symbol, tf, DEFAULT_ICR_CONFIG,
      );
      for (const sig of icrResults) {
        if (sig.timestamp !== candle.t) continue; // only current candle
        rows.push({
          symbol, timeframe: tf, openTime: candle.t,
          detectorName: "icr",
          signal: sig.direction === "long" ? 1 : -1,
          direction: sig.direction,
          confidence: Math.round(sig.confidence * 100),
          score: sig.score,
          tier: sig.tier,
          metadata: sig.components as Record<string, unknown>,
          entryPrice: sig.entry,
          stopLoss: sig.stopLoss,
          takeProfit: sig.takeProfit,
        });
      }
    } catch { /* skip */ }
  }

  return rows;
}

// ─── Smart Exit Simulation ────────────────────────────────────────────

function simulateExit(
  rawCandles: CorpusCandle[],
  enriched: EnrichedCandle[],
  entryIdx: number,
  row: DetectorRow,
): { exitSimR: string; exitReason: string } | null {
  if (!row.entryPrice || !row.stopLoss) return null;
  if (entryIdx >= rawCandles.length - 2) return null; // no forward data

  const direction = row.direction === "short" ? "short" : "long";
  const swingLow = row.metadata?.impulseSwingLow as number ?? row.stopLoss * 0.99;
  const swingHigh = row.metadata?.impulseSwingHigh as number ?? row.entryPrice * 1.01;

  try {
    const result = simulateSmartExit(
      rawCandles.map(c => ({
        symbol: row.symbol, timeframe: row.timeframe,
        timestamp: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v,
      })),
      enriched,
      entryIdx,
      row.entryPrice,
      row.stopLoss,
      direction,
      swingLow,
      swingHigh,
      EXIT_CFG,
    );
    return { exitSimR: result.finalR.toFixed(4), exitReason: result.exitReason };
  } catch {
    return null;
  }
}

// ─── File Writer (batched JSON lines) ─────────────────────────────────

class CorpusWriter {
  private buffer: DetectorRow[] = [];
  private path: string;

  constructor(symbol: string, tf: string, year: number, month: number) {
    const dir = `${OUTPUT_DIR}/${symbol}/${tf}`;
    mkdirSync(dir, { recursive: true });
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    this.path = `${dir}/${ym}.jsonl.gz`;
  }

  async write(rows: DetectorRow[]): Promise<void> {
    this.buffer.push(...rows);
    if (this.buffer.length >= BATCH_SIZE) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (CFG.dryRun) { this.buffer = []; return; }

    const lines = this.buffer.map(r => JSON.stringify(r)).join("\n") + "\n";
    const gz = createGzip();
    const source = Readable.from([lines]);

    // Append to the gzipped file
    const existing = existsSync(this.path) ? require("zlib").gunzipSync(readFileSync(this.path)).toString("utf-8") : "";
    const allLines = existing + lines;
    writeFileSync(this.path, require("zlib").gzipSync(allLines));

    this.buffer = [];
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70));
  console.log("CORPUS BUILDER — Massive backtest from real Binance klines");
  console.log(`  Pairs: ${CFG.pairs} | Months: ${CFG.months} | TFs: ${CFG.timeframes.join(",")}`);
  if (CFG.resume) console.log("  Mode: RESUME");
  if (CFG.dryRun) console.log("  Mode: DRY RUN (no writes)");
  console.log(`  Klines: ${DATA_DIR}/`);
  console.log(`  Output: ${OUTPUT_DIR}/`);
  console.log("=".repeat(70));

  const manifest = loadManifest();
  const det = await getDetectors();
  const detCount = Object.keys(det).length;

  console.log(`\nLoaded ${detCount} detector modules`);
  let totalSignals = 0;
  let totalCandles = 0;
  let completedPairs = 0;

  // Discover pairs from the data directory
  const pairs = existsSync(DATA_DIR) ? require("fs").readdirSync(DATA_DIR).filter(d => !d.startsWith("_")) : [];
  const selected = pairs.slice(0, CFG.pairs);
  console.log(`Found ${pairs.length} pairs on disk, processing ${selected.length}`);

  for (let pi = 0; pi < selected.length; pi++) {
    const symbol = selected[pi];
    console.log(`\n[${pi + 1}/${selected.length}] ${symbol}`);

    for (const tf of CFG.timeframes) {
      // Find monthly files for this symbol+tf
      const tfDir = `${DATA_DIR}/${symbol}/${tf}`;
      if (!existsSync(tfDir)) {
        console.log(`  ${tf}: no data directory`);
        continue;
      }

      const files = require("fs").readdirSync(tfDir).filter(f => f.endsWith(".json.gz"));
      for (const file of files) {
        const ym = file.replace(".json.gz", "");
        const key = `${symbol}/${tf}`;

        // Check manifest
        if (manifest.completed[key]?.includes(ym)) {
          process.stdout.write(`  ${tf} ${ym} ✓ (cached)\n`);
          continue;
        }

        const [yStr, mStr] = ym.split("-");
        const year = parseInt(yStr);
        const month = parseInt(mStr);

        process.stdout.write(`  ${tf} ${ym} ... `);

        try {
          // 1. Load klines
          const candles = loadKlines(symbol, tf, year, month);
          if (candles.length < 50) {
            process.stdout.write(`too few candles (${candles.length})\n`);
            continue;
          }

          // 2. Enrich
          const klines = candles.map(c => ({
            symbol, timeframe: tf, timestamp: c.t,
            open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v,
          }));
          const enriched = annotateWithCoilScores(
            enrichCandles(klines, DEFAULT_ICR_CONFIG),
            DEFAULT_ICR_CONFIG,
            DEFAULT_COIL_CONFIG,
          );

          // 3. Run detectors per candle
          const writer = new CorpusWriter(symbol, tf, year, month);
          let candleSignals = 0;
          const startIdx = Math.max(100, DEFAULT_ICR_CONFIG.slowMa);

          for (let i = startIdx; i < candles.length; i++) {
            const rows = await runDetectorsOnWindow(candles, enriched, symbol, tf, i, det);

            // 4. Simulate exits for signals that have entry/stop
            for (const row of rows) {
              if (row.entryPrice && row.stopLoss) {
                const exit = simulateExit(candles, enriched, i, row);
                if (exit) {
                  row.exitSimR = exit.exitSimR;
                  row.exitReason = exit.exitReason;
                }
              }
            }

            if (rows.length > 0) {
              await writer.write(rows);
              candleSignals += rows.length;
            }
          }

          await writer.close();
          totalSignals += candleSignals;
          totalCandles += candles.length;

          // Update manifest
          if (!manifest.completed[key]) manifest.completed[key] = [];
          manifest.completed[key].push(ym);
          manifest.totalSignals = totalSignals;
          saveManifest(manifest);

          process.stdout.write(`${candleSignals} signals from ${candles.length} candles ✓\n`);
        } catch (e: any) {
          process.stdout.write(`ERROR: ${e?.message?.slice(0, 120)}\n`);
          console.error(e);
        }
      }
    }
    completedPairs++;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`DONE: ${completedPairs} pairs, ${totalCandles} candles, ${totalSignals} signal rows`);
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log(`Manifest: ${OUTPUT_DIR}/_manifest.json`);
  console.log("=".repeat(70));
}

main().catch(console.error);
