# Backend (`backend/`)

The backend is a single NestJS 9 service backed by MongoDB through Mongoose 6. It authenticates
users through Firebase, stores cats, blessings, shelters, orders, and game scores,
generates AI art, takes payments through Stripe and Stellar, and runs a handful of cron jobs.

Companion docs: [API.md](API.md) for the endpoint reference, [DATA_MODEL.md](DATA_MODEL.md) for
the schemas, [ARCHITECTURE.md](ARCHITECTURE.md) for how the clients use it.

## Stack

| Item | Value |
|---|---|
| Runtime | Node.js (developed on 22.x), NestJS 9, TypeScript 4 |
| Database | MongoDB via Mongoose 6, `mongoose-unique-validator` (not on `Order`, see known issues), Atlas `$search` for autocomplete |
| Auth | Passport custom strategy over Firebase Admin 11 |
| AI | OpenAI (`gpt-4o-mini` vision) for cat classification and stories, Google GenAI (Gemini image model) for avatars and portraits |
| Payments | Stripe 20 (Checkout Sessions, PaymentIntents, webhook), Stellar SDK 15 (Horizon transaction verification, custodial keypairs) |
| Storage | DigitalOcean Spaces through the AWS S3 SDK, `sharp` and `heic-convert` for image processing |
| Email | SendGrid REST API via `fetch` |
| Scheduling | `@nestjs/schedule` cron jobs |
| Rate limiting | `@nestjs/throttler` as a global `APP_GUARD` (`src/shared/guards/app-throttler.guard.ts`): 300 requests per minute per IP by default, tighter `@Throttle` limits on paid image routes. Per-player limits through `UserThrottlerGuard` (`src/shared/guards/user-throttler.guard.ts`, keyed on `req.user._id`, fails closed) on reward, give, treat and cat-nap routes |
| Chain | ethers v6 for the shelter rail on seven EVM chains (Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain, Monad): ShelterSplit gifts, payout indexer, paw settlement |
| Heist replay | The Catnip Heist simulation, vendored into `src/vendor/heist-sim/` by `catnip-heist/scripts/vendor-sim.mjs` (hash-pinned, `npm run vendor-sim:check` in `catnip-heist/`) |
| Shared contracts | `src/shared-contracts/` is generated from the repo-root `shared/` (see DEVELOPMENT.md); never edit it by hand |
| Migrations | `migrate-mongo`, plus dry-run-by-default scripts in `backend/scripts/` |

## Scripts

```bash
npm install                 # postinstall forces a native rebuild of sharp
npm run dev                 # nest start --watch
npm run debug               # nest start --debug --watch
npm run build               # rimraf dist && nest build
npm run start               # node dist/main (production)
npm run lint                # eslint over src (check only)
npm run lint:fix            # eslint --fix over src
npm test                    # jest (src/**/*.spec.ts)
npm run format              # prettier over src
npm run migration:up        # migrate-mongo up
npm run migration:down      # migrate-mongo down
```

The `test:avatar` script points at a `scripts/` folder that does not exist. The file it means is
`src/shared/test-ai-avatar.ts`. `npm test` runs jest over `src/**/*.spec.ts`. The specs mock
Mongoose models, repositories and external SDKs and do not read a local env file. A few specs run
against a real MongoDB only when you opt in, each in a scratch database they drop afterwards:
`MONGO_IT_URI` (staking, lease, rescue goals, ledger scripts), `IDENTITY_SPEC_MONGO_URL` (identity,
starter) and `LIVE_SPEC_MONGO_URL` (Heist saves and migrations), for example
`MONGO_IT_URI=mongodb://localhost:27017 npx jest src/cat/cat-staking-mongo.spec.ts`. Without the
variable they are skipped. `HEIST_BENCH=1` turns on the replay timing assertions.

`npm run build` runs `rimraf dist` first. While a `npm run dev` watcher serves from `dist/`, type-check
with `npx tsc -p tsconfig.build.json --outDir <scratch dir>` instead.

## Bootstrap

`src/main.ts` does the following:

- Creates the app with `rawBody: true`.
- `applyBodyParsers` (`src/user/heist/live-body-limit.ts`) mounts, in order: `express.raw()` on `/image/webhook` so Stripe signature verification can read the untouched body; a 64 KB JSON parser on `/user/catbassadors/live` (a non-JSON body there is 415 before any parser, an oversized one a JSON 413); then `express.json({ limit: '50mb' })` for everything else (known issue).
- Registers a global `AppValidationPipe({ transform: true })` (`src/user/dto/live-game.dto.ts`): the old `ValidationPipe` except that it leaves `LiveGameDto` to its route pipe, so a bad Heist log gets its coded 400 instead of a code-less one. There is no global `whitelist`: most `@Body()` types are undecorated Mongoose schema classes that it would strip to `{}`, and interface or inline body types are never validated. Routes with a decorated DTO add a strict route-level pipe (`profileWritePipe` on the profile write routes, `liveGamePipe` on `POST /user/catbassadors/live`, `ShelterWriteDto` on the shelter writes). Everywhere else unknown body fields still pass through, so search handlers pass `pickSearchParams(params)` (`src/common/validators.ts`: `page`, `perPage`, `sort` only) to `BaseRepository.find`, never the raw body.
- Sets Express `trust proxy` (`src/shared/trust-proxy.ts`). By default it trusts our own hops only: loopback, private, link-local, carrier-grade NAT (100.64.0.0/10) and Cloudflare's edge ranges, so `req.ip` is the first address from the right that is not ours (the visitor) with no env. `TRUST_PROXY` is an optional override (any Express value; `0` or `false` turns trust off). It logs once what the first request resolved to (the kind of address, never the address).
- Enables CORS with credentials for `localhost` variants, `capacitor://localhost`, the production domains, and any origins listed in `FRONT_END_URLS`. If that variable is unset the origin list falls back to `*`.
- Listens on `PORT`, defaulting to 3005.

There is no Swagger, no global guard other than the throttler (`AppThrottlerGuard`, registered as `APP_GUARD`), no global exception filter, and no static file serving.

## Module layout

There is exactly one Nest module, `AppModule` in `src/app.module.ts`, plus a small global
`FirebaseAdminModule`. Every controller, repository, and service is registered directly in the
root module. Each folder under `src/` is a domain with a controller, a repository, and a schema,
but no module file.

| Folder | Responsibility |
|---|---|
| `src/app.controller.ts` | Health check and public traction counters refreshed daily. |
| `src/user/` | Users, profiles, leaderboards (`boards.ts`), daily check-in and wheel (`wheel.ts`), referrals, codex, airdrop progression, game score submission, auth strategies, the Tails ledger (`tails-ledger.ts`), the Vault status (`token-status.ts`). `src/user/guest/` holds identity resolution helpers, the guest session, merge, erase and cleanup, account deletion, disposable domains and the starter art. `src/user/heist/` holds the Heist replay branch of `/live`, its queue, IP throttle, body limit and migrations. `starter.controller.ts` serves Meet your cat and following. |
| `src/cat/` | Cat catalog, storefront (`storefront.ts`), starters and names (`cat-name.service.ts`, name reports), cat nap staking (`cat-staking.service.ts`), feeding, NFT metadata, exchange-rate proxy. |
| `src/blessing/` | Shelter "blessing" records (a real rescued animal, or a paid portrait: `kind`) and the AI cat generated from each; featured rescue cats (`featured.service.ts`). |
| `src/shelter/` | Partner shelters, their generated Stellar wallets, roles and partner status, and members (`shelter-members.service.ts`). `src/shelter/onchain/` holds the shelter gifts on every chain in `wallet.config.ts` (`POST /shelter/donate`, reconcile job), the wallet gift relay and match, shelter claims and the x402 agent cat card, through ShelterSplit, DonateRouter and ethers v6. |
| `src/impact/` | The truth data layer (plan F7, G4, G11): payout log indexer, hourly impact snapshot, eligibility policies, nightly paw settlement, payout attestation, shelter outcomes, purchase pledge, `GET /impact*`. |
| `src/rescue-goal/` | Rescue Goals (plan G5): goals, the give saga, the sweeper, deliveries and receipts. |
| `src/common/guards/`, `src/common/decorators/` | `AppAuthGuard`, the guest allow-list, `@AllowGuest`, `@AUTH_USER`, auth error bodies. |
| `src/shared/jobs/` | `runLeased` and `claimJobPeriod`: one lease document per cron job in `jobruns` (plan F8). |
| `src/vendor/heist-sim/` | The vendored Heist simulation (generated). |
| `src/shared-contracts/` | Generated copies of `shared/` (enums, error codes, caps, storefront, Heist bridge, copy, names). |
| `src/yourcat/` | Bet #3 `/yourcat` (docs/plans/yourcat-v2.md): one photo becomes the player's cat. Controller, service (`makePlayable`, upload and manual pipelines, rename, views, portrait checkout), the `YourCat` schema, family rules (`family.ts`), the avatar pixel grid (`pixelate.ts`), the paid HD portrait delivery (`portrait-delivery.service.ts`) and the retention job. Request and response shapes in `yourcat.contracts.ts` (client copy `client/models/yourcat.ts`). |
| `src/ai-budget/` | Bet #3 AI spend control: the global daily budget and daily quotas (`AiBudgetDay`, `AiQuota`), `AiUploadGate` (client IP, App Check with replay protection, per-IP, failure and per-user caps, budget), cost measurement (`ai-cost.ts`) and the cost alerts (`ai-alert.ts`). |
| `src/image/` | Image uploads, AI portrait generation, Stripe Checkout, Stripe webhook, order status. |
| `src/web3/` | Orders, Stellar payment verification, Stripe PaymentIntents, pack grants, discount codes. |
| `src/article/`, `src/category/`, `src/feed/` | Editorial content and the public feed. |
| `src/comment/` | Polymorphic comments on articles, cats, blessings, packs, images. |
| `src/quest/` | Quest CRUD, quest completion rewards, contest mystery boxes. |
| `src/ticket/` | Support tickets. |
| `src/game/` | `Game` schema and level tables. No controller; scores arrive through the user controller. |
| `src/printify/` | Printify print-on-demand client. Registered but never injected. |
| `src/common/` | `BaseRepository`, shared schema fields, search DTOs, utilities. |
| `src/shared/` | Guards, decorators, reward constants, encryption service, AI and storage utilities. |
| `src/portrait/` | Empty directory. |

Imports use the absolute `src/...` form, enabled by `baseUrl: "./"` in `tsconfig.json`.

### Repository pattern

`src/common/base.repository.ts` wraps a Mongoose model with `get`, `find`, `findOne`, `create`,
`update`, `updateAll`, `count`, `delete`, `deleteMany`, and `insertMany`. `find()` builds an
aggregation pipeline: a `$match` or Atlas `$search` stage, an optional second `$match`, `$sort`,
custom stages, `$skip` and `$limit`, then `$project`, followed by `populate()`. Each aggregation
runs with a ten minute `maxTimeMS`. Default page size is 50.

## Authentication

Every authenticated request carries a single lowercase header, `accesstoken`. There is no
`Authorization: Bearer` scheme.

1. `AppAuthGuard` (`src/common/guards/app-auth.guard.ts`, plan F5.4) runs the custom Passport strategy in `src/user/strategies/`. Every guarded route uses it (71 former `AuthGuard('appauth')` uses across 12 controllers; `src/guard-migration.spec.ts` fails on a new `AuthGuard()`).
2. The strategy looks at the first two characters of the token.
   - Prefix `fb`: the rest is a Firebase ID token, verified with Firebase Admin. Anonymous Firebase users (guests) are Firebase tokens too.
   - Anything else, including an empty token or the string `null`: the request fails with 401. There is no fallback lookup.
3. Resolution is uid-first (`UserService.getFirebaseUser`, plan F5.2). It splits on `sign_in_provider`:
   - **Anonymous** (`resolveGuest`): the guest's document, or a transient template profile with nothing written. Only `POST /user/guest/session` (and the starter commit through it) creates the guest document.
   - **Registered** (`resolveRegistered`): (1) a document whose `firebaseUids` holds the token uid wins; a guest document found this way is promoted in place, its pending Tails credited up to the lifetime cap. (2) Otherwise the email lookup (lowercased, Gmail aliases share `emailCanonical`) binds the uid only for `email_verified === true` tokens. The provider (`google.com`, `apple.com`) is not trusted on its own: a linked Google identity on an unverified password account would otherwise bind someone else's address. A unique-index clash while binding is 409 `ACCOUNT_CONFLICT`. (3) An unverified token with no document is 403 `EMAIL_UNVERIFIED` and nothing is written (`AUTH_ENFORCE_EMAIL_VERIFIED`, default true). (4) A verified new identity is created by a uid upsert: onboarding pending, an idempotent unlocked SCOUT starter, a generated Stellar wallet written only on insert, the per-IP new-account throttle and the disposable-domain check (decision #5).
   - A token whose Firebase user was deleted gets 401 on the insert paths, so a deleted account is not recreated.
4. The guard then checks the route: a guest without `@AllowGuest()` gets 403 `GUEST_FORBIDDEN`; a transient guest on a route without `{transient: true}` gets 428 `GUEST_SESSION_REQUIRED` (the client creates the session once and retries). Strategy `HttpException`s (403, 409) reach the client unchanged. Error bodies are `{statusCode, code, message}` with the codes from `shared/errors.ts`.
5. The resolved user becomes `request.user`; `@USER_ID()` and `@AUTH_USER()` read it. Board queries use `notGuestFilter()` / `boardFilter()`.

The guest allow-list (`src/common/guards/guest-allow-list.ts`, decision #9) is the one reviewed list of
routes a guest may call: `GET /user/profile` and `POST /user/guest/session` and `DELETE /user/guest`
(transient allowed), `POST /user/catbassadors/live`, `PUT /cat/:id` (feed; the reward goes to
`pendingTails`), the read-only position and progress previews (`GET /user/cats`,
`/user/airdrop/progression`, `/user/leaderboard/position`, `/catnip/position`,
`/paw-match/:level/position`, `/rescuers/position`), and Meet your cat (`POST /user/starter`,
`PUT /cat/:id/name`, `POST` and `DELETE /user/following/:blessingId`). Everything else (spin, quests,
adopt, buy, gift, stake, redeem, tickets, referral, claims, gives, treats) is registered-only. A
spec keeps the list and the `@AllowGuest` decorators equal.

Guests (plan G1, decisions #7 to #13) earn Tails only into `pendingTails`, capped at 2,000 for life
(`GUEST_TAILS_LIFETIME_CAP`), credited on promotion or merge. They are on no leaderboard and in no
traction count; position routes answer `{position, wouldBe: true}`. Signing in to an account that
already exists merges the guest (`POST /user/guest/merge` with the `x-guest-token` header): best
scores are the element-wise max, Heist stars are OR-ed, Game rows are re-parented, the guest starter
is dropped (decision #8), at most one merge per account per 30 days; every step is idempotent and a
leased cron resumes interrupted merges. Guests idle for 30 days are deleted (decision #11). App Check
(`x-firebase-appcheck`) is checked on `POST /user/guest/session` and enforced only when
`APP_CHECK_ENFORCE=true`.

Account deletion (`DELETE /user/me`, decision #4) anonymises the document (name "Deleted player",
personal fields removed, board fields zeroed, `deletedAt`), deletes the Firebase users, removes the
starter and releases the other cats (a rescue cat whose blessing has no adoptable cat left returns
to `GET /cat/sale`; other copies are detached), revokes Sign in with Apple first when the client sends
a fresh `appleAuthorizationCode` and the `APPLE_*` keys are set, and writes an audit row to
`accountdeletions` with ids and counts only. The custodial wallet stays on the record (support step).

Roles are a numeric ladder on `User.permission`: `USER=1`, `MODERATOR=2`, `EDITOR=3`,
`MANAGER=4`, `ADMIN=5`. `PermissionGuard(n)` in `src/shared/guards/permission.guard.ts` passes
when the caller's level is at least `n`. It is always composed after `AppAuthGuard`. Only an ADMIN
changes a user's `email` or `permission`, or creates a user above USER (W1 hotfix, decision #33).

The Stripe webhook is the only inbound call authenticated another way: signature verification
with `STRIPE_WEBHOOK_SECRET`. Cron jobs run in-process and are not HTTP triggered.

## Domain behaviour

### Cats, blessings, shelters

- A **blessing** is a rescued animal registered by a shelter user. Creating one calls OpenAI to classify the cat's look and write a short rescue story, then Gemini to paint an avatar, and finally creates the linked **cat** document.
- A **cat** has an ability type (ice, electric, fire, wind, dark, water, grass, sand, fairy, stellar), a tier (common, rare, epic, legendary), sprite and card art on the CDN, an owner, an optional blessing, and an `EAT` status.
- **Blueprint** cats are templates. Packs, redeem codes, quests and moderator gifts clone a catalogue cat into a new document owned by the user (`buildCatCopy`: identity, ownership, starter flags and token fields stripped, `origin` and `sourceCat` set) with `packed: true` until the user opens the pack. Ownership dedupe is by `blessing` or `sourceCat` (`CatService.ownsCopyOf`) plus the unique partial index `copy_per_owner_source`. The self-adopt route `GET /cat/adopt/:_id` is retired and always answers `{success: false}`.
- **Starters** (plan G3): every account has one starter cat (`isStarter`, unique partial index `starter_per_owner`). New and guest starters are an unlocked SCOUT; Meet your cat commits the breed (SCOUT, PINKIE, SHADOW, MISTY, SUNNY, decision #19) and name once through `POST /user/starter` (`starterLockedAt`; then 409 `STARTER_LOCKED`). Names go through the shared `normalizeCatName` (`shared/name.ts`: Latin only, 2 to 16 characters, reserved and blocked words, EN and LT profanity on a folded skeleton; decision #23). One free rename per 30 days, frozen once minted (decision #22); legacy Cleocatra owners get a one-time `renameOffer` (decision #20). Players report names (`name_reports`); moderators reset, rename or dismiss, and moderation overrides the mint freeze.
- **Following**: `User.following` holds up to 50 rescue blessings (never portraits). Notifications come later by email or push (decision #25).
- **Storefront** (`GET /cat/sale`, `src/cat/storefront.ts`, plan G13): the required keys `tokentails`, `token-tails`, `token-tails-2` and `rozine-pedute` are always arrays and every shelter-slug key it returned before is kept; whitelisted fields only (never `owner`, `code`, `staked` or a blessing `creator`); at most 200 blessed cats per shelter (newest first) and 1,000 overall, plus 10 sampled blueprints; a 45 s single-flight cache invalidated by every adoption; an additive `_meta {_v: 1, generatedAt, shelters[{slug, name, role}]}`. The client parses it with the shared `parseStorefront`, which never throws.
- Staking is the "cat nap" (plan G5 P2, task 4e): a nap locks a cat for one week, then pays a flat 50 Tails, whatever the tier. At most 3 cats per owner nap at once (409 `CAT_NAP_LIMIT`). Stake and claim are owner-filtered atomic updates on the cat (W1 hotfix): another user's cat is 404, a second stake 409, parallel claims pay once. `src/cat/cat-staking.service.ts`; the numbers live in `shared/copy.ts`.
- Feeding fills `EAT` to the maximum and pays one Tail. Only the cat's owner can feed it. The owner check and the `EAT` cap sit in the filter of one conditional update, so concurrent requests pay at most once per fill. A guest's feed reward goes to `pendingTails` (stopping at the cap). A nightly cron empties every cat.
- Shelters are slugified and receive a generated Stellar wallet on creation. They carry `role` (`partner` or `house`; house zones such as the catfluencers and the event zone are never partners), `countryCode` (ISO alpha-2), `partnerStatus` (`active`, `past`, `prospect`; only `active` counts as a partner) and the custody fields `handoverStatus`, `handoverAt`, `handoverTx`, `publicWallet` (ADMIN-only writes). `GET /shelter` and `GET /shelter/:id` return a whitelist projection (never `wallets`, `users`, `code`, `members` or `blessing`).
- Blessings carry `kind` (`rescue` or `portrait`, set at creation from the shelter; a move that would change it is 400) and `statusUpdatedBy` / `statusUpdatedAt`. `rescueBlessingFilter()` is the one rescue filter for counts, featured cats and the pack pool; public rescue counts also leave out house zones.

### Economy

**Tails** are rescue points (plan G5, task 4e), never "$TAILS". The ledger is split
(`src/user/tails-ledger.ts`): `tails` is the spendable balance, `tailsEarned` is lifetime earned and
never decremented, `tailsGiven` / `goalsHelped` (and the season `monthTailsGiven` /
`monthGoalsHelped`) count gives to shelter goals. Every credit goes through `earnTailsInc`, enforced
by `src/earn-tails.ast.spec.ts`; every rank, tier, threshold and REACH_TAILS quest reads earned Tails
(`earnedTails()`), so giving never costs rank. Legacy docs get `tailsEarned` from
`scripts/backfill-tails-earned.js` (dry run by default; refuses once any pledge exists). Reward
constants live in `src/shared/constants/rewards.ts`.

| Source | Amount |
|---|---|
| Daily check-in | Weighted random roll: mostly 1, 5, 10, or 25, with rare 50, 100, 250, or 1000 |
| Referral (both sides) | 100 |
| Feeding a cat | 1 |
| Cat nap (staking) | 50 per cat per week, at most 3 cats napping |
| Quests and contests | Per quest table, or 100 for camp mystery boxes |
| Weekly top 200 cron | 200 |
| Codex monthly cron | Sum of codex phases times 300 |
| Airdrop tier claims | 2500, 7500, 20000, 50000 with a legendary bonus multiplier |
| Daily wheel | Published odds (`GET /user/catbassadors/lives/odds`): 1% each for 1,000, 250, 100 and 50; 24% each for 25, 10, 5 and 1 |

Giving: Rescue Goal gives (`POST /rescue-goals/:id/pledge`) debit `tails` and add to `tailsGiven`
through `giveTailsInc`; `tailsEarned` is untouched, so giving never lowers rank, tier progress or
top-200 membership. A guest's credits go to `pendingTails` instead (cap 2,000 for life). Tails have no
cash value; the internal Tails-per-euro budgeting ratio (decision #37) is never stored or shown.
`TAILS_TOKEN_MODE` stays `POINTS` (decision #39), so no TGE date leaves the backend.

**Catnip** (`User.catnipCount`) is derived rather than granted. It is the capped sum of per-level
best scores from Catnip Chaos and Paw Match, recomputed on every score submission by
`src/user/utils/catnip-accounting.ts`. Level caps live in `src/game/game.schema.ts`.
Leaderboards drop anyone above the global cap as a cheat filter.

**Loot boxes** (`User.boxes`) are granted by quests and giveaways but are never consumed on the
server.

**Codex** tracks a monthly "Tails guard" phase anchored to 00:00 UTC on the 9th of each month. A
phase is earned when seven monthly counters all meet their thresholds. The counters reset at
23:00 UTC on the 8th (see Scheduled jobs).

**Progression** in `src/user/airdrop-progression.ts` (route still `/user/airdrop/progression` for
shipped clients) is a pure function that turns cat tiers, quests, streak, earned Tails, Tails given
and goals helped into a collectible level, eligibility flags, four claimable tiers, five challenges
(BIG_HEART and GOAL_GETTER read the season's gives), a milestone ladder and the `season` band
(`freezeAt` 22:00 UTC on the 8th, `resetAt` 23:00, `anchorAt` 00:00 on the 9th). Purchases unlock
nothing (decision #36): the purchase steps became Tails given and goals helped, and
`monetizationScore` became the giving-based `rescueScore`.

### Games

The backend is a score sink. All gameplay runs on the client; Catnip Heist runs are re-simulated on
the server. Game types are `SHELTER`, `HOME`, `PURRQUEST`, `CATBASSADORS`, `CATNIP_CHAOS`,
`PIXEL_RESCUE`, `MATCH_3` and `CATNIP_HEIST`.

The single ingestion endpoint, and the only score writer, is `POST /user/catbassadors/live`
(`src/one-writer.spec.ts` scans every source for Game-row writes). The body goes through `LiveGameDto`
and the strict `liveGamePipe` (`src/user/dto/live-game.dto.ts`), so unknown fields are a 400.
`resolveLiveGame` (`src/user/utils/live-game.ts`) accepts the scored types in `scoredGameTypes`
(`CATNIP_CHAOS`, `PIXEL_RESCUE`, `MATCH_3`), checks `level` and the per-level cap below, and builds the
stored row from the validated fields only, with `platform` defaulting to `web` and the optional
`outcome` (`won`, `died`, `timeout`, `quit`) stored when sent. Only then does the handler write the
immutable `Game` row, update the per-level best-score arrays with `$max`, set
`${field}Cleared.<i> = 1` on a `won` outcome for any level except the endless Purrsuit level `01`
(decisions #67 and #69), and `$set lastPlayedAt`. A target array stored as `null` or as an object is
repaired with a conditional pipeline before the dotted write. Client-reported scores in these three
modes are accepted by cap validation only; the server does not verify them (known issue).

`CATNIP_HEIST` is accepted only with a `replay` (plan G2 layer 2): the recorded input log (seed 1,
the current `SIM_VERSION`, two different known cat ids, at most 18,000 ticks, valid runs summing to
`ticks`). The handler looks up the log's digest (`sha256` of the canonical log, crew excluded) and
answers 409 `HEIST_DUPLICATE` for one already saved by any account (`replayDigest_unique`, global
partial index); a failed log is cached for 10 minutes so it is not replayed again; then `verifyRun`
re-simulates it through a bounded queue (concurrency 1, 16 waiting, 429 with `Retry-After` when
full) behind a per-IP bucket (`HeistReplayIpThrottleGuard`, 30 replays a minute). The row takes the
server score, `time = ticks / 30` and `outcome: 'won'`; the user gets `$max heistScore.i`,
`$bit or heistStars.i` and `lastPlayedAt`. Heist saves never touch catnip, caps, loot eligibility or
lives (decisions #14 and #17). Wire contract: API.md, "Scores". When the sim changes, re-vendor it,
deploy the backend first and then the Heist site; the Pages workflow checks
`GET /user/catbassadors/heist-sim` serves the same bundle hash before it publishes.

The route is limited to 30 saves per minute per player (`LiveGameUserThrottleGuard`, after auth; it
fails closed with 401 when the user id is missing) and 120 per minute per IP, loose enough for
players sharing a carrier-NAT, school or office address. A 429 carries `Retry-After`, which CORS
exposes so the client can retry once. Guests may save (their rows are kept through a merge); boards
filter them out.

| Game | Levels | Stored on user | Cap |
|---|---|---|---|
| Catnip Chaos (Purrsuit) | 97 (`01`, then `11` to `166`) | `catnipChaos[]`, `catnipChaosCleared[]` | 500 for the endless level `01` (decision #57), 10 for every other level |
| Pixel Rescue (Cupid Cat, season event) | 14 | `seasonEvent[]`, `seasonEventCleared[]` | 500 per level |
| Paw Match (Match 3) | 30 | `match3[]` catnip and `match3Score[]` raw score, `match3Cleared[]` | Catnip per level from a formula capped at 85; score capped at one million |
| Catnip Heist | 16 (`heist-01` to `heist-16`: Act 1 is 01-08, Act 2 is 09-16) | `heistScore[]` (best server score), `heistStars[]` (star bit mask) | `HEIST_LEVEL_CAPS` 250, 240, 220, 270, 240, 240, 240, 310 (Act 1), 270, 270, 270, 260, 270, 290, 270, 330 (Act 2), derived from the sim (`coins x 10 + 50`). Accounts saved with 8 slots grow to 16 on their next Heist save (`arrayGuardPipeline` pads `heistStars`; `$max` pads `heistScore`) |

The caps live in `shared/caps.ts` (copied into `src/shared-contracts/caps.ts`). `MAX_LEGIT_CATNIP_SCORE`
(`totalCatnipCap`, 2,758 since the cap raise; it was 2,678) filters the catnip boards.
`GET /user/catbassadors/heist-sim` is a public read-only route that serves `{simVersion,
bundleSha256, levels}` for that deploy gate; it writes nothing.

Leaderboards: global earned-Tails top 50 (sorted on `tails` until `TAILS_EARNED_BACKFILL_DONE=true`,
then on `tailsEarned`), the rescuers board by Tails given (`GET /user/leaderboard/rescuers`,
`?period=season`, and `/position`), catnip top 50, per-level Paw Match with a 15 second in-process
cache, and a catbassadors top 10. Guests and accounts flagged by `scripts/flag-board-exclusions.js`
(`boardExcludedAt`, decision #35: no clawback) are on no board and in no position count.

### Payments

Four flows, granting a portrait-derived cat, a pack cat, a loot box cat or one shelter cat on success.
Every paid grant goes through `src/web3/purchase-grant.service.ts` (moved out of `Web3Controller`
unchanged on 2026-10-04): the order is `COMPLETE` only when the adoption succeeded, `FAILED_GRANT`
otherwise, and a failed grant is refunded once (Stripe automatically, every other rail `refund.state:
'due'` for the treasury to send back by hand).

1. **Stripe Checkout** for portraits (`digital`, `print`, `canvas`) in `src/image/image.controller.ts`. The amount comes from the server price table in `src/payments/price-table.ts`; the client `amount` is ignored. A pending `Order` is created with the session id as `hash`. The webhook is the only grant path: it checks the session is paid, in USD and at least the table price, moves the order from `PENDING` to `COMPLETE` atomically (a redelivered event grants nothing), then increments spend counters, sends a SendGrid confirmation, and creates the blessing and cat.
2. **Stripe PaymentIntents** for in-app purchases in `src/web3/web3.controller.ts`, through `src/payments/stripe-payment.service.ts` (platform fix 2). `create-payment` charges the table price minus a verified discount code and ignores the client `amount`. `confirm-payment` retrieves the intent from Stripe and checks it belongs to the caller, succeeded, is in USD and covers the server price, then claims the intent id atomically (upsert on `hash`), so a replayed confirm grants nothing. Stripe and database errors are logged and answered with a fixed message. No webhook covers PaymentIntents yet; adding `payment_intent.succeeded` as the only grant path is a follow-up.
3. **Stellar** payments through `POST /web3/confirm`. **Packs are deprecated on this path (2026-10-04)**: the client no longer offers them. A `PACK` that still arrives is verified and recorded like before (the client pays before it confirms, so refusing first would lose the payment): its Stellar ledger close time (`created_at`) before `STELLAR_PACKS_SUNSET_AT` (closed `2026-10-09T18:00:00Z` by founder decision; the env can only move it earlier) grants as before; a later one is `FAILED_GRANT` (`STELLAR_DEPRECATED`) with `refund: 'due'`, no spend counted, and answers 410 `STELLAR_PACKS_DEPRECATED`. `STELLAR_PACKS_ENABLED=true` is the rollback switch. Loot boxes are still sold on Stellar (`MysteryBoxCat`); moving them is an open decision. Existing Stellar pack orders, their history, `scripts/audit-orders*.js` and the manual refunds are unchanged. The controller accepts only `IMAGE` and `LOOT_BOX` (with no `id`), and refuses anything else before an order exists. It lowercases the hash, creates a `PENDING` order with it, then `Web3Service.validatePrice` loads the transaction and its operations from Horizon (mainnet when `IS_PROD`, else testnet) and requires: the transaction succeeded; it pays the treasury (`STELLAR_TREASURY_ADDRESS`, default the public receiving account also hardcoded in `client/web3/contracts.ts`); in the order's asset (native XLM, or USDC from `STELLAR_USDC_ISSUER`, default Circle's issuer; USDT is refused); and the sum of those payments covers the server price. The price is the catalogue price of the order's item (`src/web3/order-catalogue.ts` over `src/payments/price-table.ts`, plus the client-only `LOOT_BOX` at $1 when it names no `id`), less a discount only when the code belongs to a user. A loot box is granted with common odds and no pack type. The client's `price` is ignored. XLM is valued at the live Binance XLMUSDC rate (the source of `GET /cat/rates`, from which the client quotes `ceil(usd / rate)`) with a 3 percent tolerance; if the rate is unavailable the request fails with 503 rather than falling back to the static rate. The hash must be the payment's canonical key: Horizon resolves a fee-bump transaction by its outer and its inner hash, so the verifier refuses an inner hash (`NOT_CANONICAL_HASH`) and refuses an outer hash when another order holds the inner one (409). On success the order's `price` and `priceUsd` are overwritten with the verified amount, and `spent`, `monthSpent` and the 20 percent affiliate credit use that verified `priceUsd`. On any failure the order becomes `FAILED` and its hash moves to `failedHash`, so the payer can retry the same hash (for example once Horizon has indexed it). One exception: a digital portrait that pays at least the retired $6 (`PORTRAIT_LEGACY_DIGITAL_USD_CENTS`, less a verified discount) but less than today's price comes from a tab opened before the price change. It is a real payment, so `validatePrice` returns it with `priceChanged`, and the controller records it like a closed pack: `FAILED_GRANT` (`PRICE_CHANGED`), `refund: 'due'`, no spend, nothing granted, 409 `PORTRAIT_PRICE_CHANGED`. A hash can back only one order: `Order.hash` has the unique partial index `hash_unique`, and a duplicate returns 409. The flow has no memo, so the payment is not bound to the buyer (see known issues).

4. **Crypto checkout** (`src/payments/crypto/`, API in `docs/API.md` "Crypto checkout"), replacing the Stellar pack purchase. No on/off flag: it is on wherever a chain resolves with a treasury (production: all seven mainnets from `treasury.public.ts`) or with a live split route (`CRYPTO_PAY_CAT_SPLITS`, counted on a mainnet only while the on-chain giving check passes for that route's own split, when shelter cats use it). Rollback is a revert and a redeploy. Any process with `NODE_ENV=production` and no `CRYPTO_PAY_NETWORK` sells on mainnet to the real treasury, staging included, and so does a dev box with `CRYPTO_PAY_NETWORK=mainnet`: the money reaches the real treasury, but the item is granted in that box's own database. Set `CRYPTO_PAY_NETWORK=testnet` (with `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD`) on staging.
   - Chains: `crypto-chains.ts`, the USDC and EURC entries of `funding/framework/tracks/a-build/chains.json` plus Robinhood's USDG (Arc, Base, Arbitrum One, Avalanche C-Chain, Tempo, Robinhood Chain, Monad and their testnets), pinned by `crypto-chains.spec.ts` (Robinhood testnet's mock mUSDC against `deployments.json`; it is `testOnly`, never offered under `NODE_ENV=production`). Tokens only: native gas coins are never accepted. Mainnets when `NODE_ENV=production`, testnets otherwise (`CRYPTO_PAY_NETWORK` overrides, but `testnet` is ignored under production unless `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD=true`, and the local chain 31337 never exists in production); never both. A chain is offered only with an RPC and a receiving address. Every chain's default RPC is checked in (`publicRpc` in `crypto-chains.ts`); on a mainnet it is always the chain operator's own official endpoint (Circle, Coinbase, Offchain Labs, Ava Labs, Tempo, Robinhood, Monad), never a third-party node, because the RPC's receipt decides whether an item is given. `CRYPTO_PAY_RPC_<chainId>` or the funding variable overrides it, e.g. with a keyed provider for higher rate limits. Mezo (MUSD) is left out.
   - Receiving: purchases are commerce and go to the Token Tails treasury, public addresses checked in to `treasury.public.ts` (`0x7b136b872bEad1dAE557d1286f125B7A8A197C9A` on all seven mainnets, founder decision 2026-10-14). `CRYPTO_PAY_TREASURY[_<chainId>]` is only an optional override, for testnets and the local chain, which have no checked-in treasury. A wallet Token Tails holds for a shelter (`TOKEN_TAILS_HELD_WALLETS`, `SHELTER_HELD_WALLETS`) is never accepted as a treasury.
   - Order binding: an `amount`-bound option is the price plus a unique tag of 1 to 9,999 base units, reserved per chain, token and amount by the unique partial index `amount_reserved` until 2 hours after expiry, or 24 hours once a confirm showed a transfer to us mined after the order, paid or short (`confirmAttemptAt`; a made-up hash with no receipt does not count). `createOrder` refuses (503) while that index is missing. One buyer gets one open order per item (handed back, renewed when under 3 minutes are left, only at today's price; two parallel creates for one cat keep the earliest and delete the other before answering) and at most 3 open orders, so one account cannot hold the 9,999 tags of a price. Tempo uses TIP-20 `transferWithMemo` with the 32-byte memo `tt:<orderId>`; the shelter split route uses the split's own memo `tt:cat:<16 hex>`. Memo-route amounts carry no tag, so a memo option is matched by its memo only, never by a plain `Transfer` of the same amount (which TIP-20 also emits): otherwise another buyer could claim the payment.
   - Verification (`crypto-evm.ts` `checkPayment`, read-only RPC in `crypto-chain-reader.ts`, no key): the receipt succeeded, has the chain's confirmations (1 on Arc, Avalanche and Tempo, 12 on the rollups), its block is not older than the order (2 minutes of skew), and a log emitted by the option's token contract pays the option's recipient (exact amount, or memo and at least the price; the split route also needs the split's `DisbursementBatch` with the memo). A payment mined up to 2 hours after `expiresAt` (`PAYMENT_GRACE_MS`, within the binding's hold) is granted normally; a shelter cat is checked for sale again first (`NOT_FOR_SALE` refund otherwise). Later, the order is `LATE` and the payment `FAILED_GRANT` with `refund: 'due'` (`PAID_AFTER_EXPIRY`); a `LATE` order still takes a payment mined in time. An amount-bound transfer up to 5% short is reported `UNDERPAID` (never accepted) so support can find exchange withdrawals. A second, different payment for a paid order is refunded the same way (`DUPLICATE_PAYMENT`).
   - Exactly once: the `Order` is created with `hash = evm:<chainId>:<txHash>` under `hash_unique`, the checkout moves `OPEN|EXPIRED -> PAID` atomically, and `grantStartedAt` is claimed once before granting; the spend is counted once (`spendCounted`). A replayed confirm returns the stored result; a `PAID` order without a result answers 202 `CONFIRMING`. A grant that died is finished by `recoverStuckGrants` (every 5 minutes, leased job `crypto-grant-recovery`, also `POST /payments/crypto/recover-grants`): it copies a COMPLETE or FAILED_GRANT `Order`, treats a shelter cat the buyer holds as delivered, or grants again under a new lease (a pack adopted in the single write before the crash can get a second cat).
   - EURC, never a live feed: with no `CRYPTO_PAY_EURC_PER_USD` (or `1`) it is a fixed euro price, 1 EURC per USD of the price (`fx.source: 'fixed'`, no date; the client labels it so). A set rate needs `CRYPTO_PAY_EURC_FX_DATE`, must be 0.5 to 2, and stops EURC sales when more than 30 days old (`fx.source: 'dated'`). `priceUsd`, spend and the affiliate credit use the USD price.
   - Shelter cats (`src/shelter/shelter-cat-sale.service.ts`): any unowned rescue cat of `GET /cat/sale` whose blessing is not `ADOPTED` or `HEAVEN`, and that is not a starter, at a fixed $5 (`SHELTER_CAT_MIN_PRICE_CENTS`; the old `SHELTER_CAT_PRICE_CENTS` override is gone so the client copy cannot drift), never discounted, granted as a `COMMON` copy (origin `adopt`) through `PurchaseGrantService.grantShelterCat`. Also sold by Stripe (`entityType: 'CAT'`): a card sale records the same treasury-route share as a crypto one (`CryptoCheckoutService.recordCardShelterShare`, a `rail: 'card'` row in `cryptocheckouts`, unique per PaymentIntent; one rule, `treasuryShelterShare`). The shelter share, for shelters in `CRYPTO_PAY_SPLIT_SHELTER_IDS` (default Pink Paw):
     - treasury route (chains without a verified split route): the buyer pays the treasury; on a completed sale the share (`CRYPTO_PAY_CAT_SHELTER_BPS` of the price, rounded up; unset: 5000, Pink Paw's 50% decided by the founder on 2026-10-04 (`DEFAULT_CAT_SHELTER_BPS`); set but malformed: `undecided`, nothing sent) is `due`. `CryptoShelterShareService` (every 5 minutes, leased, on by default with no flag; it does nothing until the main shelter config has an RPC, the split and the hot wallet key, and it skips (`network-mismatch`) unless the shelter chain is on the checkout network (`CRYPTO_PAY_NETWORK`) and is not a testnet under `NODE_ENV=production`; a mainnet keeper pays only `mainnet` and `card` rows, a testnet keeper only `testnet` rows; `POST /payments/crypto/shelter-share/run` runs it once) sends it from the hot wallet float through `ShelterSplit.disburse(amount, 'tt:cat:<16 hex>')` on `SHELTER_CHAIN_ID`, approving the split once. The split pays shelters only their registered bps (the rest goes to its own treasury), so a confirmed row stores the receipt's `DisbursementBatch.toShelters` as `amountBase` / `amountUsdCents` (what was sent is `sentBase`); a mined send without that event for its memo is `failed` for a person. A row left `sending` with no hash for 30 minutes (a crash before signing) goes back to `due`. Token Tails' own money reaching the wallet it holds for the shelter: evidence tier `onchain-custodial`, disclosed like treats and the match. The tier is read from the receipt (`shareTier`): a share is `onchain-shelter-held` only when the split's `Disbursed` events for its memo paid at least one wallet and none of them is a held wallet (`TOKEN_TAILS_HELD_WALLETS`, `SHELTER_HELD_WALLETS`). Shares paid to `0xE299…0f37` before 2026-10-16 stay custodial. A signed share is never re-sent while its fate is unknown; a reverted one is retried at most twice;
     - split route: on chains where `CRYPTO_PAY_CAT_SPLITS` (default the main split, USDC) has the shelter's split, and on a mainnet only when `ShelterClaimService.publicGivingVerified` passes, the buyer pays the split directly (`approve`, then `disburse` with the order memo); the split pays the shelter its on-chain share and the treasury the rest in the same transaction. Evidence tier `onchain-shelter-held`. Other chains keep the treasury route, and the keeper's shares are then `onchain-shelter-held` too.
     The impact indexer sees the keeper's and the buyers' split payouts as ordinary ShelterSplit events with a `tt:cat:` memo, in the `direct` bucket (a `cat` bucket is a follow-up in `src/impact`, not done here).
   - E2E: `funding/framework/tracks/a-build/e2e-crypto-pay/stack.sh all` (plain local anvil, test tokens, throwaway Mongo; 14 flows, including the 2-hour grace and a rounded payment reported UNDERPAID).
   - Multi-chain and goal E2E: `funding/framework/tracks/a-build/e2e-pay-goal/stack.sh all` (two local anvil chains, 31337 and an empty chain started with the Arc testnet id 5042002, test tokens, throwaway Mongo; `E2E_UI=1` adds the client screens). Packs in USDC and EURC on both chains, each granted once under parallel and replayed confirms; a shelter cat through the treasury route (keeper share) and through the split route; the on-chain rotation and sweep; receipts, `orders` rows, `shelterpayoutevents` rows; `GET /shelter/goal/C-001` after every money move (the harness swaps the C-001 campaign for the local wallets via `E2E_GOAL_CAMPAIGN`). Arc's native-coin USDC and its `0xff…fe` system Transfer log cannot run on anvil, so sponsored treats (native `donate`) are not counted there; `shelter-goal.spec.ts` covers that log.

Pack rarity odds are in `src/shared/utils/content.utils.ts`. Discount codes map to a user's
`discount` field; the code owner earns a 20 percent affiliate credit on completed purchases.
A buyer's own code gives no discount and no affiliate credit (`resolveDiscount` and
`creditAffiliate` compare the code owner with the buyer) on every rail.

There is no Apple or Google in-app purchase receipt verification.

### Shelter gifts on Arc

`src/shelter/onchain/` (endpoints in `docs/API.md`). Treats and the x402 card are on by default; each
needs a recorded split, and treats also the hot wallet key (see Configuration below). The relay and
the match are off by default.

- `ShelterChain` wraps ethers v6: a `JsonRpcProvider` with a static network, a `Wallet` from
  `SHELTER_DONATE_PRIVATE_KEY`, and the ShelterSplit `Interface` (`donate(string)`, `disburse(uint256,string)`,
  events `NativeDisbursed` topic `0xc859ef09...aeef` and `Disbursed` topic `0x53e1c69d...495a`). Sends are
  queued in-process so concurrent gifts do not collide on the wallet nonce.
- `ShelterDonateService`: since Oct 8, 2026 anyone may send a treat. A registered account calls
  `POST /shelter/donate` (keyed by its id; no account-age, email or saved-game rule, the F7.5
  instant-treat policy is open). Anyone else calls `POST /shelter/donate/guest`, keyed by a pseudo id:
  the first 12 bytes of HMAC-SHA256(`SHELTER_TREAT_IP_SALT`, `day|visitor address`) (`treat-guest-key.ts`;
  the raw address is never stored, the id changes daily). The visitor address is Cloudflare's
  `cf-connecting-ip` when it is public, else the Express address (resolved past our own hops by the
  default `trust proxy`). Production refuses
  guest treats with 503 when neither gives a public address, so one visitor cannot use a shared key. It inserts a
  `shelterdonations` row (unique `user` + UTC `day`, so a second gift is 429 `DONATE_ALREADY_TODAY`;
  a FAILED row of the same day is reused and the attempt kept in `attempts`), claims a slot in
  `shelterdonatedays` with a conditional `$inc` against
  `floor(SHELTER_DONATE_DAILY_BUDGET_WEI / SHELTER_DONATE_AMOUNT_WEI)` (a full day is 409
  `DONATE_BUDGET_SPENT`), signs `donate('tt:<source>:<8 hex>')`, stores its hash, nonce and sender on
  the row (still PENDING), then broadcasts it. A failure before signing, or a broadcast the node
  certainly refused, marks the row FAILED (`send-failed`) and gives back the slot. An ambiguous
  broadcast error keeps the gift SENT. `ShelterDonateReconcileService` (leased, every 2 minutes)
  settles SENT rows (and PENDING rows with a hash) by receipt: CONFIRMED on success, FAILED
  `reverted` on a revert, and FAILED `timeout` only after 30 minutes once its nonce is used by another
  transaction; a same-day failure gives both slots back. Public counts use CONFIRMED rows only. Five
  sends a minute per user (`UserThrottlerGuard`).
- Treat networks (the give page's chips, added 2026-10-04): `POST /shelter/donate` takes an optional
  `chainId`. Omitted, or the main chain's id, nothing changes. Another id must be a served chain with treats on:
  a `wallet.config.ts` chain of the main chain's network class (on by default), or a
  `SHELTER_RELAY_CHAINS` entry with `SHELTER_CHAIN_<id>_TREAT_ENABLED=true` (else 409 `DONATE_PAUSED`). Its treat is paid in
  the split's token from the hot wallet (`ShelterChain.sendTokenDonation`): it reads
  `token()` and the allowance, approves the split for the chain's daily treat budget when the allowance
  is short and waits for that approve to be mined (a failed approve is `send-failed`, never kept as the
  treat's hash), then signs `disburse(amount, memo)`, or `disburseWithMemo(amount, bytes32 memo)` on
  Tempo (4217, 42431), through the same sign, store, broadcast steps. Tempo has no gas coin: ethers
  sends a plain EIP-1559 transaction, so the fee is paid in the hot wallet's preferred fee token, and
  with none set the protocol falls back to pathUSD (Tempo fee spec). On Tempo mainnet the hot wallet
  must hold pathUSD for fees, or set USDC.e as its fee token once (Tempo FeeManager `setUserToken`)
  before the treat flag is turned on. The row keeps `chainId`, `amountWei` scaled to 18 decimals (so
  totals stay in one unit) and `tokenAmount` (6-decimal base units). The once-a-day rule stays per
  player across all chains (unique `user` + `day`), so a player never gets one treat per chain. Each
  chain has its own budget: `shelterdonatedays` keys are the bare day on the main chain (unchanged)
  and `<day>@<chainId>` elsewhere. The reconcile job settles each row on its own chain's config and
  skips (never fails) a row whose chain is no longer configured.

- **Configuration: public data in code, secrets and switches in env.** Every public address lives in one
  committed file, `src/shelter/onchain/wallet.config.ts`: one readable section per chain
  (`arcTestnet`, `tempoTestnet`, `baseTestnet`, ...) with its name, chain id, network class, default
  RPC (and a log RPC where the public one caps `eth_getLogs`), explorer, payout token, ShelterSplit,
  DonateRouter and its first block, plus `WALLETS` (Pink Paw, treasury, hot wallet, agent and deployer
  addresses). It is generated by `fund a:ingest` (or `fund a:backend-deployments`) from
  `funding/framework/tracks/a-build/{chains,deployments,router-deployments,wallets.public}.json`, in
  the same step that writes the client's public lists; `wallet.config.spec.ts` and the funding test
  `track-a-wallet-config.test.mjs` fail when it drifts. Each chain's default split is the
  primary-token instance (never EURC) that a recorded DonateRouter pays into, else the newest recorded
  one (Base Sepolia and Fuji: `0x8bf0…878c`, the router-backed instance; the older `0x457c…b147` also
  pays Pink Paw 10000 bps and stays listed under `otherSplits`).

  Env holds only the key (and optional RPC overrides). Zero config: no switch, nothing per chain.

  ```
  SHELTER_DONATE_PRIVATE_KEY=<hot wallet>    # the one key, a secret (production only; see below for dev)
  SHELTER_CHAIN_ID=5042002                   # optional: the main chain; its network class picks the others
  SHELTER_NETWORK=mainnet|testnet            # optional: the default main chain's class
  ```

  Unset `SHELTER_CHAIN_ID` means Arc mainnet (5042) under `NODE_ENV=production` and Arc Testnet
  (5042002) everywhere else; `SHELTER_NETWORK` overrides that choice (`shelterNetwork` in
  `shelter-onchain.config.ts`). Dev key: with `SHELTER_DONATE_PRIVATE_KEY` unset, not production and
  a testnet main chain, `bootstrap()` in `main.ts` calls `loadDevShelterKey`
  (`shelter/onchain/shelter-dev-key.ts`), which unlocks the Foundry keystore
  `~/.foundry/keystores/<SHELTER_DEV_KEYSTORE or donatehot>` with the password in
  `<repo>/funding/.secrets/<name>-password.txt` and sets the key in this process's env only. It logs
  only the address, writes nothing, and on any failure logs one warning and goes on (treats then show
  the missing-key reason).

  Treats are on by default on the main chain and on every chain in `wallet.config.ts` that has a split
  of the main chain's network class (testnets next to a testnet main chain, mainnets next to a mainnet
  one, never mixed); the main chain's split also defaults to its `wallet.config.ts` section. Each
  `wallet.config.ts` chain is health-checked on `GET /shelter/donate/status` and before a send (cached
  60 s): it is listed `enabled: false` with a `reason` while there is no key, the split is paused or
  pays no shelter, the hot wallet holds less than one treat of the token or too little gas for two
  sends at the node's gas price (Tempo pays fees in a stablecoin, so only the token counts there), or
  the RPC does not answer within 10 s (each RPC request times out after 8 s and a 429 is not retried).
  The main chain on its recorded split pays `donate()` in its native coin and is checked the same way
  on its native balance. `treatsLeftToday` never exceeds what the hot wallet's float still pays for.
  Budgets are per chain (default 0.01 per treat, 1 a day) and the once-a-day rule stays per player
  across all chains. Once the main chain is a mainnet, USD treat totals leave testnet rows out.

  The x402 card is offered by default on the same chains. On testnets always; on a mainnet (and the
  relay and match there) only once `ShelterClaimService.publicGivingVerified` passes for that chain:
  every split recipient is a `rotated` claim (task 3's per-chain claim) or the chain's Pink Paw wallet
  from `wallet.config.ts`, and none is a held wallet, so public money never lands in a wallet Token Tails holds. Relay and match still need their own per-chain flag.

  What this means in production: the live status shows main chain 5042 with no split
  (`not-deployed`), and `wallet.config.ts` records no mainnet split, so nothing opens on deploy. The
  moment the wave records the Arc mainnet split and that `wallet.config.ts` is committed and deployed,
  treats start on Arc mainnet automatically if the backend holds `SHELTER_DONATE_PRIVATE_KEY` and that
  wallet holds USDC; no flag is flipped first. Mainnet x402, relay and match open on a chain only while
  its split pays Pink Paw's wallet (or rotated shelter claims) and no held wallet.

  Emergency off (undocumented elsewhere on purpose): `SHELTER_DONATE_ENABLED=false`,
  `SHELTER_X402_ENABLED=false` (or a per-chain `SHELTER_CHAIN_<id>_X402_ENABLED=false`),
  `SHELTER_AUTO_CHAINS=off` (main chain only). Relay and match stay off unless
  `SHELTER_RELAY_ENABLED` / `SHELTER_MATCH_ENABLED` turn them on. `SHELTER_HANDED_OVER` was removed on
  2026-10-16; the on-chain check below is the only mainnet gate.

  One key: `SHELTER_DONATE_PRIVATE_KEY` signs on every listed chain (one EVM key works on every EVM
  chain, no copies); listed chains always share the main chain's network class, so a mainnet key never
  signs on a testnet.

  Why a key at all: server-paid treats (`donate` / `disburse` from Token Tails' own float), the relay
  (the hot wallet pays gas for a donor's signed authorization) and the match send signed transactions.
  A giver's own gift (wallet donate, x402 agent payments) needs no server key. Keep the float small. A
  remote signer (a cloud KMS key or a signing service, so the key never sits in env) is the
  recommended next step for production; it is not implemented.

  Optional: RPC overrides for paid endpoints (`SHELTER_ARC_RPC_URL`, `SHELTER_CHAIN_<id>_RPC_URL`,
  `SHELTER_CHAIN_<id>_LOG_RPC_URL`) and budgets (`SHELTER_CHAIN_<id>_TREAT_AMOUNT=0.01`,
  `_TREAT_DAILY_BUDGET=1`, `_X402_PRICE=0.01`, the defaults).

  Advanced overrides (hidden, backward compatible, not needed): `SHELTER_AUTO_CHAINS=off` serves the
  main chain only (plus `SHELTER_RELAY_CHAINS`); `SHELTER_RELAY_CHAINS` plus
  `SHELTER_CHAIN_<id>_SPLIT_ADDRESS`, `_ROUTER_ADDRESS`, `_ROUTER_FROM_BLOCK`, `_SPLIT_FROM_BLOCK`,
  `_TREASURY_ADDRESS`, `_TREAT_ENABLED`, `_X402_ENABLED`, `_RELAY_ENABLED`, `_MATCH_ENABLED`,
  `_TREAT_COIN`, and the legacy `_KEY_ENV` (the name of another env variable holding that chain's key).
  Each wins over the default; `_TREAT_ENABLED=false` or `_X402_ENABLED=false` switches one chain off.
  A chain named only in `SHELTER_RELAY_CHAINS` reads these variables alone, as before (no defaults,
  no health check).

  A mainnet treat pays the split's recipients (Pink Paw's wallet since 2026-10-16; before that a wallet
  Token Tails held for Pink Paw), from Token Tails' own float, like the Arc treat; it is not public money, so it is
  not gated on the claim check (the relay, match and x402 on those chains still are).
- `ShelterX402Service`: issues nonces into `x402nonces` (TTL index on `expiresAt`, 600 seconds), offers
  one onchain-receipt entry per enabled chain (the main chain, then each `wallet.config.ts` chain of its
  class and each `SHELTER_RELAY_CHAINS` entry with `SHELTER_CHAIN_<id>_X402_ENABLED=true`; a mainnet
  only once `publicGivingVerified` passes for it; Arc pays native USDC with `donate`, the others the split's token
  with approve + `disburse`, `disburseWithMemo` on Tempo; a chain whose token cannot be read is left out
  of that 402), verifies receipts over RPC on the paid chain, records each paying tx in `x402usedtxs`
  (unique `txHash`; `amountWei` scaled to 18 decimals, plus `scheme`, `chainId` and `amountBase` for token
  payments), and returns a card built
  from a whitelist projection of a blessing (`name`, image `url`, shelter `name`). It never reads users,
  owners or wallets, and needs no server key.
- Showcase shelter: Pink Paw (Rožinė pėdutė). Since 2026-10-16 every mainnet split pays Pink Paw's wallet
  `0x3c83…4771` (`WALLETS.mainnet.pinkPaw`); before then it paid `0xE299…0f37`, a wallet Token Tails held
  for the shelter, which stays in `TOKEN_TAILS_HELD_WALLETS`. The testnet splits still pay `0xE299…0f37`. The contract addresses come from `wallet.config.ts`: every testnet split is recorded
  there, the mainnet splits are `null` until the mainnet wave records them.
- Wallet gifts (F2, all off by default; endpoints in `docs/API.md` "Wallet gifts"):
  `ShelterRelayService` submits a donor's signed EIP-3009 authorization to the ownerless DonateRouter
  (`donate-router.ts` holds the ABI, the nonce rule and the typed data) through
  `ShelterChain.sendContractCall`, which shares the treat send queue, nonce handling and
  `DEFINITE_BROADCAST_REFUSALS`. `ShelterMatchService` matches router gifts 1:1 within
  `SHELTER_MATCH_*` caps held in atomic `sheltercounters` (separate from the treat budget),
  `ShelterClaimService` records a shelter's signed wallet claim. The reconcile job also settles
  `shelterrelaytxs`, scans `RouterDonation` logs into `sheltermatches` (cursor in `shelterrouterscans`),
  sends and settles matches, and flushes a stray router balance at most hourly. Each step is isolated
  from the treat work.
- Custody: donor money never touches the hot wallet. The relay transaction is
  `router.donateWithAuthorization`, which pulls USDC from the donor and disburses it through
  ShelterSplit in the same transaction; the hot wallet only pays the gas. The donor's signature also
  covers the payout list (`recipients` = `router.recipientsHash(value)`), so a shelter re-pointed after
  signing makes the gift revert (`RELAY_RECIPIENTS_CHANGED`). A relay that reverts or times out because
  someone else submitted the same signature first is settled `confirmed` with `settledTxHash` (found by
  the `RouterDonation` nonce topic), never `failed`. The match is Token Tails' own
  money sent from the hot wallet. Mainnet gate: `ShelterClaimService.publicGivingVerified(config)`
  requires, on chain, that the split keeps nothing for the treasury and that every wallet in `split.preview(1 USDC).wallets` is either a `rotated` claim on that chain or the chain's generated Pink Paw wallet (`wallet.config.ts` `pinkPaw`, mainnet only), not a mix,
  and that none is a held wallet (`TOKEN_TAILS_HELD_WALLETS`, `SHELTER_HELD_WALLETS`) or a Token Tails
  wallet. No database row is needed when the split pays Pink Paw's wallet. Public money cannot reach a
  wallet Token Tails holds through these services. Keep the hot wallet float small:
  it now pays relay gas and the match.
- Decision 2026-10-05 (founder, funding/framework/tracks/a-build/README.md): the mainnet wave deploys
  DonateRouters by default, before the handover. The router is ownerless and public, so once it exists
  anyone can call `donateNative` or submit a signature themselves, and no backend gate can stop that
  money reaching the split's shelter wallet (ShelterSplit's `donate`/`disburse` were always public too).
  The app keeps every public route on a chain closed until the on-chain giving check passes there
  (`ShelterClaimService.publicGivingVerified`): the split pays only rotated claims, or only that chain's
  Pink Paw wallet from `wallet.config.ts`, and never a held wallet. Before the 2026-10-16 rotation that
  wallet was `0xE299…0f37`, held by Token Tails, and its shelter balances were swept to Pink Paw's wallet
  on 2026-10-16. Since then the mainnet splits pay Pink Paw's wallet, so the check passes with no claim
  row. The relay and match still need their own flags (`SHELTER_RELAY_ENABLED`, `SHELTER_MATCH_ENABLED`,
  off by default); x402 cards are on by default.
- Claims: `POST /shelter/claim` only takes wallets on `SHELTER_CLAIM_ALLOWED_WALLETS` (named by the
  shelter through a separate channel) and `GET /shelter/claim` shows only `approved` or `rotated` rows.
  Claims are per chain: the v1 message names one chain (the main one); the v2 message
  (`shelterClaimMessageV2`, `Token Tails shelter payout wallet (v2)`) names a sorted chain list or
  `all chains where Pink Paw is listed`, and one signature records a `pending-rotation` row per chain
  (the main chain plus every configured chain of its class with a split; an unserved chain is
  refused, and a wallet that is the hot wallet, treasury, split or router on any named chain refuses
  the whole claim). `publicGivingVerified(config | chainId)` reads that chain's `rotated` rows, so the
  relay and match open per chain. `GET /shelter/claim/chains` lists each claimable chain with its
  latest public claim.
  Status changes are manual database writes; the rotation uses the address confirmed with the shelter,
  never one read from the endpoint.
- Attribution: the impact indexer adds buckets `wallet` (any memo except `tt:flush` whose ShelterSplit
  batch payer, read from the receipt, is the router, from a `RouterDonation` donor that is not a Token
  Tails sender, a `SHELTER_MATCH_EXCLUDE` wallet, the treasury or the shelter paid; a flush of untraced
  plain transfers stays `direct`) and `match` (a `tt:match:` memo from
  the hot wallet or an `IMPACT_PAWS_SENDERS` address whose tx is a recorded `ShelterMatch.matchTxHash`).
  `X402UsedTx` rows with `scheme: 'exact'` (paid straight to the shelter wallet, no split event) are
  added to the `x402` totals from `amountBase`, once per tx hash and never twice for a hash that also
  has a split event. Anything else stays `direct`.

### Impact and truth data (plan F7, G4, G11)

`src/impact/`. Public numbers come from a stored snapshot, never from the in-process traction
counters. Every job here runs through a lease and only where `IMPACT_JOBS_ENABLED` is on (default: on
only under `NODE_ENV=production`; set it explicitly in production, a disabled instance logs a startup
warning).

- **Payout indexer** (`impact-indexer.service.ts`, every 5 minutes): reads the ShelterSplit
  `Disbursed` and `NativeDisbursed` logs on the main chain from `SHELTER_SPLIT_FROM_BLOCK`, and on every
  other configured chain of the main chain's class (`impactChainConfigs`: the wallet.config.ts chains,
  try-it and relay chains with a split; test money never sums with real money) from its own cursor, which starts at
  `SHELTER_CHAIN_<id>_SPLIT_FROM_BLOCK` or the block of the split's recorded deploy transaction. Logs
  are read in `SHELTER_LOG_CHUNK` block chunks, capped by what the RPC takes (Monad's public RPC 100
  blocks, sepolia.base.org 1,000, api.avax.network 100, re-checked 2026-10-21; mainnet.base.org refuses eth_getLogs
  outright since ~Oct 8, so Base needs a keyed `SHELTER_CHAIN_8453_LOG_RPC_URL`), through the chain's dedicated log RPC while
  it uses its default public one (`logRpcFor`; at most `IMPACT_INDEXER_MAX_CHUNKS` calls per chain per
  run). Amounts are stored per symbol in 18 decimals with each split's own token (mUSDC on Robinhood
  testnet, EURC on an EURC split, ETH/AVAX/MON for native gifts), and the snapshot sums the chains'
  cursors per bucket and symbol (`money.byChain` lists each chain when more than one is indexed). Treat
  totals in USD (`communityTotalConfirmedWei`, `me`) leave out chains whose treat coin is not a dollar
  (`NON_USD_TREAT_CHAIN_IDS`: Robinhood testnet's mUSDC). It upserts one
  `shelterpayoutevents` row per `chainId + txHash + logIndex`, rescans the last 12 blocks for reorgs
  (a row is deleted only when the node knows its block and the canonical hash differs), and
  attributes each payout to a source: `heist` or `page` (treats, by memo and tx hash), `paws` (a
  `tt:paws:` memo from the hot wallet or an `IMPACT_PAWS_SENDERS` address), `x402` or `direct`. Until the
  ShelterSplit deploy (decision #97) it is idle and the snapshot says `not-deployed`.
- **Snapshot** (`impact.service.ts`, hourly at :07, one `impactsnapshots` row per hour bucket,
  compacted to daily after 48 hours): money per currency and evidence tier, custody
  (`held-by-token-tails` until every paid wallet's shelter is `handed-over`), the treat rail state,
  shelters and active partner countries (house zones never count), rescue cats (rescue kind only),
  registered players and `active30d` (guests and deleted accounts excluded; null until a
  `lastPlayedAt` exists), outcomes, pledges, paw settlements, attestations and open Rescue Goals.
  On an RPC failure it carries the last values forward with the old `asOf` and `sources.chain =
  'error'`, never zeros; a stored snapshot older than 2 hours is served with `sources.mongo =
  'error'`. The live rail counters are overlaid from `/shelter/donate/status` when a stored row is
  served. With `IMPACT_CDN_ENABLED=true` each snapshot is mirrored to `impact/impact.json` on Spaces
  (`Cache-Control: public, max-age=300`). The response never holds an email, wallet key, user list,
  user id or ObjectId (`impact-privacy.spec.ts`).
- **Eligibility** (`eligibility.ts`, F7.5): one table of pure policies. Instant treat: open to
  everyone since Oct 8, 2026 (once a day, capped per chain). Daily paw: verified, 24 h at settlement, 2 `/live` rows with points at least 3
  minutes apart that UTC day (Heist rows excluded). Goal give: registered, 72 h, 3 saved games.
- **Paws** (`paws.service.ts`, decision #26): at 00:30 UTC a leased job settles the UTC day that
  ended: one `paws` row per eligible player and day, a Merkle tree over
  `keccak256("<pawId>|<keccak256(userId+salt)>|<day>")` (sorted pairs, odd node carried up), and one
  `donate('tt:paws:<day>:<root>')` for `min(PAWS_DAILY_BUDGET, paws x PAWS_AMOUNT)`, pro rata. The
  send happens only with `PAWS_SETTLEMENT_ENABLED=true`; otherwise the root and memo are built and the
  row stays `built`. A reconcile job runs every 10 minutes and catches up the last 3 days. Each
  settlement stores `suggestedBudgetWei` (30-day average paws times the paw amount). `GET /impact/me`
  returns today's progress and the caller's proof (with its own salt) for the client verifier.
- **Attestation** (`payouts.service.ts`, decision #28): off-chain payouts are DRAFT `impactpayouts`
  with a server-computed receipt SHA-256 (the file is never stored) and an attestation hash over the
  reviewed fields. A shelter member who neither created nor edited the draft confirms it with the
  same receipt (SHELTER-CONFIRMED, amber); staff cannot confirm. An EIP-191 signature by the
  handed-over shelter wallet makes it SHELTER-SIGNED; before handover signatures are refused.
  Shelter members are granted by an ADMIN (`PUT /shelter/:id/members`, registered and verified users
  only, never staff).
- **Outcomes** (`outcomes.service.ts`, decision #78): `shelteroutcomes` hold type, date, amount, the
  animal's name only and an optional payout link. The photo is re-encoded (EXIF orientation applied,
  1,200 px, reviewer boxes pixelated, WebP without metadata) and kept private in
  `shelteroutcomeimages` until a second reviewer (not the author, not the redactor) approves it,
  which uploads it. Unpublishing deletes the object and withdraws the outcome from every stored
  snapshot.
- **Purchase pledge** (`pledge.ts`, decision #27): reads `purchase_share` (C-002) from the facts
  registry; COMPLETE orders from its `effectiveAt`, per UTC month, pledged versus paid (attested
  pledge payouts). USD-priced orders count at `priceUsd`; EUR card portrait orders count their euro
  `price` at the upper bound `PLEDGE_USD_PER_EUR_UPPER_BOUND` (1.65, `pledge.service.ts`; KI-03).
  Until C-002 is set the status is `not-started`.
- **Spend** (G4): `spent`, `monthSpent` and `spentUsd` are written from one verified USD amount at
  the payment sites only (`src/web3/spend.ts`); see "Cats, packs and spend" in the known issues.

The facts registry (`funding/framework/facts/facts.json`, generated into
`src/impact/facts.generated.ts`) and the wording rules are in [CLAIMS.md](CLAIMS.md).

### Payout index (`GET /shelter/payouts`)

`src/shelter/onchain/payout-index.service.ts`, `payout-index.controller.ts`, `payout-index.schema.ts`.
The payout pages, the Heist modal and the shelter-rail widget used to scan every split's logs from
public RPCs in each browser (Arc mainnet's RPC answers about two calls a second, Base caps
`eth_getLogs` at 500 blocks, Monad's public RPC at 100). This job reads them once on the server:

- Targets: every split recorded in `wallet.config.ts`, each chain's `split` and its `otherSplits`
  (Arc's EURC split too), for `SHELTER_PAYOUTS_INDEX_NETWORKS` (`mainnet`, `testnet` or both, the
  default). This is separate from the impact indexer, which keeps attributed rows for the impact
  numbers on the main chain's network class only; this index holds public chain data only (no
  buckets, no senders).
- Each run (leased, every 2 minutes, a 90 s budget, at most 60 `eth_getLogs` calls per contract)
  reads from the cursor minus 12 blocks to the head through the chain's log RPC (`logRpcFor`, the
  same caps as the impact indexer) in windows of `SHELTER_PAYOUTS_INDEX_CHUNK` (default 10,000); a
  window the RPC refuses shrinks to the cap the RPC names, or halves. Arc mainnet calls are spaced
  500 ms apart. The first runs backfill from the deploy block (`fromBlock`, else the deploy
  transaction's receipt). Chains run in parallel, the contracts of one chain one after the other.
- Rows (`shelterpayoutlogs`, unique `chainId + txHash + logIndex`) carry the block time
  (`eth_getBlockByNumber`), raw `amount` with its `decimals`, `amount18`, `symbol`, `kind`, `memo`
  and a `sortKey` (newest-first order and the page cursor). A rescan adds nothing; a row missing from
  a rescanned window is deleted only when the node knows its block and the canonical hash differs.
- Cursors (`shelterpayoutindexcursors`, `_id` `<chainId>:<contract>`): `lastScannedBlock` never moves
  back; `lastScannedTime` is set when a run reaches the head, so a contract still backfilling reads as
  behind. A failed run stores only the error class.
- `GET /shelter/payouts` (docs/API.md): 409 when nothing of the network is indexed, 424 when the
  database fails, never 503; 30 s answer cache and `Cache-Control: public, max-age=30`.
- Checked read-only against the 8 mainnet splits on 2026-10-08: a cold backfill took about 20 s (one
  Base window failed once and was read again on the next run) and gave 0.5 USDC, 0.2 USDC.e, 0.1 USDG
  and 0.1 EURC over 9 payouts, the same per contract as a direct RPC read (repeated direct reads got
  HTTP 403/429 from Robinhood's and Arc's public RPCs, the reason for this index).

### Rescue Goals (plan G5)

`src/rescue-goal/`, decisions #34, #37 and #44. A manager opens a goal in the CMS only with its money
marked set aside, a funding line, an amount and a named proof owner; at most 10 goals per budget
month; never for a house zone. Funding and saga fields never appear in a public view.

A give (`POST /rescue-goals/:id/pledge`, 10 to 5,000 Tails, a client UUID per give) checks, in order:
guest (403), the kill switch, a replay of the same UUID, the F7.5 policy (registered, 72 h, 3 saved
games), then balance, room and the 5,000-a-day cap (`PLEDGE_DAILY_CAP`). The default saga writes, each
step idempotent: (1) the give PENDING, unique on `(user, clientId)`; (2) the day reservation; (3) a
guarded debit `{tails: {$gte: n}}` through `giveTailsInc`; (4) one pipeline update of the goal that
never overfills and sets `FILLED`; (5) CONFIRMED, holds released, `goalsHelped` +1 on a first give to
that goal. A refusal in steps 2 to 4 gives back what earlier steps took. `MONGO_TRANSACTIONS=true`
runs steps 2 to 5 in one transaction instead (only once the replica-set check confirms one). A leased
sweeper (every minute, `RESCUE_GOAL_SWEEPER=off` stops it) rolls a stuck PENDING give forward or
refunds it within about 3 minutes. Deliver needs a photo (public, re-encoded) and a receipt (private
in `rescuegoalreceipts`, its SHA-256 public). Cancel refunds every give once and releases that day's
cap share. Gives answer 503 `PLEDGES_PAUSED` until `TAILS_EARNED_BACKFILL_DONE=true`;
`RESCUE_GOAL_PLEDGES=off` is a kill switch. `scripts/rescue-goal-audit.js` (read only) checks the
ledger and exits 1 on a problem.

### Order audit

`backend/scripts/audit-orders.js` (platform fix 0) is read-only: it only runs `find()` on the
orders collection, with Mongoose index and collection creation turned off. It reports, as counts
and order ids with amounts (no emails, wallets, user ids or hashes):

1. Orders sharing a `hash`. Each group is a possible double grant and blocks the `hash_unique` index.
2. `COMPLETE` Stellar orders whose Horizon transaction is missing or failed, does not pay the treasury, pays another asset, pays less than the catalogue price, or pays less than the stored (client-claimed) price. No historical XLM rate is stored, so XLM orders are valued at `--max-xlm-usd` (default 1 USD per XLM, above any recent rate) and only orders underpaid even at that rate are flagged.
3. `COMPLETE` Stripe orders whose stored USD amount is not a catalogue price (full, or 10 or 20 percent off when a code was recorded). `ABOVE_CATALOGUE` is mostly the old $400 vs $350 Legendary discrepancy. The audit does not know the $100 Legendary sale yet, so sale orders will be flagged.
4. Stellar orders holding a non-canonical hash (`NOT_CANONICAL_HASH`: a fee-bump's inner hash, or an uppercase hash), and groups of orders whose different hash strings resolve to one Stellar payment ("Same Stellar payment"). The unique index cannot see these; each group is a possible double grant.

```bash
cd backend
MONGODB_URI=<connection string of a user with the read role> \
  node -r ts-node/register -r tsconfig-paths/register scripts/audit-orders.js [--db tokentails] \
  [--skip-horizon] [--testnet] [--max-xlm-usd 1] [--all-statuses] [--json]
```

It needs `ts-node` type checking (not `transpile-only`) because it loads the schema decorators.
Horizon's public API allows about 3600 requests an hour and each Stellar order costs two; the
script waits and retries on 429. Run it before deploying fix 1: Mongoose builds `hash_unique` on
startup, and while duplicates exist the build fails (logged as `Order index build failed`) and
uniqueness is only enforced by the verifier's own check. A human decides clawback or write-off
for each finding, then resolves duplicates (for example by moving the extra hashes to
`failedHash`) so the index can build.

### AI generation

| Function | File | Model | Purpose |
|---|---|---|---|
| `generateCat` | `src/shared/utils/ai.utils.ts` | OpenAI `gpt-4o-mini` | Classify cat origin from a photo, write a rescue story, pick sprite and card art URLs |
| `generateAvatarFromImage` | `src/shared/utils/ai-avatar.ts` | Gemini image model | Creature-style avatar, retries up to three times if the output has a white border |
| `generatePortraitForImage` | `src/shared/utils/ai-portrait.ts` | Gemini image model | 4K themed portrait in one of four styles: highness, monarch, aristocrat, commander. Reads its input through `loadImageBytes` (a private `s3private://` original only for `source: 'yourcat'` images) |
| `generatePixelAvatar` | `src/shared/utils/ai-avatar.ts` | Gemini image model | Bet #3: one 16-bit pixel-art head of the cat (one call, default size, no retries); `src/yourcat/pixelate.ts` turns it into a 96-cell grid at 768 px |

Both generation paths run synchronously inside the HTTP request. Expect multi-second latency and
no retry queue. The `/yourcat` avatar is the exception: it runs in the background after the response,
and paid `/yourcat` portraits are painted by `PortraitDeliveryService` with a sweeper (no queue).

Bet #3 options: `generateCat(name, url, { screen, onUsage, signal })` adds a person and no-cat check
(`Person: yes|no. Cat type: TYPE|NONE`; an unparsable answer fails closed) when `screen` is set;
existing callers pass nothing and send the old prompt. `onUsage` reports token and image usage
(`AiUsage`, `src/ai-budget/ai-cost.ts`) and `signal` aborts the request; the Gemini calls take the
same options.

### Image pipeline

`src/shared/utils/image.utils.ts` sniffs HEIC by magic bytes, converts to JPEG, re-encodes as
WebP at quality 80, optionally resizes to 1000 px, and uploads to Spaces with a public-read ACL.
The returned URL is `${DO_SPACES_CDN}/<name>.webp`.

Visitor photos (`POST /yourcat`, `POST /image/portrait`) go through `sanitizePhoto`
(`src/shared/utils/photo-upload.ts`) instead: at most 10 MB and 40 megapixels (a HEIC at most 25
megapixels, measured from its `ispe` box before `heic-convert` runs; the conversion runs in a worker
thread that is terminated after 15 s, at most 2 at once per process with up to 8 waiting, so it never
blocks the event loop), JPEG, PNG, WebP or HEIC, one frame; the EXIF orientation is
applied, the image fits inside 1024 px and is re-encoded as WebP with no metadata (no EXIF, GPS, XMP or
ICC). Multer limits and the file-type filter come from `PHOTO_MULTER_OPTIONS`; `PhotoUploadExceptionFilter`
maps multer errors to `YOURCAT_*` codes. `aws.utils.ts` also stores private objects
(`uploadPrivateObject`, `getPrivateObject`, `deleteObject`).

### `/yourcat` (bet #3)

One photo becomes the visitor's playable cat (docs/plans/yourcat-v2.md; routes in docs/API.md).

- `POST /yourcat`: kill switch, multer, consent, name, then `AiUploadGate.admit` (below), then
  `sanitizePhoto`, then the classifier on an in-memory data URL (20 s abort). A person in the photo is
  422 `YOURCAT_PERSON_VISIBLE`, no cat 422 `YOURCAT_NO_CAT`, anything unreadable 502
  `YOURCAT_CLASSIFY_FAILED`; then nothing is stored, the attempt is given back and a failure is counted.
  Otherwise the sanitized original is stored privately (`yourcat/originals/<uuid>.webp`), the cat takes
  the family's `base` sheet and `GROOMING` emote, and a `YourCat` record is written. The pixel avatar is
  drawn in the background (45 s abort) and stored public (`yourcat/avatars/<uuid>.png`,
  `max-age=300`); a record still `pending` 60 s after creation reads as `failed`.
- The playable cat (section 4 of the spec): a guest's own starter is restyled in place (`starterBreed`
  removed, so the lobby draws the uploaded look; `starterLockedAt` kept or set; `user.cat` and
  `onboarding: done` set). A registered account gets one photo cat, reused by later uploads, and a
  `pending` onboarding is set done. No score, Game row or `lastPlayedAt` is touched, and the free path
  never calls `createBlessingWithCat`.
- Share link (docs/plans/yourcat-polish.md §8): every record gets a random `shareId` (12 base64url
  characters from `crypto.randomBytes(9)`, unique sparse index) on create, photo and manual; a record
  made before share links gets one lazily in `YourcatService.view()` through one atomic
  `updateOne({ _id, shareId: { $exists: false } })`, so parallel reads agree. The friend link is
  `/yourcat?cat=<shareId>&utm_source=share&…`, never the record or a user id. `GET
  /yourcat/public/:shareId` (public, 60/min per client IP counted in the handler like `status`,
  `Cache-Control: public, max-age=60` on success) checks the id format before any query and returns
  `YourcatPublicView` only: the name when the visitor gave one, the family label, the avatar URL while
  it is ready and the family's sprite. A deleted record shows the sprite only; a record removed by
  retention is 404.
- `POST /yourcat/manual` picks a family without a photo (per-user cap only, no AI). `PATCH /yourcat/:id`
  names the card inside 24 h of creation without the game's rename cooldown; later renames go through
  `PUT /cat/:id/name`.
- `DELETE /yourcat/:id` marks the record deleted first, then expires open checkout sessions, deletes the
  avatar and the original, or keeps the original (`photoKeptUntilDelivery: true`) while a paid portrait
  still has a delivery attempt left (after the third failed attempt it is deleted at once), or for 3 days
  when Stripe could neither expire nor read a session that may still be open. A portrait checkout that
  runs in parallel re-reads the record after it creates its session and expires it (410
  `YOURCAT_PHOTO_EXPIRED`) when the record was deleted meanwhile. A style change whose old session
  cannot be confirmed closed answers a retryable 503 instead of opening a second payable session. If
  the record cannot be stored after the upload, the private original is deleted again.
  The game cat keeps its family look and name. The retention job deletes originals after 30 days and
  sweeps records whose owner is gone.
- HD portrait upsell: `POST /yourcat/:id/portrait-checkout` reuses one `Image` per record
  (`url: s3private://…`, `source: 'yourcat'`) and at most one open session; nothing is painted before
  payment. The webhook starts `PortraitDeliveryService`, which paints from the private original, emails
  the buyer ("Your portrait of {Name} is ready") and re-dates or deletes the original; a sweeper retries
  every 10 minutes, up to 3 painting attempts, then alerts. The email is tracked apart
  (`deliveryEmailAt`, set only when SendGrid accepts it): a painted portrait whose email failed is not
  repainted, only the email is retried, up to 5 sends, with an alert on the first failure and the last.
- `AiUploadGate` (used by `POST /yourcat`, `POST /image/portrait` and regenerate): client IP
  (`src/shared/client-ip.ts`: a usable `cf-connecting-ip`, else the Express address; production refuses
  with 503 `YOURCAT_NO_CLIENT_IP` only when neither is usable), App Check with a consumed limited-use
  token, a per-IP daily quota keyed on an HMAC of the day and address (a forged `cf-connecting-ip` sent
  straight to the origin gets a fresh slot: accepted risk, see "Known issues"), a per-IP failure cap that is never refunded, a per-user daily quota, and a reservation on the global daily budget (`aibudgetdays`, €5 by
  default, previews at most €3 of it). Every refusal gives back the slots the same call claimed.
  Measured costs settle the reservation; paid deliveries are recorded outside the cap.
- Burst limits: the `/yourcat` routes, `POST /image/portrait` and regenerate skip the global throttler
  and use `UserThrottlerGuard` plus `ClientIpThrottlerGuard` (per client address, from `client-ip.ts`).
  The portrait checkout allows 5 a minute per user (in memory) and 10 a day per user, counted in MongoDB
  in the handler (`aiquotas`, so restarts and replicas do not reset it).
- `GET /yourcat/stats` (ADMIN) returns the daily totals: the reliable server-side funnel, plus one
  refusal counter per `AiUploadGate` layer (`refusedNoClientIp`, `refusedAppCheck`, `refusedIpCap`,
  `refusedUserCap`, `refusedFailureCap`, `refusedBudget`; uploads and previews together). Every day
  also carries `portraitsDelivered`, `portraitsDeliveryFailed` and `portraitsEmailFailed`, 0 when not
  counted. The cms `/yourcat` page (nav link "YourCat") shows them for admins.

### Bad Cat Daily (badcat)

Payments, entitlements and cameos for the browser game in `bad-cat/`. The design is in
`docs/plans/viral-game/GDD.md` 6.5, 9 and 10. `bad-cat/FULL-PLAN.md` section 1 records the decision to
move the GDD's "Vercel functions" into this backend. Routes are in docs/API.md. Every feature is on; there
are no on/off flags (removed Oct 17). A
feature that needs a secret reports itself not ready in `GET /badcat/status` and answers 503 until that secret
is set; it never takes money without the webhook secret that confirms it.

Module map (`src/badcat/`, registered in the one `AppModule`):

| File | Role |
|---|---|
| `badcat.contracts.ts` | Mirror of the money and cameo block of `bad-cat/src/types.ts` (SKUs, request and response shapes, `BADCAT_ROUTES`, cameo constants). `badcat.contracts.spec.ts` reads the game file as text and fails on drift |
| `badcat-flags.ts` | Env readers for secrets and config values (Stripe key with its fallback, webhook and entitlement secrets, VAPID keys, URLs, caps, grace days, `BADCAT_FEED_AUTO_APPROVE`, `BADCAT_RESTORE_DEV_LINK`). No on/off feature flags |
| `badcat.schema.ts` | Ten collections and `BadcatStore` (all models in one provider) |
| `badcat-stripe.service.ts` | Own Stripe client, Checkout Session params, founding coupon and cap, portal |
| `badcat-webhook.service.ts` | `POST /badcat/stripe/webhook` handling |
| `badcat-account.service.ts` | Entitlements by email, tokens, thanks page completion, restore, portal, redeem, Club cat |
| `badcat-cameo.service.ts` | Cameo pool, shuffles, load counters, seen counter, faces |
| `badcat-admin.service.ts` | Status, creator codes and report, typed redirect counter, admin stats |
| `badcat-seen-email.job.ts` | Weekly Club "seen N times" email |
| `badcat.controller.ts` | Routes. Each public handler checks a per-client-IP limit (`ClientIpThrottlerGuard.consume`, the `/yourcat` pattern); the global throttler is skipped |
| `badcat-live.ts` | Phase 2: the replay-verified `BAD_CAT` branch of `POST /user/catbassadors/live` (the one score route; called only from `user.controller.ts`) |
| `badcat-run.dto.ts`, `badcat-sim-info.ts` | Phase 2: the `badcat` log of a BAD_CAT `/live` body; which vendored sim this backend replays with |
| `badcat-online.schema.ts` | Phase 2: `badcatlinks`, `badcatrooms`, `badcatpushsubs`, `badcatstreakemails` and `BadcatOnlineStore` |
| `badcat-online.service.ts` | Phase 2: daily board, account summary, purchase claim by verified email, streak-email opt-in, live treat meter, creator dashboard, cameo face from `/yourcat` |
| `badcat-links.service.ts` | Phase 2: short links, server OG page and PNG card (sharp, from SVG), room publish and the public room feed |
| `badcat-push.service.ts`, `badcat-webpush.ts` | Phase 2: web-push reminders (RFC 8291 / 8292 with node:crypto, no dependency) and streak emails |
| `badcat-online.controller.ts` | Phase 2 routes (same gating as `badcat.controller.ts`) |
| `src/vendor/badcat-sim/` | GENERATED by `bad-cat/tools/vendor-sim.mjs` (`npm run vendor-sim` in bad-cat/): the game's sim, content and codec as one bundle plus a typed facade. `badcat-sim.spec.ts` re-hashes it and replays `fixtures/badcat-golden.json` (written by the game's `src/server/server.test.ts`) |

Collections:

- `badcatpurchases`: one row per paid Checkout Session (unique `sessionId`). Renewals add
  `kind: 'renewal'` rows keyed `inv:<invoice id>`. Indexed on email, sku, subscriptionId,
  paymentIntentId and `meta.via`.
- `badcatcameos` (unique sparse `sessionId`; day and cat code indexed), `badcatshuffles` (unique day +
  shuffle), `badcatcounters` (unique `key`: `load:<day>:<shuffle>` and `typed:<YYYY-MM-DD>`).
- `badcatgifts` (unique code and session), `badcatfaces`, `badcatcreatorcodes` (unique code),
  `badcatclubcats` (unique email).
- `badcatrestoretokens` (hash only; TTL index a day after expiry), `badcatwebhookevents` (unique Stripe
  event id; TTL 90 days), `badcatfoundingholds` (a founding place held for an open Checkout Session;
  unique `holdId`; TTL index an hour after it lapses).

Flows:

- **Stripe key.** The module uses `BADCAT_STRIPE_SECRET_KEY` when it is set, else the shared
  `STRIPE_SECRET_KEY` (the Moon Rave pattern), taking the first one of the right mode: with
  `NODE_ENV=production` only a live key (a leftover test `BADCAT_STRIPE_SECRET_KEY` is skipped, so a test card
  never buys real entitlements), elsewhere only a test key (a staging or local server never takes real money).
  In production the webhook also ignores test-mode events. Bad Cat creates no payout rows. Checkout is ready
  only when a key of the right mode, `BADCAT_STRIPE_WEBHOOK_SECRET` and the entitlement key are all set;
  otherwise status reports `checkout: false` and checkout calls answer 503. The webhook verifies signatures
  with the static Stripe verifier, so it needs only its secret, not a key.
  Prices are inline `price_data` from the SKU table, so the Stripe dashboard needs no products.
- **Checkout Sessions.** Club, founding and Brand Shelf are `subscription` sessions. Everything else is
  `payment` with `customer_creation: 'always'`. Checkout always collects an email. `success_url` is
  `<returnBase>/thanks?session_id={CHECKOUT_SESSION_ID}` and `cancel_url` is `<returnBase>`.
  `returnBase` must be `BADCAT_PUBLIC_URL` or a path under it; `http://localhost` and `127.0.0.1` are
  also accepted outside production.
- **Metadata.** Every session carries `badcat=1`, the sku and the CheckoutMeta (`trigger`, `via`,
  `entry`, `from_in_app`, `ab_arm`, `session_index`), plus cat, day, gift and brand fields. The same
  metadata goes on the subscription or PaymentIntent. Values are strings of at most 500 characters, and
  names are filtered. Purchases are counted from these fields (GDD 14).
- **Founding.** Club yearly at $39.99 with a once-only $15 coupon (`badcat_founding_1500_once`, created
  on first use). The first year costs $24.99 and the plan renews at $39.99/yr; Checkout's `custom_text`
  states the renewal. At most 200 founding subscriptions are sold (`FOUNDING_CAP`); after that the
  route answers 409. Places are counted as paid founding subscriptions plus the holds of open founding
  sessions: each founding session expires after 31 minutes (`expires_at`) and holds its place until then
  plus 10 minutes; the paid webhook and `checkout.session.expired` release the hold, so concurrent
  buyers cannot oversell the cap.
- **Webhook.** The route gets a raw body (`RAW_BODY_PATHS` in `src/user/heist/live-body-limit.ts`).
  The signature is checked with `BADCAT_STRIPE_WEBHOOK_SECRET`: 400 when wrong, 503 when the secret is
  unset. Handling is idempotent by event id and by session id. The event id is recorded only after processing
  succeeds, so a throw or a crash mid-processing leaves nothing behind and Stripe's retry runs (every write is
  idempotent by session, subscription or invoice id).
  - `checkout.session.completed` and `async_payment_succeeded` (paid only) write the purchase.
  - Cameo and guest star SKUs also add a `badcatcameos` row (day + cat).
  - Gift SKUs add a gift with a random 10-character code (no I, O, 0 or 1).
  - Brand Shelf and sponsor SKUs wait in a manual queue (`queue: 'queued'`, listed in the admin stats).
  - `customer.subscription.updated` and `deleted`, and `invoice.paid`, keep the subscription status and
    period end. A new subscription counts as Club until its period + 2 days, until the first invoice
    confirms it.
  - `charge.refunded` marks a one-off purchase refunded, hides its cameo, and cancels its gift code
    (`canceledAt`): the code no longer redeems (`error: 'refunded'`), a redeemed Club gift ends at once,
    and a redeemed gift cameo is hidden. The cameo pool also skips cameos of refunded purchases and of
    canceled gifts.
- **Entitlement tokens.** The format is `<base64url(JSON)>.<base64url(HMAC-SHA256)>`, keyed with
  `BADCAT_ENTITLEMENT_SECRET`, else an HMAC of `INVALIDATE_CACHE_SECRET` with a fixed label (the pattern of
  `treat-guest-key.ts`); every entitlement route answers 503 only when neither is set. Setting or changing
  `BADCAT_ENTITLEMENT_SECRET` later invalidates tokens signed with the fallback (players restore them).
  - Club comes from a Club subscription that is active, trialing or past due with a future period end,
    or from an unexpired redeemed Club gift.
  - `skus` lists paid, unrefunded collar and cosmetic purchases.
  - Limits, free / Club: 1/5 cats, 1/3 freezes a week, 14/all archive days, 15/30 season tiers.
  - `expiresAt` is the earlier of now + 7 days and the end of the paid period.
  - The client never verifies a token. Refresh and the portal accept a token up to a year past its
    expiry, because they read only the identity. Club cat and face uploads need an unexpired token.
  - Two kinds of token. A **verified** token (`ev: 1`) is issued only by `POST /badcat/restore/verify`
    (the magic link proved the email): its entitlements merge every purchase and gift of the email, and
    the portal, the Club cat and face uploads trust its email. A **scoped** token (`sids`) is issued by the
    thanks page (`{ sessionId, token? }`) and by a gift redeem: the email in it was typed by the buyer and
    is never trusted. Its entitlements come only from the Checkout Sessions and `gift:<code>` it names;
    the portal opens only those purchases' own customers (each Checkout makes its own Customer); face
    uploads reach only those purchases' cameos; it may start a Club cat row for its email but never change
    one set by someone else. Passing the device's current token to the thanks page or to redeem adds the
    new purchase to its scope.
- **Restore.** Every valid email gets one hashed, single-use link valid for 30 minutes, and the answer
  is the same whether or not the email bought anything. An address gets at most 3 links an hour; after
  that the answer stays the same but no link is made. The link is emailed through SendGrid whenever
  `SENDGRID_API_KEY` is set. Without email, the response
  carries `devLink` only when `BADCAT_RESTORE_DEV_LINK=true` and `NODE_ENV` is not `production`, so a
  staging server never hands out a restore link for any email.
- **Gifts.** A Club gift gives the recipient's email 3 calendar months of Club. It is an entitlement,
  never a subscription. A gift cameo becomes the recipient's cameo on the day they choose. A code
  redeems once (a conditional update). The redeem answers a scoped token for the gift only; the
  recipient's other devices pick the gift up through a restore link.
- **Cameos (GDD 6.5).** Each page load gets one of 8 shuffles of the day.
  - The first request for a (day, shuffle) builds and stores it: xorshift32 seeded from day and
    shuffle, over the pool sorted by id. Later purchases join later shuffles, never a stored one.
  - Spectators, up to 15: the day's paid cameos, guest stars and gifts (weight 4); Club cats on their
    weekly day (one weekday per member, from a hash of the email; weight 2); admin-granted free, streak,
    reply, community and Pink Paw cameos (weight 1); and paid, guest star and gift cameos of the last
    30 days that have not reached 300 spectator loads yet.
  - Fridge, 40 magnets: every active Club cat (weight 2) and the day's other cameo cats (weight 1).
  - Friday guest stars: up to 3.
  - A cat appears at most once per list.
  - Every request adds one to `load:<day>:<shuffle>`; there are no per-cat writes and no personal
    data. A cameo's loads and a cat's seen counts are sums of the counters of the shuffles it is in.
  - Bundles are served for today − 400 to today + 1, in UTC days (day 1 is 2026-11-16).
  - Names are filtered on write and on read: NFKC, links, handles and phone numbers stripped, and a
    short block list.
- **Faces.** A cameo buyer, with an unexpired token for the cameo's email, uploads one PNG (magic bytes
  checked, at most 64 KB). It shows only after an admin approves it. Approval is once per cat:
  approving rejects the cat's other pending faces, and later uploads for an approved cat answer 409.
  Approved faces are served from MongoDB with `Cache-Control: public, max-age=86400`. Beyond ~50 new
  faces a week, faces move to the `/yourcat` moderation path (Phase 2).
- **Creator codes.** Anyone may request a code: 6–12 characters of a-z, 0-9 and _, pending until an
  admin approves it. The report covers each approved code: gross and estimated net (gross − 2.9 % −
  30 c per payment) of revenue-bearing, unrefunded purchases and renewals with `via=<code>`, within each
  buyer's first 6 months. The share is 20 % of the net, payable from $25 and paid by hand.
- **Typed redirect.** The short domain points to `GET /badcat/t`. It answers 302 to
  `<BADCAT_PUBLIC_URL>/badcat/pick?e=t` and adds one to `typed:<UTC date>`.
- **Admin stats.** Typed arrivals per day; purchases by sku, trigger, via, from_in_app and A/B arm;
  revenue and donations apart (the Pink Paw collar is not revenue); active subscriptions and gross MRR
  (yearly plans / 12, founding at its first-year price); founding places taken; the brand queue.

#### Phase 2 (GDD 10, 17.3): ranked saves, boards, accounts, links, feed, meter, push

Every Phase 2 piece is on (no flags). Pieces that need a secret say so in `GET /badcat/status`.

- **Ranked saves**. Game scores still have one write path: `POST
  /user/catbassadors/live`. Its body may now be `{ type: 'BAD_CAT', platform, badcat: { dayNo, simVersion, runs,
  finalHash?, score?, catCode?, name? } }`; `GameType.BAD_CAT` is in `shared/enums.ts` and `liveGameTypes`, never
  in `scoredGameTypes`, and the plain points path refuses it. `src/badcat/badcat-live.ts`:
  1. The DTO checks the log (current `SIM_VERSION` else 400 `BADCAT_SIM_VERSION`
     with `sim` info; runs `[dir 0..8, speed 0..2, buttons 0..7, count]` within one boss run else 400
     `BADCAT_REPLAY_INVALID`).
  2. The day must be open: UTC today, yesterday or tomorrow (players' local days), plus `BADCAT_SCORE_GRACE_DAYS`
     (0..7, default 1) more days back for a run queued offline; else 400 `BADCAT_DAY_CLOSED`.
  3. sha256 of the canonical log is looked up first: a failed digest is the same 400 from an in-process cache, a
     saved one is 409 `BADCAT_DUPLICATE`, both without a replay. One ranked run per player and day: 409
     `BADCAT_ALREADY_RANKED` (also the partial unique index `badcat_user_day_unique` on `{user, level}` where
     `type: 'BAD_CAT'`; a guest merge that meets it deletes the guest's row, as for Heist duplicates).
  4. The vendored sim replays the run through the shared replay queue (429 with Retry-After when full) and the
     per-IP replay bucket (`HeistReplayIpThrottleGuard` now counts BAD_CAT bodies too; with
     `NODE_ENV=production` and `TRUST_PROXY` unset it answers 503, the known issue in the `/live` section).
     Trailing input is 400 `BADCAT_TRAILING_INPUT`; a run without a score is 400 `BADCAT_NO_SCORE`.
  5. The `Game` row: `type: 'BAD_CAT'`, `level: 'd<dayNo>'`, the server's score (also as `points`), time,
     `outcome` (`won`, or `died` for a cuddle), `stamp`, `replayDigest`, and the filtered cat name and cat code
     for the board. The user gets `lastPlayedAt` only: no catnip, Tails, arrays or board reward.
- **Boards**. `GET /badcat/board/:day`: top 100 of a day by score (ties by the earlier
  save), registered players only (guests and deleted accounts dropped by a `$lookup` on `users`), the cat's
  name and code only, cached 30 s. `GET /badcat/board/:day/me` (accesstoken; guests allowed, on the guest
  allow-list) answers the caller's row and rank (no rank for a guest). Index `badcat_board`
  `{type, level, score: -1}`.
- **Accounts**. `GET /badcat/account` (accesstoken, guests allowed): signed in, guest,
  verified email, ranked days, best score, current streak, streak-email opt-in. `POST /badcat/account/claim`
  (accesstoken; 503 while the entitlement secret is missing): with a verified account email (`emailVerifiedAt`), a
  verified entitlement token for the purchases made with that email (the same token "Restore purchases" gives).
  The game signs in through the client page `/badcat-account` (docs/CLIENT.md).
- **Cameo face from /yourcat**. `POST
  /badcat/face/:cameoId/yourcat` (accesstoken, verified email that bought the cameo): the caller's newest
  `/yourcat` record with `avatarStatus: 'ready'` (its photo passed the `/yourcat` checks) is fetched from the
  Spaces CDN (https, DigitalOcean Spaces or tokentails.com hosts only), cut to 128 px and stored as an approved
  face. No AI call.
- **Short links and server OG**. `POST /badcat/link { path, kind, name?, score?,
  dayNo?, catCode? }`: `path` must be a shareable game path (`/badcat`, `/badcat/d/<n>`, `/glass`, `/pick`, `/r`,
  `/c/<cat>`, `/maker`; never restore, thanks or redeem links, nor params `t`, `session_id`, `code`, `token`,
  `email`); one stable 8-character id per path. `GET /badcat/s/:id`: a small HTML page with that link's OG tags
  ("Mochi scored 8,420. Your cat can't.") and an immediate redirect to `BADCAT_PUBLIC_URL` + path; hits counted.
  `GET /badcat/og/:id.png`: the 1200 x 630 card, drawn by sharp from an SVG (server fonts: whatever the host has).
  Links point at `BADCAT_SHORT_LINK_BASE` (else `BADCAT_API_PUBLIC_URL`, else `https://api.tokentails.com`).
- **Room feed**. `POST /badcat/room { code, clear?, feed? }`: the vendored Room Maker
  check (props, budget, 3 targets, reachability, sight lines) and, for the feed, a replay of the maker's clear run
  (at least one target). One row per gameplay hash. `pending` until an admin approves it, or `approved` at once
  with `BADCAT_FEED_AUTO_APPROVE=true`. `GET /badcat/feed?sort=new|top&cursor=`: approved feed rooms, 20 a page.
  `GET /badcat/room/:id`, `POST /badcat/room/:id/play` (counter), `POST /badcat/room/:id/report` (hidden after
  `BADCAT_FEED_REPORT_HIDE` reports, default 3). Admin: `GET /badcat/admin/rooms?status=`, `POST
  /badcat/admin/rooms/:id/approve|reject|hide` (CMS page `/badcat`).
- **Treat meter**. `GET /badcat/meter`: this UTC month's Pink Paw share from paid USD
  purchases: 10 % of the estimated net (gross − 2.9 % − 30 c) of revenue-bearing SKUs, plus the whole net of each
  charity collar. Refunded rows are left out. Cached a minute. An estimate, not the transfer amount.
- **Web push** (works when the three `BADCAT_VAPID_*` values are set; status says `push: false` otherwise). `GET /badcat/push/key`, `POST
  /badcat/push/subscribe { subscription, hour, tzOffsetMin }` (only endpoints of known push services: FCM,
  Mozilla, Apple, Windows), `POST /badcat/push/unsubscribe { endpoint }`. Generate the keys once with
  `node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.privateKey.export({format:'jwk'});console.log(Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'),j.d)"`
  (public key, then private key).
- **Streak emails** (when SendGrid is configured). `POST
  /badcat/account/streak-email { on }` (accesstoken, verified email).
- **Creator dashboard**. `GET /badcat/creator/me` (accesstoken):
  the codes requested with the account's verified email, purchases, gross and the 20 % share.
- `GET /badcat/sim`: the vendored sim's version and bundle sha256; `npm run
  vendor-sim:check-remote -- <backend url>` in bad-cat/ compares it with a build before deploying the game.

Limits of this build:

- Face approval (outside the `/yourcat` path), feed review, brand placement and creator payouts are manual
  (CMS page `/badcat`).
- A ranked log can be copied from a dare link (ghosts carry inputs): the digest stops an exact copy, but an edited
  copy would replay. Known gap; the board shows replayed scores only.
- The OG card uses the server's fonts; a host without fonts draws the shapes and no text.

### Tails Club (`/club`)

A monthly ($9.99) or yearly ($79) membership, prices including VAT, paid in place in the club card of the
web home page (`client/public/home`, docs/CLIENT.md "Home page (/)"; built in `landing-poc/v16c1`): plan toggle, email, Stripe Payment Element, pay. Half of every payment goes to Pink Paw
through the shelter-share keeper. Code: `src/club/` (rave layout), controller and providers in `AppModule`.

**Landing lab origins and wallets.** CORS (`src/shared/cors-origins.ts`, used by `main.ts`) allows the landing
lab's production alias `https://tokentails-landing-lab.vercel.app` and its deployment URLs matching
`^https://tokentails-landing-[a-z0-9]+-zbagdzevicius-projects\.vercel\.app$` (anchored, https only; no other
`vercel.app` origin), so the club card's in-page checkout works on previews. `credentials` is unchanged.
Apple Pay and Google Pay in the Payment Element show only on domains registered in Stripe (Settings, Payment
method domains); per-deployment preview hosts cannot be registered, so previews show card and Link only.
Register `tokentails.com`, `www.tokentails.com` and `tokentails-landing-lab.vercel.app` to get the wallets there.

| File | Role |
|---|---|
| `club.config.ts` | Reads env, `clubMissing()` / `clubReady()`, `CLUB_THROTTLES`, `CLUB_SHELTER_BPS` (5000, not an env) |
| `club.controller.ts` | Routes; `@SkipThrottle()` plus a per-IP `ClientIpThrottlerGuard.consume` per route |
| `club.service.ts` | Customer and Subscription create, clientKey idempotency, buyer poll, portal, `GET /club/me` |
| `club-webhook.service.ts` | Signature check, dispatch, event dedupe, Pink Paw share rows, refunds and disputes |
| `club-token.ts` | HMAC tokens: `manage` (30 days, buyer only) and `open` (15 minutes, emailed link) |
| `club-email.ts` | The emailed "manage or cancel" link (SendGrid) |
| `club.schema.ts` | `clubmembers`, `clubwebhookevents` (30-day TTL) |
| `club.errors.ts` | `{statusCode, code, key, message}`; `key` feeds the landing's `ERR` map |

**Stripe pattern.** Subscriptions API with the Payment Element, not Checkout. `POST /club/checkout` calls
`subscriptions.create` with `payment_behavior: 'default_incomplete'`,
`payment_settings.save_default_payment_method: 'on_subscription'` and
`expand: ['latest_invoice.confirmation_secret']` (API `2025-12-15.clover`: `Invoice` has no `payment_intent`), and
returns `latest_invoice.confirmation_secret.client_secret` for `stripe.confirmPayment`. Idempotency: one
`clubmembers` row per `clientKey` (unique), sha256 of the normalised body (`keyReused` on a mismatch), Stripe
idempotency keys `club:cus:<clientKey>` and `club:sub:<clientKey>`. An inbox (canonical email) with an
`active`, `trialing` or `past_due` membership gets 409 `alreadyMember` (an accepted membership oracle, behind the
6 per 10 minutes per-IP limit). Every checkout gets a new Customer: typing an address does not prove you own it,
and an earlier Customer would hand its old invoices and saved cards to the payer's manage link.
More than `CLUB_INCOMPLETE_PER_15MIN` (default 30) incomplete subscriptions created in the last 15 minutes answer
503 `busy` (card-testing brake). An optional `accesstoken` of a signed-in, non-guest player adds `userId` to the
subscription metadata and the row; a bad or guest token is ignored.

**Status and poll.** `GET /club/status` reads both prices (`prices.retrieve`, cached 10 minutes; a failed read is
retried after 1 minute and reports `enabled: false, reason: 'price'`). A price must be an active USD recurring
price of the plan's interval; a price that is not `tax_behavior: inclusive` only logs a warning.
`GET /club/subscriptions/:id?k=<clientKey>` answers 404 unless `sha256(k)` matches; while `incomplete` it reads
the subscription from Stripe at most every 5 seconds (rave `pollStripe` pattern), and once active it adds a
30-day `manageToken`.

**Webhook.** `POST /club/stripe/webhook` (raw body, `RAW_BODY_PATHS`): 503 without `CLUB_STRIPE_WEBHOOK_SECRET`,
400 on a bad signature; production ignores test-mode events; event ids are recorded only after a successful
dispatch. Every handler skips objects that are not the club's (`metadata.club === '1'` on the subscription, or
on the invoice's `parent.subscription_details`, else a known member row).

- `customer.subscription.created|updated|deleted`: re-reads the subscription (expanded customer) and writes
  `subStatus`, `cancelAtPeriodEnd`, `periodEnd` (item-level `current_period_end`). A club subscription with no
  row (a crash between Stripe's create and our write) is matched by its metadata `clientKey`, else rebuilt from
  the customer's email.
- `invoice.paid` (any `billing_reason`, `amount_paid > 0`): syncs the subscription, then inserts one
  `cryptocheckouts` keeper row like rave `queuePayout`: `orderId = club_<first 16 hex of sha256(invoiceId)>`
  (deterministic: a replay hits the unique index), `cardIntent` from `invoicePayments.list({invoice})`,
  `user` = the member's `userId` or `RAVE_SYSTEM_USER`, `rail: 'card'`, `network: 'card'` (live) or `'testnet'`,
  `sku: {kind: 'CLUB', plan, subscriptionId, invoiceId}`, `status: 'COMPLETE'`, and `shelterShare` = the
  `treasuryShelterShare` rule at 5000 bps of `amount_paid`, VAT included, with memo `tt:club:<16 hex>`
  (500 cents a month, 3950 a year). Tax lines are not deducted, because the home page promises "$5 of your
  $9.99" on VAT-inclusive prices; any VAT comes out of Token Tails' half. A payment whose mode does not match the
  keeper's chain (`mode-skipped`) or an invoice not in USD (`currency-skipped`) queues nothing and logs an error.
  Then the keeper is kicked.
- `invoice.payment_failed`: logged only (the status arrives through `subscription.updated`).
- `charge.refunded`, `charge.dispute.created`: the share row is found by `cardIntent`. A dispute or full refund
  marks it reversed (`rave-share.ts`: a `due` row becomes `void`, a sent one is flagged and never re-sent) and
  cancels the subscription at once (no renewal left to refund or dispute). A partial refund shrinks a waiting
  share to half of what was kept. A dispute Token Tails later wins does not restore the share (manual).

**Portal.** `POST /club/portal` with `{manageToken}` returns a `billingPortal.sessions.create` URL
(`return_url: https://tokentails.com/#club`). With `{email}` it always answers 202 `{sent: true}`; if that inbox
has a non-incomplete membership and has asked at most 3 times today, it emails a 15-minute link to
`GET /club/portal/open?t=…` (sent without waiting, so a member and a stranger get the 202 in the same time),
which redirects 303 to a fresh portal session (an expired link redirects to
`https://tokentails.com/?club_portal=expired#club`). The email branch answers 503 `CLUB_PORTAL_OFF` without
`SENDGRID_API_KEY`; the token branch and everything else keep working.

**Account.** `GET /club/me` (`AppAuthGuard`, guests denied) returns `{club: {plan, until} | null}`, matched by
`userId`, or by canonical email only when the account has `emailVerifiedAt`; a match by email writes `userId`
onto the row. No game reads it yet, so the landing promises no in-game perk.

**VAT.** Prices are tax-inclusive gross amounts (`tax_behavior: inclusive`); `automatic_tax` is not used.
Turning Stripe Tax on later only means adding `automatic_tax: {enabled: true}` to `subscriptions.create`; the
share base stays the gross `amount_paid`, so the shelter still gets $5 of $9.99 and Token Tails' half carries
the VAT. Whether Token Tails MB must register for VAT or OSS is an open
question for the accountant.

**Before the env is set.** The module ships closed and needs none of its variables to boot. With any required
value missing, `GET /club/status` answers `{enabled:false, reason:'config', shelterBps:5000}` (the home page then
shows "Coming soon"), `POST /club/checkout` is 503 `CLUB_OFF` before the per-IP limit or any Stripe call, the
webhook is 503 `CLUB_WEBHOOK_UNAVAILABLE`, `POST /club/portal` is 503 and an emailed link goes back to the card.
`src/club/club.boot.spec.ts` boots the controller and both services in Nest over HTTP with every club variable
unset and asserts this. The club opens on its own once the variables are set and both prices read from Stripe.

**Founder setup (Stripe Dashboard, not code).**

1. Product "Tails Club" with two prices, both `tax_behavior: inclusive`: $9.99 USD recurring monthly
   (`STRIPE_CLUB_PRICE_MONTH`) and $79.00 USD recurring yearly (`STRIPE_CLUB_PRICE_YEAR`).
2. Webhook endpoint `https://api.tokentails.com/club/stripe/webhook` (`CLUB_STRIPE_WEBHOOK_SECRET`) with
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`.
3. Customer portal (Billing → Customer portal): cancel at period end and payment method updates on, plan
   switching off.
4. Payment method domains: `tokentails.com`, plus the embed host if it is another domain (also add it to
   `FRONT_END_URLS` for CORS), so Apple Pay and Google Pay work.
5. Email receipts on, with the portal link in emails.
6. Top up the Arc keeper hot wallet before launch, or every share waits as `due`.
7. Confirm the Pink Paw agreement covers the Club's 50% share before launch.

## Scheduled jobs

All jobs use `@Cron`, declared inside controllers and services. Every job except the traction
refresh runs through `runLeased` (`src/shared/jobs/lease.ts`, plan F8): one document per job in
`jobruns` (`{_id: jobName, lockedUntil, lockedAt, lockedBy, status, finishedAt}`) so a job runs once
per tick across replicas. The guest jobs are off unless `CRONS_ENABLED` is true (default: on only
under `NODE_ENV=production`); the impact, treat and paw jobs need `IMPACT_JOBS_ENABLED`.

| Job (lease name) | Location | Schedule | Effect |
|---|---|---|---|
| Refresh traction counts | `src/app.controller.ts` | Daily 10:00 | Recompute users, cats, blessings, orders, and weekly buckets (guests and guest starters excluded, `guestSessions` apart). Also runs at boot. In-process, so replicas diverge (known issue). |
| Reset daily check-in (`user-check-in-reset`) | `src/user/user.controller.ts` | Daily 01:00 | Set `canRedeemLives: true` for every registered user. |
| Reset user status (`user-status-reset`) | `src/user/user.controller.ts` | Daily 01:00 | Writes `status.EAT = 0` on registered users. The field is not in the user schema; likely a copy-paste of the cat job. |
| Guest cleanup (`guest-cleanup`) | `src/user/user.controller.ts` | Daily 03:00 | Deletes guests idle for 30 days (`lastSeenAt`, or `createdAt`), their cats and their anonymous Firebase users; guests in a merge are kept; Game rows stay. |
| Guest merge resume (`guest-merge-resume`) | `src/user/user.controller.ts` | Every 10 minutes | Finishes merges left mid-way (every step is conditional). |
| Weekly top rewards (`weekly-top-rewards`) | `src/user/user.controller.ts` | Weekly | Top 200 by earned Tails (guests, flagged and deleted accounts excluded) receive 200 each. |
| Reset codex and monthly counters | `src/user/user.controller.ts`, logic in `src/user/codex-reset.ts` | Monthly, 23:00 UTC on the 8th (`0 0 23 8 * *`, `timeZone: 'UTC'`) | Pays codex guards, then zeroes the codex `month*` counters (now also `monthTailsGiven` and `monthGoalsHelped`) and clears claimed challenges and milestones. Runs one hour before the phase anchor, inside the two-hour codex freeze. Idempotent: the period (`YYYY-MM` of the phase that starts) is claimed atomically in the `jobruns` collection (`claimJobPeriod`), so a second run or a second instance skips; runs more than 48 hours from an anchor are refused. `scripts/repair-codex-counters.js` (dry run by default) recomputes the purchase counters from orders. |
| Empty cat stomachs (`cat-status-reset`) | `src/cat/cat.controller.ts` | Daily 01:00 | Set `status.EAT = 0` on every cat (guest starters included, so guests can feed daily). |
| Treat reconcile (`shelter-donate-reconcile`) | `src/shelter/onchain/shelter-donate-reconcile.service.ts` | Every 2 minutes | Settles SENT gifts by receipt (see "Shelter gifts on Arc"); then settles relayed wallet gifts, scans RouterDonation logs, sends and settles matches, and flushes the router (each step only when configured). |
| Payout indexer (`impact-indexer`) | `src/impact/impact-indexer.service.ts` | Every 5 minutes | Indexes ShelterSplit payout logs on every served chain of the main chain's class. A recorded split starts at its deploy block; an env-only `SHELTER_SPLIT_ADDRESS` stays idle until `SHELTER_SPLIT_FROM_BLOCK` is set. |
| Payout index (`shelter-payout-index`) | `src/shelter/onchain/payout-index.service.ts` | Every 2 minutes | Reads every recorded ShelterSplit (wallet.config.ts, mainnet and testnet by default) into `shelterpayoutlogs` for `GET /shelter/payouts`; see "Payout index". Needs `IMPACT_JOBS_ENABLED`; `SHELTER_PAYOUTS_INDEX=off` stops it. |
| Impact snapshot (`impact-snapshot`) | `src/impact/impact.service.ts` | Hourly at :07 | Writes the hour's `impactsnapshots` row and the optional CDN mirror. |
| Snapshot compaction (`impact-compact`) | `src/impact/impact.service.ts` | Daily 00:20 | Keeps one row per day for snapshots older than 48 hours. |
| Paw settlement (`paw-settlement`) | `src/impact/paws.service.ts` | Daily 00:30 UTC | Settles yesterday's paws (send only with `PAWS_SETTLEMENT_ENABLED`). |
| Paw reconcile (`paw-reconcile`) | `src/impact/paws.service.ts` | Every 10 minutes | Settles sent paw transactions and catches up missed days (3 days back). |
| Give sweeper (`rescue-goal-pledge-sweeper`) | `src/rescue-goal/rescue-goal-pledge.service.ts` | Every minute | Rolls stuck gives forward or refunds them; re-runs cancel refunds. |
| `/yourcat` retention (`yourcat-retention`) | `src/yourcat/yourcat-retention.job.ts` | Daily 03:15 UTC | Deletes `/yourcat` originals past `originalDeleteAfter` (30 days; kept while a paid portrait is undelivered), removes records whose owner is gone (both objects and the record), hard-deletes placeholder records (`creatingAt` set) older than 10 minutes with their objects, and marks avatars still `pending` 10 minutes after creation as `failed`. |
| `/yourcat` portrait delivery sweep (`yourcat-portrait-delivery-sweep`, plus a per-order lease `portrait-delivery:<orderId>`) | `src/yourcat/portrait-delivery.service.ts` | Every 10 minutes | Retries paid `/yourcat` portraits of the last 7 days that have no `aiUrl` and fewer than 3 attempts (the third failure sends an alert), and painted ones whose email SendGrid has not accepted, up to 5 sends (alerts on the first and the last). |
| Goal count (`shelter-goal-scan`) | `src/shelter/goal/shelter-goal.service.ts` | Every minute | Advances the C-001 inflow scan: up to 40 `eth_getLogs` windows of 9,999 blocks (the public Arc RPC refuses 10,000), 300 ms apart, counting Transfer logs to the campaign wallets into `sheltergoalcursors` (compare-and-set per window). A view of `GET /shelter/goal/:id` also nudges it, at most once a minute. On unless `SHELTER_GOAL_SCAN=off`; needs no key. |
| Bad Cat seen email (`badcat-seen-email`, once per week via `claimJobPeriod`) | `src/badcat/badcat-seen-email.job.ts` | Mondays 09:00 UTC | Emails each active Club member with a Club cat "<name> was seen in N rooms this week" (last week's shuffle counters). No-op unless `SENDGRID_API_KEY` is set |
| Bad Cat push reminder (`badcat-push`, once per UTC hour via `claimJobPeriod`) | `src/badcat/badcat-push.service.ts` | Hourly at :00 UTC | Sends "Today's room is open" to the push subscriptions of that UTC hour, once a day each; 404/410 deletes a subscription, 5 failures in a row too. No-op unless the `BADCAT_VAPID_*` keys are set |
| Bad Cat streak email (`badcat-streak-email`, once per day via `claimJobPeriod`) | `src/badcat/badcat-push.service.ts` | Daily 18:00 UTC | Emails opted-in accounts whose ranked streak (2+ days) ends tonight (played yesterday, not today, UTC). No-op unless SendGrid is set |

## Environment variables

Names only. Copy `backend/.env.example` to `backend/.env` and fill in values.

| Group | Variables |
|---|---|
| Server | `PORT`, `IS_PROD`, `NODE_ENV` (several job and safety defaults follow `production`), `FRONT_END_URLS`, `MAIN_FE_DOMAIN`, `TRUST_PROXY` (optional override, any Express `trust proxy` value, `0` or `false` for none; default trusts private, CGNAT and Cloudflare hops) |
| Database | `MONGODB_URI`, `MONGO_TRANSACTIONS` (default off; `true` runs Rescue Goal gives in a transaction, only on a confirmed replica set) |
| Auth | `FB_PRIVATE_KEY` (Firebase service account key), `ML_ACCESS_TOKEN` (unused guard) |
| Identity (plan F5) | `AUTH_ENFORCE_EMAIL_VERIFIED` (default `true`: an unverified new password user gets 403 `EMAIL_UNVERIFIED` and no account), `AUTH_REQUIRE_VERIFIED_EXISTING` (default `false`; only matters for accounts created while enforcement was off), `APP_CHECK_ENFORCE` (default `false`; `true` requires a valid `x-firebase-appcheck` on `POST /user/guest/session`), `NEW_ACCOUNTS_PER_IP_PER_HOUR` (default 10), `GUEST_SESSIONS_PER_IP_PER_HOUR` (default 30), `DISPOSABLE_EMAIL_DOMAINS` (extra comma-separated domains), `IDENTITY_BACKFILL_DONE` (set `true` after `backfill-identity-fields.js --apply`; switches off the case-insensitive email fallback and turns on the alias rules), `GOOGLE_APPLICATION_CREDENTIALS` (only for `scripts/backfill-firebase-uid.ts`) |
| Sign in with Apple revocation | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`, optional `APPLE_AUDIENCE`. Without them `DELETE /user/me` skips the revoke and logs it |
| Jobs | `CRONS_ENABLED` (guest cleanup and merge resume; default on only under `NODE_ENV=production`), `IMPACT_JOBS_ENABLED` (indexer, snapshot, compaction, treat reconcile, paws; same default; set it explicitly in production), `RESCUE_GOAL_SWEEPER` (`off` stops the give sweeper), `SHELTER_PAYOUTS_INDEX` (`off` stops the payout index job), `SHELTER_PAYOUTS_INDEX_NETWORKS` (`mainnet`, `testnet` or both, default both), `SHELTER_PAYOUTS_INDEX_CHUNK` (widest `eth_getLogs` window, default 10000) |
| Impact (plan F7) | `SHELTER_SPLIT_FROM_BLOCK` (first block to index on the main chain; unset: the recorded split's deploy block, or idle for an env-only `SHELTER_SPLIT_ADDRESS`), `SHELTER_LOG_CHUNK` (blocks per `eth_getLogs`, default 2000, 1 to 10000), `IMPACT_INDEXER_MAX_CHUNKS` (calls per run, default 25), `IMPACT_PAWS_SENDERS` (extra addresses allowed to settle paws), `IMPACT_CDN_ENABLED` (default off; mirrors `impact.json`), `IMPACT_CDN_OBJECT_KEY` (default `impact/impact.json`), `IMPACT_CDN_BUCKET` (default `DO_SPACES_NAME`) |
| Paws (plan G4) | `PAWS_SETTLEMENT_ENABLED` (default off; `true` lets the nightly settlement send), `PAWS_DAILY_BUDGET` (wei, default 1 USDC), `PAWS_AMOUNT` (wei per paw, default 0.01 USDC) |
| Rescue Goals (plan G5) | `RESCUE_GOAL_PLEDGES` (`off` is a kill switch for gives) |
| Specs only | `MONGO_IT_URI`, `IDENTITY_SPEC_MONGO_URL`, `LIVE_SPEC_MONGO_URL`, `HEIST_BENCH`, `HEIST_BENCH_ROUNDS`; migrations read `MIGRATION_APPLY` (and `MIGRATION_BACKFILL_MISSING`) |
| Encryption | `INVALIDATE_CACHE_SECRET` (despite the name, this seeds the AES key for custodial wallet secrets; rotating it makes stored secrets unreadable) |
| Guest treats | `SHELTER_TREAT_IP_SALT` (optional HMAC key for the daily address hash of `POST /shelter/donate/guest`; unset: `INVALIDATE_CACHE_SECRET` is used as the HMAC key, else a random per-process salt, which lets an address send one extra treat after a restart) |
| AI | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| `/yourcat` and AI caps (bet #3) | `YOURCAT_ENABLED` (default `false`; kill switch for `POST /yourcat` and `/yourcat/manual`, status shows paused), `YOURCAT_PORTRAIT_ENABLED` (default `false`; the HD upsell checkout), `PORTRAIT_PREVIEW_ENABLED` (default `true`; `false` answers 503 on `POST /image/portrait` and regenerate), `AI_BUDGET_EUR_PER_DAY` (default 5, all kinds), `AI_BUDGET_PREVIEW_EUR_PER_DAY` (default 3, the part previews may use), `AI_UPLOAD_IP_DAILY`, `AI_UPLOAD_IP_DAILY_UNVERIFIED`, `AI_UPLOAD_USER_DAILY` (3, 0, 3), `AI_PREVIEW_IP_DAILY`, `AI_PREVIEW_IP_DAILY_UNVERIFIED`, `AI_PREVIEW_USER_DAILY` (3, 1, 3), `AI_UPLOAD_IP_FAILURES_DAILY` (5, both kinds, never refunded), `AI_MANUAL_USER_DAILY` (5), `AI_UPLOAD_APPCHECK_ENFORCE`, `AI_PREVIEW_APPCHECK_ENFORCE` (default `false`; `true` requires a valid, unused limited-use App Check token), `AI_UPLOAD_IP_SALT` (HMAC salt for the per-IP day key; falls back to `INVALIDATE_CACHE_SECRET`; neither set in production refuses with 503), `AI_ALERT_EMAIL_TO` (alert recipient; unset: alerts are only logged), `AI_ALERT_COST_PER_UPLOAD_EUR` (0.10), `AI_ALERT_COST_PER_PREVIEW_EUR` (0.40), cost rates `AI_COST_OPENAI_INPUT_EUR_PER_MTOK`, `AI_COST_OPENAI_OUTPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_INPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_OUTPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_IMAGE_EUR_1K`, `AI_COST_GEMINI_IMAGE_EUR_2K`, `AI_COST_GEMINI_IMAGE_EUR_4K`, `AI_COST_FALLBACK_IMAGE_EUR` (0.08 per 1K image, x4 for 4K), `AI_COST_FALLBACK_TEXT_EUR` (0.01); defaults and the date they were read are in `src/ai-budget/ai-cost.ts` |
| Portrait prices and checkout (bet #3) | `PORTRAIT_CHECKOUT_TOS_CONSENT` (default unset; `true` adds Stripe's required terms checkbox with the withdrawal acknowledgement to digital sessions on the legacy `/portrait` routes; `/yourcat` sessions always have it) |
| Storage | `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `DO_SPACES_CDN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (signing secret of `/image/webhook`; also the fallback signing secret of the optional `/rave/stripe/webhook`), `STRIPE_PUBLISHABLE_KEY` (optional; read only by the Moon Rave checkout and ads, which otherwise use the public live key checked in as `RAVE_PUBLIC_STRIPE_PK_LIVE` with a live secret key in production), optional `STELLAR_TREASURY_ADDRESS` and `STELLAR_USDC_ISSUER` (default to the public values in `src/web3/stellar-payment.ts`) |
| Crypto checkout | No on/off flag: checkout is on wherever a chain resolves with a treasury or a live split route (on a mainnet, only while the on-chain giving check passes for that split), and the shelter-share keeper runs whenever the shelter config is ready and its chain is on the checkout network (rollback: revert and redeploy). `CRYPTO_PAY_NETWORK` (`mainnet` or `testnet`; default `mainnet` under `NODE_ENV=production`), `CRYPTO_PAY_TREASURY` (one public treasury address for every chain) and `CRYPTO_PAY_TREASURY_<chainId>` (per chain); both are optional overrides of the checked-in `src/payments/crypto/treasury.public.ts`, needed only on testnets and the local chain, `CRYPTO_PAY_RPC_<chainId>` (optional override; else the funding variable such as `RPC_BASE_MAINNET`; else the checked-in official RPC of the chain), `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD` (needed for `CRYPTO_PAY_NETWORK=testnet` under production), `CRYPTO_PAY_ORDER_TTL_MIN` (5 to 1440, default 30), `CRYPTO_PAY_EURC_PER_USD` (EURC per USD of price; unset: a fixed euro price, 1 EURC per USD) and `CRYPTO_PAY_EURC_FX_DATE` (required with a set rate; EURC stops after 30 days), `CRYPTO_PAY_CAT_SHELTER_BPS` (shelter share of a shelter cat on the treasury route; unset: 5000; malformed: undecided, nothing sent), `CRYPTO_PAY_SPLIT_SHELTER_IDS` (default Pink Paw), `CRYPTO_PAY_CAT_SPLITS` (`chainId:TOKEN:0xsplit,...`; default the main split for USDC), local E2E only: `CRYPTO_PAY_LOCAL_USDC`, `CRYPTO_PAY_LOCAL_EURC` (chain 31337, testnet mode). `STELLAR_PACKS_ENABLED` (`true` reopens Stellar packs; rollback only), `STELLAR_PACKS_SUNSET_AT` (ISO time; Stellar pack payments before it are still granted, later ones recorded for a refund; fixed at `2026-10-09T18:00:00Z`, the env can only move it earlier) |
| Moon Rave checkout (`cat-rave/CHECKOUT-SPEC.md`) | Always on, no on/off flag, no new env: with `STRIPE_SECRET_KEY` (live) under `NODE_ENV=production` and the shelter keeper ready, card payments are on. Two tabs, each open on its own; `GET /rave/status` says `enabled:false` with a `reason` only while both are closed, and `POST /rave/checkout` answers 503 for a closed tab. Card: `STRIPE_SECRET_KEY` plus a publishable key of the same mode, `STRIPE_PUBLISHABLE_KEY` when set, else `RAVE_PUBLIC_STRIPE_PK_LIVE` (`src/rave/rave.config.ts`, the live key the tokentails.com client already ships) for a live secret key in production only; a test secret key without `STRIPE_PUBLISHABLE_KEY` keeps card closed (`stripe`); their modes must match the payout chain's network or status says `mode`. Card closes (`stripe`) while the publishable key is clearly of another account than the secret key (checked with `GET /v1/account` at most hourly; an unreadable account never closes it), and for 5 minutes after `paymentIntents.create` fails with an authentication or permission error (`src/rave/rave-stripe-health.ts`). Webhook optional: `RAVE_STRIPE_WEBHOOK_SECRET`, else `STRIPE_WEBHOOK_SECRET`, signs `POST /rave/stripe/webhook`; with or without it the `rave-stripe-events` cron (every minute, `jobruns` lease of 5 min, only with `NODE_ENV=production`) reads `payment_intent.*`, `charge.refunded` and `charge.dispute.created` from Stripe's Events API with the secret key and runs them through the same handler (deduped by event id; cursor in memory, 72 h back on boot, 2 min overlap, at most 5 pages of 100 per run, same-second events in Stripe's order). A pulled payment never rebuilds a missing order (only the pushed webhook and the buyer's GET may): the account's events are shared by every deployment holding the key. Pulled events that are not the rave's are not stored. A restricted `rk_` key without Events read access logs one warning: payments still confirm through `GET /rave/orders/:id`, but refunds and disputes then need the webhook. Crypto (USDC): Arc only (5042 mainnet, 5042002 testnet, `RAVE_USDC_CHAIN_IDS`), where the split's public giving check passes; needs neither Stripe nor the keeper; a testnet shelter chain in production is refused (`mode`). Other: `RAVE_FEE_PERCENT_BPS` (290), `RAVE_FEE_FIXED_CENTS` (30), `RAVE_MAX_CATS` (500), `RAVE_DAILY_CAP_USD` (100; paid orders count in full, unpaid ones of the last 15 min hold at most 10% of it together), `RAVE_CREATED_PER_HOUR` (200, card-testing brake). A paid card order adds one row to the shelter-share keeper for the full donation (less any refund recorded before the row exists), memo `tt:rave:<16 hex>`, idempotent on the PaymentIntent id; the row's `network` is `card` for a live payment (paid only by a mainnet keeper) and `testnet` for a test one (paid only by a testnet keeper), and a payment whose mode does not match the keeper's chain queues nothing. Status says `keeper` while the keeper cannot run (no RPC, split or hot wallet key, or its `network-mismatch` check fails); the keeper has no flag. Buyer country (the flag the cats hold): read from Cloudflare's `cf-ipcountry` at checkout (needs IP geolocation on in Cloudflare; `XX`/`T1` count as unknown), else the buyer's pick (`XK` Kosovo accepted); `country: "none"` ("Show my flag" off in the sheet, which also tells the buyer the flag is public) stores nothing. Stored as `country` + `countrySource` on the order, the IP never. Moderation (`hidden`) also hides the country in public rows and the leaderboard. Like `cf-connecting-ip`, a caller reaching the origin directly can forge the header; worst case is a wrong flag on its own cats. Existing orders have no country (no migration) and count as unknown in `GET /rave/countries`. Code: `src/rave/` (`rave-country.ts`) |
| Moon Rave ad space (`/rave/ads`) | Always on, no on/off flag; two tabs like the rave checkout. Card: the same Stripe key resolution (no webhook secret needed; the rave Events API pull confirms ad payments and refunds). Crypto: USDC on Arc only, a `transfer` of an exact tagged amount ($100 + 10,000 + 1–9,999 base units, above any $100 crypto pack amount; unique index `usdcAmountKey`, freed a day after an unpaid hold ended) to the Token Tails treasury from `treasury.public.ts` on the checkout network (`CRYPTO_PAY_NETWORK`; testnet needs `CRYPTO_PAY_TREASURY_5042002`), verified read-only through `POST /rave/ads/:adId/usdc-tx` (`usdcTxHash` unique; a tx that already backs a crypto checkout `payment.txHash` is refused). No automatic USDC refunds: reject or a lost slot sets `refund.state: manual` with the payer wallet, and an error log line. `GET /rave/ads/status` says `enabled:false` with a `reason` only while both tabs are closed (approved ads still list). `RAVE_AD_HOLD_MINUTES` (default 15, 5–60), `RAVE_AD_DAYS` (default 30), `RAVE_AD_SHELTER_BPS` (default 0 = Token Tails revenue; > 0 queues that share of an approved ad for Pink Paw through the shelter-share keeper, memo `tt:ravead:<16 hex>`, row `network` `card` (live) or `testnet` (test), and then needs the keeper config and a matching `CRYPTO_PAY_NETWORK`). Shares `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, the optional webhook secret, `RAVE_FEE_PERCENT_BPS` and `RAVE_FEE_FIXED_CENTS` with the rave checkout; images go to the public bucket (`DO_SPACES_*`, `DO_SPACES_CDN`; WebGL needs CORS `GET` from tokentails.com on the CDN) |
| Tails Club (`/club`, docs "Tails Club") | No on/off flag: open when all of these are set and both prices read from Stripe. Required: `STRIPE_SECRET_KEY` (shared; live only with `NODE_ENV=production`, test only elsewhere), `STRIPE_PUBLISHABLE_KEY` (same mode; production falls back to the rave live publishable key), `STRIPE_CLUB_PRICE_MONTH`, `STRIPE_CLUB_PRICE_YEAR` (recurring USD price ids, tax-inclusive), `CLUB_STRIPE_WEBHOOK_SECRET` (signing secret of `/club/stripe/webhook`), `CLUB_TOKEN_SECRET` (else an HMAC of `INVALIDATE_CACHE_SECRET`). Optional: `SENDGRID_API_KEY` (only the emailed portal link; without it `POST /club/portal {email}` is 503), `CLUB_INCOMPLETE_PER_15MIN` (card-testing brake, default 30), `CLUB_API_PUBLIC_URL` (origin of the emailed link, default `https://api.tokentails.com`) |
| Shelter gifts (all chains) | Required in production: only `SHELTER_DONATE_PRIVATE_KEY` (a dev box needs nothing: the key comes from the local `donatehot` Foundry keystore, `SHELTER_DEV_KEYSTORE` names another); everything else in this row and the next three is an optional override. `SHELTER_CHAIN_ID` (default `5042` Arc mainnet under `NODE_ENV=production`, else `5042002` Arc Testnet), `SHELTER_NETWORK` (`mainnet` or `testnet`; overrides that default), `SHELTER_ARC_RPC_URL` (defaults to `https://rpc.mainnet.arc.io` or `https://rpc.testnet.arc.io` by chain), `SHELTER_SPLIT_ADDRESS` (optional override; default the main chain's split in `wallet.config.ts`), `SHELTER_DONATE_PRIVATE_KEY` (server hot wallet; keep only a small float of USDC on it), `SHELTER_DONATE_AMOUNT_WEI` (default 0.01 USDC), `SHELTER_DONATE_DAILY_BUDGET_WEI` (default 1 USDC), `SHELTER_X402_PRICE_WEI` (default 0.01 USDC) |
| Wallet gifts (F2) | `SHELTER_ROUTER_ADDRESS` (DonateRouter, empty until deployed), `SHELTER_ROUTER_FROM_BLOCK` (first block of the RouterDonation scan; unset: 5000 blocks behind the head on the first run), `SHELTER_RELAY_ENABLED` (default off), `SHELTER_RELAY_DAILY_TX` (default 50), `SHELTER_RELAY_MIN_USDC` (default 0.01), `SHELTER_RELAY_MAX_USDC` (default 100), `SHELTER_MATCH_ENABLED` (default off), `SHELTER_MATCH_PER_GIFT` (default 1 USDC, `DEFAULT_MATCH_PER_GIFT`), `SHELTER_MATCH_MIN_GIFT` (default 0.10), `SHELTER_MATCH_DAILY` (default 2 USDC), `SHELTER_MATCH_POOL` (default 10 USDC in total), `SHELTER_TREASURY_ADDRESS` (optional; refused as a claimed shelter wallet, never matched), `SHELTER_CLAIM_ALLOWED_WALLETS` (comma-separated; the only wallets `POST /shelter/claim` accepts; empty refuses all), `SHELTER_MATCH_EXCLUDE` (comma-separated team wallets: never matched, never counted as public wallet gifts), `SHELTER_RELAY_IP_PEPPER` (secret HMAC key for the stored relay IP hash; unset stores none), `SHELTER_HELD_WALLETS` (comma-separated wallets Token Tails holds for a shelter, added to the built-in `TOKEN_TAILS_HELD_WALLETS` (`0xE299…0f37`, a Token Tails wallet): never accepted as a shelter claim, a public-giving recipient or an x402 `payTo`). USDC amounts are decimal strings; a malformed value falls back to the default |
| Try-it testnet (F3) | `SHELTER_TRY_CHAIN_ID` (a testnet id other than `SHELTER_CHAIN_ID`, e.g. `5042002`; unset: off), `SHELTER_TRY_RPC_URL`, `SHELTER_TRY_ROUTER_ADDRESS`, `SHELTER_TRY_ROUTER_FROM_BLOCK`, `SHELTER_TRY_SPLIT_ADDRESS`, `SHELTER_TRY_TREASURY_ADDRESS`, `SHELTER_TRY_PRIVATE_KEY` (a separate testnet-only hot wallet; never falls back to the main key), `SHELTER_TRY_RELAY_ENABLED`, `SHELTER_TRY_MATCH_ENABLED` (both default off). A second relay and match next to the main chain (`readTryShelterConfig`), so the payouts page's testnet block is gasless and matched while treats, claims and the campaign stay on `SHELTER_CHAIN_ID`. No treats, no x402, no claims there; caps and counters are per chain. |
| Multi-chain relay | `SHELTER_RELAY_CHAINS` (comma-separated chain ids, e.g. `84532,421614`; unset: the relay serves `SHELTER_CHAIN_ID`, the try-it testnet and the `wallet.config.ts` chains of the main chain's class, each only with its own relay flag). Per chain: `SHELTER_CHAIN_<id>_RPC_URL` (default: the chain's public RPC), `SHELTER_CHAIN_<id>_SPLIT_ADDRESS`, `SHELTER_CHAIN_<id>_ROUTER_ADDRESS`, `SHELTER_CHAIN_<id>_ROUTER_FROM_BLOCK`, `SHELTER_CHAIN_<id>_KEY_ENV` (the NAME of the variable holding that chain's hot wallet key, gas only; a testnet never takes the `SHELTER_DONATE_PRIVATE_KEY` value), `SHELTER_CHAIN_<id>_RELAY_ENABLED`, `SHELTER_CHAIN_<id>_RELAY_DAILY_TX` (daily budget), `SHELTER_CHAIN_<id>_MATCH_ENABLED`, `SHELTER_CHAIN_<id>_TREASURY_ADDRESS` (`readRelayChainConfigs`). Treats on a picked network (the give page's chips): `SHELTER_CHAIN_<id>_TREAT_ENABLED` (`true` lists the chain in `GET /shelter/donate/status` `chains` and lets `POST /shelter/donate {chainId}` pay there; needs `SPLIT_ADDRESS` and `KEY_ENV`, whose wallet holds the token float plus gas), `SHELTER_CHAIN_<id>_TREAT_AMOUNT` (decimal token amount, default `0.01`), `SHELTER_CHAIN_<id>_TREAT_DAILY_BUDGET` (default `1`; a budget per chain), `SHELTER_CHAIN_<id>_TREAT_COIN` (optional label; default USDC, `USDC.e` on Tempo 4217, `USDG` on Robinhood 4663, `pathUSD`/`mUSDC` on their testnets). x402 agent cards there: `SHELTER_CHAIN_<id>_X402_ENABLED` (default on for a `wallet.config.ts` chain, off for a chain named only here; needs a split, no key; a mainnet waits for the per-chain claim check like the main chain), `SHELTER_CHAIN_<id>_X402_PRICE` (decimal in the chain's payment coin, default `0.01`, scaled by the token's on-chain decimals). Built-in public RPCs and explorers cover Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood and Monad (143 `https://rpc.monad.xyz`, 10143 `https://testnet-rpc.monad.xyz`, explorer MonadVision). The token must have 6 decimals (all seven chains' payout tokens do). A testnet entry may share the main key only when `SHELTER_CHAIN_ID` is itself a testnet. The main chain and the try-it chain are never repeated. A mainnet entry still waits for the on-chain giving check. Only router gifts (EIP-3009) can be relayed; a gift straight into a ShelterSplit (Tempo, Robinhood, any chain without a router) is sent and paid for by the donor's wallet. |
| Goal count | `SHELTER_GOAL_SCAN` (`off` stops the C-001 scan; default on), `SHELTER_GOAL_RPC_URL` (default: the campaign chain's public RPC, `https://rpc.mainnet.arc.io` for C-001). The counted wallets come from the facts (`campaign.wallets`), never from the environment |
| Email | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (missing from the example file) |
| Bad Cat Daily (always on, no on/off flags; docs "Bad Cat Daily (badcat)") | `BADCAT_STRIPE_SECRET_KEY` (optional; unset: the shared `STRIPE_SECRET_KEY` is used; live keys only in production, test keys only elsewhere), `BADCAT_STRIPE_WEBHOOK_SECRET` (required to take money: unset, status reports `checkout: false`, checkout answers 503 and the webhook answers 503), `BADCAT_ENTITLEMENT_SECRET` (optional; unset: an HMAC of `INVALIDATE_CACHE_SECRET` with a fixed label; with neither, entitlement routes answer 503), `BADCAT_PUBLIC_URL` (default `https://tokentails.com`; Stripe return URLs, restore links, the typed redirect), `BADCAT_RESTORE_DEV_LINK` (off; local testing only: the restore answer carries the link itself, never with `NODE_ENV=production`), `SENDGRID_API_KEY` (shared; restore, seen and streak emails are sent only when it is set; restore mails only addresses with a purchase), `DO_SPACES_*` (shared; cameo and `/yourcat` faces). Phase 2: `BADCAT_SCORE_GRACE_DAYS` (0..7, default 1), `BADCAT_SHORT_LINK_BASE` and `BADCAT_API_PUBLIC_URL` (origin in short links; default `https://api.tokentails.com`), `BADCAT_FEED_AUTO_APPROVE` (moderation policy, off: feed rooms wait for an admin), `BADCAT_FEED_REPORT_HIDE` (default 3), `BADCAT_VAPID_PUBLIC_KEY`, `BADCAT_VAPID_PRIVATE_KEY`, `BADCAT_VAPID_SUBJECT` (`mailto:` or `https:`, default `mailto:hello@tokentails.com`; push works only when the keys are set) |
| Print | `PRINTIFY_API_KEY` |
| Rescue points (G5) | `TAILS_TOKEN_MODE` (`POINTS` default, or `TOKEN`; read by the public `GET /user/token-status`), `TAILS_TGE_AT` (ISO date, exposed only in `TOKEN` mode), `TAILS_EARNED_BACKFILL_DONE` (`true` once `scripts/backfill-tails-earned.js --apply` ran; the earned board then sorts on `tailsEarned`) |
| Unused | `GTM_ID` |

### Production checklist for the flags

- Client addresses need no env: the default `trust proxy` trusts our own hops (private, CGNAT and
  Cloudflare). After a deploy, check the one `first request: req.ip is ...` log line; set `TRUST_PROXY`
  only if it shows `a private hop` or `a Cloudflare edge` without `cf-connecting-ip`.
- `IMPACT_JOBS_ENABLED=true` and, unless the process runs with `NODE_ENV=production`,
  `CRONS_ENABLED=true` on the instance(s) that should run jobs (leases make more than one safe).
  Check the startup log for "Impact jobs are off".
- Keep `TAILS_TOKEN_MODE` unset (POINTS) and `TAILS_TGE_AT` unset (decision #39).
- `AUTH_ENFORCE_EMAIL_VERIFIED` stays `true`; ship the client verification screen and the heads-up
  email to unverified password users with the deploy (decision #3).
- `APP_CHECK_ENFORCE=true` only after App Check is configured in the Firebase console.
- Shelter rail: set `SHELTER_DONATE_PRIVATE_KEY` only, and run with `NODE_ENV=production` (or set
  `SHELTER_CHAIN_ID=5042` or `SHELTER_NETWORK=mainnet`): without one of them the main chain defaults to
  Arc Testnet. Split, router and first
  blocks come from `wallet.config.ts`; after the mainnet wave run `fund a:ingest` (or
  `fund a:backend-deployments`), commit the regenerated file and deploy. `SHELTER_SPLIT_ADDRESS`,
  `SHELTER_ARC_RPC_URL` and `SHELTER_SPLIT_FROM_BLOCK` are overrides only; `PAWS_SETTLEMENT_ENABLED=true` only after that and a funded
  hot wallet; `IMPACT_CDN_ENABLED=true` when the mirror should be public.
- `TAILS_EARNED_BACKFILL_DONE=true` only after `backfill-tails-earned.js --apply`, and before the
  first Rescue Goal opens.
- `IDENTITY_BACKFILL_DONE=true` only after `backfill-identity-fields.js --apply`.
- `/yourcat` launch conditions (bet #3, `YOURCAT_ENABLED=true` only when all hold): (1) the client
  address is found (satisfied by default; an upload with no usable address answers 503
  `YOURCAT_NO_CLIENT_IP`). (2) App Check is real:
  `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` on Vercel, replay protection on, `AI_UPLOAD_APPCHECK_ENFORCE=true`
  and `AI_UPLOAD_IP_DAILY_UNVERIFIED=0`. (3) The production Gemini key is on a billed plan (so the
  privacy notice's "no training" sentence is true). (4) The controller's legal name and address are in
  the privacy notice. (5) One test upload passes on production. Set `AI_UPLOAD_IP_SALT` (or keep
  `INVALIDATE_CACHE_SECRET` set) and `AI_ALERT_EMAIL_TO`.
- `YOURCAT_PORTRAIT_ENABLED=true` only when, in addition, the Stripe account has a terms of service URL
  (required by the checkout's withdrawal checkbox), Adaptive Pricing is confirmed off for these sessions,
  and one real card purchase is delivered end to end. The legacy `/portrait` digital checkout asks for
  the same checkbox only with `PORTRAIT_CHECKOUT_TOS_CONSENT=true`: set it once the terms URL is in the
  Stripe settings (live mode), because Stripe refuses to create a session that requires the checkbox
  without it. Before that, legacy digital sessions are created without the checkbox, as before v2.
- `/portrait` previews (release decision, spec section 3.5 and 10, in force on merge with every
  `/yourcat` flag off): `POST /image/portrait` and regenerate go through `AiUploadGate`. Until the App
  Check site key is set every visitor is "unverified": 1 preview per address per day, shared with
  regenerate (before v2: unlimited at 5 a minute, regenerate 3 a minute); `AI_PREVIEW_IP_DAILY_UNVERIFIED`
  raises it. All previews share the €3 sub-cap (`AI_BUDGET_PREVIEW_EUR_PER_DAY`), about 10 previews a day
  at the €0.30 reservation, after which every `/portrait` visitor gets 503 `YOURCAT_BUDGET_EXHAUSTED`.
  Set both env values to the wanted funnel before deploying.
- `NODE_ENV=production` must be set on every backend instance: `isProduction()` keys on it, and without
  it the AI gate falls back to a hard-coded IP salt.

## Migrations

`migrate-mongo-config.js` reads `MONGODB_URI`, targets database `tokentails`, and looks for
scripts in `migrations/tokentails/` with a `changelog` collection. The `migrations/` folder is
listed in `backend/.gitignore`, so the 27 historical migration scripts (June 2024 to January
2026) exist only on developer machines. Every migration has an empty `down()`.

Historical migrations covered: seeding the original cat collection, NFT winner and early-bird
batches, wallet generation (EVM first, then Stellar), converting legacy `score` and `catpoints`
into `tails`, dropping legacy fields, collapsing `blessings[]` to a single `blessing`, and renaming
ability types (STORM to ELECTRIC, NATURE to GRASS, LEGENDARY and TAILS to FAIRY, AIR to WIND).

Recommendation: remove `/migrations` from `.gitignore` so the scripts are versioned, and keep the
large seed JSON out of git separately. The narrowest fix is to replace the `/migrations` line with
`/migrations/*`, `!/migrations/tokentails/`, `/migrations/tokentails/*` and
`!/migrations/tokentails/2026-10-*.js`. Until then the three new wrappers below must be added with
`git add -f` or recreated from their header on the machine that runs them. Their logic is versioned
in `src/` and `scripts/`, so the specs pass on a clean checkout.

New migrations (dry run by default: `up` prints counts and throws so migrate-mongo records nothing;
`MIGRATION_APPLY=1 npx migrate-mongo up` writes):

| File | Logic in | Does |
|---|---|---|
| `2026-10-01-identity-unique-indexes.js` | `scripts/audit-duplicate-users.js` (`buildIdentityIndexes`) | Re-audits, refuses while duplicate users exist, then builds `firebaseUids_unique` and `email_unique` (both partial), the partial board and guest indexes and `email_canonical` |
| `2026-10-02-heist-replay-digest.js` | `src/user/heist/migrations/heist-replay-digest.cjs` | Builds `replayDigest_unique` on `games` and repairs null or malformed Heist arrays (`MIGRATION_BACKFILL_MISSING=1` also fills missing ones) |
| `2026-10-02-game-cleared-grandfather.js` | `src/user/heist/migrations/game-cleared-grandfather.cjs` | Sets the `*Cleared` arrays from existing best scores (points > 0; Paw Match `match3 > 0` or `match3Score > 0`) so no unlock is lost. Must run before the client with the server unlock rule ships |

### Data scripts (`backend/scripts/`)

All print counts only (no ids, emails, names or wallets unless noted), never write without
`--apply`, and run with `MONGODB_URI` set. On production, use a read-only user for the audits and
run every write on a staging snapshot first, with a backup.

| Script | Kind | Purpose |
|---|---|---|
| `audit-identity.js`, `audit-duplicate-users.js` | read only | Identity counts before the uid backfill and the unique indexes (decision #1) |
| `backfill-identity-fields.js` | dry run / `--apply` | `isGuest: false`, lowercased email, `emailCanonical`; then set `IDENTITY_BACKFILL_DONE=true` |
| `backfill-firebase-uid.ts` | dry run / `--apply` | Binds `firebaseUids` for verified Firebase users only (needs `GOOGLE_APPLICATION_CREDENTIALS`) |
| `audit-staking.js` | read only | Staked, claimable and unowned staked cats, over-crafted users (MongoDB 4.4+) |
| `flag-board-exclusions.js` | dry run / `--apply` | Sets `boardExcludedAt` on accounts over the staking audit bound (decision #35). Run before the codex reset zeroes `monthTailsCrafted` |
| `backfill-tails-earned.js` | dry run / `--apply` | `tailsEarned = max(tailsEarned, tails)`; refuses once any pledge or give exists |
| `backfill-blessing-kind.js` | dry run / `--apply` | `kind` rescue or portrait |
| `backfill-shelter-fields.js` | dry run / `--apply` | `role` (house for `token-tails`, `token-tails-2`, `home`), `partnerStatus` from `--active/--past/--prospect` (never guessed), `handoverStatus: held-by-token-tails` (decision #88) |
| `backfill-starter-cats.js` | dry run / `--apply` | One locked legacy starter per owner and the one-time `renameOffer` (decision #20) |
| `audit-orders-grants.js` | read only | Grant outcomes before and after a `--cutoff` |
| `backfill-spent-usd.js` | dry run / `--apply` | Legacy spend estimate into `spentUsdLegacy` (`--cutoff` required) |
| `rescue-goal-audit.js` | read only | Rescue Goal ledger checks; exits 1 on a problem (use as a monitor) |
| `audit-orders.js`, `audit-cat-owners.js`, `repair-codex-counters.js`, `skip-codex-cycle.js` | as described elsewhere in this doc | Earlier platform fixes |

Order of the production steps (plan F5.3 and F6; none of them was run): deploy the backend first
(an older backend answers 400 to every save that carries `outcome` or `replay`), then the
identity audits, manual duplicate merge (decision #2), identity and uid backfills and the unique-index
migration; the Heist and cleared-state migrations; the blessing, shelter and starter backfills; the
staking audit and board flags (before 2026-10-08 23:00 UTC); `backfill-tails-earned.js` before any
give; then the client. Respect the codex window: no season-field deploy between 2026-10-01 and
2026-10-08 unless `skip-codex-cycle.js` is run.

## Backups

From the old backend README:

```bash
# local
mongodump --out ./backup --db=tokentails --gzip
mongorestore --db=tokentails ./backup --gzip

# remote
mongodump --gzip --out=./backup/tokentails-YYYY-MM-DD --db=tokentails --uri=<connection string>
mongorestore --gzip --db=tokentails ./backup/tokentails-YYYY-MM-DD --uri=<connection string>
```

## Tooling

- ESLint: `@typescript-eslint` recommended plus Prettier. `no-explicit-any` and non-null assertion rules are disabled.
- Prettier: 4-space indent, single quotes, 120 columns, trailing commas `es5`.
- TypeScript: `commonjs`, target `es2017`, `strictNullChecks` and `noImplicitAny` on but not full `strict`, decorators enabled, `declaration: true`.

## Known issues

Route and logic bugs:

- Open (Bad Cat meter, 2026-10-17): `GET /badcat/meter` reads `livemode` but does not filter on it, so
  test-mode purchases count toward the public Pink Paw meter. Display only (no payout). Since Oct 17 production
  creates no test sessions and its webhook ignores test events, so only rows from a non-production database
  (or from before Oct 17) are affected.
- Open (Bad Cat faces, predates 2026-10-17): `faceFromYourcat` stores a face imported from /yourcat as
  `approved` without admin review (uploaded faces start `pending`). Bounded by `YOURCAT_ENABLED`; decide
  whether the AI portrait counts as moderated.
- Note (2026-10-17): Bad Cat Daily and Moon Rave have no on/off flags; they deploy on with the backend.
  Before this, `/badcat/*` and `/rave/checkout` were 404 until a flag was set.
- Open (Moon Rave payments, 2026-10-17): card payouts to Pink Paw go out from the Arc hot wallet float
  (the treat wallet, ~$1–3). A $5 card order then stays `due` and `GET /rave/status` shows
  `payoutsDelayed` until the float is topped up; the order still lists as `paid`.
- Open (Moon Rave payments): `RAVE_DAILY_CAP_USD` (default $100 a day) counts cat orders only; $100 ads
  are not under it. Founder call whether ads should share it.
- Open (Moon Rave payments): the Events API cursor lives in each instance's memory, so a restart, or the
  lease moving to another instance, re-reads up to 72 h of the six event types. Harmless: rave events are
  deduped by id (`ravewebhookevents`, 30-day TTL), the rest of the account's events are not stored.
- Open (Moon Rave payments): the crypto pack checkout does not look up `RaveAd.usdcTxHash` before it
  accepts a transfer. Not exploitable while ad amounts sit in their own range (+10,000 base units) and the
  ad side refuses a tx that backs a checkout; add the reverse lookup if pack prices ever reach $100.01.
- Open (Moon Rave ads, USDC): no automatic on-chain refund. A rejected USDC ad, a payment that lands after
  its slot was re-sold, and an underpayment (logged with the tx) need a manual transfer from the treasury
  to `refund.payer` / the payer. An expired hold drops its stored image after 1 h, so a USDC payment
  reported later than that re-takes the slot without an image and cannot be approved: reject it.
- Open (Moon Rave): `/image/webhook` does not forward `payment_intent.*` / `charge.*` events to the rave
  handler; not needed while the Events API pull runs, and that endpoint is probably not subscribed to them.
- Open (guest treats, 2026-10-08): `POST /shelter/donate/guest` is keyed per client address, so a
  visitor with many addresses (VPNs, mobile IP changes) can send more than one treat a day, and a
  shared address (office, carrier NAT) gets one treat a day for everyone behind it. `cf-connecting-ip`
  can be forged by a request sent straight to the origin, which only buys extra treats. The per-chain
  daily budget (100 treats) bounds the loss to that budget; there is no captcha. Since 2026-10-16 the
  default `trust proxy` setting resolves the visitor with no `TRUST_PROXY` (it was unset in production on
  Oct 8, when every per-IP throttle shared the balancer's bucket).
- Accepted (founder, 2026-10-16): without an origin secret, a caller who reaches the origin directly (the
  DigitalOcean URL, or a Cloudflare Worker) can set `cf-connecting-ip` and get fresh per-IP buckets for
  guest treats, Heist replays, AI previews and uploads, and the per-IP route throttlers. The founder
  accepted this on 2026-10-16. The per-chain treat budget and the AI euro caps still bound the cost.
- Fixed (Stellar portraits, 2026-10-16): `POST /web3/confirm` creates a portrait order after the client
  paid, so it has no stored server price; it is checked against the current $16 table. A $6 Stellar
  payment from a tab opened before the $16 price is no longer refused with only the hash released: it is
  recorded as `FAILED_GRANT` (`PRICE_CHANGED`) with `refund: 'due'` and answers 409, so the treasury
  refunds it by hand like other Stellar refunds. Stripe intents are not affected: they are confirmed at
  the price stored on them, and a digital portrait intent from the old backend (no stored price) is held
  to the old $6 price.
- Open (crypto checkout): checkout goes live with the backend deploy that carries the checked-in
  treasury (`src/payments/crypto/treasury.public.ts`, 2026-10-14); there is no flag to hold it back.
  `CRYPTO_PAY_CAT_SHELTER_BPS` defaults to 5000 (founder, 2026-10-04; it is not the `purchase_share`
  pledge, C-002, which stays off every surface); a malformed value records the share as `undecided` and
  sends nothing.
- Open (crypto checkout): a buyer who sends a different amount than the quoted one on an
  `amount`-bound option is not matched (400 `CRYPTO_PAY_NO_MATCHING_TRANSFER`); the money sits in the
  treasury and is refunded by hand. Paid-after-expiry and second payments are recorded on an order with
  `refund: 'due'`, and every crypto refund is manual (no on-chain refund automation).
- Open (crypto checkout): the shelter-share keeper pays from the hot wallet float on `SHELTER_CHAIN_ID`
  only, and its payouts land in the impact `direct` bucket (no `cat` attribution yet, `src/impact`).
  A share that stays `sent` without a receipt is marked `failed` for a person once its nonce is used; it
  is never re-sent automatically.
- Open (crypto checkout, found by the e2e-pay-goal run 2026-10-04): a confirm with a hash the chosen
  chain's node does not know (a hash from another network, or a typo of a real one) answers 202
  `CONFIRMING` with 0 confirmations for as long as it is asked, because "not mined yet" and "not on this
  chain" look the same to the node. Nothing is granted; the client polls for 20 minutes before it says
  so. A `TX_NOT_FOUND` after a few minutes of an unknown hash would end that sooner.
- Open (crypto checkout): a split-route order's `shelterShare.bps` is the treasury-route setting
  (`CRYPTO_PAY_CAT_SHELTER_BPS`), not what the split paid; `amountUsdCents` is the real figure (500 for a
  $5 cat through a 100% split). No page shows `bps` today.
- Fixed (2026-10-04, e2e-pay-goal flow Q2): the shelter-share keeper took the evidence tier from
  the (since removed) `SHELTER_HANDED_OVER` flag at settle time, so a share sent to the held wallet just before the handover and
  settled after it was labelled `onchain-shelter-held`. The tier now follows the wallets the receipt's
  `Disbursed` events paid (`shareTier`).
- Open (crypto checkout): the Tempo mainnet token is bridged USDC.e and Avalanche/Tempo carry
  `verify: true` notes in chains.json (explorer paths); check both before turning mainnet on.
- Fixed (2026-10-04): the Legendary pack is $350 everywhere (it was $400 on the client card), on sale for $100 through 27 Nov 2026 23:59:59 UTC (`LEGENDARY_PROMO_ENDS_AT`). Still kept: the CMS
  `Prices.lootBox` says 3 while the client and server charge $1.

- Open (F2 review, not fixed): `IMPACT_CHAIN_UNITS` in `src/impact/shelter-logs.ts` lists only the Arc
  chains and every other chain falls back to Arc's units. ShelterSplit is now also on Base, Arbitrum,
  Fuji and Robinhood, so if the indexer ever runs there, native ETH or AVAX payouts would be counted as
  18-decimal USDC. Add per-chain units before pointing `SHELTER_CHAIN_ID` at a non-Arc chain.
- Open (F2 review): the fork end-to-end run of a relayed gift used a USDC stand-in that credits the
  receiver without debiting the donor, against a router deployed for that run. It proves the plumbing,
  not the donor debit. Re-run it against the published F1 router with a real FiatToken and assert the
  donor balance drops by exactly the gift, the router ends at 0 and the hot wallet pays only gas; until
  then no submission claims "end to end on Arc".
- Open (F2 review): `GET /shelter/claim` now shows only `approved` or `rotated` claims, so the web
  onboarding page shows "No wallet has been claimed yet" right after a shelter files one; its own
  "Claim sent" step covers that moment.

- Fixed (platform fix 4, then KI-14 on 2026-10-11): `PUT /image/portrait/:id/regenerate` requires auth and is limited to 3 calls per minute. Bet #3: images carry `owner` and `source`. An image with an owner can be regenerated only by that owner (404 otherwise); a guest may regenerate only images it owns; an image without an owner (every image created before bet #3) is refused for guests (403 `GUEST_FORBIDDEN`) and, since KI-14, for every caller below EDITOR (403), so nobody can spend a 4K generation on someone else's legacy image. Images with a `COMPLETE` order (a delivered product) are refused (409 `YOURCAT_PORTRAIT_EXISTS`), and `source: 'yourcat'` images are never regenerated. Both routes share the `portrait-preview` daily caps and budget (docs/plans/yourcat-v2.md section 3); a generation that fails or passes 90 s is aborted, gives the visitor's daily attempt back and counts one failure against the address. Since bet #3 `POST /image/portrait` also needs a session (a guest session is enough) and the same caps; the client creates the guest session before the upload.
- Fixed (KI-08, 2026-10-11): `POST /image/portrait` returned the full 4K `aiUrl` before payment and the public `GET /image/:id` served it too, so the paid digital portrait on `/portrait` and `/portraits` could be downloaded for free. The 4K output is now stored privately (`s3private://portraits/<uuid>.png`) and the image also gets a public, watermarked preview (`previewUrl`: at most 1024 px, webp, a tiled "PREVIEW · tokentails.com" mark). Until the image has a `COMPLETE` order every image route answers the preview in `aiUrl` (`portraitView` in `image.controller.ts`), so the `/portrait` polling contract is unchanged; no response carries an `s3private://` URL. The webhook copies the paid output to a new public uuid key, sets `aiUrl` and emails that link; if the copy fails, the email waits and `GET /image/:id` retries the copy on the next read. Still open: portraits generated before this change keep their public 4K `aiUrl`. `/yourcat` paints only after payment, and `GET /image/:id` never serves `source: 'yourcat'` records.
- Fixed (bet #3, found 2026-10-11): `POST /image/search` had no guard and listed every image, preview photos and paid 4K portraits included, to anyone. It now needs `PermissionGuard(EDITOR)` and never lists `source: 'yourcat'` records. No client or CMS code called it.
- Fixed (KI-12, 2026-10-11), with a remainder: `POST /image/create-checkout-session` (unsigned) accepted an arbitrary `body.userId`, so an order and its cat could be attributed to any user (`image.controller.ts`, `checkout`). It now believes `body.userId` only when it is the image's owner, or when the image has no owner and was never bought; otherwise the id is ignored and the buyer is found or created by `email`. It refuses `source: 'yourcat'` images (404) and the `-signed` route refuses another owner's image. Still open: an owner-less legacy image that was never bought can still be checked out for any `userId`, because the unsigned route has no caller identity to compare.
- Fixed (KI-13, 2026-10-11): `POST /image` (`PermissionGuard(0)`) copied the request body into the record, so every field but `owner`, `source` and `aiUrl` was caller-controlled. It now copies an allow-list only (`pickImageCreateFields`): `name` (at most 200 characters), `style` (a known `ImageStyle`) and `isTemporary`; `url` comes from the upload. `PUT /image/:id` (editors) still strips `owner`, `source` and `previewUrl` and keeps the rest editable.
- Open (mentioned): `POST /blessing` reads the user with the projection `_id permission`, so `user.shelter` is always undefined and `object.shelter !== user.shelter` (`blessing.controller.ts`, the permission check around line 161) is true for any blessing with a shelter: the check passes for every caller who reaches it. See also the ObjectId comparison entry below.
- Fixed (KI-23, 2026-10-11): `hasWhiteBorders` indexed the raw pixels as RGBA (`* 4`), but sharp `.raw()` on an RGB image gives 3 channels, so the border check read the wrong bytes on Gemini's RGB output and the retries fired (or not) at random. It now calls `.ensureAlpha()` and strides by the channel count sharp reports (`ai-avatar.ts`, `ai-avatar.spec.ts`).
- Open (mentioned): `generateCat` picks a random edition and emote and casts the family unchecked: 123 of the 1606 family x edition sheets answer 403 on the CDN (all of `PEACHES`, many vampire, pumpkin-head and lighting), and the list includes `cigarette`, `hat-*-cigarette` and `jesus`. Without `screen` it never answers "no cat". This still affects `POST /blessing` and the paid portrait cats; `/yourcat` forces `base` and screens.
- Open (mentioned): `createBlessingWithCat` classifies the painted portrait, not the original photo (`cat.service.ts`, around lines 400 to 466).
- Open (mentioned): `uploadFileImage` does not apply the EXIF orientation (no `.rotate()`), so phone photos uploaded through `POST /image` and the blessing paths can come out sideways. The bet #3 photo routes use `sanitizePhoto`, which rotates.
- Open (mentioned): `Image.isTemporary` is stored but never read; `/image/portrait` uploads are public-read with no cleanup (now under an unguessable uuid name).
- Open (mentioned): the SendGrid subject "Your order is on its way!" is also used for digital orders (`src/image/order-email.ts`, default subject); `/yourcat` deliveries pass their own subject.
- Open (bet #3, mentioned): App Check tokens on `POST /user/guest/session` are verified without replay protection, so one token can be reused for its lifetime (`verifyAppCheckToken(..., { consume: false })`, behaviour unchanged). The AI gate consumes its limited-use tokens.
- Changed (bet #3, KI-07 superseded 2026-10-16): the origin secret (`CF_ORIGIN_SECRET`, `x-tt-origin-auth`) and the shared `untrusted` buckets (`UNTRUSTED_IP_BUCKET`, `untrustedLimit`, `AI_PREVIEW_UNTRUSTED_DAILY`) were removed. The global throttler, `ClientIpThrottlerGuard`, the AI gate and the Heist replay bucket all key on `clientIp()` (a usable `cf-connecting-ip`, else the Express address past our own hops), so visitors are no longer one bucket by default. The `/yourcat` routes, `POST /image/portrait` and regenerate keep their per-user and per-client-IP throttlers. Spoofing is the "Accepted (founder, 2026-10-16)" entry above. The 50 MB global JSON limit is unchanged (entry below).
- Partly fixed (KI-15, 2026-10-11): the 10-a-day per-user `/yourcat` portrait checkout limit now lives in MongoDB (an `aiquotas` counter `portrait-checkout:user:<id>:<UTC day>`, claimed in the handler; above it 429 with `Retry-After` to UTC midnight), so a restart or a second replica no longer resets it. Still open: the per-user and per-client-IP burst limits (per minute) stay in the in-memory throttler storage, per replica, so they reset on restart and multiply by the replica count. The daily Mongo quotas and the budget are the real limits.
- Fixed (KI-03, 2026-10-11; changed by CR2-07): card portrait orders are charged in EUR, and their `priceUsd` is an estimate at the fixed stats rate `PORTRAIT_STATS_USD_PER_EUR` (1.15), not the real exchange rate. `PledgeService.table()` summed `priceUsd` over `COMPLETE` orders, so the public purchase pledge could have been understated or overstated with the FX. A first fix left EUR orders out of the pledge, which would have understated it for every card portrait sale. EUR orders are now counted at their euro `price` times `PLEDGE_USD_PER_EUR_UPPER_BOUND` (1.65, above the all-time EUR/USD high of about 1.60), rounded up, so the pledge on a EUR sale is never below the USD Stripe settled (about 43% above at a 1.15 market rate; `pledge.spec.ts`). `priceUsd` itself is still the fixed-rate estimate (fine for `spentUsd` stats). Latent: no `purchase_share` fact (C-002) exists yet, so the pledge table is empty.
  - Launch note (before a `purchase_share` fact is added): decide whether to store Stripe's settled USD on the order at webhook time (from the balance transaction, in `image.controller.ts`) and pledge on that instead of the upper bound. Until then the published pledge for EUR sales is deliberately high.
- Fixed (KI-01, KI-02, 2026-10-11): when `makePlayable` succeeded but storing the `YourCat` record failed, the upload answered an error and deleted its original, but the cat had already been restyled and onboarding set done, with no record behind it; `POST /yourcat/manual` had the same order. Both paths now insert the record first as a placeholder (`cat: null`, `creatingAt` set), then make the cat, then point the record at it and unset `creatingAt` in one write. A failed insert leaves the cat and onboarding untouched; a failed cat deletes the placeholder (and the upload's original). Reads (`GET /yourcat/me`, `/:id`) and retention skip placeholders, and the daily retention job hard-deletes placeholders older than 10 minutes with their objects (the process died in between). Remainder (CR1-07): if pointing the placeholder at the made cat fails, `finishMadeCat` retries once (the write is idempotent: a landed write whose reply was lost returns the finished record). If the retry fails too, `user.cat` already points at a cat with no `YourCat` record, so that is logged and alerted to `AI_ALERT_EMAIL_TO` with ids only (cat, user, placeholder); the placeholder is deleted and the request answers an error. Still open: that cat is not rolled back, so `GET /yourcat/me` shows nothing for it and no avatar is drawn until the player uploads again.
- Open (bet #3, new): a guest who signs in to an existing account loses its `/yourcat` cat (decision #8: the guest starter is dropped on merge); creating a new account keeps it. Carrying it through a merge is deferred.
- Open (bet #3): the `/yourcat` avatar runs in-process after the response and paid deliveries rely on the 10-minute sweeper (no job queue). Fixed (KI-18, 2026-10-11): the avatar object is now stored with `max-age=300` (was 3600), so a deleted avatar leaves CDN caches within minutes rather than an hour, and the daily retention job marks avatars still `pending` 10 minutes after their record was made as `failed` (the process died mid-job). There is still no purge; the privacy notice keeps "up to an hour", which stays true.
- Fixed (KI-11, 2026-10-11): a paid `/yourcat` portrait whose SendGrid email failed was counted as delivered, and nothing retried or reported it (`sendOrderConfirmationEmail` swallowed every error). The email now resolves true only when SendGrid accepts it (2xx); `deliveryEmailAt` is set only then. A painted portrait whose email failed is not repainted: the delivery sweeper retries only the email, every 10 minutes, up to 5 sends (`MAX_EMAIL_ATTEMPTS`, `deliveryEmailAttempts`), and an alert goes to `AI_ALERT_EMAIL_TO` on the first failure and when the retries run out (then the link is sent by hand). The S6 page shows the painted portrait meanwhile. Each failed send is counted as `portraitsEmailFailed` (one per send, in `aibudgetdays`; CR1-04): `GET /yourcat/stats` returns it on every day, 0 when nothing failed (`STATS_ALWAYS_COUNTERS` in `yourcat.controller.ts`), and the cms `/yourcat` page shows it as the last column, red above 0. The legacy `/portrait` webhook does not count it, but since CR1-03 it sends one alert email (order id only) when a paid `/portrait` 4K is public but its email has no address or SendGrid did not accept it, and another when the 4K could not be made public (`alertPortraitNotDelivered` in `image.controller.ts`); it does not retry the email.
- Fixed (2026-09): `Order` no longer uses `mongoose-unique-validator`. With the partial index `hash_unique` declared, the plugin merged the index's `partialFilterExpression` into its query, so every order create checked `{ hash: { $gt: '' } }` and failed with a ValidationError once any order had a hash. That broke `POST /web3/confirm`, both Checkout session creates and `confirm-payment`. Duplicates now surface as E11000, which `OrderRepository.create` maps to 409.
- Fixed (2026-09): `LOOT_BOX` orders were priced at $1 whatever their `id`, while the controller used `id` as the pack type, so a $1 payment with `id: LEGENDARY` rolled Legendary odds. A loot box with an `id` is now refused, and the pack type comes only from a `PACK` order.
- `DELETE /quest/:slug` filters on a `slug` field that the quest schema does not have.
- Fixed (task 4e): the daily wheel (`GET /user/catbassadors/lives/redeem`) read `canRedeemLives`, then wrote, so parallel spins all paid. It is now one conditional write, and its odds are published (`GET /user/catbassadors/lives/odds`, `src/user/wheel.ts`).
- Fixed (task 4e): the staking reward ran up to 10,000 Tails per claim by tier. It is the flat cat nap (50, at most 3 cats). Past earnings are not clawed back; `scripts/flag-board-exclusions.js` keeps the flagged accounts off the boards.
- Fixed (task 4e review): `GET /quest/complete/:quest` and `GET /quest/contest/:contest` checked `user.quests` on a read, then wrote with `{_id}` only, so parallel calls all paid (10 parallel `PIXEL_RESCUE_LEVEL` claims paid 100,000 Tails). Each claim is now one conditional write (`{_id, quests: {$ne: quest}}`) that records the quest and pays it together; box quests record the claim in the same write as the boxes, and cats are adopted only after the claim succeeds (if an adopt throws, the claim stays recorded and the cats must be granted by support).
- `QUEST.PIXEL_RESCUE_LEVEL` (10,000 Tails) has no requirement and no server-side evidence: any signed-in player can claim it once without playing. Found in the task 4e review, not fixed (it needs a product decision: tie it to a cleared Pixel Rescue level recorded by `/live`, now possible through `seasonEventCleared`, or retire it). The client button is gated on the server cleared flags since task 5b, which does not stop a direct call.
- Fixed (task 4e review): anonymised (deleted) accounts kept `tailsEarned` and the given counters, so after the backfill they could rank on the Tails board, take a weekly top-200 slot and, once giving opens, rank on the rescuers board. `boardFilter()` now also requires `deletedAt` absent. Flagged and deleted accounts calling a position route get `{position: null, excluded: true}` instead of a rank. The Tails and rescuers boards break ties by `_id`, so the `top=N` cut-off is stable.
- Fixed (task 4e): Tails reward routes (tier, challenge and milestone claims, the wheel, the referral claim, quests, contests, cat nap) had no per-user limit; they now use `UserThrottlerGuard`.
- `GET /user/codex` reads `monthPacks` but leaves it out of its projection, so the seventh condition (`monthPacks >= 1`) is never true and no codex phase can be earned through it (found in task 4e, not fixed: it is codex-window logic, and the condition is a purchase requirement that decision #36 may also want gone).
- The `top` parameter of the global leaderboard has no decorator, so HTTP callers always get 50 rows.
- Fixed (2026-09): the codex reset cron. The old expression `0 0 1 * * ` is five fields to `cron` 2.4, so it fired monthly at 00:00 server time on the 1st, not daily as this list used to say. That is eight days before the phase anchor on the 9th, with no explicit time zone and no guard against double runs. It now runs at 23:00 UTC on the 8th with a per-period guard.
- Fixed (task 1b): `CatService` was decorated with `@Controller('cat')` instead of `@Injectable()`. It is `@Injectable()` now; no route was ever registered from it.
- Fixed (task 2b, new): `PUT /blessing/:id/status` read `blessing.shelter` before its 404 check, so a missing id was a 500.
- `POST /blessing` and `PUT /blessing/:id` compare `object.shelter !== user.shelter` (an ObjectId against a value, always true), so any MODERATOR passes the shelter check for any shelter, and `new Types.ObjectId(object.shelter || user.shelter)` makes a random id when both are missing (found in task 2b, not fixed).
- `BaseRepository.findOne` strips `undefined` from the filter, so `{_id: undefined}` becomes `{}` and matches the first user. `GET /user/profile` refuses a missing id with 401 before querying, and `AppAuthGuard` answers a transient guest with 428 before any other handler runs, so no route reaches it today (mentioned in task 1b, not changed).
- Rule (task 3b): `mongoose-unique-validator` merges a partial index's `partialFilterExpression` into its pre-save lookup. A partial unique index on a schema that uses the plugin must be declared after `schema.plugin(uniqueValidator)` (as `replayDigest_unique` is), or every second insert fails as "not unique".
- `Comment.text` is unique, so two users cannot post identical comment text anywhere.
- Stale indexes on `nftId` remain on the cat and blessing schemas.

Security:

- Firebase service-account identifiers other than the private key are hardcoded in the app module. Move them to environment variables and rotate.
- The retired Telegram bot tokens were hardcoded in the auth strategy until Telegram support was removed (2026-09). They remain in git history, so both bots must be revoked through BotFather.
- CORS falls back to `*` with credentials when `FRONT_END_URLS` is unset (mentioned only in the alignment plan, not changed).
- Public `GET /cat/:id` returns the cat's `owner` and an unfiltered blessing (mentioned only, not changed). It answers 404 for a guest starter (task 2a).
- No global `whitelist` on the validation pipe, and several handlers pass the raw body into `update()` (article, blessing, category, quest). The shelter POST and PUT are fixed (plan F7.7, task 2b): a whitelisting `ShelterWriteDto` rejects `wallets`, `users`, `blessing`, `code` and `slug` with 400, and only an ADMIN writes the custody fields. `PUT /user/profile/:id` is fixed (only `ProfileWriteDto` fields). Fixed (W1-HF, spec'd again in task 4e `rescue-points.spec.ts`): only an ADMIN changes `email` or `permission`, or creates a user above USER, so a manager cannot grant MANAGER or ADMIN.
- Fixed (W1 hotfix, task 1b, new): `GET /shelter` and `GET /shelter/:id` returned `wallets`, including the encrypted Stellar private key, plus `users` and `code`. Both answer a whitelist projection now (`_id name slug description image country countryCode partnerStatus role publicWallet`; MANAGER and above also get the address and social fields the CMS editor writes back).
- Fixed (W1 hotfix, task 1b, new): the staking exploit. Stake had no owner filter and the claim `$unset` `staked` on the user, not the cat, so one stake could be claimed again and again, on anyone's cat. Stake and claim are owner-filtered atomic updates on the cat; another user's cat is 404, a second stake 409, five parallel claims pay once. Founder decision F-1b-1 is still open: cats staked before the hotfix still carry a past `staked` date and pay once more under the new claim. Option A accepts one final payout per cat; option B clears `staked` on those cats in the deploy window (a production write). Recommendation: B if the audit's `catsClaimableNow` is large next to honest stakers, otherwise A. Record the count first (`scripts/audit-staking.js`).
- Fixed (W1 hotfix, task 1b): a manager could set any user's `shelter` (`profile-write.dto.ts`); `shelter` is no longer in `ProfileWriteDto` and any write that contains it is 400. Shelters are assigned in the database until an admin members route covers staff.
- Fixed (W1 hotfix, task 1b review, decision #33): a manager could change any user's `email` (after the W1 binding rule, a verified Google sign-in to that address would then bind to the victim's account and wallets) or grant ADMIN. A non-ADMIN changing `email` or `permission` is 403 and nothing is written; unchanged values pass, since the CMS form sends both.
- Fixed (W1 hotfix, then plan F5, tasks 1b and 2a, new): account takeover by email-only binding. The strategy looked users up by the token's email without `email_verified`, so a Firebase password account created for someone else's address resolved to their account. Resolution is uid-first now; the email lookup binds only `email_verified === true` tokens (the provider is not trusted on its own), an unverified token with no document is 403 `EMAIL_UNVERIFIED`, and nothing is written. Effect to plan for (decision #3): legacy password users whose Firebase email is unverified get 403 until they verify. Open check: confirm on a real Apple sign-in (including a private-relay address) that the token carries `email_verified: true`.
- Fixed per process (task 2a, new): the duplicate-user race on first sign-in and the non-unique email index. One process single-flights per uid and upserts idempotently; two replicas can still insert two documents for one new uid in the same instant until the `2026-10-01-identity-unique-indexes.js` migration builds the unique indexes (it refuses while duplicates exist: merge them by hand first, decision #2).
- Fixed (task 2a, new): portrait orders created users with the email as typed, while sign-in matched exactly, so a capitalised address got two accounts. Lookups go through `UserService.findByEmail` (lowercased, exact, and case-insensitive until `IDENTITY_BACKFILL_DONE`), and new accounts are lowercased.
- Fixed (task 2a, new): the referral paid once per distinct referrer through a side-effecting GET. `POST /user/catbassadors/referral` pays once per referred account, ever, within 7 days of its promotion (decision #12); two Gmail aliases cannot refer each other. The GET `referralw/:id` is deprecated with the same rules until clients move. The other side-effecting GETs are listed in the next entry.
- Open (plan section 7, G1 scheduled per route): reward routes still change state through GET: `GET /user/catbassadors/lives/redeem`, `GET /quest/complete/:quest`, `GET /quest/contest/:contest`, the stake GETs (`GET /cat/stake/:_id`, `GET /cat/stake-reward/:_id`) and the deprecated `GET /user/catbassadors/referralw/:referralId`. Link prefetchers, retries, caches and cross-site requests treat a GET as safe and can trigger them; the header-based auth keeps a cross-site link from carrying the token, but a GET is still the wrong verb. Move each to POST (they are flagged in the API.md route tables).
- Fixed (task 1b, new): the live-save user throttle passed when `req.user._id` was missing; it fails closed with 401. Fixed (task 3b): per-user limits did not bound Heist replay CPU; replays have a per-IP bucket (30 a minute), a 1 + 16 queue that answers 429 with `Retry-After` before simulating, and a failed-log cache.
- Every route except `/live` accepts JSON bodies up to 50 MB (`main.ts`, mentioned only; `/live` has its own 64 KB limit since task 3b).
- Client-reported scores in Purrsuit, Cupid Cat and Paw Match are accepted by cap validation only (`/live` checks type, level and the per-level cap); only Catnip Heist runs are re-simulated. `replayDigest` is replay dedupe, not anti-cheat (a few idle ticks give a new digest that still wins): gate any future Heist leaderboard or reward with `notGuestFilter()`.
- Heist replays run on the main thread: about 9 ms p95 per golden run and about 60 ms for an idle log at the tick cap. Bounded by the per-IP bucket, the queue and the failed-log cache, per replica; move `execute` to `worker_threads` if p95 passes 50 ms.
- The public player name of a new account defaults to the email local part (`user.service.ts`, mentioned only; a follow-up).
- Fixed (2026-09): search handlers spread the raw body into `BaseRepository.find`, which takes `searchObject`, `projection`, `pipelineStages`, `populate` and `collation`. On the public `POST /image/search` a `$lookup` stage into `users` returned every user document, including emails and encrypted Stellar secrets; category, quest and article search (public) and blessing, user and ticket search (signed-in) had the same hole. They now pass `pickSearchParams(params)`. Whether this was exploited cannot be told from the code; request logs, if any, would show POST bodies with `pipelineStages`.
- Fixed (platform fixes 1 and 2): Stripe Checkout and PaymentIntents charge the server price table, and `confirm-payment` is idempotent on the intent id. Stellar checks success, destination, asset and amount against the server price, `hash` is unique and canonical (fee-bump inner hashes are refused), and `spent`, `monthSpent` and the affiliate credit use the verified amount instead of the client `price`.
- Stellar payments carry no memo, so a transaction is not bound to its buyer. Anyone who sees a payment to the public treasury on-chain and confirms its hash before the payer does gets the item. Binding needs a client change (for example a memo with the user or order id) and a matching server check. `POST /web3/create`, which let any caller park an order on someone else's hash, was removed (2026-09).
- The Legendary pack price disagrees: the backend table and the odds comment in `content.utils.ts` say $350, the client pack card shows $400. Stripe and the crypto checkout charge $350. Since 2026-10-04 the client checkout summary and crypto quote show the server price from `GET /payments/crypto/config` `prices` ($350), so only the pack card differs. A human must pick one price and update the other copy (DEVELOPMENT.md "Pack prices").
- Stripe idempotency on the PaymentIntent id is race-safe across processes only once the `hash_unique` index on `Order.hash` (platform fix 1) is built. Mongoose builds it on startup, and the build fails while duplicate hashes exist, so run the order audit first; until then an in-process lock covers the single instance.
- Custodial Stellar secrets are encrypted with AES-128-CTR using a static salt. The decrypt path is never called.
- Rate limiting is global and tracks the client address (`clientIp()`: a usable `cf-connecting-ip`, else `req.ips[0]` or `req.ip`). Since 2026-10-16 the default `trust proxy` skips our own hops (private, CGNAT and Cloudflare), so no `TRUST_PROXY` is needed; if the DigitalOcean hop were none of those, `req.ip` would be that hop and only requests without `cf-connecting-ip` would share its bucket (check the startup `first request` log line). Since plan F5 and G11 the identity throttles fail open on unusable addresses with a warning instead of sharing one bucket. Heist replays are never refused for a missing proxy setting (the 503 was removed on 2026-10-16). The NFT metadata routes (`GET /cat/nft/metadata`, `GET /cat/nft/:tokenId`) skip the throttler for marketplace crawlers. Not yet handled: the ISR pages `/cats/[cat]` and `/feed/[category]/[article]` fetch from the Next server's single IP on every uncached render, and carrier-NAT or office IPs share a bucket; consider allowlisting the Next server or raising the limit on those public GET routes.
- Fixed (2026-09): `GET /image/order/status` is public and returned the whole order (user id, wallet, payment hash, discount). It now returns `_id status entityType id image price` only. `confirm-payment` and portrait generation no longer echo Stripe, database or AI provider error text.

Cats, packs and spend (plan G3 and G4, task 3c; each was new and is fixed):

- Fixed: ownership dedupe compared names (`GET /cat/gift`) or populated only `_id` and never fired
  (`CatService.adopt`). It now matches by `blessing` or `sourceCat` (`CatService.ownsCopyOf`), so a
  starter named "Luna" no longer blocks adopting a real Luna, and owning Blessing X blocks X twice.
  Legacy copies of a cat without a blessing (redeem cats before `sourceCat`) match on the exact look.
- Fixed: pack, redeem and adopt copies spread the whole catalogue cat. `buildCatCopy` strips identity,
  ownership and every starter flag, and sets `origin` (`pack`, `redeem`, `adopt`; portraits `portrait`)
  and `sourceCat`. A starter can no longer be copied through `GET /cat/adopt/:_id`.
- Fixed: the pack `$sample` ignored owned, ADOPTED and HEAVEN cats and crashed (`blessing[0].cat`) on an
  empty pool. `CatService.pickPackCat` samples rescue blessings of the pack shelters that are not ADOPTED
  or HEAVEN, whose cat exists, and that the buyer does not own. An empty pool fails the grant and refunds
  the order (decision #21): Stripe through `refunds.create` (idempotency key per order), Stellar as
  `refund.state: 'due'` for the treasury to send back by hand. The spend counted for the order is taken
  back and no affiliate share is paid.
- Fixed: `grantBoughtCat` set COMPLETE whatever the adoption result. A failed grant is now
  `FAILED_GRANT` with `failureReason` (`EMPTY_POOL`, `ADOPT_FAILED`, `NO_CAT`), and the adoption
  counters move only on success. `scripts/audit-orders-grants.js` (read only, counts) reports grants
  before and after a cutoff.
- Fixed: `spent` was inflated at five sites (+1 on every pack grant and gift, and the portrait
  webhook fell back to the non-USD `price`). Grants and gifts no longer touch spend; the verified
  payment sites write `spent`, `monthSpent` and the new `spentUsd` from one USD amount
  (`src/web3/spend.ts`); Stripe pack purchases, which counted only the +1, now count their USD amount.
  `scripts/backfill-spent-usd.js` (dry run by default) writes a legacy estimate to its own field,
  `spentUsdLegacy` (set once, `spentUsdLegacyAt` guard), for the leaderboard only. Decision (3c
  review): this replaces the plan's `spentUsdSource: 'legacy-estimate'` flag, because one flag on the
  user cannot tell the verified and the estimated part of one `spentUsd` apart; `spentUsd` stays
  verified-only. Existing `spent` values stay inflated until a reviewed recompute.
- Still open (3c review): nothing reads the new spend fields yet. `spentUsd` and `spentUsdLegacy` are
  not in the profile projection (`user.controller.ts`), and no spend leaderboard exists in the backend
  (nothing sorts on `spent` today). Whoever adds one uses `leaderboardSpentUsd()` from
  `src/web3/spend.ts`. `user.schema.ts` declares `spentUsdSource` (unused) but not `spentUsdLegacy`.
- Fixed (3c review): a refund took the spend back with a plain `$inc`, which could leave `spent`,
  `monthSpent` or `spentUsd` negative if the field was lowered between payment and refund. It is now an
  update pipeline floored at 0 (`spendRefundPipeline`). Note: `monthSpent` is not in the monthly reset
  (`MONTHLY_COUNTER_RESET` in `src/user/codex-reset.ts`), so today it is a lifetime figure despite
  its name; not changed here (the reset list belongs to the codex owner).
- Fixed: rescue counts included paid portraits. `BlessingRepository.weeklyCount` counts rescue
  blessings only, and `rescueCount()` exists for traction. Still open: `GET /count` in
  `app.controller.ts` uses `blessingRepository.model.count()` (all blessings); switch it to
  `rescueCount()`.
- The pack shelter ids moved from the web3 controller to `src/blessing/featured-shelters.ts`, shared by
  the pack pool, `GET /blessing/featured` and the reserved cat names.
- Fixed (3c review): a paid pack whose adoption failed (for example two packs bought at once picked
  the same cat) stayed `FAILED_GRANT` with the spend kept and no refund. `grantPack` now retries once
  with another cat (excluding the one that failed) and otherwise refunds the order like an empty pool.
- Fixed (3c review): the ownership check raced (check, then create), so two parallel adopts or redeems
  of one cat (`GET /cat/redeem/:code` replayed) gave the user two copies. The unique partial index
  `copy_per_owner_source` on `{owner, sourceCat}` now refuses the second copy, which `adopt` answers
  as "User already owns this NFT cat".
- Fixed (3c review, pre-existing): copies inherited the catalogue cat's `token`, `tokenId` and `code`,
  so `GET /cat/nft/:tokenId` matched several cats. `buildCatCopy` strips them and sets a fresh `tokenId`.
  Copies made before this fix still share their catalogue cat's `tokenId` (not migrated).
- Fixed (3c second review, pre-existing): `GET /cat/adopt/:_id` copied any cat to any signed-in user
  for free: a paid catalogue cat (ids are public through `GET /cat/sale`), a quest reward template, or
  another player's paid portrait or pack copy. Catalogue rescue cats are `isBlueprint: true` and sold,
  so no cat is free to self-adopt; the route is retired and answers `{success: false}` for every cat
  (no client calls it). Packs, redeem codes, quests and moderator gifts keep calling
  `CatService.adopt` directly.
- Fixed (3c second review): `POST /user/starter` with a non-string `name` (for example `123`) silently
  committed the breed default; it is now 400 `NAME_CHARS`. The `onboarding.state: 'pending'` check runs
  before the name check, so an existing account always gets 409.
- Fixed (3c second review): pack, redeem and adopt copies inherited `releasedSourceCat` from a
  released catalogue cat; `buildCatCopy` strips it.
- Decision (3c second review): moderation (`PUT /cat/:id/name/moderate` reset or rename) overrides the
  mint freeze of decision #22. An offensive name must be removable (App Store 1.2), and the NFT name is
  served off-chain by `GET /cat/nft/:tokenId`, so it changes there too. Players still cannot rename a
  minted cat.
- Still open (hand-off): `client/models/order.ts` keeps its own `OrderStatus` enum without
  `FAILED_GRANT`; it should re-export `OrderStatus` from `@/shared-contracts/enums`. Today the client
  only compares with `COMPLETE`, so nothing breaks yet.
- Fixed (3c review): `POST /user/starter` accepted an unlocked starter that sign-in or a guest merge
  (`ensureStarterCat` without `locked`) created for an existing account. It now needs
  `onboarding.state: 'pending'`. Still open (2a): the merge and sign-in calls create such unlocked
  SCOUT starters for legacy accounts, which also keeps `backfill-starter-cats.js` from marking their
  Cleocatra (it counts them as `ownersWithUnlockedStarter`).
- Fixed (3c review): one numeric entity past U+10FFFF in a blessing description (`&#99999999;`) threw
  in `htmlExcerpt` and failed the whole `GET /blessing/featured` response.
- Fixed (3c review): every name in the featured pool (up to 2000) was reserved, blocking common
  Lithuanian cat names the client could not predict. Only the cats featured right now are reserved,
  and `GET /blessing/featured/names` lists them for the client.
- Fixed (3c review): the name filter matched blocked and reserved words with repeated letters
  squeezed, so "Bob", "As", "Rot" and "Nul" were refused, and short words matched inside harmless
  names (Shiitake, Fukuoka, Badminton). Repeats now count as "at least as many as written", and short
  words match only as whole words.
- Fixed (3c review): the reports of a deleted cat could not be closed. Dismiss works without the cat.

Shelter gifts and x402 (2026-09, new):

- The x402 route uses a custom `onchain-receipt` scheme without a facilitator, so generic x402 clients that
  expect the `exact` scheme will not pay it without a small adapter. Standard facilitators may not support Arc.
- Added (2026-10-04, F4): the route also offers the standard x402 `exact` scheme (v1, EIP-3009 USDC) when
  `SHELTER_X402_EXACT_ENABLED=true`. `payTo` is the shelter's own wallet (`SHELTER_X402_EXACT_PAYTO`; the
  ShelterSplit address is refused), a facilitator verifies, settles and pays the gas, and Token Tails never holds
  the money. Variables: `SHELTER_X402_EXACT_NETWORK` (x402 name, e.g. `base-sepolia`), `_CHAIN_ID` (needed only
  for unknown names), `_ASSET`, `_ASSET_NAME`/`_VERSION` (EIP-712 domain, default `USDC`/`2`), `_PRICE` (USDC,
  default `0.01`), `_RPC` (optional: re-reads the settled Transfer and checks the token domain at first use),
  `SHELTER_X402_FACILITATOR_URL` (default `https://x402.org/facilitator` on testnets; required on mainnet). An
  unknown or mainnet network is offered only while `payTo` is the one wallet the chain's split pays on chain
  (`verifiedShelterWallet`). On a mainnet `payTo` defaults to Pink Paw's wallet from `wallet.config.ts`, so
  `SHELTER_X402_EXACT_PAYTO` is optional there. The authorization (signer + nonce)
  is claimed in `x402nonces` as `exact:<chainId>:<from>:<nonce>` before the facilitator is called, so a replay is
  refused; settled payments are written to `x402usedtxs` with `scheme: 'exact'`. Code: `src/shelter/onchain/x402-exact.ts`.
  Facilitators that need an API key: `SHELTER_X402_FACILITATOR_AUTH` is sent on every `/verify` and `/settle`
  call as the `Authorization` header (for example `Bearer <key>`), or under the header named by
  `SHELTER_X402_FACILITATOR_AUTH_HEADER` (e.g. `X-API-Key`). It is never logged or sent to clients. Limit: a
  facilitator that wants a fresh signed JWT per request (CDP) needs a static key or token instead.
- Fixed (plan F7.4, task 2b): `POST /shelter/donate` returns once the transaction is broadcast; it used to
  keep the user's gift for the day and the budget slot used when the transaction later reverted or was
  dropped. `ShelterDonateReconcileService` (leased, every 2 minutes, on instances with
  `IMPACT_JOBS_ENABLED=true`) now moves SENT to CONFIRMED on a success receipt and to FAILED on a revert,
  or after 30 minutes once its nonce is used by another transaction, and gives both slots back on a
  same-day failure. The hash, nonce and sender are stored before the broadcast, so a process that dies
  in between leaves a PENDING row with a hash that is settled like SENT. Still open: a gift whose nonce
  stays unused (never broadcast, and no later gift reuses the nonce) stays SENT and blocks that user's
  day until a later gift uses the nonce, or until an operator sends a 0-value self-transfer from the hot
  wallet at that nonce (the reconcile logs "nonce is unused: kept"); a legacy SENT row without a stored
  nonce that the node no longer knows is kept for a manual check (none exist: donations were never
  enabled).
- The send queue is per process. With more than one replica, concurrent gifts can collide on the hot wallet
  nonce and one of them fails with 503 (the user may retry).
- Budget slots are whole gifts; changing `SHELTER_DONATE_AMOUNT_WEI` mid-day changes the slot count for the
  rest of that day.
- `resource` in the 402 body is built from the request `Host` header (https in production and behind a proxy
  that sends `X-Forwarded-Proto: https`, see `x402ResourceUrl`) and is informational only.
- x402 v1 and v2 HTTP headers are both served: the payment is read from `X-PAYMENT` (v1) or `PAYMENT-SIGNATURE`
  (v2, `{x402Version: 2, accepted, payload}`, mapped to the v1 checks); a 402 also carries `PAYMENT-REQUIRED`
  (base64 v2 PaymentRequired: CAIP-2 network, `amount`, `resource` object, `exact` only), and a paid card both
  `X-PAYMENT-RESPONSE` and `PAYMENT-RESPONSE` (CAIP-2 network). The facilitator call itself stays x402 v1.
- `X-PAYMENT-RESPONSE`, `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` are listed in the CORS exposed headers
  (`src/main.ts`), so browser clients and server-side agents can read them.
- Public payments to a wallet Token Tails holds would be custodial (MiCA caution). The code prevents it:
  a mainnet onchain-receipt offer needs `publicGivingVerified` for that chain (every split recipient a
  rotated claim, or Pink Paw's generated wallet, and never a held wallet). The standard `exact` scheme also
  requires `payTo` to match `verifiedShelterWallet` (`x402-exact.ts`).
- `src/shelter/onchain/shelter-x402.service.ts` carries one open copy-lint R2 finding (an uncited impact
  claim in the card description), recorded in task 4e and still open.
- Founder to confirm (task 2b): Token Tails' own house zones (`token-tails` catfluencers, `token-tails-2`
  event) are left out of the public rescued-cats figure and the traction counts, by the shelter's `role`.
  If the catfluencers are rescues, give that shelter `role: 'partner'`.

Impact and paws (plan F7, G4, task 4f):

- A settlement whose send was off stays `built`; enabling the send later does not pay old days (an ADMIN
  `POST /impact/paws/:day/settle` does, one day at a time). The catch-up looks back 3 days.
- `games` has no `{createdAt, points}` index, so the nightly paw settlement scans the collection
  (requested from the `game.schema.ts` owner, not added).
- An unpublished outcome image can stay in CDN edge caches until they expire; other replicas serve the
  old snapshot for up to their one-minute cache after a withdraw.
- Rescue Goals: an expired OPEN goal is not flipped by any job (a manager delivers, cancels or extends
  it), and if the process dies between the receipt write and the goal update the goal shows DELIVERED
  with no stored receipt (manual fix; a transaction would cover it under `MONGO_TRANSACTIONS=true`).
- The new error codes `PAYOUT_*`, `OUTCOME_*` and the Rescue Goal codes (`PLEDGES_PAUSED`,
  `PLEDGE_*`, `GOAL_*`) are not in `shared/errors.ts` yet; clients match the literals.
- `user.schema.ts` does not declare `pledgeHolds` and `pledgeCancelRefunds` (written through the native
  collection) or `spentUsdLegacy`.

Operational:

- In-process caches (traction counts, Paw Match leaderboard, the storefront and featured caches) diverge across replicas. Public numbers no longer depend on them: `/impact`, `/stats` and the landing read the Mongo-backed impact snapshot (plan F7). The traction counters themselves are a separate task.
- Fixed (task 1b, new): the crons ran on every replica (`giveWeeklyTopRewards` paid the top 200 once per replica). Every job now takes a lease in `jobruns`; the cat reset is also awaited now.
- `GET /cat/sale` groups ids per shelter with `$push` and `$slice`; the 16 MB group limit is about a million unsold cats in one shelter (188 today). Replace it with `$topN` once the production MongoDB version (5.2+) is confirmed.
- Reward paths swallow errors in empty `catch` blocks, so partial credits are possible.
- Several ObjectIds are hardcoded and must match the database: pack source shelters in the web3 controller, the portrait shelter in the cat service, promo codes in the cat controller, reward cats in the user schema.
- Admin one-off methods on `UserController` (give cats, give tails, give loot boxes) are triggered by uncommenting constructor lines.
- Codex reset deploy timing (deploy-order rule, plan F8). The old cron (`0 0 1 * * `) fires at 00:00 server time on 2026-10-01. If the backend with the new job deploys after that, the new job pays guards and wipes the counters again at 2026-10-08T23:00Z (a double payout of sum(codex) times 300 $TAILS, and the Oct 1-8 counters lost). Deploy before 2026-10-01 00:00 server time. Otherwise run `scripts/skip-codex-cycle.js --period 2026-10` (dry run by default, `--apply` to write) before 2026-10-08T23:00Z so the new job skips that cycle.
- Feeding now requires `Cat.owner` to be the caller. Current creation paths set `owner`, but older cats may not, and their owners would get 403 and lose feed rewards. `scripts/audit-cat-owners.js` (read-only) counts users whose `cat` or `cats` point to a cat with a missing or different owner; if it is not zero, backfill `owner` with a reviewed script. The client's optimistic +1 $TAILS is not rolled back on 403 or 409.

- Open (Tails Club, 2026-10-21): Pink Paw's half of each card payment is paid from the Arc keeper hot wallet
  float (~$1–3), like rave card orders; club shares stay `due` until it is topped up.
- Open (shelter-share keeper): a row stuck in `sent` is never re-sent automatically (rave and club alike); check
  it by hand.
- Open (Moon Rave payments): `/image/webhook` does not forward PaymentIntent or charge events, so rave and club
  refunds depend on their own webhooks (or the rave Events API pull).
- Open (Tails Club): a dispute cancels the subscription at once (default chosen 2026-10-21; founder may revert to
  "only a full refund cancels"). A dispute Token Tails wins (`charge.dispute.closed`, not subscribed) leaves the
  share void; pay Pink Paw by hand.
- Open (Tails Club): the card-testing brake is global (`CLUB_INCOMPLETE_PER_15MIN` incomplete subscriptions in 15
  minutes), so someone on five IPs can make checkout answer `busy` for everyone for up to 15 minutes. Raise the
  env value if it happens; Stripe Radar still screens each card.
- Open (Tails Club): Pink Paw's share exists only through the webhook. If `invoice.paid` never arrives (wrong
  endpoint or secret), the buyer's poll still activates the membership but no share row is written; check the
  webhook's delivery log in the Dashboard after launch.
- Open (Tails Club, 2026-10-22): one email can end up with two active subscriptions. The home page makes a new
  `clientKey` when the plan, email or cat changes, and checkout refuses only an email that already has an active
  membership. Two tabs, or a plan switch before the first payment confirms, can each create and pay a
  subscription; nothing dedupes after payment. A fix needs a product call (cancel the older incomplete one at
  the next checkout, or cancel and refund the second at activation). Until then, look for an `emailCanonical`
  with more than one active member row and cancel and refund the duplicate in the Dashboard.

Dead code: `PipelineGuard`, the `Roles` and `JWT_USER` decorators, `EncryptionService.decrypt`,
Freepik scraping helpers, `src/api/api.ts`, `src/user/users.ts` (a 1000-line hardcoded winner
roster), the whole `PrintifyService` and duplicated `weeklyCount()` in three repositories. (The
unimplemented `generateCatAvatar` stub in the blessing controller is gone; checked 2026-10-11.)
