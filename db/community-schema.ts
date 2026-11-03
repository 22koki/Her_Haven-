import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Membership identity/history outlives a private-practice profile reset. In
// particular, deleting a profile must never erase a suspended member's status.
export const communityMembers = sqliteTable("haven_community_members", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("pending"),
  role: text("role").notNull().default("member"),
  application: text("application").notNull(),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("haven_community_members_user_idx").on(table.userId), index("haven_community_members_review_idx").on(table.status, table.updatedAt), check("haven_community_members_status_check", sql`${table.status} IN ('pending','approved','declined','suspended')`), check("haven_community_members_role_check", sql`${table.role} IN ('member','moderator')`)]);

export const communityPosts = sqliteTable("haven_community_posts", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => communityMembers.id),
  circleId: text("circle_id").notNull(),
  body: text("body").notNull(),
  responsePreference: text("response_preference").notNull(),
  quiet: integer("quiet", { mode: "boolean" }).notNull().default(false),
  state: text("state").notNull().default("visible"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("haven_community_posts_feed_idx").on(table.circleId, table.state, table.createdAt, table.id), index("haven_community_posts_member_idx").on(table.memberId, table.createdAt), check("haven_community_posts_state_check", sql`${table.state} IN ('visible','hidden','deleted')`)]);

export const communityReplies = sqliteTable("haven_community_replies", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => communityPosts.id),
  memberId: text("member_id").notNull().references(() => communityMembers.id),
  body: text("body").notNull(),
  state: text("state").notNull().default("visible"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("haven_community_replies_thread_idx").on(table.postId, table.state, table.createdAt, table.id), index("haven_community_replies_member_idx").on(table.memberId, table.createdAt), check("haven_community_replies_state_check", sql`${table.state} IN ('visible','hidden','deleted')`)]);

export const communityReports = sqliteTable("haven_community_reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => communityMembers.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  // Evidence survives deletion of the reported post/reply; moderator-only.
  targetBody: text("target_body").notNull(),
  targetAuthorId: text("target_author_id").notNull().references(() => communityMembers.id),
  targetPostId: text("target_post_id").notNull(),
  targetCircleId: text("target_circle_id").notNull(),
  targetQuiet: integer("target_quiet", { mode: "boolean" }).notNull().default(false),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("open"),
  resolution: text("resolution").notNull().default(""),
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
}, table => [index("haven_community_reports_queue_idx").on(table.status, table.createdAt), index("haven_community_reports_reporter_idx").on(table.reporterId, table.createdAt), check("haven_community_reports_target_check", sql`${table.targetType} IN ('post','reply')`), check("haven_community_reports_status_check", sql`${table.status} IN ('open','actioned','dismissed')`)]);

export const communityBlocks = sqliteTable("haven_community_blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id").notNull().references(() => communityMembers.id),
  blockedId: text("blocked_id").notNull().references(() => communityMembers.id),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("haven_community_blocks_pair_idx").on(table.blockerId, table.blockedId), index("haven_community_blocks_reverse_idx").on(table.blockedId, table.blockerId), check("haven_community_blocks_self_check", sql`${table.blockerId} <> ${table.blockedId}`)]);

export const communityAudit = sqliteTable("haven_community_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull().references(() => communityMembers.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("haven_community_audit_created_idx").on(table.createdAt, table.id)]);

export const communityRateLimits = sqliteTable("haven_community_rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: text("expires_at").notNull(),
});
