CREATE TABLE `cex_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`liveAccountId` integer NOT NULL,
	`exchange` text NOT NULL,
	`label` text,
	`encryptedApiKey` text NOT NULL,
	`encryptedApiSecret` text NOT NULL,
	`encryptedPassphrase` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`copytradeEnabled` integer DEFAULT true NOT NULL,
	`killSwitchActive` integer DEFAULT false NOT NULL,
	`permissionsVerified` integer DEFAULT false NOT NULL,
	`withdrawalDisabledVerified` integer DEFAULT false NOT NULL,
	`attested` integer DEFAULT false NOT NULL,
	`lastBalanceUsd` text,
	`lastValidatedAt` integer,
	`revokedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `execution_jobs` ADD `cexConnectionId` integer;
