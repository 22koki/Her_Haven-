# Her Haven: community pilot roadmap

## Implemented in this stage

The original private-practice space remains isolated. A separate Community area now supports membership applications and approval, circle-gated shared posts/replies, explicit sharing consent, quiet attribution, no-replies posts, owner deletion, bilateral blocks, confidential reports, moderator content actions, membership suspension/restoration, and audit history. The database upgrade is additive and preserves existing private data.

Authentication continues to use the existing trusted sign-in. Signing in does not imply approved membership. Moderator roles are assigned through trusted operator access, never through registration or browser-submitted role fields.

## Before inviting a live group

1. Assign the first production moderator to the intended, verified account through trusted database administration. Run the additive migration and verify membership/application decisions on the target host.
2. Establish an accountable women-led moderation team, coverage hours, reporting triage, escalation, and a clear route to request reconsideration. Suspended or declined members cannot reset themselves into approved status.
3. Publish operating rules for privacy, consent, eligibility, moderation decisions, report-evidence retention, deletion, backups, and operator access. Membership approval is not identity or gender verification.
4. Test the deployed application with separate invited accounts and actual sign-in sessions: pending access, approval, shared circle access, reporting, blocking, suspension, and deletion. Local simulation and SQLite tests are useful but do not replace this deployment check.
5. Verify support resources for the initial countries and maintain review dates. Do not promise an emergency service without staffing and infrastructure.
6. Start with a small invited adult group, gather feedback on comfort and control, and expand only when moderation capacity supports it. Do not manufacture community activity or seed undisclosed fake members.

## Next product improvements

- A clear reconsideration/contact channel and moderator assignment/coverage tools.
- Member notifications with explicit opt-in and quiet-hour controls.
- Larger moderation/member lists with server-side filtering and pagination as the pilot grows beyond the current recent-list bounds.
- Standalone authentication integration if hosting outside the trusted Sites boundary; public clients must never be allowed to choose identity headers.
- Mutual-consent friendship requests and private messaging after separate abuse/privacy design.
- Facilitated events and professional sessions with credential checks and clear scope.
- More localized financial growth, work, beauty, wellbeing, and friendship resources based on member feedback.
- Language support and accessibility improvements informed by actual participant needs.

## Product commitments

Respect quiet participation. Keep support preferences meaningful. Welcome women across backgrounds, including trans women. Never infer gender from appearance or voice. Protect members from unwanted selling, unsolicited advice, coercion, and shame. Keep everyday joy beside difficult conversations. Measure whether members feel heard and can exercise choice; avoid rewarding time spent scrolling or intimate disclosure.
