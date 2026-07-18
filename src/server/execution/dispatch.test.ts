import assert from "node:assert/strict";
import test from "node:test";
import { requireAuthoritativeRiskDecision, applyEntryMode } from "./dispatch";
import type { TradeIntentInput } from "./riskEngine";

test("a denied or zero risk decision neither invokes a provider nor leaves a queued risk-approved job", async () => {
  let providerCalls = 0;
  const queuedJobs: Array<{ riskApproved: boolean; status: string; notionalUsd: number }> = [];
  const adapter = {
    readBalance: async () => { providerCalls++; },
  };

  async function attemptAutomatedExecution(decision: unknown) {
    const approved = requireAuthoritativeRiskDecision(decision as any);
    if (!approved) return;
    queuedJobs.push({ riskApproved: true, status: "queued", notionalUsd: approved.notionalUsd });
    await adapter.readBalance();
  }

  await attemptAutomatedExecution({ approved: false, reason: "missing_nav" });
  await attemptAutomatedExecution({ approved: true, notionalUsd: 0, leverage: 3 });

  assert.equal(providerCalls, 0);
  assert.deepEqual(queuedJobs, []);
});

/* ── applyEntryMode: ML → rules entry-timing confirmation band ── */

const longIntent: TradeIntentInput = {
  id: 1,
  symbol: "SOLUSDT",
  side: "BUY",
  orderType: "MARKET",
  limitPrice: "100",
  stopLossPrice: "90",
  takeProfitPrice: "120",
};

test("applyEntryMode leaves a market-mode intent unchanged", () => {
  const result = applyEntryMode(longIntent, "market", 1);
  assert.deepEqual(result, longIntent);
});

test("applyEntryMode converts a limit_confirm long intent to a LIMIT order pulled back toward the stop", () => {
  const result = applyEntryMode(longIntent, "limit_confirm", 1);
  assert.equal(result.orderType, "LIMIT");
  const price = Number(result.limitPrice);
  const stop = Number(longIntent.stopLossPrice);
  const entry = Number(longIntent.limitPrice);
  assert.ok(price > stop && price < entry, `expected ${stop} < ${price} < ${entry}`);
});

test("applyEntryMode converts a limit_confirm short intent to a LIMIT order pulled back toward the stop", () => {
  const shortIntent: TradeIntentInput = { ...longIntent, side: "SELL", limitPrice: "100", stopLossPrice: "110" };
  const result = applyEntryMode(shortIntent, "limit_confirm", 1);
  assert.equal(result.orderType, "LIMIT");
  const price = Number(result.limitPrice);
  assert.ok(price > 100 && price < 110, `expected 100 < ${price} < 110`);
});

test("applyEntryMode falls back to the original market intent when entry/stop prices are missing", () => {
  const noStop: TradeIntentInput = { ...longIntent, stopLossPrice: null };
  const result = applyEntryMode(noStop, "limit_confirm", 1);
  assert.deepEqual(result, noStop);
});
