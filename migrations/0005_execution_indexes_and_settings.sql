-- Idempotency constraint: composite unique index on (userId, idempotencyKey)
-- prevents duplicate mirrors in execution_jobs
CREATE UNIQUE INDEX `execution_jobs_idempotency_idx` ON `execution_jobs` (`userId`, `idempotencyKey`);
--> statement-breakpoint
-- Performance indexes for coinlegs_signals:
-- Filtered queries by tier + date
CREATE INDEX `coinlegs_tier_signal_date_idx` ON `coinlegs_signals` (`qualityTier`, `signalDate`);
--> statement-breakpoint
-- Top Bangers sorting by qualityScore
CREATE INDEX `coinlegs_quality_score_idx` ON `coinlegs_signals` (`qualityScore`);
--> statement-breakpoint
-- Tier-based profit queries
CREATE INDEX `coinlegs_tier_max_profit_idx` ON `coinlegs_signals` (`qualityTier`, `maxProfit`);
--> statement-breakpoint
-- Persist global kill switch and other settings across Worker restarts
CREATE TABLE `global_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_settings_key_unique` ON `global_settings` (`key`);
