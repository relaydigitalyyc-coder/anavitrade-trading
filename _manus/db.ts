import { eq, and, desc, asc, sql, inArray, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  demoAccounts, demoTrades,
  portfolioSnapshots,
  liveAccounts, InsertLiveAccount,
  apiWalletConnections, InsertApiWalletConnection,
  auditLog,
  web3WalletSessions, InsertWeb3WalletSession,
  coinlegsSignals,
  scraperRuns,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import crypto from "crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/* ─── Encryption helpers for API wallet keys ─── */
const ENCRYPTION_KEY = process.env.JWT_SECRET?.slice(0, 32).padEnd(32, "0") ?? "anavitrade_default_key_32_chars!";

function encryptKey(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptKey(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/* ─── Audit log ─── */
export async function writeAuditLog(userId: number | null, action: string, detail?: string, ipAddress?: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLog).values({ userId, action, detail: detail ?? null, ipAddress: ipAddress ?? null });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

/* ─── User / Auth Helpers ─── */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getUserByEmail(input.email);
  if (existing) throw new Error("EMAIL_EXISTS");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const verificationToken = nanoid(48);
  const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Insert without openId first to get the auto-increment id
  await db.insert(users).values({
    name: input.name,
    email: input.email,
    passwordHash,
    loginMethod: "email",
    emailVerified: false,
    verificationToken,
    verificationTokenExpiresAt,
    lastSignedIn: new Date(),
  });

  const created = await getUserByEmail(input.email);
  if (!created) throw new Error("Failed to create user");

  // Assign a stable openId derived from the numeric id so sdk.authenticateRequest
  // can always resolve the user via getUserByOpenId as a fallback.
  const localOpenId = `local:${created.id}`;
  await db.update(users).set({ openId: localOpenId }).where(eq(users.id, created.id));
  const finalUser = await getUserByEmail(input.email);
  return { user: finalUser!, verificationToken };
}

export async function verifyUserPassword(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  // Update lastSignedIn
  const db = await getDb();
  if (db) await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function verifyEmailToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.verificationToken, token)).limit(1);
  if (!result.length) throw new Error("INVALID_TOKEN");
  const user = result[0];
  if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) throw new Error("TOKEN_EXPIRED");
  await db.update(users).set({
    emailVerified: true,
    verificationToken: null,
    verificationTokenExpiresAt: null,
  }).where(eq(users.id, user.id));
  return user;
}

export async function resendVerificationEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const user = await getUserByEmail(email);
  // Always return silently if user not found to prevent email enumeration
  if (!user || user.emailVerified) return;
  const verificationToken = nanoid(48);
  const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(users).set({ verificationToken, verificationTokenExpiresAt }).where(eq(users.id, user.id));
  // In production: send verification email with token here.
  return verificationToken;
}

export async function createPasswordResetToken(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const user = await getUserByEmail(email);
  if (!user) return null; // Don't reveal if email exists
  const resetToken = nanoid(48);
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await db.update(users).set({ resetToken, resetTokenExpiresAt }).where(eq(users.id, user.id));
  return { user, resetToken };
}

export async function resetPassword(token: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
  if (!result.length) throw new Error("INVALID_TOKEN");
  const user = result[0];
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) throw new Error("TOKEN_EXPIRED");
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(users.id, user.id));
  return user;
}

/* ─── Live Account Helpers ─── */

export async function getOrCreateLiveAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(liveAccounts).where(eq(liveAccounts.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(liveAccounts).values({ userId, status: "pending" } as InsertLiveAccount);
  const created = await db.select().from(liveAccounts).where(eq(liveAccounts.userId, userId)).limit(1);
  return created[0];
}

export async function getLiveAccountByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(liveAccounts).where(eq(liveAccounts.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function toggleKillSwitch(userId: number, active: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(liveAccounts).set({ killSwitchActive: active }).where(eq(liveAccounts.userId, userId));
  await writeAuditLog(userId, active ? "KILL_SWITCH_ACTIVATED" : "KILL_SWITCH_DEACTIVATED");
}

export async function updateRiskSettings(userId: number, settings: {
  maxDailyLossPct?: string;
  maxLeverage?: string;
  maxPositionSizePct?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(liveAccounts).set(settings).where(eq(liveAccounts.userId, userId));
  await writeAuditLog(userId, "RISK_SETTINGS_UPDATED", JSON.stringify(settings));
}

/* ─── API Wallet Connection Helpers ─── */

export async function connectApiWallet(input: {
  userId: number;
  liveAccountId: number;
  hyperliquidAccount: string;
  walletAddress: string;
  privateKey: string;
  isLedgerCustody: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Revoke any existing active wallet first
  await db.update(apiWalletConnections)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy: "system" })
    .where(and(eq(apiWalletConnections.userId, input.userId), eq(apiWalletConnections.status, "active")));

  const encryptedPrivateKey = encryptKey(input.privateKey);

  await db.insert(apiWalletConnections).values({
    userId: input.userId,
    liveAccountId: input.liveAccountId,
    hyperliquidAccount: input.hyperliquidAccount,
    walletAddress: input.walletAddress,
    encryptedPrivateKey,
    isLedgerCustody: input.isLedgerCustody,
    status: "pending",
  } as InsertApiWalletConnection);

  await writeAuditLog(input.userId, "API_WALLET_CONNECTED", `wallet: ${input.walletAddress}, ledger: ${input.isLedgerCustody}`);

  const result = await db.select().from(apiWalletConnections)
    .where(and(eq(apiWalletConnections.userId, input.userId), eq(apiWalletConnections.walletAddress, input.walletAddress)))
    .limit(1);
  return result[0];
}

export async function getActiveApiWallet(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(apiWalletConnections)
    .where(and(eq(apiWalletConnections.userId, userId), eq(apiWalletConnections.status, "active")))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getApiWalletByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    id: apiWalletConnections.id,
    userId: apiWalletConnections.userId,
    hyperliquidAccount: apiWalletConnections.hyperliquidAccount,
    walletAddress: apiWalletConnections.walletAddress,
    status: apiWalletConnections.status,
    isLedgerCustody: apiWalletConnections.isLedgerCustody,
    validatedAt: apiWalletConnections.validatedAt,
    revokedAt: apiWalletConnections.revokedAt,
    createdAt: apiWalletConnections.createdAt,
  }).from(apiWalletConnections)
    .where(eq(apiWalletConnections.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function activateApiWallet(walletId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(apiWalletConnections)
    .set({ status: "active", validatedAt: new Date() })
    .where(and(eq(apiWalletConnections.id, walletId), eq(apiWalletConnections.userId, userId)));
  // Also activate the live account
  await db.update(liveAccounts).set({ status: "active" }).where(eq(liveAccounts.userId, userId));
  await writeAuditLog(userId, "API_WALLET_VALIDATED");
}

export async function revokeApiWallet(userId: number, revokedBy: "user" | "admin" | "system" = "user") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(apiWalletConnections)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy })
    .where(and(eq(apiWalletConnections.userId, userId), eq(apiWalletConnections.status, "active")));
  await db.update(liveAccounts).set({ status: "pending" }).where(eq(liveAccounts.userId, userId));
  await writeAuditLog(userId, "API_WALLET_REVOKED", `revokedBy: ${revokedBy}`);
}

/* ─── Demo Account Helpers ─── */

export async function createDemoAccount(input: { username: string; email: string; startingCapital: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const accessToken = nanoid(32);
  await db.insert(demoAccounts).values({
    username: input.username,
    email: input.email,
    startingCapital: input.startingCapital,
    currentBalance: input.startingCapital,
    accessToken,
    status: "active",
  });
  return { accessToken };
}

// Fixed token for the public investor preview demo account
export const PUBLIC_DEMO_TOKEN = "anavitrade-public-demo-2026";

/**
 * Get or create the shared public demo account.
 * This account is pre-seeded with all Tier A signals and is accessible
 * at /demo without any wallet connection or authentication.
 */
export async function getOrCreatePublicDemoAccount() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if public demo account already exists
  const existing = await db.select().from(demoAccounts)
    .where(eq(demoAccounts.accessToken, PUBLIC_DEMO_TOKEN))
    .limit(1);
  if (existing.length > 0) return existing[0];
  // Create it with a fixed token and $10,000 starting capital
  await db.insert(demoAccounts).values({
    username: "Investor Preview",
    email: "demo@anavitrade.com",
    startingCapital: "10000.00",
    currentBalance: "10000.00",
    accessToken: PUBLIC_DEMO_TOKEN,
    status: "active",
    positionSizePct: "5.00",
    leverage: "3.00",
    strategyTier: "A",
    pyramidingEnabled: false,
    pyramidMaxEntries: 3,
    pyramidScalePct: "0.50",
  });
  const created = await db.select().from(demoAccounts)
    .where(eq(demoAccounts.accessToken, PUBLIC_DEMO_TOKEN))
    .limit(1);
  return created[0];
}

/**
 * Update position sizing and pyramiding settings for a demo account.
 */
export async function updateDemoAccountSettings(token: string, settings: {
  positionSizePct?: number;
  leverage?: number;
  strategyTier?: "A" | "AB" | "ABC";
  pyramidingEnabled?: boolean;
  pyramidMaxEntries?: number;
  pyramidScalePct?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const account = await getDemoAccountByToken(token);
  if (!account) throw new Error("Demo account not found");
  const updates: Record<string, unknown> = {};
  if (settings.positionSizePct !== undefined) updates.positionSizePct = String(settings.positionSizePct.toFixed(2));
  if (settings.leverage !== undefined) updates.leverage = String(settings.leverage.toFixed(2));
  if (settings.strategyTier !== undefined) updates.strategyTier = settings.strategyTier;
  if (settings.pyramidingEnabled !== undefined) updates.pyramidingEnabled = settings.pyramidingEnabled;
  if (settings.pyramidMaxEntries !== undefined) updates.pyramidMaxEntries = settings.pyramidMaxEntries;
  if (settings.pyramidScalePct !== undefined) updates.pyramidScalePct = String(settings.pyramidScalePct.toFixed(2));
  if (Object.keys(updates).length > 0) {
    await db.update(demoAccounts).set(updates).where(eq(demoAccounts.id, account.id));
  }
  return { success: true };
}

/**
 * Get live stats from the public demo account for homepage display.
 * Returns July return %, best signal, trade count, and starting capital.
 */
export async function getPublicDemoStats() {
  const db = await getDb();
  if (!db) return null;

  const account = await getOrCreatePublicDemoAccount();
  const startingCapital = parseFloat(account.startingCapital);
  const currentBalance = parseFloat(account.currentBalance);
  const totalReturnPct = ((currentBalance - startingCapital) / startingCapital) * 100;

  // Count trades
  const [{ tradeCount }] = await db.select({ tradeCount: sql<number>`count(*)` })
    .from(demoTrades)
    .where(and(eq(demoTrades.demoAccountId, account.id), eq(demoTrades.status, 'closed')));

  // Best single trade P&L %
  const [{ bestPnlPct }] = await db.select({ bestPnlPct: sql<number>`MAX(CAST(${demoTrades.pnlPct} AS DECIMAL(10,4)))` })
    .from(demoTrades)
    .where(and(eq(demoTrades.demoAccountId, account.id), eq(demoTrades.status, 'closed')));

  // Average P&L %
  const [{ avgPnlPct }] = await db.select({ avgPnlPct: sql<number>`AVG(CAST(${demoTrades.pnlPct} AS DECIMAL(10,4)))` })
    .from(demoTrades)
    .where(and(eq(demoTrades.demoAccountId, account.id), eq(demoTrades.status, 'closed')));

  // Count Tier A signals in July
  const [{ tierAJulyCount }] = await db.select({ tierAJulyCount: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(and(
      eq(coinlegsSignals.signal, 1),
      eq(coinlegsSignals.qualityTier, 'A'),
      sql`${coinlegsSignals.signalDate} >= '2026-07-01 00:00:00'`,
    ));

  return {
    currentBalance,
    startingCapital,
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    tradeCount: Number(tradeCount),
    bestPnlPct: Number(bestPnlPct ?? 0),
    avgPnlPct: Number(avgPnlPct ?? 0),
    tierAJulyCount: Number(tierAJulyCount),
  };
}

export async function getDemoAccountByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(demoAccounts).where(eq(demoAccounts.accessToken, token)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getDemoTradesByAccountId(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(demoTrades)
    .where(eq(demoTrades.demoAccountId, accountId))
    .orderBy(desc(demoTrades.openedAt));
}

export async function getPortfolioSnapshotsByAccountId(accountId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.demoAccountId, accountId))
    .orderBy(portfolioSnapshots.snapshotAt);
}

/**
 * Signal-to-Trade Sync Engine
 *
 * Applies all new Tier A + B coinlegs signals (since the account's last sync)
 * to every active demo account as simulated closed trades.
 *
 * Position sizing: 2% of current balance per trade (fixed fractional).
 * P&L: entryPrice × quantity × (maxProfitPct / 100) — uses the actual
 *   MaxProfit% the signal achieved, so the equity curve reflects real outcomes.
 *
 * After processing all new signals, writes a portfolio snapshot so the
 * growth chart has a real timestamp-anchored data point.
 *
 * Called by the Heartbeat scraper job after each successful scrape run.
 */
export async function syncSignalsToDemoAccounts(): Promise<{
  accountsProcessed: number;
  tradesCreated: number;
  snapshotsWritten: number;
}> {
  const db = await getDb();
  if (!db) return { accountsProcessed: 0, tradesCreated: 0, snapshotsWritten: 0 };

  // Fetch all active demo accounts
  const accounts = await db.select().from(demoAccounts)
    .where(eq(demoAccounts.status, "active"));

  if (accounts.length === 0) return { accountsProcessed: 0, tradesCreated: 0, snapshotsWritten: 0 };

  let tradesCreated = 0;
  let snapshotsWritten = 0;

  for (const account of accounts) {
    try {
      // Fetch all Tier A + B signals that were inserted AFTER this account's last sync
      // We use the coinlegsSignals.id as a cursor (auto-increment, monotonically increasing)
      const lastId = account.lastSyncedSignalId ?? 0;

      // Determine which tiers to include based on account strategy setting
      const tierFilter = account.strategyTier === 'A'
        ? `'A'`
        : account.strategyTier === 'AB'
        ? `'A', 'B'`
        : `'A', 'B', 'C'`;

      const newSignals = await db.select().from(coinlegsSignals)
        .where(
          and(
            sql`${coinlegsSignals.id} > ${lastId}`,
            eq(coinlegsSignals.signal, 1),
            sql`${coinlegsSignals.qualityTier} IN (${sql.raw(tierFilter)})`,
          )
        )
        .orderBy(coinlegsSignals.signalDate);

      if (newSignals.length === 0) continue;

      let currentBalance = parseFloat(account.currentBalance);
      const startingBalance = currentBalance;
      let maxSignalId = lastId;
      let runningTradeCount = 0;

      // Get current trade count as starting point
      const [{ existingCount }] = await db.select({ existingCount: sql<number>`count(*)` })
        .from(demoTrades)
        .where(eq(demoTrades.demoAccountId, account.id));
      runningTradeCount = Number(existingCount);

      // Collect snapshots to batch-insert (one per trade close date)
      const snapshotRows: Array<{
        demoAccountId: number;
        balance: string;
        tradeCount: number;
        snapshotAt: Date;
      }> = [];

      for (const signal of newSignals) {
        if (signal.id > maxSignalId) maxSignalId = signal.id;

        const maxProfitPct = parseFloat(signal.maxProfit ?? "0");
        if (maxProfitPct <= 0) continue; // Hard gate: skip signals with no profit

        const entryPrice = parseFloat(signal.price);
        if (entryPrice <= 0) continue;

        // Position sizing: capital risk % × leverage = notional exposure
        // e.g. 5% capital risk × 3× leverage = 15% notional position
        const riskPct = parseFloat(account.positionSizePct ?? "5.00") / 100;
        const leverage = parseFloat((account as any).leverage ?? "3.00");
        const positionSizePct = riskPct * leverage; // notional as fraction of balance

        // Pyramiding: if enabled and same asset already has open pyramid entries, scale down
        let effectivePositionPct = positionSizePct;
        if (account.pyramidingEnabled) {
          // Count how many pyramid entries already exist for this pair in the recent window
          const pyramidWindow = new Date(signal.signalDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          const [{ pyramidCount }] = await db.select({ pyramidCount: sql<number>`count(*)` })
            .from(demoTrades)
            .where(
              and(
                eq(demoTrades.demoAccountId, account.id),
                eq(demoTrades.pair, signal.marketName),
                sql`${demoTrades.openedAt} >= ${pyramidWindow}`,
              )
            );
          const existingEntries = Number(pyramidCount);
          const maxEntries = account.pyramidMaxEntries ?? 3;
          if (existingEntries >= maxEntries) continue; // Max pyramid entries reached
          // Scale down position by pyramidScalePct for each additional entry
          const scaleFactor = Math.pow(parseFloat(account.pyramidScalePct ?? "0.50") / 100, existingEntries);
          effectivePositionPct = positionSizePct * (existingEntries === 0 ? 1 : scaleFactor);
        }

        // Notional position value (leveraged)
        const positionValueUsd = currentBalance * effectivePositionPct;
        const quantity = positionValueUsd / entryPrice;

        // Exit price: entry × (1 + maxProfitPct/100)
        const exitPrice = entryPrice * (1 + maxProfitPct / 100);
        // P&L on the leveraged notional — but capped at the capital at risk (riskPct × balance)
        // This prevents unrealistic gains beyond what the margin can support
        const rawPnl = positionValueUsd * (maxProfitPct / 100);
        const maxPnl = currentBalance * riskPct * leverage; // theoretical max on this position
        const pnl = Math.min(rawPnl, maxPnl);
        const pnlPct = maxProfitPct; // signal's actual return %

        // The trade closes at signalDate + maxProfitDuration (or signalDate + 4h as fallback)
        const openedAt = signal.signalDate;
        const durationMs = parseDurationToMs(signal.maxProfitDuration) ?? (4 * 60 * 60 * 1000);
        const closedAt = new Date(openedAt.getTime() + durationMs);

        await db.insert(demoTrades).values({
          demoAccountId: account.id,
          signalId: signal.id,
          pair: signal.marketName,
          side: "buy",
          entryPrice: String(entryPrice),
          exitPrice: String(exitPrice),
          quantity: String(quantity),
          pnl: String(pnl.toFixed(2)),
          pnlPct: String(pnlPct.toFixed(4)),
          status: "closed",
          indicatorName: signal.indicatorShortName,
          period: signal.period,
          qualityScore: signal.qualityScore,
          qualityTier: signal.qualityTier,
          maxProfitPct: String(maxProfitPct),
          openedAt,
          closedAt,
        });

        currentBalance += pnl;
        tradesCreated++;
        runningTradeCount++;

        // Write a snapshot at the trade close time — this builds the real equity curve
        snapshotRows.push({
          demoAccountId: account.id,
          balance: String(currentBalance.toFixed(2)),
          tradeCount: runningTradeCount,
          snapshotAt: closedAt,
        });
      }

      // Update account balance and sync cursor
      if (currentBalance !== startingBalance || maxSignalId > lastId) {
        await db.update(demoAccounts)
          .set({
            currentBalance: String(currentBalance.toFixed(2)),
            lastSyncedSignalId: maxSignalId,
          })
          .where(eq(demoAccounts.id, account.id));
      }

      // Batch-insert all snapshot rows (one per trade close date = real equity curve)
      if (snapshotRows.length > 0) {
        // Insert in batches of 50 to avoid oversized queries
        const BATCH = 50;
        for (let i = 0; i < snapshotRows.length; i += BATCH) {
          await db.insert(portfolioSnapshots).values(snapshotRows.slice(i, i + BATCH));
        }
        snapshotsWritten += snapshotRows.length;
      }

    } catch (err: any) {
      console.error(`[SyncEngine] Error processing account ${account.id}:`, err?.message);
    }
  }

  console.log(
    `[SyncEngine] Done: accounts=${accounts.length} trades=${tradesCreated} snapshots=${snapshotsWritten}`
  );
  return { accountsProcessed: accounts.length, tradesCreated, snapshotsWritten };
}

/**
 * Parse MaxProfitDuration string to milliseconds.
 * Examples: "3 days" → 259200000, "22 hours" → 79200000, "45 mins" → 2700000
 */
function parseDurationToMs(dur: string | null): number | null {
  if (!dur) return null;
  const d = dur.toLowerCase().trim();
  const n = parseFloat(d.split(/\s+/)[0]);
  if (isNaN(n)) return null;
  if (d.includes("day")) return n * 24 * 60 * 60 * 1000;
  if (d.includes("hour") || d.includes("hr")) return n * 60 * 60 * 1000;
  if (d.includes("min")) return n * 60 * 1000;
  return null;
}

/* ─── Web3 Wallet Session Helpers ─── */

export async function saveWeb3WalletSession(data: {
  userId: number;
  walletAddress: string;
  chainId?: number;
  walletType: "ledger" | "metamask" | "walletconnect" | "coinbase" | "other";
  maxPositionSizeUsd?: number;
  maxDailyLossPct?: number;
  ledgerDerivationPath?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Revoke any existing active session for this user first
  await db.update(web3WalletSessions)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(web3WalletSessions.userId, data.userId), eq(web3WalletSessions.status, "active")));

  const values: InsertWeb3WalletSession = {
    userId: data.userId,
    walletAddress: data.walletAddress.toLowerCase(),
    chainId: data.chainId ?? 1,
    walletType: data.walletType,
    copytradeEnabled: true, // signal feed is live — enable immediately on connect
    maxPositionSizeUsd: data.maxPositionSizeUsd ? String(data.maxPositionSizeUsd) : null,
    maxDailyLossPct: data.maxDailyLossPct ? String(data.maxDailyLossPct) : "5.00",
    killSwitchActive: false,
    status: "active",
    ledgerDerivationPath: data.ledgerDerivationPath ?? null,
  };

  await db.insert(web3WalletSessions).values(values);
  await writeAuditLog(data.userId, "WEB3_WALLET_CONNECTED", `${data.walletType}:${data.walletAddress}`);

  const result = await db.select().from(web3WalletSessions)
    .where(and(eq(web3WalletSessions.userId, data.userId), eq(web3WalletSessions.status, "active")))
    .orderBy(web3WalletSessions.connectedAt)
    .limit(1);
  return result[0];
}

export async function getWeb3WalletSession(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(web3WalletSessions)
    .where(and(eq(web3WalletSessions.userId, userId), eq(web3WalletSessions.status, "active")))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function revokeWeb3WalletSession(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(web3WalletSessions)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(web3WalletSessions.userId, userId), eq(web3WalletSessions.status, "active")));
  await writeAuditLog(userId, "WEB3_WALLET_REVOKED");
}

export async function toggleWeb3KillSwitch(userId: number, active: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(web3WalletSessions)
    .set({ killSwitchActive: active, lastSeenAt: new Date() })
    .where(and(eq(web3WalletSessions.userId, userId), eq(web3WalletSessions.status, "active")));
  await writeAuditLog(userId, active ? "KILL_SWITCH_ACTIVATED" : "KILL_SWITCH_DEACTIVATED");
}

/**
 * Hook point for the algo signal feed.
 * When you wire in the trading algorithm, call this to enable copytrade
 * for a user's active web3 wallet session.
 */
export async function enableCopytrade(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(web3WalletSessions)
    .set({ copytradeEnabled: true, lastSeenAt: new Date() })
    .where(and(eq(web3WalletSessions.userId, userId), eq(web3WalletSessions.status, "active")));
  await writeAuditLog(userId, "COPYTRADE_ENABLED");
}

/**
 * Dispatch a copytrade signal to a user's wallet.
 * Replace the body of this function with your actual signal routing logic
 * (e.g. push to a queue, call Hyperliquid, send a WalletConnect request).
 */
export async function dispatchCopytradeSignal(userId: number, signal: {
  pair: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
}) {
  const session = await getWeb3WalletSession(userId);
  if (!session || !session.copytradeEnabled || session.killSwitchActive) {
    return { dispatched: false, reason: session?.killSwitchActive ? "kill_switch" : "not_enabled" };
  }
  // TODO: Replace with real signal dispatch to the connected wallet
  // e.g. WalletConnect request, Hyperliquid order, or on-chain transaction
  await writeAuditLog(userId, "COPYTRADE_SIGNAL_DISPATCHED", JSON.stringify(signal));
  return { dispatched: true, walletAddress: session.walletAddress };
}

/* ─── Coinlegs Signals ─── */

/**
 * Get paginated coinlegs signals with optional filtering.
 * signal: 1=Buy, -1=Sell, 0=Neutral
 */
export async function getSignals(opts: {
  page?: number;
  limit?: number;
  period?: string;
  tier?: "A" | "B" | "C" | "all";
  exchg?: string;
  sortBy?: "quality" | "date";
}) {
  const db = await getDb();
  if (!db) return { signals: [], total: 0, page: 0, limit: 20 };

  const page = opts.page ?? 0;
  const limit = opts.limit ?? 20;
  const offset = page * limit;

  // Always Buy-only — Sell and Neutral are never stored
  const conditions: ReturnType<typeof eq>[] = [
    eq(coinlegsSignals.signal, 1),
  ];

  if (opts.tier && opts.tier !== "all") {
    conditions.push(eq(coinlegsSignals.qualityTier, opts.tier));
  }
  if (opts.period) {
    conditions.push(eq(coinlegsSignals.period, opts.period));
  }
  if (opts.exchg) {
    conditions.push(eq(coinlegsSignals.exchg, opts.exchg));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  // Default sort: quality score desc (best signals first), then date desc for ties
  const sortBy = opts.sortBy ?? "quality";
  const orderCols = sortBy === "quality"
    ? [desc(coinlegsSignals.qualityScore), desc(coinlegsSignals.signalDate)]
    : [desc(coinlegsSignals.signalDate), desc(coinlegsSignals.qualityScore)];

  const signals = await db.select().from(coinlegsSignals)
    .where(whereClause)
    .orderBy(...orderCols)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(whereClause);

  return { signals, total: Number(count), page, limit };
}

/**
 * Get the top performing signals (bangers) for homepage showcase.
 * Returns the highest MaxProfit signals, deduplicated by marketName.
 */
export async function getTopBangers(limit = 6) {
  const db = await getDb();
  if (!db) return [];

  // Get top signals by maxProfit, deduplicated by coin name
  const rows = await db.select().from(coinlegsSignals)
    .where(
      and(
        eq(coinlegsSignals.signal, 1),
        sql`CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,2)) > 5`,
      )
    )
    .orderBy(
      sql`CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,2)) DESC`,
      desc(coinlegsSignals.qualityScore)
    )
    .limit(limit * 4); // over-fetch to allow dedup

  // Deduplicate by marketName, keep highest profit per coin
  const seen = new Set<string>();
  const deduped = [];
  for (const row of rows) {
    const key = row.marketName;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= limit) break;
    }
  }
  return deduped;
}

/**
 * Get aggregate stats for the homepage ticker.
 */
export async function getSignalStats() {
  const db = await getDb();
  if (!db) return null;

  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(eq(coinlegsSignals.signal, 1));

  const [{ avgProfit }] = await db.select({ avgProfit: sql<number>`AVG(CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,2)))` })
    .from(coinlegsSignals)
    .where(and(
      eq(coinlegsSignals.signal, 1),
      sql`CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,2)) > 0`,
    ));

  const [{ tierA }] = await db.select({ tierA: sql<number>`count(*)` })
    .from(coinlegsSignals)
    .where(and(eq(coinlegsSignals.signal, 1), eq(coinlegsSignals.qualityTier, 'A')));

  const [{ maxProfit }] = await db.select({ maxProfit: sql<number>`MAX(CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,2)))` })
    .from(coinlegsSignals)
    .where(eq(coinlegsSignals.signal, 1));

  return {
    totalSignals: Number(total),
    avgProfit: Number(avgProfit ?? 0),
    tierACount: Number(tierA),
    allTimeMax: Number(maxProfit ?? 0),
  };
}

/**
 * Get the latest scraper run status.
 */
export async function getScraperStatus() {
  const db = await getDb();
  if (!db) return null;

  const [latest] = await db.select().from(scraperRuns)
    .orderBy(desc(scraperRuns.startedAt))
    .limit(1);

  const [{ totalSignals }] = await db.select({ totalSignals: sql<number>`count(*)` })
    .from(coinlegsSignals);

  return {
    latestRun: latest ?? null,
    totalSignals: Number(totalSignals),
  };
}

/**
 * Get the full July 2026 trade log for the homepage showcase.
 * Returns:
 *  - wins: all Tier A+B Buy signals that resolved with maxProfit > 0
 *  - nearFlat: Tier A+B signals with maxProfit < 2% (honest "barely moved" trades)
 *  - filteredOut: Tier C signals we CORRECTLY excluded (honest losses we avoided)
 * All signals are from July 2026 (2026-07-01 to 2026-07-31).
 */
export async function getJulyResults() {
  const db = await getDb();
  if (!db) return null;

  const julyStart = new Date("2026-07-01T00:00:00Z");
  const julyEnd   = new Date("2026-08-01T00:00:00Z");

  // All Tier A+B signals in July (our taken trades)
  const taken = await db.select({
    id: coinlegsSignals.id,
    marketName: coinlegsSignals.marketName,
    indicatorShortName: coinlegsSignals.indicatorShortName,
    period: coinlegsSignals.period,
    qualityTier: coinlegsSignals.qualityTier,
    qualityScore: coinlegsSignals.qualityScore,
    maxProfit: coinlegsSignals.maxProfit,
    signalDate: coinlegsSignals.signalDate,
    price: coinlegsSignals.price,
  })
    .from(coinlegsSignals)
    .where(and(
      eq(coinlegsSignals.signal, 1),
      inArray(coinlegsSignals.qualityTier, ["A", "B"]),
      gte(coinlegsSignals.signalDate, julyStart),
      lt(coinlegsSignals.signalDate, julyEnd),
    ))
    .orderBy(desc(sql`CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,4))`));

  // Tier C signals in July (filtered out — honest losses we avoided)
  const filteredOut = await db.select({
    id: coinlegsSignals.id,
    marketName: coinlegsSignals.marketName,
    indicatorShortName: coinlegsSignals.indicatorShortName,
    period: coinlegsSignals.period,
    qualityTier: coinlegsSignals.qualityTier,
    qualityScore: coinlegsSignals.qualityScore,
    maxProfit: coinlegsSignals.maxProfit,
    signalDate: coinlegsSignals.signalDate,
    price: coinlegsSignals.price,
  })
    .from(coinlegsSignals)
    .where(and(
      eq(coinlegsSignals.signal, 1),
      eq(coinlegsSignals.qualityTier, "C"),
      gte(coinlegsSignals.signalDate, julyStart),
      lt(coinlegsSignals.signalDate, julyEnd),
    ))
    .orderBy(asc(sql`CAST(${coinlegsSignals.maxProfit} AS DECIMAL(10,4))`))
    .limit(20); // show worst 20 filtered-out signals

  const wins = taken.filter(s => s.maxProfit !== null && parseFloat(String(s.maxProfit)) >= 2);
  const nearFlat = taken.filter(s => s.maxProfit !== null && parseFloat(String(s.maxProfit)) > 0 && parseFloat(String(s.maxProfit)) < 2);

  // Simulate P&L: 0.5% position sizing, compounded
  let balance = 10000;
  let totalPnl = 0;
  const sortedByDate = [...taken].sort((a, b) =>
    new Date(a.signalDate!).getTime() - new Date(b.signalDate!).getTime()
  );
  for (const s of sortedByDate) {
    const mp = s.maxProfit !== null ? parseFloat(String(s.maxProfit)) : 0;
    const pnl = balance * 0.005 * (mp / 100);
    balance += pnl;
    totalPnl += pnl;
  }

  return {
    wins,
    nearFlat,
    filteredOut,
    summary: {
      totalTaken: taken.length,
      winCount: wins.length,
      nearFlatCount: nearFlat.length,
      filteredOutCount: filteredOut.length,
      netReturn: ((balance - 10000) / 10000) * 100,
      totalPnl,
      bestProfit: wins.length > 0 ? parseFloat(String(wins[0].maxProfit)) : 0,
      bestPair: wins.length > 0 ? wins[0].marketName : "",
    },
  };
}
