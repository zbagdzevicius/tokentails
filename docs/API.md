# API Reference

Base URL is the backend origin (`NEXT_PUBLIC_BE_URL` in the clients). All endpoints return JSON.
Paging endpoints accept `{ page, perPage, query, sort }` in the POST body; the default page size
is 50. Search handlers read only those keys (plus `shelter` or `category` where listed); any other
body key, such as `searchObject`, `projection` or `pipelineStages`, is ignored (2026-09 fix).

Auth legend:

| Tag | Meaning |
|---|---|
| Public | No guard |
| Auth | `accesstoken` header holding a Firebase ID token prefixed with `fb`; any other token, or a Firebase token without an `email` claim, gets 401 |
| Perm(n) | Auth plus `User.permission >= n` where 1 user, 2 moderator, 3 editor, 4 manager, 5 admin |
| Throttle(n) | Every route is limited to 300 requests per minute per client IP; Throttle(n) marks a tighter limit of n per minute. `GET /` and the Stripe webhook are exempt |
| Stripe | Stripe webhook signature |

## Health and stats

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/` | Health check, returns `1` | Public |
| GET | `/count` | Public traction counters: users, cats, staked cats, blessings, completed orders, with weekly deltas | Public |

## Users

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/profile` | Own profile with active cat, blessing, shelter | Auth |
| GET | `/user/profile/:id` | A user's `name email discount permission shelter twitter discord` for the CMS user form | Perm(4) |
| POST | `/user/profile` | Create a user with wallet and starter cat | Perm(4) |
| PUT | `/user/profile/:id` | Update `name`, `email`, `discount`, `shelter`, `permission` (any other field gets 400) | Perm(4) |
| PUT | `/user/profile/:id/twitter` | Set own Twitter and Discord handles | Auth (self only) |
| POST | `/user/search` | Autocomplete search on user names | Perm(4) |
| GET | `/user/cats` | All owned cats with blessing, avatar, shelter | Auth |
| GET | `/user/opened-pack/:catId` | Mark a pack cat as opened | Auth |
| POST | `/user/entity-metadata` | Annotate entities with `isLiked` for the caller | Auth |
| GET | `/user/codex` | Monthly codex phases and whether the current phase is earned | Auth |
| POST | `/user/loot/twitter` | Grant one loot box to each Twitter handle in the body | Perm(3) |
| POST | `/user/loot/discord` | Grant one loot box to each Discord handle in the body | Perm(3) |

Note: `POST` and `PUT /user/profile` validate the body against `ProfileWriteDto`
(`src/user/dto/profile-write.dto.ts`) and reject unknown fields and Mongo operators. The public
`GET /user/profile/:userId` was removed (2026-09): it returned emails and wallet addresses and
shadowed the manager route. No client caller used it.

### Airdrop

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/airdrop/progression` | Eligibility, tiers, challenges, milestones, level, XP | Auth |
| POST | `/user/airdrop/claim/:tierId` | Claim a tier reward in $TAILS | Auth |
| POST | `/user/airdrop/challenge/claim/:challengeId` | Claim a daily challenge reward | Auth |
| POST | `/user/airdrop/milestone/claim/:milestoneId` | Claim a milestone reward | Auth |

### Leaderboards

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/leaderboard` | Top 50 by $TAILS | Public |
| GET | `/user/leaderboard/position` | Caller's $TAILS rank | Auth |
| GET | `/user/leaderboard/catnip` | Top 50 by catnip, filtered by the global cap | Public |
| GET | `/user/leaderboard/catnip/position` | Caller's catnip rank | Auth |
| GET | `/user/leaderboard/paw-match/:level?top=` | Per-level Paw Match board, `top` 1 to 500, default 120, cached 15 s | Public |
| GET | `/user/leaderboard/paw-match/:level/position` | Caller's rank and score on a Paw Match level | Auth |
| GET | `/user/catbassadors/leaderboard` | Top 10 by $TAILS | Public |

### Catbassadors, streaks, referrals, scores

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/catbassadors/lives/redeem` | Daily check-in: random $TAILS roll, streak plus one | Auth |
| GET | `/user/catbassadors/referralw/:referralId` | Register caller as referral of the user with this Mongo id (web `?ref=` flow); both earn 100 $TAILS | Auth |
| POST | `/user/catbassadors/live` | Submit a game result: `{ type, points, score, time, level, cat, platform }` | Auth, 30 per minute per player, 120 per IP |

The score endpoint validates the body against `LiveGameDto` (`src/user/dto/live-game.dto.ts`) and
rejects unknown fields with 400. `type` must be `CATNIP_CHAOS`, `PIXEL_RESCUE` or `MATCH_3`; any
other value, including the legacy `PURRQUEST` and `CATBASSADORS`, is a 400. `level` must be a level
of that type and `points` an integer from 0 to the level's cap. `score` (Paw Match raw score, 0 to
1,000,000) is stored for `MATCH_3` only. `time` is a number up to 86,400, stored clamped to 0 or
more. `cat` is accepted but ignored: the row gets the caller's current cat. `platform` is `web`,
`ios` or `android`, and `web` when absent. Nothing is written when validation fails. It then writes
a `Game` row with only these fields, applies `$max` to the per-level arrays, recomputes catnip
totals, and returns the fresh snapshot.

## Cats

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/cat/sale` | Storefront: 10 random blueprints plus unowned blessed cats grouped by shelter slug | Public |
| GET | `/cat/:id` | Single cat with blessing, avatar, shelter | Public |
| GET | `/cat/adopt/:_id` | Adopt (clone) a cat to the caller | Auth |
| GET | `/cat/:_id/activate` | Set the caller's active cat | Auth |
| PUT | `/cat/:id` | Feed the caller's own cat: fills `EAT`, pays 1 $TAILS once per fill. Body is ignored. 400 bad id, 403 not the owner, 404 no such cat, 409 already full | Auth |
| GET | `/cat/stake/:_id` | Stake a cat for one week | Auth |
| GET | `/cat/stake-reward/:_id` | Claim staking reward by tier | Auth |
| GET | `/cat/redeem/:catCode` | Redeem a promo code for a cat | Auth |
| GET | `/cat/gift/:catId/:userId` | Gift a cat to a user | Perm(2) |
| GET | `/cat/blueprint` | List blueprint cats | Perm(2) |
| GET | `/cat/nft/metadata` | Collection-level NFT metadata | Public |
| GET | `/cat/nft/:tokenId` | Per-token NFT metadata | Public |
| GET | `/cat/rates` | XLM to USDC rate from Binance merged onto a static table | Public |
| GET | `/cat/rate/:CurrencyType` | Any `<X>USDT` ticker from Binance | Public |

## Blessings

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/blessing/search` | Search blessings, scoped to the caller's shelter unless manager or above | Auth |
| GET | `/blessing/:id` | Single blessing with cat, shelter, images, creator | Auth |
| POST | `/blessing` | Create: OpenAI classification and story, Gemini avatar, linked cat | Perm(2) |
| POST | `/blessing/custom` | Create with manually supplied cat art | Perm(2) |
| PUT | `/blessing/:id` | Update; regenerates the cat if the name changed | Perm(2) |
| PUT | `/blessing/:id/custom` | Update a custom blessing and its cat | Perm(2) |
| PUT | `/blessing/:id/status` | Set status: WAITING, RECOVERING, ADOPTED, HEAVEN | Perm(2) |
| PUT | `/blessing/:id/avatar` | Regenerate the Gemini avatar | Perm(2) |
| DELETE | `/blessing/:id` | Delete blessing and its cat | Perm(5) |

## Shelters

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/shelter` | All shelters | Auth |
| GET | `/shelter/:id` | Single shelter | Auth |
| POST | `/shelter` | Create; slugifies name and generates a Stellar wallet | Perm(4) |
| PUT | `/shelter/:id` | Update | Perm(4) |
| POST | `/shelter/donate` | Server-paid gift to the shelters through ShelterSplit on Arc. Body `{ source: 'heist' \| 'page' }`, no other keys. One per user per UTC day | Auth, Throttle(10) |
| GET | `/shelter/donate/status` | `{ enabled, chainId, amountWei, remainingTodayWei, splitAddress }` | Public, Throttle(60) |
| GET | `/shelter/agent/cat-card` | x402-style paid card for AI agents (see below) | Public, Throttle(30) |

### Shelter gifts on Arc

`POST /shelter/donate` has the Token Tails hot wallet call `ShelterSplit.donate(memo)` with
`SHELTER_DONATE_AMOUNT_WEI` of native USDC (18 decimals on Arc; gas is also paid in USDC). The player
pays nothing and signs nothing. The memo is `tt:<source>:<8 random hex>` and carries no personal data.

| Status | Body | When |
|---|---|---|
| 200 | `{ txHash, chainId, amountWei, explorerUrl }` | Broadcast; `explorerUrl` is `https://explorer.arc.io/tx/<hash>`. The call returns once broadcast, not once mined |
| 400 | Validation error | `source` is not `heist` or `page`, or the body has other keys |
| 429 | `You already sent today's gift. Come back tomorrow!` | This user already has a gift for the current UTC day |
| 503 | A short message | `SHELTER_DONATE_ENABLED` is off, the split address or hot wallet key is missing, the daily budget is spent, or the broadcast failed (the user may retry) |

The showcase recipient is Pink Paw (Rožinė pėdutė). Its wallet is created and held by Token Tails on
the shelter's behalf until handover; the split's recipients are set in the contract, not by this API.

### Agent cat card (x402-compatible, `onchain-receipt` scheme)

This is an x402-compatible flow with a custom `onchain-receipt` scheme and no facilitator: standard
x402 facilitators may not support Arc, so the server verifies the payment itself over RPC. It is off
(503) unless `SHELTER_X402_ENABLED` is `true`.

1. `GET /shelter/agent/cat-card` without `X-PAYMENT` returns 402:

   ```json
   {
     "x402Version": 1,
     "error": "payment required",
     "accepts": [{
       "scheme": "onchain-receipt",
       "network": "eip155:5042",
       "maxAmountRequired": "<SHELTER_X402_PRICE_WEI>",
       "asset": "native",
       "payTo": "<ShelterSplit address>",
       "resource": "https://<host>/shelter/agent/cat-card",
       "description": "One adoptable-cat card; payment goes to shelters via ShelterSplit",
       "mimeType": "application/json",
       "maxTimeoutSeconds": 600,
       "extra": { "memo": "x402:<nonce>", "nonce": "<nonce>" }
     }]
   }
   ```

2. The agent calls `ShelterSplit.donate("x402:<nonce>")` with at least `maxAmountRequired` wei.
3. The agent retries with `X-PAYMENT: base64(JSON {x402Version: 1, scheme: "onchain-receipt",
   network: "eip155:<chainId>", payload: {txHash: "0x..", nonce: "<nonce>"}})`.
4. The server reads the receipt and requires status 1 and `NativeDisbursed` logs from the split
   address whose memo is `x402:<nonce>`, summing to at least the price. The nonce must be one the
   server issued, unused and less than 600 seconds old. A tx hash pays for one card only.
5. 200 returns `{ name, imageUrl, shelterName }` for a random blessing with status `WAITING` (any
   blessing if none waits), plus header `X-PAYMENT-RESPONSE: base64(JSON {success: true, txHash})`.

Any rejected payment (bad header, unknown or expired nonce, receipt missing, reverted or short, tx
already used) is a 402 whose `error` says why and whose `accepts` carries a fresh nonce. A receipt
that is not mined yet does not use up the nonce, so the agent can retry with the same header. 503
means the feature is off or there is no card to sell.

## Images, portraits, checkout

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/image` | Multipart upload field `file`; converts to WebP and stores on Spaces | Auth |
| POST | `/image/search` | Paged image list; only paging and sort are read from the body | Public |
| GET | `/image/:id` | Single image | Public |
| PUT | `/image/:id` | Update title and caption | Perm(3) |
| DELETE | `/image/:id` | Delete | Perm(3) |
| POST | `/image/portrait` | Upload plus synchronous portrait generation; `style` selects the prompt. Still public although each call is a paid generation (open product decision). Provider errors return a fixed message | Public, Throttle(5) |
| PUT | `/image/portrait/:id/regenerate` | Regenerate a portrait (a paid generation). 401 when signed out; the client shows a sign-in message. Provider errors return a fixed message | Auth, Throttle(3) |
| POST | `/image/create-checkout-session` | Stripe Checkout for `digital`, `print`, `canvas` at the server price ($6, $49, $69; a sent `amount` is ignored); creates a pending order; may create a user from `email` | Public, Throttle(5) |
| POST | `/image/create-checkout-session-signed` | Same, user taken from the caller | Auth, Throttle(5) |
| POST | `/image/webhook` | Stripe webhook; on `checkout.session.completed` checks the session is paid at the server price, completes the pending order once, emails the buyer, creates the blessing and cat | Stripe, not throttled |
| GET | `/image/order/status?_id=` | Poll an order's status. Returns only `_id status entityType id image price`; 400 when `_id` is not an ObjectId | Public |

## Web3 and payments

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/web3/confirm` | Verify a Stellar transaction hash via Horizon (successful, pays the treasury, in the order's XLM or USDC, at least the server catalogue price less a verified discount; the body `price` is ignored), complete the order, grant a cat, credit the affiliate. `entityType` must be `IMAGE`, `PACK` (with a pack `id`) or `LOOT_BOX` (with no `id`), else 400 before any order exists. The hash is lowercased and must be the payment's outer hash (for a fee-bump, the fee-bump hash; the inner hash is refused). `spent`, `monthSpent` and the affiliate credit use the verified amount. 400 when verification fails (the hash is released for a retry), 409 when the hash, or another hash of the same payment, already backs an order, 503 when Horizon or the XLM rate is unavailable | Auth |
| POST | `/web3/create-payment` | Create a Stripe PaymentIntent at the server price (table price less a verified `discount` code); a sent `amount` is ignored. Returns `clientSecret` | Auth |
| POST | `/web3/confirm-payment` | Verify the PaymentIntent belongs to the caller, succeeded, is in USD and covers the server price, then grant once: a replayed confirm returns `{ success: false }` and grants nothing. The discount comes from the intent, not the body. Stripe and database errors return a fixed message | Auth |
| POST | `/web3/validate-discount` | Validate a discount code; returns the percentage | Public |
| GET | `/web3/pack/:packType/:id` | Grant a `STARTER`, `INFLUENCER`, or `LEGENDARY` pack cat without payment | Perm(5) |
| GET | `/web3/loot/buyers` | Eligible loot-drop buyers since a fixed date, with wallet and email | Perm(5) |

`POST /web3/create` was removed (2026-09). It had no client or CMS caller, took `user` from the
body, and let any signed-in caller park a pending order on someone else's transaction hash, which
the unique `hash` index then turned into a permanent 409 for the real buyer.

## Content

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/article/latest` | Paged latest articles | Public |
| POST | `/article/category/:category` | Paged articles in a category | Public |
| GET | `/article/random` | 25 random articles | Public |
| POST | `/article/search` | Autocomplete on title with optional category | Public |
| GET | `/article/:slug` | Article with first comment and related articles | Public |
| POST | `/article` | Create; slugifies the title | Perm(3) |
| PUT | `/article/:slug` | Update | Perm(3) |
| DELETE | `/article/:slug` | Delete and detach from category | Perm(3) |
| POST | `/category/search` | Paged categories | Public |
| GET | `/category/articles` | Categories with their five latest articles | Public |
| POST | `/category/:slug/articles` | Paged articles for a category | Public |
| GET | `/category/:slug` | Single category | Public |
| POST | `/category` | Create | Perm(3) |
| PUT | `/category/:slug` | Update | Perm(3) |
| DELETE | `/category/:slug` | Delete | Perm(4) |
| POST | `/feed/search` | Randomised feed of enabled articles | Public |
| GET | `/feed/slugs` | Article slugs with category and featured image, for sitemaps | Public |
| POST | `/comment` | Create a comment on an entity | Perm(1) |
| POST | `/comment/:entityType/:entityId` | Paged comments for `ARTICLE`, `CAT`, `BLESSING`, `PACK`, `IMAGE`, or `COMMENT` | Public |

## Quests

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/quest/search` | Quest list, max 100 | Public |
| GET | `/quest/:_id` | Single quest | Public |
| POST | `/quest` | Create | Perm(3) |
| PUT | `/quest/:_id` | Update | Perm(3) |
| DELETE | `/quest/:slug` | Delete by slug (never matches; quests have no slug) | Perm(4) |
| GET | `/quest/complete/:quest` | Claim a quest reward by static quest key or quest id | Auth |
| GET | `/quest/contest/:contest` | Claim a camp mystery box (`CAMP_6` to `CAMP_9`) | Auth |

## Tickets

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/ticket` | Caller's tickets | Auth |
| POST | `/ticket` | Create; one per user per calendar day | Auth |
| POST | `/ticket/search` | All tickets | Perm(4) |
| POST | `/ticket/search/unanswered` | Tickets without an answer, with reporter contact fields | Perm(4) |
| PUT | `/ticket/:id` | Write the answer | Perm(3) |

## Enumerations used in payloads

| Enum | Values |
|---|---|
| `GameType` | `SHELTER`, `HOME`, `PURRQUEST`, `CATBASSADORS`, `CATNIP_CHAOS`, `PIXEL_RESCUE`, `MATCH_3` |
| `GamePlatform` | `web`, `ios`, `android` |
| `CatAbilityType` | `ICE`, `ELECTRIC`, `FIRE`, `WIND`, `DARK`, `WATER`, `GRASS`, `SAND`, `FAIRY`, `STELLAR` |
| `Tier` | `COMMON`, `RARE`, `EPIC`, `LEGENDARY` |
| `PackType` | `STARTER`, `INFLUENCER`, `LEGENDARY` |
| `BlessingStatus` | `WAITING`, `RECOVERING`, `ADOPTED`, `HEAVEN` |
| `OrderStatus` | `COMPLETE`, `PENDING`, `LOCKED`, `FAILED` |
| `ChainType` | `STELLAR`, `FIAT` |
| `CurrencyType` | `USDT`, `USDC`, `XLM`, `USD` |
| `ProductType` | `digital`, `print`, `canvas` |
| `ImageStyle` | `highness`, `monarch`, `aristocrat`, `commander` |
| `EntityType` | `ARTICLE`, `CAT`, `BLESSING`, `PACK`, `IMAGE`, `COMMENT` |
