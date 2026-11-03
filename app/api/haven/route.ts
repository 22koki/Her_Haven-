import { and, desc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { havenPosts, havenProfiles, havenReplies, havenReports } from "../../../db/schema";
import { HavenInputError, isDemoPostId, isSameOriginRequest, parseHavenAction, readBoundedJson, repliesAllowed } from "../../../lib/haven-validation";
import type { HavenSnapshot } from "../../../lib/haven-validation";
import { SAMPLE_POSTS } from "../../../lib/haven-data";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie, oai-authenticated-user-id",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders });
}

class ActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Database = ReturnType<typeof getDb>;

async function snapshot(db: Database, userId: string): Promise<HavenSnapshot> {
  const [profiles, posts, replies, reports] = await Promise.all([
    db.select({
      displayName: havenProfiles.displayName,
      adultAccepted: havenProfiles.adultAccepted,
      communityAccepted: havenProfiles.communityAccepted,
      gentle: havenProfiles.gentle,
      joinedCircles: havenProfiles.joinedCircles,
      savedIds: havenProfiles.savedIds,
      blockedIds: havenProfiles.blockedIds,
    }).from(havenProfiles).where(eq(havenProfiles.userId, userId)).limit(1),
    db.select({
      id: havenPosts.id, circleId: havenPosts.circleId, body: havenPosts.body,
      responsePreference: havenPosts.responsePreference, hideProfile: havenPosts.hideProfile,
      createdAt: havenPosts.createdAt,
    }).from(havenPosts).where(eq(havenPosts.userId, userId)).orderBy(desc(havenPosts.createdAt)),
    db.select({ id: havenReplies.id, postId: havenReplies.postId, body: havenReplies.body, createdAt: havenReplies.createdAt })
      .from(havenReplies).where(eq(havenReplies.userId, userId)).orderBy(havenReplies.createdAt),
    db.select({
      id: havenReports.id, postId: havenReports.postId, reason: havenReports.reason,
      details: havenReports.details, status: havenReports.status, createdAt: havenReports.createdAt,
    }).from(havenReports).where(eq(havenReports.userId, userId)).orderBy(desc(havenReports.createdAt)),
  ]);
  return { profile: profiles[0] ?? null, posts, replies, reports };
}

async function ownPost(db: Database, userId: string, postId: string) {
  const [post] = await db.select().from(havenPosts).where(and(eq(havenPosts.id, postId), eq(havenPosts.userId, userId))).limit(1);
  if (!post) throw new ActionError(404, "This post is not available in your private space.");
  return post;
}

async function availablePost(db: Database, userId: string, postId: string) {
  if (!isDemoPostId(postId)) return ownPost(db, userId, postId);
  const example = SAMPLE_POSTS.find((post) => post.id === postId);
  if (!example) throw new ActionError(404, "This sample conversation is not available.");
  return example;
}

function failure(error: unknown) {
  if (error instanceof HavenInputError) return json({ error: error.message }, 400);
  if (error instanceof ActionError) return json({ error: error.message }, error.status);
  // Never echo SQL, account identifiers, credentials, or submitted text.
  return json({ error: "Your private space could not be updated. Please try again shortly." }, 503);
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to access your private space." }, 401);
    return json(await snapshot(getDb(), user.userId));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to save changes to your private space." }, 401);
    if (!isSameOriginRequest(request.url, request.headers.get("origin"), request.headers.get("sec-fetch-site"))) {
      return json({ error: "Please make this change from Her Haven." }, 403);
    }
    const input = parseHavenAction(await readBoundedJson(request));
    const db = getDb();
    const userId = user.userId;
    const now = new Date().toISOString();

    if (input.action === "onboard") {
      await db.insert(havenProfiles).values({
        userId,
        displayName: input.displayName,
        adultAccepted: true,
        communityAccepted: true,
        gentle: false,
        joinedCircles: ["everyday", "friendship"],
        savedIds: [],
        blockedIds: [],
        createdAt: now,
      }).onConflictDoUpdate({
        target: havenProfiles.userId,
        set: { displayName: input.displayName, adultAccepted: true, communityAccepted: true },
      });
      return json(await snapshot(db, userId));
    }

    if (input.action === "reset") {
      await db.batch([
        db.delete(havenReplies).where(eq(havenReplies.userId, userId)),
        db.delete(havenReports).where(eq(havenReports.userId, userId)),
        db.delete(havenPosts).where(eq(havenPosts.userId, userId)),
        db.delete(havenProfiles).where(eq(havenProfiles.userId, userId)),
      ]);
      return json({ profile: null, posts: [], replies: [], reports: [] } satisfies HavenSnapshot);
    }

    const [profile] = await db.select().from(havenProfiles).where(eq(havenProfiles.userId, userId)).limit(1);
    if (!profile?.adultAccepted || !profile?.communityAccepted) {
      throw new ActionError(403, "Complete your welcome agreement before saving changes.");
    }

    switch (input.action) {
      case "preferences": {
        // Only supplied, validated columns change. Unrelated preferences stay intact.
        const { action: _action, ...patch } = input;
        await db.update(havenProfiles).set(patch).where(eq(havenProfiles.userId, userId));
        break;
      }
      case "post": {
        if (!profile.joinedCircles.includes(input.circleId)) {
          throw new ActionError(403, "Join this circle before creating a test post.");
        }
        // The limit and insert run in one SQLite statement, including across tabs.
        const inserted = await db.run(sql`
          INSERT INTO ${havenPosts} (id, user_id, circle_id, body, response_preference, hide_profile, created_at)
          SELECT ${crypto.randomUUID()}, ${userId}, ${input.circleId}, ${input.body}, ${input.responsePreference}, ${input.hideProfile ? 1 : 0}, ${now}
          WHERE (SELECT COUNT(*) FROM ${havenPosts} WHERE ${havenPosts.userId} = ${userId}) < 200
        `);
        if (!inserted.meta.changes) throw new ActionError(409, "Your preview has reached 200 posts. Delete a post before adding another.");
        break;
      }
      case "reply": {
        const post = await availablePost(db, userId, input.postId);
        if (!repliesAllowed(post.responsePreference)) throw new ActionError(403, "Replies are turned off for this post.");
        const inserted = await db.run(sql`
          INSERT INTO ${havenReplies} (id, user_id, post_id, body, created_at)
          SELECT ${crypto.randomUUID()}, ${userId}, ${input.postId}, ${input.body}, ${now}
          WHERE (SELECT COUNT(*) FROM ${havenReplies} WHERE ${havenReplies.userId} = ${userId}) < 500
        `);
        if (!inserted.meta.changes) throw new ActionError(409, "Your preview has reached its reply limit. Reset the preview to begin again.");
        break;
      }
      case "delete-post": {
        await ownPost(db, userId, input.id);
        await db.batch([
          db.delete(havenReplies).where(and(eq(havenReplies.userId, userId), eq(havenReplies.postId, input.id))),
          db.delete(havenReports).where(and(eq(havenReports.userId, userId), eq(havenReports.postId, input.id))),
          db.delete(havenPosts).where(and(eq(havenPosts.userId, userId), eq(havenPosts.id, input.id))),
        ]);
        break;
      }
      case "report": {
        await availablePost(db, userId, input.postId);
        const inserted = await db.run(sql`
          INSERT INTO ${havenReports} (id, user_id, post_id, reason, details, status, created_at)
          SELECT ${crypto.randomUUID()}, ${userId}, ${input.postId}, ${input.reason}, ${input.details}, 'open', ${now}
          WHERE (SELECT COUNT(*) FROM ${havenReports} WHERE ${havenReports.userId} = ${userId}) < 100
        `);
        if (!inserted.meta.changes) throw new ActionError(409, "Your preview has reached its report limit. Reset the preview to begin again.");
        break;
      }
      case "resolve-report": {
        const [report] = await db.select({ id: havenReports.id }).from(havenReports)
          .where(and(eq(havenReports.userId, userId), eq(havenReports.id, input.id))).limit(1);
        if (!report) throw new ActionError(404, "This report is not available in your private review queue.");
        await db.update(havenReports).set({ status: "resolved" })
          .where(and(eq(havenReports.userId, userId), eq(havenReports.id, input.id)));
        break;
      }
    }
    return json(await snapshot(db, userId));
  } catch (error) {
    return failure(error);
  }
}
