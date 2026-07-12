CREATE TABLE `api_wallet_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`liveAccountId` integer NOT NULL,
	`hyperliquidAccount` text NOT NULL,
	`walletAddress` text NOT NULL,
	`encryptedPrivateKey` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`validatedAt` integer,
	`revokedAt` integer,
	`revokedBy` text,
	`isLedgerCustody` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer,
	`action` text NOT NULL,
	`detail` text,
	`ipAddress` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `binance_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`killSwitchActive` integer DEFAULT false NOT NULL,
	`positionSizePct` text DEFAULT '5.00' NOT NULL,
	`leverage` integer DEFAULT 3 NOT NULL,
	`minQualityScore` integer DEFAULT 0 NOT NULL,
	`autoTradeEnabled` integer DEFAULT true NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coinlegs_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signalId` integer NOT NULL,
	`exchg` text NOT NULL,
	`marketName` text NOT NULL,
	`market` text NOT NULL,
	`indicatorName` text NOT NULL,
	`indicatorShortName` text NOT NULL,
	`typeId` integer NOT NULL,
	`signal` integer NOT NULL,
	`period` text NOT NULL,
	`price` text NOT NULL,
	`lastPrice` text,
	`percentage24` text,
	`minPrice` text,
	`maxPrice` text,
	`maxProfit` text,
	`maxProfitDuration` text,
	`signalDate` integer NOT NULL,
	`signalDateUtc` text,
	`recordDate` integer NOT NULL,
	`qualityScore` integer DEFAULT 0 NOT NULL,
	`qualityTier` text DEFAULT 'C' NOT NULL,
	`scrapedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coinlegs_signals_signalId_unique` ON `coinlegs_signals` (`signalId`);--> statement-breakpoint
CREATE TABLE `demo_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`startingCapital` text NOT NULL,
	`currentBalance` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`accessToken` text NOT NULL,
	`lastSyncedSignalId` integer,
	`positionSizePct` text DEFAULT '5.00' NOT NULL,
	`leverage` text DEFAULT '3.00' NOT NULL,
	`strategyTier` text DEFAULT 'A' NOT NULL,
	`pyramidingEnabled` integer DEFAULT false NOT NULL,
	`pyramidMaxEntries` integer DEFAULT 3 NOT NULL,
	`pyramidScalePct` text DEFAULT '0.50' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_accounts_accessToken_unique` ON `demo_accounts` (`accessToken`);--> statement-breakpoint
CREATE TABLE `demo_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`demoAccountId` integer NOT NULL,
	`signalId` integer,
	`pair` text NOT NULL,
	`side` text NOT NULL,
	`entryPrice` text NOT NULL,
	`exitPrice` text,
	`quantity` text NOT NULL,
	`pnl` text,
	`pnlPct` text,
	`status` text DEFAULT 'open' NOT NULL,
	`indicatorName` text,
	`period` text,
	`qualityScore` integer,
	`qualityTier` text,
	`maxProfitPct` text,
	`openedAt` integer NOT NULL,
	`closedAt` integer
);
--> statement-breakpoint
CREATE TABLE `live_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`subscriptionTier` text DEFAULT 'none' NOT NULL,
	`killSwitchActive` integer DEFAULT false NOT NULL,
	`maxDailyLossPct` text DEFAULT '5.00' NOT NULL,
	`maxLeverage` text DEFAULT '10.00' NOT NULL,
	`maxPositionSizePct` text DEFAULT '10.00' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`demoAccountId` integer NOT NULL,
	`balance` text NOT NULL,
	`tradeCount` integer DEFAULT 0 NOT NULL,
	`snapshotAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scraper_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`signalsFetched` integer DEFAULT 0 NOT NULL,
	`signalsInserted` integer DEFAULT 0 NOT NULL,
	`signalsDuplicate` integer DEFAULT 0 NOT NULL,
	`errorMessage` text,
	`durationMs` integer,
	`startedAt` integer NOT NULL,
	`completedAt` integer
);
--> statement-breakpoint
CREATE TABLE `trade_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signalId` integer NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`qty` text NOT NULL,
	`entryPrice` text,
	`stopLossPrice` text,
	`takeProfitPrice` text,
	`leverage` integer DEFAULT 3 NOT NULL,
	`orderId` text,
	`slOrderId` text,
	`tpOrderId` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`errorMessage` text,
	`realisedPnl` text,
	`executedAt` integer NOT NULL,
	`closedAt` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text,
	`name` text,
	`email` text,
	`passwordHash` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`verificationToken` text,
	`verificationTokenExpiresAt` integer,
	`resetToken` text,
	`resetTokenExpiresAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `web3_wallet_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`walletAddress` text NOT NULL,
	`chainId` integer DEFAULT 1 NOT NULL,
	`walletType` text NOT NULL,
	`copytradeEnabled` integer DEFAULT false NOT NULL,
	`maxPositionSizeUsd` text,
	`maxDailyLossPct` text DEFAULT '5.00',
	`killSwitchActive` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`connectedAt` integer NOT NULL,
	`lastSeenAt` integer NOT NULL,
	`revokedAt` integer,
	`ledgerDerivationPath` text,
	`notes` text
);
