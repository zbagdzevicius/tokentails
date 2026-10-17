# W1-BACKEND handover

`backend/src/badcat/`: the server side of every paid and cameo feature of Bad Cat Daily, registered in the one
`AppModule`. No on/off flags (Oct 17): every route is on; a feature that needs a secret reports not ready in
`GET /badcat/status` and answers 503 until it is set. Stripe takes live keys only in production, test keys elsewhere. Docs: `docs/BACKEND.md` "Bad Cat Daily (badcat)" (module map,
flows, env names with defaults, the job row) and `docs/API.md` "Bad Cat Daily (badcat)" (every route).

## Built

| File | What |
|---|---|
| `badcat.contracts.ts` | Mirror of the money and cameo block of `bad-cat/src/types.ts` (SKUs, CheckoutMeta, request and response shapes, `BADCAT_ROUTES`, cameo constants), plus backend constants (`MAX_SPECTATORS` 15, `MAX_GUEST_STARS` 3, limits, `BADCAT_DAY1`, creator code rules, `FACE_MAX_BYTES`) |
| `badcat-flags.ts` | `badcatStripeKey(env)` (`BADCAT_STRIPE_SECRET_KEY`, else `STRIPE_SECRET_KEY`; live in production, test elsewhere), `badcatCheckoutReady`, `badcatEntitlementSecret`, `badcatFeedAutoApprove`, `badcatPublicUrl`, secrets |
| `badcat-util.ts` | Day numbers (UTC, day 1 = 2026-11-16, a Monday), `filterName`, `normalizeEmail`, `isCatCode`, `hash32`, `xorshift32`, `weightedSample`, `addMonths` |
| `badcat.schema.ts` | 10 schemas (`BadcatPurchase`, `BadcatCameo`, `BadcatShuffle`, `BadcatCounter`, `BadcatGift`, `BadcatFace`, `BadcatCreatorCode`, `BadcatRestoreToken`, `BadcatClubCat`, `BadcatWebhookEvent`), `BADCAT_SCHEMAS`, `BadcatStore` |
| `badcat-token.ts` | `signEntitlements`, `verifyEntitlementToken` (HMAC-SHA256, timing-safe, optional grace) |
| `badcat-stripe.service.ts` | `BadcatStripeService` (own client, `createCheckout`, founding coupon + cap, `portalUrl`), pure `buildCheckoutParams`, `checkoutMetadata`, `validReturnBase` |
| `badcat-webhook.service.ts` | `BadcatWebhookService` (`verify`, `handle`: completed/async succeeded, subscription updated/deleted, invoice.paid with renewal rows, charge.refunded; idempotent by event id and session id) |
| `badcat-account.service.ts` | `BadcatAccountService` (`entitlementsFor`, `issue`, `complete`, `refresh`, `restore`, `verifyRestore`, `portal`, `redeem`, `setClubCat`, `activeClubEmails`) |
| `badcat-cameo.service.ts` | `BadcatCameoService` (`build`, `bundle`, `loadsOf`, `seen`, `grant`, faces: `uploadFace`, `facePng`, `pendingFaces`, `reviewFace`), `decodePng` |
| `badcat-admin.service.ts` | `BadcatAdminService` (`status`, creator codes + `creatorReport`, `typedArrival`, `stats`) |
| `badcat-seen-email.job.ts` | `BadcatSeenEmailJob` (Mondays 09:00 UTC, once a week via `claimJobPeriod`) |
| `badcat-email.ts` | SendGrid sender and the two email bodies |
| `badcat.controller.ts` | Every route of `BADCAT_ROUTES` plus face approve/reject, creator code approve/reject and report |
| `app.module.ts` | Schemas in `forFeature`, `BadcatController`, 7 providers |
| `user/heist/live-body-limit.ts` | `RAW_BODY_PATHS = ['/image/webhook', '/badcat/stripe/webhook']` (one more raw path; behaviour of the other parsers unchanged) |

Tests (jest; Stripe, SendGrid, throttler storage and models mocked; no network): 7 spec files in
`src/badcat/` (89 tests) and one new test in `src/user/heist/live-body-limit.spec.ts`. The harness is
`badcat-harness.helper-spec.ts` (the identity `MemoryModel`; the Stripe webhook verifier is the real stripe-node
one, with test signatures).

Checks run: `npm run lint`, `npm run build`, `npx jest src/badcat src/user/heist` green, and the full backend
`npx jest` (134 suites, 2169 tests) green, including `guard-migration`, `one-writer` and `earn-tails` that load
`AppModule`. `grep -rn catbassadors backend/src/badcat` is empty.

## Contract notes for W1-MONEY (client)

- Base URL = `VITE_BADCAT_API_URL`; no `accesstoken` header (no accounts): authed calls put the entitlement
  `token` in the JSON body.
- Errors are `{ statusCode, code, message }` with `BADCAT_*` codes. 404 `BADCAT_NOT_FOUND` = a missing resource; 503 = a feature whose secret is not set.
- `POST /badcat/entitlement { sessionId }` answers `{ ok: false, pending: true }` until the webhook landed;
  poll. A session id is honoured for 30 days. `{ token }` refreshes (a token up to a year past expiry works).
- `POST /badcat/redeem` business failures are 200 `{ ok: false, error: 'unknown_code' | 'already_redeemed' }`;
  malformed input is 400. A redeemed gift cameo also returns `cameoId` (change request filed for `types.ts`).
- `POST /badcat/restore` answers `{ ok: true }` (+ `devLink` outside production when email is off). The link is
  `<BADCAT_PUBLIC_URL>/badcat/restore?t=<token>`; verify with `POST /badcat/restore/verify { t }`.
- Checkout `returnBase` must be `BADCAT_PUBLIC_URL` (default `https://tokentails.com`) or a path under it;
  `http://localhost:*` works outside production. Success URL: `<returnBase>/thanks?session_id=...`.
- `dayNo` for cameo / guest star / sponsor: today..today+90 (UTC day); guest star must be a Friday, sponsor week a
  Saturday. Bundles: `GET /badcat/cameos?day=&s=` for today−400..today+1, `s` 0..7.
- `CameoEntry.faceUrl` is a relative path `/badcat/face/<id>.png`: prefix the API origin.
- `Entitlements.cosmetics` is always `[]`; the client expands owned cosmetics from `skus` (as types.ts says).
  `archiveDays` for Club is 100000 ("all").
- Face upload body: `{ token, png }`, png as base64 or a `data:image/png;base64,` URL, ≤ 64 KB decoded.

## Deviations

- Name filter: a short server-side block list (`filterName` in `badcat-util.ts`), not the game's full
  multi-language `codec/text-filter.ts` (another toolchain, not importable). The game filters again on decode.
- Cat codes are checked by shape only (base64url, 8–64 chars), not decoded (the codec may grow a version).
- "Loads" for the 300 guarantee count spectator and guest-star appearances only (fridge appearances count for the
  seen counter, not for the guarantee), so a paid cameo cannot meet its promise only through the fridge.
- Club weekly cameo day = `hash32(email) % 7` weekday; one per week per member.
- Shuffles are stored only for days up to today+1 (UTC); later days answer 400, so a future shuffle is never
  frozen before that day's purchases arrive.
- Founding cap counts founding subscriptions not refunded (cancelled ones still hold their place).
- Creator report net uses an estimated Stripe fee (2.9 % + 30 c); refunds of subscription invoices are not
  tracked (only one-off `charge.refunded`).
- Seen email: about last week (Monday..Sunday before the run), skipped when 0.

## Not done / gaps

- No live Stripe run: nothing was called (no test keys supplied). A founder sets
  `BADCAT_STRIPE_SECRET_KEY` (or relies on `STRIPE_SECRET_KEY`), `BADCAT_STRIPE_WEBHOOK_SECRET`,
  optionally `BADCAT_ENTITLEMENT_SECRET` (else derived from `INVALIDATE_CACHE_SECRET`) and points a Stripe test webhook (events listed in docs/API.md) at
  `/badcat/stripe/webhook`.
- No admin UI (cms) for faces, creator codes, the brand queue or stats; the routes exist.
- Brand queue has no "placed" route (set `queue` by hand in MongoDB for now).
- No `ProgressApi`/score integration by design (no score write path).
- Known issues in docs (global 50 MB JSON parser, `TRUST_PROXY`, per-replica in-memory throttles) are untouched;
  the badcat throttles share the per-replica, in-memory limitation of `/yourcat`.
- For the integrator: `docs/DEVELOPMENT.md` should list the duplicated contract `bad-cat/src/types.ts` money block ↔
  `backend/src/badcat/badcat.contracts.ts` (FULL-PLAN section 7.7; not in this lane's files).
