import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase, addProfile, setCircles } from "./community-fixture.mjs";
import { getCommunitySnapshot, runCommunityAction } from "../lib/community-service.ts";
import { parseCommunityAction } from "../lib/community-validation.ts";

const action = (db, userId, input) => runCommunityAction(db, userId, parseCommunityAction(input));
const snapshot = (db, userId, query = {}) => getCommunitySnapshot(db, userId, query);

function database(t, options) {
  const db = createDatabase(options);
  t.after(() => db.close());
  return db;
}

async function apply(db, userId, options = {}) {
  addProfile(db, userId, options);
  const result = await action(db, userId, {
    action: "apply", application: "I agree to listen with care and respect other members' boundaries.", consent: true,
  });
  assert.equal(result.membership.status, "pending");
  assert.equal(result.membership.role, "member");
  return result.membership.id;
}

async function moderator(db) {
  const id = await apply(db, "auth-moderator", { name: "Circle moderator", circles: ["everyday", "friendship", "growth"] });
  // The test fixture stands in for the owner-only administration CLI.
  // No HTTP/API action can grant a moderator role.
  db.sqlite.prepare("UPDATE haven_community_members SET role = 'moderator', status = 'approved' WHERE id = ?").run(id);
  return id;
}

async function approve(db, userId, options = {}) {
  const memberId = await apply(db, userId, options);
  await action(db, "auth-moderator", {
    action: "review-member", memberId, status: "approved", reason: "Reviewed the community application and agreement.",
  });
  return memberId;
}

async function post(db, userId, body, options = {}) {
  const result = await action(db, userId, {
    action: "post", circleId: "everyday", body, responsePreference: "listen",
    quiet: false, shareConsent: true, ...options,
  });
  const created = result.posts.find((item) => item.body === body);
  assert.ok(created, "Successful shared post is returned to its author");
  return created;
}

async function reply(db, userId, postId, body) {
  await action(db, userId, { action: "reply", postId, body, shareConsent: true });
  const thread = await snapshot(db, userId, { post: postId });
  const created = thread.replies.find((item) => item.body === body);
  assert.ok(created, "Successful reply is returned in the readable thread");
  return created;
}

async function denied(promise, allowed = [403, 404]) {
  await assert.rejects(promise, (error) => {
    assert.ok(allowed.includes(error.status), `Expected ${allowed.join("/")}, received ${error.status}: ${error.message}`);
    return true;
  });
}

async function hiddenThread(db, userId, postId) {
  try {
    const result = await snapshot(db, userId, { post: postId });
    assert.equal(result.posts.some((item) => item.id === postId), false);
    assert.equal(result.replies.some((item) => item.postId === postId), false);
  } catch (error) {
    assert.ok([403, 404].includes(error.status), error.message);
  }
}

test("additive migration is repeatable and never publishes private alpha data", async (t) => {
  const db = database(t, { community: false });
  addProfile(db, "private-owner", { name: "Private owner" });
  db.sqlite.prepare(`INSERT INTO haven_posts
    (id,user_id,circle_id,body,response_preference,hide_profile,created_at)
    VALUES ('private-one','private-owner','everyday','Never publish this private thought.','listen',0,?)`)
    .run(new Date().toISOString());
  db.sqlite.prepare(`INSERT INTO haven_replies (id,user_id,post_id,body,created_at)
    VALUES ('private-reply','private-owner','private-one','Private practice reply.',?)`)
    .run(new Date().toISOString());
  const migration = readFileSync(new URL("../drizzle/0001_community.sql", import.meta.url), "utf8");
  db.sqlite.exec(migration);
  db.sqlite.exec(migration);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_posts").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_replies").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_posts").get().count, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_members").get().count, 0);
  const result = await snapshot(db, "private-owner");
  assert.equal(result.membership, null);
  assert.equal(result.posts.length, 0);
  assert.equal(result.moderation, null);
  assert.equal(JSON.stringify(result).includes("Never publish this private thought."), false);
});

test("profile agreements and membership approval gate every shared action", async (t) => {
  const db = database(t);
  const absent = await snapshot(db, "no-profile");
  assert.equal(absent.profileReady, false);
  assert.equal(absent.posts.length, 0);
  await denied(action(db, "no-profile", { action: "apply", application: "I would like to join.", consent: true }));
  addProfile(db, "incomplete", { adultAccepted: false });
  await denied(action(db, "incomplete", { action: "apply", application: "I would like to join.", consent: true }));
  await moderator(db);
  await approve(db, "author", { name: "Fern" });
  const thought = await post(db, "author", "An approved member's shared post.");
  const pendingId = await apply(db, "pending", { name: "Waiting member" });
  const waiting = await snapshot(db, "pending", { post: thought.id });
  assert.equal(waiting.membership.status, "pending");
  assert.deepEqual(waiting.posts, []);
  assert.deepEqual(waiting.replies, []);
  assert.equal(waiting.moderation, null);
  for (const input of [
    { action: "post", circleId: "everyday", body: "Not approved.", responsePreference: "listen", quiet: false, shareConsent: true },
    { action: "reply", postId: thought.id, body: "Not approved.", shareConsent: true },
    { action: "report", targetType: "post", targetId: thought.id, reason: "privacy", details: "" },
    { action: "block", targetType: "post", targetId: thought.id },
    { action: "review-member", memberId: pendingId, status: "approved", reason: "Self approval is forbidden." },
  ]) await denied(action(db, "pending", input));
  await action(db, "auth-moderator", { action: "review-member", memberId: pendingId, status: "declined", reason: "Application needs further review." });
  assert.equal((await snapshot(db, "pending")).membership.status, "declined");
  assert.equal((await snapshot(db, "pending")).posts.length, 0);
});

test("joined-circle boundaries and historical private ids are enforced server-side", async (t) => {
  const db = database(t);
  await moderator(db);
  await approve(db, "author", { name: "Fern", circles: ["everyday", "growth"] });
  await approve(db, "reader", { name: "Rose", circles: ["everyday"] });
  const thought = await post(db, "author", "Growth circle only.", { circleId: "growth" });
  assert.equal((await snapshot(db, "reader")).posts.some((item) => item.id === thought.id), false);
  await hiddenThread(db, "reader", thought.id);
  for (const input of [
    { action: "reply", postId: thought.id, body: "Cross-circle reply.", shareConsent: true },
    { action: "report", targetType: "post", targetId: thought.id, reason: "privacy", details: "" },
    { action: "post", circleId: "growth", body: "Not joined.", responsePreference: "listen", quiet: false, shareConsent: true },
    { action: "reply", postId: "demo-small-step", body: "Sample is not a shared thread.", shareConsent: true },
    { action: "report", targetType: "post", targetId: "private-one", reason: "privacy", details: "" },
  ]) await denied(action(db, "reader", input));
  setCircles(db, "reader", ["everyday", "growth"]);
  assert.ok((await snapshot(db, "reader")).posts.some((item) => item.id === thought.id));
  setCircles(db, "reader", ["everyday"]);
  await hiddenThread(db, "reader", thought.id);
});

test("quiet posting conceals identity, including original-author replies", async (t) => {
  const db = database(t);
  await moderator(db);
  const authorId = await approve(db, "auth-secret-owner", { name: "Distinctive private chosen name" });
  await approve(db, "reader", { name: "Rose" });
  const thought = await post(db, "auth-secret-owner", "A thought shared with a quiet name.", { quiet: true });
  await reply(db, "auth-secret-owner", thought.id, "A follow-up from the same quiet author.");
  const viewed = await snapshot(db, "reader", { post: thought.id });
  const visible = viewed.posts.find((item) => item.id === thought.id);
  assert.ok(visible);
  assert.equal(visible.author, "A quiet voice");
  assert.equal(visible.quiet, true);
  assert.equal(visible.own, false);
  assert.equal(viewed.replies[0].author, "A quiet voice");
  for (const row of [visible, ...viewed.replies]) {
    const serialized = JSON.stringify(row);
    for (const secret of ["auth-secret-owner", authorId, "Distinctive private chosen name"]) {
      assert.equal(serialized.includes(secret), false, `Quiet content leaks ${secret}`);
    }
    for (const forbidden of ["userId", "memberId", "authorId", "authorMemberId", "email"]) assert.equal(forbidden in row, false);
  }
});

test("response boundaries and author-only deletion apply to posts and replies", async (t) => {
  const db = database(t);
  await moderator(db);
  await approve(db, "author", { name: "Fern" });
  await approve(db, "reader", { name: "Rose" });
  const quiet = await post(db, "author", "This thought does not invite replies.", { responsePreference: "no-replies" });
  for (const actor of ["author", "reader", "auth-moderator"]) {
    await denied(action(db, actor, { action: "reply", postId: quiet.id, body: "Not allowed here.", shareConsent: true }));
  }
  const thought = await post(db, "author", "A conversation open to gentle replies.");
  const response = await reply(db, "reader", thought.id, "I hear you, and I am listening.");
  await denied(action(db, "reader", { action: "delete-post", id: thought.id }));
  await denied(action(db, "author", { action: "delete-reply", id: response.id }));
  await action(db, "reader", { action: "delete-reply", id: response.id });
  assert.equal((await snapshot(db, "author", { post: thought.id })).replies.some((item) => item.id === response.id), false);
  await action(db, "author", { action: "delete-post", id: thought.id });
  await hiddenThread(db, "reader", thought.id);
});

test("reports stay private and moderators retain evidence after author deletion", async (t) => {
  const db = database(t);
  await moderator(db);
  const authorId = await approve(db, "author", { name: "Fern" });
  const reporterId = await approve(db, "reporter", { name: "Rose" });
  await approve(db, "bystander", { name: "Lily" });
  const thought = await post(db, "author", "A shared post retained as reported evidence.", { quiet: true });
  const reported = await action(db, "reporter", {
    action: "report", targetType: "post", targetId: thought.id, reason: "privacy", details: "A confidential concern for moderators.",
  });
  const report = reported.reports.find((item) => item.targetId === thought.id);
  assert.ok(report);
  assert.equal(report.status, "open");
  for (const reader of ["author", "bystander"]) {
    const result = await snapshot(db, reader);
    assert.deepEqual(result.reports, []);
    assert.equal(result.moderation, null);
    assert.equal(JSON.stringify(result).includes("A confidential concern for moderators."), false);
    assert.equal(JSON.stringify(result).includes(reporterId), false);
  }
  await denied(action(db, "reporter", { action: "resolve-report", id: report.id, decision: "dismissed", reason: "Self moderation is forbidden." }));
  await denied(action(db, "author", { action: "moderate-content", targetType: "post", targetId: thought.id, decision: "hide", reason: "Unauthorized moderation." }));
  await action(db, "author", { action: "delete-post", id: thought.id });
  const review = (await snapshot(db, "auth-moderator")).moderation.reports.find((item) => item.id === report.id);
  assert.ok(review);
  assert.equal(review.target.body, "A shared post retained as reported evidence.");
  assert.equal(review.target.authorMemberId, authorId);
  assert.equal(review.reporterMemberId, reporterId);
  await action(db, "auth-moderator", { action: "resolve-report", id: report.id, decision: "actioned", reason: "Reviewed; the author removed the post." });
  const outcome = (await snapshot(db, "reporter")).reports.find((item) => item.id === report.id);
  assert.equal(outcome.status, "actioned");
  assert.equal(outcome.resolution, "Reviewed; the author removed the post.");
  assert.ok(outcome.reviewedAt);
  assert.ok((await snapshot(db, "auth-moderator")).moderation.audit.some((item) => item.targetId === report.id));
});

test("moderation hides and restores shared content without exposing its review queue", async (t) => {
  const db = database(t);
  await moderator(db);
  await approve(db, "author", { name: "Fern" });
  await approve(db, "reader", { name: "Rose" });
  const thought = await post(db, "author", "Moderation visibility test.");
  const response = await reply(db, "reader", thought.id, "A response awaiting review.");
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "reply", targetId: response.id, decision: "hide", reason: "Reviewing a reported reply." });
  let thread = await snapshot(db, "author", { post: thought.id });
  assert.equal(thread.replies.some((item) => item.id === response.id), false);
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "reply", targetId: response.id, decision: "restore", reason: "Review complete; reply restored." });
  thread = await snapshot(db, "author", { post: thought.id });
  assert.ok(thread.replies.some((item) => item.id === response.id));
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "post", targetId: thought.id, decision: "hide", reason: "Reviewing the shared thread." });
  await hiddenThread(db, "reader", thought.id);
  await denied(action(db, "reader", { action: "reply", postId: thought.id, body: "Hidden thread must reject this.", shareConsent: true }));
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "post", targetId: thought.id, decision: "restore", reason: "Review complete; thread restored." });
  assert.ok((await snapshot(db, "reader")).posts.some((item) => item.id === thought.id));
});

test("blocking is bilateral and also filters replies on a third member's thread", async (t) => {
  const db = database(t);
  await moderator(db);
  await approve(db, "author-a", { name: "Fern" });
  await approve(db, "author-b", { name: "Rose" });
  await approve(db, "author-c", { name: "Lily" });
  const aPost = await post(db, "author-a", "Fern's shared post.", { quiet: true });
  const bPost = await post(db, "author-b", "Rose's shared post.");
  const cPost = await post(db, "author-c", "A third member's conversation.");
  const aReply = await reply(db, "author-a", cPost.id, "Fern's contribution.");
  const bReply = await reply(db, "author-b", cPost.id, "Rose's contribution.");
  const blocked = await action(db, "author-b", { action: "block", targetType: "post", targetId: aPost.id });
  assert.equal(blocked.blocks.length, 1);
  assert.equal(blocked.blocks[0].label.includes("Fern"), false, "Blocking a quiet post must not reveal its author");
  assert.equal((await snapshot(db, "author-b")).posts.some((item) => item.id === aPost.id), false);
  assert.equal((await snapshot(db, "author-a")).posts.some((item) => item.id === bPost.id), false);
  for (const [userId, postId] of [["author-b", aPost.id], ["author-a", bPost.id]]) {
    await hiddenThread(db, userId, postId);
    await denied(action(db, userId, { action: "reply", postId, body: "Blocked interaction.", shareConsent: true }));
  }
  const aThread = await snapshot(db, "author-a", { post: cPost.id });
  const bThread = await snapshot(db, "author-b", { post: cPost.id });
  assert.equal(aThread.replies.some((item) => item.id === bReply.id), false);
  assert.equal(bThread.replies.some((item) => item.id === aReply.id), false);
  assert.ok((await snapshot(db, "author-c", { post: cPost.id })).replies.some((item) => item.id === aReply.id));
  await denied(action(db, "author-a", { action: "unblock", id: blocked.blocks[0].id }));
  await action(db, "author-b", { action: "unblock", id: blocked.blocks[0].id });
  assert.ok((await snapshot(db, "author-b")).posts.some((item) => item.id === aPost.id));
});

test("suspensions survive private reset and profile recreation", async (t) => {
  const db = database(t);
  await moderator(db);
  const memberId = await approve(db, "member", { name: "Fern" });
  await approve(db, "reader", { name: "Rose" });
  const thought = await post(db, "member", "A member's pre-suspension post.");
  await action(db, "auth-moderator", { action: "review-member", memberId, status: "suspended", reason: "Membership paused during a safety review." });
  let state = await snapshot(db, "member");
  assert.equal(state.membership.status, "suspended");
  assert.equal(state.posts.length, 0);
  assert.equal(state.moderation, null);
  assert.equal((await snapshot(db, "reader")).posts.some((item) => item.id === thought.id), false);
  db.sqlite.prepare("DELETE FROM haven_profiles WHERE user_id = ?").run("member");
  state = await snapshot(db, "member");
  assert.equal(state.profileReady, false);
  assert.equal(state.membership.id, memberId);
  assert.equal(state.membership.status, "suspended");
  assert.equal(state.posts.length, 0);
  addProfile(db, "member", { name: "A different chosen name" });
  await denied(action(db, "member", { action: "apply", application: "Attempt to restart membership after reset.", consent: true }), [403, 409]);
  state = await snapshot(db, "member");
  assert.equal(state.membership.id, memberId);
  assert.equal(state.membership.status, "suspended");
  await denied(action(db, "member", { action: "post", circleId: "everyday", body: "Suspension must still apply.", responsePreference: "listen", quiet: false, shareConsent: true }));
  assert.ok((await snapshot(db, "auth-moderator")).moderation.audit.some((item) => item.targetId === memberId));
});

test("moderators cannot approve themselves, mutate moderator membership or restore deleted text", async (t) => {
  const db = database(t);
  const moderatorId = await moderator(db);
  const secondId = await apply(db, "auth-second-mod", { name: "Second moderator" });
  db.sqlite.prepare("UPDATE haven_community_members SET role = 'moderator', status = 'approved' WHERE id = ?").run(secondId);
  for (const memberId of [moderatorId, secondId]) {
    await denied(action(db, "auth-moderator", { action: "review-member", memberId, status: "suspended", reason: "The API cannot change moderator access." }), [403, 409]);
  }
  await approve(db, "member", { name: "Fern" });
  const thought = await post(db, "member", "Author deletion must remain final in the feed.");
  await action(db, "member", { action: "delete-post", id: thought.id });
  await denied(action(db, "auth-moderator", { action: "moderate-content", targetType: "post", targetId: thought.id, decision: "restore", reason: "A removed post cannot be restored." }), [403, 404, 409]);
});

test("feed pagination is stable with equal timestamps and stays within joined circles", async (t) => {
  const db = database(t);
  await moderator(db);
  const authorId = await approve(db, "author", { name: "Fern", circles: ["everyday", "growth"] });
  await approve(db, "reader", { name: "Rose", circles: ["everyday"] });
  const now = "2026-11-03T08:00:00.000Z";
  const insert = db.sqlite.prepare(`INSERT INTO haven_community_posts
    (id,member_id,circle_id,body,response_preference,quiet,state,created_at,updated_at)
    VALUES (?,?,?,?,'listen',0,'visible',?,?)`);
  const expected = new Set();
  for (let index = 0; index < 7; index++) {
    const id = randomUUID();
    expected.add(id);
    insert.run(id, authorId, "everyday", `Paged conversation ${index}.`, now, now);
  }
  insert.run(randomUUID(), authorId, "growth", "This circle is not joined.", now, now);
  const seen = new Set();
  let cursor;
  for (let page = 0; page < 5; page++) {
    const result = await snapshot(db, "reader", { limit: 2, ...(cursor ? { cursor } : {}) });
    assert.ok(result.posts.length <= 2);
    for (const item of result.posts) {
      assert.equal(item.circleId, "everyday");
      assert.equal(seen.has(item.id), false, "No duplicate across pagination boundary");
      seen.add(item.id);
    }
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  assert.deepEqual(seen, expected);
});

test("concurrent shared posts obey the hourly quota and deletion does not reset it", async (t) => {
  const db = database(t);
  await moderator(db);
  await approve(db, "author", { name: "Fern" });
  await approve(db, "other-author", { name: "Rose" });
  const results = await Promise.allSettled(Array.from({ length: 21 }, (_, index) => action(db, "author", {
    action: "post", circleId: "everyday", body: `Concurrent thought ${index}.`,
    responsePreference: "listen", quiet: false, shareConsent: true,
  })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 20);
  const failures = results.filter((result) => result.status === "rejected");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.status, 429);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_posts").get().count, 20);
  const first = (await snapshot(db, "author")).posts[0];
  await action(db, "author", { action: "delete-post", id: first.id });
  await denied(action(db, "author", {
    action: "post", circleId: "everyday", body: "Deleting a post cannot reset the hourly quota.",
    responsePreference: "listen", quiet: false, shareConsent: true,
  }), [429]);
  assert.ok(await post(db, "other-author", "Another member retains their independent quota."));
});

test("concurrent inserts cannot exceed the 500 active-post account cap", async (t) => {
  const db = database(t);
  await moderator(db);
  const memberId = await approve(db, "author", { name: "Fern" });
  const now = new Date().toISOString();
  const insert = db.sqlite.prepare(`INSERT INTO haven_community_posts
    (id,member_id,circle_id,body,response_preference,quiet,state,created_at,updated_at)
    VALUES (?,?,'everyday','Existing conversation.','listen',0,'visible',?,?)`);
  for (let index = 0; index < 498; index++) insert.run(randomUUID(), memberId, now, now);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => action(db, "author", {
    action: "post", circleId: "everyday", body: `A capped conversation ${index}.`,
    responsePreference: "listen", quiet: false, shareConsent: true,
  })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  for (const result of results.filter((entry) => entry.status === "rejected")) assert.equal(result.reason.status, 409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_posts WHERE member_id = ? AND state <> 'deleted'").get(memberId).count, 500);
});

test("approval and circle changes between context read and insert fail closed", async (t) => {
  for (const kind of ["suspended", "left-circle"]) {
    const db = database(t);
    await moderator(db);
    const memberId = await approve(db, "author", { name: "Fern" });
    let scheduled = true;
    db.beforeExecute = (sql) => {
      if (!scheduled || !sql.startsWith("INSERT INTO haven_community_posts(")) return;
      scheduled = false;
      if (kind === "suspended") db.sqlite.prepare("UPDATE haven_community_members SET status = 'suspended' WHERE id = ?").run(memberId);
      else setCircles(db, "author", []);
    };
    await denied(action(db, "author", {
      action: "post", circleId: "everyday", body: "This authorization expired before the write.",
      responsePreference: "listen", quiet: false, shareConsent: true,
    }), [409]);
    assert.equal(scheduled, false, "Competing state change was exercised");
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_posts").get().count, 0);
  }
});

test("new no-replies preferences and blocks are rechecked when a reply is inserted", async (t) => {
  for (const kind of ["no-replies", "block"]) {
    const db = database(t);
    await moderator(db);
    const authorId = await approve(db, "author", { name: "Fern" });
    const readerId = await approve(db, "reader", { name: "Rose" });
    const thought = await post(db, "author", "A reply is being composed while settings change.");
    let scheduled = true;
    db.beforeExecute = (sql) => {
      if (!scheduled || !sql.startsWith("INSERT INTO haven_community_replies(")) return;
      scheduled = false;
      if (kind === "no-replies") db.sqlite.prepare("UPDATE haven_community_posts SET response_preference = 'no-replies' WHERE id = ?").run(thought.id);
      else db.sqlite.prepare(`INSERT INTO haven_community_blocks (id,blocker_id,blocked_id,label,created_at)
        VALUES (?,?,?,'Blocked community member',?)`).run(randomUUID(), authorId, readerId, new Date().toISOString());
    };
    await denied(action(db, "reader", { action: "reply", postId: thought.id, body: "The earlier check is now stale.", shareConsent: true }), [409]);
    assert.equal(scheduled, false);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM haven_community_replies").get().count, 0);
  }
});

test("concurrent membership decisions produce one decision and one audit record", async (t) => {
  const db = database(t);
  await moderator(db);
  const memberId = await apply(db, "applicant", { name: "Fern" });
  const results = await Promise.allSettled(["approved", "declined"].map((status) => action(db, "auth-moderator", {
    action: "review-member", memberId, status, reason: `The concurrent ${status} decision.`,
  })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
  const audits = db.sqlite.prepare("SELECT action FROM haven_community_audit WHERE target_id = ?").all(memberId);
  assert.equal(audits.length, 1);
  const actual = db.sqlite.prepare("SELECT status FROM haven_community_members WHERE id = ?").get(memberId).status;
  assert.equal(audits[0].action, `member-${actual}`);
});

test("own-content management stays owner-only and permits deletion after suspension or private reset", async (t) => {
  const db = database(t);
  await moderator(db);
  const authorId = await approve(db, "author", { name: "Fern" });
  await approve(db, "other", { name: "Rose" });
  await apply(db, "pending", { name: "Waiting member" });
  const ownPost = await post(db, "author", "My shared contribution remains manageable.");
  const otherPost = await post(db, "other", "Another member's contribution stays theirs.");
  const ownReply = await reply(db, "author", otherPost.id, "My contribution to the other thread.");
  const otherReply = await reply(db, "other", ownPost.id, "Another member's reply stays theirs.");
  let state = await snapshot(db, "author");
  assert.deepEqual(new Set(state.ownContent.map((row) => row.id)), new Set([ownPost.id, ownReply.id]));
  assert.equal(state.ownContent.find((row) => row.id === ownPost.id).targetType, "post");
  assert.equal(state.ownContent.find((row) => row.id === ownReply.id).targetType, "reply");
  assert.equal(JSON.stringify(state.ownContent).includes(otherPost.body), false);
  assert.equal(JSON.stringify(state.ownContent).includes(otherReply.body), false);
  assert.deepEqual((await snapshot(db, "pending")).ownContent, []);
  assert.deepEqual((await snapshot(db, "no-profile")).ownContent, []);

  await action(db, "auth-moderator", { action: "review-member", memberId: authorId, status: "suspended", reason: "Paused while a concern is reviewed." });
  state = await snapshot(db, "author");
  assert.deepEqual(state.posts, []);
  assert.deepEqual(state.replies, []);
  assert.equal(state.moderation, null);
  assert.deepEqual(new Set(state.ownContent.map((row) => row.id)), new Set([ownPost.id, ownReply.id]));
  await denied(action(db, "author", { action: "delete-post", id: otherPost.id }));
  await denied(action(db, "author", { action: "delete-reply", id: otherReply.id }));
  await action(db, "author", { action: "delete-reply", id: ownReply.id });
  assert.equal((await snapshot(db, "author")).ownContent.some((row) => row.id === ownReply.id), false);

  db.sqlite.prepare("DELETE FROM haven_profiles WHERE user_id = ?").run("author");
  state = await snapshot(db, "author");
  assert.equal(state.profileReady, false);
  assert.equal(state.membership.status, "suspended");
  assert.deepEqual(state.ownContent.map((row) => row.id), [ownPost.id]);
  await denied(action(db, "author", { action: "delete-post", id: otherPost.id }));
  await action(db, "author", { action: "delete-post", id: ownPost.id });
  state = await snapshot(db, "author");
  assert.deepEqual(state.ownContent, []);
  assert.equal(state.membership.status, "suspended", "Own deletion cannot clear a suspension");
  assert.ok((await snapshot(db, "other")).ownContent.some((row) => row.id === otherPost.id));
});

test("directly hidden content and its identity mapping are visible only to approved moderators", async (t) => {
  const db = database(t);
  const moderatorId = await moderator(db);
  const authorId = await approve(db, "author", { name: "Fern" });
  const otherId = await approve(db, "other", { name: "Rose" });
  await apply(db, "pending", { name: "Waiting member" });
  const hiddenPost = await post(db, "author", "Hidden quiet content for moderator review.", { quiet: true });
  const visiblePost = await post(db, "author", "A separate visible discussion.");
  const hiddenReply = await reply(db, "other", visiblePost.id, "Hidden reply for moderator review.");
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "post", targetId: hiddenPost.id, decision: "hide", reason: "Direct review without a report." });
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "reply", targetId: hiddenReply.id, decision: "hide", reason: "Direct reply review without a report." });
  const review = (await snapshot(db, "auth-moderator")).moderation;
  assert.deepEqual(review.reports, [], "A report is not required to manage directly hidden content");
  assert.deepEqual(new Set(review.hiddenContent.map((row) => row.id)), new Set([hiddenPost.id, hiddenReply.id]));
  assert.equal(review.hiddenContent.find((row) => row.id === hiddenPost.id).authorMemberId, authorId);
  assert.equal(review.hiddenContent.find((row) => row.id === hiddenPost.id).quiet, true);
  assert.equal(review.hiddenContent.find((row) => row.id === hiddenReply.id).authorMemberId, otherId);
  for (const userId of ["author", "other", "pending", "no-profile"]) {
    const state = await snapshot(db, userId);
    assert.equal(state.moderation, null);
    assert.equal("hiddenContent" in state, false);
    assert.equal(state.posts.some((row) => row.id === hiddenPost.id), false);
    assert.equal(state.replies.some((row) => row.id === hiddenReply.id), false);
    assert.equal(JSON.stringify(state).includes(userId === "author" ? hiddenReply.body : hiddenPost.body), false);
  }
  await denied(action(db, "author", { action: "moderate-content", targetType: "post", targetId: hiddenPost.id, decision: "restore", reason: "Own authorship grants no moderator access." }));
  await action(db, "auth-moderator", { action: "moderate-content", targetType: "post", targetId: hiddenPost.id, decision: "restore", reason: "Direct review finished; restoring the post." });
  assert.equal((await snapshot(db, "auth-moderator")).moderation.hiddenContent.some((row) => row.id === hiddenPost.id), false);

  db.sqlite.prepare("UPDATE haven_community_members SET status = 'suspended' WHERE id = ?").run(moderatorId);
  let restricted = await snapshot(db, "auth-moderator");
  assert.equal(restricted.moderation, null);
  assert.equal(JSON.stringify(restricted).includes(hiddenReply.body), false);
  db.sqlite.prepare("UPDATE haven_community_members SET status = 'approved' WHERE id = ?").run(moderatorId);
  db.sqlite.prepare("DELETE FROM haven_profiles WHERE user_id = ?").run("auth-moderator");
  restricted = await snapshot(db, "auth-moderator");
  assert.equal(restricted.profileReady, false);
  assert.equal(restricted.moderation, null);
  assert.equal(JSON.stringify(restricted).includes(hiddenReply.body), false);
});
