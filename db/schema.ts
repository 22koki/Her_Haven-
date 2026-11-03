import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The private alpha keeps every record scoped to its creator. A shared
// community requires explicit membership and staffed moderation rules.
export const havenProfiles = sqliteTable("haven_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  adultAccepted: integer("adult_accepted", { mode: "boolean" }).notNull().default(false),
  communityAccepted: integer("community_accepted", { mode: "boolean" }).notNull().default(false),
  gentle: integer("gentle", { mode: "boolean" }).notNull().default(false),
  joinedCircles: text("joined_circles", { mode: "json" }).$type<string[]>().notNull().default([]),
  savedIds: text("saved_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  blockedIds: text("blocked_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});

export const havenPosts = sqliteTable("haven_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => havenProfiles.userId, { onDelete: "cascade" }),
  circleId: text("circle_id").notNull(),
  body: text("body").notNull(),
  responsePreference: text("response_preference").notNull(),
  hideProfile: integer("hide_profile", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("haven_posts_owner_created_idx").on(table.userId, table.createdAt)]);

export const havenReplies = sqliteTable("haven_replies", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => havenProfiles.userId, { onDelete: "cascade" }),
  // Example post IDs are client-authored, so there is intentionally no post FK.
  postId: text("post_id").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("haven_replies_owner_post_idx").on(table.userId, table.postId)]);

export const havenReports = sqliteTable("haven_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => havenProfiles.userId, { onDelete: "cascade" }),
  postId: text("post_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("haven_reports_owner_created_idx").on(table.userId, table.createdAt)]);
