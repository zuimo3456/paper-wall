CREATE TABLE `wall_records` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `wall_records_user_updated` ON `wall_records` (`user_id`,`updated_at`);