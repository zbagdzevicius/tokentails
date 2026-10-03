# October 2026 high-chance sweep

# Final lock-in: October 2026

**Summary:** nothing reaches LOCK. Three items survive, and only because each needs under 1 human hour, not because the odds are good. None is likely to bring meaningful cash in October. The only one with P arithmetic that clears 10% is Indiepocalypse, and it pays USD 20. Most of your October effort should stay on Arc (Oct 7), Colosseum (Oct 11) and Anitya (Oct 20).

I spot-checked the top 5 with WebFetch today (2026-09-30): Indiepocalypse, Hedera, x402, VIVERSE and Pollination.

## Removed at this stage

| Item | Reason |
|---|---|
| Arbitrum Open House Singapore | P is about 3% and it takes 1 human hour, which is not under 1. It is also on the DROPPED list. |
| Hedera Scaffold-HBAR bounty | The spot-check shows it is **judged** by a 100-point rubric, and the 5 top scores win. The field-size estimate was made up, so there is no real P arithmetic. It needs 2.5 human hours, and the Oct 4 deadline falls in Arc week. It fails both tests. |
| VIVERSE Creator Grants | P, amounts and eligible countries are all unpublished. It takes 1 hour, not under 1. The money is a commission contract with build work attached. Revisit after Oct 20 if you want. |

## Survivors

### 1. Indiepocalypse Issue #83 (paying anthology), MAYBE, strongest
- **Deadline:** 2026-10-01 16:00 as shown on itch. That is most likely UTC, which is 19:00 Vilnius (EEST); I could not confirm the zone. Submit by 12:00 Vilnius on Oct 1 to be safe.
- **What to submit:** Catnip Heist as a **downloadable** standalone build. The spot-check confirmed games "must be in some way downloadable", and VR-only games are not accepted. It needs no backend and no tokentails.com calls. Bundle it as a single HTML file with the GLBs inlined so it runs from `file://` without CORS errors. Add the itch page, blurb and 3 screenshots.
- **P arithmetic:** 10 slots / 47 entries = 21%. Allowing for last-day entries, 10/~55 = 18%. The curator picks, so treat that as a ceiling. Multiply by about 0.7 for unknown attitudes to AI-built games and a polished game in a zine that "prefers messy/outsider" work. That gives **about 13%**.
- **Money:** USD 20 up front, plus 5% of anthology sales (8% after break-even). Expected value is about USD 2.60 plus an unknown royalty share.
- **Human / AI:** about 0.5 human hours to review the build, upload and submit. AI makes the single-file build, strips backend calls, and writes the page copy and screenshots.
- **Plan:** Sep 30 evening: AI builds and tests the zip. Oct 1 by 10:00: human test-plays it offline. Oct 1 by 12:00 Vilnius: human uploads and submits. If the offline build is not working by Oct 1 at 10:00, drop it.

### 2. x402 Foundation impact micro-grant, MAYBE (lottery ticket)
- **Deadline:** rolling. None is published (spot-check confirmed).
- **What to submit:** make the cat-card agent endpoint a real x402 service on mainnet, using the standard `exact` USDC scheme through a facilitator. The current `onchain-receipt` scheme with no facilitator probably does not count. Record a video of 2 minutes or less showing an agent paying for a shelter cat card, and tag @coinbaseDev on X. The guide also says to "open a grant" issue or contact the maintainer.
- **P arithmetic:** none possible. No approval rate or payout record is published. Issue #3598, which asks about payout, KYC and the process, has no maintainer reply. The P under 10% is a guess, not arithmetic. It qualifies only because it needs under 1 human hour.
- **Money:** up to USD 3,000. The payout asset and KYC rules are unknown. There is also a small mainnet USDC test cost.
- **Human / AI:** about 0.75 human hours to record the video, post it and open the issue. AI integrates the facilitator, deploys, writes the demo script, the post and the issue text.
- **Plan:** Oct 12–14: AI builds this after Colosseum, reusing the USDC work from the Arc build. Oct 15: human records the video. Oct 16: human posts on X and opens the grant issue. Do not start it before Oct 11.

### 3. The Pollination Project seed grant, MAYBE, conditional (the money goes to Pink Paw, not Token Tails)
- **Deadline:** rolling monthly. Send by 2026-10-31 (no time or zone stated) for the October cycle. The page says decisions come at the end of the month you apply in, but the item's earlier evidence said end of November. International timelines also depend on when references arrive, so ask for references early.
- **What to submit:** a Pink Paw volunteer project with a budget of USD 500 or less, such as an adoption day or a spay/neuter drive. It must not buy animal products or serve food. The Pink Paw profile, campaign meter, receipts and share cards serve as the delivery tools.
- **Gate (must be yes first):** Pink Paw has no paid staff, an annual budget under USD 50k, has never been funded by The Pollination Project, and can receive USD by wire or PayPal. If any answer is no, drop it.
- **P arithmetic:** none. No acceptance data is published. It qualifies only because it needs under 1 human hour.
- **Money:** up to USD 500, paid to the shelter.
- **Human / AI:** about 0.75 hours of the shelter volunteer's time, plus references. AI drafts the narrative and budget.
- **Plan:** Oct 13: send the 4 gate questions to Pink Paw. Oct 21–22: AI drafts after Anitya. Oct 23: the volunteer asks for references. By Oct 28: the volunteer submits, which leaves slack before Oct 31.

## October calendar

| Date | Action | Owner | Opportunity |
|---|---|---|---|
| Sep 30 | Single-file offline Heist build and itch page | AI | Indiepocalypse |
| Oct 1, by 10:00 | Offline test-play; go/no-go | Human | Indiepocalypse |
| Oct 1, by 12:00 Vilnius | Upload and submit (hard close 16:00 itch time) | Human | Indiepocalypse |
| Oct 2 | ShelterSplit deploys on Arc, Tempo, Arbitrum and Avalanche | AI + Human | Existing |
| Oct 3–6 | Arc submission prep | AI | Arc Microgrants |
| Oct 7 | **Submit** | Human | Arc Microgrants |
| Oct 8–10 | Colosseum prep | AI | Colosseum |
| Oct 11 | **Submit** | Human | Colosseum |
| Oct 12–14 | x402 facilitator integration on mainnet and demo script | AI | x402 micro-grant |
| Oct 13 | Send the 4 gate questions to Pink Paw | Human | Pollination |
| Oct 15 | Record the video (2 min or less) | Human | x402 micro-grant |
| Oct 16 | Post on X tagging @coinbaseDev; open the grant issue | Human | x402 micro-grant |
| Oct 12–19 | Anitya main build | AI | Anitya main |
| Oct 20 | **Submit** | Human | Anitya main |
| Oct 21–22 | Draft the narrative and budget (if the gate passed) | AI | Pollination |
| Oct 23 | Ask for references | Pink Paw volunteer | Pollination |
| Oct 28 (by Oct 31) | Submit | Pink Paw volunteer | Pollination |
| Weekly (day per the jam page) | Weekly entry | AI + Human | Anitya weeklies |

## Clashes
- **Oct 1–2:** the Indiepocalypse deadline falls the day before the four-chain ShelterSplit deploy. The rule is to go/no-go at 10:00 on Oct 1 and never let it delay the deploy.
- **Oct 12–16:** the x402 build overlaps the Anitya main crunch, the week before Oct 20. x402 has no deadline, so it moves to Oct 21+ if Anitya slips.
- **Anitya weeklies:** their exact days are not in my inputs. Check whether any lands on Oct 7, 11 or 20. If one does, skip that weekly.
- **Hedera (removed):** its Oct 4 deadline would have hit Arc week directly. That is one more reason it is out.

## All verified items

- **MAYBE** 3% Arbitrum Open House Singapore: Online Buildathon (HackQuest) (https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon): I re-checked the page: 1,043+ registered and 6 ranked slots. The 35.5% submission rate (278 of 782) comes from the London edition, as the candidate reported. I could not re-verify it because the search budget ran out. That gives about 370 submissions, so 6/370 = 1.6%, plus the discretionary grants, for about 3%. The Robinhood reserved-slot sub-pool size is unpublished. This is well below 10%.
- **DROP** 3% Monad Metropolis global online hackathon (https://monad.xyz/developers/hackathons/metropolis): This is refuted as a MAYBE. The 400-600 submission count is an invented assumption. No registrant or submission count is published, so the 5-8% figure is not evidence-based. Even using the candidate's own figures, the base is 7/500 = 1.4%. With 2.5 human hours it fails both the >10% test and the under-1-hour test.
- **DROP** 2% Open Agent Hackathon 2026 (GenAI Works) (https://hackathon.genai.works/event/open-agent-hackathon-2026): 12 slots against about 1,200 registrants. Even the candidate's assumed 25% submission rate, which is unpublished, gives 4%. The tracks are about reasoning agents, which fit our assets poorly.
- **DROP** 0% EurekaDev 2026 (Devpost) (https://eurekadev.devpost.com/): Ineligible: high-school students aged 13-19 only, and companies are excluded. The participation reward is also non-cash.
- **DROP** 0% Celo Proof of Ship (monthly) (https://docs.gap.karmahq.xyz/how-to-guides/partners/celo-proof-of-ship): Not computable. The 2026 season is unverified, and payouts go through Talent Protocol, which is excluded.
- **MAYBE** 5% x402 Foundation impact micro-grants (up to $3k) (https://github.com/x402-foundation/x402/blob/main/PROJECT-IDEAS.md): This cannot be calculated. No approval rate, recipient count or record of any payout is published. The 24% figure (13 of 55) comes from the separate CDP Summer 2025 Builder Grants, so it is an analogy and does not count. Evidence points the other way. Issue #3598 (2026-09-27) asks about payout asset, KYC and the application process, and has no maintainer reply. Grant pitch #3509 was closed on Sep 18 with no visible award. P is a placeholder guess of 10% or less, not arithmetic.
- **DROP** 5% Monad Metropolis: Consumer Products & Payments track + Agora 'Best Cross-Border Payments App on Monad' (https://monad.xyz/developers/hackathons/metropolis): No submission count is published. The ~3-6% estimate rests on a reference rate from a different hackathon (HackMoney's Arc track, 4 of 155), so it is not real arithmetic. Even so, it sits below the 10% bar, and human time (~2 h) is above the 1-hour exemption.
- **DROP** 2% Open Agent Hackathon 2026 (GenAI.Works), Wildcard track (https://hackathon.genai.works/event/open-agent-hackathon-2026): 12 cash places for 1,200 registrants is 1%. Wildcard has 3 places and requires integrating both Zetaris and Meterless. The 20% submit rate the candidate used is an assumption.
- **DROP** 0% Algorand Foundation Global x402 Challenge (https://algorand.co/global-x402-challenge): Both deadlines have passed.
- **DROP** 0% MERGE Agent Pay Hackathon (https://www.mmerge.io/hackathon-2026): The event is in person in Madrid, which breaks the remote-only rule.
- **DROP** 2% Daydreams AI agent-bounties (https://github.com/daydreamsai/agent-bounties): The tasks are DeFi, the competition is heavy and payout reliability is questioned. This figure was not re-verified.
- **DROP** 0% Coinbase CDP Builder Grants (seasonal) (https://www.coinbase.com/developer-platform/discover/launches): No open round, so P = 0. Summer 2025's rate was 13 of 55, about 24%, but that is historical only.
- **MAYBE** 13% Indiepocalypse Issue #83 (Paying Anthology) (https://itch.io/jam/indiepocalypse-issue-83-paying-anthology): Re-verified numbers: 47 entries now, 10 slots, so 10/47 = 21%. Allowing for last-day entries, 10/~55 = 18%. Previous issue #82 had 23 entries (verified), but the '10 selected' there is only the zine's general statement. Selection is human curation, not random, so the entry ratio is an upper bound. Discounts: (a) Heist is AI-built, and indie itch curators often dislike AI. There is no stated AI policy either way, so this is unverified risk. (b) The anthology sells the game as a bundle file, and Heist is a web game tied to tokentails.com, so it may need a standalone build. My estimate is about 18% x ~0.7 = ~13%. That is not enough for LOCK at the 15% bar, but it is well within MAYBE given under 1 human hour.
- **MAYBE** 10% VIVERSE Creator Grants (HTC) (https://create.viverse.com/creator-grants): No approval rate, grant count or amount is published, so I can't compute P from evidence. The 0.10 is an unsupported placeholder. It is kept only under the under-1-human-hour rule. The live Three.js game and GLB worlds are a relevant portfolio, and no prior WebXR experience is required.
- **DROP** 5% Game Gauntlet - SIM Jam (https://itch.io/jam/game-gauntlet-sim-jam): Verified: 399 joined, 7 entries, 2 cash prizes. The prior 32-entry figure is from a USA-only edition and doesn't transfer to this worldwide edition. With 399 joined, even a conservative 15-25% submit rate (an assumption) gives 60-100 entries, so 2/60-2/100 = 2-3.3% at the base rate. The 1.5-2.5x quality multiplier is invented. Realistically P is about 3-6%, which is under 10%, and it takes 8+ human hours.
- **DROP** 5% Bezi Jam 14 (https://itch.io/jam/bezi-jam-14): 3 Best in Show prizes among about 58 entries (the prior edition) = 5.2%. The devlog-pool size is unknown, so the 8-12% combined figure is unsupported. Community voting on itch/Discord also favours regulars.
- **DROP** 3% VIVERSE Partner Program (https://create.viverse.com/partner): USD 50 needs about 4,200-25,000 unique 30-second players. We have no traffic evidence.
- **DROP** 0% Terror Jam 2026 / UNIDOS (Latinx in Gaming) (https://itch.io/jam/terror-jam-2026-a-halloween-game-jam): Generative AI disqualifies an entry from prizes, and our work is 90% AI, so P is about 0. The 30% submit rate was an invented assumption anyway.
- **DROP** 0% Celo Proof of Ship (monthly builder rewards via Karma GAP) (https://docs.gap.karmahq.xyz/how-to-guides/partners/celo-proof-of-ship): The candidate's 0.15 was an admitted guess with no participant data behind it, so it doesn't count. On top of that, the reward claim runs through Talent Protocol (excluded), so eligible P is 0.
- **DROP** 0% Gitcoin Grants (GG25/GG26 or community QF rounds) (https://gitcoin.co/campaigns): No open round, so P=0.
- **DROP** 0% Drips Wave / RetroPGF (non-Stellar) (https://docs.drips.network/wave/): No non-Stellar round is open, so P=0.
- **DROP** 2% NLnet CodeSupply (https://nlnet.nl/codesupply/): The scope is supply-chain security packaging metadata, and our assets are off-topic. There is no acceptance data, so P is effectively about 0.
- **DROP** 1% FLOSS/fund (Zerodha) (https://floss.fund/faq/): It excludes new or low-adoption projects, and shelter-rail has no adoption, so P is about 0.
- **DROP** 2% GitHub Secure Open Source Fund (https://github.com/open-source/github-secure-open-source-fund): It requires community traction and governance, which we don't have. It also costs 20 hours.
- **DROP** 1% thanks.dev (https://thanks.dev/): shelter-rail has 0 dependents, so the expected payout is about $0.
- **DROP** 0% Avalanche Retro9000 (https://retro9000.avax.network/): Program closed, so P=0.
- **MAYBE** 0% The Pollination Project seed grant (SHELTER-SIDE: money goes to Pink Paw) (https://thepollinationproject.org/apply/): Can't be calculated: the site publishes no application count or acceptance rate. p=0 here means unknown, not zero. The best case is USD 500 for about 45 minutes of a shelter volunteer's time. The lane's '1 grant a day' figure was not re-verified on the apply page, so I didn't use it.
- **DROP** 0% Falling for Paws Shelter Challenge (GreaterGood / Animal Rescue Site) (SHELTER-SIDE) - lane's reason REFUTED, still DROP (https://theanimalrescuesite.com/pages/shelter-challenge/falling-for-paws-shelter-challenge): Can't be calculated: the rules publish neither the number of shelters that reach 250 votes nor any odds. Six USD 500 draws are split across an unknown pool of qualifiers. Reaching 250 votes in about 14 days means roughly 18 distinct adults voting every day, and votes only count after an approval step with no stated timeline.
- **DROP** 0% World Animal Day Grant (Naturewatch Foundation) (SHELTER-SIDE) (https://www.worldanimalday.org/world-animal-day-grant/): Not open during the window
- **DROP** 0% Marchig Animal Welfare Trust grants (SHELTER-SIDE) (https://marchigtrust.org/): Closed
- **DROP** 0% Inočekiai / Gynybos inovaciniai čekiai (Inovacijų agentūra) (https://www.inovacijuagentura.lt/finansavimas/): Ineligible: requires at least EUR 10,000 in sales revenue, and our FY2025 revenue is EUR 105
- **DROP** 0% Vilnius city culture project funding (https://www.15min.lt/kultura/naujiena/naujienos/kulturos-projektams-vilnius-skiria-1-5-mln-euru-prasidejo-kasmetinis-paraisku-teikimo-laikotarpis-1770-2534938): Ineligible: non-profits only, and an MB is for-profit
- **DROP** 0% Dogs Trust Worldwide Small Grants (https://www.instrumentl.com/grants/dogs-trust-grants): Closed
- **DROP** 0% EA Animal Welfare Fund (https://funds.effectivealtruism.org/funds/animal-welfare): Companion animals are out of scope
- **MAYBE** 12% Hedera Scaffold-HBAR Template Bounty (https://hedera.com/blog/scaffold-hbar-template-bounty/): No entry counts are published anywhere I could find. The 25-60 valid-submission range is an INVENTED assumption: 5/60=8% to 5/25=20%, midpoint about 12%. It holds up only because the field is a niche template-author audience and the gate is strict. It is not evidence-backed, so it cannot be LOCK.
- **DROP** 6% Arbitrum Open House Singapore: Online Buildathon (https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon): 1,043+ registered (confirmed). The 15-20% submit ratio comes from one Devpost comparison, not from this event. About 150-210 submissions for about 9-12 paid slots gives roughly 5-7%, which is below 10%.
- **DROP** 7% Game Gauntlet - SIM Jam (https://itch.io/jam/game-gauntlet-sim-jam): 2 cash slots over a projected 30-100 entries is 2-7%. The projection extrapolates from 399 joined and the Santa Fe edition's 32 entries.
- **DROP** 0% Terror Jam 2026 (Latinx in Gaming) (https://itch.io/jam/terror-jam-2026-a-halloween-game-jam): Not applicable. The re-fetched page says games using generative AI are disqualified from the prize pool, and our workflow is about 90% AI (code included).
- **DROP** 4% YouCam API Skin AI & eCommerce VTO Hackathon (https://youcam-api-skin-ai-ecommerce.devpost.com/): Projected about 80 submissions (from a prior edition's 18.6% ratio) for 3 open prizes, about 4%.
- **DROP** 1% Build, Ship, Shape: Amazon Developer Hackathon (https://amazonappdev2026.devpost.com/): 24k+ registrants for 16 prizes, well under 2%.
- **DROP** 5% Avalanche Retro9000 C-Chain Round (https://finance.yahoo.com/news/avalanche-retro9000-initiatives-c-chain-235900662.html): The grant is at most 90% of gas burned, so the net return is always negative.
- **DROP** 3% Paid technical-article programs (Bugfender, Corellium, QuickNode) (https://github.com/malgamves/CommunityWriterPrograms): Bugfender is closed, Corellium bans AI content, and QuickNode's status is unverifiable.
