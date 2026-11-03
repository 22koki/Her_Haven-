CREATE TABLE `haven_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`circle_id` text NOT NULL,
	`body` text NOT NULL,
	`response_preference` text NOT NULL,
	`hide_profile` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `haven_profiles`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `haven_posts_owner_created_idx` ON `haven_posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `haven_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`adult_accepted` integer DEFAULT false NOT NULL,
	`community_accepted` integer DEFAULT false NOT NULL,
	`gentle` integer DEFAULT false NOT NULL,
	`joined_circles` text DEFAULT '[]' NOT NULL,
	`saved_ids` text DEFAULT '[]' NOT NULL,
	`blocked_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `haven_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `haven_profiles`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `haven_replies_owner_post_idx` ON `haven_replies` (`user_id`,`post_id`);--> statement-breakpoint
CREATE TABLE `haven_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `haven_profiles`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `haven_reports_owner_created_idx` ON `haven_reports` (`user_id`,`created_at`);