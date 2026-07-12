import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table — extended with email/password auth fields.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Email verification
  emailVerified: boolean("emailVerified").default(false).notNull(),
  verificationToken: varchar("verificationToken", { length: 128 }),
  verificationTokenExpiresAt: timestamp("verificationTokenExpiresAt"),
  // Password reset
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Live trading accounts — one per user, created after onboarding.
 */
export const liveAccounts = mysqlTable("live_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "active", "suspended", "closed"]).default("pending").notNull(),
  subscriptionTier: mysqlEnum("subscriptionTier", ["starter", "pro", "none"]).default("none").notNull(),
  killSwitchActive: boolean("killSwitchActive").default(false).notNull(),
  maxDailyLossPct: decimal("maxDailyLossPct", { precision: 5, scale: 2 }).default("5.00").notNull(),
  maxLeverage: decimal("maxLeverage", { precision: 5, scale: 2 }).default("10.00").notNull(),
  maxPositionSizePct: decimal("maxPositionSizePct", { precision: 5, scale: 2 }).default("10.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LiveAccount = typeof liveAccounts.$inferSelect;
export type InsertLiveAccount = typeof liveAccounts.$inferInsert;

/**
 * Hyperliquid API wallet connections — one per live account.
 * Stores encrypted credentials for trade-only execution.
 * NEVER stores seed phrases or withdrawal-capable keys.
 */
export const apiWalletConnections = mysqlTable("api_wallet_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  liveAccountId: int("liveAccountId").notNull(),
  // Hyperliquid account address (public, used for display)
  hyperliquidAccount: varchar("hyperliquidAccount", { length: 64 }).notNull(),
  // API wallet address (public identifier)
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  // AES-256 encrypted API wallet private key — trade-only, no withdrawal permissions
  encryptedPrivateKey: text("encryptedPrivateKey").notNull(),
  // Validation status
  status: mysqlEnum("status", ["pending", "active", "revoked", "error"]).default("pending").notNull(),
  validatedAt: timestamp("validatedAt"),
  revokedAt: timestamp("revokedAt"),
  revokedBy: mysqlEnum("revokedBy", ["user", "admin", "system"]),
  // Ledger-specific flag
  isLedgerCustody: boolean("isLedgerCustody").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiWalletConnection = typeof apiWalletConnections.$inferSelect;
export type InsertApiWalletConnection = typeof apiWalletConnections.$inferInsert;

/**
 * Demo accounts for users to try the platform with simulated capital.
 */
export const demoAccounts = mysqlTable("demo_accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  startingCapital: decimal("startingCapital", { precision: 12, scale: 2 }).notNull(),
  currentBalance: decimal("currentBalance", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  accessToken: varchar("accessToken", { length: 64 }).notNull().unique(),
  // Track which signals have been applied to this account (sync cursor)
  lastSyncedSignalId: int("lastSyncedSignalId"),
  // Position sizing & strategy settings
  positionSizePct: decimal("positionSizePct", { precision: 5, scale: 2 }).default("5.00").notNull(),
  leverage: decimal("leverage", { precision: 5, scale: 2 }).default("3.00").notNull(),
  strategyTier: mysqlEnum("strategyTier", ["A", "AB", "ABC"]).default("A").notNull(),
  // Pyramiding settings
  pyramidingEnabled: boolean("pyramidingEnabled").default(false).notNull(),
  pyramidMaxEntries: int("pyramidMaxEntries").default(3).notNull(),
  pyramidScalePct: decimal("pyramidScalePct", { precision: 5, scale: 2 }).default("0.50").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DemoAccount = typeof demoAccounts.$inferSelect;
export type InsertDemoAccount = typeof demoAccounts.$inferInsert;

/**
 * Simulated trade history for demo accounts.
 */
export const demoTrades = mysqlTable("demo_trades", {
  id: int("id").autoincrement().primaryKey(),
  demoAccountId: int("demoAccountId").notNull(),
  // Link to the coinlegs signal that triggered this trade
  signalId: int("signalId"),
  pair: varchar("pair", { length: 20 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 8 }).notNull(),
  exitPrice: decimal("exitPrice", { precision: 18, scale: 8 }),
  quantity: decimal("quantity", { precision: 18, scale: 8 }).notNull(),
  pnl: decimal("pnl", { precision: 12, scale: 2 }),
  pnlPct: decimal("pnlPct", { precision: 8, scale: 4 }),
  status: mysqlEnum("tradeStatus", ["open", "closed"]).default("open").notNull(),
  // Signal metadata (denormalised for fast display)
  indicatorName: varchar("indicatorName", { length: 50 }),
  period: varchar("period", { length: 10 }),
  qualityScore: int("qualityScore"),
  qualityTier: mysqlEnum("qualityTier", ["A", "B", "C", "rejected"]),
  maxProfitPct: decimal("maxProfitPct", { precision: 10, scale: 4 }),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
});

/**
 * Portfolio snapshots — one row per demo account per sync run.
 * Used to build the equity curve chart with real timestamps.
 */
export const portfolioSnapshots = mysqlTable("portfolio_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  demoAccountId: int("demoAccountId").notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull(),
  // Number of trades applied up to this snapshot
  tradeCount: int("tradeCount").default(0).notNull(),
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

export type DemoTrade = typeof demoTrades.$inferSelect;
export type InsertDemoTrade = typeof demoTrades.$inferInsert;

/**
 * Audit log — immutable record of all significant actions.
 */
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 100 }).notNull(),
  detail: text("detail"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;

/**
 * Web3 wallet sessions — tracks connected wallets (Ledger, MetaMask, WalletConnect).
 * Funds never leave the user's wallet; this only records the connection for copytrade signal routing.
 */
export const web3WalletSessions = mysqlTable("web3_wallet_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 42 }).notNull(),
  chainId: int("chainId").default(1).notNull(),
  walletType: mysqlEnum("walletType", ["ledger", "metamask", "walletconnect", "coinbase", "other"]).notNull(),
  // Copytrade configuration
  copytradeEnabled: boolean("copytradeEnabled").default(false).notNull(),
  maxPositionSizeUsd: decimal("maxPositionSizeUsd", { precision: 18, scale: 2 }),
  maxDailyLossPct: decimal("maxDailyLossPct", { precision: 5, scale: 2 }).default("5.00"),
  killSwitchActive: boolean("killSwitchActive").default(false).notNull(),
  // Session state
  status: mysqlEnum("status", ["active", "paused", "revoked"]).default("active").notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  // Ledger-specific: stores the derivation path used, not the private key
  ledgerDerivationPath: varchar("ledgerDerivationPath", { length: 64 }),
  notes: text("notes"),
});

export type Web3WalletSession = typeof web3WalletSessions.$inferSelect;
export type InsertWeb3WalletSession = typeof web3WalletSessions.$inferInsert;

/**
 * Coinlegs trade signals — scraped from coinlegs.com/detections.
 * Continuously updated by the background scraper service.
 * Signal values: 1 = Buy, -1 = Sell, 0 = Neutral
 */
export const coinlegsSignals = mysqlTable("coinlegs_signals", {
  id: int("id").autoincrement().primaryKey(),
  // Coinlegs internal signal ID — used for deduplication
  signalId: bigint("signalId", { mode: "number" }).notNull().unique(),
  // Exchange info
  exchg: varchar("exchg", { length: 50 }).notNull(),
  marketName: varchar("marketName", { length: 30 }).notNull(),
  market: varchar("market", { length: 20 }).notNull(),
  // Indicator info
  indicatorName: varchar("indicatorName", { length: 50 }).notNull(),
  indicatorShortName: varchar("indicatorShortName", { length: 20 }).notNull(),
  typeId: int("typeId").notNull(),
  // Signal: 1=Buy, -1=Sell, 0=Neutral
  signal: int("signal").notNull(),
  period: varchar("period", { length: 10 }).notNull(),
  // Price data
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  lastPrice: decimal("lastPrice", { precision: 20, scale: 8 }),
  percentage24: decimal("percentage24", { precision: 8, scale: 4 }),
  minPrice: decimal("minPrice", { precision: 20, scale: 8 }),
  maxPrice: decimal("maxPrice", { precision: 20, scale: 8 }),
  // Max profit data from coinlegs
  maxProfit: decimal("maxProfit", { precision: 10, scale: 4 }),
  maxProfitDuration: varchar("maxProfitDuration", { length: 50 }),
  // Timestamps from coinlegs
  signalDate: timestamp("signalDate").notNull(),
  signalDateUtc: varchar("signalDateUtc", { length: 30 }),
  recordDate: timestamp("recordDate").notNull(),
  // Quality scoring — computed at import time
  qualityScore: int("qualityScore").default(0).notNull(),
  qualityTier: mysqlEnum("qualityTier", ["A", "B", "C", "rejected"]).default("C").notNull(),
  // When we scraped it
  scrapedAt: timestamp("scrapedAt").defaultNow().notNull(),
});

export type CoinlegsSignal = typeof coinlegsSignals.$inferSelect;
export type InsertCoinlegsSignal = typeof coinlegsSignals.$inferInsert;

/**
 * Scraper run log — tracks each scraper execution for monitoring.
 */
export const scraperRuns = mysqlTable("scraper_runs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["success", "error", "partial"]).notNull(),
  signalsFetched: int("signalsFetched").default(0).notNull(),
  signalsInserted: int("signalsInserted").default(0).notNull(),
  signalsDuplicate: int("signalsDuplicate").default(0).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ScraperRun = typeof scraperRuns.$inferSelect;
