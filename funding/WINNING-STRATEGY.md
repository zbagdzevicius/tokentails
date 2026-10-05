# Winning strategy (2026-09-28)

> **Status (2026-10-05):** a dated strategy; the odds and calendar below are as of Sep 28.
> Since then: the wave covers seven chains (Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain,
> Monad), all live on testnet with proof payouts; mainnet is one funded wallet and one command
> (`EXECUTION-PLAN.md`, Oct 5 update). The showcase shelter is Pink Paw, with its wallet held by
> Token Tails until the handover. The Sep 30 weekly was submitted. ShelterSplit has 73 tests (149
> in the Foundry project), not 41. Current odds and dates: the tracker in the repo's `CLAUDE.md` and
> `PERCENTILE-REASSESSMENT.md`.

Method: five independent strategies were designed. Three judges reviewed all of them (a base-rate skeptic, a program-judge simulator and a feasibility check). One synthesis then applied every correction. Raw data: `WINNING-STRATEGY-DATA.json`.

**About 45% chance of at least one cash win (range 0.30-0.55). About 28% chance of a win worth $500 or more. The plan is Arc proof-first plus Anitya small-field volume, with Colosseum Tempo, Arbitrum Dubai and Team1 riding the same deployed rail.**

Expected cash is about $1200. Human hours total about 62.5.

## Entries (ranked by contribution to P(≥1 win) per human hour)

| # | Program | Deadline | P | Money (mid) | Human h | Submit |
|---|---|---|---|---|---|---|
| 1 | Arc Microgrants (Circle / Arc): the hero entry, S2 design | Hard close 2026-10-14 23:59 ET | 19% | $500 | 10 | Submitted on DoraHacks. The entry contains: - ShelterSplit on Arc mainnet (chain 5042) with a payable native-USDC receive-and-split path, plus a second instance in EURC. - One proof disbursement tx to a named shelter that agreed in writing and published its own wallet. - A public MIT repo: 41 tests … |
| 2 | Anitya World Jam: Weekly Challenge 2 'Story to Playable' | 2026-09-30 23:59:59 itch time | 13% | $50 | 8 | A small new Anitya world built in the challenge window at app.anitya.space from GLB-exported Catnip Heist voxel cats, guard dogs and props. It is published to the public feed, and the link goes in the Discord #jam-submission channel. An itch page alone is not an entry. First ask on Discord whether A… |
| 3 | Arbitrum Open House Dubai Online Buildathon (HackQuest) | Registration opens Oct 31 | 4.7% | $5000 | 3 | The submission contains: - ShelterSplit on Arbitrum One, from the same wave. - New in-window work: an admin-triggered revenue-to-disburse job, registered in AppModule behind PermissionGuard, which does not touch the score write path. Optionally a Stylus port. - The reused proof reel, and a 2-minute … |
| 4 | Team1 Avalanche Mini Grants | Rolling | 3.8% | $5000 | 2.5 | ShelterSplit on Avalanche C-Chain from the same wave, with one payout linked to the Arc proof, the demo page and the video. Milestone ask: onboard 3 more shelters and route app purchases through disburse().… |
| 5 | Anitya later weekly and surprise challenges (shared $600 pool) | Rolling weekly windows through Oct 21 | 15% | $100 | 10 | One new small world per challenge window, built from the same GLB kit and reusing the editor skill from rank 2. The plan is two challenges, with a new world each time.… |
| 6 | Colosseum Crypto World's Fair: Tempo track (10 x $10k), plus the general pool and Public Goods | 2026-10-12 23:59 PT | 7.5% | $10000 | 7 | The same ShelterSplit repo, deployed on Tempo mainnet (chain 4217) against USDC.e with TIP-20 transferWithMemo per-shelter receipts, shown alongside the Arc deploy. It includes: - A 2-3 minute pitch on camera, and a demo of 3 minutes or less reusing the Arc footage. - A GTM section. - Disclosure: th… |
| 7 | Anitya World Jam: main jam ($1,000 / $700 / $400) | 2026-10-21 22:59:59 UTC | 8% | $700 | 12 | 'Catnip Heist: Shelter Break-in'. It is an impossible cat shelter that is also a heist, fitting the theme 'A Place that shouldn't exist'. It is built from the GLB kit, the largest and most polished of the Anitya worlds, published publicly and submitted through Discord.… |
| 8 | Bezi Jam 14 'Something Wicked' (optional; cut first) | 2026-10-23 to 10-26 (72 hours) | 5.5% | $100 | 10 | A lights-out stealth web build in the spirit of 'make us afraid of the dark', using Catnip Heist voxel assets. New gameplay must be built in-jam, because of the 'built for this jam' rule. Confirm eligibility for heavy engine reuse with the organisers first.… |

### Arithmetic

- **Arc Microgrants (Circle / Arc): the hero entry, S2 design**: Mean of the three judges' corrections: 0.20, 0.19, 0.17. Their method: base 0.13 (20 grants / about 150 entrants, assumed and unpublished) x fit 1.5 (Arc-only mechanism plus a named shelter, against the live arc-split, splitpay-arc and arcdrip) x execution 0.9, which is about 0.18-0.20. S2's x2.0 'completeness' multiplier is removed as double-counting. Without shelter consent: 0.13. Without the native path: 0.14. Range 0.12-0.28.
- **Anitya World Jam: Weekly Challenge 2 'Story to Playable'**: Judges: 0.13, 0.17, 0.12. The raw value is about 0.17: 2 prizes / about 8 final entries (3 seen today, plus the last-day surge) = 0.25, x feasibility 0.7 (exporter not yet built, first time in the editor, 48 hours). Applying the Anitya organiser-payout risk of 0.75 gives 0.13 standalone. In the portfolio math the 0.75 is applied once to the whole Anitya block, not per entry.
- **Arbitrum Open House Dubai Online Buildathon (HackQuest)**: Judges: 0.05, 0.05, 0.04. Base 0.05 (a $30k pool, slot count unpublished, inferred from the London edition) x fit 1.0. The 'existing product' fit lift is denied because users are scored on historical peaks only. Criteria are 'Coming soon', so re-score after Oct 31.
- **Team1 Avalanche Mini Grants**: Judges: 0.04, 0.035, 0.04. Base 0.05 (assumed; the program warns of high application volume) x fit about 0.8 (a bare redeploy with no Avalanche-native feature).
- **Anitya later weekly and surprise challenges (shared $600 pool)**: Judges: 0.20, 0.20, 0.15. The raw value is about 0.20: about 10 entries each, existence 0.8, over two challenges. With payout risk 0.75 it is 0.15 standalone. In the block math the 0.75 is applied once.
- **Colosseum Crypto World's Fair: Tempo track (10 x $10k), plus the general pool and Public Goods**: Judges: 0.08, 0.075, 0.06 (S2 version); S1's version was 0.08, 0.10, 0.08. Tempo: 10 / about 275 Tempo-tagged entries (repo benchmark 150-400) = 0.036, x fit 1.5 (a live memo deploy) = 0.055. General pool 23 / about 2,500 = 0.009, Public Goods 0.005. Multi-track Arbitrum x0.5 is about 0.015, only if allowed. Combined about 0.075. Base track = 0.
- **Anitya World Jam: main jam ($1,000 / $700 / $400)**: Judges: 0.09, 0.09, 0.06. 3 places / about 20 expected entries (the best past edition had 14) = 0.15, x fit 0.9 (first-time builder, mid-table on past scores), x payout 0.75 (2 of 4 past jams published no ranking) is about 0.08-0.10. Raw 0.107 before payout risk.
- **Bezi Jam 14 'Something Wicked' (optional; cut first)**: Judges: 0.05, 0.06, 0.05. The fit of 1.5 is unevidenced, the 'built for this jam' rule makes engine reuse uncertain, and the Bezi tool bias is unverified. The field and slot figures come from S3's unverified author claims.

## Why this wins

Base strategy: I start from S3 (Game-first), which the judges scored highest on corrected P (0.42, 0.42, 0.33; mean 0.39). Its upside comes from Anitya's tiny fields. All the judges' corrections are applied:
- One organiser-payout risk (x0.75) for the whole Anitya block.
- An execution factor for the Sep 30 sprint.
- Meta VR dropped: the files are dated Sep 28, so the Adapted-division eligibility cannot be proven.
- Amazon dropped (0.008).
- Game Gauntlet dropped, because its ban on reskinned pre-Sep-23 work hits an engine reuse.

S2's Arc hero entry is grafted in. All three judges called it the best single entry (corrected 0.20, 0.19, 0.17, mean 0.19). It has an Arc-only mechanism:
- Native USDC is both the gas token and the ERC-20 balance, so a plain send to the contract splits on arrival with no approve step.
- A second EURC instance.
- A named shelter that publishes its own wallet, submitted by Oct 7 into a rolling review.

From S1 and S2 I take the Colosseum Tempo track (10 x $10k), the honest disclosure that only in-window work is judged, and the rule to surface the SEI-as-Stellar mislabel as a fix rather than make it silently. From S1 I take Arbitrum Dubai and Team1 as cheap reuses of the same rail.

Judge fatal flaws applied:
- The "542k registered users" headline is removed everywhere. It is self-reported (F-001), and FY2025 revenue on file is EUR 105 (F-022), so leading with it risks a misrepresentation DQ.
- The Colosseum field uses the repo benchmark: 2-3k submissions, 150-400 of them Tempo-tagged.
- The Base track counts as 0.
- Circle is left out: 0.025, below the user's 10% bar, and it clashes with Arc's exclusivity clause until after Oct 21.
- No traction uplift is assumed unless current, sourced numbers are supplied.

Why the portfolio beats any single strategy: it holds two uncorrelated blocks. The crypto rail (about 0.27 after correlation) and the Anitya voxel worlds (about 0.30) have different assets, judges and organisers. Neither alone gets above about 0.30.

Tiers:
- Core tier, each entry above the user's 10% bar: Arc, Anitya Story to Playable, later Anitya weeklies. Alone they give about 0.39.
- Piggyback tier, each below 10%: Colosseum, Dubai, Team1, Anitya main, Bezi. These are included only because each costs 2.5-14 marginal hours on assets already built, and Colosseum carries the largest cash. Cut them if the user holds strictly to the 10% bar.

## Critical path

Correlation is handled explicitly in five steps.

(1) Crypto block: Arc, Colosseum, Dubai and Team1. They share one contract, one deploy session, one shelter-consent gate and the same 'thin charity splitter' judging risk.
- Independent product: 1 - (0.81 x 0.925 x 0.953 x 0.962) = 0.313.
- x0.85 correlation haircut (the judges' factor) = 0.27.

(2) Anitya block: Story to Playable, the later weeklies and the main jam. They share one organiser with a documented payout risk.
- Raw: 1 - (0.83 x 0.80 x 0.893) = 0.41.
- x0.75 payout risk, applied ONCE = 0.305.
- x0.95 for the shared editor learning curve = 0.29, rounded to 0.30. The judges' block values were 0.36, 0.38 and 0.27.

(3) Bezi: 0.055, largely independent (different organiser).

(4) Portfolio: 1 - (0.73 x 0.70 x 0.945) = 0.51. Then x0.9 because 62 human hours across 8 entries means something will not ship, giving about 0.46, stated as 0.45. Range 0.30-0.55, driven by unpublished entrant counts (x0.6 to x1.5 on every base rate).

(5) With current, sourced traction supplied, only the Colosseum, Dubai and Team1 values move: the crypto block goes to 0.29 and the total to about 0.47.

Scenarios:
- Core tier only (Arc plus the two Anitya weekly entries, about 28 hours): 1 - (0.81 x 0.75) = about 0.39.
- Minimum viable (core plus Colosseum, about 35 hours): about 0.40.
- No shelter consent by Oct 5: Arc drops to 0.13 and Colosseum to 0.06, so the total is about 0.41.
- Sep 30 weekly missed: the Anitya block drops to about 0.23, so the total is about 0.40.

P(a single win of $500 or more): about 0.28. Arc, Colosseum, Dubai and Team1, plus 2 of the 3 Anitya main places.

Critical path, in order:
- (a) TODAY: the AI builds the GLB exporter, and at the same time the human starts shelter outreach. Consent plus a self-published wallet is the longest pole.
- (b) Sep 29-30: the human builds and submits Story to Playable.
- (c) Oct 1-2: the single human deploy session. Arc USDC and EURC, then Tempo, then Arbitrum and Avalanche. DRY_RUN first, then the proof payout, then ownership to a Safe.
- (d) Oct 3-5: video recording.
- (e) Oct 7: Arc submitted.
- (f) Oct 11: Colosseum submitted. All members must be registered before this.
- (g) Oct 20: Anitya main.

Everything downstream of the crypto block hinges on (c). If (c) slips past Oct 5, drop EURC and every chain except Arc and Tempo.

## Calendar

| Date | Action | Who |
|---|---|---|
| 2026-09-28 | The AI writes the GLTFExporter and batch-exports the Catnip Heist voxel cats, dogs and props to GLB. It drafts the Anitya Discord questions (AI assets allowed? payout method to Lithuania?), the shelter consent and wallet-attestation template, and starts the native-USDC path and tests. | AI |
| 2026-09-28 | Contact 1-2 partner shelters (already in the app's shelters collection) for written consent to be named and a wallet they publish themselves. Post the two questions in the Anitya Discord. | Human |
| 2026-09-29 to 09-30 | Build the Story to Playable world in the Anitya editor from the GLB kit, publish it publicly and post the link in #jam-submission before 23:59:59 itch time on Sep 30. | Human (~8h), AI supplies layout and copy |
| 2026-09-29 to 09-30 | The native path passes on Arc testnet. EURC config, the Tempo memo path, the wave for Arc, Tempo, Arbitrum and Avalanche, DRY_RUN outputs, the repo split, the demo page, and a surfaced (not silent) relabel of the SEI-as-Stellar traction text. | AI |
| 2026-10-01 to 10-02 | Import the keystore, fund minimal gas (USDC on Arc, USDC.e or pathUSD on Tempo, ETH on Arbitrum, AVAX), read the DRY_RUN, broadcast the deploys and the proof payout, and move ownership to a Safe. Register every team member on colosseum.com. Ask on the Colosseum Discord about multi-track tagging. | Human (~3h) |
| 2026-10-02 | `fund a:ingest`, on-chain verification, re-render every submission from the real tx hashes. | AI |
| 2026-10-03 to 10-05 | Record the Arc video and the on-camera Colosseum pitch. The AI edits the videos, adds captions and cuts the 3-minute demo from the same footage. | Human (~3h) + AI |
| 2026-10-07 | Final read and SUBMIT Arc Microgrants on DoraHacks (a week early, because review is rolling). | Human |
| 2026-10-08 to 10-11 | Hostile-judge loop on the Colosseum entry, then SUBMIT Colosseum on Oct 11 (the deadline is Oct 12 23:59 PT). | AI drafts, Human submits |
| Weekly through 2026-10-21 | Check Discord for each new Anitya weekly or surprise challenge. Build and submit a new small world for two of them. | Human (~10h), AI plans |
| 2026-10-13 to 10-20 | Build the main Anitya world 'Catnip Heist: Shelter Break-in' and submit on Oct 20 (the deadline is Oct 21 22:59 UTC). | Human (~12h), AI plans |
| 2026-10-22 to 10-27 | Submit Team1 Avalanche, citing the Arc decision (due by Oct 21). Decide on Circle only now, after Arc, because of the exclusivity clause; it is not counted in P. | Human (~2.5h), AI drafts |
| 2026-10-23 to 10-26 | Optional Bezi Jam 14. Only if eligibility is confirmed and the hour budget remains. | Human (~10h) + AI |
| 2026-10-31 | Register for Arbitrum Dubai and re-fetch the tracks and criteria. The AI re-scores the entry. | Human registers, AI re-scores |
| 2026-11-16 to 12-04 | The AI builds the in-window revenue-to-disburse job (and an optional Stylus port). A human reviews it and submits Dubai by Dec 4. | AI + Human (~3h) |
| 2026-12-05 / ~12-13 | Results: Colosseum by Dec 5, Dubai around Dec 13. | - |

## What only you can do

1. TODAY: contact a partner shelter and get written consent to be named, plus a USDC (and ideally EURC) wallet the shelter publishes itself. Only a person may do this. If it is not in hand by Oct 5, the Arc entry falls back to a labelled Token Tails-held shelter-fund wallet (P 0.19 drops to 0.13).
2. TODAY: post two questions in the Anitya Discord: are AI-assisted assets allowed, and how are prizes paid to a Lithuanian team?
3. Sep 29-30: about 8 hours in the Anitya editor to build and submit Story to Playable.
4. Approve making the shelter-split and catnip-heist repos public, and approve the commit of catnip-heist/.
5. Approve the relabel of extra/traction.md and ProofSection.tsx (SEI, historical peaks, ended March 2026). This is a user-facing change.
6. Oct 1-2: import the keystore, fund minimal gas and 1-5 USDC per chain for proof payouts, read the DRY_RUN, broadcast, and move ownership to a Safe.
7. Name the Colosseum Team Leader (the person who receives the prize) and register every member before Oct 12. Confirm whether a Phantom CASH payout is acceptable.
8. Ask on the Colosseum Discord whether one submission can place in several ecosystem tracks.
9. Oct 3-5: record the on-camera pitch and the video voiceover (about 3 hours).
10. Submit Arc (Oct 7), Colosseum (Oct 11), the Anitya entries, Team1, Dubai (Dec 4), and Bezi if confirmed. Every submission is a human click.
11. Optional, and not assumed in P: current sourced numbers for the last-30-day MAU, revenue, USD sent to shelters and the month of each historical peak. These lift P from about 0.45 to about 0.47.

## Kill criteria

- Sep 30, 18:00: if the GLB exporter or the Anitya editor import does not work, drop Story to Playable and move those hours to the later weeklies.
- Sep 30: if Discord says AI-assisted assets are banned, or that prizes cannot be paid to Lithuania, drop the whole Anitya block. P falls to about 0.30. Consider adding back Circle, after Arc, as a low-P filler.
- Oct 3: if the native-USDC path fails on Arc testnet, ship the standard ERC-20 path plus EURC and the named shelter (Arc about 0.15).
- Oct 5: if there is no shelter consent, use a labelled self-held shelter-fund wallet and disclose it (Arc 0.13).
- Oct 5: if the deploy session has not happened, keep only Arc and Tempo.
- Oct 9: if the Colosseum registration or the on-camera pitch is not done, skip Colosseum rather than submit a weak entry.
- Oct 20: if the human hours used are above about 45, cut Bezi.
- Oct 31: if the Dubai criteria exclude existing products or the charity/payments fit, drop Dubai.

Never: submit the 542k figure as a current or headline claim, cite the SEI Dune data as Stellar, enter an AI-banning jam, or apply to Circle before Arc decides.

## Honest ceiling

The honest ceiling is about 0.50, stated as 0.45 with a range of 0.30-0.55. No single entry is above about 0.20 (Arc, 0.19). No arrangement of these assets pushes P(at least one) well past 0.5, for two reasons:
- The crypto entries share one contract and move together. Correlated, the whole block is worth about 0.27.
- Anitya's upside is capped by one opaque organiser with a documented payout risk (2 of 4 past jams unranked).

About a third of the headline P comes from Anitya prizes of $50-$100. P(a single win of $500 or more) is only about 0.28, and expected cash is about $1.2k, most of it from the long-shot Colosseum Tempo slot.

Every base rate uses entrant counts that no program publishes. If the fields are twice as large as assumed, P falls to about 0.30. Current traction barely moves it (+0.02), because no remaining program scores historical peaks well, and the 542k figure must not be used as a headline.

What would change the ceiling: a named shelter payout plus real third-party donor txs on Arc before Oct 7 is the single biggest lever inside the team's control. Beyond that, the only way above 0.55 is new, independent venues that allow AI, and none were verified in this search.
