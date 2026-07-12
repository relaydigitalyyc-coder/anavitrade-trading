import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, writeAuditLog } from "../db";
import { executionJobs, tradeIntents } from "../../drizzle/schema";
import { createExecutionJobsForIntent } from "./dispatch";
import { isGlobalKill, setGlobalKill } from "./riskEngine";

export const execRouter = router({
  /** Global kill switch state (admin visibility). */
  getGlobalKill: protectedProcedure.query(() => ({ active: isGlobalKill() })),

  /** Flip the global kill switch — halts ALL execution across every user. */
  setGlobalKill: adminProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setGlobalKill(input.active);
      await writeAuditLog(ctx.user.id, input.active ? "GLOBAL_KILL_ON" : "GLOBAL_KILL_OFF");
      return { active: input.active };
    }),

  /**
   * Admin-only: emit a TradeIntent and fan it out to every eligible connected
   * user. This is the live-execution trigger. Real orders fire on real accounts,
   * gated by per-user + global kill switches and risk caps.
   */
  dispatchIntent: adminProcedure
    .input(z.object({
      symbol: z.string().min(3).max(20),
      side: z.enum(["BUY", "SELL"]),
      orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
      requestedNotionalUsd: z.string().optional(),
      targetLeverage: z.number().int().min(1).max(50).optional(),
      limitPrice: z.string().optional(),
      stopLossPrice: z.string().optional(),
      takeProfitPrice: z.string().optional(),
      source: z.string().default("manual"),
      externalSignalId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.insert(tradeIntents).values({
        source: input.source,
        externalSignalId: input.externalSignalId ?? null,
        symbol: input.symbol,
        side: input.side.toLowerCase(),
        orderType: input.orderType.toLowerCase(),
        requestedNotionalUsd: input.requestedNotionalUsd ?? null,
        targetLeverage: input.targetLeverage ?? null,
        limitPrice: input.limitPrice ?? null,
        stopLossPrice: input.stopLossPrice ?? null,
        takeProfitPrice: input.takeProfitPrice ?? null,
        status: "created",
        createdBy: `admin:${ctx.user.id}`,
      } as any);

      const [intent] = await db.select().from(tradeIntents)
        .orderBy(desc(tradeIntents.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Intent not created." });

      const result = await createExecutionJobsForIntent(intent.id);
      await writeAuditLog(ctx.user.id, "INTENT_DISPATCHED", `intent:${intent.id}; ${input.symbol} ${input.side}`);
      return { intentId: intent.id, ...result };
    }),

  /** Re-run dispatch for an existing intent (retry). Idempotent — already-
   *  processed (user, intent) pairs are skipped, not duplicated. */
  redispatchIntent: adminProcedure
    .input(z.object({ intentId: z.number().int().positive() }))
    .mutation(async ({ input }) => createExecutionJobsForIntent(input.intentId)),

  /** Recent execution jobs for the calling user (dashboard/history). */
  myJobs: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      return db.select().from(executionJobs)
        .where(eq(executionJobs.userId, ctx.user.id))
        .orderBy(desc(executionJobs.queuedAt))
        .limit(input.limit);
    }),
});
