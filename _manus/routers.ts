import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";
import {
  registerUser, verifyUserPassword, verifyEmailToken, resendVerificationEmail,
  createPasswordResetToken, resetPassword, getUserById,
  getOrCreateLiveAccount, getLiveAccountByUserId, toggleKillSwitch, updateRiskSettings,
  connectApiWallet, getApiWalletByUserId, activateApiWallet, revokeApiWallet,
  createDemoAccount, getDemoAccountByToken, getDemoTradesByAccountId,
  saveWeb3WalletSession, getWeb3WalletSession, revokeWeb3WalletSession,
  toggleWeb3KillSwitch, dispatchCopytradeSignal,
  writeAuditLog,
  getSignals, getScraperStatus, getTopBangers, getSignalStats,
  getPortfolioSnapshotsByAccountId,
  syncSignalsToDemoAccounts,
  getJulyResults,
  getOrCreatePublicDemoAccount, updateDemoAccountSettings, PUBLIC_DEMO_TOKEN,
  getPublicDemoStats,
} from "./db";

const jwtSecret = new TextEncoder().encode(ENV.cookieSecret);

// Issue a JWT whose payload matches what sdk.verifySession expects:
// { openId, appId, name } — we encode the numeric userId as openId
// prefixed with "local:" so authenticateRequest can distinguish it
// from Manus OAuth openIds and look up the user by id instead.
async function signSessionToken(userId: number, name: string) {
  return new SignJWT({
    openId: `local:${userId}`,
    appId: ENV.appId,
    name: name || "Anavitrade User",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtSecret);
}

export const appRouter = router({
  system: systemRouter,

  /* ─── Auth ─── */
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(80),
        email: z.string().email(),
        password: z.string().min(8).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { user, verificationToken } = await registerUser(input);
          // In production, send verification email here.
          // For demo: auto-verify so the client can log in immediately.
          await verifyEmailToken(verificationToken);
          // Issue session cookie
          const token = await signSessionToken(user!.id, input.name);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
          await writeAuditLog(user!.id, "USER_REGISTERED", input.email, ctx.req.ip);
          return { success: true, userId: user!.id };
        } catch (e: any) {
          if (e.message === "EMAIL_EXISTS") {
            throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration failed." });
        }
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyUserPassword(input.email, input.password);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
        }
        const token = await signSessionToken(user.id, user.name ?? input.email);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        await writeAuditLog(user.id, "USER_LOGIN", input.email, ctx.req.ip);
        return { success: true, userId: user.id };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await verifyEmailToken(input.token);
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message === "TOKEN_EXPIRED" ? "Verification link has expired." : "Invalid verification link." });
        }
      }),

    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        await createPasswordResetToken(input.email);
        // In production: send reset email. Always return success to avoid email enumeration.
        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({ token: z.string(), password: z.string().min(8).max(128) }))
      .mutation(async ({ input }) => {
        try {
          await resetPassword(input.token, input.password);
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message === "TOKEN_EXPIRED" ? "Reset link has expired." : "Invalid reset link." });
        }
      }),

    resendVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        // Always returns success to prevent email enumeration
        await resendVerificationEmail(input.email);
        return { success: true };
      }),

    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(80) }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(users).set({ name: input.name }).where(eq(users.id, ctx.user.id));
        return { success: true };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyUserPassword(ctx.user.email!, input.currentPassword);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
        const bcrypt = await import("bcryptjs");
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        const { getDb } = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(users).set({ passwordHash }).where(eq(users.id, ctx.user.id));
        await writeAuditLog(ctx.user.id, "PASSWORD_CHANGED");
        return { success: true };
      }),
  }),

  /* ─── Live Account ─── */
  liveAccount: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const account = await getLiveAccountByUserId(ctx.user.id);
      const wallet = await getApiWalletByUserId(ctx.user.id);
      return { account, wallet };
    }),

    toggleKillSwitch: protectedProcedure
      .input(z.object({ active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await toggleKillSwitch(ctx.user.id, input.active);
        return { success: true, killSwitchActive: input.active };
      }),

    updateRiskSettings: protectedProcedure
      .input(z.object({
        maxDailyLossPct: z.string().optional(),
        maxLeverage: z.string().optional(),
        maxPositionSizePct: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateRiskSettings(ctx.user.id, input);
        return { success: true };
      }),
  }),

  /* ─── API Wallet / Hyperliquid Onboarding ─── */
  apiWallet: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      return getApiWalletByUserId(ctx.user.id);
    }),

    connect: protectedProcedure
      .input(z.object({
        hyperliquidAccount: z.string().min(10),
        walletAddress: z.string().min(10),
        privateKey: z.string().min(10),
        isLedgerCustody: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const liveAccount = await getOrCreateLiveAccount(ctx.user.id);
        const wallet = await connectApiWallet({
          userId: ctx.user.id,
          liveAccountId: liveAccount.id,
          hyperliquidAccount: input.hyperliquidAccount,
          walletAddress: input.walletAddress,
          privateKey: input.privateKey,
          isLedgerCustody: input.isLedgerCustody,
        });
        // Simulate validation — in production this calls Hyperliquid read-only API
        // For demo: auto-activate after connection
        await activateApiWallet(wallet.id, ctx.user.id);
        return { success: true, walletId: wallet.id };
      }),

    validate: protectedProcedure
      .input(z.object({ walletId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // In production: call Hyperliquid API to verify wallet is active and trade-only
        // For demo: mark as validated immediately
        await activateApiWallet(input.walletId, ctx.user.id);
        return { success: true, status: "active" };
      }),

    revoke: protectedProcedure.mutation(async ({ ctx }) => {
      await revokeApiWallet(ctx.user.id, "user");
      return { success: true };
    }),
  }),

  /* ─── Web3 Wallet & Copytrade ─── */
  web3Wallet: router({
    /**
     * Register a Web3/Ledger wallet address for copytrade signal routing.
     * Funds stay on the user's device — this only stores the public address
     * and risk preferences. Called after the WalletConnect modal confirms.
     */
    connect: protectedProcedure
      .input(z.object({
        walletAddress: z.string().min(10).max(100),
        walletType: z.enum(["ledger", "metamask", "walletconnect", "coinbase", "other"]),
        chainId: z.number().optional(),
        maxPositionSizeUsd: z.number().optional(),
        maxDailyLossPct: z.number().min(0.5).max(50).optional(),
        ledgerDerivationPath: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const session = await saveWeb3WalletSession({
          userId: ctx.user!.id,
          walletAddress: input.walletAddress,
          walletType: input.walletType,
          chainId: input.chainId,
          maxPositionSizeUsd: input.maxPositionSizeUsd,
          maxDailyLossPct: input.maxDailyLossPct,
          ledgerDerivationPath: input.ledgerDerivationPath,
        });
        return {
          success: true,
          walletAddress: session?.walletAddress,
          walletType: session?.walletType,
          copytradeEnabled: session?.copytradeEnabled ?? false,
          message: "Wallet registered. Copytrade will activate once the algo signal feed is wired in.",
        };
      }),

    /** Get the current user's active Web3 wallet session and copytrade status. */
    getSession: protectedProcedure.query(async ({ ctx }) => {
      const session = await getWeb3WalletSession(ctx.user!.id);
      if (!session) return null;
      return {
        walletAddress: session.walletAddress,
        walletType: session.walletType,
        chainId: session.chainId,
        copytradeEnabled: session.copytradeEnabled,
        killSwitchActive: session.killSwitchActive,
        maxPositionSizeUsd: session.maxPositionSizeUsd,
        maxDailyLossPct: session.maxDailyLossPct,
        status: session.status,
        connectedAt: session.connectedAt,
        lastSeenAt: session.lastSeenAt,
        ledgerDerivationPath: session.ledgerDerivationPath,
      };
    }),

    /**
     * Toggle the kill switch on/off.
     * When active, all copytrade signal routing is immediately halted.
     * No new transactions will be sent to the wallet until resumed.
     */
    toggleKillSwitch: protectedProcedure
      .input(z.object({ active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await toggleWeb3KillSwitch(ctx.user!.id, input.active);
        return { success: true, killSwitchActive: input.active };
      }),

    /**
     * Revoke wallet access entirely.
     * Immediately stops all signal routing and removes the wallet registration.
     */
    revoke: protectedProcedure.mutation(async ({ ctx }) => {
      await revokeWeb3WalletSession(ctx.user!.id);
      return { success: true, message: "Wallet access revoked. No further signals will be dispatched." };
    }),

    /**
     * ALGO WIRE-IN HOOK — call this from your trading algorithm to dispatch
     * a copytrade signal to a user's registered wallet.
     * Replace dispatchCopytradeSignal() body in db.ts with real routing logic.
     */
    dispatchSignal: protectedProcedure
      .input(z.object({
        pair: z.string(),
        side: z.enum(["buy", "sell"]),
        size: z.number().positive(),
        price: z.number().positive(),
        stopLoss: z.number().optional(),
        takeProfit: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await dispatchCopytradeSignal(ctx.user!.id, input);
        return result;
      }),
  }),

  /* ─── Demo Account ─── */
  demo: router({
    create: protectedProcedure
      .input(z.object({
        startingCapital: z.number().int().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { accessToken } = await createDemoAccount({
          username: ctx.user.name ?? ctx.user.email ?? `user_${ctx.user.id}`,
          email: ctx.user.email ?? `user_${ctx.user.id}@anavitrade.demo`,
          startingCapital: String(input.startingCapital),
        });
        return { accessToken };
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const account = await getDemoAccountByToken(input.token);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Demo account not found." });
        return account;
      }),

    getTrades: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const account = await getDemoAccountByToken(input.token);
        if (!account) return [];
        return getDemoTradesByAccountId(account.id);
      }),

    getPortfolioSeries: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const account = await getDemoAccountByToken(input.token);
        if (!account) return [];
        const snapshots = await getPortfolioSnapshotsByAccountId(account.id);

        // Anchor the chart at July 1 2026 00:00 UTC regardless of when the account was created.
        // This gives the equity curve a full-month view from day 1 of the strategy.
        const JULY_1 = new Date("2026-07-01T00:00:00Z");
        const startingCapital = parseFloat(String(account.startingCapital));

        // Build a flat baseline from July 1 up to (but not including) the first real snapshot.
        // We emit one point per day so the X-axis shows dates even before trading began.
        const firstSnapshotTime = snapshots.length > 0
          ? new Date(snapshots[0].snapshotAt).getTime()
          : Date.now();

        const baselinePoints: Array<{ value: number; timestamp: number; label: string; tradeCount: number }> = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;
        let cursor = JULY_1.getTime();
        while (cursor < firstSnapshotTime) {
          baselinePoints.push({
            value: startingCapital,
            timestamp: cursor,
            label: new Date(cursor).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            tradeCount: 0,
          });
          cursor += ONE_DAY;
        }

        const tradePoints = snapshots.map((s) => ({
          value: parseFloat(String(s.balance)),
          timestamp: new Date(s.snapshotAt).getTime(),
          label: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          tradeCount: s.tradeCount ?? 0,
        }));

        return [...baselinePoints, ...tradePoints];
      }),

    /**
     * Manually trigger a sync of signals to demo accounts.
     * Useful for backfilling historical data after account creation.
     */
    triggerSync: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const account = await getDemoAccountByToken(input.token);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Demo account not found." });
        const result = await syncSignalsToDemoAccounts();
        return result;
      }),

    /**
     * Get the most recent Tier A + B signals for the live signal feed panel.
     * Returns the latest 20 signals ordered by date descending.
     */
    getRecentSignals: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const account = await getDemoAccountByToken(input.token);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Demo account not found." });
        const result = await getSignals({
          page: 0,
          limit: 20,
          tier: "all",
          sortBy: "date",
        });
        return result.signals;
      }),

    /**
     * Get the public investor preview demo account (no auth required).
     * Creates it on first call if it doesn't exist yet.
     */
    /** Get live stats from the public demo account for homepage display. */
    getPublicDemoStats: publicProcedure.query(async () => {
      return getPublicDemoStats();
    }),

    getPublicDemo: publicProcedure.query(async () => {
      const account = await getOrCreatePublicDemoAccount();
      return { token: PUBLIC_DEMO_TOKEN, account };
    }),

    /**
     * Bootstrap the public demo account by syncing all historical Tier A signals.
     * Called once on server startup or manually.
     */
    bootstrapPublicDemo: publicProcedure.mutation(async () => {
      await getOrCreatePublicDemoAccount();
      const result = await syncSignalsToDemoAccounts();
      return result;
    }),

    /**
     * Update position sizing and pyramiding settings for a demo account.
     */
    updateSettings: publicProcedure
      .input(z.object({
        token: z.string(),
        positionSizePct: z.number().min(0.1).max(25).optional(),
        leverage: z.number().min(1).max(10).optional(),
        strategyTier: z.enum(["A", "AB", "ABC"]).optional(),
        pyramidingEnabled: z.boolean().optional(),
        pyramidMaxEntries: z.number().int().min(1).max(10).optional(),
        pyramidScalePct: z.number().min(0.1).max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        const { token, ...settings } = input;
        return updateDemoAccountSettings(token, settings);
      }),
  }),

  /* ─── Coinlegs Signals ─── */
  signals: router({
    /**
     * Get paginated list of trade signals scraped from coinlegs.com.
     * Publicly accessible so both demo and live dashboards can show them.
     */
    list: publicProcedure
      .input(z.object({
        page: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
        tier: z.enum(["A", "B", "C", "all"]).default("all"),
        period: z.string().optional(),
        exchg: z.string().optional(),
        sortBy: z.enum(["quality", "date"]).default("quality"),
      }))
      .query(async ({ input }) => {
        return getSignals(input);
      }),

    /**
     * Get the latest scraper run status for monitoring.
     */
    scraperStatus: publicProcedure.query(async () => {
      return getScraperStatus();
    }),

    /**
     * Get the top performing signals (bangers) for the homepage showcase.
     * Publicly accessible — no auth required.
     */
    topBangers: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }))
      .query(async ({ input }) => {
        return getTopBangers(input.limit);
      }),

    /**
     * Get aggregate signal stats for the homepage ticker.
     */
    stats: publicProcedure.query(async () => {
      return getSignalStats();
    }),

    /**
     * Get the full July 2026 trade log for the homepage showcase.
     * Returns wins, near-flat trades, and honest filtered-out Tier C signals.
     */
    julyResults: publicProcedure.query(async () => {
      return getJulyResults();
    }),
  }),
});
export type AppRouter = typeof appRouter;
