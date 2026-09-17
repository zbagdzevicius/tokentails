# Development Guide

How to run each part of Token Tails locally, what to configure, and what to watch out for.

## Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | 20 or 22 (Xcode Cloud installs 20; local development runs 22) | backend, client, cms, faucets |
| npm | bundled | all JavaScript packages |
| MongoDB | 6 or later, or an Atlas cluster | backend |
| Rust and Stellar CLI | stable, `wasm32-unknown-unknown` target | Soroban contracts |
| Xcode and CocoaPods | current | iOS |
| Android Studio, JDK 21 | current | Android |
| Ruby and Bundler | current | Fastlane |

Atlas `$search` autocomplete is used by several search endpoints. Against a local MongoDB those
endpoints return errors; everything else works.

## Repository layout

```
backend/     NestJS API
client/      Next.js web app, Capacitor shells, Phaser games
cms/         Next.js admin console
contracts/   Soroban, SKALE, faucets, archived chain prototypes
docs/        This documentation
extra/       Traction figures and the settlement rail proposal
```

## Backend

```bash
cd backend
cp .env.example .env         # fill in values; see BACKEND.md for the variable list
npm install                  # postinstall rebuilds sharp
npm run dev                  # http://localhost:3005
```

Health check: `GET /` returns `1`. The app connects to `MONGODB_URI` at boot and runs a full
count sweep for traction stats in the controller constructor.

Firebase login requires `FB_PRIVATE_KEY`. Telegram login uses bot tokens that are currently
hardcoded in the auth strategy and selected by `IS_PROD`. AI features need `OPENAI_API_KEY` and
`GOOGLE_AI_API_KEY`. Uploads need the five `DO_SPACES_*` variables. Stripe needs the secret and
webhook secret; forward webhooks locally with the Stripe CLI to `POST /image/webhook`.

Lint and format:

```bash
npm run lint
npm run format
```

There are no automated tests. Migrations live in a gitignored folder; see BACKEND.md.

## Client

```bash
cd client
# create .env.development (gitignored) with at least:
#   NEXT_PUBLIC_BE_URL=http://localhost:3005
#   NEXT_PUBLIC_DOMAIN=http://localhost:3000
#   NEXT_PUBLIC_SITE_NAME=Token Tails
npm install
npm run dev                  # http://localhost:3000
```

The backend CORS allowlist already includes `localhost:3000` and `localhost:3001`.

Useful routes while developing: `/game` for the game shell, `/portrait` for the portrait funnel,
`/feed` for the blog, `/cats` for the marketplace, `/stats` for public counters.

Checks:

```bash
npx tsc --noEmit
npx eslint .
npm test
npm run build                # runs next-sitemap afterwards; tolerates an unreachable backend
```

The game scenes only run in the browser. Anything importing Phaser or the Stellar SDK must be
loaded with `next/dynamic` and `ssr: false`.

## CMS

```bash
cd cms
# .env.development is tracked; it should contain only NEXT_PUBLIC_BE_URL
npm install
npm run dev                  # http://localhost:3000, so run it on another port if the client is up: npx next dev --turbo -p 3001
```

Log in with a Firebase account. The email form creates the account if it does not exist. Your
backend user needs `permission` 3 or higher to see the admin menu; set it directly in MongoDB or
through `PUT /user/profile/:id` as a manager.

```bash
npm test
npx eslint .
```

## Contracts

```bash
cd contracts/stellar/soroban-nft
cargo test
stellar contract build
```

Faucets:

```bash
cd contracts/stellar/stellar-fuel   # or contracts/sfuel
cp .env.sample .env
npm install
npm run dev                          # port 8888
```

SKALE contracts have no local toolchain; they are compiled and deployed through Remix. See
CONTRACTS.md.

## Mobile

See [MOBILE.md](MOBILE.md). Remember to re-enable `output: "export"` in `next.config.js` before
`npm run build:app`.

## Coding conventions

- Backend: Prettier with 4-space indent, single quotes, 120 columns. Absolute imports from `src/`. Business logic currently lives in controllers; new work should prefer services.
- Client and CMS: Prettier defaults with 2-space indent and single quotes in the CMS. Tailwind for styling. Path alias `@/`.
- Shared enums (game types, ability types, tiers, statuses) are duplicated between backend and clients. Change them in every copy.
- Reward constants and catnip caps are mirrored in `backend/src/shared/constants/rewards.ts`, `backend/src/game/game.schema.ts`, `client/constants/rewards.ts`, and `client/constants/catnip-accounting.ts`.

## Secrets and repository hygiene

- Never commit `.env` files with secrets. `client/.env.app`, `client/.env.production`, `cms/.env.development`, and `cms/.env.production` are tracked today and must contain only public values.
- Telegram bot tokens and Firebase service-account identifiers are hardcoded in backend source. The TinyMCE key and Firebase web config are hardcoded in CMS and client source. Moving them to environment variables is the first cleanup to do.
- The soroban-nft README contains RPC URLs with an embedded API key.
- `client/tokentails-keystore` and `client/certificates/` are gitignored. Keep them that way.
- Committed build artifacts to remove: `client/android/app/release/app-release.aab`, `cms/client/.next/trace`, the `.DS_Store` files.
- `backend/migrations/` is gitignored but should be tracked.

## Agent tooling in the repo

`.claude/skills/` and `.agents/skills/` hold BMAD method skills installed for AI-assisted
development, with `skills-lock.json` pinning their sources. `.playwright-cli/` holds browser
session logs from earlier automated QA runs. All three are untracked or ignored and are not part
of the product.
