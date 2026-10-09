# Payments, goal and gallery: status (2026-10-04)

Branch `feat/funding-winning-strategy`; uncommitted when written, committed and merged to `main` since (checked 2026-10-05). No `.env*` read, no
private key used (anvil dev keys on local chains only), no mainnet transaction. `deployments.json`
and `applications/arbitrum-dubai` untouched (another session). Custody rules: `donations-STATUS.md`.

## What a user sees

| Item | What a user sees | Key files |
|---|---|---|
| 50,000 USDC goal (C-001) | `/shelter-payouts`, `/give`, `/impact` and the Heist modal show "N of the 50,000 USDC goal for Pink Paw", the share, and "Goal date: 30 Sep 2027". N is the USDC that came in to the campaign wallets (Arc's transfer log, sweeps between campaign wallets counted once), not the balance, so spending never lowers it. The copy names only what can reach the held wallet today: sponsored treats. "At least" while the scan is behind; "can't read" rather than 0. | `backend/src/shelter/goal/`, `shared/shelter-goal.ts` (+ client and Heist copies), `client/components/shelter-payouts/{goal.ts,CampaignMeter.tsx,campaign.ts}`, `catnip-heist/src/ui/shelter-payouts.ts`, fact C-001 |
| Pink Paw gallery (payouts + `/impact` + Heist) | Tabs "At the shelter 104" and "Adopted 352" (local data), cards with the shelter's photo, "Meet <name>" links, 12 at a time. Read from the uncapped `GET /shelter/rozine-pedute/gallery`; the `/cat/sale` fallback hides totals and says "of the newest". | `backend/src/shelter/`, `shared/pink-paw.ts`, `client/components/shelter-payouts/PinkPawGallery.tsx`, `catnip-heist/src/ui/pink-paw.ts` |
| Landing dedupe | Each of the three shelter names appears once on the landing; the globe list de-duplicates by slug, Pink Paw shows "Pink Paw" with "Rožinė pėdutė" under it. | `client/components/landing/shelterNames.ts`, `ImpactGlobeSection.tsx` |
| Catnip Heist landing section | On by default since 2026-10-04 (founder override of decision #15 for this section; `NEXT_PUBLIC_HEIST_LANDING_SECTION=0` hides it). The v1 reel is cleared (F-023 Paris café founder-confirmed, company-reported) and plays while the rail is live or exhausted; otherwise the poster. The third beat follows the rail state. App export drops the reel files. | `client/components/landing/HeistSection.tsx`, `client/scripts/prune-app-export.mjs` |
| Crypto checkout (replaces Stellar packs) | "Pay with crypto (USDC / EURC)" next to the card, only when the server sells on at least one network. Pick network and coin, get an order with an exact amount and a countdown, pay with a browser wallet or by QR + pasted hash, then a receipt. Prices come from the server (`config.prices`). Networks (since 2026-10-04): Arc, Base, Avalanche (USDC or EURC), Arbitrum, Monad (USDC), Tempo (USDC.e) and Robinhood Chain (USDG, no USDC there), each with a testnet twin. Stellar packs are gone; a late Stellar pack payment is recorded for a refund (410). Off today: no treasury address is set (`treasury.public.ts` is `null` on all seven chains). | `backend/src/payments/crypto/`, `client/components/web3/crypto/`, `client/components/web3/Payment.tsx`, `client/models/crypto-pay.ts` |
| $5 shelter cats | "Basic tier · $5" offer under a shelter cat's card (Shelter scene and `/cats/<id>`), "BUY FOR $5" opens a card or crypto checkout; a basic-tier copy is granted once. Rare and up come only from packs. Not in app builds. | `client/components/shelter/ShelterCatBuy.tsx`, `backend/src/shelter/shelter-cat-sale.service.ts`, `backend/src/web3/purchase-grant.service.ts`, `price-table.ts` `SHELTER_CAT_MIN_PRICE_CENTS` |

## QA pass fixes (this round)

| QA item | Fix |
|---|---|
| 1 High: Buy dialog cut off at 390 px on `/cats/<id>` | `CatDetailsLayout` clips horizontal overflow; page is 390 wide, dialog on screen |
| 2 High: Legendary shows $400, charged $350 | Fixed 2026-10-04: one regular price, $350 (`PACK_PRICES_CENTS`), and a $100 sale through 27 Nov 2026 23:59:59 UTC (`getPackPriceCents(pack, now)`, both checkouts). The card shows ~~$350~~ $100 "until 27 Nov" (`LegendaryPrice.tsx`) |
| 3 Amount under COPY | Long amounts step down a size and wrap before the symbol |
| 4 Crypto button while closed | Hidden unless the config lists a chain (and while loading or unreadable) |
| 5 Copy vs custody/goal rules | Custody line, payouts empty state, `/impact` goal note, How it works step 2 (web and Heist) |
| 6 Heist vs web test totals | "At least N … · R of C contracts read" in the Heist, "At least N" on the web when a contract is unread |
| 7 Paris café, "Arc shelter rail opens soon" | Not changed: decided copy (#74, 3f). Founder step: verify F-023 or drop the sentence |
| 8 Paw settlements contradiction | Copy follows `pawSettlements.count` |
| 9 `/packs` dev reload loop | Cause: Turbopack internal cache error (not our code). Restart the dev server. Documented |
| 10 Polish | Lithuanian captions sized to match; "Their wallet" card not stretched; 0% stub is a cream tick; Heist goal said once with "Goal date"; duplicate testnet cards labelled "Deploy k of n"; "USDC.e" keeps its case |
| 11, 12 Wallet links, RPC 429 | Documented (CLIENT.md known issues) |
| E2E: checkout box edge to edge at 390 | Conflicting `w-full` removed: 10 px margins like the summary |

Also: copy-lint R7 on `components/claims/DonationPileUp.tsx` (another session's new file): dropped the
uncited "· goal reached" after the $40K+ total.

## Checks (2026-10-04)

| Check | Result |
|---|---|
| client | `tsc --noEmit` clean; eslint on changed files clean; jest 168 suites, 2578 passed; `npm run build` ok; `palette:check` 0 findings; `fonts:check` ok |
| backend | lint clean, build ok, 1635 passed / 47 skipped |
| catnip-heist | `tsc` clean, vitest 34 files 564 passed (+ new tests), `build:client` rebuilt into `client/public/heist-game/` |
| funding framework | 426 passed; `fund facts build --check` up to date; `fund check --all` 15/16 (x402 `b:fresh`, as before) |
| copy-lint | 0 findings in 781 files; its tests 84 passed |

E2E runs (earlier today): `tracks/a-build/e2e-pay-goal/stack.sh all` 24/24 API + 7/7 UI;
`e2e-crypto-pay` 14/14. Screens: `scratchpad/pay/e2e/`, QA `scratchpad/pay/qa/`, this pass
`scratchpad/pay/fix/` (under `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/`).

## Open

- F-023 Paris sentence on the landing; "Arc shelter rail opens soon" vs the F-025 note.
- Wallet-browser links reopen the plain URL (buyer taps Buy again; the open order comes back).
- A tx hash the chosen chain doesn't know waits 20 minutes before the page says so (BACKEND.md).
- On a cat paid straight into the split, the stored share bps is the treasury-route setting; impact ledger files shop shares under "direct".
- The checkout does not tell a buyer that part of a shelter cat's price goes to the shelter (would be a new public claim; needs a fact first).

## Founder steps, in order

Also in the CLAUDE.md tracker.
1. Treasury addresses per chain (`treasury.public.ts` or `CRYPTO_PAY_TREASURY[_<chainId>]`), then `CRYPTO_PAY_ENABLED=true` (`CRYPTO_PAY_NETWORK` defaults to `mainnet` under `NODE_ENV=production`). The `wallets.public.json` `shelter-split-treasury` is filled since 2026-10-05 (the Token Tails treasury, `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A`); `treasury.public.ts` may only hold that value, and using it for checkout revenue is still a founder decision.
2. ~~Pick the Legendary pack price.~~ Done 2026-10-04: $350, on sale for $100 until 27 Nov.
3. Shelter cats: `CRYPTO_PAY_CAT_SHELTER_BPS` decided 2026-10-04 (50%, now the default 5000); still decide `CRYPTO_PAY_SHELTER_SHARE_ENABLED`; no Stripe Price object is needed (the server sets $5 per PaymentIntent); buy one by card on production.
4. Stellar packs closed 2026-10-09 18:00 UTC (in code); refund `STELLAR_DEPRECATED` orders.
5. Backend deploy keeps `SHELTER_GOAL_SCAN` on (default) with an Arc mainnet RPC; the first scan takes a few minutes.
6. ~~Verify F-023 or drop the Paris sentence.~~ Founder confirmed the event 2026-10-04: F-023 is company-reported (landing surface, café footage only). Third-party verification (open the x.com post, confirm the partners) is still open before partner names may appear.
7. ~~Only after a written override (decision #15): `NEXT_PUBLIC_HEIST_LANDING_SECTION=1`.~~ Done 2026-10-04: founder override recorded; the section is on by default.
8. At handover: C-001 `campaign.rotation` (facts edit, `fund facts build`, deploy client and backend).
