import { COMMUNITY_CIRCLES } from "./community-contract.ts";
import type { CommunityAction, CommunityMembership, CommunityPost, CommunityQuery, CommunityReply, CommunityReport, CommunitySnapshot, ContentTarget, ModeratorReport } from "./community-contract.ts";

/** Small D1 surface; tests execute this same service against SQLite. */
export interface CommunityStatement {
  bind(...values: unknown[]): CommunityStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface CommunityDatabase {
  prepare(sql: string): CommunityStatement;
  batch(statements: CommunityStatement[]): Promise<{ meta: { changes?: number }; results?: unknown[] }[]>;
}
export class CommunityError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "CommunityError"; this.status = status; }
}
type Row = Record<string, string | number | null>;
type MemberRow = Row & { id: string; user_id: string; display_name: string; status: CommunityMembership["status"]; role: CommunityMembership["role"]; application: string; decision_note: string; created_at: string; updated_at: string };
type ProfileRow = Row & { display_name: string; adult_accepted: number; community_accepted: number; joined_circles: string };
type Context = { profile: ProfileRow | null; member: MemberRow | null; profileReady: boolean; joined: string[] };
type Predicate = { sql: string; args: unknown[] };
const M = "haven_community_members", P = "haven_community_posts", R = "haven_community_replies", REPORTS = "haven_community_reports", BLOCKS = "haven_community_blocks", AUDIT = "haven_community_audit";

const query = (db: CommunityDatabase, sql: string, args: unknown[] = []) => db.prepare(sql).bind(...args);
async function rows<T extends Row = Row>(db: CommunityDatabase, sql: string, args: unknown[] = []) { return (await query(db, sql, args).all<T>()).results; }
function circles(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? [...new Set(parsed.filter((v): v is string => typeof v === "string" && (COMMUNITY_CIRCLES as readonly string[]).includes(v)))] : []; } catch { return []; }
}
async function context(db: CommunityDatabase, userId: string): Promise<Context> {
  const [profile, member] = await Promise.all([
    query(db, "SELECT display_name, adult_accepted, community_accepted, joined_circles FROM haven_profiles WHERE user_id = ?", [userId]).first<ProfileRow>(),
    query(db, `SELECT * FROM ${M} WHERE user_id = ?`, [userId]).first<MemberRow>(),
  ]);
  return { profile, member, profileReady: !!profile && profile.adult_accepted === 1 && profile.community_accepted === 1, joined: profile ? circles(profile.joined_circles) : [] };
}
function membership(row: MemberRow | null): CommunityMembership | null {
  return row ? { id: row.id, status: row.status, role: row.role, application: row.application, decisionNote: row.decision_note, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
function requireProfile(state: Context) {
  if (!state.profileReady || !state.profile) throw new CommunityError(403, "Set up your chosen-name profile and community agreement first.");
  return state.profile;
}
function requireMember(state: Context) {
  requireProfile(state);
  if (!state.member || state.member.status !== "approved") throw new CommunityError(403, "Community approval is required for this action.");
  return state.member;
}
function requireModerator(state: Context) {
  const member = requireMember(state);
  if (member.role !== "moderator") throw new CommunityError(403, "Only community moderators can do this.");
  return member;
}
/** This predicate is repeated inside mutations, closing authorization TOCTOU gaps. */
function actorGate(memberId: string, circleExpression?: string, moderator = false): Predicate {
  return {
    sql: `EXISTS (SELECT 1 FROM ${M} actor JOIN haven_profiles actor_profile ON actor_profile.user_id = actor.user_id
      WHERE actor.id = ? AND actor.status = 'approved' ${moderator ? "AND actor.role = 'moderator'" : ""}
      AND actor_profile.adult_accepted = 1 AND actor_profile.community_accepted = 1
      ${circleExpression ? `AND EXISTS (SELECT 1 FROM json_each(actor_profile.joined_circles) circle WHERE circle.value = ${circleExpression})` : ""})`,
    args: [memberId],
  };
}
function unblocked(memberId: string, authorExpression: string): Predicate {
  return { sql: `NOT EXISTS (SELECT 1 FROM ${BLOCKS} blocked WHERE (blocked.blocker_id = ? AND blocked.blocked_id = ${authorExpression}) OR (blocked.blocker_id = ${authorExpression} AND blocked.blocked_id = ?))`, args: [memberId, memberId] };
}
function postVisibility(memberId: string, alias = "p"): Predicate {
  const gate = actorGate(memberId, `${alias}.circle_id`), block = unblocked(memberId, `${alias}.member_id`);
  return { sql: `${alias}.state = 'visible' AND EXISTS (SELECT 1 FROM ${M} author WHERE author.id = ${alias}.member_id AND author.status = 'approved') AND ${gate.sql} AND ${block.sql}`, args: [...gate.args, ...block.args] };
}
function replyVisibility(memberId: string, alias = "r", postAlias = "p"): Predicate {
  const parent = postVisibility(memberId, postAlias), block = unblocked(memberId, `${alias}.member_id`);
  return { sql: `${parent.sql} AND ${alias}.state = 'visible' AND EXISTS (SELECT 1 FROM ${M} reply_author WHERE reply_author.id = ${alias}.member_id AND reply_author.status = 'approved') AND ${block.sql}`, args: [...parent.args, ...block.args] };
}
function cursorParts(cursor?: string) { return cursor?.split("|") ?? []; }
function cursor(row: Row) { return `${row.created_at}|${row.id}`; }
const display = (row: Row, key = "author_name") => String(row[key] || "Community member");
function postDto(row: Row, memberId: string, replyCount = 0): CommunityPost {
  return { id: String(row.id), circleId: String(row.circle_id), body: String(row.body), responsePreference: String(row.response_preference), quiet: row.quiet === 1, author: row.quiet === 1 ? "A quiet voice" : display(row), own: row.member_id === memberId, createdAt: String(row.created_at), replyCount };
}
function replyDto(row: Row, memberId: string): CommunityReply {
  return { id: String(row.id), postId: String(row.post_id), body: String(row.body), author: row.post_quiet === 1 && row.member_id === row.post_author_id ? "A quiet voice" : display(row), own: row.member_id === memberId, createdAt: String(row.created_at) };
}
function reportDto(row: Row): CommunityReport {
  return { id: String(row.id), targetType: row.target_type as ContentTarget, targetId: String(row.target_id), reason: String(row.reason), details: String(row.details), status: row.status as CommunityReport["status"], resolution: String(row.resolution), createdAt: String(row.created_at), reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null };
}

async function feed(db: CommunityDatabase, memberId: string, options: CommunityQuery) {
  const limit = Math.min(50, Math.max(1, options.limit || 30));
  const visibility = postVisibility(memberId);
  let where = visibility.sql, args = visibility.args;
  if (options.circle) { where += " AND p.circle_id = ?"; args = [...args, options.circle]; }
  if (options.post) { where += " AND p.id = ?"; args = [...args, options.post]; }
  else if (options.cursor) { const [date, id] = cursorParts(options.cursor); where += " AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))"; args = [...args, date, date, id]; }
  const found = await rows(db, `SELECT p.*, COALESCE(profile.display_name, author.display_name) author_name FROM ${P} p JOIN ${M} author ON author.id = p.member_id LEFT JOIN haven_profiles profile ON profile.user_id = author.user_id WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`, [...args, options.post ? 1 : limit + 1]);
  if (options.post && !found.length) throw new CommunityError(404, "This community discussion is not available to you.");
  const hasMore = !options.post && found.length > limit, postRows = hasMore ? found.slice(0, limit) : found;
  if (!postRows.length) return { posts: [], replies: [], nextCursor: null, nextReplyCursor: null };
  const rv = replyVisibility(memberId);
  const placeholders = postRows.map(() => "?").join(",");
  const common = `SELECT r.*, p.quiet post_quiet, p.member_id post_author_id, COALESCE(profile.display_name, author.display_name) author_name,
    COUNT(*) OVER (PARTITION BY r.post_id) total_replies,
    ROW_NUMBER() OVER (PARTITION BY r.post_id ORDER BY r.created_at DESC, r.id DESC) row_number
    FROM ${R} r JOIN ${P} p ON p.id = r.post_id JOIN ${M} author ON author.id = r.member_id
    LEFT JOIN haven_profiles profile ON profile.user_id = author.user_id
    WHERE p.id IN (${placeholders}) AND ${rv.sql}`;
  const replyArgs: unknown[] = [...postRows.map(row => row.id), ...rv.args];
  let replySql = `SELECT * FROM (${common}) visible_replies WHERE row_number <= 20 ORDER BY created_at DESC, id DESC`;
  if (options.post) {
    replySql = `SELECT * FROM (${common}) visible_replies`;
    if (options.replyCursor) { const [date, id] = cursorParts(options.replyCursor); replySql += " WHERE (created_at < ? OR (created_at = ? AND id < ?))"; replyArgs.push(date, date, id); }
    replySql += " ORDER BY created_at DESC, id DESC LIMIT ?"; replyArgs.push(limit + 1);
  }
  const foundReplies = await rows(db, replySql, replyArgs);
  const moreReplies = !!options.post && foundReplies.length > limit, replyRows = moreReplies ? foundReplies.slice(0, limit) : foundReplies;
  const counts = new Map(replyRows.map(row => [String(row.post_id), Number(row.total_replies)]));
  // Preserve a correct total on an empty final reply page.
  if (options.post && !replyRows.length) {
    const total = await query(db, `SELECT COUNT(*) count FROM ${R} r JOIN ${P} p ON p.id = r.post_id WHERE p.id = ? AND ${rv.sql}`, [options.post, ...rv.args]).first<Row>();
    counts.set(options.post, Number(total?.count || 0));
  }
  return { posts: postRows.map(row => postDto(row, memberId, counts.get(String(row.id)) || 0)), replies: replyRows.map(row => replyDto(row, memberId)).reverse(), nextCursor: hasMore ? cursor(postRows[postRows.length - 1]) : null, nextReplyCursor: moreReplies ? cursor(replyRows[replyRows.length - 1]) : null };
}

async function moderationQueue(db: CommunityDatabase, memberId: string): Promise<NonNullable<CommunitySnapshot["moderation"]>> {
  const gate = actorGate(memberId, undefined, true);
  const [members, reports, audit, hidden] = await Promise.all([
    rows<MemberRow>(db, `SELECT m.*, COALESCE(p.display_name,m.display_name) chosen_name FROM ${M} m LEFT JOIN haven_profiles p ON p.user_id=m.user_id WHERE ${gate.sql} ORDER BY CASE WHEN m.status='pending' THEN 0 ELSE 1 END,m.updated_at DESC,m.id DESC LIMIT 100`, gate.args),
    rows(db, `SELECT reports.*, reporter.display_name reporter_name, target_author.display_name target_author_name,
      CASE WHEN reports.target_type='post' THEN (SELECT state FROM ${P} WHERE id=reports.target_id) ELSE (SELECT state FROM ${R} WHERE id=reports.target_id) END target_state
      FROM ${REPORTS} reports JOIN ${M} reporter ON reporter.id=reports.reporter_id JOIN ${M} target_author ON target_author.id=reports.target_author_id
      WHERE ${gate.sql} ORDER BY CASE WHEN reports.status='open' THEN 0 ELSE 1 END,reports.created_at DESC,reports.id DESC LIMIT 100`, gate.args),
    rows(db, `SELECT audit.*, actor.display_name actor_name FROM ${AUDIT} audit JOIN ${M} actor ON actor.id=audit.actor_id WHERE ${gate.sql} ORDER BY audit.created_at DESC,audit.id DESC LIMIT 100`, gate.args),
    rows(db, `SELECT content.*,author.display_name author_name FROM (
      SELECT p.id,'post' target_type,p.body,p.member_id,p.created_at,p.updated_at,p.id post_id,p.circle_id,p.quiet,p.state FROM ${P} p WHERE p.state='hidden'
      UNION ALL SELECT r.id,'reply' target_type,r.body,r.member_id,r.created_at,r.updated_at,r.post_id,p.circle_id,CASE WHEN p.quiet=1 AND p.member_id=r.member_id THEN 1 ELSE 0 END quiet,r.state FROM ${R} r JOIN ${P} p ON p.id=r.post_id WHERE r.state='hidden' AND p.state<>'deleted'
      ) content JOIN ${M} author ON author.id=content.member_id WHERE ${gate.sql} ORDER BY content.updated_at DESC,content.id DESC LIMIT 100`, gate.args),
  ]);
  return {
    members: members.map(row => ({ ...membership(row)!, displayName: String(row.chosen_name) })),
    reports: reports.map((row): ModeratorReport => ({ ...reportDto(row), reporter: String(row.reporter_name), reporterMemberId: String(row.reporter_id), target: { body: String(row.target_body), state: String(row.target_state || "deleted"), author: String(row.target_author_name), authorMemberId: String(row.target_author_id), postId: String(row.target_post_id), circleId: String(row.target_circle_id), quiet: row.target_quiet === 1 } })),
    audit: audit.map(row => ({ id: String(row.id), actor: String(row.actor_name), action: String(row.action), targetType: String(row.target_type), targetId: String(row.target_id), reason: String(row.reason), createdAt: String(row.created_at) })),
    hiddenContent: hidden.map(row => ({ id: String(row.id), targetType: row.target_type as ContentTarget, body: String(row.body), author: String(row.author_name), authorMemberId: String(row.member_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at), postId: String(row.post_id), circleId: String(row.circle_id), quiet: row.quiet === 1, state: "hidden" })),
  };
}

export async function getCommunitySnapshot(db: CommunityDatabase, userId: string, options: CommunityQuery = {}): Promise<CommunitySnapshot> {
  const state = await context(db, userId);
  const result: CommunitySnapshot = { profileReady: state.profileReady, membership: membership(state.member), joinedCircles: state.joined, posts: [], replies: [], reports: [], blocks: [], ownContent: [], nextCursor: null, nextReplyCursor: null, moderation: null };
  if (!state.member) return result;
  const member = state.member;
  const [reports, blocks, ownContent] = await Promise.all([
    rows(db, `SELECT id,target_type,target_id,reason,details,status,resolution,created_at,reviewed_at FROM ${REPORTS} WHERE reporter_id = ? ORDER BY created_at DESC,id DESC LIMIT 100`, [member.id]),
    rows(db, `SELECT id,label,created_at FROM ${BLOCKS} WHERE blocker_id = ? ORDER BY created_at DESC,id DESC LIMIT 200`, [member.id]),
    rows(db, `SELECT id,target_type,body,state,created_at FROM (
      SELECT id,'post' target_type,body,state,created_at FROM ${P} WHERE member_id=? AND state<>'deleted'
      UNION ALL SELECT id,'reply' target_type,body,state,created_at FROM ${R} WHERE member_id=? AND state<>'deleted'
      ) own_content ORDER BY created_at DESC,id DESC LIMIT 100`, [member.id, member.id]),
  ]);
  result.reports = reports.map(reportDto);
  result.blocks = blocks.map(row => ({ id: String(row.id), label: String(row.label), createdAt: String(row.created_at) }));
  result.ownContent = ownContent.map(row => ({ id: String(row.id), targetType: row.target_type as ContentTarget, body: String(row.body), state: row.state as "visible" | "hidden", createdAt: String(row.created_at) }));
  if (!state.profileReady || member.status !== "approved") return result;
  Object.assign(result, await feed(db, member.id, options));
  if (member.role === "moderator") result.moderation = await moderationQueue(db, member.id);
  return result;
}

async function rateLimit(db: CommunityDatabase, identity: string, action: string, limit: number, now: Date) {
  const hour = now.toISOString().slice(0, 13), key = `${identity}:${action}:${hour}`;
  const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const results = await db.batch([
    query(db, "DELETE FROM haven_community_rate_limits WHERE id IN (SELECT id FROM haven_community_rate_limits WHERE expires_at < ? LIMIT 100)", [now.toISOString()]),
    query(db, "INSERT INTO haven_community_rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count < ?", [key, expires, limit]),
  ]);
  if (!results[1]?.meta.changes) throw new CommunityError(429, "You have reached the hourly limit for this action. Please take a pause and try again later.");
}
type TargetRow = Row & { id: string; member_id: string; body: string; circle_id: string; post_id: string; quiet: number; state: string };
async function visibleTarget(db: CommunityDatabase, memberId: string, type: ContentTarget, id: string): Promise<TargetRow> {
  const predicate = type === "post" ? postVisibility(memberId) : replyVisibility(memberId);
  const sql = type === "post"
    ? `SELECT p.*,p.id post_id,COALESCE(profile.display_name,author.display_name) author_name FROM ${P} p JOIN ${M} author ON author.id=p.member_id LEFT JOIN haven_profiles profile ON profile.user_id=author.user_id WHERE p.id=? AND ${predicate.sql}`
    : `SELECT r.*,p.circle_id,p.quiet,p.member_id post_author_id,COALESCE(profile.display_name,author.display_name) author_name FROM ${R} r JOIN ${P} p ON p.id=r.post_id JOIN ${M} author ON author.id=r.member_id LEFT JOIN haven_profiles profile ON profile.user_id=author.user_id WHERE r.id=? AND ${predicate.sql}`;
  const target = await query(db, sql, [id, ...predicate.args]).first<TargetRow>();
  if (!target) throw new CommunityError(404, "This community content is not available to you.");
  return target;
}
function targetSelect(memberId: string, type: ContentTarget, id: string): Predicate {
  const predicate = type === "post" ? postVisibility(memberId) : replyVisibility(memberId);
  return type === "post"
    ? { sql: `EXISTS (SELECT 1 FROM ${P} p WHERE p.id=? AND ${predicate.sql})`, args: [id, ...predicate.args] }
    : { sql: `EXISTS (SELECT 1 FROM ${R} r JOIN ${P} p ON p.id=r.post_id WHERE r.id=? AND ${predicate.sql})`, args: [id, ...predicate.args] };
}
function changed(result: { meta: { changes?: number } }, message = "This action is no longer available. Refresh your community and try again.") {
  if (!result.meta.changes) throw new CommunityError(409, message);
}

export async function runCommunityAction(db: CommunityDatabase, userId: string, input: CommunityAction): Promise<CommunitySnapshot> {
  const state = await context(db, userId), nowDate = new Date(), now = nowDate.toISOString();
  if (input.action === "apply") {
    requireProfile(state);
    if (input.consent !== true) throw new CommunityError(400, "Confirm the community agreement before applying.");
    if (state.member && state.member.status !== "pending") throw new CommunityError(409, "Your application already has a decision. A moderator must review any change to your membership.");
    await rateLimit(db, userId, "apply", 5, nowDate);
    const result = await query(db, `INSERT INTO ${M}(id,user_id,display_name,status,role,application,decision_note,created_at,updated_at)
      SELECT ?,user_id,display_name,'pending','member',?,'',?,? FROM haven_profiles WHERE user_id=? AND adult_accepted=1 AND community_accepted=1
      ON CONFLICT(user_id) DO UPDATE SET application=excluded.application,display_name=excluded.display_name,updated_at=excluded.updated_at WHERE status='pending'`, [crypto.randomUUID(), input.application, now, now, userId]).run();
    changed(result);
    return getCommunitySnapshot(db, userId);
  }
  // Authors can remove their own content even after suspension or leaving a circle.
  // This never removes reports/evidence, and never exposes another author's text.
  if (input.action === "delete-post" || input.action === "delete-reply") {
    if (!state.member) throw new CommunityError(403, "No community membership was found.");
    const member = state.member, isPost = input.action === "delete-post", table = isPost ? P : R;
    const target = await query(db, `SELECT id FROM ${table} WHERE id=? AND member_id=? AND state<>'deleted'`, [input.id, member.id]).first<Row>();
    if (!target) throw new CommunityError(404, "This is not an available post or reply of yours.");
    const statements = [query(db, `UPDATE ${table} SET state='deleted',body='',updated_at=? WHERE id=? AND member_id=? AND state<>'deleted'`, [now, input.id, member.id])];
    if (isPost) statements.push(query(db, `UPDATE ${R} SET state='deleted',body='',updated_at=? WHERE post_id=? AND EXISTS(SELECT 1 FROM ${P} p WHERE p.id=? AND p.member_id=? AND p.state='deleted')`, [now, input.id, input.id, member.id]));
    const result = await db.batch(statements); changed(result[0]);
    return getCommunitySnapshot(db, userId);
  }
  const member = requireMember(state);
  switch (input.action) {
    case "post": {
      if (input.shareConsent !== true) throw new CommunityError(400, "Confirm that this post will be shared with approved circle members.");
      if (!state.joined.includes(input.circleId)) throw new CommunityError(403, "Join this circle before posting to its community.");
      await rateLimit(db, member.id, "post", 20, nowDate);
      const gate = actorGate(member.id, "?");
      const result = await query(db, `INSERT INTO ${P}(id,member_id,circle_id,body,response_preference,quiet,state,created_at,updated_at)
        SELECT ?,?,?,?,?,?,'visible',?,? WHERE ${gate.sql} AND (SELECT COUNT(*) FROM ${P} WHERE member_id=? AND state<>'deleted') < 500`,
      [crypto.randomUUID(), member.id, input.circleId, input.body, input.responsePreference, input.quiet ? 1 : 0, now, now, ...gate.args, input.circleId, member.id]).run();
      changed(result, "You cannot share this post now. Check your membership, circle choice, and active-post limit (500).");
      break;
    }
    case "reply": {
      if (input.shareConsent !== true) throw new CommunityError(400, "Confirm that your reply will be shared with approved circle members.");
      const post = await visibleTarget(db, member.id, "post", input.postId);
      if (post.response_preference === "no-replies") throw new CommunityError(403, "The author has asked for no replies on this post.");
      await rateLimit(db, member.id, "reply", 60, nowDate);
      const visibility = postVisibility(member.id);
      const result = await query(db, `INSERT INTO ${R}(id,post_id,member_id,body,state,created_at,updated_at)
        SELECT ?,p.id,?,?,'visible',?,? FROM ${P} p WHERE p.id=? AND p.response_preference<>'no-replies' AND ${visibility.sql}
        AND (SELECT COUNT(*) FROM ${R} WHERE member_id=? AND state<>'deleted') < 5000`,
      [crypto.randomUUID(), member.id, input.body, now, now, input.postId, ...visibility.args, member.id]).run();
      changed(result);
      break;
    }
    case "report": {
      const target = await visibleTarget(db, member.id, input.targetType, input.targetId);
      if (target.member_id === member.id) throw new CommunityError(400, "You can delete your own content directly.");
      await rateLimit(db, member.id, "report", 15, nowDate);
      const visibility = targetSelect(member.id, input.targetType, input.targetId);
      const quiet = target.quiet === 1 && (input.targetType === "post" || target.member_id === target.post_author_id);
      const result = await query(db, `INSERT INTO ${REPORTS}(id,reporter_id,target_type,target_id,target_body,target_author_id,target_post_id,target_circle_id,target_quiet,reason,details,status,resolution,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,'open','',? WHERE ${visibility.sql}
        AND NOT EXISTS(SELECT 1 FROM ${REPORTS} WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open')
        AND (SELECT COUNT(*) FROM ${REPORTS} WHERE reporter_id=? AND status='open')<100`,
      [crypto.randomUUID(), member.id, input.targetType, input.targetId, target.body, target.member_id, target.post_id, target.circle_id, quiet ? 1 : 0, input.reason, input.details, now, ...visibility.args, member.id, input.targetType, input.targetId, member.id]).run();
      changed(result, "This report could not be added. It may already be open, the content may be unavailable, or your open-report limit was reached.");
      break;
    }
    case "block": {
      const target = await visibleTarget(db, member.id, input.targetType, input.targetId);
      if (target.member_id === member.id) throw new CommunityError(400, "You cannot block yourself.");
      await rateLimit(db, member.id, "block", 30, nowDate);
      const visibility = targetSelect(member.id, input.targetType, input.targetId);
      // A generic label prevents correlating a quiet post with a named identity.
      const result = await query(db, `INSERT INTO ${BLOCKS}(id,blocker_id,blocked_id,label,created_at)
        SELECT ?,?,?,'Blocked community member',? WHERE ${visibility.sql} AND (SELECT COUNT(*) FROM ${BLOCKS} WHERE blocker_id=?)<200 ON CONFLICT(blocker_id,blocked_id) DO NOTHING`,
      [crypto.randomUUID(), member.id, target.member_id, now, ...visibility.args, member.id]).run();
      changed(result);
      break;
    }
    case "unblock": {
      const gate = actorGate(member.id);
      const result = await query(db, `DELETE FROM ${BLOCKS} WHERE id=? AND blocker_id=? AND ${gate.sql}`, [input.id, member.id, ...gate.args]).run();
      if (!result.meta.changes) throw new CommunityError(404, "This block is not available in your account.");
      break;
    }
    case "review-member": {
      requireModerator(state);
      if (input.memberId === member.id) throw new CommunityError(403, "Moderators cannot change their own membership.");
      const target = await query(db, `SELECT * FROM ${M} WHERE id=?`, [input.memberId]).first<MemberRow>();
      if (!target) throw new CommunityError(404, "This membership was not found.");
      if (target.role === "moderator") throw new CommunityError(403, "Moderator accounts must be managed by the site operator.");
      const valid = (target.status === "pending" && ["approved", "declined"].includes(input.status)) || (["declined", "suspended"].includes(target.status) && input.status === "approved") || (target.status === "approved" && input.status === "suspended");
      if (!valid) throw new CommunityError(409, "That membership decision does not apply to the current status.");
      await rateLimit(db, member.id, "moderate", 100, nowDate);
      const gate = actorGate(member.id, undefined, true), condition = `id=? AND role='member' AND status=? AND ${gate.sql}`;
      const conditionArgs = [target.id, target.status, ...gate.args];
      const results = await db.batch([
        query(db, `INSERT INTO ${AUDIT}(id,actor_id,action,target_type,target_id,reason,created_at) SELECT ?,?,?,'member',?,?,? WHERE EXISTS(SELECT 1 FROM ${M} WHERE ${condition})`, [crypto.randomUUID(), member.id, `member-${input.status}`, target.id, input.reason, now, ...conditionArgs]),
        query(db, `UPDATE ${M} SET status=?,decision_note=?,updated_at=? WHERE ${condition}`, [input.status, input.reason, now, ...conditionArgs]),
      ]);
      changed(results[1]);
      break;
    }
    case "moderate-content": {
      requireModerator(state);
      const table = input.targetType === "post" ? P : R;
      const target = await query(db, `SELECT id,state FROM ${table} WHERE id=?`, [input.targetId]).first<Row>();
      if (!target || target.state === "deleted") throw new CommunityError(404, "This content is deleted or unavailable.");
      const newState = input.decision === "hide" ? "hidden" : "visible";
      if (target.state === newState) throw new CommunityError(409, "This content already has that moderation state.");
      await rateLimit(db, member.id, "moderate", 100, nowDate);
      const gate = actorGate(member.id, undefined, true), condition = `id=? AND state=? AND ${gate.sql}`;
      const conditionArgs = [input.targetId, target.state, ...gate.args];
      const results = await db.batch([
        query(db, `INSERT INTO ${AUDIT}(id,actor_id,action,target_type,target_id,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE ${condition})`, [crypto.randomUUID(), member.id, input.decision, input.targetType, input.targetId, input.reason, now, ...conditionArgs]),
        query(db, `UPDATE ${table} SET state=?,updated_at=? WHERE ${condition}`, [newState, now, ...conditionArgs]),
      ]);
      changed(results[1]);
      break;
    }
    case "resolve-report": {
      requireModerator(state);
      const target = await query(db, `SELECT id FROM ${REPORTS} WHERE id=? AND status='open'`, [input.id]).first<Row>();
      if (!target) throw new CommunityError(404, "This report is no longer open.");
      await rateLimit(db, member.id, "moderate", 100, nowDate);
      const gate = actorGate(member.id, undefined, true), condition = `id=? AND status='open' AND ${gate.sql}`;
      const results = await db.batch([
        query(db, `INSERT INTO ${AUDIT}(id,actor_id,action,target_type,target_id,reason,created_at) SELECT ?,?,?,'report',?,?,? WHERE EXISTS(SELECT 1 FROM ${REPORTS} WHERE ${condition})`, [crypto.randomUUID(), member.id, `report-${input.decision}`, input.id, input.reason, now, input.id, ...gate.args]),
        query(db, `UPDATE ${REPORTS} SET status=?,resolution=?,reviewed_at=? WHERE ${condition}`, [input.decision, input.reason, now, input.id, ...gate.args]),
      ]);
      changed(results[1]);
      break;
    }
  }
  // Snapshot deliberately includes no stale cached member authorization.
  return getCommunitySnapshot(db, userId);
}
