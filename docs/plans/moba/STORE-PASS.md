# Paw Legends store and Legends Pass (MVP)

Built 2026-11-10 on `feat/pawlegends-store`. The founder asked for the first two revenue streams of the revenue
page: the cosmetics store and the Legends Pass. GAPS.md marked the pass "Won't" until PL1; the founder overrode that
for the pass. Everything here is cosmetic only: no sim file, replay record, hash or `simVersion` changed.

## What shipped

| Part | Where |
|---|---|
| The catalogue (SKUs, prices, items, season table, XP rules) | `backend/src/pawlegends/pawlegends-catalog.ts` (the real one), `pawlegends/src/money/catalog.ts` (game mirror, deep-compared by `pawlegends/tests/unit/store-pass.test.ts`) |
| SKU table and retirement of the presale `pl_*` SKUs | `backend/src/pawlegends/pawlegends.contracts.ts` (`retired`, `kind`, `oncePerAccount`, `bundleOf`, `pass`, `requires`) |
| Ownership and pass progress | collections `pawlegendsowned` (unique `{accountId, item}`) and `pawlegendsseason` (`_id` `<accountId>:<seasonId>`), `backend/src/pawlegends/pawlegends-season.service.ts` |
| Checkout rules | `pawlegends-stripe.service.ts` `checkCatalog`: signed-in only, store consent version, once per account, sets refused while any item is owned, Pass+ upgrade only for Pass owners; the pending-row-first race guard, age bands and spend caps are unchanged |
| Grant and refund | `pawlegends-webhook.service.ts`: the grant runs after the paid row and is idempotent (a retried event heals a failed grant); a refund revokes the session's items and recomputes the pass (premium rewards claimed under a refunded pass are revoked too) |
| Routes | `GET /pawlegends/me`, `POST /pawlegends/pass/claim`; `GET /pawlegends/status` lists the catalogue (docs/API.md) |
| Season XP | both `/live` writers (`pawlegends-live.ts`, `pawlegends-party-live.ts`) call `addXp` after their Game row exists: still one score write path, duplicates pay nothing |
| Guest merge | `mergeStoreProgress` (pass XP `$max`, free-row claims, pass rewards) from `guest-lifecycle.ts` |
| Game | `render/cosmetics.ts` (16 patterned store coats, 29 pass coats, store and pass frames and titles), `ui/store.ts` (Store screen), `ui/passPanel.ts` (Legends Pass screen, the Treat Track's second tab), `money/entitlements.ts` (`store{items, season}`), `money/checkoutBridge.ts` (`purchase-intent{sku}` for catalogue SKUs), results save chip "+N Season XP" |
| Host | `client/components/pawlegends/PawlegendsStoreSheet.tsx` (price, age band, email, consent, safeguards, redirect to Stripe), `bridge.ts` (`store`, `pass-claim`, store intents), `checkout.ts` (`storeCheckout`, `me`, `passClaim`) |

## Prices (VAT inclusive, the same cents in USD and EUR)

| SKU | Price | Gives |
|---|---|---|
| `pl_coat_<hero>_<key>` × 16 (one per original hero, not the 4 champions) | $2.99 | One patterned Common coat |
| `pl_frame_goldpaw`, `_moonlit`, `_sunbeam`, `_bone` | $1.99 | A frame and its title (titles are not sold alone) |
| `pl_set_cats_s1` | $14.99 | Clem, Sage, Meatball, Pixel, Duchess, Stilts coats + Moonlit frame and title (singles $19.93) |
| `pl_set_dogs_s1` | $14.99 | Brutus, Cacklejaw, Nugget, Marshmallow, Bravo, Chili coats + Bone frame and title |
| `pl_pass_s1` | $7.99 | Premium row (30 rewards) |
| `pl_pass_plus_s1` | $19.99 | Premium row + 15 tier skips + the Eclipse coat (Epic, Duchess) |
| `pl_pass_plus_upgrade_s1` | $12.00 | Pass owners only: the exact difference |

`coat.frankie.corndog` and `coat.bravo.opera` are free Treat Track rewards and are not sold (GDD §8.1 #7).

## Season 1

- Name "Season 1: First Paws". Starts 2026-11-10 00:00 UTC, ends 2027-01-05 00:00 UTC (8 weeks). Never expires: S1
  stays claimable after it ends, and Season XP keeps going to S1 until an S2 row exists in `SEASONS`.
- 30 tiers × 400 Season XP. Free row: a reward every third tier (6 coats, 2 titles, 2 frames). Premium row: one reward
  per tier (22 coats, 4 frames, 4 titles; the Sunforged Clem coat at tier 30). No randomness: every reward is listed.
- Season XP per verified match (the Treat XP numbers, on the server): win 100, loss 60, forfeit 20, +10 per takedown
  (kills + assists of the player's slot, at most 15), +150 for the first win of the UTC day (an atomic `winDay` claim).
  Party matches over the 30-a-day cap pay 0; AFK-rejected party saves pay nothing. Daily quests stay Treat Track only.
- `tier = min(30, floor(xp / 400) + skips)`. Buying the pass late unlocks every premium tier already reached.

## Native app (Capacitor)

No Store rail item, no buy button, no price, no "buy on the web" wording; the host answers any store intent
`ok: false`. The Pass tab shows progress and free-row claims; the premium row shows locked with no call to action.
Web-bought items are not drawn in the app; pass free-row rewards are (founder decision 1, default).

## Not in this MVP

- **Peer looks in party and PvP (`party.look`).** Your own look is drawn in every match (solo, bots, party); other
  players' store coats are not drawn yet. It needs a relay message with an ownership check and the match message's
  `cosmetics.looks`, which touches `party-relay.ts` (coordinate with the drain-work lane first). The relay already
  sends `cosmetics.heroSkins`, which the game also does not read yet.
- Crypto checkout (phase B: add `PAWLEGENDS` to `SKU_KINDS` and route the grant to `grantPurchase`).
- Emotes, My Cat Hero, Rare to Legendary skins, hero bundles (phase 2).

## Ops runbook

1. **Before Stripe live mode:** founder approves the store terms section (version `2026-11-10`, the withdrawal waiver
   wording on the purchase sheet) and the VAT/OSS decision #17. Until then test mode only.
2. **Test-mode purchase:** `stripe listen --forward-to localhost:3005/pawlegends/stripe/webhook`, put the printed
   `whsec_…` in `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`, a test key in `PAWLEGENDS_STRIPE_SECRET_KEY`, sign in on
   `/pawlegends`, buy a coat with card 4242 4242 4242 4242. Check: a `paid` row in `pawlegendspurchases`, a row in
   `pawlegendsowned`, the coat in the store as "Owned · Equip". This also closes GAPS G-Pay.
3. **Refund:** refund in the Stripe dashboard; `charge.refunded` revokes the items (and downgrades a pass). A refund
   under the presale terms keeps items (`refundUnderTerms`), as before.
4. **A missing grant** (webhook failed after the paid row): Stripe retries; a retry runs the idempotent grant. Manual:
   resend the `checkout.session.completed` event from the dashboard.
5. **New season:** append an `s2` entry to `SEASONS` in both catalogue copies, set `CURRENT_SEASON_ID`, add the coat
   palettes in `render/cosmetics.ts` `PASS_COAT_PAL`, and add pass SKUs. S1 stays claimable.
6. **Price change:** edit `pawlegends-catalog.ts` in both copies (the game test fails until they match).

## Founder decisions (default used until you answer)

1. **Web-bought items in the native app:** the task rule and GDD §8.1 #10 disagree. Default: hide own purchased items
   in the app; show pass free-row items. (Peers' looks are not drawn yet anyway.)
2. **Pass size:** 30 tiers × 400 XP (about 100 matches in 8 weeks) vs GDD's 50 tiers with 3 skins. Default: 30 tiers,
   coats, frames and titles only.
3. **Season 1 dates:** default start 2026-11-10 (build day), 8 weeks; set the real ship day in both catalogue copies.
4. **Daily quest XP:** default Treat Track only (quests are local, not verifiable).
5. **Emotes and My Cat Hero:** default phase 2.
6. **Terms and VAT:** new consent version `2026-11-10` for cosmetics and the pass (delivered now, withdrawal right ends
   at delivery). The terms page section still has to be written and approved before live mode; VAT/OSS decision #17.
7. **Crypto rail:** default card first, crypto in a follow-up PR.
8. **Sets with an owned item:** default refused (the store shows "You own some of these: buy the singles"), no
   prorated price.
9. **Paid Common coats look different from free coats:** default paid coats carry a fur pattern, free ones stay
   palette-only.
10. **Peer looks in party/PvP:** default follow-up PR (see "Not in this MVP").
