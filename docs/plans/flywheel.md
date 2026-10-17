# Token Tails: One Flywheel

*2026-10-06. (E) marks evidence from the repo or a live check. (J) marks judgment.*

## 1. Bottom line

- **The hub is one public ledger: the Named Cat Ledger at `/impact`.** Each line is money that actually reached Pink Paw for a named cat: cat, €, source, receipt link. Everything else either fills this ledger or uses it as proof. Today it shows €0 (E).
- **The money has to come from outside payers.** That means Etsy memorial portraits, $5 Pink Paw cats and portraits through Stripe, and a fixed share of any prize. Heist treats are 0.01 USDC each, paid from our own float (E, `rail.test.ts:45`), so they are a proof signal and not income.
- **Catnip Heist is the free top of the funnel, held behind gates.** No new levels, no portal and no Daily Heist until 5–8 human playtests show level-1 completion of at least 70%. So far there is 1 human session against 8,000 bot runs (E, `BOT-REPORT.md` §C).
- **Funding becomes an output of the loop, not a project of its own.** Only entries that reuse the receipt and the monthly report go ahead, with no new build and no new chain. Arc is the only chain that gets mainnet work.
- **This week, two human actions unblock the whole loop:** run the Arc-only mainnet wave (about $7.25, about 1 h) and open the Etsy shop. The Pink Paw key handover is the third, and until it happens a bank-transfer receipt counts on the ledger.

## 2. Why focus is scattered today

- **(E) Effort is spread over about ten workstreams.** There are 1,123 commits in total and 44 since Oct 3. About 28 of those 44 went to the shelter rail and multi-chain giving, about 15 to core UI polish, 4 to landing and mascot, and about 2 to Heist. Revenue (Etsy, itch, Fiverr) got 0.
- **(E) Writing outweighs shipping.** `funding/` holds 265 `.md` files (about 336k words), and `docs/plans/` adds about 132k words, including the 180 KB `landing-game-alignment.md`. Three strategy plans (`core-game-strategy`, `catnip-heist-strategy`, `landing-game-alignment`) each set their own 30-day plan. Recent commits follow none of them closely (J).
- **(E) The funding calendar picks the chains.** There are 11 ShelterSplits and 7 DonateRouters, all on testnet, across 7 chains, each mostly serving one hackathon track. `opportunities.json` (as_of Oct 3) marks Colosseum, Monad and Arbitrum Singapore as SKIP, but the tracker still says to submit them.
- **(E) Every loop stops at the proof step and none refills.** The rail is off (`api.tokentails.com/shelter/donate/status` returns `enabled:false, railState:"not-deployed"`). Crypto checkout is off (`treasury.public.ts` is `null` on all 7 chains). Sales are €0, and FY2025 revenue was €105 (F-022, unverified). Heist has no players and no portal code.
- **(J) The summary:** Token Tails built Ecosia's proof layer before it had Ecosia's payer layer or habit layer.

## 3. The flywheel

```
            ┌──────────────────────────────────────────────┐
            │      HUB: NAMED CAT LEDGER (/impact)         │
            │  cat · € · source · receipt (Arc / bank)     │
            └──────────────────────────────────────────────┘
                 ▲                                  │
   2 SETTLE      │                                  ▼   3 PROVE
   monthly payout│                       /impact, landing proof,
   to Pink Paw   │                       Heist rescue card, facts.json,
                 │                       monthly Pink Paw report
                 │                                  │
   1 EARN        │                                  ▼   4 REUSE
   Etsy portraits, $5 cats, ◄────────────── grant/jam entries + sponsor
   /portrait, prize share                    pitch use ONLY the report
   (each tagged to a named cat)                     │
                 ▲                                  ▼   5 REACH
                 └────────── "Meet <name>" ◄── 1 post or clip per receipt,
                             cat page: portrait     Heist free on /heist
                             / $5 cat / adopt       (portal after playtest gate)
```

1. **Earn.** Each sale or prize carries a published share for a named cat (€1 per Etsy order, 50% of a $5 cat, 10% of prize cash). That share is what Settle has to pay out.
2. **Settle.** On the first Monday of each month, one payout goes to Pink Paw: on Arc into the shelter's own wallet, or by bank transfer from the MB until the handover. That payout is the receipt Prove publishes.
3. **Prove.** The ledger feeds `/impact`, the landing page, the Heist card (`rail.ts` already switches from "Opens soon" to live) and `facts.json` (P-002 and P-003 become verified). This gives Reuse one honest document.
4. **Reuse.** The monthly report is the only evidence used in Arc, Anitya, Team1 and a sponsor-match pitch. The cash won comes back to Earn.
5. **Reach.** Each receipt becomes a post or clip about the cat. Heist's rescue card already links "Meet <name>" (E, `pink-paw.ts:155`). Those visits lead to buyers and adopters, which feeds back into Earn.

## 4. North star and supporting metrics

**North star: verified € settled to named Pink Paw cats per month, split into non-prize and prize sources.** Only money with a receipt link counts. Today it is €0.
- **How to measure it:** count the ledger rows on `/shelter-payouts`, Arc explorer payouts and the MB bank statement, reconciled with Stripe and Etsy.
- **Guardrail:** from November, the non-prize amount must be above €0 every month.

**Supporting metrics:**

| Metric | Loop step | How to measure with what exists |
|---|---|---|
| Paid orders per week (Etsy plus Stripe $5 cats and portraits) | Earn | Etsy shop stats and the Stripe dashboard; reconcile the orders collection |
| Heist level-1 completion % and Meet-the-cat clicks per week | Reach | PostHog EU events already in `catnip-heist/src/analytics/index.ts` (`heist_open` with `from`, `heist_run_complete`, G10 funnel). Add a single `meet_cat_click` event |
| Entry hours spent vs € won | Reuse | CLAUDE.md tracker rows, plus one "hours" column |

## 5. Every piece's role

| Piece | Role | Loop step | What to stop doing |
|---|---|---|---|
| `/impact` ledger, `/shelter-payouts`, gallery, goal meter | core | Settle, Prove | Stop showing unlabelled totals. Headline becomes "€ settled to named cats", with a source column |
| Arc ShelterSplit/DonateRouter mainnet (Arc only) | core | Settle | Stop any mainnet or chain work on the other 6 chains |
| Pink Paw key handover + consent letter | core | Settle | Stop waiting for it. Use the bank-transfer receipt meanwhile |
| Etsy Rainbow Bridge portraits (+ adopted-cat pilot) | core | Earn | Stop letting it slip. D1 is 5 days overdue (E) |
| AI portrait generator, used through an internal CLI | core | Earn | Never route orders through the public `POST /image/portrait` (known issue, founder decision) |
| $5 Pink Paw cats + Stripe | core | Earn | Stop UI polish on checkout. Do one real card test-buy |
| Facts registry | core | Prove | Stop using "$40K" and "800+" without the "company-reported" label |
| Monthly Pink Paw report | core | Prove, Reuse | Replaces the strategy docs |
| Catnip Heist (8 levels, rescue card, PostHog) | feeds | Reach | No new levels, Daily Heist or portal until L1 ≥70% |
| Heist sponsored treats (0.01 USDC, capped) | feeds | Prove | Stop counting them as impact € |
| Arc Microgrants, Anitya main + finished weeklies, Team1 (≤1 h) | feeds | Reuse | Stop any entry that needs a new build |
| Tameion (deadline Oct 17 ET, ≤1 h) | feeds | Reuse | Fix the tracker date (it says Oct 10) |
| X posts, Heist replay clips | feeds | Reach | Stop chain-first framing. Locate ai-ugc (not at `~/me/apps/ai-ugc`, E) or use the Heist promo tools |
| Landing page, 3D mascot | feeds | Prove, Reach | Freeze visuals. The only change allowed is wiring the ledger and "Play / Meet the real cat" above the fold |
| Core app: Paw Match, Home/Shelter, blessings | feeds | Earn | Stop polish commits. Only the remaining money and safety fixes (the Legendary price bug is already fixed, E) |
| Sponsor match (pet food or pet insurance) | feeds (from Dec) | Earn | Do not pitch before 2 reports exist |
| Colosseum | pause | – | 3–5%, general prizes in Solana CASH, about 7 h (E). Only a dated founder override keeps it |
| Heist portals, Daily Heist, Steam, `/live` account link | pause | Reach | Gated on playtest numbers |
| Shelter rail on the other 6 chains, crypto checkout, wallet donate, x402 | pause | – | Stop network and coin logo work |
| Purrsuit, Cupid Cat, core UI polish | pause | – | Crash fixes only |
| Mobile store releases | pause | – | Wait until $TAILS is stripped |
| itch packs, Fiverr, Printify | pause | – | Wait for the IP assignment and the accountant's answer |
| CMS, cat-assets, second shelter | pause | – | Dormant |
| Arbitrum Dubai, Circle | pause | – | G10 (Oct 31) and the Arc result |
| $TAILS/TGE UI and copy | kill | – | Remove before about Oct 21 (MiCA/CASP) |
| Stellar packs | kill | – | Sunset Oct 11 (E) |
| Monad, x402 grant, Mezo, SKALE, Nouns, Game3, Arbitrum DDA, LT travel folders | kill | – | Archive them |
| Extra strategy docs, alignment logs, `.agents`/`_bmad` churn | kill | – | Write no new strategy docs |

## 6. The next 30 days

**Week 1, Oct 6–12: Fill the hub (Settle and Earn).**
- **Human:** run the Arc-only wave, then `a:ingest` and a commit. Submit Arc (target Oct 7; hard deadline Oct 14 23:59 ET, which is Oct 15 06:59 Vilnius). Open the Etsy shop and email the accountant the VAT/OSS question. Ask Pink Paw for the key and the consent letter.
- **AI:** add a source column to the ledger, build the rainbow-bridge CLI and prompts, and draft 5 listings.
- **Gate (Oct 13):** at least 1 receipt on the ledger, Arc submitted, 5 listings live.

**Week 2, Oct 13–19: Make the proof true (Prove).**
- Remove $TAILS/TGE.
- Wire the landing page and Heist card to the ledger. Turn on Heist PostHog with consent and build one dashboard.
- Run 5–8 remote Heist playtests.
- Tameion only if invited, ≤1 h, by Oct 17 ET.
- Arbitrum Singapore results arrive Oct 12. No work needed.

**Week 3, Oct 20–26: Reuse (Reuse).**
- Submit the Anitya main jam (heist-08) by Oct 20, after the G8 check on Oct 18. Its rescue card links "Meet <name>".
- The Arc decision arrives by Oct 21. If it is not funded, Circle stays parked until the report exists.
- Put 8 or more Etsy listings live.

**Week 4, Oct 27–Nov 2: First public spin (Reach).**
- Black Cat Day (Oct 27): one post or clip about a named cat.
- Etsy D14 gate (about Oct 27).
- Nov 1: first monthly Pink Paw report and settlement #1.
- Oct 31: G10 decision on Dubai. Default is drop.
- Nov 5: the day-30 gate (playtest result, Etsy D30 trend).

**Deadlines, on-loop vs off-loop:**

| Deadline (CLAUDE.md) | On or off the loop | Recommendation |
|---|---|---|
| Arc Microgrants, Oct 7 / Oct 14 ET | On | Keep. Needs the wave first |
| Anitya main, Oct 20; weeklies with finished worlds | On | Keep, ≤30 min per weekly |
| Team1 Avalanche, after Oct 21 | On, if ≤1 h | Keep under the cap |
| Tameion, Oct 17 ET | Borderline | ≤1 h or skip |
| Colosseum, Oct 11 (closes Oct 12 PT) | Off | **Drop** unless the founder records an override. Its ~7 h go to Etsy |
| Monad Metropolis, Oct 13 | Off | **Drop** |
| Arbitrum Dubai registration, Oct 31 | Off | Drop at G10 |
| Circle grant, late Oct | Off | Park |

## 7. Weekly operating cadence

- **Monday (30 min): read one scoreboard.**
  - € settled this month (non-prize / prize)
  - Orders
  - L1 completion % and Meet clicks
  - Entry hours vs € won
  - Float balance

  Pick the weakest arrow in the loop. That becomes the week's single build task, plus at most one fix.
- **Daily (15–30 min):** a human answers Etsy orders and messages within 4 h.
- **Wednesday:** at most one entry, and only one that reuses the report.
- **Friday:** one post about a named cat. Update the tracker and `opportunities.json` together.
- **First Monday of the month:** settle, publish the report, update `facts.json`.
- **Standing rule:** pause any task that will not move settled € within 30 days.
- **Dashboard:** the `project-map` subagent (`~/.claude/agents/project-map.md`, which writes `.project-map/`) should draw this flywheel as its main view. That means the 5 loop steps as parts with their status, the north star and the 3 supporting metrics, the gates as milestones, and "decisions waiting for the user" taken from section 8. Run it every Monday and after each gate.

## 8. Decisions only the founder can make

| Decision | Recommended default |
|---|---|
| Run the Arc-only mainnet wave (`CONFIRM_MAINNET=yes`) | Yes, this week |
| Colosseum override | No. Free the ~7 h for Etsy |
| Published shelter shares (€1 per Etsy order, 50% per $5 cat, 10% of prizes) | Yes. Add each as a fact before it is claimed publicly, and never lower a share |
| Bank-transfer receipts count until the handover | Yes |
| Public `POST /image/portrait` endpoint | Lock it to authenticated, capped use. Orders go only through the internal CLI |
| Founder hours: Etsy (~1–1.5 h/day) and entries compete | Etsy wins. Cap entries at about 10 h a month |
| Strip $TAILS/TGE UI | Yes, before about Oct 21 |
| Heist portal choice | Defer to after Nov 5. Poki only with a written tokentails.com carve-out, otherwise CrazyGames Basic |
| Retire strategy docs into the tracker, this page and the scoreboard | Yes, archive them read-only |
| Second shelter | Not before 3 monthly reports |

## 9. Sources

- (E) Live check: `https://api.tokentails.com/shelter/donate/status`, 2026-10-06
- (E) `git rev-list --all --count` gives 1,123; `git log --since=2026-10-03` gives 44
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/donations-STATUS.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/payments-STATUS.md (Legendary price bug fixed Oct 4, treasury `null`, Stellar sunset Oct 11)
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/revenue-kickstart.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/catnip-heist-strategy.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/core-game-strategy.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/funding/STRATEGY-REVIEW.md (Arc about 12%, excludes testnet-only builds; Tameion Oct 17 ET; Colosseum 3–5%)
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/funding/WHAT-WE-ARE-MISSING.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/portfolio/opportunities.json
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/deployments.json and router-deployments.json
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/facts/facts.json
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/src/ui/rail.ts, src/ui/__tests__/rail.test.ts, src/ui/pink-paw.ts, src/analytics/index.ts, playtest/BOT-REPORT.md
- (E) /Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-chain.ts
- (E) /Users/zygimantasbagdzevicius/.claude/agents/project-map.md
- (E) Market comparables: Ecosia, Freerice (switch to sponsor matching), Forest, Finch, TinyKittens, Purina Bowl-by-Bowl, Humble Bundle (backlash over the charity share), Pawthereum, Poki/CrazyGames revenue share
- (J) The hub choice, loop design, roles, targets and cadence are judgment built on the evidence above.
- No `.env*` files and nothing under `funding/.secrets/` was read. No files were modified.
