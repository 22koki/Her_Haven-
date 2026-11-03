/** Public community API. Auth identifiers never belong in this contract. */
export const COMMUNITY_STATUSES = ["pending", "approved", "declined", "suspended"] as const;
export const COMMUNITY_CIRCLES = ["everyday", "friendship", "growth", "wellbeing", "creativity", "starting-over"] as const;
export const COMMUNITY_RESPONSES = ["listen", "advice", "practical", "experience", "celebrate", "no-replies"] as const;
export const COMMUNITY_REPORT_REASONS = ["harassment", "privacy", "harmful-advice", "spam", "other"] as const;
export type CommunityStatus = typeof COMMUNITY_STATUSES[number];
export type CommunityRole = "member" | "moderator";
export type ContentTarget = "post" | "reply";
export type CommunityMembership = {
  id: string; status: CommunityStatus; role: CommunityRole; application: string;
  decisionNote: string; createdAt: string; updatedAt: string;
};
export type CommunityPost = {
  id: string; circleId: string; body: string; responsePreference: string;
  quiet: boolean; author: string; own: boolean; createdAt: string; replyCount: number;
};
export type CommunityReply = {
  id: string; postId: string; body: string; author: string; own: boolean; createdAt: string;
};
export type CommunityReport = {
  id: string; targetType: ContentTarget; targetId: string; reason: string; details: string;
  status: "open" | "actioned" | "dismissed"; resolution: string; createdAt: string; reviewedAt: string | null;
};
export type ModeratorMember = CommunityMembership & { displayName: string };
export type ModeratorReport = CommunityReport & {
  reporter: string; reporterMemberId: string;
  target: null | { body: string; state: string; author: string; authorMemberId: string; postId: string; circleId: string; quiet: boolean };
};
export type ModerationAudit = {
  id: string; actor: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string;
};
export type HiddenCommunityContent = {
  id: string; targetType: ContentTarget; body: string; author: string; authorMemberId: string;
  createdAt: string; updatedAt: string; postId: string; circleId: string; quiet: boolean; state: "hidden";
};
export type OwnCommunityContent = {
  id: string; targetType: ContentTarget; body: string; state: "visible" | "hidden"; createdAt: string;
};
export type CommunitySnapshot = {
  profileReady: boolean;
  membership: CommunityMembership | null;
  joinedCircles: string[];
  posts: CommunityPost[];
  replies: CommunityReply[];
  reports: CommunityReport[];
  blocks: { id: string; label: string; createdAt: string }[];
  ownContent: OwnCommunityContent[];
  nextCursor: string | null;
  nextReplyCursor: string | null;
  moderation: null | { members: ModeratorMember[]; reports: ModeratorReport[]; audit: ModerationAudit[]; hiddenContent: HiddenCommunityContent[] };
};
export type CommunityAction =
  | { action: "apply"; application: string; consent: true }
  | { action: "post"; circleId: string; body: string; responsePreference: string; quiet: boolean; shareConsent: true }
  | { action: "reply"; postId: string; body: string; shareConsent: true }
  | { action: "delete-post" | "delete-reply"; id: string }
  | { action: "report"; targetType: ContentTarget; targetId: string; reason: string; details: string }
  | { action: "block"; targetType: ContentTarget; targetId: string }
  | { action: "unblock"; id: string }
  | { action: "review-member"; memberId: string; status: Exclude<CommunityStatus, "pending">; reason: string }
  | { action: "moderate-content"; targetType: ContentTarget; targetId: string; decision: "hide" | "restore"; reason: string }
  | { action: "resolve-report"; id: string; decision: "actioned" | "dismissed"; reason: string };
export type CommunityQuery = { circle?: string; cursor?: string; post?: string; replyCursor?: string; limit?: number };
