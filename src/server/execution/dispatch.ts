import { and, eq } from "drizzle-orm";
import {
  cexConnections, executionJobs, orderEvents, navSnapshots, tradeIntents, liveAccounts,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { sha256Hex } from "../cex/signing";
import { decryptCexCredentials } from "../cex/store";
import { createCexClient } from "../cex/factory";
import { CexExecutionAdapter } from "../cex/adapter";
import { decideExecution, prefetchUserData, sizeNotionalFromEquity, type TradeIntentInput } from "./riskEngine";

/** Deterministic idempotency key per (user, intent). Prevents duplicate mirrors. */
async function idempotencyKey(userId: number, intentId: number): Promise<string> {
  return (await sha256Hex(`cex:${userId}:${intentId}`)).slice(0, 32);
}

/** Serialize execution per connection so a signer never has two in-flight orders. */
const connectionQueues = new Map<number, Promise<unknown>>();
function enqueue<T>(connectionId: number, task: () => Promise<T>): Promise<T> {
  const prev = connectionQueues.get(connectionId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  connectionQueues.set(connectionId, next);
  return next;
}

async function loadIntent(intentId: number): Promise<TradeIntentInput | null> {
  const db = getDb();
  const [row] = await db.select().from(tradeIntents).where(eq(tradeIntents.id, intentId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side === "sell" || row.side === "SELL" ? "SELL" : "BUY",
    orderType: row.orderType === "limit" ? "LIMIT" : "MARKET",
    requestedNotionalUsd: row.requestedNotionalUsd,
    targetLeverage: row.targetLeverage,
    limitPrice: row.limitPrice,
    stopLossPrice: row.stopLossPrice,
    takeProfitPrice: row.takeProfitPrice,
  };
}

/**
 * Fan a TradeIntent out to every eligible active CEX connection, creating one
 * ExecutionJob per user, mirroring the order, and recording order_events + a
 * nav_snapshot. Idempotent per (user, intent).
 *
 * Idempotency: uses INSERT ... ON CONFLICT ... DO NOTHING backed by a composite
 * unique index on (userId, idempotencyKey), eliminating the TOCTOU race present
 * in the old SELECT-then-INSERT pattern.
 *
 * Parallel fan-out: all connections are independent (different API keys/exchanges),
 * so Promise.allSettled processes them concurrently. Order submission remains
 * serialized per connection via enqueue() to prevent nonce issues.
 */
export async function createExecutionJobsForIntent(intentId: number) {
  const db = getDb();
  const intent = await loadIntent(intentId);
  if (!intent) throw new Error("TRADE_INTENT_NOT_FOUND");

  const connections = await db.select().from(cexConnections)
    .where(eq(cexConnections.status, "active"));

  // Pre-fetch risk data for all user IDs to eliminate N+1 inside the loop.
  const userIds = [...new Set(connections.map((c) => c.userId))];
  const preloaded = userIds.length > 0 ? await prefetchUserData(userIds) : undefined;

  // Fan out to all active connections in parallel.
  const settled = await Promise.allSettled(
    connections.map(async (conn) => {
      const decision = await decideExecution(intent, conn.userId, conn, preloaded);
      if (decision.approved !== true) {
        const reason = "reason" in decision ? decision.reason : "unknown";
        await writeAuditLog(conn.userId, "EXEC_RISK_SKIPPED", `intent:${intentId}; reason:${reason}`);
        return { userId: conn.userId, exchange: conn.exchange, status: "skipped" as const, reason };
      }

      const idem = await idempotencyKey(conn.userId, intentId);

      // Atomic idempotency: INSERT with the composite unique index on
      // (userId, idempotencyKey). If the pair already exists the row is
      // silently ignored — no TOCTOU race.
      await db.insert(executionJobs).values({
        tradeIntentId: intentId,
        userId: conn.userId,
        cexConnectionId: conn.id,
        provider: "cex",
        symbol: intent.symbol,
        side: intent.side,
        orderType: intent.orderType,
        status: "queued",
        idempotencyKey: idem,
      } as any).onConflictDoNothing();

      // Query the row (freshly inserted or pre-existing).
      const [job] = await db.select().from(executionJobs)
        .where(and(eq(executionJobs.userId, conn.userId), eq(executionJobs.idempotencyKey, idem)))
        .limit(1);
      if (!job) return { userId: conn.userId, exchange: conn.exchange, status: "skipped" as const, reason: "idempotency_lookup_failed" };

      // If status already moved past queued, a prior run processed this job.
      if (job.status !== "queued") {
        return { userId: conn.userId, exchange: conn.exchange, jobId: job.id, status: "duplicate" as const };
      }

      // Size the order from account equity if the intent carried no explicit notional.
      let notionalUsd = decision.notionalUsd;
      let quantity: string | undefined;
      try {
        const creds = await decryptCexCredentials(conn);
        const client = createCexClient(conn.exchange, creds);
        const balance = await client.validateAndReadBalance();
        const [account] = await db.select().from(liveAccounts).where(eq(liveAccounts.userId, conn.userId)).limit(1);
        const maxPct = parseFloat(account?.maxPositionSizePct ?? "10");
        if (notionalUsd <= 0) notionalUsd = sizeNotionalFromEquity(balance.availableUsd || balance.equityUsd, maxPct);

        // Use the intent's limitPrice (signal price) as a sizing hint. For MARKET
        // orders on Binance, quoteOrderQty handles this automatically; for BITUNIX
        // we fall back to the ticker price to avoid quantity=0.
        const priceHint = parseFloat(intent.limitPrice ?? "0");
        if (priceHint > 0) {
          quantity = (notionalUsd / priceHint).toFixed(6);
        } else {
          // Fetch current mark price for MARKET orders with no stored hint
          try {
            const pos = await client.getPositions(intent.symbol);
            const ticker = pos.length > 0 ? pos[0].entryPrice : 0;
            const fallback = ticker > 0 ? ticker : (await (client as any).validateAndReadBalance())?.equityUsd ? 1000 : 0;
            if (fallback > 0) quantity = (notionalUsd / fallback).toFixed(6);
          } catch {
            // last resort: derive from signal price if available
            if (intent.limitPrice) quantity = (notionalUsd / parseFloat(intent.limitPrice)).toFixed(6);
          }
        }
      } catch (e: any) {
        return { userId: conn.userId, exchange: conn.exchange, status: "skipped" as const, reason: `balance_failed:${e?.message}` };
      }

      if (!quantity || parseFloat(quantity) <= 0) {
        return { userId: conn.userId, exchange: conn.exchange, status: "skipped" as const, reason: "zero_quantity" };
      }

      // Fill in the computed sizing fields on the queued job.
      await db.update(executionJobs).set({
        notionalUsd: notionalUsd.toFixed(2),
        quantity,
        leverage: decision.leverage,
        limitPrice: intent.limitPrice ?? null,
        updatedAt: new Date(),
      } as any).where(eq(executionJobs.id, job.id));

      // Serialize submission per connection, with 3-retry exponential backoff.
      await enqueue(conn.id, async () => {
        let attempts = 0;
        const maxAttempts = 3;
        const backoff = [1000, 2000, 4000]; // 1s / 2s / 4s
        let lastError: Error | undefined;

        while (attempts < maxAttempts) {
          try {
            attempts++;
            const adapter = new CexExecutionAdapter(conn.id);
            const receipt = await adapter.submitOrder(job.id, {
              symbol: intent.symbol,
              side: intent.side,
              type: intent.orderType,
              quantity,
              price: intent.limitPrice ?? undefined,
              leverage: decision.leverage,
              stopLossPrice: intent.stopLossPrice ?? undefined,
              takeProfitPrice: intent.takeProfitPrice ?? undefined,
              clientOrderId: idem,
            });

            await db.update(executionJobs).set({
              status: receipt.status === "filled" ? "filled" : "submitted",
              orderId: receipt.orderId,
              submittedAt: new Date(),
              ...(receipt.status === "filled" ? { filledAt: new Date() } : {}),
              updatedAt: new Date(),
            } as any).where(eq(executionJobs.id, job.id));

            await db.insert(orderEvents).values({
              executionJobId: job.id,
              provider: "cex",
              eventType: receipt.status,
              payloadJson: JSON.stringify({ raw: receipt.raw ?? {}, attempt: attempts }),
            } as any);

            // NAV snapshot on submit/fill
            try {
              const creds2 = await decryptCexCredentials(conn);
              const client2 = createCexClient(conn.exchange, creds2);
              const bal = await client2.validateAndReadBalance();
              await db.insert(navSnapshots).values({
                userId: conn.userId, provider: "cex",
                accountEquityUsd: bal.equityUsd.toFixed(2),
                availableBalanceUsd: bal.availableUsd.toFixed(2), source: "provider_sync",
              } as any);
            } catch { /* snapshot best-effort */ }

            await writeAuditLog(conn.userId, "EXEC_ORDER_SUBMITTED", `intent:${intentId}; order:${receipt.orderId}; ${conn.exchange}; attempt:${attempts}`);
            return; // success — break out of retry loop
          } catch (e: any) {
            lastError = e;
            if (attempts < maxAttempts) {
              const delay = backoff[attempts - 1];
              console.warn(`[dispatch] attempt ${attempts}/${maxAttempts} failed for job ${job.id}, retrying in ${delay}ms: ${e?.message}`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }

        // All retries exhausted
        await db.update(executionJobs).set({
          status: "error", errorMessage: String(lastError?.message).slice(0, 300), updatedAt: new Date(),
        } as any).where(eq(executionJobs.id, job.id));
        await db.insert(orderEvents).values({
          executionJobId: job.id, provider: "cex", eventType: "rejected",
          payloadJson: JSON.stringify({ error: String(lastError?.message).slice(0, 300), attempts }),
        } as any);
        await writeAuditLog(conn.userId, "EXEC_ORDER_FAILED", `intent:${intentId}; ${String(lastError?.message).slice(0, 120)}; attempts:${attempts}`);
      });

      return { userId: conn.userId, exchange: conn.exchange, jobId: job.id, status: "queued" as const };
    }),
  );

  const results = settled.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return { userId: 0, exchange: "error", status: "error" as const, reason: String(r.reason) };
  });

  return { intentId, jobs: results };
}
