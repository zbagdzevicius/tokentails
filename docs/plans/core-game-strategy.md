# Token Tails Core Game: Strategy & Plan

Date: 2026-09-29. Tags: **(E)** means evidence from the repo or a cited source. **(J)** means my judgment. Effort is in developer-days (d) and is always (J). I had no analytics or database access, so every usage decision below waits on the data pull in §10. None of this is legal advice.

## 1. Bottom line

- **Consolidate the core game. Do not expand it (J).** Keep Paw Match as the daily game in the app. Freeze Purrsuit and Cupid Cat until the data rules on them. Delete the placeholders and dead code. Build no new Phaser modes. Catnip Heist is the only new-game slot.
- **In Q4 the core app gets fixes only (J).** Payment forgery, client-set prices, personal-data exposure, uncapped AI spend and the codex cron are fixed in October, about 6 d. Mobile release and `/live` hardening follow in November. Heist keeps its October track (E, `docs/plans/catnip-heist-strategy.md:71`).
- **The product people remember is the cat, not the mode (J).** That means one cat record, a Home/Shelter hub, and fiat purchase of portraits and named shelter cats. The shelter-share ledger is published only once orders reconcile with Stripe payouts.
- **Keep crypto off-chain, opt-in and web-only (J).** Postpone the $TAILS TGE. Counsel should decide before about Oct 21. Stop creating custodial wallets at signup. Show no crypto in app or portal builds.
- **Heist feeds the app, never the reverse (J).** Keep them separate now. Next, let owned cats play in Heist on owned channels. Then link accounts through `/live` with replay verification. Then the Cat Yard becomes the hub.

## 2. Where the core game stands

### Modes

| Mode | State (E) | Usage data needed | Verdict (J) |
|---|---|---|---|
| **Paw Match (MATCH_3)** | 5,408 lines, with one 4,527-line scene. 30 generated levels, the best mobile HUD, depends only on `events.ts`. Raw score is accepted up to 1,000,000 (`user.controller.ts:1043-1053`) | WAU, D1/D7 by first mode, per-level funnel from `match3[]` | **Keep** as the daily game |
| **Purrsuit (CATNIP_CHAOS)** | 80 level files. Level `01` is 3.4 MB. 18 backend keys have no level file. Level order is enforced only in the client (`CatnipChaosLevels.tsx:102`) | Runs per level, share of runs on `01`, funnel from `catnipChaos[]` | **Freeze**, decide at G2 |
| **Cupid Cat (PIXEL_RESCUE)** | 14 Valentine levels. The date lock uses the device clock (`PixelRescueLevels.tsx:20-34`). `seasonEvent` points earn nothing | Off-season runs, `seasonEvent` totals per user | **Freeze**, and fold it in later |
| **Base (HOME)** | One map. Feeding pays $TAILS with no ownership check, and the read-then-write may pay twice (`cat.controller.ts:284-313`) | `PUT /cat/:id` calls per day, `monthFeeded` | **Merge** with Shelter at menu level |
| **Shelter** | Shared `CoreMap` and NPC code. Opens the payment flow | Shelter visit to purchase (no event exists yet) | **Merge** into the hub |
| **storyMode managers** | 14 of 18 files are never imported | None | **Sunset** |
| **purrquest** | `SpikeManager` is shared. Boss and Enemy are used only by `Abilities.ts` | None | **Merge** `SpikeManager` into shared code, **sunset** the rest |
| **Purragotchi, RoguePaws, HyperTails** | Empty folders with no references (E, red team check) | None | **Sunset** |
| **PURRQUEST, CATBASSADORS** | Enum values only. Old `Game` rows and the `/live` path use them | Rows by `type` | **Keep** as enums |

### Platform health (E)

- **Mobile releases are blocked.** `output: "export"` is commented out in `client/next.config.js`. The ISR (`revalidate: 3600`) and `fallback: "blocking"` routes would fail under export. `client/out/` is six months stale. Android targets SDK 35. (J) API 36 is probably required for updates now, so check Play Console.
- **Stellar payments can be forged.** The verifier does not check destination, asset or amount, and `hash` is not unique (`web3.service.ts:14-62`, `order.schema.ts:34`).
- **Stripe price comes from the client** (`image.controller.ts:328,359`), and confirm may be replayable.
- **Personal data is exposed.** Public `GET /user/profile/:userId` and `/web3/loot/buyers` return emails and wallets. There is no `whitelist` on `ValidationPipe` (`main.ts:59`).
- **Throttler is not global.** Portrait regenerate is unauthenticated and paid (`app.module.ts:76`).
- **Codex cron runs daily** and wipes the monthly counters (`docs/BACKEND.md`).
- **`/live` trusts the client.** It stores the raw body, applies a `?? 420` fallback for unknown types (`user.controller.ts:994,1005`), and has no throttle.
- **Dependencies are past end of life:** Nest 9, Mongoose 6, and Phaser 4 RC. There is no store IAP.

### Economy (E)

- **Catnip and $TAILS have no spend sinks.** Revenue is Stripe portraits ($6, $49 and $69) plus packs ($5, $25 and $400).
- **Pack odds are in code.** `content.utils.ts` says $350 for the Legendary pack while the client says $400.
- **The impact claim has no payment rail behind it.** `deployments.json` is `[]` and no backend code pays shelters.
- **Headline figures are SEI-era peaks.** The latest are 154,161 weekly transactions and 39,652 weekly active wallets (`funding/PLAN.md`, red-team item 4).

## 3. Decision: Focus and consolidate, with the Platform plan's money gate

**Recommended (J):** use the Focus strategy as the backbone and add four pieces:
- From the **Platform** strategy: the cat record as the product, Gate 1 (reconcile orders before any impact claim), and impact-funnel analytics.
- From **Synergy**: a separate `heist[]` catnip array, and "reuse the method, don't port the modes".
- From the **red team**: move mobile work to November and keep October to about 6 d of core work.

**Why:** the team is tiny and cannot take investors, and Heist Phases 0–1 already use 17–21 agent-days plus 8–9 human-days (E, strategy §5). Fixing money and trust is a prerequisite for Heist Phase 2 anyway (E, `:68`). The mode data does not exist yet, so decisions that cannot be undone wait for gates.

**Why not the others:**
- **Portfolio**, where each mode becomes a portal spin-off: a second portal product would compete with Heist while Heist is still proving the channel. Match-3 is crowded (E, Royal Match plus Candy Crush take more than half of genre revenue). Its figures (300k plays a month, €3–8k a month) sit 10–60x above Heist's own target (E, `:163`). Keep one idea from it: re-evaluate a Paw Match spin-off in Q2 2027 at the earliest.
- **Platform-first**, with a shelter-network growth push: the direction is right, but targets of 40 shelters and €30–60k have no baseline. Onboarding shelters is sales work the team has not sized. Keep its gate and ledger, not its scale targets.

## 4. What happens to each mode

| Mode | Action | User assets | Comms |
|---|---|---|---|
| Paw Match | **Keep.** Add a score plausibility check (score ≤ f(level, time limit)). Split the scene before adding features. Deterministic seeded "Daily Paw Match" only if D7 justifies it (5–8 d) | Existing `match3[]` bests stay | None |
| Purrsuit | **Freeze** and fix crashes only. At G2, either **rework** (split level `01`, enforce level order on the server) or **archive** it | Keep `catnipChaos[]` bests and caps whatever happens. Before removing the 18 orphan keys, count users with values under them and migrate or keep those values | In-app notice: "No new levels for now, your progress is safe" |
| Cupid Cat | **Freeze.** Replace the device-clock date lock with server dates before any rerun. If G2 keeps Purrsuit, turn it into a February "Rescue" chapter in Purrsuit | Map `seasonEvent[]` to the new chapter indices with a dry-run script and rollback. Decide whether `seasonEvent` converts to catnip | Announce with the February event |
| Base + Shelter | **Menu-level merge** into "Home" (about 1 d). The full Phaser merge would be thrown away once the Yard replaces Base after accounts are linked (J, red team) | No change | None |
| storyMode (14 files), purrquest Boss/Enemy | **Sunset.** Move the 4 managers in use and `SpikeManager` to `Phaser/hazards/`. Archive the rest on a branch | None | None |
| Purragotchi, HyperTails | **Delete** the folders | None | None |
| RoguePaws | **Re-home** as a later Heist mode: procedural levels the solver proves winnable | None | None |
| PURRQUEST, CATBASSADORS | **Keep** as enums. Never rename `/user/catbassadors/live` | Old rows kept | None |
| Staking yield (economy) | **Sunset** after the TGE decision. Replace it with care-streak rewards | Snapshot `staked` cats and accrued rewards. Unlock cats and honour accrued amounts | Notice 30 days ahead, on the same day as the TGE announcement |

## 5. Platform fixes in priority order

Each fix ships as its own change, per `CLAUDE.md`.

| # | Fix | Effort (J) | Owner |
|---|---|---|---|
| 0 | Read-only order audit: repeated `hash` values, Stellar destinations other than the treasury, Stripe amounts against catalogue prices. Decide on clawback or write-off | 0.5 d + 0.5 d | Agent queries, human decides |
| 1 | Stellar verification (destination, asset, amount ≥ server price) and a unique `hash` index | 1–2 d | Agent, human review |
| 2 | Stripe: server price table, idempotency on `intent.id`, webhook as the only thing that grants items | 1–2 d | Agent, human review |
| 3 | Guard profile and `loot/buyers`, and add `whitelist` to `ValidationPipe` | 1 d | Agent |
| 4 | Throttler as `APP_GUARD`, and auth on portrait regenerate | 0.5 d | Agent |
| 5 | Codex cron to monthly. Repair counters from `Game` history if possible | 0.25 d | Agent |
| 6 | Feeding: ownership check and atomic `$inc` | 0.5 d | Agent |
| 7 | Mobile: static export when `NEXT_PUBLIC_IS_APP` is set, client-side cat and article routes, CI check that `out/index.html` exists, SDK 36, current Xcode | 3–6 d + 1–2 d review | Agent builds, human handles the stores |
| 8 | Hide Stripe and Stellar checkout in `isApp` builds. IAP (RevenueCat) is deferred | 1 d | Agent |
| 9 | `/live` hardening: whitelisted fields, throttle, per-type caps including PIXEL_RESCUE, remove `?? 420`. **A Heist Phase 2 dependency** | 1 d | Agent |
| 10 | Per-mode start/finish/fail events on the Heist PostHog EU scheme, plus a `platform` field on `Game` rows | 1.5–2 d | Agent, human consent decision |
| 11 | Rotate secrets, untrack `.env.app` and `.env.production`, purge Telegram tokens from history | 1–2 d | Human |
| 12 | Nest 11, Mongoose 8, stable Phaser | 5–9 d | Agent, 2027 |

## 6. Economy and crypto stance (J, not legal advice)

- **Keep:** Stripe portraits, blessings and fiat purchase of named shelter cats. Catnip stays a capped soft currency.
- **Simplify:**
  - $TAILS becomes off-chain points with sinks: cosmetics, portrait discounts, shelter vote weight.
  - Remove `spent` and paid tiers from airdrop eligibility.
  - On native builds, replace paid random packs with direct purchase. If packs stay, publish their odds.
- **Isolate:** NFTs (mint a provenance receipt only on explicit claim), crypto checkout and wallet connect go into an opt-in area on the web only. Portal and app builds show no chain, tier or NFT copy (E: Poki and Steam ban crypto, and Apple bans token rewards for tasks).
- **Stop:**
  - Custodial wallet creation at signup. Create wallets lazily on opt-in, or use Wallets Kit.
  - Freezing the existing keys does not settle value already in them. First check Horizon balances and decide how holders withdraw.
  - Shelters should own their receiving addresses, or be paid through a licensed partner such as Stripe Connect.
- **Cautions:**
  - MiCA: a white paper would have to be notified around Oct 21 for a Nov 19 TGE. The airdrop's link to purchases and personal data makes it look like an offer (E, `funding/PLAN.md:20-22,66`).
  - CASP: custodial wallets and "held on behalf of the shelter" wording.
  - Store rules 3.1.1 and IAP.
  - Gambling optics from paid packs plus the spin wheel.
  - Ticker collision with the dead ERC-20 TAILS.
- **Legacy accounts** (Telegram-only, no email):
  - Freeze their balances and publish a snapshot hash, or announce a sunset with refunds on request.
  - **No Telegram-based recovery.**
- **Consequence to accept:** hiding checkout makes the store apps earn nothing. Revenue comes from the web until IAP exists.

## 7. How the core app and Catnip Heist fit together

One combined timeline, one track at a time (J):

| Period | Heist (E, strategy §4) | Core app |
|---|---|---|
| Oct 2026 | Phase 0 (to Oct 18), Poki gate Oct 19, soft launch Oct 27 | Fixes 0–6 and deleting the placeholders (~6 d). TGE decision by the humans |
| Nov 2026 | Phase 1: portal, 12 levels, Daily Heist | Fixes 7–10, store resubmission, user notices |
| Dec 2026 | Phase 1 to 5k plays | G2 data review. Prepare the replay branch in `/live` |
| Dec–Mar 2027 | Phase 2 if levels 1–3 reach ≥40% completion: `CATNIP_HEIST` branch, `replayHash` unique index, separate `heist[]` array | Owned cats playable in Heist on owned channels (3–5 d), then account linking (8–12 d) |
| Apr 2027+ | Phase 3 | Cat Yard replaces Base as the hub (5–8 d). Decide whether to merge catnip. Evaluate a Paw Match spin-off |

Rules:
- `/live` stays the single write path.
- Heist's "Meet the real cat" says "featured cat" until Gate 1 passes and `/impact` can be audited.
- Pull the sim out of Heist into a shared package only in Phase 2.

October capacity (J): about 6 core days on top of Heist's 17–21 agent-days and 8–9 human-days. If both do not fit, Heist dates slip one to one. Do not cut the money fixes.

## 8. Best case and realistic case (all numbers J unless marked)

| Horizon | Best case | Realistic |
|---|---|---|
| 3 months (Dec 2026) | No duplicate hashes accepted. Store builds live on SDK 36. Three modes plus the hub. TGE postponed. Per-mode analytics baseline in place | Payment fixes merged. Mobile build submitted but review drags on. Baseline is 4–6 weeks old. G2 slips to January |
| 6 months (Mar 2027) | Heist linked to accounts, and ≥10% of linked Heist players open the hub. First quarterly shelter ledger. Fiat revenue per payer +20% | Linking in progress, because Phase 2 starts only if its gate passes. Ledger drafted. Purrsuit archived or reworked |
| 12 months (Sep 2027) | App D30 ≥7% (E: match genre benchmark is 7.2%). ≥1,000 named cats blessed or rescued a year. Yard is the hub | App D30 of 3–5%. A few hundred cats. Paw Match spin-off decided on data |

Benchmarks (E, GameAnalytics 2026 and Segwise): median mobile D1 is 22%, puzzle D1 is 31.9%, D7 is 12.2%, D30 is 5.4%. Set Token Tails' own targets after one month of event data, not before.

## 9. Next 30 days, aligned with Heist's 30 days

| Week | Core app task | Owner | Effort | Heist same week (E) |
|---|---|---|---|---|
| 1 (Sep 29–Oct 5) | Data pull (§10), order audit (fix 0) | Human + agent | 1 d | CI, icon, PostHog, licences, Poki submit |
| | Fixes 1–2 (Stellar, Stripe) | Agent, human review | 2–4 d | |
| 2 (Oct 6–12) | Fixes 3–5 (personal data, throttler, cron) | Agent | 1.75 d | Playtests, shelter outreach (human) |
| | Delete placeholders and unused storyMode files, move `SpikeManager` to shared code | Agent | 1 d | |
| 3 (Oct 13–19) | Fix 6 (feeding). Counsel decision on the TGE before about Oct 21. Draft user notices (TGE, staking, Purrsuit freeze) | Agent / human | 0.5 d + 1 d human | Retune, remote levels, Poki gate Oct 19 |
| 4 (Oct 20–27) | Change the codex countdown on the day of the TGE announcement. Spec the menu-level Home merge. **G1 review** | Agent / human | 1 d | Daily Heist, soft launch Oct 27 |

Core total: about 6–8 agent-days and 2–3 human-days. Mobile (fixes 7–8) starts Nov 2.

## 10. KPIs and decision gates

- **G1 (Oct 28):**
  - Pass: fixes 1–6 merged, zero duplicate order hashes accepted after the fix, and orders reconciled with Stripe payouts to within 1%.
  - Fail: no impact claim and nothing new starts.
- **G2 (Dec 1, or four weeks after events go live):**
  - Archive Purrsuit and move Cupid Cat to a February event if either holds:
    - Purrsuit weekly runs are under 25% of Paw Match's.
    - 70% or more of Purrsuit runs are on level `01`.
  - Otherwise rework Purrsuit and add the Rescue chapter.
- **G3 (Heist Phase 2):** link accounts only if levels 1–3 reach ≥40% completion and fix 9 has shipped (E).
- **G4 (Q2 2027):** evaluate a Paw Match spin-off. It needs Heist Phase 1 targets met, Paw Match first-mode D7 at or above the other modes, and ≥15% of `Game` rows.
- **Standing KPIs:**
  - WAU per mode.
  - D1/D7/D30 by first mode and by platform.
  - Fiat revenue per payer.
  - Shelter-to-purchase conversion.
  - Share of scores at or near each cap.
  - € reconciled to shelters per month.

**Pull before the first decision:**

1. **Mongo `games`:**
   - Runs and unique users per `type` per week, for the last 12 weeks and for the 2025 peak.
   - Median and p90 `time` per mode.
   - Share of Purrsuit runs on level `01`.
   - Share of PIXEL_RESCUE runs saved with `completedLevel: null`.
   - Rows with an unknown `type`, and rows at or near each cap.
2. **Mongo `users`:**
   - Level funnels from `catnipChaos[]` and `match3[]`.
   - Values under the 18 orphan level keys.
   - `seasonEvent` totals.
   - `monthFeeded`.
   - Staked cats and accrued rewards.
   - Share of users with 2 or more cats.
   - D1/D7/D30 grouped by the mode of each user's first `Game` row.
3. **Mongo `orders`:**
   - Counts of repeated `hash` values.
   - STELLAR orders against the Horizon destination.
   - Stripe `amount` against catalogue prices.
   - COMPLETE `priceUsd` by `chainType` × `entityType` × `id` × month, for 12 months.
   - Outstanding `affiliated` USD.
4. **Legacy accounts:** users with `telegramId` and no email, with `sum(tails)`, `sum(spent)`, `sum(affiliated)`, their cats, their orders, and Horizon balances of their custodial wallets.
5. **NFT holders** of the Soroban Cat, Blessing and Pass contracts.
6. **Platform:** web/iOS/Android DAU and MAU from Firebase and the stores, crash-free sessions, and whether the store listings are compliant.
7. **AI spend:** OpenAI and Gemini cost per day, plus regenerate calls by user and IP.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Heist and the core app split one tiny team | Fixes only in Q4. Heist dates slip one to one rather than stacking work |
| Impact claims before the money reconciles | Gate G1. "Featured cat" wording |
| Store rejection or removal over payments or target API | Hide checkout in the app. SDK 36. If a fix is late, consider pausing the Android listing |
| TGE or MiCA exposure | Counsel decision before Oct 21. Change the countdown the same day |
| Custodial keys hold value that cannot be decrypted | Horizon balance check first, then a withdrawal plan |
| Freezes upset active players | Notices, preserved bests, February event |
| Past forged orders | Audit first, then decide on clawback or write-off |
| Merges delete progress | Dry-run migration scripts with rollback |
| Unlicensed assets reused in themed heists | Licence check as in Heist Phase 0 |

## 12. Open decisions for the team

1. TGE on Nov 19: go, postpone or cancel. Decide with counsel by about Oct 21.
2. Past forged or underpaid orders: clawback or write-off.
3. Legacy accounts: snapshot hash or sunset with refunds.
4. Existing custodial wallets with a balance: how holders withdraw.
5. Whether `seasonEvent` points convert to catnip.
6. Whether Heist catnip ever merges into `TOTAL_CATNIP_CAP`, and the new cap if so.
7. App monetisation: web-only checkout (zero app revenue) or RevenueCat IAP (5+ d).
8. Shelter-share percentage and ledger format.
9. The PostHog consent basis, shared with Heist.

## 13. Sources

Repo paths are under `/Users/zygimantasbagdzevicius/me/tokentails-app`, read 2026-09-29:
- `docs/GAMES.md`, `docs/BACKEND.md`, `docs/CLIENT.md`, `docs/MOBILE.md`, `docs/DATA_MODEL.md`, `docs/CONTRACTS.md`, `docs/HISTORY.md`, `docs/DEVELOPMENT.md`
- `docs/plans/catnip-heist-strategy.md` (§4 phases, §5 30 days, `:67-71`, `:163`), `docs/plans/catnip-heist-3d.md`
- `funding/PLAN.md`
- `backend/src/user/user.controller.ts:971-1110`, `backend/src/cat/cat.controller.ts:52,284-313`, `backend/src/web3/web3.service.ts:14-62`, `backend/src/web3/web3.controller.ts:133-150,202,276`, `backend/src/image/image.controller.ts:328,359`, `backend/src/order/order.schema.ts:34`, `backend/src/main.ts:18,59`, `backend/src/app.module.ts:76`, `backend/src/shared/utils/content.utils.ts`
- `client/next.config.js`, `client/constants/props-functions.ts:9`, `client/components/PixelRescue/PixelRescueLevels.tsx:20-34`, `client/components/CatnipChaos/CatnipChaosLevels.tsx:102`, `client/components/shared/ProfileModal.tsx:404`, `client/components/shelter-payouts/README.md`

External sources, read 2026-09-29:
- GameAnalytics 2026 benchmarks: https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks
- Segwise retention: https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies
- Sensor Tower Q3'25 match-3: https://sensortower.com/blog/2025-q3-unified-top-5-match%203%20games-revenue-us-6564ce96e1714cfff145168c
- DappRadar Q2'25: https://dappradar.com/blog/state-of-blockchain-gaming-in-q2-2025
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play tokenized assets: https://support.google.com/googleplay/android-developer/answer/13607354
- CrazyGames docs: https://docs.crazygames.com/faq/
- ustwo Alba: https://ustwogames.co.uk/news/together-we-have-planted-one-million-trees-with-alba-a-wildlife-adventure/
- Pawthereum: https://en.wikipedia.org/wiki/Pawthereum
