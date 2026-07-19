/**
 * Tests for the Binance perp top-gainers / volume-breakout scanner.
 * All network calls and dispatch are injected — no real Binance or D1 traffic.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  rankAndScoreCandidates,
  scoreCandidate,
  tierFromScore,
  stopPctForMove,
  buildUnifiedSignal,
  runBinanceGainersScan,
  MIN_QUOTE_VOLUME_USD,
  type BinanceTickerRow,
} from "../src/server/signals/binance-gainers";

function row(
  symbol: string,
  priceChangePercent: string,
  lastPrice: string,
  quoteVolume: string,
): BinanceTickerRow {
  return { symbol, priceChangePercent, lastPrice, volume: "0", quoteVolume };
}

// ─── rankAndScoreCandidates ─────────────────────────────────────────────────

test("rankAndScoreCandidates: filters out quarterly/delivery contracts", () => {
  const rows = [
    row("BTCUSDT", "10", "50000", "10000000"),
    row("BTCUSDT_240329", "50", "50000", "10000000"), // delivery contract, must be excluded
  ];
  const result = rankAndScoreCandidates(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "BTCUSDT");
});

test("rankAndScoreCandidates: filters below the liquidity floor", () => {
  const rows = [
    row("AUSDT", "10", "1", String(MIN_QUOTE_VOLUME_USD - 1)),
    row("BUSDT", "10", "1", String(MIN_QUOTE_VOLUME_USD)),
  ];
  const result = rankAndScoreCandidates(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "BUSDT");
});

test("rankAndScoreCandidates: excludes losers (pct24 <= 0), only top gainers", () => {
  const rows = [
    row("AUSDT", "-5", "1", "10000000"),
    row("BUSDT", "0", "1", "10000000"),
    row("CUSDT", "5", "1", "10000000"),
  ];
  const result = rankAndScoreCandidates(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "CUSDT");
});

test("rankAndScoreCandidates: sorts by pct24 descending", () => {
  const rows = [
    row("AUSDT", "5", "1", "10000000"),
    row("BUSDT", "20", "1", "10000000"),
    row("CUSDT", "10", "1", "10000000"),
  ];
  const result = rankAndScoreCandidates(rows);
  assert.deepEqual(result.map((r) => r.symbol), ["BUSDT", "CUSDT", "AUSDT"]);
});

test("rankAndScoreCandidates: caps at MAX_CANDIDATES", () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    row(`SYM${i}USDT`, String(i + 1), "1", "10000000"),
  );
  const result = rankAndScoreCandidates(rows);
  assert.ok(result.length <= 25);
});

test("rankAndScoreCandidates: ignores non-finite or non-positive prices", () => {
  const rows = [
    row("AUSDT", "10", "0", "10000000"),
    row("BUSDT", "10", "abc", "10000000"),
    row("CUSDT", "10", "5", "10000000"),
  ];
  const result = rankAndScoreCandidates(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "CUSDT");
});

// ─── scoreCandidate / tierFromScore ─────────────────────────────────────────

test("scoreCandidate: saturates gain component at +25% and above", () => {
  const at25 = scoreCandidate(25, 1);
  const at50 = scoreCandidate(50, 1);
  assert.equal(at25, at50);
});

test("scoreCandidate: higher volume rank increases score at fixed gain", () => {
  const lowVol = scoreCandidate(10, 0.1);
  const highVol = scoreCandidate(10, 0.9);
  assert.ok(highVol > lowVol);
});

test("tierFromScore: thresholds match documented bands", () => {
  assert.equal(tierFromScore(80), "A");
  assert.equal(tierFromScore(79), "B");
  assert.equal(tierFromScore(65), "B");
  assert.equal(tierFromScore(64), "C");
});

// ─── stopPctForMove ─────────────────────────────────────────────────────────

test("stopPctForMove: scales with move size, clamped to [3%, 12%]", () => {
  assert.equal(stopPctForMove(1), 0.03); // tiny move -> floor
  assert.equal(stopPctForMove(100), 0.12); // huge move -> ceiling
  const mid = stopPctForMove(20); // 20/100*0.25 = 0.05
  assert.ok(Math.abs(mid - 0.05) < 1e-9);
});

// ─── buildUnifiedSignal ──────────────────────────────────────────────────────

test("buildUnifiedSignal: strips USDT suffix and sets long direction", () => {
  const candidates = rankAndScoreCandidates([row("SOLUSDT", "15", "100", "10000000")]);
  const sig = buildUnifiedSignal(candidates[0]);
  assert.equal(sig.symbol, "SOL");
  assert.equal(sig.source, "binance-gainers");
  assert.equal(sig.direction, "long");
  assert.equal(sig.entry, 100);
  assert.ok(sig.stopLoss < 100);
  assert.ok(sig.takeProfit > 100);
  assert.equal(sig.metadata?.pct24, 15);
});

// ─── runBinanceGainersScan (dependency-injected) ────────────────────────────

test("runBinanceGainersScan: dispatches only Tier A candidates", async () => {
  const rows: BinanceTickerRow[] = [
    row("HIGHUSDT", "30", "10", "50000000"), // should be Tier A (high gain + high vol)
    row("LOWUSDT", "1", "10", "3000001"), // barely above floor, low gain -> Tier C, not dispatched
  ];
  const dispatched: string[] = [];
  const result = await runBinanceGainersScan(
    async () => rows,
    async (sig) => {
      dispatched.push(sig.symbol);
      return { intentId: 1 };
    },
  );
  assert.equal(result.fetched, 2);
  assert.ok(result.tierA >= 1);
  assert.deepEqual(dispatched, ["HIGH"]);
  assert.equal(result.intentsCreated, 1);
});

test("runBinanceGainersScan: returns error field on fetch failure, does not throw", async () => {
  const result = await runBinanceGainersScan(
    async () => {
      throw new Error("network down");
    },
    async () => ({ intentId: 1 }),
  );
  assert.equal(result.error, "network down");
  assert.equal(result.intentsCreated, 0);
});

test("runBinanceGainersScan: a dispatch error for one candidate does not stop the scan", async () => {
  const rows: BinanceTickerRow[] = [
    row("AUSDT", "30", "10", "50000000"),
    row("BUSDT", "28", "10", "50000000"),
  ];
  let calls = 0;
  const result = await runBinanceGainersScan(
    async () => rows,
    async () => {
      calls++;
      if (calls === 1) throw new Error("dispatch failed");
      return { intentId: 2 };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.intentsCreated, 1);
});
