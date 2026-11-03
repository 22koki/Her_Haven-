import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { HavenInputError, isSameOriginRequest, readBoundedJson } from "../../../lib/haven-validation";
import { CommunityInputError, parseCommunityAction, parseCommunityQuery } from "../../../lib/community-validation";
import { CommunityError, getCommunitySnapshot, runCommunityAction } from "../../../lib/community-service";
import type { CommunityDatabase } from "../../../lib/community-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie, oai-authenticated-user-id", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function database(): CommunityDatabase {
  if (!env.DB) throw new CommunityError(503, "The community database is not ready. Please contact the site operator.");
  return env.DB as unknown as CommunityDatabase;
}
function failure(error: unknown) {
  if (error instanceof CommunityInputError || error instanceof HavenInputError) return json({ error: error.message }, 400);
  if (error instanceof CommunityError) return json({ error: error.message }, error.status);
  return json({ error: "Your community could not connect. Please try again shortly. If this is a local setup, apply the community migration first." }, 503);
}
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to access your community membership." }, 401);
    return json(await getCommunitySnapshot(database(), user.userId, parseCommunityQuery(new URL(request.url).searchParams)));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to update your community membership." }, 401);
    if (!isSameOriginRequest(request.url, request.headers.get("origin"), request.headers.get("sec-fetch-site"))) return json({ error: "Please make this change from Her Haven." }, 403);
    const action = parseCommunityAction(await readBoundedJson(request));
    return json(await runCommunityAction(database(), user.userId, action));
  } catch (error) { return failure(error); }
}
