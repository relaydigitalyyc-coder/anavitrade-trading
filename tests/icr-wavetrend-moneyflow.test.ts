/**
 * Tests for the WaveTrend / Money Flow / Stochastic RSI port (indicators.ts)
 * and the opt-in ICR entry filters that consume them (icr/signals.ts).
 *
 * Honest walk-forward results (scripts/icr-wavetrend-experiment.ts, 49 pairs,
 * 4h+1h, 60/40 split) are documented in docs/analysis/EMPIRICAL_FINDINGS.md.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { waveTrend, moneyFlow, stochRsi, rsi, enrichCandles } from "../src/server/analysis/indicators";
import { DEFAULT_ICR_CONFIG } from "../src/server/analysis/icr/config";
import { buildIcrSignal } from "../src/server/analysis/icr/signals";
import type { Kline } from "../src/server/analysis/types";

function makeTrendingCandles(n: number, direction: "up" | "down"): Kline[] {
  const candles: Kline[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const step = direction === "up" ? 0.5 : -0.5;
    price += step + Math.sin(i / 3) * 0.3;
    candles.push({
      symbol: "TEST",
      timeframe: "4h",
      timestamp: i * 4 * 60 * 60 * 1000,
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1000 + (i % 10) * 50,
    });
  }
  return candles;
}

// ─── waveTrend ──────────────────────────────────────────────────────────────

test("waveTrend: returns null for insufficient data", () => {
  const { wt1 } = waveTrend([1, 2, 3], 9, 21);
  assert.ok(wt1.every((v) => v === null));
});

test("waveTrend: a sustained uptrend produces positive wt1", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.8);
  const { wt1 } = waveTrend(closes, 9, 21);
  const last = wt1[wt1.length - 1];
  assert.ok(last !== null && last > 0, `expected positive wt1, got ${last}`);
});

test("waveTrend: a sustained downtrend produces negative wt1", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 - i * 0.8);
  const { wt1 } = waveTrend(closes, 9, 21);
  const last = wt1[wt1.length - 1];
  assert.ok(last !== null && last < 0, `expected negative wt1, got ${last}`);
});

// ─── moneyFlow ──────────────────────────────────────────────────────────────

test("moneyFlow: returns null for insufficient data", () => {
  const result = moneyFlow([1, 2], [1, 2], [1, 2], 9);
  assert.ok(result.every((v) => v === null));
});

test("moneyFlow: rising HLC3 relative to its own average is positive", () => {
  const n = 30;
  const high = Array.from({ length: n }, (_, i) => 101 + i * 0.5);
  const low = Array.from({ length: n }, (_, i) => 99 + i * 0.5);
  const close = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
  const result = moneyFlow(high, low, close, 9);
  const last = result[result.length - 1];
  assert.ok(last !== null && last > 0, `expected positive moneyFlow, got ${last}`);
});

test("moneyFlow: falling HLC3 relative to its own average is negative", () => {
  const n = 30;
  const high = Array.from({ length: n }, (_, i) => 101 - i * 0.5);
  const low = Array.from({ length: n }, (_, i) => 99 - i * 0.5);
  const close = Array.from({ length: n }, (_, i) => 100 - i * 0.5);
  const result = moneyFlow(high, low, close, 9);
  const last = result[result.length - 1];
  assert.ok(last !== null && last < 0, `expected negative moneyFlow, got ${last}`);
});

// ─── stochRsi ───────────────────────────────────────────────────────────────

test("stochRsi: returns null for insufficient data", () => {
  const { k, d } = stochRsi([50, 51, 52], 14, 3, 3);
  assert.ok(k.every((v) => v === null) && d.every((v) => v === null));
});

test("stochRsi: k and d are bounded 0-100 when defined", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 10);
  const rsiValues = rsi(closes, 14).map((v) => v ?? 50);
  const { k, d } = stochRsi(rsiValues, 14, 3, 3);
  for (const v of k) if (v !== null) assert.ok(v >= 0 && v <= 100, `k out of bounds: ${v}`);
  for (const v of d) if (v !== null) assert.ok(v >= 0 && v <= 100, `d out of bounds: ${v}`);
});

// ─── enrichCandles wiring ───────────────────────────────────────────────────

test("enrichCandles: populates wt1, wt2, moneyFlow, stochRsiK, stochRsiD fields", () => {
  const candles = makeTrendingCandles(60, "up");
  const enriched = enrichCandles(candles, DEFAULT_ICR_CONFIG);
  const last = enriched[enriched.length - 1];
  assert.ok(Number.isFinite(last.wt1));
  assert.ok(Number.isFinite(last.wt2));
  assert.ok(Number.isFinite(last.moneyFlow));
  assert.ok(Number.isFinite(last.stochRsiK));
  assert.ok(Number.isFinite(last.stochRsiD));
});

// ─── Money Flow filter gate (opt-in, empirically supported) ────────────────

test("enableMoneyFlowFilter: off by default, does not affect signal generation", () => {
  assert.equal(DEFAULT_ICR_CONFIG.enableMoneyFlowFilter, undefined);
});

test("enableMoneyFlowFilter: rejects a long candle whose moneyFlow is negative", () => {
  const candles = makeTrendingCandles(120, "up");
  const enriched = enrichCandles(candles, DEFAULT_ICR_CONFIG);
  const i = enriched.length - 1;
  // Force a disagreeing moneyFlow reading to isolate the gate in question.
  enriched[i] = { ...enriched[i], moneyFlow: -1 };
  const cfg = { ...DEFAULT_ICR_CONFIG, enableMoneyFlowFilter: true };
  const sig = buildIcrSignal(enriched, i, "TEST", "4h", "long", cfg);
  assert.equal(sig, null);
});

test("enableMoneyFlowFilter: rejects a short candle whose moneyFlow is positive", () => {
  const candles = makeTrendingCandles(120, "down");
  const enriched = enrichCandles(candles, DEFAULT_ICR_CONFIG);
  const i = enriched.length - 1;
  enriched[i] = { ...enriched[i], moneyFlow: 1 };
  const cfg = { ...DEFAULT_ICR_CONFIG, enableMoneyFlowFilter: true };
  const sig = buildIcrSignal(enriched, i, "TEST", "4h", "short", cfg);
  assert.equal(sig, null);
});

// ─── WaveTrend filters (opt-in, empirically REJECTED — see EMPIRICAL_FINDINGS.md) ──

test("enableWaveTrendExtremeFilter and enableWaveTrendSimpleFilter: off by default", () => {
  assert.equal(DEFAULT_ICR_CONFIG.enableWaveTrendExtremeFilter, undefined);
  assert.equal(DEFAULT_ICR_CONFIG.enableWaveTrendSimpleFilter, undefined);
});

test("enableWaveTrendSimpleFilter: rejects a long candle whose wt1 is not oversold", () => {
  const candles = makeTrendingCandles(120, "up");
  const enriched = enrichCandles(candles, DEFAULT_ICR_CONFIG);
  const i = enriched.length - 1;
  enriched[i] = { ...enriched[i], wt1: 10 }; // not <= -40
  const cfg = { ...DEFAULT_ICR_CONFIG, enableWaveTrendSimpleFilter: true };
  const sig = buildIcrSignal(enriched, i, "TEST", "4h", "long", cfg);
  assert.equal(sig, null);
});

test("enableWaveTrendExtremeFilter: rejects when no recent extreme+turn found", () => {
  const candles = makeTrendingCandles(120, "up");
  const enriched = enrichCandles(candles, DEFAULT_ICR_CONFIG);
  const i = enriched.length - 1;
  for (let k = 1; k <= 5; k++) {
    if (i - k >= 0) enriched[i - k] = { ...enriched[i - k], wt1: 0 };
  }
  const cfg = { ...DEFAULT_ICR_CONFIG, enableWaveTrendExtremeFilter: true };
  const sig = buildIcrSignal(enriched, i, "TEST", "4h", "long", cfg);
  assert.equal(sig, null);
});
