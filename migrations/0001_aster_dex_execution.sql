CREATE TABLE `aster_agent_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`liveAccountId` integer NOT NULL,
	`asterAccountAddress` text NOT NULL,
	`signerAddress` text NOT NULL,
	`encryptedSignerPrivateKey` text NOT NULL,
	`builderAddress` text NOT NULL,
	`agentStatus` text DEFAULT 'pending' NOT NULL,
	`builderStatus` text DEFAULT 'pending' NOT NULL,
	`maxFeeRate` text,
	`feeRate` text,
	`permissionsJson` text,
	`ipWhitelistJson` text,
	`approvalExpiresAt` integer,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`lastValidatedAt` integer,
	`revokedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_intents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`externalSignalId` text,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`orderType` text DEFAULT 'market' NOT NULL,
	`requestedNotionalUsd` text,
	`targetLeverage` integer,
	`limitPrice` text,
	`stopLossPrice` text,
	`takeProfitPrice` text,
	`thesis` text,
	`status` text DEFAULT 'created' NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tradeIntentId` integer NOT NULL,
	`userId` integer NOT NULL,
	`asterAgentAccountId` integer,
	`provider` text DEFAULT 'aster' NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`orderType` text DEFAULT 'market' NOT NULL,
	`notionalUsd` text,
	`quantity` text,
	`leverage` integer,
	`limitPrice` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotencyKey` text NOT NULL,
	`orderId` text,
	`errorMessage` text,
	`queuedAt` integer NOT NULL,
	`submittedAt` integer,
	`filledAt` integer,
	`cancelledAt` integer,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`executionJobId` integer NOT NULL,
	`provider` text DEFAULT 'aster' NOT NULL,
	`eventType` text NOT NULL,
	`payloadJson` text,
	`occurredAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nav_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`provider` text DEFAULT 'aster' NOT NULL,
	`accountEquityUsd` text NOT NULL,
	`availableBalanceUsd` text,
	`unrealizedPnlUsd` text,
	`realizedPnlUsd` text,
	`depositsUsd` text,
	`withdrawalsUsd` text,
	`snapshotAt` integer NOT NULL,
	`source` text DEFAULT 'provider_sync' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fee_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`periodStart` integer NOT NULL,
	`periodEnd` integer NOT NULL,
	`startingNavUsd` text NOT NULL,
	`endingNavUsd` text,
	`highWaterMarkUsd` text NOT NULL,
	`managementFeeUsd` text DEFAULT '0.00' NOT NULL,
	`performanceFeeUsd` text DEFAULT '0.00' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`crystallizedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fee_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feePeriodId` integer NOT NULL,
	`userId` integer NOT NULL,
	`amountUsd` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`txHash` text,
	`paidAt` integer,
	`createdAt` integer NOT NULL
);
