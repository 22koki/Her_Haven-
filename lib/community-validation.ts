import { COMMUNITY_CIRCLES, COMMUNITY_RESPONSES, COMMUNITY_REPORT_REASONS } from "./community-contract.ts";
import type { CommunityAction, CommunityQuery } from "./community-contract.ts";

export class CommunityInputError extends Error {
  constructor(message: string) { super(message); this.name = "CommunityInputError"; }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommunityInputError("Please send a valid community request.");
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new CommunityInputError("This request includes an unsupported field.");
}
function text(value: unknown, label: string, max: number, min = 1) {
  if (typeof value !== "string") throw new CommunityInputError(`${label} must be text.`);
  const clean = value.replace(/\r\n?/g, "\n").trim();
  if (clean.length < min || clean.length > max) throw new CommunityInputError(`${label} must contain ${min}–${max} characters.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) throw new CommunityInputError(`${label} contains unsupported control characters.`);
  return clean;
}
function id(value: unknown) {
  const clean = text(value, "Identifier", 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(clean)) throw new CommunityInputError("This identifier is invalid.");
  return clean;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new CommunityInputError(`Please choose a valid ${label}.`);
  return value as T;
}
function consent(value: unknown) {
  if (value !== true) throw new CommunityInputError("Please explicitly confirm the community sharing agreement.");
  return true as const;
}
export function parseCommunityAction(value: unknown): CommunityAction {
  const data = object(value);
  switch (data.action) {
    case "apply":
      fields(data, ["action", "application", "consent"]);
      return { action: "apply", application: text(data.application, "Your introduction", 1000, 10), consent: consent(data.consent) };
    case "post": {
      fields(data, ["action", "circleId", "body", "responsePreference", "quiet", "shareConsent"]);
      if (data.quiet !== undefined && typeof data.quiet !== "boolean") throw new CommunityInputError("Quiet posting must be on or off.");
      return { action: "post", circleId: choice(data.circleId, COMMUNITY_CIRCLES, "circle"), body: text(data.body, "Post", 4000, 3), responsePreference: choice(data.responsePreference, COMMUNITY_RESPONSES, "response preference"), quiet: data.quiet === true, shareConsent: consent(data.shareConsent) };
    }
    case "reply":
      fields(data, ["action", "postId", "body", "shareConsent"]);
      return { action: "reply", postId: id(data.postId), body: text(data.body, "Reply", 2000), shareConsent: consent(data.shareConsent) };
    case "delete-post": case "delete-reply":
      fields(data, ["action", "id"]);
      return { action: data.action, id: id(data.id) };
    case "report":
      fields(data, ["action", "targetType", "targetId", "reason", "details"]);
      return { action: "report", targetType: choice(data.targetType, ["post", "reply"], "content type"), targetId: id(data.targetId), reason: choice(data.reason, COMMUNITY_REPORT_REASONS, "report reason"), details: text(data.details ?? "", "Report details", 2000, 0) };
    case "block":
      fields(data, ["action", "targetType", "targetId"]);
      return { action: "block", targetType: choice(data.targetType, ["post", "reply"], "content type"), targetId: id(data.targetId) };
    case "unblock":
      fields(data, ["action", "id"]);
      return { action: "unblock", id: id(data.id) };
    case "review-member":
      fields(data, ["action", "memberId", "status", "reason"]);
      return { action: "review-member", memberId: id(data.memberId), status: choice(data.status, ["approved", "declined", "suspended"], "membership decision"), reason: text(data.reason, "Decision note", 1000, 3) };
    case "moderate-content":
      fields(data, ["action", "targetType", "targetId", "decision", "reason"]);
      return { action: "moderate-content", targetType: choice(data.targetType, ["post", "reply"], "content type"), targetId: id(data.targetId), decision: choice(data.decision, ["hide", "restore"], "moderation decision"), reason: text(data.reason, "Moderation reason", 1000, 3) };
    case "resolve-report":
      fields(data, ["action", "id", "decision", "reason"]);
      return { action: "resolve-report", id: id(data.id), decision: choice(data.decision, ["actioned", "dismissed"], "report decision"), reason: text(data.reason, "Resolution note", 1000, 3) };
    default: throw new CommunityInputError("This community action is not supported.");
  }
}
export function parseCommunityQuery(params: URLSearchParams): CommunityQuery {
  const allowed = ["circle", "cursor", "post", "replyCursor", "limit"];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new CommunityInputError("This community query is invalid.");
  const result: CommunityQuery = {};
  if (params.has("circle")) result.circle = choice(params.get("circle"), COMMUNITY_CIRCLES, "circle");
  if (params.has("post")) result.post = id(params.get("post"));
  for (const key of ["cursor", "replyCursor"] as const) {
    if (params.has(key)) {
      const token = text(params.get(key), "Page cursor", 150);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(token)) throw new CommunityInputError("This page cursor is invalid.");
      result[key] = token;
    }
  }
  if (params.has("limit")) {
    const limit = Number(params.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new CommunityInputError("Choose a page size from 1 to 50.");
    result.limit = limit;
  }
  return result;
}
