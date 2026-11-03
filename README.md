# Her Haven

A warm, responsive first build of a women-centered community: **come as you are, find your people, and grow at your own pace.**

![Her Haven home screen](docs/images/home.png)

## What this release does

Her Haven is a **private alpha**, with a real authenticated database behind an interactive web experience. Each signed-in visitor has a separate personal workspace. Authored posts, practice replies, saved items, circle choices, hidden sample authors, and test reports are scoped to that account.

Sample conversations and their names are fictional. There is no live multi-member feed, staffed moderation service, emergency service, or private messaging in this release. Joining a circle saves a personal preference; it does not grant access to another person's posts. This boundary is visible in the interface and enforced by the server.

### Features

- A responsive cream-and-sage interface with original editorial artwork, desktop navigation, mobile menu, and keyboard-accessible dialogs.
- A welcoming home screen and choices to be heard, find company, grow, or enjoy something light.
- Six topic circles with join/leave controls.
- The living room: searchable conversations, circle filters, and response-style filters.
- Posts requesting listening, advice, practical help, shared experience, celebration, or no replies.
- Optional display of a post as “A quiet voice”; the account association remains in the system.
- Practice replies, bookmarks, hidden sample authors, and a personal reporting review queue.
- Gentle mode, profile preferences, and deletion of the current account's alpha data.
- Editable and copyable conversation scripts, practical question guides, a playful joy space, and a 60/120-second quiet pause timer.
- Honest privacy, eligibility, quick-exit, and sample-content disclosures.

## Stack

- React and TypeScript, using the supplied Vinext application framework and its Next.js-compatible routing.
- Cloudflare Workers runtime.
- Cloudflare D1 with Drizzle schema and checked-in migrations.
- Sites-managed authentication for the hosted version.
- Lucide icons; original generated hero artwork served locally as an optimized WebP.

`app/components/Haven.tsx` owns the main experience. `app/components/Explore.tsx` provides resources, joy, quiet, and safety views. `lib/haven-data.ts` holds fictional examples and circle descriptions. `app/api/haven/route.ts` is the authenticated API. `lib/haven-validation.ts` validates requests. `db/schema.ts` declares the database schema.

## Run locally

Use Node.js 22.13 or newer and npm. This repository includes portable development helpers for Windows, macOS, and Linux.

```bash
npm ci
npm run build
```

Apply the initial migration to the local database after the build creates the Wrangler configuration:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_overjoyed_kang.sql
```

Do not replay already-applied migrations. The local database is separate from the deployed database.

```bash
npm run dev
```

Open the address printed by the development server. The portable execution profile supports a loopback-only development sign-in at `/signin-with-chatgpt?return_to=/`. This simulation is excluded from production. The managed preview profile intentionally does not supply a mock signed-in identity.

When running under the managed Sites environment, use its preview/build/publish workflow. Keep `scripts/`, `worker/`, the Sites Vite integration, and `.openai/hosting.json` intact.

## Checks

```bash
node --test tests/backend-validation.mjs
npx tsc --noEmit
npm run build
```

The validation tests cover explicit adult/community acceptance, malicious ownership fields, allowed enums, length bounds, safe text handling, preference patches, reply permissions, request body limits, and cross-origin rejection. Runtime verification should also cover two distinct identities, persistence, and deletion isolation.

## Authentication and deployment

The current hosted private site uses the Sites authentication boundary. The API requires server-provided identity on every request and never accepts an identity from JSON request data. Every user-owned query includes the authenticated user key; account IDs and email addresses are excluded from API snapshots.

**Deploying this code outside Sites requires a replacement trusted authentication integration. Do not accept `oai-authenticated-user-*` headers directly from public clients.** A standalone host must verify sessions or tokens server-side and map them to the request identity.

The D1 binding name is `DB`. Deployment configuration is tracked in `.openai/hosting.json`. Runtime credentials and local databases are ignored by Git. Schema migrations are applied before the hosted Worker is deployed. The source repository is public; the website audience remains private unless explicitly changed.

## Privacy and operating limits

- Eligibility is an adult/women-community self-declaration, not age, identity, or gender verification.
- No real-world name, photograph, location, health history, or financial records are required.
- No notifications, email campaigns, third-party analytics, or AI conversations are implemented.
- Private alpha content is visible to the account through the application; hosting/database operators may have infrastructure access. No end-to-end encryption is claimed.
- The quick-exit link changes the screen. It does not clear browser history or defeat device monitoring.
- The report queue demonstrates reporting and review; no human safety team monitors it yet.
- Account reset deletes current rows from the active database. Infrastructure backup retention is separate.
- Resource cards are conversation/reflection tools; they are not professional health or financial advice.
- Safety and privacy controls are never presented as guarantees against impersonation or screenshots.

## Next development stage

See [the roadmap](docs/ROADMAP.md) for the transition from private prototype to a staffed, invitation-based member pilot. Authentication alone must not grant access to a future shared community.

## Artwork

The original illustration depicts fictional adult women sharing a relaxed moment. It was generated specifically for this project and optimized to `public/images/hero-gathering.webp`. It is decorative artwork, not a photograph or testimonial from members.
