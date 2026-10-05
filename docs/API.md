# API Reference

Base URL is the backend origin (`NEXT_PUBLIC_BE_URL` in the clients). All endpoints return JSON.
Paging endpoints accept `{ page, perPage, query, sort }` in the POST body; the default page size
is 50. Search handlers read only those keys (plus `shelter` or `category` where listed); any other
body key, such as `searchObject`, `projection` or `pipelineStages`, is ignored (2026-09 fix).

Auth legend:

| Tag | Meaning |
|---|---|
| Public | No guard |
| Auth | `AppAuthGuard`: lowercase `accesstoken` header holding a Firebase ID token prefixed with `fb` (anonymous guest tokens are Firebase tokens too); any other token gets 401. Registered players only: a guest gets 403 `GUEST_FORBIDDEN` |
| Guest ok | Auth, and a guest may call it once its guest session exists (route on the guest allow-list, `src/common/guards/guest-allow-list.ts`). A guest without a session gets 428 `GUEST_SESSION_REQUIRED` |
| Guest ok (transient) | Guest ok, and also a guest with no session yet |
| Perm(n) | Auth plus `User.permission >= n` where 1 user, 2 moderator, 3 editor, 4 manager, 5 admin |
| Throttle(n) | Every route is limited to 300 requests per minute per client IP; Throttle(n) marks a tighter limit of n per minute. `GET /` and the Stripe webhook are exempt |
| User(n) | A per-player limit of n per minute (`UserThrottlerGuard`, fails closed) |
| Stripe | Stripe webhook signature |

Other lowercase request headers: `x-guest-token` (an `fb`-prefixed anonymous token, on the guest
merge only), `x-firebase-appcheck` (App Check token, on the guest session), `x-payment` (x402).

## Error bodies

Errors that the client must tell apart carry `{ statusCode, code, message }` (plan F5.6). The codes in
`shared/errors.ts` (copied into every package):

| Code | Status | Meaning |
|---|---|---|
| `GUEST_FORBIDDEN` | 403 | A guest called a registered-only route; the client opens the sign-in sheet |
| `GUEST_SESSION_REQUIRED` | 428 | A transient guest called a guest route; the client calls `POST /user/guest/session` once and retries |
| `ACCOUNT_CONFLICT` | 409 | The token's uid belongs to a guest whose email is another account's, or a unique-index clash while binding |
| `EMAIL_UNVERIFIED` | 403 | An unverified email that would have to bind or create an account; also on `POST /shelter/donate` |
| `STARTER_LOCKED` | 409 | The starter is already committed |
| `NAME_TOO_SHORT`, `NAME_TOO_LONG`, `NAME_CHARS`, `NAME_RESERVED`, `NAME_BLOCKED` | 400 | `normalizeCatName` refused the name |
| `HEIST_REPLAY_INVALID`, `HEIST_NOT_WON`, `HEIST_TRAILING_INPUT` | 400 | The Heist log is not a clean win |
| `HEIST_SIM_VERSION` | 400 | The log is from another sim version (body also carries `sim: {simVersion, bundleSha256}`) |
| `HEIST_DUPLICATE` | 409 | This canonical log is already saved (by any account) |
| `DONATE_PAUSED`, `DONATE_BUDGET_SPENT` | 409 | Treats are off, or today's budget is spent |
| `DONATE_SEND_FAILED` | 424 | The broadcast failed; retry later |
| `DONATE_ALREADY_TODAY` | 429 | This player already sent today's treat |
| `DONATE_NOT_ELIGIBLE` | 403 | With `reason` (`account-too-new` with `eligibleAt`, or `no-saved-game`) |

Not in `shared/errors.ts` yet (clients match the literals): `CAT_NAP_LIMIT` (409), the payout and
outcome codes (`PAYOUT_AUTHOR_CANNOT_CONFIRM`, `PAYOUT_STAFF_CANNOT_CONFIRM`, `PAYOUT_NOT_A_MEMBER`
403; `PAYOUT_RECEIPT_MISMATCH`, `PAYOUT_BAD_SIGNATURE` 400; `PAYOUT_STALE_ATTESTATION`,
`PAYOUT_NOT_DRAFT`, `PAYOUT_HANDOVER_PENDING` 409; `OUTCOME_SAME_REVIEWER` 403;
`OUTCOME_NOT_REDACTED`, `OUTCOME_PUBLISHED` 409) and the Rescue Goal codes (`PLEDGES_PAUSED` 503,
`PLEDGE_NOT_ELIGIBLE`, `PLEDGE_BALANCE`, `PLEDGE_DAILY_CAP`, `PLEDGE_ID_REUSED`, `PLEDGE_INTERRUPTED`,
`GOAL_NOT_FOUND`, `GOAL_NOT_OPEN`, `GOAL_OVERFLOW`, `GOAL_FUNDING_REQUIRED`, `GOAL_BUDGET_FULL`,
`GOAL_HOUSE_SHELTER`, `GOAL_NOT_DELIVERABLE`, `GOAL_NOT_CANCELLABLE`, `GOAL_NOT_EDITABLE`).

## Health and stats

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/` | Health check, returns `1` | Public |
| GET | `/count` | Public traction counters: users, cats, staked cats, blessings, completed orders, with weekly deltas. Guests and guest starters are left out; `guestSessions` is reported apart | Public |

Public impact numbers are served by `GET /impact` (below), not by `/count`.

## Users and identity

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/profile` | Own profile with active cat, blessing, shelter, the cleared and Heist arrays, `onboarding`, `following`, `isGuest`. A transient guest gets the template profile (`transient: true`, nothing written). `promotedNow: true` appears once, on the first profile read after a guest was promoted to an account | Guest ok (transient) |
| POST | `/user/guest/session` | Create the guest document and its SCOUT starter for an anonymous token (idempotent). 409 for a registered token. Reads `x-firebase-appcheck`; enforced only with `APP_CHECK_ENFORCE=true`. Per-IP limit `GUEST_SESSIONS_PER_IP_PER_HOUR` | Guest ok (transient), Throttle(20) |
| POST | `/user/guest/merge` | Merge the guest named by `x-guest-token` into the caller's account: best scores max, Heist stars OR, cleared flags, Game rows re-parented, pending Tails credited up to the lifetime cap, guest starter dropped. Once per account per 30 days (409 otherwise); idempotent and resumable | Auth, Throttle(10) |
| DELETE | `/user/guest` | Erase the caller's guest progress (document, cats, Game rows, anonymous Firebase user) | Guest ok (transient) |
| DELETE | `/user/me` | Delete the account: anonymise the document, delete the Firebase users, release cats, revoke Sign in with Apple when the body carries `{appleAuthorizationCode}` and the server has the Apple keys | Auth, Throttle(5) |
| GET | `/user/profile/:id` | A user's `name email discount permission shelter twitter discord` for the CMS user form | Perm(4) |
| POST | `/user/profile` | Create a user with wallet and a locked starter cat. A non-ADMIN may not create a role above USER (403) | Perm(4) |
| PUT | `/user/profile/:id` | Update `name`, `email`, `discount`, `permission` (any other field, including `shelter`, gets 400). Only an ADMIN may change `email` or `permission` (403 otherwise; unchanged values pass) | Perm(4) |
| PUT | `/user/profile/:id/twitter` | Set own Twitter and Discord handles | Auth (self only) |
| POST | `/user/search` | Autocomplete search on user names | Perm(4) |
| GET | `/user/cats` | All owned cats with blessing, avatar, shelter | Guest ok |
| GET | `/user/opened-pack/:catId` | Mark a pack cat as opened | Auth |
| POST | `/user/entity-metadata` | Annotate entities with `isLiked` for the caller | Auth |
| GET | `/user/codex` | Monthly codex phases and whether the current phase is earned | Auth |
| POST | `/user/loot/twitter` | Grant one loot box to each Twitter handle in the body | Perm(3) |
| POST | `/user/loot/discord` | Grant one loot box to each Discord handle in the body | Perm(3) |
| POST | `/user/starter` | Meet your cat (G3): commit the caller's starter once. Body `{breed, name?, skipped?}`; `breed` is one of `SCOUT PINKIE SHADOW MISTY SUNNY`, `name` passes `normalizeCatName` (400 with a `NAME_*` code; a non-string name is `NAME_CHARS`), `skipped: true` commits the default. Sets `onboarding: done`. 409 `STARTER_LOCKED` once committed or when onboarding is not pending (the client treats it as done). Never changes `user.cat` (`StarterController`) | Guest ok |
| POST | `/user/following/:blessingId` | Follow a rescue cat (never a portrait); idempotent, at most 50. Returns `{following}`. 404 unknown cat, 409 limit | Guest ok |
| DELETE | `/user/following/:blessingId` | Unfollow; returns `{following}` | Guest ok |
| GET | `/user/token-status` | Vault status `{mode, tgeAt}`: `mode` is `POINTS` (default) or `TOKEN` from `TAILS_TOKEN_MODE`; `tgeAt` is null unless `TOKEN` and a valid `TAILS_TGE_AT`. `Cache-Control: public, max-age=300` | Public |

Note: `POST` and `PUT /user/profile` validate the body against `ProfileWriteDto`
(`src/user/dto/profile-write.dto.ts`) and reject unknown fields and Mongo operators. The public
`GET /user/profile/:userId` was removed (2026-09): it returned emails and wallet addresses and
shadowed the manager route. No client caller used it.

### Progression (route prefix still `airdrop` for shipped clients)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/airdrop/progression` | Eligibility, tiers, challenges, milestones, level, XP and the `season` band (`freezeAt` 22:00 UTC on the 8th, `resetAt`, `anchorAt`, `startedAt`, `frozen`). Reads earned Tails, Tails given and goals helped; purchases unlock nothing. Metrics include `tailsEarned`, `tailsGiven`, `goalsHelped`, `monthTailsGiven`, `monthGoalsHelped`; the score breakdown has `rescueScore` (was `monetizationScore`) | Guest ok |
| POST | `/user/airdrop/claim/:tierId` | Claim a tier reward in Tails | Auth, User(10) |
| POST | `/user/airdrop/challenge/claim/:challengeId` | Claim a challenge reward (`BIG_HEART`, `GOAL_GETTER` replace `TAILS_MOMENTUM`, `MONETIZE_LOOP`) | Auth, User(10) |
| POST | `/user/airdrop/milestone/claim/:milestoneId` | Claim a milestone reward | Auth, User(10) |

### Leaderboards

Every board and position count excludes guests, accounts flagged by
`scripts/flag-board-exclusions.js` and deleted accounts. A guest's position answer is
`{position, wouldBe: true}`; a flagged or deleted account gets `{position: null, excluded: true}`.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/leaderboard` | Top 50 by earned Tails (sorted on `tails` until `TAILS_EARNED_BACKFILL_DONE=true`, then on `tailsEarned`). Rows carry `tails` (the ranked value) and `tailsEarned`. Ties break by `_id` | Public |
| GET | `/user/leaderboard/position` | Caller's earned-Tails rank | Guest ok |
| GET | `/user/leaderboard/rescuers?period=all\|season&top=` | Rescuers by Tails given (givers only), `top` 1 to 200 | Public |
| GET | `/user/leaderboard/rescuers/position` | Caller's rescuer rank | Guest ok |
| GET | `/user/leaderboard/catnip` | Top 50 by catnip, filtered by the global cap | Public |
| GET | `/user/leaderboard/catnip/position` | Caller's catnip rank | Guest ok |
| GET | `/user/leaderboard/paw-match/:level?top=` | Per-level Paw Match board, `top` 1 to 500, default 120, cached 15 s | Public |
| GET | `/user/leaderboard/paw-match/:level/position` | Caller's rank and score on a Paw Match level | Guest ok |
| GET | `/user/catbassadors/leaderboard` | Top 10 by earned Tails | Public |

### Wheel, referrals, scores

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/user/catbassadors/lives/redeem` | Daily spin: random Tails roll from the published table, streak plus one. One conditional write, so parallel spins pay once (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth, User(10) |
| GET | `/user/catbassadors/lives/odds` | The wheel's slices and probabilities (1% each for 1,000, 250, 100, 50; 24% each for 25, 10, 5, 1) | Public |
| POST | `/user/catbassadors/referral` | Body `{referrerId}`. Pays 100 Tails to both once per referred account, ever, within 7 days of the account's promotion (or creation); aliases of one inbox cannot refer each other. The client sends it only when the profile says `promotedNow: true` | Auth, User(10) |
| GET | `/user/catbassadors/referralw/:referralId` | Deprecated (`Deprecation: true` header), same rules as the POST (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth |
| POST | `/user/catbassadors/live` | Submit a game result; the only score writer (see "Scores") | Guest ok, 30 per minute per player, 120 per IP |
| GET | `/user/catbassadors/heist-sim` | `{simVersion, bundleSha256, levels}` of the vendored Heist sim, for the Pages deploy gate. Read only. `Cache-Control: public, max-age=60` | Public |

## Scores

`POST /user/catbassadors/live` validates the body against `LiveGameDto`
(`src/user/dto/live-game.dto.ts`) and rejects unknown fields with 400 (also inside `replay`). Nothing
is written when validation fails. The route has its own JSON parser: a body over 64 KB is 413, a
non-JSON body 415.

Plain saves: `{ type, points, score, time, level, cat, platform, outcome? }`. `type` must be
`CATNIP_CHAOS`, `PIXEL_RESCUE` or `MATCH_3`; any other value, including the legacy `PURRQUEST` and
`CATBASSADORS`, is a 400. `level` must be a level of that type and `points` an integer from 0 to the
level's cap (Purrsuit endless level `01` and every Cupid Cat level: 500; other Purrsuit levels: 10;
Paw Match: its own cap). `score` (Paw Match raw score, 0 to 1,000,000) is stored for `MATCH_3` only.
`time` is a number up to 86,400, stored clamped to 0 or more. `cat` is accepted but ignored: the row
gets the caller's current cat. `platform` is `web`, `ios` or `android`, and `web` when absent.
`outcome` is `won`, `died`, `timeout` or `quit` and is stored on the row; `won` marks the level
cleared (`catnipChaosCleared`, `seasonEventCleared`, `match3Cleared`), except Purrsuit `01`. The
handler writes a `Game` row with only these fields, applies `$max` to the per-level arrays,
recomputes catnip totals, sets `lastPlayedAt`, and returns the fresh snapshot including the cleared
arrays. These scores are accepted by cap validation; the server does not replay them.

Catnip Heist saves (plan G2): `{ type: 'CATNIP_HEIST', replay: <InputLog as recorded>, platform?,
outcome?: 'won', level?: <must equal replay.levelId> }`; `points`, `score` and `time` are ignored. The
log needs seed 1, the current `SIM_VERSION`, two different known cat ids, at most 18,000 ticks and
`[dx, dy, flags, count]` runs summing to `ticks`. A `CATNIP_HEIST` type without a replay is 400.

| Status | Body `code` | Meaning |
|---|---|---|
| 201 | none | `{levelId, levelIndex, score, stars, newStars, best, heistScore[8], heistStars[8]}` |
| 400 | `HEIST_REPLAY_INVALID`, `HEIST_NOT_WON`, `HEIST_TRAILING_INPUT` | The log is not a clean win; drop it |
| 400 | `HEIST_SIM_VERSION` | Another sim version; the body carries `sim: {simVersion, bundleSha256}` |
| 401, 403, 428 | per "Error bodies" | Auth |
| 409 | `HEIST_DUPLICATE` | Already saved (any account). For the caller's own row the stored score and stars are re-applied first |
| 413 | none | Body over 64 KB |
| 415 | none | Not `application/json` |
| 429 | none, `Retry-After` header | Per-IP replay bucket (30 a minute), per-player limit, or a full replay queue |
| 503 | none | Production without `TRUST_PROXY`: replays are refused (plain saves pass) |

## Cats

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/cat/sale` | Storefront: 10 random blueprints plus unowned blessed cats grouped by shelter slug. The keys `tokentails`, `token-tails`, `token-tails-2` and `rozine-pedute` are always arrays; at most 200 cats per shelter and 1,000 overall; whitelisted fields only (never `owner`, `code`, `staked`, blessing `creator`); additive `_meta: {_v: 1, generatedAt, shelters: [{slug, name, role}]}`. Cached 45 s, invalidated by adoptions | Public |
| GET | `/cat/:id` | Single cat with blessing, avatar, shelter. 404 for a guest starter | Public |
| GET | `/cat/adopt/:_id` | Retired (3c review): always `{success: false}`; cats come from purchases, packs, quests, redeem codes and moderator gifts | Auth |
| GET | `/cat/:_id/activate` | Set the caller's active cat | Auth |
| PUT | `/cat/:id` | Feed the caller's own cat: fills `EAT`, pays 1 Tail once per fill (a guest's goes to `pendingTails`). Body is ignored. 400 bad id, 403 not the owner, 404 no such cat, 409 already full | Guest ok |
| GET | `/cat/stake/:_id` | Start a cat nap (one week). Returns `{success, stakedUntil, tails, napping, rule: {tails, maxCats, days}}`. 404 not the caller's cat, 409 already napping or `CAT_NAP_LIMIT` (3 cats), 400 bad id (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth, User(20) |
| GET | `/cat/stake-reward/:_id` | Collect a finished nap: a flat 50 Tails. Body `{success, message, tails}` (`tails` 0 while the nap runs). 404 not the caller's cat (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth, User(20) |
| GET | `/cat/redeem/:catCode` | Redeem a promo code for a cat | Auth |
| GET | `/cat/gift/:catId/:userId` | Gift a cat to a user | Perm(2) |
| GET | `/cat/blueprint` | List blueprint cats | Perm(2) |
| GET | `/cat/nft/metadata` | Collection-level NFT metadata | Public |
| GET | `/cat/nft/:tokenId` | Per-token NFT metadata | Public |
| GET | `/cat/rates` | XLM to USDC rate from Binance merged onto a static table | Public |
| GET | `/cat/rate/:CurrencyType` | Any `<X>USDT` ticker from Binance | Public |
| PUT | `/cat/:id/name` | Rename the caller's own committed starter. Body `{name}` (shared `normalizeCatName`, featured real-cat names reserved). One free rename per 30 days (409 with `nextRenameAt`), 409 once minted, 403 not a starter, 404 not the owner's. A legacy rename offer (`renameOffer`) skips the window once | Guest ok, Throttle(10) |
| DELETE | `/cat/:id/name-offer` | "Keep the name": dismiss the one-time legacy rename offer | Auth |
| POST | `/cat/:id/report` | Report a player cat name. Body `{reason: offensive\|impersonation\|personal-info\|other, note?}` (note at most 200 characters). One open report per reporter and cat; own cats and shelter cats give 400. 20 per hour per player | Auth |
| GET | `/cat/name-reports` | Name reports grouped per cat, `?status=open\|actioned\|dismissed&page=`. Never includes reporters | Perm(2) |
| PUT | `/cat/:id/name/moderate` | Body `{action: reset\|rename\|dismiss, name?}`. Reset gives the breed name, rename validates the name; both restart the rename window (`nameChangedAt`) and override the mint freeze. Resolves every open report of the cat | Perm(2) |

## Blessings

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/blessing/search` | Search blessings, scoped to the caller's shelter unless manager or above | Auth |
| GET | `/blessing/featured` | Up to `?limit=` (default 3, max 12) rescue cats of Pink Paw and the catfluencers that are WAITING or RECOVERING, never portraits: `{_id, name, status, excerpt, image, catAvatar, catImg, shelter: {_id, name, slug}}`, excerpt plain text of at most 140 characters. The ranking rotates every 10 minutes and is the same on every instance and for every limit. `Cache-Control: public, max-age=600` | Public |
| GET | `/blessing/featured/names` | `{names}`: the names of the cats featured now and in the previous 10-minute bucket (at most 6), which `normalizeCatName` reserves. Meet your cat passes them as `reserved` so its inline check matches the API. Cached 10 minutes | Public |
| GET | `/blessing/:id` | Single blessing with cat, shelter, images, creator | Auth |
| POST | `/blessing` | Create: OpenAI classification and story, Gemini avatar, linked cat. `kind` is set from the shelter (`portrait` in the portrait shelter, else `rescue`) | Perm(2) |
| POST | `/blessing/custom` | Create with manually supplied cat art | Perm(2) |
| PUT | `/blessing/:id` | Update; regenerates the cat if the name changed. 400 when the new shelter would turn a rescue into a portrait or back; `kind` in the body is ignored | Perm(2) |
| PUT | `/blessing/:id/custom` | Update a custom blessing and its cat; the same 400 on a kind change | Perm(2) |
| PUT | `/blessing/:id/status` | Set status: WAITING, RECOVERING, ADOPTED, HEAVEN; records `statusUpdatedBy` and `statusUpdatedAt`. 404 before the permission check | Perm(2) |
| PUT | `/blessing/:id/avatar` | Regenerate the Gemini avatar | Perm(2) |
| DELETE | `/blessing/:id` | Delete blessing and its cat | Perm(5) |

## Shelters

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/shelter` | All shelters, whitelist projection: `_id name slug description image country countryCode partnerStatus role publicWallet`; MANAGER and above also get `address website facebook twitter tiktok foundedAt`. Never `wallets`, `users`, `code`, `members` or `blessing` | Auth |
| GET | `/shelter/:id` | Single shelter, same projection | Auth |
| POST | `/shelter` | Create through `ShelterWriteDto`; slugifies name and generates a Stellar wallet. `wallets`, `users`, `blessing`, `code` and `slug` are 400; `countryCode` must be ISO alpha-2; a blank string clears a nullable field; the custody fields (`handoverStatus`, `handoverAt`, `handoverTx`, `publicWallet`) are ADMIN-only (unchanged round-tripped values pass) | Perm(4) |
| PUT | `/shelter/:id` | Update, same DTO rules | Perm(4) |
| GET | `/shelter/:id/members` | The shelter members who may confirm its payouts | Perm(5) |
| PUT | `/shelter/:id/members` | Add members by user id or email, remove by id. Verified registered accounts only, never MANAGER or above | Perm(5) |
| POST | `/shelter/donate` | Server-paid treat to the shelters through ShelterSplit. Body `{ source: 'heist' \| 'page', chainId? }`, no other keys. `chainId` (optional whole number) picks the network; omitted, the main chain (Arc). One per user per UTC day across all chains. Instant-treat policy first (verified, 24 h, 1 saved game) | Auth, Throttle(10), User(5) |
| GET | `/shelter/donate/status` | `{ enabled, railState, chainId, amountWei, remainingTodayWei, dailyBudgetWei, giftsPerDayCap, treatsLeftToday, resetsAt, communityTotalConfirmedWei, splitAddress, chains }`. The top-level fields describe the main chain. `chains`: the main chain first, then every `wallet.config.ts` chain of the main chain's network class (treats are on by default) and any `SHELTER_RELAY_CHAINS` entry with its treat flag on, each `{ chainId, main, testnet, enabled, railState, coin, amountWei, remainingTodayWei, dailyBudgetWei, giftsPerDayCap, treatsLeftToday, splitAddress, explorer, reason? }` (`reason` says why a listed chain is disabled: the hot wallet holds less than one treat or no gas, the split is paused or pays no shelter, the RPC is not answering, or no key; health is cached 60 s) (budget per chain; `coin` is what the treat is paid in: USDC, USDC.e on Tempo, USDG on Robinhood). Without that config `chains` lists only the main chain. `railState` is `not-deployed`, `paused`, `live` or `exhausted`. Every `amountWei` is 18 decimals | Public, Throttle(60) |
| GET | `/shelter/donate/me` | The caller's treat today `{day, resetsAt, today: {status, source, txHash, explorerUrl, failedReason} \| null, confirmedCount, onTheirWayCount, totalConfirmedWei, eligibility}` | Auth, Throttle(60) |
| GET | `/shelter/agent/cat-card` | x402-style paid card for AI agents (see below) | Public, Throttle(30) |
| POST | `/shelter/relay` | Relay a donor's signed EIP-3009 authorization to the DonateRouter; the hot wallet pays gas only. Body `{chainId, from, value, validAfter, validBefore, salt, memo, recipients, signature}`, no other keys (see "Wallet gifts" below) | Public, Throttle(10) |
| GET | `/shelter/relay/:txHash` | `{status: submitted\|confirmed\|failed, batchId?, match?: {txHash?, status}}`; 404 for a hash the relay did not send | Public, Throttle(60) |
| GET | `/shelter/match/status` | `?chainId=` optional (default: the main chain). `{state: off\|live\|exhausted\|awaiting-handover, chainId, relay, perGift, dailyLeft, poolLeft}` (decimal USDC strings; `relay`: the gas relay takes gifts on `chainId`; a chain the backend does not serve reads `off`) | Public, Throttle(60) |
| GET | `/shelter/match/by-donor/:txHash` | `{status, matchTxHash \| null}` for a router gift; `status` is `none` before the scan saw it | Public, Throttle(60) |
| POST | `/shelter/claim` | The shelter names its own payout wallet: `{chainId, wallet, signature}` (personal_sign of the claim message). Only wallets on `SHELTER_CLAIM_ALLOWED_WALLETS` (403 `CLAIM_NOT_ALLOWED`). Answers `{status}` of the (one) row for that chain and wallet, `pending-rotation` when new. v2: `{wallet, signature, chains: [ids]}` or `{wallet, signature, allChains: true}` signs the multi-chain message once and answers `{status, chains: [{chainId, status}]}` (one row per chain) | Public, Throttle(5) |
| GET | `/shelter/claim/chains` | Every chain a claim can cover (the main chain, then each configured chain of its network class with a split): `[{chainId, testnet, main, claim: {wallet, chainId, status} \| null}]`. Only `approved` or `rotated` claims show | Public, Throttle(60) |
| GET | `/shelter/claim` | The newest `approved` or `rotated` claim on the configured chain `{wallet, chainId, status}`, or JSON `null`. A `pending-rotation` claim is never shown | Public, Throttle(60) |
| GET | `/shelter/goal/:id` | A campaign goal's count (only `C-001` today; anything else 404): `{ id, chainId, goalUsdc, raised, scannedTo, head, upToDate, transfers, wallets: [{wallet, fromBlock, toBlock, holder}], liveSources, updatedAt, chains: [{chainId, symbols, raised, scannedTo, head, upToDate, transfers}] }` (`shared/shelter-goal.ts`). `raised` is the US dollar stablecoin that came in to the campaign wallets (decimal string, 6 decimals at most), summed from Transfer logs on the campaign chain (Arc) and on every other mainnet in `CRYPTO_PAY_CHAINS` (USDC, USDC.e on Tempo, USDG on Robinhood Chain; never EURC or test coins); `chains` is the per-chain breakdown, the campaign chain first, and `upToDate` is true only when every chain has reached its head. Transfers between campaign wallets are skipped, outflows are never read. `scannedTo` (the campaign chain's) `: null` means nothing is counted yet (claim nothing). `liveSources` lists only what can reach the open wallet today (`treats` while Token Tails holds it; `purchase-shares` only with a split route on the campaign chain) | Public, Throttle(60) |
| GET | `/shelter/:slug/gallery` | Every showable cat of a showcase shelter (only `rozine-pedute`; others 404), uncapped (unlike `/cat/sale`, 200 per shelter): `{ slug, atShelter, adopted, truncated, generatedAt }`, each cat `{ id, name, status, art, photo }` (https only, HEAVEN dropped, `shared/pink-paw.ts`). Cached 45 s | Public, Throttle(60) |

### Shelter gifts on Arc

`POST /shelter/donate` has the Token Tails hot wallet call `ShelterSplit.donate(memo)` with
`SHELTER_DONATE_AMOUNT_WEI` of native USDC (18 decimals on Arc; gas is also paid in USDC). The player
pays nothing and signs nothing. The memo is `tt:<source>:<8 random hex>` and carries no personal data.

With `chainId` naming another network from `GET /shelter/donate/status` `chains` (the give page's
network chips), the hot wallet pays that chain's ShelterSplit in its token instead: `approve` (once,
for the chain's daily treat budget, when the allowance is short) then `disburse(amount, memo)`, or
`disburseWithMemo(amount, bytes32 memo)` on Tempo (the same memo as a bytes32; the network fee is paid
in a USD stablecoin, see docs/BACKEND.md). The once-a-day rule is per player across all chains; the
budget is per chain.

| Status | Body | When |
|---|---|---|
| 200 | `{ txHash, chainId, amountWei, explorerUrl, coin? }` | Broadcast; `explorerUrl` is the chain's explorer (`https://explorer.arc.io/tx/<hash>` on Arc mainnet, `https://explorer.testnet.arc.io/tx/<hash>` on Arc testnet, basescan, arbiscan, the Avalanche, Tempo and Robinhood explorers, MonadVision on Monad). `amountWei` is 18 decimals on every chain; `coin` is set on a token treat. The call returns once broadcast, not once mined; the reconcile job settles it to CONFIRMED or FAILED on its own chain |
| 400 | Validation error | `source` is not `heist` or `page`, `chainId` is not a positive whole number, or the body has other keys |
| 403 | `{code: GUEST_FORBIDDEN}`, `{code: EMAIL_UNVERIFIED}`, `{code: DONATE_NOT_ELIGIBLE, reason, eligibleAt}` | A guest, an unverified email, or the policy (`account-too-new`, `no-saved-game`) |
| 429 | `{code: DONATE_ALREADY_TODAY}` | This user already has a treat for the current UTC day (or the per-user limit) |
| 409 | `{statusCode, code, message}` (`DONATE_PAUSED`, `DONATE_BUDGET_SPENT`) | Treats are switched off (emergency off), the split address or hot wallet key is missing, the picked chain fails its health check (no token or gas on the hot wallet, split paused, RPC down), that chain's daily budget is spent, or `chainId` names a chain that sends no treats (`DONATE_PAUSED`, "Treats are not sent on that network right now") |
| 424 | `{statusCode, code: DONATE_SEND_FAILED, message}` | The broadcast failed; the user may retry later |

The showcase recipient is Pink Paw (Rožinė pėdutė). Its wallet is created and held by Token Tails on
the shelter's behalf until handover; the split's recipients are set in the contract, not by this API.

### Agent cat card (x402-compatible, `onchain-receipt` scheme)

This is an x402-compatible flow with a custom `onchain-receipt` scheme and no facilitator: standard
x402 facilitators may not support Arc, so the server verifies the payment itself over RPC. It is on by
default on the main chain and every `wallet.config.ts` chain of its class (and any `SHELTER_RELAY_CHAINS`
entry with `SHELTER_CHAIN_<id>_X402_ENABLED=true`); a mainnet is offered only once
`publicGivingVerified` passes for that chain (409 when no chain is offered). `accepts` holds one offer per enabled chain, the main chain
first; all offers of one 402 share one nonce, and the first valid payment on any of them spends it. The shelter endpoints never answer 503: in production a 503 reaches clients as a bare gateway 504.

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
       "description": "One adoptable-cat card. The ShelterSplit contract splits each payment among its shelter recipients",
       "mimeType": "application/json",
       "maxTimeoutSeconds": 600,
       "extra": { "memo": "x402:<nonce>", "nonce": "<nonce>", "decimals": 18, "coin": "USDC", "method": "donate" }
     }, {
       "scheme": "onchain-receipt",
       "network": "eip155:8453",
       "maxAmountRequired": "10000",
       "asset": "<the split's token, e.g. Base USDC>",
       "payTo": "<that chain's ShelterSplit>",
       "extra": { "memo": "x402:<nonce>", "nonce": "<nonce>", "decimals": 6, "coin": "USDC", "method": "disburse" }
     }, {
       "scheme": "onchain-receipt",
       "network": "eip155:4217",
       "asset": "<USDC.e>",
       "extra": { "...": "...", "coin": "USDC.e", "method": "disburseWithMemo", "memo32": "0x<keccak256(utf8 memo)>" }
     }]
   }
   ```

   `maxAmountRequired` is in base units of `asset`: wei of native USDC on Arc (`asset: "native"`), the
   token's own decimals (`extra.decimals`, read on chain) elsewhere. Price per chain:
   `SHELTER_X402_PRICE_WEI` on the main chain, `SHELTER_CHAIN_<id>_X402_PRICE` (decimal, default `0.01`)
   on the others. When `exact` is also offered, `accepts` holds only `exact`, and the onchain-receipt
   offers move to top-level `onchainReceipts` (and the first of them to `onchainReceipt`, for older
   clients).

2. The agent pays the offer's `payTo` with the memo. `method: "donate"` (Arc): `ShelterSplit.donate("x402:<nonce>")`
   with at least `maxAmountRequired` wei. `method: "disburse"`: `approve(payTo, amount)` on `asset`, then
   `disburse(amount, "x402:<nonce>")`. `method: "disburseWithMemo"` (Tempo TIP-20): approve, then
   `disburseWithMemo(amount, extra.memo32)` (plain `disburse` with the string memo is accepted too).
3. The agent retries with `X-PAYMENT: base64(JSON {x402Version: 1, scheme: "onchain-receipt",
   network: "eip155:<chainId>", payload: {txHash: "0x..", nonce: "<nonce>"}})`.
4. The server reads the receipt on the chain named by `network` (one of the offered ones) and requires
   status 1 and payout logs from that chain's split whose memo is `x402:<nonce>` (or, on Tempo, the hex
   of `memo32`): `NativeDisbursementBatch`/`NativeDisbursed` for donate, `DisbursementBatch`/`Disbursed`
   for the token paths; the batch amount (or the sum of the shares) must reach the price. The nonce must be one the
   server issued, unused and less than 600 seconds old. A tx hash pays for one card only.
5. 200 returns `{ name, imageUrl, shelterName }` for a random blessing with status `WAITING` (any
   blessing if none waits), plus header `X-PAYMENT-RESPONSE: base64(JSON {success: true, txHash})`.

Any rejected payment (bad header, unknown or expired nonce, receipt missing, reverted or short, tx
already used) is a 402 whose `error` says why and whose `accepts` carries a fresh nonce. A receipt
that is not mined yet does not use up the nonce, so the agent can retry with the same header. 409
means the feature is off, no chain is offered, or there is no card to sell.

**Standard x402 `exact` on the same endpoint** (`x402-exact.ts`, off unless
`SHELTER_X402_EXACT_ENABLED=true`). `payTo` is the shelter's own wallet; the agent signs an EIP-3009
`TransferWithAuthorization`, the facilitator verifies and settles it, and the server re-reads the
`Transfer` log over `SHELTER_X402_EXACT_RPC` (required). Rows not read back are stored with
`verifiedOnchain: false` and left out of the public totals. When `exact` is offered, `accepts` holds
only the `exact` requirement (no `outputSchema` key), because x402-fetch and x402-axios schema-parse
every entry; the `onchain-receipt` offer then moves to a top-level `onchainReceipt` field. `network`
must be an x402 v1 name (base-sepolia uses the public x402.org facilitator; any other network needs
`SHELTER_X402_FACILITATOR_URL`). It is not offered when `payTo` is the split, the router, the treasury
or the hot wallet, when the token's on-chain name, version or decimals (6) do not match, or on a mainnet
before `SHELTER_HANDED_OVER=true`. An authorization valid longer than `maxTimeoutSeconds` + 60 s is a 402.

### Wallet gifts (DonateRouter relay, Token Tails match, shelter claim)

Everything here is off by default and has no game write: scores still go only through
`POST /user/catbassadors/live`. Custody rule: public money moves donor -> DonateRouter -> ShelterSplit
-> shelter wallet in one transaction. The router (F1) has no owner and keeps no gift past the transaction that brings it in (a plain
transfer to it waits for `flush`, which can only pay the shelters); the hot wallet
pays the relay gas and sends the match from Token Tails' own funds, and never receives donor money.

**Mainnet gate.** On a mainnet (`5042` or any chain id not in the testnet list of
`shelter-onchain.config.ts`), relay, match, flush and the onchain-receipt x402 offer stay closed (`RELAY_AWAITING_HANDOVER` /
state `awaiting-handover`) until the shelter's own wallet is claimed and rotated on that chain.
Testnets work whenever enabled (test money). Two checks decide it: `publicGivingAllowed(config)` (only
the emergency off `SHELTER_HANDED_OVER=false` closes it), then
`ShelterClaimService.publicGivingVerified(config)`, read on chain: every wallet in
`split.preview(1 USDC).wallets` must be a `rotated` claim on that chain and none may be the hot wallet,
the treasury, the split, the router, an `IMPACT_PAWS_SENDERS` or a `SHELTER_MATCH_EXCLUDE` address (cached
10 minutes; a failed read is closed). Neither check can stop a stranger calling a deployed router
directly, so no DonateRouter is deployed on a mainnet before the handover.

**`POST /shelter/relay`.** The donor signs USDC's `ReceiveWithAuthorization` (EIP-712 domain: the
token's `name()` and `version()`, `chainId`, the USDC address) with `to` = the router and
`nonce = keccak256(abi.encode(router, keccak256(bytes(memo)), salt, recipients))`, where `recipients`
(also in the body, 0x + 64 hex) is `router.recipientsHash(value)` read when the donor signs: the payout
list is part of the signature. `value` is in 6-decimal base units; `memo` is
`tt:wallet:<8 lowercase hex>`. The server checks, in order: relay on, router and key
set (409 `RELAY_OFF`); `chainId` is the configured chain (400 `RELAY_WRONG_CHAIN`); the mainnet flag
(409 `RELAY_AWAITING_HANDOVER`); memo (400 `RELAY_BAD_MEMO`); `SHELTER_RELAY_MIN_USDC` <= value <=
`SHELTER_RELAY_MAX_USDC` (400 `RELAY_AMOUNT`); `validAfter <= now + 5 s` (send `0`), `now + 30 s <
validBefore <= now + 600 s` (400 `RELAY_WINDOW`); nonce not relayed before (409 `RELAY_REPLAY`); the
on-chain half of the mainnet gate (409 `RELAY_AWAITING_HANDOVER`); `router.canDonate(value)` (409
`RELAY_SPLIT_UNAVAILABLE` with `toTreasury` when the split is paused or part of the gift would reach the
treasury). It then `eth_call`s `donateWithAuthorization` (bytes signature) as the hot wallet; on a
revert it tries `donateWithAuthorizationVRS` with the 65-byte signature split into v, r, s. Only a gift
that simulates cleanly takes a cap: `SHELTER_RELAY_DAILY_TX` relays a UTC day in total (429
`RELAY_DAILY_CAP`) and 5 per signer (429 `RELAY_SIGNER_CAP`), so junk requests cannot hold a slot.
A revert that both refuse is
409 `RELAY_RECIPIENTS_CHANGED` (the shelter list changed after signing: sign again), 400
`RELAY_BAD_SIGNATURE`, 409 `RELAY_REPLAY`, 400 `RELAY_WINDOW` or 400 `RELAY_REJECTED` with a short
`reason`. When the relay's own transaction reverts or times out, the reconcile first asks USDC
`authorizationState(from, nonce)`: if the nonce was used by a `RouterDonation` carrying it (someone
else submitted the signature first), the row is `confirmed` with that transaction as `settledTxHash`
(shown by `GET /shelter/relay/:txHash`) instead of `failed`, so the donor is never asked to give twice. A broadcast the node certainly refused is 424 `RELAY_SEND_FAILED` and frees the nonce and the
caps (the same signature can be retried); an ambiguous one is returned as `submitted`. 200 is
`{txHash, status: 'submitted'}`. Error bodies are `{statusCode, code, message}`; the `RELAY_*` codes are
local to these routes (not in `shared/errors.ts`). The caller IP is stored only as a truncated
HMAC-SHA-256 keyed with the secret `SHELTER_RELAY_IP_PEPPER`; without the pepper no IP hash is stored.
`GET /shelter/relay/:txHash` looks the match up by the transaction that paid (`settledTxHash` when
someone else submitted first).

**Match.** Every `RouterDonation` from the configured router (signed path 0 or native path 1; a flush,
path 2, is never matched), from a donor that is not public-excluded (the hot wallet,
`IMPACT_PAWS_SENDERS`, `SHELTER_MATCH_EXCLUDE` team wallets, `SHELTER_TREASURY_ADDRESS`, and, read on
chain, every wallet the split pays and its `treasury()`), made less than a day before the scan reads
it, of at least `SHELTER_MATCH_MIN_GIFT`, gets `min(gift, SHELTER_MATCH_PER_GIFT, left today, left in
SHELTER_MATCH_POOL)` from the hot wallet into ShelterSplit with memo `tt:match:<first 8 hex of the
donor tx>`, once per donor transaction. Smaller gifts are `skipped-small`; an empty budget is
`skipped-cap`; a match `split.preview` says would send any part to the treasury is `skipped-cap` with
`failedReason: 'treasury-share'` (no budget taken). Statuses: `pending`, `sent`, `confirmed`,
`skipped-cap`, `skipped-small`, `failed`. The scan stays `MATCH_CONFIRMATIONS` blocks behind the head
(Arc 0, every other chain 12) and, outside Arc, a gift whose receipt is gone when the match is sent is
`failed` (`donor-missing`). While the match is off or gated, the scan cursor still moves to the head,
so turning it on never pays for gifts made while it was off. The hourly flush claims its hour with one
conditional write, so two backend instances cannot both send it.

**Shelter claim.** The message is exactly (`shelterClaimMessage` in `shelter-claim.service.ts`):

```
Token Tails shelter payout wallet
Shelter: Pink Paw (Rozine pedute)
Wallet: <checksummed address>
Chain: <chainId>
Issued: <UTC date YYYY-MM-DD>
```

The v2 message (`shelterClaimMessageV2`, the client's `claimMessageV2`) covers several chains with one
signature; the v1 text above keeps working for the main chain, byte for byte:

```
Token Tails shelter payout wallet (v2)
Shelter: Pink Paw (Rozine pedute)
Wallet: <checksummed address>
Chains: <chain ids, ascending, ", "-separated> | all chains where Pink Paw is listed
Issued: <UTC date YYYY-MM-DD>
```

With `allChains: true` it covers `GET /shelter/claim/chains` at that moment; a listed chain the
backend does not serve is refused (400). Each chain gets its own row and status, and
`publicGivingVerified` reads the rows of the chain it gates.

Today's or yesterday's UTC date is accepted. `chainId` must be the configured chain (400
`CLAIM_REFUSED`). A signature proves control of a wallet, not who holds it, so `wallet` must first be on
`SHELTER_CLAIM_ALLOWED_WALLETS`, set after the shelter named the address to Token Tails through a
separate channel (403 `CLAIM_NOT_ALLOWED`). The signature must recover `wallet` (EIP-191). The hot
wallet, the treasury (`SHELTER_TREASURY_ADDRESS` and the split's `treasury()`), the split, the router
and the zero address are refused (400 `CLAIM_REFUSED`). One row per chain and wallet (unique index);
statuses `pending-rotation` -> `approved` (an admin confirmed it with the shelter) -> `rotated` (the
split pays it), or `rejected`, set by hand in the database. A claim moves no money: the split owner
rotates the recipient by hand (`fund.mjs shelter rotate --dry-run` first) to the address confirmed with
the shelter, never one read from `GET /shelter/claim`, then marks the claim `rotated` and the handover. This is a
different message from the payout-evidence signature of `POST /impact/payouts/:id/signature`, which
stays refused with `PAYOUT_HANDOVER_PENDING` until the handover is recorded.

Known limits:

- A relayed gift counts toward the signer's cap even if it later reverts on-chain (the slot is given
  back only for a refusal before broadcast).
- The match is sent by the 2-minute reconcile job, so it lands a few minutes after the gift.
- On chains whose native coin is not USDC the match is two transactions (approve, then disburse) and the
  job waits up to 60 seconds for the approve.
- The flush keeper (`router.flush('tt:flush')`, at most hourly, for at least 0.01 USDC) runs only while
  the relay or the match is on.
- Fixed (docs, 2026-10-05): the x402 section said both "never answer 503" and "503 means the feature is
  off". The code answers 409 (`shelter-x402.service.ts`); the paragraph now says 409.

## Impact

Public numbers (plan F7). Every response is free of emails, wallet keys, user lists, user ids and
ObjectIds; public ids look like `p-…` and `o-…`.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/impact` | The latest hourly snapshot (`PublicImpact`, `backend/src/impact/impact-public.ts`, `_v: 1`): `generatedAt`, `asOf`, `sources {chain, mongo}` (`ok`, `error`, `not-deployed`), `money` per currency and evidence tier (summed over every indexed chain of the main chain's class; `money.byChain` per chain id when more than one), `custody`, `rail` (state, treat size, budget, `treatsLeftToday`, `resetsAt`; the live fields are overlaid from `/shelter/donate/status`, so up to 1 minute old here and up to an hour old in the CDN mirror), `shelters` (partners, active countries), `rescueCats` (rescue kind, house zones excluded), `players` (`registeredAllTime`, `active30d` or null), `outcomes`, `pledges`, `pawSettlements`, `attestations`, `rescueGoals`. A stored snapshot older than 2 hours is served with `sources.mongo: 'error'` | Public, Throttle(60) |
| GET | `/impact/history?days=1..90` | `{points}`: daily snapshot points | Public, Throttle(60) |
| GET | `/impact/outcomes` | Published shelter outcomes (at most 100; cached 60 s) with the tier of a linked payout | Public, Throttle(60) |
| GET | `/impact/me` | The caller's treats sponsored, paws (today's progress "N more runs", lifetime count, latest settlement, the caller's Merkle proof with its own salt) and pledges | Auth, Throttle(60) |
| GET | `/impact/payouts` | Off-chain payouts visible to the caller (managers, shelter members) | Auth |
| POST | `/impact/payouts` | Create a DRAFT payout: multipart receipt (hashed with SHA-256, never stored) plus fields; `reference` and `fxSource` refuse emails, phone numbers, IBANs and control characters | Perm(4), Throttle(20) |
| GET | `/impact/payouts/:id` | One payout with its attestation text | Auth |
| PUT | `/impact/payouts/:id` | Edit a draft (the editor can no longer confirm it) | Perm(4) |
| POST | `/impact/payouts/:id/void` | Void a draft | Perm(4) |
| POST | `/impact/payouts/:id/confirm` | A shelter member who neither created nor edited the draft confirms it with the same receipt (SHELTER-CONFIRMED). 403 `PAYOUT_AUTHOR_CANNOT_CONFIRM`, `PAYOUT_STAFF_CANNOT_CONFIRM`, `PAYOUT_NOT_A_MEMBER`; 400 `PAYOUT_RECEIPT_MISMATCH`; 409 `PAYOUT_STALE_ATTESTATION`, `PAYOUT_NOT_DRAFT` | Auth |
| POST | `/impact/payouts/:id/signature` | An EIP-191 signature by the handed-over shelter wallet (SHELTER-SIGNED). 409 `PAYOUT_HANDOVER_PENDING` before handover, 400 `PAYOUT_BAD_SIGNATURE` | Auth (member or Perm(4)) |
| GET, POST | `/impact/outcomes/manage` | List, create shelter outcomes | Perm(4) |
| GET, PUT | `/impact/outcomes/manage/:id` | Read, edit an outcome | Perm(4) |
| POST, DELETE, GET | `/impact/outcomes/manage/:id/image` | Upload (processed and kept private), remove, preview the redacted image | Perm(4) |
| PUT | `/impact/outcomes/manage/:id/redaction` | Mark the redaction reviewed (required, also without a photo) | Perm(4) |
| POST | `/impact/outcomes/manage/:id/approve` | Publish: the approver is neither author nor redactor (403 `OUTCOME_SAME_REVIEWER`, 409 `OUTCOME_NOT_REDACTED`); uploads the image. 503 without `DO_SPACES_CDN` | Perm(4) |
| POST | `/impact/outcomes/manage/:id/unpublish` | Withdraw: deletes the public image and strips the outcome from stored snapshots | Perm(4) |
| GET | `/impact/paws/settlements` | Paw settlements with `budgetWei` and `suggestedBudgetWei` | Perm(5) |
| POST | `/impact/paws/:day/settle` | Settle one UTC day by hand; idempotent. `{retry: true}` reopens only a send that certainly did not pay | Perm(5) |

## Rescue Goals

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/rescue-goals?status=&limit=&surface=` | Current and open goals (expired OPEN goals are left out of `current` and `open`); `surface=app` drops web-only fields (the delivery `txHash`). Progress in Tails; no money, funding or giver counts. Each goal carries `expired`. `Cache-Control: public, max-age=30` | Public |
| GET | `/rescue-goals/:id` | One goal (may be `expired`) | Public |
| POST | `/rescue-goals/:id/pledge` | Give Tails: body `{pledgeId: <UUID>, amount: 10..5000}`. Re-send the same `pledgeId` on a retry or a 503 `PLEDGE_INTERRUPTED`; it debits once. Answers per "Error bodies" (`PLEDGES_PAUSED` 503 until the earned-Tails backfill is done, `PLEDGE_NOT_ELIGIBLE` under 72 h or 3 saved games, `PLEDGE_BALANCE`, `PLEDGE_DAILY_CAP` at 5,000 a day, `GOAL_NOT_OPEN`, `GOAL_OVERFLOW`) | Auth, User(10) |
| GET | `/rescue-goals/pledges/me` | The caller's gives, today's cap room, totals, eligibility, limits and badges (Treat Giver: 5 confirmed treats this season). `Cache-Control: private, no-store` | Auth |
| POST | `/rescue-goals` | Create a goal: needs `fundingSetAside: true`, a funding line, an amount and a proof owner; at most 10 per budget month; not for a house shelter; cover image only from Token Tails storage | Perm(4) |
| PUT | `/rescue-goals/:id` | Edit wording, or extend `endsAt` (reopens an expired goal) | Perm(4) |
| POST | `/rescue-goals/:id/deliver` | Multipart photo (JPEG, PNG or WebP, at most 5 MB, re-encoded and public) and receipt (private; its SHA-256 public), optional note and web-only tx hash | Perm(4), Throttle(20) |
| POST | `/rescue-goals/:id/cancel` | Cancel with a reason; refunds every give exactly once and releases that day's cap share | Perm(4) |
| GET | `/rescue-goals/admin/goals`, `/rescue-goals/admin/goals/:id`, `/rescue-goals/admin/goals/:id/receipt` | Manager views with funding, proof owner and the private receipt | Perm(4) |

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
| POST | `/image/create-checkout-session` | Stripe Checkout for `digital`, `print`, `canvas` at the server price ($6, $49, $69; a sent `amount` is ignored); creates a pending order; may create a user from `email` (lowercased, with a locked starter and no onboarding) | Public, Throttle(5) |
| POST | `/image/create-checkout-session-signed` | Same, user taken from the caller | Auth, Throttle(5) |
| POST | `/image/webhook` | Stripe webhook; on `checkout.session.completed` checks the session is paid at the server price, completes the pending order once, emails the buyer, creates the blessing (`kind: portrait`) and cat, and writes `spent`, `monthSpent` and `spentUsd` from the verified USD amount | Stripe, not throttled |
| GET | `/image/order/status?_id=` | Poll an order's status. Returns only `_id status entityType id image price`; 400 when `_id` is not an ObjectId | Public |

## Web3 and payments

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/web3/confirm` | Verify a Stellar transaction hash via Horizon (successful, pays the treasury, in the order's XLM or USDC, at least the server catalogue price less a verified discount; the body `price` is ignored), complete the order, grant a cat, credit the affiliate. `entityType` must be `IMAGE` or `LOOT_BOX` (with no `id`), else 400 before any order exists. **`PACK` is deprecated (2026-10-04): the client no longer offers it; packs are bought through the crypto checkout below or Stripe.** Because the client pays before it confirms, a pack payment that still arrives (a cached old tab, a payment in flight at deploy) is verified and recorded first: one whose Stellar ledger closed before `STELLAR_PACKS_SUNSET_AT` (ISO time; default `2026-10-11T00:00:00Z`, set it to deploy time plus about 7 days) is granted as before; a later one is `FAILED_GRANT` (`STELLAR_DEPRECATED`) with `refund: 'due'` and answers 410 `{code: 'STELLAR_PACKS_DEPRECATED', refund: 'due'}`, so no payment is lost. `STELLAR_PACKS_ENABLED=true` turns the old path back on (rollback switch only). Loot boxes are still sold on Stellar (`MysteryBoxCat` uses `Web3Transfer`); whether to move them to the crypto checkout is an open decision. Existing Stellar pack orders, their history, the audit scripts and `refund: 'due'` handling are unchanged. The hash is lowercased and must be the payment's outer hash (for a fee-bump, the fee-bump hash; the inner hash is refused). `spent`, `monthSpent`, `spentUsd` and the affiliate credit use the verified amount. A loot box whose grant fails is `FAILED_GRANT` and answers `{success: false, refund: 'due'}`: the treasury refunds Stellar orders by hand. 400 when verification fails (the hash is released for a retry), 409 when the hash, or another hash of the same payment, already backs an order, 503 when Horizon or the XLM rate is unavailable | Auth |
| POST | `/web3/create-payment` | Create a Stripe PaymentIntent at the server price; a sent `amount` is ignored. Packs (`entityType: 'PACK'`, `id` = pack type) and portraits: table price less a verified `discount` code. **Shelter cats** (`entityType: 'CAT'`, `id` = the catalogue cat id from `GET /cat/sale`): a fixed $5 (no env override), never discounted; 400 `Cat is not for sale` for anything that is not an unowned shelter cat, 409 `User already owns this NFT cat` when the caller already has a copy. Returns `clientSecret` | Auth |
| POST | `/web3/confirm-payment` | Verify the PaymentIntent belongs to the caller, succeeded, is in USD and covers the server price, then grant once: a replayed confirm returns `{ success: false }` and grants nothing. The discount comes from the intent, not the body. A pack rolls a tier; a shelter cat is granted at the basic tier (`COMMON`, origin `adopt`) through the same adoption path packs use, and its shelter share is recorded exactly like a crypto purchase paid to the treasury (a `card` row in `cryptocheckouts` for the keeper; see "Shelter cats" in BACKEND.md). A failed grant is refunded through Stripe (`{success: false, refund: 'refunded'}`). Stripe and database errors return a fixed message | Auth |
| POST | `/web3/validate-discount` | Validate a discount code; returns the percentage | Public |
| GET | `/web3/pack/:packType/:id` | Grant a `STARTER`, `INFLUENCER`, or `LEGENDARY` pack cat without payment | Perm(5) |
| GET | `/web3/loot/buyers` | Eligible loot-drop buyers since a fixed date, with wallet and email | Perm(5) |

`POST /web3/create` was removed (2026-09). It had no client or CMS caller, took `user` from the
body, and let any signed-in caller park a pending order on someone else's transaction hash, which
the unique `hash` index then turned into a permanent 409 for the real buyer.

### Crypto checkout (USDC and EURC on every integrated EVM chain)

`src/payments/crypto/`. Replaces the Stellar pack purchase. The server prices an order, lists every
chain and token it accepts, the buyer pays from their own wallet, and the server verifies the
transaction on-chain before it grants anything, exactly once. Off unless `CRYPTO_PAY_ENABLED=true`.
Environment variables are in BACKEND.md "Crypto checkout".
Client: `client/components/web3/crypto/` (packs and shelter cats, web only; docs/CLIENT.md "Crypto
checkout"). It checks every option's `steps` against its coin, recipient and exact amount before a
wallet sees them, and polls `confirm` through 202.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/payments/crypto/config` | What the checkout accepts right now: `enabled`, `network`, prices, the EURC table rate, and per chain the tokens with address and decimals. No order is created | Public, Throttle(60) |
| POST | `/payments/crypto/orders` | Create an order for one SKU at the server price, with every accepted payment option | Auth, User(10) |
| GET | `/payments/crypto/orders/:orderId` | The caller's own order (404 for anyone else's) | Auth |
| POST | `/payments/crypto/orders/:orderId/confirm` | Verify `{chainId, txHash}` on-chain and grant once | Auth, User(20) |
| POST | `/payments/crypto/recover-grants` | Finish paid orders whose grant never stored a result (also every 5 minutes; see "Stuck grants" below) | Perm(5) |
| POST | `/payments/crypto/shelter-share/run` | Run the shelter-share keeper once (see "Shelter cats" below) | Perm(5) |

Errors carry `{ statusCode, code, message }` with these payment-local codes (not in `shared/errors.ts`):

| Code | Status | Meaning |
|---|---|---|
| `CRYPTO_PAY_DISABLED` | 503 | `CRYPTO_PAY_ENABLED` is not true, no chain has both an RPC and a receiving address, or the unique index `amount_reserved` is missing (checked before the first order, again every minute while missing) |
| `CRYPTO_PAY_BAD_SKU` | 400 | Unknown `sku.kind`, pack type, or a malformed `catId` |
| `CRYPTO_PAY_NOT_FOR_SALE` | 404 | The cat is not an unowned shelter cat on sale (`GET /cat/sale`) |
| `CRYPTO_PAY_ALREADY_OWNED` | 409 | The caller already owns a copy of that cat, or a payment of theirs for it is being granted |
| `CRYPTO_PAY_BUSY` | 503 | No unique amount could be reserved (thousands of open orders on one token); retry |
| `CRYPTO_PAY_TOO_MANY_ORDERS` | 429 | The caller already has 3 open, unexpired orders (other items) |
| `CRYPTO_PAY_NOT_FOUND` | 404 | No such order for the caller |
| `CRYPTO_PAY_WRONG_CHAIN` | 400 | `chainId` is not one of the order's `accepted` options |
| `CRYPTO_PAY_BAD_TX` | 400 | `txHash` is not a 0x-prefixed 32-byte hex string |
| `CRYPTO_PAY_TX_FAILED` | 400 | The transaction reverted |
| `CRYPTO_PAY_NO_MATCHING_TRANSFER` | 400 | The transaction moves no `token` to `recipient` with this order's exact `amount` (or memo) |
| `CRYPTO_PAY_UNDERPAID` | 400 | A memo-bound payment for this order is below `amount`, or an amount-bound transfer to the recipient is up to 5% below the exact `amount` (an exchange withdrawal that took a fee). Never accepted; support can match it by hand |
| `CRYPTO_PAY_TX_BEFORE_ORDER` | 400 | The transaction was mined before the order existed |
| `CRYPTO_PAY_TX_USED` | 409 | The transaction already backs another order |
| `CRYPTO_PAY_EXPIRED` | 410 | The payment was mined more than 2 hours after `expiresAt` (then the order is `LATE`, recorded with `refund: 'due'` to the paying wallet) |
| `CRYPTO_PAY_RPC_UNAVAILABLE` | 503 | The chain could not be read; retry |

#### `GET /payments/crypto/config`

```json
{
  "enabled": true,
  "network": "mainnet",
  "orderTtlSeconds": 1800,
  "shelterHandedOver": false,
  "prices": { "packs": { "STARTER": 5, "INFLUENCER": 25, "LEGENDARY": 350 }, "shelterCat": 5, "lootBox": 1 },
  "fx": { "EURC": { "perUsd": "1", "asOf": null, "source": "fixed" } },
  "chains": [
    {
      "chainId": 8453, "name": "Base", "testnet": false, "explorer": "https://basescan.org", "confirmations": 12,
      "tokens": [
        { "token": "USDC", "symbol": "USDC", "address": "0x8335…2913", "decimals": 6 },
        { "token": "EURC", "symbol": "EURC", "address": "0x60a3…db42", "decimals": 6 }
      ]
    }
  ]
}
```

- `network` is `mainnet` or `testnet` (`CRYPTO_PAY_NETWORK`; default `mainnet` when `NODE_ENV=production`,
  else `testnet`). Mainnet and testnet options are never mixed in one response.
- A chain is listed only when it has an RPC URL and a receiving address. A mainnet needs a configured RPC
  (`CRYPTO_PAY_RPC_<chainId>` or the chain's funding variable): public RPCs are used on test networks only,
  because the RPC's receipt decides whether an item is given. Under `NODE_ENV=production`
  `CRYPTO_PAY_NETWORK=testnet` is ignored (mainnet is used) unless `CRYPTO_PAY_ALLOW_TESTNET_IN_PROD=true`, and
  the local chain 31337 is never listed. Chains come from
  `src/payments/crypto/crypto-chains.ts`, a pinned copy of `funding/framework/tracks/a-build/chains.json`
  (USDC and EURC entries, plus Robinhood's USDG): Arc, Base, Arbitrum One, Avalanche C-Chain, Tempo, Robinhood
  Chain, Monad, and their testnets, plus a local anvil chain (31337) in testnet mode when its token addresses
  are set. Robinhood Chain takes USDG (`token` `USDC`, `symbol` `USDG`: a US dollar stablecoin priced 1:1);
  Robinhood testnet takes the wave's mock mUSDC, never under `NODE_ENV=production`. Mezo (MUSD) is not
  offered. Native gas coins (ETH, AVAX, MON) are never accepted.
- `symbol` is what the token calls itself (`USDC.e` on Tempo, `pathUSD` on Tempo testnet); `token` is the
  kind the price is computed in (`USDC` or `EURC`).
- `fx.EURC`: how EURC is priced, never a live feed.
  - `source: 'fixed'` (no `CRYPTO_PAY_EURC_PER_USD`, or `1`): a fixed euro price, the same number of EURC as US
    dollars (a $5 cat is 5 EURC), `asOf: null`. It is not a conversion; the client says so.
  - `source: 'dated'`: `CRYPTO_PAY_EURC_PER_USD` (EURC per USD, 0.5 to 2) with `CRYPTO_PAY_EURC_FX_DATE`
    (`YYYY-MM-DD`). EURC is left out of every chain while that rate is undated, out of bounds, or more than
    30 days old, so a stale rate never prices an item. Amounts round up, so the buyer never pays below the
    USD price at that rate.
- Prices are USD. `prices.packs.LEGENDARY` is the server table ($350); the client pack card shows $400
  (known discrepancy in `src/payments/price-table.ts`). The web checkout reads this endpoint before it
  shows payment methods: it offers crypto only when `enabled` is true and `chains` is not empty, and
  its summary and quote use `prices` (the amount both checkouts charge).

#### `POST /payments/crypto/orders`

Body: `{ "sku": <sku>, "discount"?: string }` where `<sku>` is one of

- `{ "kind": "PACK", "packType": "STARTER" | "INFLUENCER" | "LEGENDARY" }`: table price less a verified
  discount code (same rule as Stripe);
- `{ "kind": "CAT", "catId": "<catalogue cat id from GET /cat/sale>" }`: a shelter cat at the basic tier,
  a fixed $5, never discounted (`discount` is ignored). Starters are never for sale;
- `{ "kind": "LOOT_BOX" }`: $1, common odds, no discount.

One buyer, one open order per item: when the caller already has an open, unexpired order for the same
SKU (and the same discount code), that order is returned instead of a new one, renewed (`expiresAt` = now
+ the order lifetime, same id, amounts and memo) when it has under 3 minutes left. At most 3 open orders
per caller (429 `CRYPTO_PAY_TOO_MANY_ORDERS`). A cat with a paid order still being granted is refused
(409 `CRYPTO_PAY_ALREADY_OWNED`).

201 (or the existing order):

```json
{
  "orderId": "co_9f2c4e1a7b3d5e60",
  "status": "OPEN",
  "sku": { "kind": "CAT", "catId": "67b4…", "tier": "COMMON", "name": "Mochi",
           "shelter": { "_id": "67b48fafd6c26c6cd40bfec6", "name": "Rožinė pėdutė", "slug": "rozine-pedute" } },
  "priceUsd": 5,
  "priceUsdCents": 500,
  "discount": null,
  "createdAt": "2026-10-04T12:00:00.000Z",
  "expiresAt": "2026-10-04T12:30:00.000Z",
  "accepted": [
    {
      "chainId": 8453, "chainName": "Base", "testnet": false, "explorer": "https://basescan.org",
      "token": "USDC", "symbol": "USDC", "tokenAddress": "0x8335…2913", "decimals": 6,
      "amount": "5000137", "amountDisplay": "5.000137",
      "recipient": "0x<treasury>", "route": "transfer", "binding": "amount", "memo": null,
      "steps": [ { "kind": "transfer", "to": "0x8335…2913", "data": "0xa9059cbb…", "value": "0" } ]
    },
    {
      "chainId": 4217, "chainName": "Tempo", "token": "USDC", "symbol": "USDC.e", "decimals": 6,
      "amount": "5000000", "amountDisplay": "5",
      "recipient": "0x<treasury>", "route": "transferWithMemo", "binding": "memo",
      "memo": "0x74743a636f5f39663263…00",
      "steps": [ { "kind": "transferWithMemo", "to": "0x20C0…8b50", "data": "0x…", "value": "0" } ]
    },
    {
      "chainId": 5042, "chainName": "Arc", "token": "USDC", "symbol": "USDC", "decimals": 6,
      "amount": "5000000", "amountDisplay": "5",
      "recipient": "0x<ShelterSplit>", "route": "split", "binding": "memo", "memo": "tt:cat:9f2c4e1a7b3d5e60",
      "steps": [
        { "kind": "approve", "to": "0x3600…0000", "data": "0x095ea7b3…", "value": "0" },
        { "kind": "disburse", "to": "0x<ShelterSplit>", "data": "0x…", "value": "0" }
      ]
    }
  ],
  "shelterShare": { "route": "treasury", "bps": 5000, "evidenceTier": "pledged" }
}
```

- `amount` is in the token's base units (a decimal string; never a float). The wallet must send exactly
  `amount`. `steps` are ready-to-send transactions (`to`, `data`, `value` in wei), in order; a client may
  send them as they are or rebuild them from the other fields.
- `binding` says how the payment is tied to this order:
  - `amount`: the default. `amount` is the price plus a unique tag of 1 to 9,999 base units (under one
    cent), reserved for this order on that chain and token (unique index `amount_reserved`) until 2 hours
    after `expiresAt`, or 24 hours after it once someone has called `confirm` on the order. The server
    matches a `Transfer(from, recipient, amount)` log of `tokenAddress` exactly. Buyers must send from
    their own wallet: an exchange withdrawal that takes a fee does not match (the client says so).
  - `memo`: Tempo (`route: 'transferWithMemo'`, TIP-20 `transferWithMemo(recipient, amount, memo)`; `memo` is
    the 32-byte `tt:<orderId>`) and the shelter split (`route: 'split'`; `memo` is the string the split
    emits). `amount` is the plain price, the same for every order of an item, so only the memo binds: a
    `TransferWithMemo` (or split batch) with this order's memo and at least `amount` is accepted, and a
    plain `Transfer` never is (TIP-20 also emits one for every memo transfer; matching it would let
    another buyer claim this payment).
- `route: 'split'` appears only for shelter cats, only once the shelter holds its own key
  (`SHELTER_HANDED_OVER=true`, and on a mainnet the on-chain check that every split recipient is a rotated
  shelter-held wallet), and only on chains where that shelter's ShelterSplit is configured. The buyer
  pays the split directly: `approve(split, amount)`, then `disburse(amount, memo)`; the split pays the
  shelter its on-chain share and the Token Tails treasury the rest in the same transaction.
- `recipient` for `transfer` and `transferWithMemo` is the Token Tails treasury on that chain (public
  addresses in `src/payments/crypto/treasury.public.ts`, overridable per chain by env). Purchases are
  commerce: they go to the treasury, never to a wallet Token Tails holds for a shelter (refused at startup
  of the config, `heldWallets`).
- `shelterShare` (shelter cats only, else `null`):
  - `route: 'split'`: the share is paid on-chain by the buyer's own split transaction;
  - `route: 'treasury'`: the price goes to the treasury and the shelter share is sent later from the Token
    Tails hot wallet through ShelterSplit (memo `tt:cat:<16 hex>`), see BACKEND.md;
  - `bps`: the shelter share for the treasury route (`CRYPTO_PAY_CAT_SHELTER_BPS`), `null` while undecided
    (then no share is sent; the split route uses the split's on-chain shares instead);
  - `evidenceTier`: `pledged` until sent, then `onchain-custodial` before the handover or
    `onchain-shelter-held` after it (the money tiers of `client/components/claims/tiers.ts`).
  These are functional fields: no surface shows a share percentage unless the facts registry has it.
- An order expires after `orderTtlSeconds` (`CRYPTO_PAY_ORDER_TTL_MIN`, default 30 minutes). A payment
  mined up to 2 hours after `expiresAt` is still granted (a shelter cat is checked for sale again first;
  if it is gone, `FAILED_GRANT` with `refund: 'due'`, reason `NOT_FOR_SALE`). The client refuses to start a
  wallet payment with under 2 minutes left and offers a new order (which renews this one).

#### `GET /payments/crypto/orders/:orderId`

The same body as the create response, plus, once known:

```json
{
  "status": "COMPLETE",
  "payment": { "chainId": 8453, "txHash": "0x…", "from": "0x…", "token": "USDC", "amount": "5000137",
               "blockNumber": 123, "route": "transfer" },
  "grant": { "success": true, "message": "Congratz on your new cat!", "catId": "68…" },
  "shelterShare": { "route": "treasury", "bps": 5000, "evidenceTier": "onchain-custodial",
                    "state": "confirmed", "amountUsdCents": 250, "txHash": "0x…", "chainId": 5042 }
}
```

`status`: `OPEN` (awaiting payment), `EXPIRED` (no payment before `expiresAt`), `PAID` (verified, grant
in progress), `COMPLETE` (granted), `FAILED_GRANT` (paid but not granted; `grant.refund: 'due'`), `LATE`
(paid more than 2 hours after `expiresAt`; `refund: 'due'`; a later payment mined in time still completes
the order).

#### `POST /payments/crypto/orders/:orderId/confirm`

Body: `{ "chainId": 8453, "txHash": "0x…" }`.

| Status | Body | When |
|---|---|---|
| 200 | `{ status: 'COMPLETE', success: true, message, cat }` | Verified and granted now |
| 200 | `{ status: 'COMPLETE' \| 'FAILED_GRANT', success, message, replay: true, … }` | The same transaction was already confirmed for this order: nothing is granted again |
| 200 | `{ status: 'FAILED_GRANT', success: false, message, refund: 'due' }` | Paid, but the grant failed (an empty pack pool, the cat already owned): the treasury refunds by hand |
| 202 | `{ status: 'CONFIRMING', confirmations, required }` | The transaction is not mined yet (`confirmations: 0`) or has fewer than the chain's `confirmations`; call again |
| 202 | `{ status: 'CONFIRMING', replay: true, message }` | The payment is verified and the item is still being granted (another confirm is granting, or a grant died and the sweep will finish it); call again. Never shown as a refund |
| 4xx/5xx | `{ statusCode, code, message }` | See the codes above |

Verification, in order: the chain is one of the order's options; the receipt exists and succeeded; it has
at least the chain's confirmations; its block is not older than the order (2 minutes of clock skew);
a log of the option's token contract pays the option's recipient (exact `amount` for `amount` binding,
the memo and at least `amount` for `memo` binding; for `split`, also the split's `DisbursementBatch`
with this memo); the block time is not more than 2 hours after `expiresAt`. The transaction hash is unique across all
orders (`Order.hash = evm:<chainId>:<txHash>`, index `hash_unique`), so one payment never grants twice. A
second, different payment for an order that is already paid is recorded with `refund: 'due'`.

On success the server writes an `Order` (`chainType: 'EVM'`, `currencyType` `USDC` or `EURC`,
`priceUsd` = the USD price, `walletAddress` = the paying wallet) and grants through the same path as
Stripe: a pack rolls its tier; a shelter cat is a `COMMON` copy (origin `adopt`); a loot box is a common
cat. `spent`, `monthSpent`, `spentUsd` and the affiliate credit use the USD price, counted once per order.

#### Stuck grants

The grant takes a lease (`grantStartedAt`) before it runs. If the process dies before the result is
stored, the order stays `PAID` with no `grant`; confirm answers 202 for it. Every 5 minutes (and on
`POST /payments/crypto/recover-grants`) orders `PAID` with no grant whose lease is over 5 minutes old are
finished: when their `Order` is already `COMPLETE` or `FAILED_GRANT` that result (and its refund) is
copied; a shelter cat the buyer already holds counts as delivered; otherwise the grant runs again under a
new lease, with the spend counted once. Known gap: a pack whose adoption succeeded in the single write
before the crash, without its `Order` being marked, is granted a second cat.

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
| GET | `/quest/complete/:quest` | Claim a quest reward by static quest key or quest id; one conditional write, so a quest pays once (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth, User(10) |
| GET | `/quest/contest/:contest` | Claim a camp mystery box (`CAMP_6` to `CAMP_9`); pays once (side-effecting GET, open: move to POST, see BACKEND.md Security) | Auth, User(10) |

## Tickets

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/ticket` | Caller's tickets | Auth |
| POST | `/ticket` | Create; one per user per calendar day | Auth |
| POST | `/ticket/search` | All tickets | Perm(4) |
| POST | `/ticket/search/unanswered` | Tickets without an answer, with reporter contact fields | Perm(4) |
| PUT | `/ticket/:id` | Write the answer | Perm(3) |

## Enumerations used in payloads

The enums marked "shared" live in `shared/enums.ts` and are generated into every package.

| Enum | Values |
|---|---|
| `GameType` (shared) | `SHELTER`, `HOME`, `PURRQUEST`, `CATBASSADORS`, `CATNIP_CHAOS`, `PIXEL_RESCUE`, `MATCH_3`, `CATNIP_HEIST` |
| `GamePlatform` (shared) | `web`, `ios`, `android` |
| `LiveGameOutcome` (shared) | `won`, `died`, `timeout`, `quit` |
| `StarterBreed` (shared) | `SCOUT`, `PINKIE`, `SHADOW`, `MISTY`, `SUNNY` |
| `CatOrigin` (shared) | `starter`, `pack`, `redeem`, `adopt`, `portrait` |
| `CatAbilityType` | `ICE`, `ELECTRIC`, `FIRE`, `WIND`, `DARK`, `WATER`, `GRASS`, `SAND`, `FAIRY`, `STELLAR` |
| `Tier` | `COMMON`, `RARE`, `EPIC`, `LEGENDARY` |
| `PackType` | `STARTER`, `INFLUENCER`, `LEGENDARY` |
| `BlessingStatus` | `WAITING`, `RECOVERING`, `ADOPTED`, `HEAVEN` |
| `BlessingKind` | `rescue`, `portrait` |
| `OrderStatus` (shared) | `COMPLETE`, `PENDING`, `LOCKED`, `FAILED`, `FAILED_GRANT` |
| `ShelterDonationStatus` (shared) | `PENDING`, `SENT`, `CONFIRMED`, `FAILED` (with `failedReason`: `reverted`, `timeout`, `send-failed`, `budget-spent`, `stuck-pending`) |
| `DonateSource` (shared) | `heist`, `page` |
| `ShelterRole` (shared) | `partner`, `house` |
| `PartnerStatus` (shared) | `active`, `past`, `prospect` |
| `HandoverStatus` (shared) | `held-by-token-tails`, `handed-over` |
| `RescueGoalStatus` (shared) | `OPEN`, `FILLED`, `DELIVERED`, `CANCELLED` |
| `TailsMode` | `POINTS`, `TOKEN` |
| `ChainType` | `STELLAR`, `FIAT`, `EVM` (crypto checkout orders) |
| `CurrencyType` | `USDT`, `USDC`, `XLM`, `USD`, `EURC` |
| `ProductType` | `digital`, `print`, `canvas` |
| `ImageStyle` | `highness`, `monarch`, `aristocrat`, `commander` |
| `EntityType` | `ARTICLE`, `CAT`, `BLESSING`, `PACK`, `IMAGE`, `COMMENT` |
