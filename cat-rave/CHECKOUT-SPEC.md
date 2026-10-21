# Moon Rave checkout: name your cats, attach your X, pay in place (spec, Oct 16 2026)

Status: spec written Oct 16 on branch `v2`; merged with `origin/main` (and its Oct 14–16 crypto go-live) on Oct 17,
see section 12. Four lanes build in parallel from this file
(section 11); `src/main.ts` and HUD wiring go to the integrator.

Founder request (Oct 16): "add a cat also should allow them to add link to their X account as well, not just name a
cat", on top of the earlier asks: the page lives at **tokentails.com/rave**, checkout happens **in place** ($1 = 1
cat, $5 = 5 cats, custom ≥ $10 = N cats), buyers **name** their cats and can **attach their X account**, card /
Apple Pay / Google Pay through the Stripe Payment Element plus a **USDC** tab, and every paid dollar becomes an
**on-chain payout to Pink Paw** that the existing payouts feed counts.

## 1. The rules that do not change

- **$1 = 1 cat, right away (founder decision 2026-10-17).** A paid order's cats dance the moment the payment is
  confirmed (card succeeded, or the USDC tx checked on Arc), named and holding the buyer's flag, and count in the
  headline once. Its on-chain payout later takes their place one for one (no second drop-in, no second shout-out).
  Only an order still confirming (`pending`) shows a hologram, never counted. No buyer-facing "slow" or "delayed"
  wording anywhere.
- **Never double-pay.** One PaymentIntent → at most one payout row, enforced by unique indexes (section 6).
- **Stripe test mode only in tests.** No test touches the network, a real key, or a real chain.
- **On whenever its config is ready (no on/off flag, Oct 17).** If a Stripe key, the webhook secret or the keeper is
  missing, `GET /rave/status` says `enabled: false` with the reason and the page keeps today's Add-a-cat sheet
  (wallet gift link, free treat, adopt link) exactly as it is.
- **Raw memos stay internal**, except the rave memo `tt:rave:<16 hex>`, which carries only the public order id.

## 2. What exists today (discovery)

| Area | What is there | Where |
|---|---|---|
| Stripe client | `StripePaymentService.stripe` (lazy, `STRIPE_SECRET_KEY`, API `2025-12-15.clover`), PaymentIntent create/verify for portraits, packs and $5 shelter cats, idempotent claim on the intent id | `backend/src/payments/stripe-payment.service.ts` |
| Stripe webhooks | `POST /image/webhook` (`STRIPE_WEBHOOK_SECRET`, handles only `checkout.session.completed`), `POST /badcat/stripe/webhook` (other workflow, own secret, event-id dedupe recorded **after** dispatch) | `image/image.controller.ts:673`, `badcat/badcat-webhook.service.ts` |
| Raw body | `NestFactory.create(AppModule, { rawBody: true })`, but `applyBodyParsers` registers express parsers first, so only paths in `RAW_BODY_PATHS` get `req.rawBody`. `live-body-limit.spec.ts:144` pins the exact list | `backend/src/user/heist/live-body-limit.ts` |
| Publishable key | `STRIPE_PUBLISHABLE_KEY` is in the backend env ("unused in code", docs/BACKEND.md:1035). The client uses `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `client/components/web3/StripePayment.tsx` (`confirmPayment`, `redirect: "if_required"`) |
| Payout keeper | `CryptoShelterShareService`: every 5 min (leased), takes `cryptocheckouts` rows with `shelterShare.state: 'due'`, sends `ShelterSplit.disburse(amount, row.shelterShare.memo)` from the hot wallet float on `SHELTER_CHAIN_ID` (Arc 5042 in production), approves the split once, settles by receipt (`DisbursementBatch.toShelters`), `due → sending → sent → confirmed`, reverted → `due` (max 3 attempts) → `failed`; one failure stops the run; an unknown fate is never re-sent. `runOnce()` is also exposed at `POST /payments/crypto/shelter-share/run` | `backend/src/payments/crypto/crypto-shelter-share.service.ts` |
| Card share rows | `CryptoCheckoutService.recordCardShelterShare`: a `rail: 'card'`, `network: 'card'`, `status: 'COMPLETE'` row, unique on `cardIntent` (index `card_intent_unique`), `shelterShare` from `treasuryShelterShare` (memo `tt:cat:<16 hex>`). The keeper only reads `shelterShare.*`, so any row with a `due` share and its own memo is paid | `payments/crypto/crypto-checkout.service.ts:1004`, `crypto-checkout.schema.ts` |
| Readers of `cryptocheckouts` | Only `crypto-checkout.service.ts` (its order GET returns 404 for `rail: 'card'`; grant recovery reads `status: 'PAID'` only) and the keeper. Nothing else counts card rows | grep, Oct 16 |
| Hot wallet | `SHELTER_DONATE_PRIVATE_KEY`; sends serialised in-process (`ShelterChain`), nonce from the node. Float on Arc ≈ 300 treats (≈ $3) per the tracker: **far below any real rave volume** | `shelter/onchain/shelter-chain.ts`, docs/BACKEND.md 380–410 |
| Public giving gate | `ShelterClaimService.publicGivingVerified(chainId)`: buyer money may reach a mainnet split only when every wallet it pays is a rotated, shelter-held claim | `shelter/onchain/shelter-claim.service.ts:320` |
| Name filter | `normalizeCatName` (NFKC, Latin letters/digits/space/'/-, 2–16 chars, EN + LT profanity on a folded skeleton, reserved names) and `isBlockedCatName`. Generated copy of `shared/name.ts` | `backend/src/shared-contracts/name.ts` |
| X handles | No normaliser exists (`User.twitter` is a raw string) | – |
| Rate limits | Global `AppThrottlerGuard` (`DEFAULT_THROTTLE`), `@Throttle`, per-address `ClientIpThrottle` + `ClientIpThrottlerGuard` (yourcat). In production an unproven address shares one bucket unless `TRUST_PROXY` / `CF_ORIGIN_SECRET` is set (known open item, tracker Oct 12) | `shared/guards/*`, `shared/client-ip.ts` |
| CORS | `tokentails.com` is allowed; `FRONT_END_URLS` unset → `*` | `backend/src/main.ts` |
| Wallet gift code | `shelter-rail/src/sdk.mjs` (MIT, no deps): `donateWithInjected` (Arc native `donate(memo)`), `donateTokenWithInjected` (approve + `disburse`, Tempo `disburseWithMemo` bytes32), `waitForReceipt`, `CHAINS`. The gasless relay accepts only `tt:wallet:<8 hex>` memos (`RELAY_MEMO_RE`), so rave USDC pays its own gas | `shelter-rail/src/sdk.mjs`, `backend/src/shelter/onchain/donate-router.ts:61` |
| Split list | `/shelter-payouts/deployments.json` (same origin on tokentails.com) | `client/public/shelter-payouts/deployments.json` |
| Heist hosting | `catnip-heist` `build:client` → `client/public/heist-game` (committed); `/heist` is a Next page; redirects in `next.config.js` | `client/next.config.js` |
| Rave today | Add-a-cat sheet in `src/ui/hud.ts` `buildAdd()`; cats are positional (`RaveCat.index`, the payout that crossed each dollar); `feed.catsForTx(tx)`; `sourceOf(memo)` maps memos to labels; `hud.shout(text, {href,label})` renders a safe https link (`rel="noopener"` today) | `src/data/index.ts`, `src/ui/*` |
| CSP | None on the client (no `vercel.json`, no middleware, none in `next.config.js`), so Stripe.js loads | – |

`@stripe/stripe-js@^8.11.0` is now installed in `cat-rave/` (dependency, not yet imported).

## 3. Product flow

1. **Add a cat 🐾** opens the sheet. The page has already fetched `GET /rave/status` at boot (2 s timeout, never
   blocks the scene). `enabled: false` or a failed fetch → today's sheet, unchanged.
2. **Pick:** `$1 · 1 cat`, `$5 · 5 cats` (preselected), `Custom` (whole dollars, minimum $10, maximum `prices.max` from `GET /rave/status`: the lower of `maxCats` and what is left of today's `RAVE_DAILY_CAP_USD`, so $100 on a fresh day with the defaults).
3. **Name them (optional):** one field per cat up to 10; above 10, the 10 fields plus one "name for the rest" field
   that becomes "Name 11", "Name 12", … Each empty field shows a cute placeholder (Mochi, Pixel, …); the server
   picks the final default. 16 characters max, inline check with the same rules as the server (section 7).
4. **Your X (optional):** one field, `@handle` or an x.com / twitter.com profile link. Helper text right under it:
   **"Shown publicly with your cats."** The server normalises it to the bare handle or refuses it.
5. **Pay:** tab **Card** (Payment Element: card, Apple Pay, Google Pay, Link) with a pre-checked
   **"Cover the card fee (+$0.46)"** that adds the fee so Pink Paw gets the full amount either way; tab **USDC**
   (wallet on Arc, Base, Arbitrum, Avalanche, Monad, Tempo or Robinhood; buyer pays gas) when status lists chains.
6. **After payment:** the sheet shows "Your N cats are dancing 🪩" with the names; the floor gets N real cats at
   once (drop-in, glow) and the DJ shouts them out ("Shout-out to Mochi, Pixel and 3 more! Shout-out to @handle!");
   "Watch them dance" flies the camera to the buyer's first cat. The receipt polls `GET /rave/orders/:id` every
   second until paid. A USDC order shows holograms for the seconds its tx takes to check.

No navigation away at any point. 3DS opens in Stripe's own in-page modal (`redirect: 'if_required'`, and the
PaymentIntent is created with `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }`, so no
redirect-only method is ever offered).

## 4. API contract (backend, `backend/src/rave/`)

All JSON. No auth on the public routes (the page is guest / no login). Money in integer cents; amounts in the API
are always computed by the server.

### `GET /rave/status`

```json
{
  "enabled": true,
  "livemode": true,
  "publishableKey": "pk_live_…",
  "card": true,
  "usdc": { "enabled": true, "chains": [5042, 8453, 42161] },
  "prices": { "fixed": [1, 5], "customMin": 10, "max": 500 },
  "fee": { "percentBps": 290, "fixedCents": 30 },
  "payoutsDelayed": false
}
```

- `enabled` = `STRIPE_SECRET_KEY` AND `STRIPE_PUBLISHABLE_KEY` AND
  `RAVE_STRIPE_WEBHOOK_SECRET` are set AND the keeper can pay (main shelter config has RPC, split and hot wallet;
  the keeper has no flag since the go-live) AND the key mode matches the shelter chain (live key ↔
  mainnet chain, test key ↔ testnet chain) AND, outside `NODE_ENV=production`, the key is not `sk_live_`.
  Otherwise `{ "enabled": false, "reason": "stripe" | "keeper" | "mode" }` and nothing else (the page reads a
  missing reason as `unknown`).
- `card` is `enabled`; `publishableKey` is sent only when `enabled`.
- `prices.max` = `min(RAVE_MAX_CATS, what is left of RAVE_DAILY_CAP_USD today)`; below 1 → `enabled: false, reason: "cap"`.
- `usdc.enabled` = `enabled` AND at least one chain qualifies (no flag since Oct 17); `chains` = mainnet chains (testnets when the main chain
  is a testnet) from `wallet.config.ts` whose split pays a USD coin AND `publicGivingVerified(chainId)` passes
  (buyer money never lands in a wallet Token Tails holds).
- `payoutsDelayed`: some rave share row has been `due`/`sending`/`sent` for over 30 min (float empty, RPC down).
- `Cache-Control: public, max-age=30`.

### `POST /rave/checkout`

Request:

```json
{
  "cats": 5,
  "method": "card",
  "coverFee": true,
  "names": ["Mochi", "", "Disco Paws"],
  "restName": "",
  "x": "https://x.com/someone",
  "clientKey": "8f6c1c0e-…"
}
```

- `cats`: integer, `1`, `5`, or `10 ≤ cats ≤ RAVE_MAX_CATS` (default 500). Anything else → 400 `RAVE_AMOUNT`.
- `method`: `card` | `usdc` (`usdc` only when `usdc.enabled`).
- `names`: up to `min(cats, 10)` strings; missing or empty entries get defaults. `restName`: only when `cats > 10`.
- `x`: optional, normalised (section 7). `clientKey`: a UUID the sheet makes once per open; a repeat call with the
  same key and the same body returns the same order (double click, retry); a different body → 409 `RAVE_KEY_REUSED`.

Response (card):

```json
{ "orderId": "rv_3f9a0c1b7e2d4a65", "clientSecret": "pi_…_secret_…", "amountCents": 546, "donationCents": 500,
  "feeCents": 46, "cats": 5, "names": ["Mochi", "Biscuit", "Disco Paws", "Pixel", "Noodle"], "x": "someone" }
```

Response (usdc): same, with `clientSecret: null`, `feeCents: 0`, `amountCents = donationCents`, and
`"memo": "tt:rave:3f9a0c1b7e2d4a65"`, `"usdc": { "chains": [...], "amountUnits6": "5000000" }`.

Errors: 400 `RAVE_AMOUNT`, 400 `RAVE_NAME` with `fields: [{ "index": 0 | "rest", "code": "NAME_BLOCKED" | … }]`,
400 `RAVE_X_HANDLE` (`code: "X_HANDLE_INVALID" | "X_HANDLE_BLOCKED"`), 409 `RAVE_KEY_REUSED`, 429 (throttle),
503 `RAVE_OFF`, 503 `RAVE_CAP` (daily cap). Codes live in `backend/src/rave/rave.errors.ts` (not in
`shared/errors.ts`, which another workflow is editing).

Stripe call (card): `paymentIntents.create({ amount: amountCents, currency: 'usd', automatic_payment_methods:
{ enabled: true, allow_redirects: 'never' }, description: 'Moon Rave: N cats for Pink Paw',
statement_descriptor_suffix: 'MOON RAVE', metadata: { rave: '1', orderId, cats, donationCents, feeCents } },
{ idempotencyKey: 'rave:' + orderId })`. **No names, no handle, no `userId`, no `entityType` in metadata**, so the
existing `/web3` confirm path refuses a rave intent (`metadata.userId` missing) and never grants anything for it.

### `GET /rave/orders/:orderId`

The buyer's own order (the page keeps its order ids in `localStorage`, per-viewer only). Same shape as one row of
`/rave/cats` plus `amountCents`, `feeCents`, `method`. Fallback for a slow webhook: when the order is `created` or
`pending` and has a PaymentIntent, retrieve it from Stripe (at most once per 5 s per order) and run the same
`markPaid` as the webhook (section 6). 404 for unknown or `created`-and-expired orders.

### `POST /rave/orders/:orderId/usdc-tx`

`{ "chainId": 8453, "txHash": "0x…" }` after the wallet transaction. Stores it (status `pending`), then verifies
the receipt read-only on that chain: a `Disbursed`/`NativeDisbursed` event (or `DisbursementBatch`) emitted by a
split recorded for that chain in `wallet.config.ts`, with memo `tt:rave:<hex>` (Tempo: its bytes32 form), paying
at least `cats × $1` of a USD coin to the shelter (EURC refused). Mined and valid → `onchain` with `payoutTx`;
not mined yet → stays `pending` (re-checked on the next call and by the list refresher, given up after 30 min);
mined but wrong → 400 `RAVE_TX_MISMATCH`. One tx hash belongs to one order (unique index).

### `GET /rave/cats`

Public, no PII beyond the handle the buyer chose to show. Query: `limit` (default 200, max 500), `before` (ISO
`createdAt` cursor).

```json
{
  "asOf": "2026-10-16T19:02:11Z",
  "orders": [
    { "orderId": "rv_3f9a0c1b7e2d4a65", "cats": 12, "names": ["Mochi", "…10 names"], "restName": "Disco",
      "x": "someone", "status": "onchain", "chainId": 5042, "payoutTx": "0x…", "method": "card",
      "createdAt": "2026-10-16T18:59:40Z" }
  ],
  "nextBefore": "2026-10-15T…"
}
```

- Listed statuses: `pending` (card `processing`), `paid` (card succeeded,
  payout queued, sending, sent, held for review, or failed and waiting for a person), `onchain` (payout receipt
  confirmed; `payoutTx` + `chainId`). `created`, `canceled`, `expired`, and orders refunded **before** their payout
  are never listed. An order refunded after its payout stays `onchain` (the shelter has the money). A reported
  USDC tx whose receipt has not been read yet is stored as `reported`: it is neither listed nor counted against
  the daily cap until the receipt confirms it (then `onchain`); its buyer's `GET /rave/orders/:id` shows `pending`.
- Hidden by a moderator → names replaced by the order's defaults, `x` omitted.
- Name expansion (client and server agree): cat `i` (0-based) is `names[i]` when `i < names.length`, else
  `` `${restName} ${i + 1}` ``.
- Server-side cache 15 s; `Cache-Control: public, max-age=15`.

### `POST /rave/stripe/webhook`

Raw body, `stripe-signature` checked with `RAVE_STRIPE_WEBHOOK_SECRET` (400 when wrong, 503 when the secret is
unset). `@SkipThrottle()`. Handles:

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Ignore unless `metadata.rave === '1'`. Re-retrieve the intent with `expand: ['latest_charge']`, then `markPaid` |
| `payment_intent.processing` | `created → pending` |
| `payment_intent.payment_failed`, `payment_intent.canceled` | `pending → created` / `→ canceled` (not listed) |
| `charge.refunded`, `charge.dispute.created` | Atomically `shelterShare.state: 'due' → 'void'` on its row (no payout if not sent yet); order → `refunded` / `disputed`; if already sent, log for a person (Token Tails absorbs it) |

Event ids go to `ravewebhookevents` **after** a successful dispatch (Bad Cat's round-3 lesson: recording first
loses the event on a crash); every write is idempotent on the PaymentIntent id anyway.

### Admin (behind `AppAuthGuard` + `PermissionGuard`, lowercase `accesstoken`)

- `PATCH /rave/orders/:orderId/moderation` `{ "hidden": true }`, `PermissionGuard(2)`: hide names and handle.
- `POST /rave/orders/:orderId/release`, `PermissionGuard(4)`: release a `review` hold (creates the payout row).

## 5. Mongo schema

`raveorders` (`backend/src/rave/rave.schema.ts`, `timestamps: true`):

| Field | Type | Notes |
|---|---|---|
| `orderId` | string | `rv_<16 hex>`, unique |
| `clientKey` | string | unique, sparse; create idempotency |
| `method` | `'card' \| 'usdc'` | |
| `cats` | int | = donation in whole USD |
| `donationCents` | int | `cats × 100`; what Pink Paw gets |
| `feeCents`, `amountCents` | int | `amountCents = donationCents + feeCents` (card); `feeCents = 0` when not covered or USDC |
| `coverFee` | bool | |
| `names` | string[] | ≤ 10, normalised, defaults filled in |
| `restName` | string? | only when `cats > 10` |
| `defaultNames` | string[] | the defaults the order got (used when hidden) |
| `xHandle` | string? | `^[A-Za-z0-9_]{1,15}$`, no `@`; `xHandleLower` for lookups |
| `hidden` | bool | moderation; `hiddenAt`, `hiddenBy` |
| `paymentIntentId` | string? | unique, sparse |
| `livemode` | bool | from the intent / event |
| `status` | enum | `created`, `pending`, `paid`, `review`, `onchain`, `canceled`, `refunded`, `disputed`, `expired` |
| `risk` | string? | `latest_charge.outcome.risk_level` |
| `payout` | object? | `{ chainId, txHash, confirmedAt }` copied when the share confirms (card) or the receipt verifies (USDC) |
| `usdc` | object? | `{ chainId, txHash, reportedAt }`; `usdc.txHash` unique, sparse |
| `shareState` | string? | mirror of the keeper row's `shelterShare.state` (refreshed by the list refresher) |
| `paidAt`, `expireAt` | Date | `expireAt` set only while `created` (24 h card, 2 h USDC); TTL index on it |

Indexes: `orderId` unique; `clientKey` unique sparse; `paymentIntentId` unique sparse; `usdc.txHash` unique sparse;
`{ status: 1, createdAt: -1 }`; TTL `{ expireAt: 1 }, expireAfterSeconds: 0`.

`ravewebhookevents`: `{ eventId (unique), type, createdAt }`, TTL 30 days.

Payout row (the keeper's queue, **existing** collection `cryptocheckouts`, existing schema, no schema change), written
by the rave service only in `markPaid` / `release`:

```js
{
  orderId: 'rv_<16 hex>',              // same id as the rave order; 'rv_' never collides with 'co_'
  user: RAVE_SYSTEM_USER,              // fixed ObjectId('000000000000000000000000'): `user` is required, buyers are anonymous
  rail: 'card', network: 'card' | 'testnet',   // see the mode rule below
  cardIntent: 'pi_…',                  // unique index card_intent_unique: one payout per PaymentIntent
  sku: { kind: 'RAVE', name: 'Moon Rave' },     // sku is type Object; nothing reads sku.kind for card rows
  priceUsdCents: donationCents, discountPercentage: 0, accepted: [], status: 'COMPLETE', expiresAt: now,
  grant: { success: true, message: 'Moon Rave' },
  shelterShare: {
    shelterId: PACK_SHELTER_IDS.pinkPaw, route: 'treasury', bps: 10000, evidenceTier: 'pledged',
    state: 'due', amountUsdCents: donationCents, memo: 'tt:rave:<16 hex>', attempts: 0
  }
}
```

Mode rule (never pay real money for a test payment): create the row only when `livemode === !isTestnetChain(
readShelterConfig().chainId)`; `network` is `'card'` for live, `'testnet'` for test. A mismatch marks the order
`paid` with `payoutSkipped: 'mode'` and logs an error. The keeper also filters `network` (card rows only by a mainnet
keeper); the rave service still checks the mode itself so a mismatched row is never created.

## 6. Payout flow, memo, idempotency

```
POST /rave/checkout ──► raveorders {created} ──► Stripe PI (idempotencyKey rave:<orderId>)
        Payment Element confirm (in place, 3DS modal)
payment_intent.succeeded (webhook)  ─┐
GET /rave/orders/:id (fallback)     ─┴─► markPaid(intent)
   1. checks: metadata.rave === '1', metadata.orderId matches, currency usd, status succeeded,
      amount_received === order.amountCents, livemode as in the mode rule
   2. raveorders: findOneAndUpdate({orderId, status ∈ [created, pending]}, {status: paid|review, paidAt,
      paymentIntentId, livemode, risk})   ← only the winner continues
   3. risk_level 'elevated' | 'highest' → status 'review', no payout row (admin release)
   4. else insert the cryptocheckouts row above (duplicate key on cardIntent / orderId = already done, fine)
   5. kick the keeper: debounced (10 s) fire-and-forget CryptoShelterShareService.runOnce()
      (rows are locked due→sending atomically, sends are serialised in ShelterChain, so a cron run at the same
      time cannot pay a row twice)
keeper ─► ShelterSplit.disburse(donation, 'tt:rave:<hex>') on SHELTER_CHAIN_ID ─► confirmed (receipt)
list refresher (on GET /rave/cats, cached 15 s) ─► copies shelterShare.{state, txHash, chainId} into
   raveorders; confirmed → status 'onchain', payout {chainId, txHash}
payout index job (every 2 min) ─► GET /shelter/payouts lists the event with memo tt:rave:<hex>
cat-rave feed ─► the payout's N cats replace the order's N ahead cats (same names, no new drop-in or shout-out)
```

- **Memo:** `tt:rave:<16 hex>` (24 bytes, fits Tempo's bytes32). The order id is public, so the memo is too.
- **Amount:** always `donationCents` (the full donation), whether or not the buyer covered the fee. Token Tails
  pays the Stripe fee when it is not covered.
- **Full amount reaches Pink Paw** only while the main split pays Pink Paw 10000 bps (docs/BACKEND.md:374). The
  keeper stores `toShelters` from the receipt; the cats follow the indexed payout, so a smaller share would honestly
  show fewer cats.
- **Never double-pay:** `raveorders.paymentIntentId` unique; the atomic `created|pending → paid` transition;
  `cryptocheckouts.cardIntent` unique (existing index); `cryptocheckouts.orderId` unique (existing index); the
  keeper's own `due → sending` lock and "never re-send an unknown fate". Webhook redeliveries and the fallback GET
  all funnel into the same `markPaid`.
- **Same retry semantics as $5 shelter cats:** the row is an ordinary keeper row (`due`, max 3 attempts, `failed`
  for a person, stuck `sent` → `failed` once its nonce is used). An empty float leaves rows `due`; they retry every
  5 min; the order stays `paid` and its cats keep dancing. The status endpoint still carries `payoutsDelayed` for
  operators; the page never shows it.
- **Refund before payout** voids the row (`due → void`, atomic), so nothing is sent. After payout nothing is undone.

## 7. Names and X handle

**Names** (server is authoritative; the client mirrors the rules for inline messages only):

- `normalizeCatName(input)` from `src/shared-contracts/name.ts` (2–16 chars, Latin letters/digits/space/'/-,
  EN + LT profanity, reserved words). This already drops URLs (no `.`, `/`, `:`), emoji and other symbols.
- Empty → a default from `RAVE_DEFAULT_NAMES` (~40 cute names, each checked by a test to pass `normalizeCatName`:
  Mochi, Biscuit, Pixel, Noodle, Bean, Sprout, Tofu, Waffles, Pumpkin, Pepper, Clover, Nugget, Pickle, Sushi, Toast,
  Peanut, Muffin, Kiwi, Dumpling, Boba, Ziggy, Disco, Glowstick, Bassline, Beatpaw, Moonbeam, Wobble, Sparkle,
  Velvet, Neon, Comet, Jellybean, Marble, Tinsel, Paprika, Mango, Fudge, Pebble, Hopscotch, Zephyr), picked
  deterministically from `sha256(orderId + index)` so a retry gets the same names. No two cats of one order share a
  default unless the order has more than 40 defaults.
- Spam: more than 3 identical non-default names in one order are refused (`NAME_REPEAT`).
- Rendering: always `textContent` (DOM) or canvas text (DJ bubble). Never `innerHTML` with a name.

**X handle** (`normalizeXHandle`, in `backend/src/rave/rave-names.ts`, mirrored in `src/checkout/xhandle.ts`):

1. Empty or whitespace → no handle. Raw input over 100 chars → `X_HANDLE_INVALID`.
2. NFKC, trim, remove invisible characters.
3. URL form: `^(?:https?://)?(?:www\.|mobile\.)?(?:x|twitter)\.com/([^/?#\s]+)/?(?:[?#].*)?$` (case-insensitive)
   → candidate = group 1. Any other host, or a deeper path (`/someone/status/1`), → `X_HANDLE_INVALID`.
4. Else strip exactly one leading `@`.
5. Candidate must match `^[A-Za-z0-9_]{1,15}$`, else `X_HANDLE_INVALID`.
6. Reserved X paths are refused (`home`, `i`, `intent`, `share`, `search`, `explore`, `settings`, `messages`,
   `notifications`, `compose`, `login`, `logout`, `signup`, `tos`, `privacy`, `hashtag`, `account`, `about`,
   `download`, `jobs`).
7. `isBlockedCatName(candidate)` → `X_HANDLE_BLOCKED` (a slur in a handle would otherwise be read out by the DJ).
8. Store the handle as typed (X handles are case-insensitive) plus `xHandleLower`.

Rendering (client builds the URL, never stores or echoes one): re-check `^[A-Za-z0-9_]{1,15}$`, then an `<a>` with
`href = 'https://x.com/' + handle`, text `@handle`, `target="_blank"`, `rel="noopener nofollow ugc"`. Shown in the
cat info card, the HUD shout-out toast ("shout-out to @handle!", the link as the toast's link), and the arrivals
list. The DJ's canvas bubble shows the text only (not clickable). The handle is **not verified**: anyone can type
any handle (section 13).

## 8. Fee formula

Gross-up so the buyer's payment minus Stripe's fee covers the donation:

```
p = RAVE_FEE_PERCENT_BPS / 10000      (default 290 → 2.9 %)
F = RAVE_FEE_FIXED_CENTS              (default 30)
amountCents = coverFee ? ceil((donationCents + F) / (1 − p)) : donationCents
            # integer form: ceilDiv((donationCents + F) × 10000, 10000 − RAVE_FEE_PERCENT_BPS)
feeCents    = amountCents − donationCents
```

$1 → $1.34 (+34¢) · $5 → $5.46 (+46¢) · $10 → $10.61 (+61¢) · $50 → $51.81 (+$1.81) · $100 → $103.30 (+$3.30).
The label shows `feeCents` from the server ("Cover the card fee (+$0.46)"); toggling it re-quotes locally with the
`fee` numbers from `/rave/status`, and the server recomputes on checkout. The defaults are Stripe's US standard
price; Token Tails is a Lithuanian company, so the real price is likely different (section 13).

## 9. Rate limits and abuse

| Route | Limit |
|---|---|
| `POST /rave/checkout` | `ClientIpThrottle({ limit: 6, ttl: 10 min })` + global brake: more than `RAVE_CREATED_PER_HOUR` (default 200) unpaid orders in the last hour → 503 `RAVE_BUSY` (card-testing bursts) |
| `GET /rave/orders/:id` | `ClientIpThrottle({ limit: 30, ttl: 60 s })`; Stripe retrieve at most once per 5 s per order |
| `POST /rave/orders/:id/usdc-tx` | `ClientIpThrottle({ limit: 10, ttl: 10 min })` |
| `GET /rave/status`, `GET /rave/cats` | global default throttle + cache headers |
| `POST /rave/stripe/webhook` | `@SkipThrottle()`; signature is the gate |

- Daily cap: paid donations in the current UTC day, plus unpaid (`created`) orders of the last 15 minutes capped
  together at 10% of the cap, above `RAVE_DAILY_CAP_USD` (default 100, raise it after the float top-up in section 13) →
  503 `RAVE_CAP`. It bounds what the hot wallet float can owe in a day; never-paid orders can shrink it but never
  close checkout. A payout is the donation less any refund recorded before it was queued:
  `min(donation, amount - refunded - fee)`, none when nothing was kept.
- Radar: `elevated`/`highest` risk → `review` (no payout until a person releases it). A $1 checkout is a classic
  card-testing target; the founder should also turn on Radar's card-testing rules (section 13).
- IP addresses are never stored (throttler memory only).

## 10. Hosting at tokentails.com/rave

- `cat-rave/package.json` `build:client`: `RAVE_BASE=/rave/` and `--outDir ../client/public/rave --emptyOutDir`
  (was `/cat-rave/`; nothing was ever built there, so no redirect is needed). Commit `client/public/rave` like
  `client/public/heist-game`.
- `client/next.config.js`: one constant and two spread points, nothing else touched:
  `const raveRewrites = [{ source: "/rave", destination: "/rave/index.html" }];` added to the plain array branch
  (`return [...firebaseAuthRewrites, ...raveRewrites]`) and to `afterFiles` in the Bad Cat branch. A rewrite keeps
  the URL at `/rave`; Next strips the trailing slash of `/rave/` first. Assets resolve under `/rave/build/…`
  (Vite `assetsDir: 'build'`). Web builds only (the Capacitor export has no rewrites).
- `index.html`: `canonical` and `og:url` → `https://tokentails.com/rave`; `og:image` and `twitter:image` →
  `https://tokentails.com/rave/og.jpg`.
- `src/config.ts`: `LINKS.self = 'https://tokentails.com/rave'`; `API_BY_HOST` is keyed by host, so `/rave` on
  `tokentails.com` already resolves to `https://api.tokentails.com`; add `localhost`/`127.0.0.1` ports 5181–5189 and
  4180 (preview) for parallel dev servers. New `RAVE_PATHS = { status: '/rave/status', checkout: '/rave/checkout',
  cats: '/rave/cats', order: '/rave/orders/' }`.
- `vite.config.ts`: `server.fs.allow` gets `searchForWorkspaceRoot(process.cwd())` plus `'../shelter-rail/src'`
  so the USDC tab can import `shelter-rail/src/sdk.mjs` in dev (the build already can).
- Stripe.js: `import('@stripe/stripe-js/pure')` inside the checkout lane when the sheet opens (no script on boot).
  Apple Pay needs `tokentails.com` (and `www.`) registered as a payment method domain in Stripe (founder).

## 11. Lanes and file ownership

Shared files get **minimal surgical edits, re-read right before editing**; another workflow is editing `bad-cat/`,
`backend/src/badcat/`, and possibly `backend/src/app.module.ts`, `client/next.config.js`, `docs/*.md`. Nobody touches
`bad-cat/`, `backend/src/badcat/`, `wallet.config.ts`, `shared/*`, `src/types.ts` or `src/main.ts` except as listed.

### B-BACKEND

Owns `backend/src/rave/**`:
`rave.schema.ts`, `rave.config.ts` (`readRaveConfig(env)`), `rave-names.ts` (names, defaults, `normalizeXHandle`),
`rave-fee.ts`, `rave.errors.ts`, `rave.service.ts` (checkout, `markPaid`, payout row, list refresher, USDC verify,
moderation), `rave-webhook.service.ts`, `rave.controller.ts`, and specs (`rave-names.spec.ts`, `rave-fee.spec.ts`,
`rave.service.spec.ts`, `rave-webhook.spec.ts`, `rave.controller.spec.ts`).

Surgical edits outside it:
- `backend/src/app.module.ts`: import + `MongooseModule.forFeature` entries for `RaveOrder` and `RaveWebhookEvent`,
  `RaveController` in `controllers`, `RaveService` + `RaveWebhookService` in `providers` (it reuses the already
  registered `StripePaymentService`, `CryptoShelterShareService`, `ShelterChain`, `ShelterClaimService` and the
  `CryptoCheckout` model).
- `backend/src/user/heist/live-body-limit.ts`: append `'/rave/stripe/webhook'` to `RAW_BODY_PATHS`; and the one
  `toEqual` line in `live-body-limit.spec.ts:144`.
- `docs/BACKEND.md` (a "Moon Rave checkout" section + env rows) and `docs/API.md` (the five routes).

Tests: Jest, `*.spec.ts` under `src`; Mongo via the existing in-memory/fake helpers (see `crypto-shelter-share.service.spec.ts`
for the keeper fakes); Stripe client mocked; webhook signatures made with `stripe.webhooks.generateTestHeaderString`
and a fake `whsec_test`. Cover: amount rules, fee table above, every name/handle vector (section 7), clientKey
idempotency, concurrent `markPaid` (webhook + fallback) inserting exactly one payout row, test-mode payment against
a mainnet shelter config inserting none, refund before payout voiding the row, risk hold, hidden orders in the list,
no PII in `/rave/cats`, status `enabled: false` by default. Check: `npm run lint`, `npm run build`, `npm test`.

### F-CHECKOUT

Owns `cat-rave/src/checkout/**`:
`api.ts` (status, checkout, order, usdc-tx; `AbortController` timeouts), `sheet.ts` (`mountCheckout(container, opts)`
→ `{ destroy }`: amount picker, names form, X field with "Shown publicly with your cats.", fee toggle, tabs),
`stripe.ts` (lazy `@stripe/stripe-js/pure`, Payment Element with a dark appearance in the rave palette,
`confirmPayment({ elements, redirect: 'if_required' })`), `usdc.ts` (wallet flow on `shelter-rail/src/sdk.mjs`:
chain pick from `status.usdc.chains` and `/shelter-payouts/deployments.json`, `donateWithInjected` on Arc,
`donateTokenWithInjected` elsewhere, Tempo `memo32`, memo from the checkout answer, then `usdc-tx`), `names.ts`
(placeholder names, inline name check mirroring section 7, expansion helper), `xhandle.ts` (client mirror of
`normalizeXHandle` + `xProfileUrl(handle)`), `arrivals.ts` (DOM list: names, "+N more", `@handle` link, status chip),
`myorders.ts` (order ids in `localStorage`, try/catch), `checkout.css`, a `sdk.d.ts` for the `.mjs` import, and
vitest tests (`*.test.ts`). No `innerHTML` with user text anywhere.

### F-DATA

Owns `cat-rave/src/data/**` and `cat-rave/scripts/snapshot.mjs`:
- `sourceOf('tt:rave:…')` → new source `'rave'` (label "a Moon Rave ticket"), and keep the parsed `raveOrderId` on
  the payout (the only memo whose content survives, since it is the public order id). Snapshot script the same.
- `rave-orders.ts`: `createRaveOrders(api)` polls `GET /rave/cats` (with the payout feed's cadence, plus a fast
  5 s poll for 2 min after the viewer pays), merges `myorders` from `GET /rave/orders/:id`, and exposes
  `namesForCat(cat)` (`{ name, x?, orderId }` for cats whose payout memo is `tt:rave:<id>`, by position among that
  payout's cats, or by `cat.order` for an ahead cat), `aheadCats(start)` (cats of `paid`/`onchain` orders whose payout
  the feed does not list yet; main.ts appends them to the floor and the counter), `arriving()` (orders still
  `pending`: hologram count + names, never counted), and `onLanded` once per order when it joins the floor.
- Types for these live in `src/data/` (not `src/types.ts`). Tests next to them.

### H-HOSTING

Owns `cat-rave/vite.config.ts`, `cat-rave/index.html`, `cat-rave/package.json` scripts, the URL bits of
`cat-rave/src/config.ts` (`LINKS.self`, `API_BY_HOST`, `RAVE_PATHS`), the `/rave` lines in `client/next.config.js`,
`cat-rave/README.md` ("Ship it" section), and `docs/CLIENT.md` (a `/rave` entry next to the Heist one). Does not run
`build:client` into `client/public/rave` unless the integrator asks (it would be committed output).

### Integrator (after the lanes)

`src/main.ts` + `src/ui/hud.ts` + `src/ui/format.ts`: fetch status at boot; in `buildAdd()` mount the checkout when
enabled (else today's sheet); pass arriving count/names to the crowd's ghost slots (`setNextCat` today draws one
forming cat; it needs an arriving count, a crowd-lane change); cat card gets the name and `@handle` link;
`hud.shout` link `rel` becomes `noopener nofollow ugc`; DJ text "Shout-out to Mochi, Pixel and 3 more! Shout-out to
@handle!"; mount the arrivals list. Root `CLAUDE.md` package table has no `cat-rave` row yet (CLAUDE.md is modified
in the working tree by someone else; add it when that settles).

## 12. Branch history (`v2` merged with `origin/main`, Oct 17)

The rave was built on `v2`, which lacked `origin/main`'s crypto go-live (Oct 14–16). Since the Oct 17 merge the branch
is based on `main`: the keeper has **no flag** (`CRYPTO_PAY_ENABLED` and `CRYPTO_PAY_SHELTER_SHARE_ENABLED` are gone)
and filters rows by `network` (`card` rows paid only by a mainnet keeper, testnet keeper refused in production),
`settle()` no longer takes `handedOver`, and Pink Paw's own wallet (0x3c83…4771) replaced the held 0xE299 on the
splits as of Oct 16. The rave code uses only the shared interfaces (the `cryptocheckouts` row shape, `runOnce()`,
`publicGivingVerified`, `readShelterConfig`, `StripePaymentService.stripe`) and does its own mode check (section 5).

## 13. Founder items (defaults in brackets; work continues on the default)

1. **Stripe webhook endpoint**: register `https://api.tokentails.com/rave/stripe/webhook` in the live Stripe
   dashboard with `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`; put its signing secret in
   `RAVE_STRIPE_WEBHOOK_SECRET`. Same in test mode for staging.
2. **Apple Pay domain**: add `tokentails.com` and `www.tokentails.com` under Settings → Payment method domains.
3. **Env on the backend** (names only): `RAVE_STRIPE_WEBHOOK_SECRET` (checkout opens once it is set; there is no
   on/off flag since Oct 17), `STRIPE_PUBLISHABLE_KEY` (exists, now used), `STRIPE_SECRET_KEY` (exists); optional
   `RAVE_FEE_PERCENT_BPS`, `RAVE_FEE_FIXED_CENTS`, `RAVE_MAX_CATS`, `RAVE_DAILY_CAP_USD`, `RAVE_CREATED_PER_HOUR`;
   and `TRUST_PROXY` or `CF_ORIGIN_SECRET` so per-address
   limits work in production. No new env on Vercel (the publishable key comes from `/rave/status`).
4. **Hot wallet float**: the Arc float is ≈ $3. Every card order is paid from it before Stripe settles. Top it up to
   at least the expected first week (e.g. $100–200 USDC on Arc) [`RAVE_DAILY_CAP_USD` defaults to 100; raise it after the top-up].
5. **Fee numbers**: Stripe's price for a Lithuanian account differs from 2.9 % + 30¢ (EEA vs international cards,
   and a currency conversion fee when charging USD). [Keep 2.9 % + 30¢, slightly over-covering EEA cards.]
6. **Wording**: Token Tails receives the card payment and pays the full amount on-chain to Pink Paw; it is not a
   tax-deductible donation. [Sheet line: "Token Tails pays the full $N to Pink Paw on-chain within minutes. Card
   payments are not tax-deductible donations."]
7. **Unverified X handles**: a buyer can attach anyone's handle (impersonation, harassment). [Ship unverified with the
   profanity check, the "shown publicly" note and the moderator hide switch; no X sign-in.]
8. **Receipts**: the Payment Element collects no email, so Stripe sends no receipt. [No email field; the sheet shows
   the order id and the payout tx.]
9. **Radar**: turn on the card-testing rules; [hold `elevated` risk for review, as above].
10. **USDC tab**: the gasless relay only takes `tt:wallet:` memos, so rave USDC gifts pay their own gas, and only on
    chains that pass the public giving gate. [Decided Oct 17: no flag; the tab shows whenever a chain qualifies.]
11. Known issues seen while reading, **not fixed here**: Base and Avalanche payout index on `lastRunFailed` (rave
    payouts on Arc are unaffected); `IMPACT_CHAIN_UNITS` lists only Arc chains (docs/BACKEND.md known issues); the
    impact `direct` bucket will also count rave payouts (no `rave` bucket); the shelter-payouts page will show the raw
    `tt:rave:` memo until it learns the label.
