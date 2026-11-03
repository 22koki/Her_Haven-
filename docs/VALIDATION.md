# First-release verification

Verified on 3 November 2026.

- Production build completed successfully before the final packaging pass.
- TypeScript check passed after integration fixes.
- 11 backend validation/security tests passed.
- The generated migration and atomic quota queries were exercised in an isolated SQLite database, including independent user quotas and cascade isolation.
- Browser checks covered desktop layout, phone layouts at 390px and 320px, mobile navigation, conversation response filtering, reading a conversation, editing/copying a support script, choosing a joy activity, and starting/pausing the quiet timer.
- The phone views had no horizontal document overflow at the checked widths.
- Essential text contrast and touch-target sizes were improved after visual review.

## Verification limit

The managed preview was reachable from the browser but not from the shell's loopback network. The reusable two-account HTTP integration test in `tests/backend-integration.mjs` could not execute in this environment: the initial connection was refused. This is not a passing integration result. It must be run in an environment where the test process and the development preview share the fixed local origin. No authentication bypass was added to work around this.

Hosted authentication and authenticated database writes should be smoke-tested by the owner before inviting any other users. This release remains a private, per-account alpha with fictional sample conversations and no live shared community.
