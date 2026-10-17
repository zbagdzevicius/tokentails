# Lane B-BACKEND: notes for the other lanes (Oct 16)

Built `backend/src/rave/**` per CHECKOUT-SPEC.md sections 4–9. Checks: backend `npm run lint` clean,
`npm run build` ok, `npx jest` 2276/2276 (58 rave tests); cat-rave `tsc` + `vitest` green (untouched).

## Files
- `backend/src/rave/`: `rave.config.ts`, `rave.errors.ts`, `rave-fee.ts`, `rave-names.ts`, `rave.schema.ts`,
  `rave.service.ts`, `rave-webhook.service.ts`, `rave.controller.ts`, specs `rave-names|rave-fee|rave.service|rave-webhook|rave.controller.spec.ts`,
  harness `rave.harness-spec.ts` (not run by jest, not built).
- Surgical: `app.module.ts` (2 schemas, `RaveController`, `RaveService`, `RaveWebhookService`);
  `user/heist/live-body-limit.ts` (`'/rave/stripe/webhook'` in `RAW_BODY_PATHS`) and its spec (the `toEqual`
  line plus one echo route for the new path, needed for the byte-for-byte test).
- NOT done (integrator): `docs/BACKEND.md` "Moon Rave checkout" section + env rows, `docs/API.md` routes.

## API as built (differences from the spec are marked ⚠)
- `GET /rave/status` → spec shape. Not ready: `{ enabled:false, reason:'stripe'|'keeper'|'mode'|'cap' }` only (no on/off flag since Oct 17).
  ⚠ Per-IP limit 60/min instead of the global throttle (global is one site-wide bucket without TRUST_PROXY).
- `POST /rave/checkout` body `{cats, method?='card', coverFee?=true (card), names?, restName?, x?, clientKey?}`.
  `clientKey` must match `^[A-Za-z0-9-]{8,64}$` (a UUID works). Response adds ⚠ `status` and `restName` (cats > 10).
  Card: `clientSecret`; USDC: `clientSecret:null`, `memo`, `usdc:{chains, amountUnits6}`.
- Errors `{statusCode, code, message, ...}`: 400 `RAVE_AMOUNT`, `RAVE_INVALID`, `RAVE_METHOD`,
  `RAVE_NAME` (`fields:[{index: 0..9|'rest', code: NAME_TOO_SHORT|NAME_TOO_LONG|NAME_CHARS|NAME_RESERVED|NAME_BLOCKED|NAME_REPEAT}]`),
  ⚠ `RAVE_X_HANDLE` with the detail in `fieldCode` (`X_HANDLE_INVALID|X_HANDLE_BLOCKED`),
  409 `RAVE_KEY_REUSED`, 429, 502 `RAVE_STRIPE`, 503 `RAVE_OFF` (`reason`), `RAVE_CAP`, `RAVE_BUSY`.
- `GET /rave/orders/:id` → public row + `amountCents`, `donationCents`, `feeCents` (+`memo` for USDC). ⚠ `status` is
  the raw one (`created|pending|paid|onchain|canceled|refunded|disputed|expired`; `review` shows as `paid`).
  404 `RAVE_ORDER_NOT_FOUND` for unknown / expired-created. Polls Stripe at most once per 5 s per order.
- `POST /rave/orders/:id/usdc-tx` `{chainId, txHash}` → same shape as GET order; 400 `RAVE_TX_MISMATCH`
  (order goes back to `created` so the buyer can retry), 409 `RAVE_TX_USED` / `RAVE_ORDER_STATE`.
- `GET /rave/cats?limit&before` → `{asOf, orders:[{orderId,cats,names,restName?,x?,status:'pending'|'paid'|'onchain',chainId?,payoutTx?,method,createdAt}], nextBefore|null}`.
  ⚠ Readable even while the flag is off (empty list), so names survive switching checkout off. 60/min per IP.
- `POST /rave/stripe/webhook`, `PATCH /rave/orders/:id/moderation {hidden}` (PermissionGuard 2),
  `POST /rave/orders/:id/release` (PermissionGuard 4) as in the spec.

## Rules the client must mirror
- Amounts: `1`, `5`, or an integer `10..prices.max`.
- Fee: `ceil((cats*100 + fixedCents) * 10000 / (10000 - percentBps))`; $5 → 546.
- Names: `normalizeCatName` rules; more than 3 identical typed names → `NAME_REPEAT`. Expansion: cat `i` is
  `names[i]`, else `` `${restName} ${i+1}` ``.
- X: see `normalizeXHandle` in `rave-names.ts` (URL regex, one `@`, `^[A-Za-z0-9_]{1,15}$`, reserved X paths,
  word lists also on the handle with `_` read as a space). The server returns the bare handle; build
  `https://x.com/<handle>` on the client after re-checking the regex.
- Memo: `tt:rave:<orderId without rv_>`; Tempo bytes32 = UTF-8 right-padded hex (`memoToBytes32`).

## Gaps / for a person
- USDC verification reads receipts through `shelterConfigFor(chainId)`: a chain only verifies when it is served
  (main, try-it or SHELTER_RELAY_CHAINS); otherwise the order stays `pending` and expires after 30 min. USDC
  has no flag since Oct 17: it is offered whenever a chain qualifies.
- A refund/dispute after the payout left logs an error and sets `reversedAfterPayout`; nothing is undone.
- Payout rows use `user: ObjectId(0)` and `sku.kind: 'RAVE'` (not in `SKU_KINDS`; the field is `type: Object`).
- Known issues seen, not fixed: impact `direct` bucket will count rave payouts; shelter-payouts page shows the raw
  `tt:rave:` memo; Base/Avalanche payout index lag (spec section 13 item 11).
