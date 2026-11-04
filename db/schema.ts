import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export * from "./community-schema";

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

// These records belong only to the private profile, never to a community
// membership. Clearing that profile cascades to both tables.
export const havenPrivateCheckIns = sqliteTable("haven_private_check_ins", {
  userId: text("user_id").notNull().references(() => havenProfiles.userId, { onDelete: "cascade" }),
  day: text("day").notNull(),
  mood: text("mood").notNull(),
  need: text("need").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ name: "haven_private_check_ins_owner_day_pk", columns: [table.userId, table.day] }),
  check("haven_private_check_ins_day_check", sql`length(${table.day}) = 10 AND ${table.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(${table.day},1,4) <> '0000' AND date(${table.day},'+0 days') IS NOT NULL AND date(${table.day},'+0 days') = ${table.day}`),
  check("haven_private_check_ins_mood_check", sql`${table.mood} IN ('heavy','tired','steady','hopeful','bright')`),
  check("haven_private_check_ins_need_check", sql`${table.need} IN ('quiet','connection','growth','joy','unsure')`),
  check("haven_private_check_ins_note_check", sql`length(${table.note}) <= 1200`),
]);

export const havenPersonalGoals = sqliteTable("haven_personal_goals", {
  userId: text("user_id").primaryKey().references(() => havenProfiles.userId, { onDelete: "cascade" }),
  id: text("id").notNull(),
  title: text("title").notNull(),
  area: text("area").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("haven_personal_goals_id_idx").on(table.id),
  check("haven_personal_goals_title_check", sql`length(${table.title}) BETWEEN 1 AND 160 AND length(trim(${table.title})) > 0`),
  check("haven_personal_goals_area_check", sql`${table.area} IN ('care','connection','work-money','joy')`),
  check("haven_personal_goals_completed_check", sql`${table.completed} IN (0,1)`),
]);
