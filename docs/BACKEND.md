# Backend (`backend/`)

The backend is a single NestJS 9 service backed by MongoDB through Mongoose 6. It authenticates
users through Firebase or Telegram, stores cats, blessings, shelters, orders, and game scores,
generates AI art, takes payments through Stripe and Stellar, and runs a handful of cron jobs.

Companion docs: [API.md](API.md) for the endpoint reference, [DATA_MODEL.md](DATA_MODEL.md) for
the schemas, [ARCHITECTURE.md](ARCHITECTURE.md) for how the clients use it.

## Stack

| Item | Value |
|---|---|
| Runtime | Node.js (developed on 22.x), NestJS 9, TypeScript 4 |
| Database | MongoDB via Mongoose 6, `mongoose-unique-validator`, Atlas `$search` for autocomplete |
| Auth | Passport custom strategy over Firebase Admin 11 and Telegram Mini App init data |
| AI | OpenAI (`gpt-4o-mini` vision) for cat classification and stories, Google GenAI (Gemini image model) for avatars and portraits |
| Payments | Stripe 20 (Checkout Sessions, PaymentIntents, webhook), Stellar SDK 15 (Horizon transaction verification, custodial keypairs) |
| Storage | DigitalOcean Spaces through the AWS S3 SDK, `sharp` and `heic-convert` for image processing |
| Email | SendGrid REST API via `fetch` |
| Scheduling | `@nestjs/schedule` cron jobs |
| Rate limiting | `@nestjs/throttler`, applied only on image endpoints |
| Migrations | `migrate-mongo` |

## Scripts

```bash
npm install                 # postinstall forces a native rebuild of sharp
npm run dev                 # nest start --watch
npm run debug               # nest start --debug --watch
npm run build               # rimraf dist && nest build
npm run start               # node dist/main (production)
npm run lint                # eslint --fix over src
npm run format              # prettier over src
npm run migration:up        # migrate-mongo up
npm run migration:down      # migrate-mongo down
```

The `test:avatar` script points at a `scripts/` folder that does not exist. The file it means is
`src/shared/test-ai-avatar.ts`. There is no Jest configuration and no `test` script, so the
backend currently has no automated tests.

## Bootstrap

`src/main.ts` does the following:

- Creates the app with `rawBody: true`.
- Mounts `express.raw()` on `/image/webhook` before the JSON parser so Stripe signature verification can read the untouched body.
- Applies `express.json({ limit: '50mb' })` to everything else.
- Registers a global `ValidationPipe({ transform: true })`. There is no `whitelist`, so unknown body fields pass through.
- Enables CORS with credentials for `localhost` variants, `capacitor://localhost`, the production domains, and any origins listed in `FRONT_END_URLS`. If that variable is unset the origin list falls back to `*`.
- Listens on `PORT`, defaulting to 3005.

There is no Swagger, no global guard, no global exception filter, and no static file serving.

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
   - Anything else: the whole string is Telegram Mini App init data, validated against the bot token.
3. The user is looked up by email (Firebase) or Telegram id and is created on first sight. Creation generates a custodial Stellar keypair, encrypts the secret, and grants a starter cat.
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
- Feeding fills `EAT` to the maximum and pays one $TAILS. A nightly cron empties every cat.
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

**Codex** tracks a monthly "$TAILS guard" phase anchored to the 9th of each month. A phase is
earned when seven monthly counters all meet their thresholds.

**Airdrop progression** in `src/user/airdrop-progression.ts` is a pure function that turns cat
tiers, quests, streak, $TAILS, and purchases into a collectible level, eligibility flags, four
claimable tiers, five daily challenges, and a milestone ladder.

### Games

The backend is a score sink. All gameplay runs on the client. Game types are `SHELTER`, `HOME`,
`PURRQUEST`, `CATBASSADORS`, `CATNIP_CHAOS`, `PIXEL_RESCUE`, and `MATCH_3`.

The single ingestion endpoint is `POST /user/catbassadors/live`. It writes an immutable `Game`
row, validates `points` against a per-type ceiling, and updates per-level best-score arrays with
`$max`:

| Game | Levels | Stored on user | Cap |
|---|---|---|---|
| Catnip Chaos | 97 (`01`, then `11` to `166`) | `catnipChaos[]` | 420 for level `01`, 10 for every other level |
| Pixel Rescue (season event) | 14 | `seasonEvent[]` | 420 per level |
| Paw Match (Match 3) | 30 | `match3[]` catnip and `match3Score[]` raw score | Catnip per level from a formula capped at 85; score capped at one million |

Leaderboards: global $TAILS top 50, catnip top 50, per-level Paw Match with a 15 second
in-process cache, and a catbassadors top 10.

### Payments

Three flows, all granting either a portrait-derived cat or a pack cat on success:

1. **Stripe Checkout** for portraits (`digital`, `print`, `canvas`) in `src/image/image.controller.ts`. A pending `Order` is created with the session id as `hash`. The webhook marks it complete, increments spend counters, sends a SendGrid confirmation, and creates the blessing and cat.
2. **Stripe PaymentIntents** for in-app purchases in `src/web3/web3.controller.ts`. The client confirms the intent, then calls `confirm-payment`, which checks the intent succeeded and belongs to the caller.
3. **Stellar** payments through `POST /web3/confirm`. The service loads the transaction from Horizon (mainnet when `IS_PROD`, else testnet) and confirms a payment operation exists.

Pack rarity odds are in `src/shared/utils/content.utils.ts`. Discount codes map to a user's
`discount` field; the code owner earns a 20 percent affiliate credit on completed purchases.

There is no Apple or Google in-app purchase receipt verification.

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
| Reset codex and monthly counters | `src/user/user.controller.ts` | Expression `0 0 1 * * ` | Pays codex guards, then zeroes all `month*` counters and clears claimed challenges and milestones. See known issues: this expression fires daily, not monthly. |
| Empty cat stomachs | `src/cat/cat.controller.ts` | Daily 01:00 | Set `status.EAT = 0` on every cat. |

## Environment variables

Names only. Copy `backend/.env.example` to `backend/.env` and fill in values.

| Group | Variables |
|---|---|
| Server | `PORT`, `IS_PROD`, `FRONT_END_URLS`, `MAIN_FE_DOMAIN` |
| Database | `MONGODB_URI` |
| Auth | `FB_PRIVATE_KEY` (Firebase service account key), `ML_ACCESS_TOKEN` (unused guard) |
| Encryption | `INVALIDATE_CACHE_SECRET` (despite the name, this seeds the AES key for custodial wallet secrets; rotating it makes stored secrets unreadable) |
| AI | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| Storage | `DO_SPACES_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_NAME`, `DO_SPACES_CDN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (in the example file, unused in code) |
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

- `GET /user/profile/:userId` is public and declared before the manager-guarded `GET /user/profile/:id`, so the admin route is unreachable and any profile, including email and Stellar wallet address, is publicly readable.
- `GET /web3/loot/buyers` is unguarded and returns wallet addresses and emails.
- `PUT /image/portrait/:id/regenerate` is unguarded and unthrottled but triggers a paid 4K generation.
- `DELETE /quest/:slug` filters on a `slug` field that the quest schema does not have.
- The `top` parameter of the global leaderboard has no decorator, so HTTP callers always get 50 rows.
- The codex reset cron uses a six-field expression with a trailing space that fires every day at 01:00. The method intends the first of each month. Monthly counters and claimed airdrop history are wiped daily.
- `CatService` is decorated with `@Controller('cat')` instead of `@Injectable()`.
- `Comment.text` is unique, so two users cannot post identical comment text anywhere.
- Stale indexes on `nftId` remain on the cat and blessing schemas.

Security:

- Telegram bot tokens for production and development are hardcoded in the auth strategy file. Firebase service-account identifiers other than the private key are hardcoded in the app module. Move both to environment variables and rotate.
- CORS falls back to `*` with credentials when `FRONT_END_URLS` is unset.
- No `whitelist` on the validation pipe, and several handlers pass the raw body into `update()`. A manager-level account can mass-assign fields such as `permission` or `tails`.
- All three payment flows take the price from the client. The Stellar verifier computes a USD value and never compares it to the claimed price.
- Custodial Stellar secrets are encrypted with AES-128-CTR using a static salt. The decrypt path is never called.
- Rate limiting covers only four image endpoints.

Operational:

- In-process caches (traction counts, Paw Match leaderboard) diverge across replicas.
- Reward paths swallow errors in empty `catch` blocks, so partial credits are possible.
- Several ObjectIds are hardcoded and must match the database: pack source shelters in the web3 controller, the portrait shelter in the cat service, promo codes in the cat controller, reward cats in the user schema.
- Admin one-off methods on `UserController` (give cats, give tails, give loot boxes) are triggered by uncommenting constructor lines.

Dead code: `PipelineGuard`, the `Roles` and `JWT_USER` decorators, `EncryptionService.decrypt`,
Freepik scraping helpers, `src/api/api.ts`, `src/user/users.ts` (a 1000-line hardcoded winner
roster), the whole `PrintifyService`, duplicated `weeklyCount()` in three repositories, and an
unimplemented `generateCatAvatar` stub at the end of the blessing controller.
