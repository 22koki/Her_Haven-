import test from "node:test";
import assert from "node:assert/strict";
import {
  CommunityInputError, parseCommunityAction, parseCommunityQuery,
} from "../lib/community-validation.ts";

const sharedPost = {
  action: "post", circleId: "everyday", body: "A new thought for this circle.",
  responsePreference: "listen", quiet: false, shareConsent: true,
};

test("community application and every shared write require literal consent", () => {
  const cases = [
    [{ action: "apply", application: "I would like a supportive community.", consent: true }, "consent"],
    [sharedPost, "shareConsent"],
    [{ action: "reply", postId: "post-one", body: "I hear you.", shareConsent: true }, "shareConsent"],
  ];
  for (const [action, key] of cases) {
    assert.equal(parseCommunityAction(action)[key], true);
    for (const value of [false, "true", 1, null, undefined]) {
      assert.throws(() => parseCommunityAction({ ...action, [key]: value }), CommunityInputError);
    }
  }
});

test("clients cannot select identity, role, moderation state or hidden attribution", () => {
  for (const forbidden of [
    { userId: "another-account" }, { memberId: "another-member" },
    { role: "moderator" }, { status: "approved" }, { state: "visible" },
    { author: "Someone else" }, { createdAt: "2020-01-01" },
  ]) {
    assert.throws(() => parseCommunityAction({ ...sharedPost, ...forbidden }), CommunityInputError);
    assert.throws(() => parseCommunityAction({
      action: "apply", application: "Please consider my application.", consent: true, ...forbidden,
    }), CommunityInputError);
  }
  assert.throws(() => parseCommunityAction({
    action: "review-member", memberId: "member-one", status: "approved",
    reason: "Reviewed the membership agreement.", role: "moderator",
  }), CommunityInputError);
});

test("member and content decisions require bounded explanatory notes", () => {
  for (const action of [
    { action: "review-member", memberId: "member-one", status: "approved" },
    { action: "moderate-content", targetType: "post", targetId: "post-one", decision: "hide" },
    { action: "resolve-report", id: "report-one", decision: "actioned" },
  ]) {
    for (const reason of [undefined, "", "  ", "a".repeat(1001)]) {
      assert.throws(() => parseCommunityAction({ ...action, reason }), CommunityInputError);
    }
    assert.equal(parseCommunityAction({ ...action, reason: "  Explained decision.  " }).reason, "Explained decision.");
  }
});

test("community circles and decisions are allowlisted and quiet posting is a boolean", () => {
  assert.throws(() => parseCommunityAction({ ...sharedPost, circleId: "secret" }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ ...sharedPost, responsePreference: "unlimited" }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ ...sharedPost, quiet: "true" }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ action: "review-member", memberId: "one", status: "moderator", reason: "Invalid elevation" }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ action: "report", targetType: "profile", targetId: "one", reason: "privacy" }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ action: "report", targetType: "post", targetId: "one", reason: "unknown" }), CommunityInputError);
  assert.equal(parseCommunityAction({ ...sharedPost, quiet: true }).quiet, true);
});

test("untrusted prose remains literal text and invalid controls or excess data fail", () => {
  const literal = '<img src=x onerror="alert(1)">';
  assert.equal(parseCommunityAction({ ...sharedPost, body: literal }).body, literal);
  assert.equal(parseCommunityAction({ ...sharedPost, body: "First\r\nSecond" }).body, "First\nSecond");
  for (const body of ["  ", "a".repeat(4001), "Hello\u0000world", 123]) {
    assert.throws(() => parseCommunityAction({ ...sharedPost, body }), CommunityInputError);
  }
  assert.throws(() => parseCommunityAction({ action: "reply", postId: "one", body: "a".repeat(2001), shareConsent: true }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ action: "apply", application: "a".repeat(1001), consent: true }), CommunityInputError);
  assert.throws(() => parseCommunityAction({ action: "report", targetType: "post", targetId: "one", reason: "privacy", details: "a".repeat(2001) }), CommunityInputError);
});

test("content identifiers reject traversal and SQL-shaped values before database access", () => {
  for (const targetId of ["", "../another", "one' OR 1=1--", "<script>", "a".repeat(101), null]) {
    assert.throws(() => parseCommunityAction({ action: "block", targetType: "post", targetId }), CommunityInputError);
    assert.throws(() => parseCommunityAction({ action: "delete-post", id: targetId }), CommunityInputError);
  }
});

test("feed queries bound pagination and reject duplicate or unknown selectors", () => {
  assert.deepEqual(parseCommunityQuery(new URLSearchParams()), {});
  assert.deepEqual(parseCommunityQuery(new URLSearchParams("circle=everyday&limit=50")), { circle: "everyday", limit: 50 });
  for (const query of [
    "limit=0", "limit=51", "limit=-1", "limit=1.5", "limit=no", "limit=",
    "limit=1&limit=2", "circle=secret", "userId=someone", "moderator=true",
    "post=../other", "cursor=invalid", "replyCursor=invalid", "circle=everyday&circle=growth",
  ]) assert.throws(() => parseCommunityQuery(new URLSearchParams(query)), CommunityInputError, query);
  const cursor = "2026-11-03T08:00:00.000Z|post-one";
  assert.equal(parseCommunityQuery(new URLSearchParams({ cursor })).cursor, cursor);
});
