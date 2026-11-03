# Release verification

Verified on 3 November 2026 using synthetic local data. The community source update has not been deployed to the earlier hosted private alpha.

## Community release

- `npm test`: **38 passed, 0 failed, 0 skipped**. This comprises 11 private-input/HTTP-boundary checks, 7 community validation checks, 18 community SQL integration scenarios, and 2 local helper checks.
- `tsc --noEmit`: passed after the final component changes.
- `npm run build`: passed, producing `/`, `/api/haven`, and `/api/community`.
- Targeted ESLint passed for `CommunityView.tsx`; this is not a claim that the entire pre-existing repository is lint-clean.
- `git diff --check`: passed.

The community integration fixture executes the shipped service against Node's real SQLite engine through a D1-compatible adapter. It covers approval and joined-circle boundaries, consent, ownership, quiet attribution including author replies, no-replies enforcement, report confidentiality and evidence retention, hide/restore, bilateral blocking, suspension across private-profile reset, owner deletion while restricted, pagination ties, concurrent quotas/caps, and authorization changes between context reads and writes. It does not substitute an authentication bypass into the running application.

The additive migration was applied repeatedly without changing historical private data. Generated Drizzle metadata was compared with the shipped SQL for tables, columns, foreign keys, and indexes. The local setup helper was exercised against a profile created in the browser, and the local-only moderator grant produced the expected audit entry.

### Browser checks

The managed development preview was tested through the browser using the normal local sign-in simulator and one synthetic account:

1. Completed the chosen-name profile and membership application. The pending account displayed **Awaiting review** and no shared feed.
2. Granted that account local moderator access with the explicit helper, restarted the preview, and verified the approved community and care desk.
3. Created a quiet-voice shared post with **No replies for now**. Sharing remained disabled until the audience acknowledgement was checked. The thread displayed no reply form.
4. Hid the post with a reason, confirmed its removal from conversations, restored it through **Hidden content**, and confirmed both reasons in **Decision record**.
5. Reloaded the page and confirmed membership and the restored post persisted.
6. Inspected the community feed and sharing dialog in 390px and 320px same-origin iframe viewports. Document and dialog content widths showed no horizontal overflow. Also checked the care desk at 320px. These are responsive layout checks, not physical-device tests.
7. Fixed and rechecked native-dialog centering on desktop. Long moderator/report-card names and status chips wrap at narrow widths.

![Shared community with synthetic local content](images/community.png)

![Care desk decision record from the local test](images/care-desk.png)

## Evidence limits

- The browser development simulator supplies one account. Multiple identities, approval/decline/suspension, report privacy, and cross-account attacks were checked in the SQLite integration suite, not in a multi-person browser session.
- The managed preview is reachable from the browser but not from the executor's loopback network. The existing two-account HTTP test in `tests/backend-integration.mjs` was not run successfully in this environment. It remains a separate verification step where the process and preview share a local origin. No network or authentication bypass was added.
- SQLite service tests do not establish hosted Cloudflare behavior. Hosted sign-in, migrations, moderator provisioning, and independent member sessions still need a deployment smoke test before a member pilot. This update changes neither the hosted site audience nor its database.
- A functional report queue does not establish staffing, response time, membership-verification quality, or emergency coverage.

## Earlier private-alpha checks

The first release separately passed its 11 validation checks, TypeScript check, and production build. Browser review covered the home page, navigation, conversation response filtering, reading a sample conversation, support-script editing/copying, joy activities, and quiet-timer start/pause. Its phone layouts were checked at 390px and 320px. Those checks are retained here as prior evidence; this community pass did not repeat every unrelated private-alpha interaction.
