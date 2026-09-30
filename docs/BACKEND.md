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
| Rate limiting | `@nestjs/throttler` as a global `APP_GUARD` (`src/shared/guards/app-throttler.guard.ts`): 300 requests per minute per IP by default, tighter `@Throttle` limits on paid image routes |
| Migrations | `migrate-mongo` |

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
Mongoose models, repositories and external SDKs, never connect to MongoDB, and do not read a local
env file.

## Bootstrap

`src/main.ts` does the following:

- Creates the app with `rawBody: true`.
- Mounts `express.raw()` on `/image/webhook` before the JSON parser so Stripe signature verification can read the untouched body.
- Applies `express.json({ limit: '50mb' })` to everything else.
- Registers a global `ValidationPipe({ transform: true })`. There is no global `whitelist`: most `@Body()` types are undecorated Mongoose schema classes that it would strip to `{}`, and interface or inline body types are never validated. Routes with a decorated DTO add a strict route-level pipe (`profileWritePipe` on the profile write routes, `liveGamePipe` on `POST /user/catbassadors/live`). Everywhere else unknown body fields still pass through, so search handlers pass `pickSearchParams(params)` (`src/common/validators.ts`: `page`, `perPage`, `sort` only) to `BaseRepository.find`, never the raw body.
- Sets Express `trust proxy` from `TRUST_PROXY` when it is set (`src/shared/trust-proxy.ts`), so the throttler sees client IPs behind a proxy.
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
| `src/user/` | Users, profiles, leaderboards, daily check-in, referrals, codex, airdrop progression, game score submission, auth strategies. |
| `src/cat/` | Cat catalog, adoption, staking, feeding, NFT metadata, exchange-rate proxy. |
| `src/blessing/` | Shelter "blessing" records (a real rescued animal) and the AI cat generated from each. |
| `src/shelter/` | Partner shelters and their generated Stellar wallets. |
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

1. `AuthGuard('appauth')` invokes the custom Passport strategy in `src/user/strategies/`.
2. The strategy looks at the first two characters of the token.
   - Prefix `fb`: the rest is a Firebase ID token, verified with Firebase Admin.
   - Anything else, including an empty token or the string `null`: the request fails with 401. There is no fallback lookup and no user is created.
3. The user is looked up by email from the verified Firebase token and is created on first sight. Creation generates a custodial Stellar keypair, encrypts the secret, and grants a starter cat.
4. The full user document becomes `request.user`. The `@USER_ID()` decorator reads its id.

Roles are a numeric ladder on `User.permission`: `USER=1`, `MODERATOR=2`, `EDITOR=3`,
`MANAGER=4`, `ADMIN=5`. `PermissionGuard(n)` in `src/shared/guards/permission.guard.ts` passes
when the caller's level is at least `n`. It is always composed after the auth guard.

The Stripe webhook is the only inbound call authenticated another way: signature verification
with `STRIPE_WEBHOOK_SECRET`. Cron jobs run in-process and are not HTTP triggered.

## Domain behaviour

### Cats, blessings, shelters

- A **blessing** is a rescued animal registered by a shelter user. Creating one calls OpenAI to classify the cat's look and write a short rescue story, then Gemini to paint an avatar, and finally creates the linked **cat** document.
- A **cat** has an ability type (ice, electric, fire, wind, dark, water, grass, sand, fairy, stellar), a tier (common, rare, epic, legendary), sprite and card art on the CDN, an owner, an optional blessing, and an `EAT` status.
- **Blueprint** cats are templates. Adopting a cat clones it into a new document owned by the caller with `packed: true` until the user opens the pack.
- Staking locks a cat for one week; claiming the reward pays $TAILS by tier.
- Feeding fills `EAT` to the maximum and pays one $TAILS. Only the cat's owner can feed it. The owner check and the `EAT` cap sit in the filter of one conditional update, so concurrent requests pay at most once per fill. A nightly cron empties every cat.
- Shelters are slugified and receive a generated Stellar wallet on creation.

### Economy

**$TAILS** (`User.tails`) is the soft currency. It is only ever earned and used as a threshold or
leaderboard metric. There is no spend endpoint. Reward constants live in
`src/shared/constants/rewards.ts`.

| Source | Amount |
|---|---|
| Daily check-in | Weighted random roll: mostly 1, 5, 10, or 25, with rare 50, 100, 250, or 1000 |
| Referral (both sides) | 100 |
| Feeding a cat | 1 |
| Staking reward | 10 without blessing, else 100, 500, 2000, 10000 by tier |
| Quests and contests | Per quest table, or 100 for camp mystery boxes |
| Weekly top 200 cron | 200 |
| Codex monthly cron | Sum of codex phases times 300 |
| Airdrop tier claims | 2500, 7500, 20000, 50000 with a legendary bonus multiplier |

**Catnip** (`User.catnipCount`) is derived rather than granted. It is the capped sum of per-level
best scores from Catnip Chaos and Paw Match, recomputed on every score submission by
`src/user/utils/catnip-accounting.ts`. Level caps live in `src/game/game.schema.ts`.
Leaderboards drop anyone above the global cap as a cheat filter.

**Loot boxes** (`User.boxes`) are granted by quests and giveaways but are never consumed on the
server.

**Codex** tracks a monthly "$TAILS guard" phase anchored to 00:00 UTC on the 9th of each month. A
phase is earned when seven monthly counters all meet their thresholds. The counters reset at
23:00 UTC on the 8th (see Scheduled jobs).

**Airdrop progression** in `src/user/airdrop-progression.ts` is a pure function that turns cat
tiers, quests, streak, $TAILS, and purchases into a collectible level, eligibility flags, four
claimable tiers, five daily challenges, and a milestone ladder.

### Games

The backend is a score sink. All gameplay runs on the client. Game types are `SHELTER`, `HOME`,
`PURRQUEST`, `CATBASSADORS`, `CATNIP_CHAOS`, `PIXEL_RESCUE`, and `MATCH_3`.

The single ingestion endpoint is `POST /user/catbassadors/live`. The body goes through
`LiveGameDto` and the strict `liveGamePipe` (`src/user/dto/live-game.dto.ts`), so unknown fields are
a 400. `resolveLiveGame` (`src/user/utils/live-game.ts`) accepts only the scored types in
`scoredGameTypes` (`CATNIP_CHAOS`, `PIXEL_RESCUE`, `MATCH_3`), checks `level` and the per-level cap
below, and builds the stored row from the validated fields only, with `platform` defaulting to
`web`. Only then does the handler write the immutable `Game` row and update per-level best-score
arrays with `$max`. The route is limited to 30 saves per minute per player
(`LiveGameUserThrottleGuard` in `src/user/live-game-throttle.guard.ts`, after auth) and 120 per
minute per IP, loose enough for players sharing a carrier-NAT, school or office address. A 429
carries `Retry-After`, which CORS exposes so the client can retry once:

| Game | Levels | Stored on user | Cap |
|---|---|---|---|
| Catnip Chaos | 97 (`01`, then `11` to `166`) | `catnipChaos[]` | 420 for level `01`, 10 for every other level |
| Pixel Rescue (season event) | 14 | `seasonEvent[]` | 420 per level |
| Paw Match (Match 3) | 30 | `match3[]` catnip and `match3Score[]` raw score | Catnip per level from a formula capped at 85; score capped at one million |

Leaderboards: global $TAILS top 50, catnip top 50, per-level Paw Match with a 15 second
in-process cache, and a catbassadors top 10.

### Payments

Three flows, all granting either a portrait-derived cat or a pack cat on success:

1. **Stripe Checkout** for portraits (`digital`, `print`, `canvas`) in `src/image/image.controller.ts`. The amount comes from the server price table in `src/payments/price-table.ts`; the client `amount` is ignored. A pending `Order` is created with the session id as `hash`. The webhook is the only grant path: it checks the session is paid, in USD and at least the table price, moves the order from `PENDING` to `COMPLETE` atomically (a redelivered event grants nothing), then increments spend counters, sends a SendGrid confirmation, and creates the blessing and cat.
2. **Stripe PaymentIntents** for in-app purchases in `src/web3/web3.controller.ts`, through `src/payments/stripe-payment.service.ts` (platform fix 2). `create-payment` charges the table price minus a verified discount code and ignores the client `amount`. `confirm-payment` retrieves the intent from Stripe and checks it belongs to the caller, succeeded, is in USD and covers the server price, then claims the intent id atomically (upsert on `hash`), so a replayed confirm grants nothing. Stripe and database errors are logged and answered with a fixed message. No webhook covers PaymentIntents yet; adding `payment_intent.succeeded` as the only grant path is a follow-up.
3. **Stellar** payments through `POST /web3/confirm`. The controller accepts only `IMAGE`, `PACK` (with a valid pack `id`) and `LOOT_BOX` (with no `id`), and refuses anything else before an order exists. It lowercases the hash, creates a `PENDING` order with it, then `Web3Service.validatePrice` loads the transaction and its operations from Horizon (mainnet when `IS_PROD`, else testnet) and requires: the transaction succeeded; it pays the treasury (`STELLAR_TREASURY_ADDRESS`, default the public receiving account also hardcoded in `client/web3/contracts.ts`); in the order's asset (native XLM, or USDC from `STELLAR_USDC_ISSUER`, default Circle's issuer; USDT is refused); and the sum of those payments covers the server price. The price is the catalogue price of the order's item (`src/web3/order-catalogue.ts` over `src/payments/price-table.ts`, plus the client-only `LOOT_BOX` at $1 when it names no `id`), less a discount only when the code belongs to a user. A loot box is granted with common odds and no pack type. The client's `price` is ignored. XLM is valued at the live Binance XLMUSDC rate (the source of `GET /cat/rates`, from which the client quotes `ceil(usd / rate)`) with a 3 percent tolerance; if the rate is unavailable the request fails with 503 rather than falling back to the static rate. The hash must be the payment's canonical key: Horizon resolves a fee-bump transaction by its outer and its inner hash, so the verifier refuses an inner hash (`NOT_CANONICAL_HASH`) and refuses an outer hash when another order holds the inner one (409). On success the order's `price` and `priceUsd` are overwritten with the verified amount, and `spent`, `monthSpent` and the 20 percent affiliate credit use that verified `priceUsd`. On any failure the order becomes `FAILED` and its hash moves to `failedHash`, so the payer can retry the same hash (for example once Horizon has indexed it). A hash can back only one order: `Order.hash` has the unique partial index `hash_unique`, and a duplicate returns 409. The flow has no memo, so the payment is not bound to the buyer (see known issues).

Pack rarity odds are in `src/shared/utils/content.utils.ts`. Discount codes map to a user's
`discount` field; the code owner earns a 20 percent affiliate credit on completed purchases.

There is no Apple or Google in-app purchase receipt verification.

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

All jobs use `@Cron` and are declared inside controllers.

| Job | Location | Schedule | Effect |
|---|---|---|---|
| Refresh traction counts | `src/app.controller.ts` | Daily 10:00 | Recompute users, cats, blessings, orders, and weekly buckets. Also runs at boot. |
| Reset daily check-in | `src/user/user.controller.ts` | Daily 01:00 | Set `canRedeemLives: true` for every user. |
| Reset user status | `src/user/user.controller.ts` | Daily 01:00 | Writes `status.EAT = 0` on users. The field is not in the user schema; likely a copy-paste of the cat job. |
| Weekly top rewards | `src/user/user.controller.ts` | Weekly | Top 200 by $TAILS receive 200 each. |
| Reset codex and monthly counters | `src/user/user.controller.ts`, logic in `src/user/codex-reset.ts` | Monthly, 23:00 UTC on the 8th (`0 0 23 8 * *`, `timeZone: 'UTC'`) | Pays codex guards, then zeroes the codex `month*` counters and clears claimed challenges and milestones. Runs one hour before the phase anchor, inside the two-hour codex freeze. Idempotent: the period (`YYYY-MM` of the phase that starts) is claimed atomically in the `jobruns` collection, so a second run or a second instance skips; runs more than 48 hours from an anchor are refused. `scripts/repair-codex-counters.js` (dry run by default) recomputes the purchase counters from orders. |
| Empty cat stomachs | `src/cat/cat.controller.ts` | Daily 01:00 | Set `status.EAT = 0` on every cat. |

## Environment variables

Names only. Copy `backend/.env.example` to `backend/.env` and fill in values.

| Group | Variables |
|---|---|
| Server | `PORT`, `IS_PROD`, `FRONT_END_URLS`, `MAIN_FE_DOMAIN`, optional `TRUST_PROXY` (proxy hop count or an Express `trust proxy` value; set it when the API runs behind a load balancer) |
| Database | `MONGODB_URI` |
| Auth | `FB_PRIVATE_KEY` (Firebase service account key), `ML_ACCESS_TOKEN` (unused guard) |
| Encryption | `INVALIDATE_CACHE_SECRET` (despite the name, this seeds the AES key for custodial wallet secrets; rotating it makes stored secrets unreadable) |
| AI | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| Storage | `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `DO_SPACES_CDN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (in the example file, unused in code), optional `STELLAR_TREASURY_ADDRESS` and `STELLAR_USDC_ISSUER` (default to the public values in `src/web3/stellar-payment.ts`) |
| Email | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (missing from the example file) |
| Print | `PRINTIFY_API_KEY` |
| Unused | `GTM_ID` |

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
large seed JSON out of git separately.

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
- The `top` parameter of the global leaderboard has no decorator, so HTTP callers always get 50 rows.
- Fixed (2026-09): the codex reset cron. The old expression `0 0 1 * * ` is five fields to `cron` 2.4, so it fired monthly at 00:00 server time on the 1st, not daily as this list used to say. That is eight days before the phase anchor on the 9th, with no explicit time zone and no guard against double runs. It now runs at 23:00 UTC on the 8th with a per-period guard.
- `CatService` is decorated with `@Controller('cat')` instead of `@Injectable()`.
- `Comment.text` is unique, so two users cannot post identical comment text anywhere.
- Stale indexes on `nftId` remain on the cat and blessing schemas.

Security:

- Firebase service-account identifiers other than the private key are hardcoded in the app module. Move them to environment variables and rotate.
- The retired Telegram bot tokens were hardcoded in the auth strategy until Telegram support was removed (2026-09). They remain in git history, so both bots must be revoked through BotFather.
- CORS falls back to `*` with credentials when `FRONT_END_URLS` is unset.
- No global `whitelist` on the validation pipe, and several handlers pass the raw body into `update()` (article, blessing, category, quest, shelter). `PUT /user/profile/:id` is fixed (only `ProfileWriteDto` fields), but a manager can still set any `permission` up to 5.
- Fixed (2026-09): search handlers spread the raw body into `BaseRepository.find`, which takes `searchObject`, `projection`, `pipelineStages`, `populate` and `collation`. On the public `POST /image/search` a `$lookup` stage into `users` returned every user document, including emails and encrypted Stellar secrets; category, quest and article search (public) and blessing, user and ticket search (signed-in) had the same hole. They now pass `pickSearchParams(params)`. Whether this was exploited cannot be told from the code; request logs, if any, would show POST bodies with `pipelineStages`.
- Fixed (platform fixes 1 and 2): Stripe Checkout and PaymentIntents charge the server price table, and `confirm-payment` is idempotent on the intent id. Stellar checks success, destination, asset and amount against the server price, `hash` is unique and canonical (fee-bump inner hashes are refused), and `spent`, `monthSpent` and the affiliate credit use the verified amount instead of the client `price`.
- Stellar payments carry no memo, so a transaction is not bound to its buyer. Anyone who sees a payment to the public treasury on-chain and confirms its hash before the payer does gets the item. Binding needs a client change (for example a memo with the user or order id) and a matching server check. `POST /web3/create`, which let any caller park an order on someone else's hash, was removed (2026-09).
- The Legendary pack price disagrees: the backend table and the odds comment in `content.utils.ts` say $350, the client pack modal shows $400. Stripe charges $350. A human must pick one and update the other copy.
- Stripe idempotency on the PaymentIntent id is race-safe across processes only once the `hash_unique` index on `Order.hash` (platform fix 1) is built. Mongoose builds it on startup, and the build fails while duplicate hashes exist, so run the order audit first; until then an in-process lock covers the single instance.
- Custodial Stellar secrets are encrypted with AES-128-CTR using a static salt. The decrypt path is never called.
- Rate limiting is global and tracks `req.ip`. Behind a load balancer, set `TRUST_PROXY` to the hop count, or all clients share one bucket of 300 requests per minute (a site-wide outage) and the per-IP route limits (120, 5 and 3 per minute) apply to everyone together. The hosting topology is not documented, so this must be confirmed before deploy. The NFT metadata routes (`GET /cat/nft/metadata`, `GET /cat/nft/:tokenId`) skip the throttler for marketplace crawlers. Not yet handled: the ISR pages `/cats/[cat]` and `/feed/[category]/[article]` fetch from the Next server's single IP on every uncached render, and carrier-NAT or office IPs share a bucket; consider allowlisting the Next server or raising the limit on those public GET routes.
- Fixed (2026-09): `GET /image/order/status` is public and returned the whole order (user id, wallet, payment hash, discount). It now returns `_id status entityType id image price` only. `confirm-payment` and portrait generation no longer echo Stripe, database or AI provider error text.

Operational:

- In-process caches (traction counts, Paw Match leaderboard) diverge across replicas.
- Reward paths swallow errors in empty `catch` blocks, so partial credits are possible.
- Several ObjectIds are hardcoded and must match the database: pack source shelters in the web3 controller, the portrait shelter in the cat service, promo codes in the cat controller, reward cats in the user schema.
- Admin one-off methods on `UserController` (give cats, give tails, give loot boxes) are triggered by uncommenting constructor lines.
- Codex reset deploy timing. The old cron (`0 0 1 * * `) fires at 00:00 server time on 2026-10-01. If the backend with the new job deploys after that, the new job pays guards and wipes the counters again at 2026-10-08T23:00Z (a double payout of sum(codex) times 300 $TAILS, and the Oct 1-8 counters lost). Deploy before 2026-10-01 00:00 server time. Otherwise run `scripts/skip-codex-cycle.js --period 2026-10` (dry run by default, `--apply` to write) before 2026-10-08T23:00Z so the new job skips that cycle.
- Feeding now requires `Cat.owner` to be the caller. Current creation paths set `owner`, but older cats may not, and their owners would get 403 and lose feed rewards. `scripts/audit-cat-owners.js` (read-only) counts users whose `cat` or `cats` point to a cat with a missing or different owner; if it is not zero, backfill `owner` with a reviewed script. The client's optimistic +1 $TAILS is not rolled back on 403 or 409.

Dead code: `PipelineGuard`, the `Roles` and `JWT_USER` decorators, `EncryptionService.decrypt`,
Freepik scraping helpers, `src/api/api.ts`, `src/user/users.ts` (a 1000-line hardcoded winner
roster), the whole `PrintifyService`, duplicated `weeklyCount()` in three repositories, and an
unimplemented `generateCatAvatar` stub at the end of the blessing controller.
