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
| Chain | ethers v6 for the Arc rail (ShelterSplit gifts, payout indexer, paw settlement) |
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
- Sets Express `trust proxy` from `TRUST_PROXY` when it is set (`src/shared/trust-proxy.ts`), so the throttler sees client IPs behind a proxy. With `NODE_ENV=production` and `TRUST_PROXY` unset it logs an error at startup (`warnIfProxyUntrusted`), and every Heist replay is refused with 503 until it is set.
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
| `src/shelter/` | Partner shelters, their generated Stellar wallets, roles and partner status, and members (`shelter-members.service.ts`). `src/shelter/onchain/` holds the Arc gifts (`POST /shelter/donate`, reconcile job) and the x402 agent cat card, through ShelterSplit and ethers v6. |
| `src/impact/` | The truth data layer (plan F7, G4, G11): payout log indexer, hourly impact snapshot, eligibility policies, nightly paw settlement, payout attestation, shelter outcomes, purchase pledge, `GET /impact*`. |
| `src/rescue-goal/` | Rescue Goals (plan G5): goals, the give saga, the sweeper, deliveries and receipts. |
| `src/common/guards/`, `src/common/decorators/` | `AppAuthGuard`, the guest allow-list, `@AllowGuest`, `@AUTH_USER`, auth error bodies. |
| `src/shared/jobs/` | `runLeased` and `claimJobPeriod`: one lease document per cron job in `jobruns` (plan F8). |
| `src/vendor/heist-sim/` | The vendored Heist simulation (generated). |
| `src/shared-contracts/` | Generated copies of `shared/` (enums, error codes, caps, storefront, Heist bridge, copy, names). |
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
| Catnip Heist | 8 (`heist-01` to `heist-08`) | `heistScore[]` (best server score), `heistStars[]` (star bit mask) | `HEIST_LEVEL_CAPS` 250, 240, 220, 270, 240, 240, 240, 310, derived from the sim (`coins x 10 + 50`) |

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

Three flows, all granting either a portrait-derived cat or a pack cat on success:

1. **Stripe Checkout** for portraits (`digital`, `print`, `canvas`) in `src/image/image.controller.ts`. The amount comes from the server price table in `src/payments/price-table.ts`; the client `amount` is ignored. A pending `Order` is created with the session id as `hash`. The webhook is the only grant path: it checks the session is paid, in USD and at least the table price, moves the order from `PENDING` to `COMPLETE` atomically (a redelivered event grants nothing), then increments spend counters, sends a SendGrid confirmation, and creates the blessing and cat.
2. **Stripe PaymentIntents** for in-app purchases in `src/web3/web3.controller.ts`, through `src/payments/stripe-payment.service.ts` (platform fix 2). `create-payment` charges the table price minus a verified discount code and ignores the client `amount`. `confirm-payment` retrieves the intent from Stripe and checks it belongs to the caller, succeeded, is in USD and covers the server price, then claims the intent id atomically (upsert on `hash`), so a replayed confirm grants nothing. Stripe and database errors are logged and answered with a fixed message. No webhook covers PaymentIntents yet; adding `payment_intent.succeeded` as the only grant path is a follow-up.
3. **Stellar** payments through `POST /web3/confirm`. The controller accepts only `IMAGE`, `PACK` (with a valid pack `id`) and `LOOT_BOX` (with no `id`), and refuses anything else before an order exists. It lowercases the hash, creates a `PENDING` order with it, then `Web3Service.validatePrice` loads the transaction and its operations from Horizon (mainnet when `IS_PROD`, else testnet) and requires: the transaction succeeded; it pays the treasury (`STELLAR_TREASURY_ADDRESS`, default the public receiving account also hardcoded in `client/web3/contracts.ts`); in the order's asset (native XLM, or USDC from `STELLAR_USDC_ISSUER`, default Circle's issuer; USDT is refused); and the sum of those payments covers the server price. The price is the catalogue price of the order's item (`src/web3/order-catalogue.ts` over `src/payments/price-table.ts`, plus the client-only `LOOT_BOX` at $1 when it names no `id`), less a discount only when the code belongs to a user. A loot box is granted with common odds and no pack type. The client's `price` is ignored. XLM is valued at the live Binance XLMUSDC rate (the source of `GET /cat/rates`, from which the client quotes `ceil(usd / rate)`) with a 3 percent tolerance; if the rate is unavailable the request fails with 503 rather than falling back to the static rate. The hash must be the payment's canonical key: Horizon resolves a fee-bump transaction by its outer and its inner hash, so the verifier refuses an inner hash (`NOT_CANONICAL_HASH`) and refuses an outer hash when another order holds the inner one (409). On success the order's `price` and `priceUsd` are overwritten with the verified amount, and `spent`, `monthSpent` and the 20 percent affiliate credit use that verified `priceUsd`. On any failure the order becomes `FAILED` and its hash moves to `failedHash`, so the payer can retry the same hash (for example once Horizon has indexed it). A hash can back only one order: `Order.hash` has the unique partial index `hash_unique`, and a duplicate returns 409. The flow has no memo, so the payment is not bound to the buyer (see known issues).

Pack rarity odds are in `src/shared/utils/content.utils.ts`. Discount codes map to a user's
`discount` field; the code owner earns a 20 percent affiliate credit on completed purchases.

There is no Apple or Google in-app purchase receipt verification.

### Shelter gifts on Arc

`src/shelter/onchain/` (endpoints in `docs/API.md`). Both features are off by default.

- `ShelterChain` wraps ethers v6: a `JsonRpcProvider` with a static network, a `Wallet` from
  `SHELTER_DONATE_PRIVATE_KEY`, and the ShelterSplit `Interface` (`donate(string)`, `disburse(uint256,string)`,
  events `NativeDisbursed` topic `0xc859ef09...aeef` and `Disbursed` topic `0x53e1c69d...495a`). Sends are
  queued in-process so concurrent gifts do not collide on the wallet nonce.
- `ShelterDonateService`: guests are refused by `AppAuthGuard`, then the instant-treat policy runs
  (F7.5, `src/impact/eligibility.ts`: a verified registered account, at least 24 h old counted from
  the later of `createdAt` and `promotedAt`, with at least one saved game (a replay-verified Heist
  save counts, as F7.5 names both treat sources; the daily paw does not count Heist rows); otherwise 403
  `EMAIL_UNVERIFIED` or `DONATE_NOT_ELIGIBLE` with `reason` and `eligibleAt`). It inserts a
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
- `ShelterX402Service`: issues nonces into `x402nonces` (TTL index on `expiresAt`, 600 seconds), verifies
  receipts over RPC, records each paying tx in `x402usedtxs` (unique `txHash`), and returns a card built
  from a whitelist projection of a blessing (`name`, image `url`, shelter `name`). It never reads users,
  owners or wallets, and needs no server key.
- Showcase shelter: Pink Paw (Rožinė pėdutė). Its wallet is created and held by Token Tails on its behalf
  until handover. The contract addresses come from env and are empty until the deploy.

### Impact and truth data (plan F7, G4, G11)

`src/impact/`. Public numbers come from a stored snapshot, never from the in-process traction
counters. Every job here runs through a lease and only where `IMPACT_JOBS_ENABLED` is on (default: on
only under `NODE_ENV=production`; set it explicitly in production, a disabled instance logs a startup
warning).

- **Payout indexer** (`impact-indexer.service.ts`, every 5 minutes): reads the ShelterSplit
  `Disbursed` and `NativeDisbursed` logs on Arc from `SHELTER_SPLIT_FROM_BLOCK` in
  `SHELTER_LOG_CHUNK` block chunks (at most `IMPACT_INDEXER_MAX_CHUNKS` calls per run), upserts one
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
- **Eligibility** (`eligibility.ts`, F7.5): one table of pure policies. Instant treat: verified,
  24 h, 1 saved game. Daily paw: verified, 24 h at settlement, 2 `/live` rows with points at least 3
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
  registry; COMPLETE USD-priced orders from its `effectiveAt`, per UTC month, pledged versus paid
  (attested pledge payouts). Until C-002 is set the status is `not-started`.
- **Spend** (G4): `spent`, `monthSpent` and `spentUsd` are written from one verified USD amount at
  the payment sites only (`src/web3/spend.ts`); see "Cats, packs and spend" in the known issues.

The facts registry (`funding/framework/facts/facts.json`, generated into
`src/impact/facts.generated.ts`) and the wording rules are in [CLAIMS.md](CLAIMS.md).

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
3. `COMPLETE` Stripe orders whose stored USD amount is not a catalogue price (full, or 10 or 20 percent off when a code was recorded). `ABOVE_CATALOGUE` is mostly the $400 vs $350 Legendary discrepancy.
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
| `generatePortraitForImage` | `src/shared/utils/ai-portrait.ts` | Gemini image model | 4K themed portrait in one of four styles: highness, monarch, aristocrat, commander |

Both generation paths run synchronously inside the HTTP request. Expect multi-second latency and
no retry queue.

### Image pipeline

`src/shared/utils/image.utils.ts` sniffs HEIC by magic bytes, converts to JPEG, re-encodes as
WebP at quality 80, optionally resizes to 1000 px, and uploads to Spaces with a public-read ACL.
The returned URL is `${DO_SPACES_CDN}/<name>.webp`.

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
| Treat reconcile (`shelter-donate-reconcile`) | `src/shelter/onchain/shelter-donate-reconcile.service.ts` | Every 2 minutes | Settles SENT gifts by receipt (see "Shelter gifts on Arc"). |
| Payout indexer (`impact-indexer`) | `src/impact/impact-indexer.service.ts` | Every 5 minutes | Indexes ShelterSplit payout logs. Idle until `SHELTER_SPLIT_FROM_BLOCK` is set. |
| Impact snapshot (`impact-snapshot`) | `src/impact/impact.service.ts` | Hourly at :07 | Writes the hour's `impactsnapshots` row and the optional CDN mirror. |
| Snapshot compaction (`impact-compact`) | `src/impact/impact.service.ts` | Daily 00:20 | Keeps one row per day for snapshots older than 48 hours. |
| Paw settlement (`paw-settlement`) | `src/impact/paws.service.ts` | Daily 00:30 UTC | Settles yesterday's paws (send only with `PAWS_SETTLEMENT_ENABLED`). |
| Paw reconcile (`paw-reconcile`) | `src/impact/paws.service.ts` | Every 10 minutes | Settles sent paw transactions and catches up missed days (3 days back). |
| Give sweeper (`rescue-goal-pledge-sweeper`) | `src/rescue-goal/rescue-goal-pledge.service.ts` | Every minute | Rolls stuck gives forward or refunds them; re-runs cancel refunds. |

## Environment variables

Names only. Copy `backend/.env.example` to `backend/.env` and fill in values.

| Group | Variables |
|---|---|
| Server | `PORT`, `IS_PROD`, `NODE_ENV` (several job and safety defaults follow `production`), `FRONT_END_URLS`, `MAIN_FE_DOMAIN`, `TRUST_PROXY` (proxy hop count or an Express `trust proxy` value; required behind a load balancer, see the checklist below) |
| Database | `MONGODB_URI`, `MONGO_TRANSACTIONS` (default off; `true` runs Rescue Goal gives in a transaction, only on a confirmed replica set) |
| Auth | `FB_PRIVATE_KEY` (Firebase service account key), `ML_ACCESS_TOKEN` (unused guard) |
| Identity (plan F5) | `AUTH_ENFORCE_EMAIL_VERIFIED` (default `true`: an unverified new password user gets 403 `EMAIL_UNVERIFIED` and no account), `AUTH_REQUIRE_VERIFIED_EXISTING` (default `false`; only matters for accounts created while enforcement was off), `APP_CHECK_ENFORCE` (default `false`; `true` requires a valid `x-firebase-appcheck` on `POST /user/guest/session`), `NEW_ACCOUNTS_PER_IP_PER_HOUR` (default 10), `GUEST_SESSIONS_PER_IP_PER_HOUR` (default 30), `DISPOSABLE_EMAIL_DOMAINS` (extra comma-separated domains), `IDENTITY_BACKFILL_DONE` (set `true` after `backfill-identity-fields.js --apply`; switches off the case-insensitive email fallback and turns on the alias rules), `GOOGLE_APPLICATION_CREDENTIALS` (only for `scripts/backfill-firebase-uid.ts`) |
| Sign in with Apple revocation | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`, optional `APPLE_AUDIENCE`. Without them `DELETE /user/me` skips the revoke and logs it |
| Jobs | `CRONS_ENABLED` (guest cleanup and merge resume; default on only under `NODE_ENV=production`), `IMPACT_JOBS_ENABLED` (indexer, snapshot, compaction, treat reconcile, paws; same default; set it explicitly in production), `RESCUE_GOAL_SWEEPER` (`off` stops the give sweeper) |
| Impact (plan F7) | `SHELTER_SPLIT_FROM_BLOCK` (first block to index, the ShelterSplit deploy block; unset keeps the indexer idle), `SHELTER_LOG_CHUNK` (blocks per `eth_getLogs`, default 2000, 1 to 10000), `IMPACT_INDEXER_MAX_CHUNKS` (calls per run, default 25), `IMPACT_PAWS_SENDERS` (extra addresses allowed to settle paws), `IMPACT_CDN_ENABLED` (default off; mirrors `impact.json`), `IMPACT_CDN_OBJECT_KEY` (default `impact/impact.json`), `IMPACT_CDN_BUCKET` (default `DO_SPACES_NAME`) |
| Paws (plan G4) | `PAWS_SETTLEMENT_ENABLED` (default off; `true` lets the nightly settlement send), `PAWS_DAILY_BUDGET` (wei, default 1 USDC), `PAWS_AMOUNT` (wei per paw, default 0.01 USDC) |
| Rescue Goals (plan G5) | `RESCUE_GOAL_PLEDGES` (`off` is a kill switch for gives) |
| Specs only | `MONGO_IT_URI`, `IDENTITY_SPEC_MONGO_URL`, `LIVE_SPEC_MONGO_URL`, `HEIST_BENCH`, `HEIST_BENCH_ROUNDS`; migrations read `MIGRATION_APPLY` (and `MIGRATION_BACKFILL_MISSING`) |
| Encryption | `INVALIDATE_CACHE_SECRET` (despite the name, this seeds the AES key for custodial wallet secrets; rotating it makes stored secrets unreadable) |
| AI | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| Storage | `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `DO_SPACES_CDN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (in the example file, unused in code), optional `STELLAR_TREASURY_ADDRESS` and `STELLAR_USDC_ISSUER` (default to the public values in `src/web3/stellar-payment.ts`) |
| Shelter gifts (Arc) | `SHELTER_DONATE_ENABLED` (default off), `SHELTER_CHAIN_ID` (default `5042` mainnet; `5042002` testnet), `SHELTER_ARC_RPC_URL` (defaults to `https://rpc.mainnet.arc.io` or `https://rpc.testnet.arc.io` by chain), `SHELTER_SPLIT_ADDRESS` (ShelterSplit, empty until the deploy), `SHELTER_DONATE_PRIVATE_KEY` (server hot wallet; keep only a small float of USDC on it), `SHELTER_DONATE_AMOUNT_WEI` (default 0.01 USDC), `SHELTER_DONATE_DAILY_BUDGET_WEI` (default 1 USDC), `SHELTER_X402_ENABLED` (default off: public payments need the shelter's own keys first, a MiCA custody caution), `SHELTER_X402_PRICE_WEI` (default 0.01 USDC) |
| Email | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (missing from the example file) |
| Print | `PRINTIFY_API_KEY` |
| Rescue points (G5) | `TAILS_TOKEN_MODE` (`POINTS` default, or `TOKEN`; read by the public `GET /user/token-status`), `TAILS_TGE_AT` (ISO date, exposed only in `TOKEN` mode), `TAILS_EARNED_BACKFILL_DONE` (`true` once `scripts/backfill-tails-earned.js --apply` ran; the earned board then sorts on `tailsEarned`) |
| Unused | `GTM_ID` |

### Production checklist for the flags

- `TRUST_PROXY`: set it to the load balancer hop count before deploying. Without it the global
  throttler and every per-IP limit share one bucket, the identity throttles (new accounts, guest
  sessions) fail open on private and loopback addresses with one `per-IP throttle skipped` warning,
  and in production every Heist replay is refused with 503. The hop count is not documented in the
  repo; confirm it with whoever runs the hosting.
- `IMPACT_JOBS_ENABLED=true` and, unless the process runs with `NODE_ENV=production`,
  `CRONS_ENABLED=true` on the instance(s) that should run jobs (leases make more than one safe).
  Check the startup log for "Impact jobs are off".
- Keep `TAILS_TOKEN_MODE` unset (POINTS) and `TAILS_TGE_AT` unset (decision #39).
- `AUTH_ENFORCE_EMAIL_VERIFIED` stays `true`; ship the client verification screen and the heads-up
  email to unverified password users with the deploy (decision #3).
- `APP_CHECK_ENFORCE=true` only after App Check is configured in the Firebase console.
- `SHELTER_SPLIT_ADDRESS`, `SHELTER_ARC_RPC_URL` and `SHELTER_SPLIT_FROM_BLOCK` after the
  ShelterSplit deploy (decision #97); `PAWS_SETTLEMENT_ENABLED=true` only after that and a funded
  hot wallet; `IMPACT_CDN_ENABLED=true` when the mirror should be public.
- `TAILS_EARNED_BACKFILL_DONE=true` only after `backfill-tails-earned.js --apply`, and before the
  first Rescue Goal opens.
- `IDENTITY_BACKFILL_DONE=true` only after `backfill-identity-fields.js --apply`.

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

- Fixed (platform fix 4): `PUT /image/portrait/:id/regenerate` now requires auth and is limited to 3 calls per minute. Images have no owner field, so any signed-in user can still regenerate any image id. The public `/portrait` and `/portraits` pages have no sign-in, so a signed-out visitor now gets a "sign in" message on retry. `POST /image/portrait` is also a paid generation and is still public (5 per minute per IP). Open product decision: require sign-in for both, or allow anonymous generation with a tight per-IP limit.
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
- The Legendary pack price disagrees: the backend table and the odds comment in `content.utils.ts` say $350, the client pack modal shows $400. Stripe charges $350. A human must pick one and update the other copy.
- Stripe idempotency on the PaymentIntent id is race-safe across processes only once the `hash_unique` index on `Order.hash` (platform fix 1) is built. Mongoose builds it on startup, and the build fails while duplicate hashes exist, so run the order audit first; until then an in-process lock covers the single instance.
- Custodial Stellar secrets are encrypted with AES-128-CTR using a static salt. The decrypt path is never called.
- Rate limiting is global and tracks `req.ip`. Behind a load balancer, set `TRUST_PROXY` to the hop count, or all clients share one bucket of 300 requests per minute (a site-wide outage) and the per-IP route limits (120, 5 and 3 per minute) apply to everyone together. The hosting topology is not documented, so this must be confirmed before deploy (still open: a configuration step, see "Production checklist for the flags"). Since plan F5 and G11 the identity throttles fail open on unusable addresses with a warning instead of sharing one bucket, and the Heist replay route refuses replays with 503 in production while `TRUST_PROXY` is unset, so a missing hop count shows up as broken Heist saves rather than an open queue. The NFT metadata routes (`GET /cat/nft/metadata`, `GET /cat/nft/:tokenId`) skip the throttler for marketplace crawlers. Not yet handled: the ISR pages `/cats/[cat]` and `/feed/[category]/[article]` fetch from the Next server's single IP on every uncached render, and carrier-NAT or office IPs share a bucket; consider allowlisting the Next server or raising the limit on those public GET routes.
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
- `resource` in the 402 body is built from the request `Host` header and is informational only.
- `X-PAYMENT-RESPONSE` is listed in the CORS exposed headers (`src/main.ts`), so browser clients and
  server-side agents can both read it.
- Keep `SHELTER_X402_ENABLED` off until the shelter holds its own keys: while Token Tails holds Pink Paw's
  wallet, public payments to it are custodial (MiCA caution).
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

Dead code: `PipelineGuard`, the `Roles` and `JWT_USER` decorators, `EncryptionService.decrypt`,
Freepik scraping helpers, `src/api/api.ts`, `src/user/users.ts` (a 1000-line hardcoded winner
roster), the whole `PrintifyService`, duplicated `weeklyCount()` in three repositories, and an
unimplemented `generateCatAvatar` stub at the end of the blessing controller.
