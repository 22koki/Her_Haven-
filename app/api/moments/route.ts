import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { HavenInputError, isSameOriginRequest, readBoundedJson } from '../../../lib/haven-validation';
import { MomentsInputError, parseMomentsAction, parseMomentsQuery } from '../../../lib/moments-validation';
import { MomentsError, getMomentsSnapshot, runMomentsAction } from '../../../lib/moments-service';
import type { CommunityDatabase } from '../../../lib/community-service';

export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie, oai-authenticated-user-id',
  'X-Content-Type-Options': 'nosniff',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

function database(): CommunityDatabase {
  if (!env.DB) throw new MomentsError(503, 'Your private haven is not ready. Please contact the site operator.');
  return env.DB as unknown as CommunityDatabase;
}

function failure(error: unknown) {
  if (error instanceof MomentsInputError || error instanceof HavenInputError) return json({ error: error.message }, 400);
  if (error instanceof MomentsError) return json({ error: error.message }, error.status);
  // Do not disclose SQL, identifiers, credentials or the submitted private note.
  return json({ error: 'Your private haven could not connect. Please try again shortly.' }, 503);
}

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: 'Sign in to see your private check-ins and small step.' }, 401);
    const options = parseMomentsQuery(new URL(request.url).searchParams);
    return json(await getMomentsSnapshot(database(), user.userId, options));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: 'Sign in to save in your private haven.' }, 401);
    if (!isSameOriginRequest(request.url, request.headers.get('origin'), request.headers.get('sec-fetch-site'))) {
      return json({ error: 'Please make this change from Her Haven.' }, 403);
    }
    const options = parseMomentsQuery(new URL(request.url).searchParams);
    const action = parseMomentsAction(await readBoundedJson(request));
    return json(await runMomentsAction(database(), user.userId, action, options));
  } catch (error) { return failure(error); }
}
