-- Outcome validation: track whether each Coinlegs signal's claimed maxProfit
-- was actually achievable against real Binance price data.
ALTER TABLE `coinlegs_signals` ADD `outcomeValidated` integer DEFAULT 0 NOT NULL;
ALTER TABLE `coinlegs_signals` ADD `actualMaxProfitPct` text;
ALTER TABLE `coinlegs_signals` ADD `actualDrawdownPct` text;
ALTER TABLE `coinlegs_signals` ADD `outcomeWarning` integer DEFAULT 0 NOT NULL;

-- Portfolio exposure cap: limit total open notional across all queued/submitted
-- execution jobs to a configurable percentage of account equity.
ALTER TABLE `live_accounts` ADD `maxTotalExposurePct` text DEFAULT '25.00' NOT NULL;
