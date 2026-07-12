import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("signals.scraperStatus", () => {
  it("returns scraper status object with expected shape", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.scraperStatus();
    // Result can be null if DB is unavailable, or an object
    if (result !== null) {
      expect(result).toHaveProperty("totalSignals");
      expect(typeof result.totalSignals).toBe("number");
    }
  });
});

describe("signals.list", () => {
  it("returns paginated signals with expected shape", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 5 });
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("limit");
    expect(Array.isArray(result.signals)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.page).toBe(0);
    expect(result.limit).toBe(5);
  });

  it("only returns Buy signals (Sell/Neutral are never stored)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 20 });
    // All stored signals must be Buy (signal === 1) — Sell/Neutral are filtered at scrape time
    for (const sig of result.signals) {
      expect(sig.signal).toBe(1);
    }
  });

  it("filters by Tier A when tier=A", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 20, tier: "A" });
    for (const sig of result.signals) {
      expect((sig as any).qualityTier).toBe("A");
    }
  });

  it("filters by period when period is specified", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 10, period: "1h" });
    for (const sig of result.signals) {
      expect(sig.period).toBe("1h");
    }
  });

  it("respects pagination limit", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 3 });
    expect(result.signals.length).toBeLessThanOrEqual(3);
  });

  it("sorts by quality score descending when sortBy=quality", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.signals.list({ page: 0, limit: 10, sortBy: "quality" });
    const scores = result.signals.map((s) => (s as any).qualityScore as number);
    for (let i = 1; i < scores.length; i++) {
      // Each score should be <= the previous (descending order)
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});
