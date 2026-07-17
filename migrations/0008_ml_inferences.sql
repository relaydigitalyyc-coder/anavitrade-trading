-- ML inference audit trail for isotonic calibration dataset
--> statement-breakpoint
CREATE TABLE `ml_inferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tradeIntentId` integer,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`proba` text NOT NULL,
	`threshold` text NOT NULL,
	`decision` text NOT NULL,
	`regime` text NOT NULL,
	`featureVectorJson` text,
	`createdAt` integer NOT NULL
);
