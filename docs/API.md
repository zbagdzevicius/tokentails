# API Reference

Base URL is the backend origin (`NEXT_PUBLIC_BE_URL` in the clients). All endpoints return JSON.
Paging endpoints accept `{ page, perPage, query, sort }` in the POST body; the default page size
is 50.

Auth legend:

| Tag | Meaning |
|---|---|
| Public | No guard |
| Auth | `accesstoken` header holding a Firebase ID token prefixed with `fb`, or Telegram Mini App init data |
| Perm(n) | Auth plus `User.permission >= n` where 1 user, 2 moderator, 3 editor, 4 manager, 5 admin |
| Throttle | 5 requests per minute per client |
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
| GET | `/user/profile/:userId` | Another user's profile | Public (see note) |
| POST | `/user/profile` | Create a user with wallet and starter cat | Perm(4) |
| PUT | `/user/profile/:id` | Update any user field | Perm(4) |
| PUT | `/user/profile/:id/twitter` | Set own Twitter and Discord handles | Auth (self only) |
| POST | `/user/search` | Autocomplete search on user names | Perm(4) |
| GET | `/user/cats` | All owned cats with blessing, avatar, shelter | Auth |
| GET | `/user/opened-pack/:catId` | Mark a pack cat as opened | Auth |
| POST | `/user/entity-metadata` | Annotate entities with `isLiked` for the caller | Auth |
| GET | `/user/codex` | Monthly codex phases and whether the current phase is earned | Auth |
| POST | `/user/loot/twitter` | Grant one loot box to each Twitter handle in the body | Perm(3) |
| POST | `/user/loot/discord` | Grant one loot box to each Discord handle in the body | Perm(3) |

Note: the manager-only variant of `GET /user/profile/:id` is declared after the public one and is
never reached.

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
| GET | `/user/catbassadors/referral/:telegramId` | Register caller as referral of a Telegram user; both earn 100 $TAILS | Auth |
| GET | `/user/catbassadors/referralw/:referralId` | Same by Mongo user id (web flow) | Auth |
| POST | `/user/catbassadors/live` | Submit a game result: `{ type, points, score, time, level, cat }` | Auth |

The score endpoint writes a `Game` row, caps `points` per game type, applies `$max` to the
per-level arrays, recomputes catnip totals, and returns the fresh snapshot.

## Cats

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/cat/sale` | Storefront: 10 random blueprints plus unowned blessed cats grouped by shelter slug | Public |
| GET | `/cat/:id` | Single cat with blessing, avatar, shelter | Public |
| GET | `/cat/adopt/:_id` | Adopt (clone) a cat to the caller | Auth |
| GET | `/cat/:_id/activate` | Set the caller's active cat | Auth |
| PUT | `/cat/:id` | Feed the cat: fills `EAT`, pays 1 $TAILS | Auth |
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

## Images, portraits, checkout

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/image` | Multipart upload field `file`; converts to WebP and stores on Spaces | Auth |
| POST | `/image/search` | Paged image list | Public |
| GET | `/image/:id` | Single image | Public |
| PUT | `/image/:id` | Update title and caption | Perm(3) |
| DELETE | `/image/:id` | Delete | Perm(3) |
| POST | `/image/portrait` | Upload plus synchronous portrait generation; `style` selects the prompt | Public, Throttle |
| PUT | `/image/portrait/:id/regenerate` | Regenerate a portrait | Public (see known issues) |
| POST | `/image/create-checkout-session` | Stripe Checkout for `digital`, `print`, `canvas`; creates a pending order; may create a user from `email` | Public, Throttle |
| POST | `/image/create-checkout-session-signed` | Same, user taken from the caller | Auth, Throttle |
| POST | `/image/webhook` | Stripe webhook; on `checkout.session.completed` completes the order, emails the buyer, creates the blessing and cat | Stripe |
| GET | `/image/order/status?_id=` | Poll an order's status | Public |

## Web3 and payments

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/web3/create` | Create a pending order | Auth |
| POST | `/web3/confirm` | Verify a Stellar transaction hash via Horizon, complete the order, grant a cat, credit the affiliate | Auth |
| POST | `/web3/create-payment` | Create a Stripe PaymentIntent, returns `clientSecret` | Auth |
| POST | `/web3/confirm-payment` | Verify the PaymentIntent succeeded and belongs to the caller, then grant | Auth |
| POST | `/web3/validate-discount` | Validate a discount code; returns the percentage | Public |
| GET | `/web3/pack/:packType/:id` | Grant a `STARTER`, `INFLUENCER`, or `LEGENDARY` pack cat without payment | Perm(5) |
| GET | `/web3/loot/buyers` | Eligible loot-drop buyers since a fixed date | Public (see known issues) |

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
