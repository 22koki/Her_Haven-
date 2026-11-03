/**
 * HTTP integration checks for the local Sites development preview only.
 * Run after applying the local D1 migration and starting sites-preview:
 *   node --test tests/backend-integration.mjs
 *
 * Disposable synthetic identity headers simulate the trusted dispatch layer.
 * This file deliberately cannot target a deployed or non-loopback origin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const ORIGIN = "http://127.0.0.1:4173";
const API = `${ORIGIN}/api/haven`;
const runId = randomUUID();
const accounts = [
  { id: `haven-integration-${runId}-a`, email: `haven-test-a-${runId}@example.test` },
  { id: `haven-integration-${runId}-b`, email: `haven-test-b-${runId}@example.test` },
];

async function request(account, payload, options = {}) {
  const headers = {
    ...(account ? { "oai-authenticated-user-id": account.id, "oai-authenticated-user-email": account.email } : {}),
    ...(payload ? { "Content-Type": "application/json", "Origin": options.origin ?? ORIGIN, "Sec-Fetch-Site": options.fetchSite ?? "same-origin" } : {}),
  };
  const response = await fetch(API, {
    method: payload ? "POST" : "GET",
    headers,
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, cacheControl: response.headers.get("cache-control") ?? "" };
}

function status(result, expected, label) {
  assert.equal(result.status, expected, `${label}: HTTP status`);
  assert.ok(result.cacheControl.includes("no-store"), `${label}: response must not be cached`);
}

function emptySnapshot(snapshot, label) {
  assert.equal(snapshot.profile, null, `${label}: profile removed`);
  for (const key of ["posts", "replies", "reports"]) assert.equal(snapshot[key].length, 0, `${label}: ${key} removed`);
}

test("local HTTP lifecycle preserves per-user isolation and response boundaries", { timeout: 120_000 }, async (t) => {
  const [a, b] = accounts;
  const createdAccounts = new Set();
  try {
    status(await request(null), 401, "Unauthenticated read");
    status(await request(null, { action: "reset" }), 401, "Unauthenticated write");
    t.diagnostic("Unauthenticated reads and writes are rejected.");

    for (const account of accounts) {
      status(await request(account, { action: "onboard", displayName: "Test member", adultAccepted: false, communityAccepted: true }), 400, "Adult agreement required");
      const onboarded = await request(account, { action: "onboard", displayName: "Test member", adultAccepted: true, communityAccepted: true });
      status(onboarded, 200, "Onboard synthetic account");
      createdAccounts.add(account);
      assert.deepEqual(onboarded.data.profile.joinedCircles, ["everyday", "friendship"]);
      assert.equal(onboarded.data.profile.adultAccepted, true);
      assert.equal(onboarded.data.profile.communityAccepted, true);
      assert.equal("userId" in onboarded.data.profile, false, "Profile must not expose auth identifiers");
      assert.equal("email" in onboarded.data.profile, false, "Profile must not expose email");
    }

    status(await request(a, { action: "preferences", gentle: true }, { origin: "https://outside.example" }), 403, "Foreign origin");
    status(await request(a, { action: "preferences", gentle: true }, { fetchSite: "cross-site" }), 403, "Cross-site request metadata");
    status(await request(a, { action: "preferences", role: "admin" }), 400, "Privilege field rejected");
    t.diagnostic("Explicit agreements, same-origin checks, and field whitelists are enforced.");

    status(await request(a, { action: "preferences", joinedCircles: ["everyday", "friendship", "growth"], gentle: true }), 200, "Join circle and gentle mode");
    const preferences = await request(a, { action: "preferences", savedIds: ["demo-small-step"] });
    status(preferences, 200, "Update one preference");
    assert.equal(preferences.data.profile.gentle, true, "Unrelated preference survives patch");
    assert.ok(preferences.data.profile.joinedCircles.includes("growth"), "Circle membership survives patch");

    const postA = await request(a, { action: "post", circleId: "growth", body: "Synthetic private integration test. <b>Literal text</b>", responsePreference: "listen", hideProfile: true });
    status(postA, 200, "Create private post");
    assert.equal(postA.data.posts.length, 1);
    const postIdA = postA.data.posts[0].id;
    assert.equal(postA.data.posts[0].hideProfile, true);
    assert.equal(postA.data.posts[0].body, "Synthetic private integration test. <b>Literal text</b>");
    assert.equal("userId" in postA.data.posts[0], false, "Posts must not expose auth identifiers");

    const reread = await request(a);
    status(reread, 200, "Read persisted state");
    assert.equal(reread.data.posts[0].id, postIdA);
    assert.deepEqual(reread.data.profile.savedIds, ["demo-small-step"]);
    assert.equal((await request(b)).data.posts.length, 0, "Second account cannot see first account’s post");
    for (const payload of [
      { action: "delete-post", id: postIdA },
      { action: "report", postId: postIdA, reason: "privacy", details: "Synthetic test" },
      { action: "reply", postId: postIdA, body: "Synthetic test" },
    ]) status(await request(b, payload), 404, `Cross-account ${payload.action}`);
    t.diagnostic("Profiles, preferences, and posts persist; cross-account reads and post operations are isolated.");

    const reply = await request(a, { action: "reply", postId: postIdA, body: "A private practice reply." });
    status(reply, 200, "Own post reply");
    assert.equal(reply.data.replies.filter(row => row.postId === postIdA).length, 1);
    const quietPost = await request(a, { action: "post", circleId: "everyday", body: "A quiet synthetic test thought.", responsePreference: "no-replies", hideProfile: false });
    status(quietPost, 200, "Create no-replies post");
    const quietId = quietPost.data.posts.find(row => row.responsePreference === "no-replies").id;
    status(await request(a, { action: "reply", postId: quietId, body: "This must not be accepted." }), 403, "No-replies boundary");
    status(await request(a, { action: "post", circleId: "wellbeing", body: "Not a joined circle.", responsePreference: "listen", hideProfile: false }), 403, "Circle membership required");
    status(await request(a, { action: "reply", postId: "demo-does-not-exist", body: "Unknown example" }), 404, "Unknown demo reply");
    status(await request(a, { action: "report", postId: "demo-does-not-exist", reason: "other", details: "" }), 404, "Unknown demo report");
    t.diagnostic("Replies respect membership, known examples, ownership, and no-replies settings.");

    const report = await request(a, { action: "report", postId: postIdA, reason: "privacy", details: "Synthetic report for integration checks." });
    status(report, 200, "Create private test report");
    const reportId = report.data.reports[0].id;
    assert.equal(report.data.reports[0].status, "open");
    status(await request(b, { action: "resolve-report", id: reportId }), 404, "Cross-account report resolution");
    const resolved = await request(a, { action: "resolve-report", id: reportId });
    status(resolved, 200, "Resolve own report");
    assert.equal(resolved.data.reports[0].status, "resolved");

    const postB = await request(b, { action: "post", circleId: "everyday", body: "Independent synthetic second-account record.", responsePreference: "celebrate", hideProfile: false });
    status(postB, 200, "Second account creates independent post");
    const postIdB = postB.data.posts[0].id;
    const deleted = await request(a, { action: "delete-post", id: postIdA });
    status(deleted, 200, "Delete own post");
    assert.equal(deleted.data.posts.some(row => row.id === postIdA), false);
    assert.equal(deleted.data.replies.some(row => row.postId === postIdA), false);
    assert.equal(deleted.data.reports.some(row => row.postId === postIdA), false);
    assert.equal((await request(b)).data.posts[0].id, postIdB, "Deleting one user’s post preserves another user’s post");

    const reset = await request(a, { action: "reset" });
    status(reset, 200, "Reset own alpha data");
    emptySnapshot(reset.data, "Reset snapshot");
    emptySnapshot((await request(a)).data, "Reset persists");
    const preserved = await request(b);
    assert.ok(preserved.data.profile, "Other account profile survives reset");
    assert.equal(preserved.data.posts[0].id, postIdB, "Other account post survives reset");
    t.diagnostic("Reports, resolution, deletion, and account reset preserve ownership boundaries.");
  } finally {
    const failures = [];
    for (const account of createdAccounts) {
      try {
        status(await request(account, { action: "reset" }), 200, "Synthetic account cleanup");
        emptySnapshot((await request(account)).data, "Cleanup verification");
      } catch { failures.push("A synthetic test account could not be cleaned up."); }
    }
    assert.deepEqual(failures, [], "All synthetic database records must be removed");
    if (createdAccounts.size) t.diagnostic("Disposable profiles and records were removed and cleanup was verified.");
  }
});
