/** Shared API contract. User content is plain text and must be rendered as text. */
export const CIRCLE_IDS = ["everyday", "friendship", "growth", "wellbeing", "creativity", "starting-over"] as const;
export const RESPONSE_PREFERENCES = ["listen", "advice", "practical", "experience", "celebrate", "no-replies"] as const;
export const REPORT_REASONS = ["harassment", "privacy", "harmful-advice", "spam", "other"] as const;
export const MAX_REQUEST_BYTES = 32_768;

export type CircleId = typeof CIRCLE_IDS[number];
export type ResponsePreference = typeof RESPONSE_PREFERENCES[number];
export type ReportReason = typeof REPORT_REASONS[number];

export type HavenProfile = {
  displayName: string;
  adultAccepted: boolean;
  communityAccepted: boolean;
  gentle: boolean;
  joinedCircles: string[];
  savedIds: string[];
  blockedIds: string[];
};
export type HavenPost = {
  id: string;
  circleId: string;
  body: string;
  responsePreference: string;
  hideProfile: boolean;
  createdAt: string;
};
export type HavenReply = { id: string; postId: string; body: string; createdAt: string };
export type HavenReport = {
  id: string;
  postId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
};
export type HavenSnapshot = {
  profile: HavenProfile | null;
  posts: HavenPost[];
  replies: HavenReply[];
  reports: HavenReport[];
};

export type PreferencesPatch = Partial<Pick<HavenProfile, "displayName" | "gentle" | "joinedCircles" | "savedIds" | "blockedIds">>;
export type HavenAction =
  | { action: "onboard"; displayName: string; adultAccepted: true; communityAccepted: true }
  | ({ action: "preferences" } & PreferencesPatch)
  | { action: "post"; circleId: CircleId; body: string; responsePreference: ResponsePreference; hideProfile: boolean }
  | { action: "reply"; postId: string; body: string }
  | { action: "delete-post"; id: string }
  | { action: "report"; postId: string; reason: ReportReason; details: string }
  | { action: "resolve-report"; id: string }
  | { action: "reset" };

export class HavenInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HavenInputError";
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HavenInputError("Please send a valid request.");
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new HavenInputError("This request includes an unsupported field.");
  }
}

function text(value: unknown, label: string, max: number, min = 1): string {
  if (typeof value !== "string") throw new HavenInputError(`${label} must be text.`);
  const result = value.replace(/\r\n?/g, "\n").trim();
  if (result.length < min || result.length > max) {
    throw new HavenInputError(`${label} must contain ${min}–${max} characters.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    throw new HavenInputError(`${label} contains unsupported control characters.`);
  }
  return result;
}

function id(value: unknown, label = "Identifier"): string {
  const result = text(value, label, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) {
    throw new HavenInputError(`${label} is invalid.`);
  }
  return result;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new HavenInputError(`Please choose a valid ${label}.`);
  }
  return value as T;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new HavenInputError(`${label} must be on or off.`);
  return value;
}

function ids(value: unknown, label: string, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HavenInputError(`${label} must be a list of at most ${max} items.`);
  }
  return [...new Set(value.map((entry) => id(entry, label)))];
}

/** Never coerce eligibility or account ownership from client-supplied data. */
export function parseHavenAction(value: unknown): HavenAction {
  const data = object(value);
  switch (data.action) {
    case "onboard": {
      fields(data, ["action", "displayName", "adultAccepted", "communityAccepted"]);
      if (data.adultAccepted !== true || data.communityAccepted !== true) {
        throw new HavenInputError("Please confirm that you are 18 or older and accept the women’s community agreement.");
      }
      return { action: "onboard", displayName: text(data.displayName, "Chosen name", 40, 2), adultAccepted: true, communityAccepted: true };
    }
    case "preferences": {
      fields(data, ["action", "displayName", "gentle", "joinedCircles", "savedIds", "blockedIds"]);
      const patch: PreferencesPatch = {};
      if (data.displayName !== undefined) patch.displayName = text(data.displayName, "Chosen name", 40, 2);
      if (data.gentle !== undefined) patch.gentle = boolean(data.gentle, "Gentle mode");
      if (data.joinedCircles !== undefined) {
        patch.joinedCircles = ids(data.joinedCircles, "Circles", CIRCLE_IDS.length).map((circle) => oneOf(circle, CIRCLE_IDS, "circle"));
      }
      if (data.savedIds !== undefined) patch.savedIds = ids(data.savedIds, "Saved items");
      if (data.blockedIds !== undefined) patch.blockedIds = ids(data.blockedIds, "Hidden authors");
      if (!Object.keys(patch).length) throw new HavenInputError("Choose a preference to update.");
      return { action: "preferences", ...patch };
    }
    case "post":
      fields(data, ["action", "circleId", "body", "responsePreference", "hideProfile"]);
      return {
        action: "post",
        circleId: oneOf(data.circleId, CIRCLE_IDS, "circle"),
        body: text(data.body, "Post", 4000),
        responsePreference: oneOf(data.responsePreference, RESPONSE_PREFERENCES, "response preference"),
        hideProfile: data.hideProfile === undefined ? false : boolean(data.hideProfile, "Hide profile"),
      };
    case "reply":
      fields(data, ["action", "postId", "body"]);
      return { action: "reply", postId: id(data.postId, "Post"), body: text(data.body, "Reply", 2000) };
    case "delete-post":
      fields(data, ["action", "id"]);
      return { action: "delete-post", id: id(data.id, "Post") };
    case "report":
      fields(data, ["action", "postId", "reason", "details"]);
      return { action: "report", postId: id(data.postId, "Post"), reason: oneOf(data.reason, REPORT_REASONS, "report reason"), details: text(data.details ?? "", "Details", 2000, 0) };
    case "resolve-report":
      fields(data, ["action", "id"]);
      return { action: "resolve-report", id: id(data.id, "Report") };
    case "reset":
      fields(data, ["action"]);
      return { action: "reset" };
    default:
      throw new HavenInputError("This action is not supported.");
  }
}

/** CSRF protection: origins must match and cross-site browser requests fail closed. */
export function isSameOriginRequest(requestUrl: string, origin: string | null, fetchSite: string | null): boolean {
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  if (!origin || origin === "null") return false;
  try {
    const supplied = new URL(origin);
    const expected = new URL(requestUrl);
    return supplied.origin === expected.origin && supplied.username === "" && supplied.password === "" && supplied.pathname === "/" && supplied.search === "" && supplied.hash === "";
  } catch {
    return false;
  }
}

export function repliesAllowed(responsePreference: string): boolean {
  return responsePreference !== "no-replies";
}

export function isDemoPostId(value: string): boolean {
  return /^demo-[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

/** Bound the actual streamed body, even when Content-Length is absent or false. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HavenInputError("Please send JSON content.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new HavenInputError("This request is too large.");
  if (!request.body) throw new HavenInputError("Please send a request body.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let value = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new HavenInputError("This request is too large.");
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof HavenInputError) throw error;
    throw new HavenInputError("Please send valid JSON text.");
  } finally {
    reader.releaseLock();
  }
}
