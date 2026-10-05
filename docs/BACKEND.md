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
| `src/shelter/` | Partner shelters, their generated Stellar wallets, roles and partner status, and members (`shelter-members.service.ts`). `src/shelter/onchain/` holds the shelter gifts on every chain in `wallet.config.ts` (`POST /shelter/donate`, reconcile job), the wallet gift relay and match, shelter claims and the x402 agent cat card, through ShelterSplit, DonateRouter and ethers v6. |
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

Four flows, granting a portrait-derived cat, a pack cat, a loot box cat or one shelter cat on success.
Every paid grant goes through `src/web3/purchase-grant.service.ts` (moved out of `Web3Controller`
unchanged on 2026-10-04): the order is `COMPLETE` only when the adoption succeeded, `FAILED_GRANT`
otherwise, and a failed grant is refunded once (Stripe automatically, every other rail `refund.state:
'due'` for the treasury to send back by hand).

1. **Stripe Checkout** for portraits (`digital`, `print`, `canvas`) in `src/image/image.controller.ts`. The amount comes from the server price table in `src/payments/price-table.ts`; the client `amount` is ignored. A pending `Order` is created with the session id as `hash`. The webhook is the only grant path: it checks the session is paid, in USD and at least the table price, moves the order from `PENDING` to `COMPLETE` atomically (a redelivered event grants nothing), then increments spend counters, sends a SendGrid confirmation, and creates the blessing and cat.
2. **Stripe PaymentIntents** for in-app purchases in `src/web3/web3.controller.ts`, through `src/payments/stripe-payment.service.ts` (platform fix 2). `create-payment` charges the table price minus a verified discount code and ignores the client `amount`. `confirm-payment` retrieves the intent from Stripe and checks it belongs to the caller, succeeded, is in USD and covers the server price, then claims the intent id atomically (upsert on `hash`), so a replayed confirm grants nothing. Stripe and database errors are logged and answered with a fixed message. No webhook covers PaymentIntents yet; adding `payment_intent.succeeded` as the only grant path is a follow-up.
3. **Stellar** payments through `POST /web3/confirm`. **Packs are deprecated on this path (2026-10-04)**: the client no longer offers them. A `PACK` that still arrives is verified and recorded like before (the client pays before it confirms, so refusing first would lose the payment): its Stellar ledger close time (`created_at`) before `STELLAR_PACKS_SUNSET_AT` (default `2026-10-11T00:00:00Z`; set deploy time plus about 7 days) grants as before; a later one is `FAILED_GRANT` (`STELLAR_DEPRECATED`) with `refund: 'due'`, no spend counted, and answers 410 `STELLAR_PACKS_DEPRECATED`. `STELLAR_PACKS_ENABLED=true` is the rollback switch. Loot boxes are still sold on Stellar (`MysteryBoxCat`); moving them is an open decision. Existing Stellar pack orders, their history, `scripts/audit-orders*.js` and the manual refunds are unchanged. The controller accepts only `IMAGE` and `LOOT_BOX` (with no `id`), and refuses anything else before an order exists. It lowercases the hash, creates a `PENDING` order with it, then `Web3Service.validatePrice` loads the transaction and its operations from Horizon (mainnet when `IS_PROD`, else testnet) and requires: the transaction succeeded; it pays the treasury (`STELLAR_TREASURY_ADDRESS`, default the public receiving account also hardcoded in `client/web3/contracts.ts`); in the order's asset (native XLM, or USDC from `STELLAR_USDC_ISSUER`, default Circle's issuer; USDT is refused); and the sum of those payments covers the server price. The price is the catalogue price of the order's item (`src/web3/order-catalogue.ts` over `src/payments/price-table.ts`, plus the client-only `LOOT_BOX` at $1 when it names no `id`), less a discount only when the code belongs to a user. A loot box is granted with common odds and no pack type. The client's `price` is ignored. XLM is valued at the live Binance XLMUSDC rate (the source of `GET /cat/rates`, from which the client quotes `ceil(usd / rate)`) with a 3 percent tolerance; if the rate is unavailable the request fails with 503 rather than falling back to the static rate. The hash must be the payment's canonical key: Horizon resolves a fee-bump transaction by its outer and its inner hash, so the verifier refuses an inner hash (`NOT_CANONICAL_HASH`) and refuses an outer hash when another order holds the inner one (409). On success the order's `price` and `priceUsd` are overwritten with the verified amount, and `spent`, `monthSpent` and the 20 percent affiliate credit use that verified `priceUsd`. On any failure the order becomes `FAILED` and its hash moves to `failedHash`, so the payer can retry the same hash (for example once Horizon has indexed it). A hash can back only one order: `Order.hash` has the unique partial index `hash_unique`, and a duplicate returns 409. The flow has no memo, so the payment is not bound to the buyer (see known issues).

4. **Crypto checkout** (`src/payments/crypto/`, API in `docs/API.md` "Crypto checkout"), replacing the Stellar pack purchase. Off unless `CRYPTO_PAY_ENABLED=true`.
   - Chains: `crypto-chains.ts`, the USDC and EURC entries of `funding/framework/tracks/a-build/chains.json` plus Robinhood's USDG (Arc, Base, Arbitrum One, Avalanche C-Chain, Tempo, Robinhood Chain, Monad and their testnets), pinned by `crypto-chains.spec.ts` (Robinhood testnet's mock mUSDC against `deployments.json`; it is `testOnly`, never offered under `NODE_ENV=production`). Tokens only: native gas coins are never accepted. Mainnets when `NODE_ENV=production`, testnets otherwise (`CRYPTO_PAY_NETWORK` overrides, but `testnet` is ignored under production unless `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD=true`, and the local chain 31337 never exists in production); never both. A chain is offered only with an RPC and a receiving address. Every chain's default RPC is checked in (`publicRpc` in `crypto-chains.ts`); on a mainnet it is always the chain operator's own official endpoint (Circle, Coinbase, Offchain Labs, Ava Labs, Tempo, Robinhood, Monad), never a third-party node, because the RPC's receipt decides whether an item is given. `CRYPTO_PAY_RPC_<chainId>` or the funding variable overrides it, e.g. with a keyed provider for higher rate limits. Mezo (MUSD) is left out.
   - Receiving: purchases are commerce and go to the Token Tails treasury, public addresses in `treasury.public.ts` (all `null` today, so nothing is live) or env. A wallet Token Tails holds for a shelter (`TOKEN_TAILS_HELD_WALLETS`, `SHELTER_HELD_WALLETS`) is never accepted as a treasury.
   - Order binding: an `amount`-bound option is the price plus a unique tag of 1 to 9,999 base units, reserved per chain, token and amount by the unique partial index `amount_reserved` until 2 hours after expiry, or 24 hours once the order had a confirm call (`confirmAttemptAt`). `createOrder` refuses (503) while that index is missing. One buyer gets one open order per item (handed back, renewed when under 3 minutes are left) and at most 3 open orders, so one account cannot hold the 9,999 tags of a price. Tempo uses TIP-20 `transferWithMemo` with the 32-byte memo `tt:<orderId>`; the shelter split route uses the split's own memo `tt:cat:<16 hex>`. Memo-route amounts carry no tag, so a memo option is matched by its memo only, never by a plain `Transfer` of the same amount (which TIP-20 also emits): otherwise another buyer could claim the payment.
   - Verification (`crypto-evm.ts` `checkPayment`, read-only RPC in `crypto-chain-reader.ts`, no key): the receipt succeeded, has the chain's confirmations (1 on Arc, Avalanche and Tempo, 12 on the rollups), its block is not older than the order (2 minutes of skew), and a log emitted by the option's token contract pays the option's recipient (exact amount, or memo and at least the price; the split route also needs the split's `DisbursementBatch` with the memo). A payment mined up to 2 hours after `expiresAt` (`PAYMENT_GRACE_MS`, within the binding's hold) is granted normally; a shelter cat is checked for sale again first (`NOT_FOR_SALE` refund otherwise). Later, the order is `LATE` and the payment `FAILED_GRANT` with `refund: 'due'` (`PAID_AFTER_EXPIRY`); a `LATE` order still takes a payment mined in time. An amount-bound transfer up to 5% short is reported `UNDERPAID` (never accepted) so support can find exchange withdrawals. A second, different payment for a paid order is refunded the same way (`DUPLICATE_PAYMENT`).
   - Exactly once: the `Order` is created with `hash = evm:<chainId>:<txHash>` under `hash_unique`, the checkout moves `OPEN|EXPIRED -> PAID` atomically, and `grantStartedAt` is claimed once before granting; the spend is counted once (`spendCounted`). A replayed confirm returns the stored result; a `PAID` order without a result answers 202 `CONFIRMING`. A grant that died is finished by `recoverStuckGrants` (every 5 minutes, leased job `crypto-grant-recovery`, also `POST /payments/crypto/recover-grants`): it copies a COMPLETE or FAILED_GRANT `Order`, treats a shelter cat the buyer holds as delivered, or grants again under a new lease (a pack adopted in the single write before the crash can get a second cat).
   - EURC, never a live feed: with no `CRYPTO_PAY_EURC_PER_USD` (or `1`) it is a fixed euro price, 1 EURC per USD of the price (`fx.source: 'fixed'`, no date; the client labels it so). A set rate needs `CRYPTO_PAY_EURC_FX_DATE`, must be 0.5 to 2, and stops EURC sales when more than 30 days old (`fx.source: 'dated'`). `priceUsd`, spend and the affiliate credit use the USD price.
   - Shelter cats (`src/shelter/shelter-cat-sale.service.ts`): any unowned rescue cat of `GET /cat/sale` whose blessing is not `ADOPTED` or `HEAVEN`, and that is not a starter, at a fixed $5 (`SHELTER_CAT_MIN_PRICE_CENTS`; the old `SHELTER_CAT_PRICE_CENTS` override is gone so the client copy cannot drift), never discounted, granted as a `COMMON` copy (origin `adopt`) through `PurchaseGrantService.grantShelterCat`. Also sold by Stripe (`entityType: 'CAT'`): a card sale records the same treasury-route share as a crypto one (`CryptoCheckoutService.recordCardShelterShare`, a `rail: 'card'` row in `cryptocheckouts`, unique per PaymentIntent; one rule, `treasuryShelterShare`). The shelter share, for shelters in `CRYPTO_PAY_SPLIT_SHELTER_IDS` (default Pink Paw):
     - before the handover (`SHELTER_HANDED_OVER` not `true`): the buyer pays the treasury; on a completed sale the share (`CRYPTO_PAY_CAT_SHELTER_BPS` of the price, rounded up; unset: 5000, Pink Paw's 50% decided by the founder on 2026-10-04 (`DEFAULT_CAT_SHELTER_BPS`); set but malformed: `undecided`, nothing sent) is `due`. `CryptoShelterShareService` (every 5 minutes, leased, only with `CRYPTO_PAY_SHELTER_SHARE_ENABLED=true`; `POST /payments/crypto/shelter-share/run` runs it once) sends it from the hot wallet float through `ShelterSplit.disburse(amount, 'tt:cat:<16 hex>')` on `SHELTER_CHAIN_ID`, approving the split once. The split pays shelters only their registered bps (the rest goes to its own treasury), so a confirmed row stores the receipt's `DisbursementBatch.toShelters` as `amountBase` / `amountUsdCents` (what was sent is `sentBase`); a mined send without that event for its memo is `failed` for a person. A row left `sending` with no hash for 30 minutes (a crash before signing) goes back to `due`. Token Tails' own money reaching the wallet it holds for the shelter: evidence tier `onchain-custodial`, disclosed like treats and the match. The tier is read from the receipt (`shareTier`): a share is `onchain-shelter-held` only when `SHELTER_HANDED_OVER=true` and none of the split's `Disbursed` events for its memo paid a held wallet (`TOKEN_TAILS_HELD_WALLETS`, `SHELTER_HELD_WALLETS`), so a share sent just before the handover and settled after it stays custodial. A signed share is never re-sent while its fate is unknown; a reverted one is retried at most twice;
     - after the handover: on chains where `CRYPTO_PAY_CAT_SPLITS` (default the main split, USDC) has the shelter's split, and on a mainnet only when `ShelterClaimService.publicGivingVerified` passes, the buyer pays the split directly (`approve`, then `disburse` with the order memo); the split pays the shelter its on-chain share and the treasury the rest in the same transaction. Evidence tier `onchain-shelter-held`. Other chains keep the treasury route, and the keeper's shares are then `onchain-shelter-held` too.
     The impact indexer sees the keeper's and the buyers' split payouts as ordinary ShelterSplit events with a `tt:cat:` memo, in the `direct` bucket (a `cat` bucket is a follow-up in `src/impact`, not done here).
   - E2E: `funding/framework/tracks/a-build/e2e-crypto-pay/stack.sh all` (plain local anvil, test tokens, throwaway Mongo; 14 flows, including the 2-hour grace and a rounded payment reported UNDERPAID).
   - Multi-chain and goal E2E: `funding/framework/tracks/a-build/e2e-pay-goal/stack.sh all` (two local anvil chains, 31337 and an empty chain started with the Arc testnet id 5042002, test tokens, throwaway Mongo; `E2E_UI=1` adds the client screens). Packs in USDC and EURC on both chains, each granted once under parallel and replayed confirms; a shelter cat before the handover (keeper share to the held wallet) and after it (straight into the split); the on-chain rotation and sweep; receipts, `orders` rows, `shelterpayoutevents` rows; `GET /shelter/goal/C-001` after every money move (the harness swaps the C-001 campaign for the local wallets via `E2E_GOAL_CAMPAIGN`). Arc's native-coin USDC and its `0xff…fe` system Transfer log cannot run on anvil, so sponsored treats (native `donate`) are not counted there; `shelter-goal.spec.ts` covers that log.

Pack rarity odds are in `src/shared/utils/content.utils.ts`. Discount codes map to a user's
`discount` field; the code owner earns a 20 percent affiliate credit on completed purchases.

There is no Apple or Google in-app purchase receipt verification.

### Shelter gifts on Arc

`src/shelter/onchain/` (endpoints in `docs/API.md`). Treats and the x402 card are on by default; each
needs a recorded split, and treats also the hot wallet key (see Configuration below). The relay and
the match are off by default.

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
  SHELTER_CHAIN_ID=5042002                   # the main chain; its network class picks the other chains
  SHELTER_DONATE_PRIVATE_KEY=<hot wallet>    # the one key, a secret
  ```

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
  every split recipient is a `rotated`, shelter-held claim (task 3's per-chain claim), so public money
  never lands in a wallet Token Tails holds. Relay and match still need their own per-chain flag.

  What this means in production: the live status shows main chain 5042 with no split
  (`not-deployed`), and `wallet.config.ts` records no mainnet split, so nothing opens on deploy. The
  moment the wave records the Arc mainnet split and that `wallet.config.ts` is committed and deployed,
  treats start on Arc mainnet automatically if the backend holds `SHELTER_DONATE_PRIVATE_KEY` and that
  wallet holds USDC; no flag is flipped first. Mainnet x402, relay and match stay closed until the
  shelter's own wallet is claimed and rotated on that chain.

  Emergency off (undocumented elsewhere on purpose): `SHELTER_DONATE_ENABLED=false`,
  `SHELTER_X402_ENABLED=false`, `SHELTER_HANDED_OVER=false` (mainnet relay, match, x402),
  `SHELTER_AUTO_CHAINS=off` (main chain only).

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

  A mainnet treat pays the split's recipients, which before the handover is the wallet Token Tails
  holds for Pink Paw, from Token Tails' own float, like the Arc treat; it is not public money, so it is
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
- Showcase shelter: Pink Paw (Rožinė pėdutė). Its wallet is created and held by Token Tails on its behalf
  until handover. The contract addresses come from `wallet.config.ts`: every testnet split is recorded
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
  (preceded by the emergency off `SHELTER_HANDED_OVER=false` in `publicGivingAllowed`) requires, on chain, that every wallet in
  `split.preview(1 USDC).wallets` is a `rotated` claim and none is a Token Tails wallet, so public money
  cannot reach a wallet Token Tails still holds through these services. Keep the hot wallet float small:
  it now pays relay gas and the match.
- Decision 2026-10-05 (founder, funding/framework/tracks/a-build/README.md): the mainnet wave deploys
  DonateRouters by default, before the handover. The router is ownerless and public, so once it exists
  anyone can call `donateNative` or submit a signature themselves, and no backend gate can stop that
  money reaching the shelter wallet Token Tails still holds (ShelterSplit's `donate`/`disburse` were
  always public too). The app keeps every public route closed until the claim; a gift that arrives
  through a router or the split before rotation is disclosed as held by Token Tails on the payouts page,
  appears in the impact indexer's rows, and is forwarded to the shelter at handover (gate G12).
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
  blocks, sepolia.base.org 1,000, mainnet.base.org 2,000), through the chain's dedicated log RPC while
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
| Treat reconcile (`shelter-donate-reconcile`) | `src/shelter/onchain/shelter-donate-reconcile.service.ts` | Every 2 minutes | Settles SENT gifts by receipt (see "Shelter gifts on Arc"); then settles relayed wallet gifts, scans RouterDonation logs, sends and settles matches, and flushes the router (each step only when configured). |
| Payout indexer (`impact-indexer`) | `src/impact/impact-indexer.service.ts` | Every 5 minutes | Indexes ShelterSplit payout logs on every served chain of the main chain's class. A recorded split starts at its deploy block; an env-only `SHELTER_SPLIT_ADDRESS` stays idle until `SHELTER_SPLIT_FROM_BLOCK` is set. |
| Impact snapshot (`impact-snapshot`) | `src/impact/impact.service.ts` | Hourly at :07 | Writes the hour's `impactsnapshots` row and the optional CDN mirror. |
| Snapshot compaction (`impact-compact`) | `src/impact/impact.service.ts` | Daily 00:20 | Keeps one row per day for snapshots older than 48 hours. |
| Paw settlement (`paw-settlement`) | `src/impact/paws.service.ts` | Daily 00:30 UTC | Settles yesterday's paws (send only with `PAWS_SETTLEMENT_ENABLED`). |
| Paw reconcile (`paw-reconcile`) | `src/impact/paws.service.ts` | Every 10 minutes | Settles sent paw transactions and catches up missed days (3 days back). |
| Give sweeper (`rescue-goal-pledge-sweeper`) | `src/rescue-goal/rescue-goal-pledge.service.ts` | Every minute | Rolls stuck gives forward or refunds them; re-runs cancel refunds. |
| Goal count (`shelter-goal-scan`) | `src/shelter/goal/shelter-goal.service.ts` | Every minute | Advances the C-001 inflow scan: up to 40 `eth_getLogs` windows of 9,999 blocks (the public Arc RPC refuses 10,000), 300 ms apart, counting Transfer logs to the campaign wallets into `sheltergoalcursors` (compare-and-set per window). A view of `GET /shelter/goal/:id` also nudges it, at most once a minute. On unless `SHELTER_GOAL_SCAN=off`; needs no key. |

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
| Impact (plan F7) | `SHELTER_SPLIT_FROM_BLOCK` (first block to index on the main chain; unset: the recorded split's deploy block, or idle for an env-only `SHELTER_SPLIT_ADDRESS`), `SHELTER_LOG_CHUNK` (blocks per `eth_getLogs`, default 2000, 1 to 10000), `IMPACT_INDEXER_MAX_CHUNKS` (calls per run, default 25), `IMPACT_PAWS_SENDERS` (extra addresses allowed to settle paws), `IMPACT_CDN_ENABLED` (default off; mirrors `impact.json`), `IMPACT_CDN_OBJECT_KEY` (default `impact/impact.json`), `IMPACT_CDN_BUCKET` (default `DO_SPACES_NAME`) |
| Paws (plan G4) | `PAWS_SETTLEMENT_ENABLED` (default off; `true` lets the nightly settlement send), `PAWS_DAILY_BUDGET` (wei, default 1 USDC), `PAWS_AMOUNT` (wei per paw, default 0.01 USDC) |
| Rescue Goals (plan G5) | `RESCUE_GOAL_PLEDGES` (`off` is a kill switch for gives) |
| Specs only | `MONGO_IT_URI`, `IDENTITY_SPEC_MONGO_URL`, `LIVE_SPEC_MONGO_URL`, `HEIST_BENCH`, `HEIST_BENCH_ROUNDS`; migrations read `MIGRATION_APPLY` (and `MIGRATION_BACKFILL_MISSING`) |
| Encryption | `INVALIDATE_CACHE_SECRET` (despite the name, this seeds the AES key for custodial wallet secrets; rotating it makes stored secrets unreadable) |
| AI | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| Storage | `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `DO_SPACES_CDN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (in the example file, unused in code), optional `STELLAR_TREASURY_ADDRESS` and `STELLAR_USDC_ISSUER` (default to the public values in `src/web3/stellar-payment.ts`) |
| Crypto checkout | `CRYPTO_PAY_ENABLED` (default off), `CRYPTO_PAY_NETWORK` (`mainnet` or `testnet`; default `mainnet` under `NODE_ENV=production`), `CRYPTO_PAY_TREASURY` (one public treasury address for every chain) and `CRYPTO_PAY_TREASURY_<chainId>` (per chain; both override `src/payments/crypto/treasury.public.ts`), `CRYPTO_PAY_RPC_<chainId>` (optional override; else the funding variable such as `RPC_BASE_MAINNET`; else the checked-in official RPC of the chain), `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD` (needed for `CRYPTO_PAY_NETWORK=testnet` under production), `CRYPTO_PAY_ORDER_TTL_MIN` (5 to 1440, default 30), `CRYPTO_PAY_EURC_PER_USD` (EURC per USD of price; unset: a fixed euro price, 1 EURC per USD) and `CRYPTO_PAY_EURC_FX_DATE` (required with a set rate; EURC stops after 30 days), `CRYPTO_PAY_CAT_SHELTER_BPS` (shelter share of a shelter cat on the treasury route; unset: undecided, nothing sent), `CRYPTO_PAY_SPLIT_SHELTER_IDS` (default Pink Paw), `CRYPTO_PAY_CAT_SPLITS` (`chainId:TOKEN:0xsplit,...`; default the main split for USDC), `CRYPTO_PAY_SHELTER_SHARE_ENABLED` (default off), local E2E only: `CRYPTO_PAY_LOCAL_USDC`, `CRYPTO_PAY_LOCAL_EURC` (chain 31337, testnet mode). `STELLAR_PACKS_ENABLED` (`true` reopens Stellar packs; rollback only), `STELLAR_PACKS_SUNSET_AT` (ISO time; Stellar pack payments before it are still granted, later ones recorded for a refund; default `2026-10-11T00:00:00Z`) |
| Shelter gifts (all chains) | Required: only `SHELTER_CHAIN_ID` and `SHELTER_DONATE_PRIVATE_KEY`; everything else in this row and the next three is an optional override. `SHELTER_CHAIN_ID` (default `5042` mainnet; `5042002` testnet), `SHELTER_ARC_RPC_URL` (defaults to `https://rpc.mainnet.arc.io` or `https://rpc.testnet.arc.io` by chain), `SHELTER_SPLIT_ADDRESS` (optional override; default the main chain's split in `wallet.config.ts`), `SHELTER_DONATE_PRIVATE_KEY` (server hot wallet; keep only a small float of USDC on it), `SHELTER_DONATE_AMOUNT_WEI` (default 0.01 USDC), `SHELTER_DONATE_DAILY_BUDGET_WEI` (default 1 USDC), `SHELTER_X402_PRICE_WEI` (default 0.01 USDC) |
| Wallet gifts (F2) | `SHELTER_ROUTER_ADDRESS` (DonateRouter, empty until deployed), `SHELTER_ROUTER_FROM_BLOCK` (first block of the RouterDonation scan; unset: 5000 blocks behind the head on the first run), `SHELTER_RELAY_ENABLED` (default off), `SHELTER_RELAY_DAILY_TX` (default 50), `SHELTER_RELAY_MIN_USDC` (default 0.01), `SHELTER_RELAY_MAX_USDC` (default 100), `SHELTER_HANDED_OVER` (`true` after the Pink Paw key rotation: crypto checkout tiers and the `exact` x402 scheme; mainnet relay, match and onchain-receipt x402 follow the per-chain claim check instead), `SHELTER_MATCH_ENABLED` (default off), `SHELTER_MATCH_PER_GIFT` (default 1 USDC, `DEFAULT_MATCH_PER_GIFT`), `SHELTER_MATCH_MIN_GIFT` (default 0.10), `SHELTER_MATCH_DAILY` (default 2 USDC), `SHELTER_MATCH_POOL` (default 10 USDC in total), `SHELTER_TREASURY_ADDRESS` (optional; refused as a claimed shelter wallet, never matched), `SHELTER_CLAIM_ALLOWED_WALLETS` (comma-separated; the only wallets `POST /shelter/claim` accepts; empty refuses all), `SHELTER_MATCH_EXCLUDE` (comma-separated team wallets: never matched, never counted as public wallet gifts), `SHELTER_RELAY_IP_PEPPER` (secret HMAC key for the stored relay IP hash; unset stores none), `SHELTER_HELD_WALLETS` (comma-separated wallets Token Tails holds for a shelter, added to the built-in `TOKEN_TAILS_HELD_WALLETS` (Pink Paw's current wallet): never accepted as a shelter claim, a public-giving recipient or an x402 `payTo`). USDC amounts are decimal strings; a malformed value falls back to the default |
| Try-it testnet (F3) | `SHELTER_TRY_CHAIN_ID` (a testnet id other than `SHELTER_CHAIN_ID`, e.g. `5042002`; unset: off), `SHELTER_TRY_RPC_URL`, `SHELTER_TRY_ROUTER_ADDRESS`, `SHELTER_TRY_ROUTER_FROM_BLOCK`, `SHELTER_TRY_SPLIT_ADDRESS`, `SHELTER_TRY_TREASURY_ADDRESS`, `SHELTER_TRY_PRIVATE_KEY` (a separate testnet-only hot wallet; never falls back to the main key), `SHELTER_TRY_RELAY_ENABLED`, `SHELTER_TRY_MATCH_ENABLED` (both default off). A second relay and match next to the main chain (`readTryShelterConfig`), so the payouts page's testnet block is gasless and matched while treats, claims and the campaign stay on `SHELTER_CHAIN_ID`. No treats, no x402, no claims there; caps and counters are per chain. |
| Multi-chain relay | `SHELTER_RELAY_CHAINS` (comma-separated chain ids, e.g. `84532,421614`; unset: the relay serves `SHELTER_CHAIN_ID`, the try-it testnet and the `wallet.config.ts` chains of the main chain's class, each only with its own relay flag). Per chain: `SHELTER_CHAIN_<id>_RPC_URL` (default: the chain's public RPC), `SHELTER_CHAIN_<id>_SPLIT_ADDRESS`, `SHELTER_CHAIN_<id>_ROUTER_ADDRESS`, `SHELTER_CHAIN_<id>_ROUTER_FROM_BLOCK`, `SHELTER_CHAIN_<id>_KEY_ENV` (the NAME of the variable holding that chain's hot wallet key, gas only; a testnet never takes the `SHELTER_DONATE_PRIVATE_KEY` value), `SHELTER_CHAIN_<id>_RELAY_ENABLED`, `SHELTER_CHAIN_<id>_RELAY_DAILY_TX` (daily budget), `SHELTER_CHAIN_<id>_MATCH_ENABLED`, `SHELTER_CHAIN_<id>_TREASURY_ADDRESS` (`readRelayChainConfigs`). Treats on a picked network (the give page's chips): `SHELTER_CHAIN_<id>_TREAT_ENABLED` (`true` lists the chain in `GET /shelter/donate/status` `chains` and lets `POST /shelter/donate {chainId}` pay there; needs `SPLIT_ADDRESS` and `KEY_ENV`, whose wallet holds the token float plus gas), `SHELTER_CHAIN_<id>_TREAT_AMOUNT` (decimal token amount, default `0.01`), `SHELTER_CHAIN_<id>_TREAT_DAILY_BUDGET` (default `1`; a budget per chain), `SHELTER_CHAIN_<id>_TREAT_COIN` (optional label; default USDC, `USDC.e` on Tempo 4217, `USDG` on Robinhood 4663, `pathUSD`/`mUSDC` on their testnets). x402 agent cards there: `SHELTER_CHAIN_<id>_X402_ENABLED` (default on for a `wallet.config.ts` chain, off for a chain named only here; needs a split, no key; a mainnet waits for the per-chain claim check like the main chain), `SHELTER_CHAIN_<id>_X402_PRICE` (decimal in the chain's payment coin, default `0.01`, scaled by the token's on-chain decimals). Built-in public RPCs and explorers cover Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood and Monad (143 `https://rpc.monad.xyz`, 10143 `https://testnet-rpc.monad.xyz`, explorer MonadVision). The token must have 6 decimals (all seven chains' payout tokens do). A testnet entry may share the main key only when `SHELTER_CHAIN_ID` is itself a testnet. The main chain and the try-it chain are never repeated. A mainnet entry still waits for the on-chain claim check (and stays shut under `SHELTER_HANDED_OVER=false`). Only router gifts (EIP-3009) can be relayed; a gift straight into a ShelterSplit (Tempo, Robinhood, any chain without a router) is sent and paid for by the donor's wallet. |
| Goal count | `SHELTER_GOAL_SCAN` (`off` stops the C-001 scan; default on), `SHELTER_GOAL_RPC_URL` (default: the campaign chain's public RPC, `https://rpc.mainnet.arc.io` for C-001). The counted wallets come from the facts (`campaign.wallets`), never from the environment |
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
- Shelter rail: set `SHELTER_CHAIN_ID` and `SHELTER_DONATE_PRIVATE_KEY` only. Split, router and first
  blocks come from `wallet.config.ts`; after the mainnet wave run `fund a:ingest` (or
  `fund a:backend-deployments`), commit the regenerated file and deploy. `SHELTER_SPLIT_ADDRESS`,
  `SHELTER_ARC_RPC_URL` and `SHELTER_SPLIT_FROM_BLOCK` are overrides only; `PAWS_SETTLEMENT_ENABLED=true` only after that and a funded
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

- Open (crypto checkout, 2026-10-04): nothing is live until a treasury address is set per chain
  (`src/payments/crypto/treasury.public.ts` or `CRYPTO_PAY_TREASURY*`); the funding wallet list still has
  `shelter-split-treasury: null`. `CRYPTO_PAY_CAT_SHELTER_BPS` is a founder decision (it is not the
  `purchase_share` pledge, C-002, which stays off every surface): until it is set, a shelter cat sold on
  the treasury route records its share as `undecided` and sends nothing.
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
  `SHELTER_HANDED_OVER` at settle time, so a share sent to the held wallet just before the handover and
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
- The Legendary pack price disagrees: the backend table and the odds comment in `content.utils.ts` say $350, the client pack card shows $400. Stripe and the crypto checkout charge $350. Since 2026-10-04 the client checkout summary and crypto quote show the server price from `GET /payments/crypto/config` `prices` ($350), so only the pack card differs. A human must pick one price and update the other copy (DEVELOPMENT.md "Pack prices").
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
- Added (2026-10-04, F4): the route also offers the standard x402 `exact` scheme (v1, EIP-3009 USDC) when
  `SHELTER_X402_EXACT_ENABLED=true`. `payTo` is the shelter's own wallet (`SHELTER_X402_EXACT_PAYTO`; the
  ShelterSplit address is refused), a facilitator verifies, settles and pays the gas, and Token Tails never holds
  the money. Variables: `SHELTER_X402_EXACT_NETWORK` (x402 name, e.g. `base-sepolia`), `_CHAIN_ID` (needed only
  for unknown names), `_ASSET`, `_ASSET_NAME`/`_VERSION` (EIP-712 domain, default `USDC`/`2`), `_PRICE` (USDC,
  default `0.01`), `_RPC` (optional: re-reads the settled Transfer and checks the token domain at first use),
  `SHELTER_X402_FACILITATOR_URL` (default `https://x402.org/facilitator` on testnets; required on mainnet). An
  unknown or mainnet network is offered only with `SHELTER_HANDED_OVER=true`. The authorization (signer + nonce)
  is claimed in `x402nonces` as `exact:<chainId>:<from>:<nonce>` before the facilitator is called, so a replay is
  refused; settled payments are written to `x402usedtxs` with `scheme: 'exact'`. Code: `src/shelter/onchain/x402-exact.ts`.
  Limit: facilitators that need an API key (CDP mainnet) are not wired yet.
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
- While Token Tails holds Pink Paw's wallet, public payments to it are custodial (MiCA caution). The code
  enforces it: a mainnet onchain-receipt offer needs `publicGivingVerified` for that chain (every split
  recipient a rotated, shelter-held claim). The standard `exact` scheme keeps its own
  `SHELTER_HANDED_OVER=true` gate (`x402-exact.ts`).
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
