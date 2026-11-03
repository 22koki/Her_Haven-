import test from "node:test";
import assert from "node:assert/strict";
import {
  HavenInputError, MAX_REQUEST_BYTES, isDemoPostId, isSameOriginRequest,
  parseHavenAction, readBoundedJson, repliesAllowed,
} from "../lib/haven-validation.ts";

const validPost = { action: "post", circleId: "everyday", body: "I would like someone to listen.", responsePreference: "listen", hideProfile: false };

test("onboarding requires explicit adult and community acceptance", () => {
  for (const adultAccepted of [false, "true", 1, null, undefined]) {
    assert.throws(() => parseHavenAction({ action: "onboard", displayName: "Fern", adultAccepted, communityAccepted: true }), HavenInputError);
  }
  assert.throws(() => parseHavenAction({ action: "onboard", displayName: "Fern", adultAccepted: true, communityAccepted: false }), HavenInputError);
  assert.equal(parseHavenAction({ action: "onboard", displayName: "  Fern  ", adultAccepted: true, communityAccepted: true }).displayName, "Fern");
});

test("client-supplied ownership, privilege and unexpected fields are rejected", () => {
  for (const extra of [{ userId: "someone-else" }, { role: "admin" }, { status: "approved" }, { authorId: "other" }]) {
    assert.throws(() => parseHavenAction({ ...validPost, ...extra }), HavenInputError);
  }
  assert.throws(() => parseHavenAction({ action: "preferences", gentle: true, adultAccepted: true }), HavenInputError);
});

test("circles, response preferences and report reasons are allowlisted", () => {
  assert.throws(() => parseHavenAction({ ...validPost, circleId: "private-other-circle" }), HavenInputError);
  assert.throws(() => parseHavenAction({ ...validPost, responsePreference: "anything" }), HavenInputError);
  assert.throws(() => parseHavenAction({ action: "report", postId: "demo-one", reason: "x".repeat(500), details: "" }), HavenInputError);
  assert.equal(parseHavenAction({ action: "report", postId: "demo-one", reason: "privacy" }).details, "");
});

test("post and reply bounds reject empty and oversized values", () => {
  assert.throws(() => parseHavenAction({ ...validPost, body: " \n " }), HavenInputError);
  assert.throws(() => parseHavenAction({ ...validPost, body: "a".repeat(4001) }), HavenInputError);
  assert.equal(parseHavenAction({ ...validPost, body: "a".repeat(4000) }).body.length, 4000);
  assert.throws(() => parseHavenAction({ action: "reply", postId: "demo-one", body: "a".repeat(2001) }), HavenInputError);
});

test("text stays plain text, with unsafe control characters rejected", () => {
  const literal = '<img src=x onerror="alert(1)">';
  assert.equal(parseHavenAction({ ...validPost, body: literal }).body, literal);
  assert.throws(() => parseHavenAction({ ...validPost, body: "Hello\u0000world" }), HavenInputError);
  assert.equal(parseHavenAction({ ...validPost, body: "First\r\nSecond" }).body, "First\nSecond");
});

test("preference patches retain only supplied columns and validate arrays", () => {
  assert.deepEqual(parseHavenAction({ action: "preferences", gentle: true }), { action: "preferences", gentle: true });
  assert.deepEqual(parseHavenAction({ action: "preferences", savedIds: ["demo-one", "demo-one"] }).savedIds, ["demo-one"]);
  assert.throws(() => parseHavenAction({ action: "preferences", savedIds: Array(201).fill("demo-one") }), HavenInputError);
  assert.throws(() => parseHavenAction({ action: "preferences", joinedCircles: ["unknown"] }), HavenInputError);
  assert.throws(() => parseHavenAction({ action: "preferences", gentle: "false" }), HavenInputError);
  assert.throws(() => parseHavenAction({ action: "preferences" }), HavenInputError);
});

test("malformed IDs cannot reach queries or act as demo post IDs", () => {
  for (const postId of ["../other", "demo-<script>", "", "\u0000", "x".repeat(101)]) {
    assert.throws(() => parseHavenAction({ action: "reply", postId, body: "Hello" }), HavenInputError);
  }
  assert.equal(isDemoPostId("demo-one"), true);
  assert.equal(isDemoPostId("demo-"), false);
  assert.equal(isDemoPostId("other-demo-one"), false);
});

test("no-replies preference is enforced by the shared permission helper", () => {
  assert.equal(repliesAllowed("no-replies"), false);
  assert.equal(repliesAllowed("listen"), true);
});

test("CSRF checks reject foreign, missing, opaque and malformed origins", () => {
  const url = "https://haven.example/api/haven";
  assert.equal(isSameOriginRequest(url, "https://haven.example", "same-origin"), true);
  for (const origin of [null, "null", "https://evil.example", "https://sub.haven.example", "http://haven.example", "https://haven.example:443@evil.example", "https://haven.example/other"]) {
    assert.equal(isSameOriginRequest(url, origin, "same-origin"), false, String(origin));
  }
  assert.equal(isSameOriginRequest(url, "https://haven.example", "cross-site"), false);
  assert.equal(isSameOriginRequest(url, "https://haven.example", "same-site"), false);
});

test("bounded JSON rejects an oversized body without trusting Content-Length", async () => {
  const request = new Request("https://haven.example/api/haven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "a".repeat(MAX_REQUEST_BYTES) }) });
  await assert.rejects(() => readBoundedJson(request), /too large/);
});

test("bounded JSON rejects wrong content types and invalid JSON", async () => {
  await assert.rejects(() => readBoundedJson(new Request("https://haven.example", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })), /JSON/);
  await assert.rejects(() => readBoundedJson(new Request("https://haven.example", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" })), /valid JSON/);
  assert.deepEqual(await readBoundedJson(new Request("https://haven.example", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: '{"action":"reset"}' })), { action: "reset" });
});
