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
backend/        NestJS API
client/         Next.js web app, Capacitor shells, Phaser games
cms/            Next.js admin console
catnip-heist/   Catnip Heist: standalone three.js game (Vite), built into client/public/heist-game
shared/         Framework-free TypeScript contracts copied into every package (plan F2)
scripts/        Repo-level scripts: sync-contracts.mjs and its tests
tools/          copy-lint (tone and claims lint, own package.json)
funding/        Facts registry and generator (funding/framework), grant material
contracts/      Soroban, SKALE, faucets, archived chain prototypes
docs/           This documentation; docs/plans/ holds the plans and the alignment logs
extra/          Traction figures and the settlement rail proposal
```

Never point a local backend at a production database. Mongoose `autoIndex` builds every
schema-declared index on whatever `MONGODB_URI` names when the server starts, and the crons would run
from the developer machine. The guest and impact jobs are off outside `NODE_ENV=production`
(`CRONS_ENABLED`, `IMPACT_JOBS_ENABLED`), but index builds are not.

## Backend

```bash
cd backend
cp .env.example .env         # fill in values; see BACKEND.md for the variable list
npm install                  # postinstall rebuilds sharp
npm run dev                  # http://localhost:3005
```

Health check: `GET /` returns `1`. The app connects to `MONGODB_URI` at boot and runs a full
count sweep for traction stats in the controller constructor.

Firebase login requires `FB_PRIVATE_KEY`; it is the only login path. AI features need `OPENAI_API_KEY` and
`GOOGLE_AI_API_KEY`. Uploads need the five `DO_SPACES_*` variables. Stripe needs the secret and
webhook secret; forward webhooks locally with the Stripe CLI to `POST /image/webhook`.

Lint and format:

```bash
npm run lint
npm run format
```

Tests: `npm test` runs jest over `src/**/*.spec.ts`: auth and identity, guests, payments (Stellar, Stripe, order schema and audit), search, throttling, jobs, codex reset, feeding, score submission (`/live`) and Heist replays, impact, Rescue Goals. Specs mock Mongoose and external SDKs and do not read a local env file, so they run on a clean checkout. Opt-in specs run against a real MongoDB (`MONGO_IT_URI`, `IDENTITY_SPEC_MONGO_URL`, `LIVE_SPEC_MONGO_URL`; see BACKEND.md, "Scripts"). Migrations live in a gitignored folder; see BACKEND.md.

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
npx tsc -p e2e --noEmit      # the Playwright harness has its own tsconfig
npx eslint .
npm test
npm run test:e2e             # Playwright (see below)
npm run build                # runs next-sitemap afterwards; tolerates an unreachable backend
npm run tokens:check && npm run fonts:check && npm run icons:check && npm run palette:check
node scripts/art/catnip-export.mjs --check && node scripts/art/build.mjs --gates
```

Blocking gates (task 7b): `palette:check`, ESLint `tt/no-raw-font` (error), the copy lint
(`tools/copy-lint`, any finding fails CI) and the bundle guard. The bundle guard scans a production
build for test hooks: `node scripts/check-bundle-hooks.mjs .next/static` after `npm run build`, and
`node scripts/check-bundle-hooks.mjs out/_next/static` after `npm run build:app`. To build beside a
running dev server without touching its `.next`, set `NEXT_DIST_DIR=.next-guard` (any `.next-*`
directory is git-, lint- and tsc-ignored); with `output: "export"` the export is written into that
directory, not `out/`. `next build` rewrites `next-env.d.ts` to the side directory, so run
`git checkout client/next-env.d.ts` afterwards.

The game scenes only run in the browser. Anything importing Phaser, three or the Stellar SDK must be
loaded with `next/dynamic` and `ssr: false`. ESLint bans `phaser` imports in `components/typography/`
and `design/`.

End-to-end tests (`client/e2e/`, plan F1): projects `mobile-390`, `mobile-360`, `landscape-844` and
`desktop-1440`. `E2E_BASE_URL` (default `http://localhost:3001`) is the client under test and
`E2E_API_URL` (default `http://localhost:3005`) the mocked backend origin; locally Playwright starts
no server, in CI it runs `next start`. The fixtures (`e2e/fixtures/`) mock the backend through
`page.route`, fail a test on any `pageerror`, unmocked backend call or wrong auth header (not
lowercase `accesstoken`, or a token without the `fb` prefix), pin the clock to 2026-09-30T12:00Z and
seed `Math.random`, and block every host outside an allowlist (`E2E_ALLOWED_HOSTS`,
`E2E_FORBIDDEN_HOSTS`; a production API host fails the test). `E2E_CHROMIUM_PATH` points Playwright
at an installed Chrome for Testing when the bundled headless shell is missing. Spec-specific knobs:
`E2E_SHOTS_DIR` (save screenshots), `E2E_PURRSUIT_TRIALS` (runs per frame rate in the Purrsuit
first-spike spec, default 3; the plan's 100 for a full check) and `E2E_APP_BUILD=1` (run the app-build
cases against an app export served at `E2E_BASE_URL`; for the golden path and its runtime copy scan,
build the export with `NEXT_PUBLIC_IS_APP=1 NEXT_PUBLIC_E2E=1` into a side `NEXT_DIST_DIR`, serve it
statically with `.html` resolution, and run `golden-path.spec.ts` with `E2E_APP_BUILD=1`; CI does not
run this layer yet). The E2E-only hooks
(fake Firebase adapter `window.__TT_E2E_AUTH__`, crash probes `?__crash=`, `window.__ttGames`) work
only in development or a build with `NEXT_PUBLIC_E2E=1`, which must never be deployed. Run specs
that boot Phaser with `--workers=1` or `2` against a shared dev server; under load they time out.
The reel capture has its own config: `npx playwright test -c e2e/capture/playwright.capture.config.ts`
against a `NEXT_PUBLIC_CAPTURE=1` build.

## Catnip Heist

```bash
cd catnip-heist
npm install
npm run dev                  # Vite on :5173
npx tsc --noEmit
npx vitest run
npm run e2e                  # Playwright (QA build, VITE_HEIST_QA=1)
npm run build:client         # HEIST_BASE=/heist-game/ into ../client/public/heist-game
npm run vendor-sim           # re-vendor the sim into backend/src/vendor/heist-sim; vendor-sim:check in CI
```

The client serves the build at `/heist-game/` and hosts it in `pages/heist.tsx` through an iframe
bridge (`shared/heist-bridge.ts`). Rebuild `client/public/heist-game` after any Heist source change
and add it with `git add client/public/heist-game` (the build is committed). `npm run import-assets`
needs `client/node_modules` (sharp, through the catnip exporter) and `../cat-assets`, and rewrites all
assets. Flags: `VITE_HEIST_BUILD=replay|verify` compiles the crash and analytics modules out,
`VITE_HEIST_QA=1` installs the QA hooks, `VITE_POSTHOG_KEY` (and optional `VITE_POSTHOG_HOST`)
enables consent-gated crash and run events; `HEIST_BASE` sets the base path, and `HEIST_PAYOUTS_URL`,
`HEIST_DEPLOYMENTS_URL` and `HEIST_GIVE_URL` the win-screen payouts link, its on-chain total and the
treat button (an empty `HEIST_GIVE_URL` hides it); runtime config comes from
`window.__TT_HEIST_CONFIG__` or the `heist:api-url` / `heist:facts-url` meta tags in `index.html`
(empty by default, so a deploy can fill them without a rebuild; an unreplaced `%VITE_...%` placeholder
counts as empty). Otherwise the API is picked from the page host, `tokentails.com` to `api.tokentails.com` and `localhost:3000/3001` to `localhost:3005`).
`vendor-sim:check-remote` takes the backend URL as an argument or `HEIST_BACKEND_URL`.

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

See [MOBILE.md](MOBILE.md). `npm run build:app` switches `next.config.js` to `output: "export"`
because `.env.app` sets `NEXT_PUBLIC_IS_APP`; `npm run check:app-export` then verifies `out/`.

## Coding conventions

- Backend: Prettier with 4-space indent, single quotes, 120 columns. Absolute imports from `src/`. Business logic currently lives in controllers; new work should prefer services.
- Client and CMS: Prettier defaults with 2-space indent and single quotes in the CMS. Tailwind for styling. Path alias `@/`.
- Shared enums, error codes, caps and reward constants come from `shared/` (next section). Change them there, never in a generated copy, and check the hand-kept copies listed below.

## Shared contracts and generated files

The packages stay separate, but duplicated contracts are generated, not hand-edited (plan F2).
`shared/` holds framework-free TypeScript that compiles under the backend's TypeScript 4.8 (no
`satisfies`, no const type parameters, no dependencies). `shared/manifest.json` maps each file to the
packages that receive it.

```bash
node scripts/sync-contracts.mjs            # write changed copies (atomic, only files whose content changed)
node scripts/sync-contracts.mjs --check    # exit 1 on drift, an unlisted shared file, a cross-target import or an orphan; CI runs it
node --test 'scripts/__tests__/*.test.mjs' # the script's own tests (a bare directory argument does not work on Node 22)
```

| Shared source | Holds | Copied to |
|---|---|---|
| `shared/enums.ts` | `GameType` (incl. `CATNIP_HEIST`), `GamePlatform`, `LIVE_GAME_OUTCOMES`, `StarterBreed`, `CAT_ORIGINS`, `OrderStatus` (incl. `LOCKED`, `FAILED_GRANT`), `RescueGoalStatus`, `DONATE_SOURCES`, `ShelterDonationStatus`, `SHELTER_ROLES`, `PARTNER_STATUSES`, `HANDOVER_STATUSES`, `CatAbilityType`, `Tier`, `BlessingStatus` | backend, client, cms, heist |
| `shared/errors.ts` | The F5.6 error codes, `errorCodeOf(body)` | backend, client, cms, heist |
| `shared/caps.ts` | Purrsuit, Cupid Cat and Paw Match levels and caps (endless and season caps 500), totals, `REWARDS`, `GUEST_TAILS_LIFETIME_CAP` (2,000), `PLEDGE_DAILY_CAP` (5,000), `HEIST_LEVELS`, `HEIST_LEVEL_CAPS` (must match the vendored sim), `HEIST_STAR_MASK`, `HEIST_TICK_HZ`, `HEIST_MAX_TICKS`, `HEIST_MAX_RUNS`, `HEIST_MAX_ID_LENGTH`. Tables are frozen | backend, client, cms, heist |
| `shared/storefront.ts` | `/cat/sale` types, `STOREFRONT_REQUIRED_KEYS`, `parseStorefront` (never throws) | backend, client, cms |
| `shared/heist-bridge.ts` | Host and iframe message types of the Heist bridge, `isHeistRunLog` | backend, client, heist |
| `shared/copy.ts` | `TAILS_WORD`, `formatTails`, `TAILS_NO_CASH_VALUE`, `CAT_NAP_TAILS`, `CAT_NAP_MAX_CATS`, `CAT_NAP_DAYS`, `TAILS_MODES` | backend, client, cms, heist |
| `shared/name.ts` | `normalizeCatName` and its vectors, name report reasons and statuses | backend, client, cms |
| `shared/analytics-core.ts` | Event names and areas, the consent key, the scrubber, the session budget | client, heist |
| `shared/__tests__/*.test.ts` | Tests of the above, run by the client's jest | client |

Generated locations: `backend/src/shared-contracts/`, `client/shared-contracts/`,
`cms/shared-contracts/`, `catnip-heist/src/shared-contracts/` (each file starts with
`// GENERATED by scripts/sync-contracts.mjs`). Existing export names were kept as re-exports:
`backend/src/game/game.schema.ts`, `backend/src/user/utils/catnip-accounting.ts`,
`backend/src/shared/constants/rewards.ts`, `backend/src/shelter/onchain/shelter-onchain.schema.ts`,
`backend/src/web3/order.schema.ts` (`OrderStatus`), `client/models/game.ts`,
`client/constants/catnip-accounting.ts`, `client/constants/rewards.ts`, `client/api/shelter-api.ts`,
`cms/models/cats.ts` and `cms/models/blessing.ts` all import from the generated copies.

Other generated files, each with its generator and a check mode:

| Output | Generator | Source | Check |
|---|---|---|---|
| `client/styles/tokens.css` | `client/scripts/build-tokens.mjs` (`npm run tokens:build`) | `client/design/tokens.ts` | `npm run tokens:check` |
| `client/public/fonts/`, `cms/public/fonts/`, `catnip-heist/public/fonts/`, `client/styles/fonts.generated.scss`, `cms/styles/fonts.generated.scss`, `cms/styles/fonts.preload.generated.ts`, `client/components/typography/fonts.generated.ts`, `catnip-heist/src/ui/fonts.generated.ts` | `client/scripts/sync-fonts.mjs` (`npm run fonts:sync`) | `@fontsource` packages, `@capsizecss/metrics` | `npm run fonts:check` |
| `client/components/shared/icons/pixelarticons.ts` | `client/scripts/codemods/sync-pixel-icons.mjs` | `pixelarticons` 2.4.1 (MIT) | `--check` |
| `client/public/icons/*`, `client/public/favicon.ico`, `client/resources/logo.png`, `client/resources/store/app-store-1024.png`, `client/public/logo/og-v2-1200x630.jpg` | `client/scripts/build-icons.mjs` (`npm run icons:build`) | `client/resources/source/logo.png` and hand-authored 16 and 32 px matrices | `npm run icons:check` |
| `client/public/catnip/catnip-v2-*.png`, `client/public/logo/catnip.webp`, `client/public/catnip-chaos/items/catnip-coin.png`, `catnip-heist/public/assets/images/catnip.webp` and `catnip-16.png` | `client/scripts/art/catnip-export.mjs` | `client/art/catnip/*.txt` matrices | `--check` (hash-pinned in `__test__/catnip-art.test.ts`) |
| `client/art/palette.json`, `palette.gpl`, `client/public/base/*-night-v1.png`, `client/public/landing/plates/*-v1.png`, `client/public/look/posters/*`, `client/public/look/manifest.json` | `client/scripts/art/build.mjs` | `design/tokens.ts`, the landing hero, the runtime tile sheets | `--gates` |
| `client/public/match3/pointer/glove.png` | `UPDATE_GLOVE=1` jest run of `__test__/match3-glove.test.ts` | `components/Match3/glove.ts` matrix | the same test |
| `client/public/impact/snapshot.json` | `client/scripts/snapshot-impact.mjs` (`IMPACT_SOURCE_URL`) | `GET /impact` | `--check` (fails on a dev-sourced file) |
| `client/public/reel/manifest.json` | the reel capture (`e2e/capture/`) | `client/components/reel/reel-manifest.json` | `__test__/art-reel.test.tsx` |
| `backend/src/vendor/heist-sim/*` | `catnip-heist/scripts/vendor-sim.mjs` (`npm run vendor-sim`) | `catnip-heist/src/sim/server.ts` | `vendor-sim:check`, `vendor-sim:check-remote -- <backend url>` |
| `client/public/heist-game/` | `npm run build:client` in `catnip-heist/` | the Heist source | `client/scripts/check-app-export.mjs` (app export) |
| `funding/framework/facts/FACTS.md`, `client/public/facts/facts.json`, `client/lib/facts.generated.ts`, `backend/src/impact/facts.generated.ts`, `catnip-heist/src/facts.generated.ts`, `client/public/shelter-payouts/campaign.json` | `node funding/framework/bin/fund.mjs facts build` | `funding/framework/facts/facts.json` (see CLAIMS.md) | `facts build --check`, `fund facts gate` |

Hand-kept copies that remain (keep them equal by hand; most are pinned by a test):

| Copy | Matches | Note |
|---|---|---|
| `backend/src/cat/cat.schema.ts` `Tier`, `CatAbilityType`; `backend/src/blessing/blessing.schema.ts` `BlessingStatus` | `shared/enums.ts` | Same values; not yet re-exports |
| `client/models/cats.ts` `BlessingStatus`, `CatAbilityType`, `Tier` | `shared/enums.ts` | Same values |
| `client/models/order.ts` `OrderStatus` | `shared/enums.ts` | Lacks `LOCKED` and `FAILED_GRANT` (known issue); should re-export the shared enum |
| `client/analytics/events.ts` `GameStopOutcomeInput` | `LIVE_GAME_OUTCOMES` | Subset |
| `client/components/Phaser/events.ts` `NPC_TYPE` slugs | `STOREFRONT_REQUIRED_KEYS` | |
| `client/components/Match3/match3.config.ts` Paw Match cap formula | `match3CatnipCap` | Pinned by `catnip-accounting.test.ts` |
| `client/constants/catnip-accounting.ts` `CATNIP_CHAOS_LEVEL_CAPS` (79 playable levels) | `shared/caps.ts` (97 backend slots) | Each index agrees; the client list is a prefix (known issue: the backend counts 180 unreachable catnip) |
| `client/components/PixelRescue/ftue.ts` `CUPID_GIFT_TAILS` (10,000) | `QuestTypeReward[PIXEL_RESCUE_LEVEL]` in `backend/src/user/user.schema.ts` | |
| Outcome types: `backend/src/impact/outcome.schema.ts`, `cms/models/outcome.ts`, `client/pages/impact.tsx` `OUTCOME_LABEL` | each other | `outcome-copies.spec.ts` |
| `NATIVE_BACKGROUND` in `client/capacitor.config.ts`, `tt_night_900` in `client/android/app/src/main/res/values/colors.xml`, `CrashPanel.tsx` night literal | `THEME_COLOR` (`#0b0820`) in `client/design/tokens.ts` | The Capacitor copy is pinned by a test; the palette allowlist names the others |
| Heist UI colours (`catnip-heist/index.html`, `src/ui/styles.ts`, `src/ui/levels/styles.ts`) | `client/design/tokens.ts` gold-400 and night-900 | `palette-parity.test.ts` |
| Fonts outside the generator: the Heist `HEIST_BODY_FONT` users, Stripe's and the Wallets Kit's system font stacks (`components/web3/nightTheme.ts`) | `TYPE_ROLES` | The iframe and the shadow DOM cannot load our fonts |
| The facts and claims wording in copy | `facts.json` | Cited by id (`data-claim`, `<Claim>`), enforced by `tools/copy-lint` |
| Heist HTML meta (`catnip-heist/index.html`: canonical, theme-color, icons) | the client meta (`pages/_document.js`, `components/seo/site.ts`) | `palette-parity.test.ts`, `check-meta.mjs` |
| Shelter cat price: `Prices.shelterCat` in `client/models/cats.ts` and `cms/models/cats.ts` | `SHELTER_CAT_MIN_PRICE_CENTS` in `backend/src/payments/price-table.ts` | `client/__test__/crypto-pay-contract.test.ts` |
| Pack prices: `packPrices` in `client/components/shared/PacksModal.tsx` (the cards; Legendary says $400, known discrepancy) | `PACK_PRICES_CENTS` in `backend/src/payments/price-table.ts` (Legendary $350, charged by both checkouts) | None yet. The checkout summary and the crypto quote read the server price from `GET /payments/crypto/config` `prices`, so only the pack card can differ (`modals-a-payment-gate.test.tsx`) |
| Crypto checkout chains `backend/src/payments/crypto/crypto-chains.ts`; error codes and types `client/models/crypto-pay.ts` | `funding/framework/tracks/a-build/chains.json`; `CRYPTO_PAY_CODES` in `crypto-checkout.service.ts` | `crypto-chains.spec.ts`, `crypto-pay-contract.test.ts` |
| Rail treat amounts C-004, C-005, C-006 in `facts.json` | `backend/src/shelter/onchain/shelter-onchain.config.ts` | `facts build --check` fails on a mismatch |

## Continuous integration

`.github/workflows/ci.yml` (decision #59, GitHub Actions replaces GitLab): `contracts`
(`sync-contracts --check`, its tests, `fund facts build --check`, the funding framework tests),
`backend` (lint, build, test), `client` (tsc, the e2e tsconfig, eslint, jest, a `NEXT_PUBLIC_E2E=1`
build and Playwright), `cms` (tsc, test), `heist` (vitest, `build:client`), `copy-lint` (its own
tests, then the lint over the repo; the lint step is warn-only until task 7b makes it blocking) and
`bundle-guards` (the palette guard, a production web build and an app export, grepped for test and
capture hooks). `push` runs on `main` only; pull requests run through `pull_request`.
`facts-weekly.yml` runs the facts report on Mondays, `cdn-sync.yml` uploads `client/public` to the
CDN (DEPLOYMENT.md), `catnip-heist-pages.yml` publishes the Heist to GitHub Pages after checking the
backend serves the same sim. Making the jobs required checks on `main` is a GitHub settings step.

## Secrets and repository hygiene

- Never commit `.env` files with secrets. `client/.env.app`, `client/.env.production`, `cms/.env.development`, and `cms/.env.production` are tracked today and must contain only public values.
- Firebase service-account identifiers are hardcoded in backend source. The retired Telegram bot tokens were removed from source but remain in git history; revoke both bots through BotFather. The TinyMCE key and Firebase web config are hardcoded in CMS and client source. Moving them to environment variables is the first cleanup to do.
- The soroban-nft README contains RPC URLs with an embedded API key.
- `client/tokentails-keystore` and `client/certificates/` are gitignored. Keep them that way.
- Committed build artifacts to remove: `client/android/app/release/app-release.aab`, `cms/client/.next/trace`, the `.DS_Store` files.
- `backend/migrations/` is gitignored but should be tracked.

## Agent tooling in the repo

`.claude/skills/` and `.agents/skills/` hold BMAD method skills installed for AI-assisted
development, with `skills-lock.json` pinning their sources. `.playwright-cli/` holds browser
session logs from earlier automated QA runs. All three are untracked or ignored and are not part
of the product.
