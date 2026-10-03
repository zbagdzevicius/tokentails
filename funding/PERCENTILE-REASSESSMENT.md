# Percentile reassessment (2026-09-30)

# Judge's verdict: what "70th percentile" does to our odds

## 1. Plain answer

**Your intuition is right about who we are, but it doesn't make big hackathons winnable.** Beating 70% of entries only wins where the prize cut-off is near the 70th percentile. That happens in three kinds of place:

- **Small fields.** Anitya main has about 20 entries for 3 prizes, so the cut-off is the 85th percentile. The Anitya weeklies have about 8 entries for 2 prizes, a cut-off near the 75th.
- **Generous capped grants.** Arc gives 20 grants to an assumed 100–200 applicants, a cut-off at the 80th–90th percentile.
- **Grants that fund every entry above a bar.** This may be how Arc works. It is probably how Team1 and x402 work.

Everywhere else the cut-off sits at the 93rd–99.6th percentile:

- Colosseum general, Tempo and Public Goods
- Arbitrum Dubai
- Arbitrum Singapore

At q=0.7, about 30% of the field is better than us: 375–750 entries at Colosseum. There, only judge noise can carry us into the money.

Two more points:

- **It changes little.** The plan's current figures already imply q of about 0.7–0.8 (Arc 13–19%, Anitya 8–10%, Tempo about 8%). The assumption mostly confirms the plan. It also shows Tempo's 8% needs q≥0.8 and a field of 150 or fewer.
- **The charity angle raises q, not N or k.** No charity or impact track clears the bar. "Impact-based" grants (x402, Team1) and impact-weighted criteria are where it helps.

## 2. Updated odds for committed entries

Medium noise (sigma 0.2). These are judged-only odds before deploy risk. Anitya main and the weeklies are also shown ×0.75 for payout risk. The ranges cover the N range, and bold marks the mid-range case.

| Entry | N, k | Previous | q=0.7 | q=0.8 |
|---|---|---|---|---|
| Arc Microgrants, capped at 20 grants | 100–200 (assumed), 20 | 19% nominal, 13–15% after pre-mortem | 9.7–27.7% (**15.0** at N=150) | 20.9–45.7% (**29.3**) |
| Arc, if it funds everything above a bar at 0.7 | — | — | 50% | 69% |
| Colosseum general | 1,250–2,500, 23 | (part of about 8%) | 0.3–0.7% | 1.1–2.6% |
| Colosseum Tempo | 150–400, 10 | about 8% | 1.2–5.3% (**2.4**) | 3.8–12.9% (**6.9**) |
| Colosseum Public Goods | 50–250 (not published), 1 | about 0 | 0.1–1.1% | 0.4–3.2% |
| Anitya main | about 20, 3 | 8% | 19.2% → **14.4%** after payout risk | 33.1% → **24.8%** |
| Anitya weeklies, per round | 5–12 (unverified: 3 seen at WC2 plus a projected last-day surge), 2 | — | 22.7–61.3% (**37.9** at N=8) | 36.4–73.3% (**52.6**) |
| Anitya weeklies, 3 rounds, ×0.75 | same | 15% combined | 42.9–84.2% (**63.4**) | 61.6–90.9% (**77.8**) |
| Arbitrum Dubai | 100–300, about 6 | about 6% | 0.9–4.6% (**1.6** at N=200) | 2.9–11.4% (**4.8**) |
| Team1 Avalanche | not published | 3.8% | cannot compute | cannot compute |
| x402 micro-grant | not published | 10% or less (placeholder) | cannot compute | cannot compute |

Caveats:

- **Weeklies:** the plan used 15%. The percentile model gives far more because the field is tiny, but that N is a projection. Each prize is $50, split 2 × $50 at WC2. WC2 closed today, Sep 30 at 23:59, so its final entry count is the first real N we can get.
- **Colosseum slot count:** `funding/WINNING-STRATEGY-DATA.json` quotes the rules as "general 20 x $15k", while this task uses 23. At these odds the difference is under 0.2 points.

## 3. New or dropped hackathons that clear 10% and need 2 human hours or less

**None.** Each candidate at sigma 0.2, q=0.7 / q=0.8:

| Candidate | N used | P | Hours | Verdict |
|---|---|---|---|---|
| Indiepocalypse #83 (Oct 1) | 47 (published), 10 slots | 30.5 / 48.4% | about 1 | The only one that clears with a published N. It stays **dropped** because you ruled out the $20. |
| Game Gauntlet SIM Jam (Nov 4) | 7 so far; final N unknown | 44 / 58% now, but the field is still growing | 6–8+, and Heist is ineligible | Fails on hours |
| Bezi Jam 14 (Oct 26) | 58, prior edition, unverified | 3.9 / 9.7% | 2–4 | Fails; top prize $150 |
| YouCam (Nov 2) | about 80, unverified | 2.4 / 6.5% | 2–3 | Fails, and a poor fit |
| Arbitrum Singapore (Oct 4) | about 370, unverified | 0.6 / 2.3% | about 1 | Fails |
| Monad, Hedera, Open Agent, Amazon | not published | cannot compute | 2–3+ | Excluded: no invented N |
| Terror Jam | — | 0 (AI ban) | — | Out |

## 4. P(at least one cash win)

Mid-range N as in the model. Arc N=150 is an assumption.

| Scenario | q=0.7 independent | q=0.7 correlated | q=0.8 independent | q=0.8 correlated |
|---|---|---|---|---|
| Wins of $500 or more (no weeklies), Arc capped, Anitya ×0.75 | 30.1% | 36.0% | 52.9% | 55.8% |
| Wins of $500 or more, Arc funds above a bar at 0.7 | 58.9% | 58.9% | 79.5% | 76.2% |
| Any cash including $50 weeklies (N=8, unverified), Arc capped | 74.4% | 76.6% | 89.6% | 90.2% |
| Any cash, Arc funds above a bar | 84.9% | 85.0% | 95.4% | 94.7% |

- **Weekly sensitivity:** under the capped Arc case, any-cash P at q=0.7 is 60% if weeklies draw 12 entries and 89% if they draw 5.
- **x402:** at a placeholder P of 5–10% it adds about 1–3 points.
- **Deploy risk is not included.** Arc counts only if its mainnet deploy works.
- **Against the plan:** the plan said 45% for any cash win and 28% for one of $500 or more. The $500+ figure is consistent at q=0.7. The any-cash jump comes almost entirely from the weeklies' unverified small N.

## 5. Recommendations

**Add:**
- Nothing new. No candidate has a published N, clears 10% and fits in 2 hours or less.
- One free data task: record the final WC2 entry count now, then count entries at every weekly close. That count decides whether the weeklies are really our best odds or only a nice extra.

**Keep, in priority order:**
1. **Arc (Oct 7).** It carries the most value. Ask Arc before Oct 7 whether 20 grants is a hard cap or everything above a bar gets funded: at q=0.7 that is the difference between 15% and 50%. It is also void without a working mainnet deploy.
2. **Anitya main (Oct 20)**, at 14–25% after payout risk.
3. **Anitya weeklies.** Enter every round with a different world and never heist-08. The field is small enough that 70th-percentile quality actually pays.
4. **x402 micro-grant (Oct 12–16).** It takes under 1 human hour and is "impact-based", so the charity framing works there. Its P cannot be computed and stays a placeholder.
5. **Colosseum (Oct 11).** Keep it because the build already exists, but on the Tempo track only; its 2–7% is the only track worth effort. Tick Public Goods as a zero-hour extra. The general pool is about 1%, so stop counting it.
6. **Team1 (Oct 27).** Keep it only if the human part stays at about 1 hour by reusing the Arc draft. It has no P.

**Downgrade:**
- **Arbitrum Dubai.** It is 0.9–4.6% at q=0.7, which fails the 10% bar and takes many hours. At G10 (Oct 31), commit to the full build only if there is an impact track with a small field. Otherwise use the G11 fallback: submit the existing Arbitrum deploy and payouts page, or skip.

**Keep dropped:**
- Singapore, Bezi, YouCam, SIM Jam, Monad, Hedera, Open Agent, Amazon and Terror Jam.
- Indiepocalypse, per your call. It is the only item with a published N that would have cleared the bar.

The script with the new (N, k) pairs is `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/6ce18730-9621-4243-a62c-e0ea84e163f7/scratchpad/judge-model.mjs`. It is a copy of `percentile-model.mjs` with the extra cases and a portfolio that includes the weeklies, x402 and payout risk.

---

## Model

**Percentile model: our odds if our entries sit at the 70th percentile**

Being better than 70% of entries is a long way from winning. To finish in the top k of N, an entry needs a quality percentile above 1 − k/N. The contests we've entered set that cut-off at:

| Contest | Cut-off percentile |
|---|---|
| Colosseum general | 98.2–99.1 |
| Colosseum Public Goods | 98–99.6 |
| Arbitrum Singapore | 98.4 |
| Colosseum Tempo | 93–97.5 |
| Arbitrum Dubai | 94–98 |
| Anitya | 85 |
| Arc | 80–90 (if capped) |

At q=0.7, about 30% of the field is better than us: roughly 375–750 entries at Colosseum and 110 at Singapore. Judge noise is the only way a 70th-percentile entry wins in a big field. More noise helps weaker entries and hurts strong ones: at q=0.9, Tempo N=150 drops from 29% to 21% as sigma rises. Only three places give a q=0.7 entry a real chance: small fields (Anitya N≈20), a capped grant with a generous ratio (Arc 20/100), or a grant that funds everything above a bar.

The script is `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/6ce18730-9621-4243-a62c-e0ea84e163f7/scratchpad/percentile-model.mjs`. It has no dependencies and ran successfully. It computes P by numerical integration: our judge-noise draw, with a binomial count of how many others beat us. A brute-force Monte Carlo check agrees to within about 0.2 points (200k runs at N=20, 20k runs at N=370).

**P(top k)**, each cell is sigma = 0.1 / 0.2 / 0.35:

| Entry (N, k) | q=0.7 | q=0.8 | q=0.9 |
|---|---|---|---|
| Colosseum general, N 1250, k 23 | <0.1 / 0.7 / 1.8% | 0.6 / 2.6 / 3.6% | 6.1 / 7.4 / 6.4% |
| Colosseum general, N 2500, k 23 | <0.1 / 0.3 / 0.8% | 0.2 / 1.1 / 1.7% | 2.6 / 3.6 / 3.3% |
| Colosseum Tempo, N 150, k 10 | 0.7 / 5.3 / 8.4% | 6.7 / 12.9 / 13.6% | 29.3 / 25.9 / 20.7% |
| Colosseum Tempo, N 400, k 10 | <0.1 / 1.2 / 2.7% | 1.0 / 3.8 / 4.9% | 9.0 / 10.0 / 8.6% |
| Public Goods, N 50, k 1 | 0.1 / 1.1 / 2.2% | 1.1 / 3.2 / 4.0% | 7.5 / 7.9 / 6.7% |
| Public Goods, N 100, k 1 | <0.1 / 0.4 / 1.0% | 0.3 / 1.4 / 1.9% | 3.2 / 4.0 / 3.5% |
| Public Goods, N 250, k 1 | <0.1 / 0.1 / 0.3% | 0.1 / 0.4 / 0.7% | 1.0 / 1.5 / 1.5% |
| Arc capped, N 100, k 20 | 17.4 / 27.7 / 29.2% | 49.4 / 45.7 / 39.5% | 81.9 / 64.7 / 50.6% |
| Arc capped, N 200, k 20 | 2.1 / 9.7 / 13.4% | 14.1 / 20.9 / 20.5% | 45.7 / 37.5 / 29.4% |
| Arc, funds all above a bar at 0.5 | 97.7 / 84.1 / 71.6% | 99.9 / 93.3 / 80.4% | 100 / 97.7 / 87.3% |
| Arc, bar at 0.7 | 50 / 50 / 50% | 84.1 / 69.1 / 61.2% | 97.7 / 84.1 / 71.6% |
| Arc, bar at 0.85 | 6.7 / 22.7 / 33.4% | 30.9 / 40.1 / 44.3% | 69.1 / 59.9 / 55.7% |
| Anitya main, N 20, k 3 | 11.6 / 19.2 / 21.3% | 32.1 / 33.1 / 29.7% | 61.4 / 49.9 / 39.2% |
| Arbitrum Dubai, N 100, k 6 | 0.6 / 4.6 / 7.5% | 5.7 / 11.4 / 12.2% | 26.0 / 23.4 / 18.8% |
| Arbitrum Dubai, N 300, k 6 | <0.1 / 0.9 / 2.1% | 0.7 / 2.9 / 3.9% | 6.9 / 8.0 / 6.9% |
| Arbitrum Singapore, N 370, k 6 | <0.1 / 0.6 / 1.6% | 0.5 / 2.3 / 3.1% | 5.3 / 6.5 / 5.7% |

**Entries left out of the model:**
- **Team1:** no N or k is published, so there is no P.
- **x402 Foundation micro-grant:** no approval rate or recipient count is published, so there is no P. I left it out rather than invent an N. The October sweep's placeholder of 10% or less still stands.
- **Public Goods field size:** the Public Goods N is not a real count. The data files assume about 250 open-source-framed entries. A charity or public-good share of 4–8% of 1,250–2,500 gives about 50–200, so I modelled 50, 100 and 250. Past winners were developer tools, so our effective q in that field is probably lower than elsewhere.

**P(at least one win), without Singapore.** This uses mid-range N: Colosseum general 1,800, Tempo 250, Public Goods 100, Arc 150, Anitya 20, Dubai 200. The three Colosseum tracks always share one judged score, because they are one submission. "Correlated" adds a common shock (sd 0.15) to our quality across all crypto entries; Anitya stays independent.

| Scenario | q=0.7 | q=0.8 | q=0.9 |
|---|---|---|---|
| Arc capped, independent | 16.3 / 34.1 / 41.0% | 50.8 / 58.1 / 55.7% | 88.7 / 80.7 / 70.2% |
| Arc capped, correlated | 28.8 / 39.6 / 43.1% | 58.3 / 60.6 / 57.0% | 85.0 / 79.5 / 70.4% |
| Arc bar at 0.7, independent | 55.9 / 61.2 / 63.8% | 89.7 / 81.7 / 76.5% | 99.3 / 94.1 / 86.6% |
| Arc bar at 0.7, correlated | 56.0 / 61.2 / 63.7% | 80.6 / 78.8 / 75.5% | 95.0 / 90.9 / 85.1% |

Adding Singapore changes these by at most 1.3 points.

**How to read this:**
1. At q=0.7, almost all of the odds come from Arc and Anitya. Colosseum (all three tracks together), Dubai and Singapore each add low single digits. Singapore is on the dropped list and adds 0–1 point.
2. The correlated case comes out above the independent one at q=0.7. That is expected here. The shock is mean-zero, so it widens the spread of our quality. When we sit below every cut-off, a wider spread helps; at q=0.9 it hurts, as the usual intuition says.
3. These are the odds of being judged into the top k, before anything else can go wrong. Multiply by the plan's execution factors: Arc is void without a working mainnet deploy, and Anitya carries a 0.75 payout risk.
4. The 70th percentile of all entries is likely lower among complete, eligible entries. The Colosseum field is also stronger than average. So the q=0.7 row is the relevant one, and it may even be optimistic for Colosseum.
5. The plan's current figures fit this model:
   - Arc at 13–19% matches q of about 0.7–0.8 against a field of 150–200 (capped case).
   - Anitya at 10% matches q=0.7 after the payout risk.
   - Colosseum Tempo at about 8% needs q of 0.8 or more against a field of 150 or fewer. At q=0.7 it is 1–8%.
6. Arc is the only entry where the rule for picking winners changes the answer a lot. The rules don't say whether 20 grants is a hard cap or whether everything above a bar gets funded. Finding that out is worth more than any other single fact.

## Re-scan

# Re-scan of the hackathons dropped in the October sweep (WebFetch, 2026-09-30)

Source file: /Users/zygimantasbagdzevicius/me/tokentails-app/funding/OCTOBER-SWEEP.md. I re-fetched every page listed below today. I did not write a scratch model script.

**Notation.**
- **N_reg** is the number of registrants shown on the page.
- **N_sub** is the number of submissions. Every value is marked as published or unpublished.
- **k** is the number of paid slots open to us.
- **UB70** applies the 70th-percentile assumption. An entry at the 70th percentile sits in the top 30% of the field. If judging were random within that top 30%, the chance would be k/(0.3·N_sub). This is an upper bound. The model should apply its own noise factor. Where N_sub is unpublished, I left it blank rather than guess.

## 1. Arbitrum Open House Singapore Online Buildathon (HackQuest)
- **Deadline:** submissions Oct 4, 15:59 UTC. Registration closes Oct 2, 17:01 UTC.
- **N:**
  - N_reg is 1,043+ (published).
  - N_sub is unpublished.
  - The earlier sweep used a 35.5% submission rate (278 of 782, from the London edition). I could not re-verify it today: the London page shows 782+ registered, but its projects page returned nothing.
  - If that rate holds, N_sub is about 370.
- **k:**
  - Overall track: 3 places ($40k, $20k, $10k USDC).
  - Promising Products track: 3 places ($7k, $5k, $3k).
  - Grants of up to $30k USDC, discretionary and tied to milestones. The number of grants is unpublished.
  - At least one prize per track is reserved for Robinhood Chain, and one for Arbitrum.
  - That is 6 ranked slots, plus grants.
- **Criteria:** smart contract quality, product-market fit, innovation, problem-solving. There is a bonus for integrating Paxos USDG. There is no social-impact or public-good track or criterion.
- **Fit:** strong on cost. ShelterSplit deploys on Arbitrum on Oct 2, and one of the reserved per-track slots goes to an Arbitrum project. The judges score product-market fit, not charity.
- **Eligibility:** online, no country limits stated, existing projects allowed ("Bring an existing project"), paid in USDC, KYC not mentioned.
- **Human hours:** about 1. The deploy already exists, so the work is the submission form and a video.
- **Arithmetic:** k/N is 6/370 = 1.6%. UB70 is 6/111 = 5.4%, plus an unknown grant probability. Both depend on the unverified 35.5% rate.

## 2. Monad Metropolis
- **Deadline:** Oct 13. Judging runs Oct 14–27. Winners are announced Nov 3.
- **N:** N_reg and N_sub are both unpublished.
- **k:**
  - 4 tracks, each $30k split evenly among 3 teams ($10k each).
  - A $25k grand champion.
  - Sponsor bounties on top. I did not re-verify the details of the Agora cross-border payments bounty.
  - Our fit is the Consumer Products & Payments track (k = 3), and possibly Social, Attention & Culture (k = 3).
- **Criteria:** not detailed beyond the focus of each track. Judges look at the demo, the write-up and code verification. There is no social-impact track.
- **Fit:** medium. We would port ShelterSplit and sponsored donations to Monad, which is EVM, so a redeploy is feasible.
- **Eligibility:** open globally, online, solo or team. An existing project is allowed "if the work you submit is new". Prizes are cash. No country restrictions are stated on the page, but I did not open the official rules.
- **Human hours:** about 2. This lands in Colosseum week (Oct 11) and the Anitya build.
- **Arithmetic:** cannot be computed because N is unpublished.

## 3. Open Agent Hackathon 2026 (GenAI Works)
- **Deadline:** submissions Oct 20, 23:45 UTC. Registration closes Oct 13. This is the same day as the Anitya main jam.
- **N:** N_reg is 1,200 (published). N_sub and the submission rate are unpublished.
- **k:**
  - Tracks 01, 02 and 03 each pay 3 places ($2,000, $1,350 or $1,300, $1,000).
  - Wildcard pays 3 places ($1,000, $600, $400) and requires Zetaris and Meterless.
  - That is 12 cash places in total, plus $5k in kind.
- **Criteria:** Impact 30, Technical 20, Innovation 15, Demo 15, Product & UX 10, Sponsor tech 10. Impact is the largest criterion, which helps a charity project, but there is no social-impact track.
- **Fit:** weak. The tracks are fragmented-data and explainable-reasoning agents. Our agent endpoint is a payment endpoint, not a reasoning agent.
- **Eligibility:** worldwide, age 16+, online. The page does not address existing work, KYC or the payout method.
- **Human hours:** about 3 or more, and it clashes with Anitya on Oct 20.
- **Arithmetic:** cannot be computed; only N_reg is known. As a floor, k/N_reg is 12/1,200 = 1%.

## 4. Hedera Scaffold-HBAR Template Bounty
- **Deadline:** Sun Oct 4, 23:59 ET.
- **N:** N_sub is unpublished. The page showed zero submissions when it was published on Sep 16.
- **k:** 5 × $2,000. Prizes are paid only to entries that pass a mechanical gate: clean scaffold, valid `template.json`, and a passing install, build and lint.
- **Criteria (100-point rubric):** ecosystem integration and value 35, docs 30, code quality 20, Hedera service depth 15. There is no social-impact criterion.
- **Fit:** medium. The shelter-rail SDK could be repackaged as a scaffold-hbar template. It needs a monorepo, `README.md`, `AGENTS.md`, an MIT licence, and at least one Hedera service (HTS, HCS, HSS or Solidity) with evidence of a testnet transaction. The docs work suits AI.
- **Eligibility:** no country limits stated, KYC not mentioned, original work required.
- **Human hours:** about 2.5. The deadline falls in Arc week (Oct 7).
- **Arithmetic:** cannot be computed. The 25–60 range in the earlier sweep was invented.

## 5. Game Gauntlet – SIM Jam (itch)
- **Deadline:** Nov 4, 14:00 ET.
- **N:** 399 joined and 7 entries so far (published). The final N_sub is unknown.
- **k:** 2 cash places ($1,000 and $500). 3rd place and the five finalists get non-cash packages.
- **Criteria:** community rating on systems, engagement, creativity, theme and presentation. Experts then judge systems design, execution, originality, publishing potential and completion. There is no social-impact criterion.
- **Rule changes since the sweep:**
  - Generative AI is now allowed if disclosed, following Steam's rules. That removes the old AI concern.
  - Existing work is not allowed. A project started before Sep 23 does not qualify, even reskinned or extended, so Catnip Heist is ineligible. We would need a new simulation game, such as a shelter-management sim. Libraries and assets are allowed.
- **Eligibility:** worldwide. Only sanctioned countries are excluded from cash, and Lithuania is fine.
- **Human hours:** 6–8 or more for a new game, even when AI builds it.
- **Arithmetic:** with the current N_sub of 7, k/N is 29% and falling. The final N is unknown. The earlier 15–25% submission rate was an assumption, not data.

## 6. Build, Ship, Shape: Amazon Developer Hackathon (Devpost)
- **Deadline:** Oct 23, 12:00 PDT.
- **N:** N_reg is 24,520 (published). N_sub is unpublished, and the gallery is not yet public.
- **k:**
  - Fire TV: 3 places. Alexa+: 3. Bee: 2. Ring: 2.
  - AWS Builder Mini Challenge: 1 × $5k.
  - Open Source Mini Challenge: 1 × $5k. It needs a new open-source repo or pull request alongside an entry in one of the main tracks. The shelter-rail SDK fits this, but only on top of a main-track entry.
- **Criteria:** technical implementation, design, potential impact, quality of the idea. There is no social-impact track.
- **Fit:** poor. Entries must be a Fire TV app on Fire OS or Vega, an Alexa+ MCP server or skill, a Bee app, or a Ring app.
- **Eligibility:** all countries except Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-sanctioned countries, so Lithuania is fine. Companies may enter. Existing apps are allowed if significantly updated, with the changes shown in the video.
- **Human hours:** about 3 or more, and it falls right after Anitya.
- **Arithmetic:** cannot be computed; only N_reg is known. As a floor, k/N_reg is 12/24,520, about 0.05%.

## 7. YouCam API Skin AI & eCommerce VTO Hackathon (Devpost)
- **Deadline:** Nov 2, 11:45 EST.
- **N:** N_reg is 433 (published). N_sub is unpublished, and the gallery is not yet public. The earlier sweep's 18.6% ratio came from a prior edition and has not been re-verified; applied here it gives about 80.
- **k:**
  - Open prizes: 3 places ($2,500, $1,000, $500).
  - Women in Tech: $1,000. This depends on team composition, which I don't know.
  - Rising Star: $1,000, students only, so we are not eligible.
- **Criteria:** use of a YouCam API, design, potential impact ("a credible case for solving a real problem"), idea quality. Impact is a criterion, but there is no track for it.
- **Fit:** poor. The entry must integrate at least one YouCam Skin AI or virtual try-on API, which does not match a pet or shelter app.
- **Eligibility:** Lithuania is not excluded, and existing projects are allowed ("a major upgrade to an existing project").
- **Human hours:** about 2–3.
- **Arithmetic:** based on the unverified N_sub of about 80, k/N is 3/80 = 3.75% and UB70 is 3/24 = 12.5%. If Women in Tech applies, k becomes 4.

## 8. Bezi Jam 14 (itch)
- **Dates:** the jam runs Oct 23 00:00 to Oct 26 23:59 PST. Voting ends Nov 1. This is after Anitya on Oct 20.
- **N:** 26 joined so far (published). N_sub for this edition does not exist yet. The earlier sweep cited about 58 entries for the prior edition, which I did not re-verify.
- **k:** Best in Show pays 3 places ($150, $100, $50). Best Devlog pays $50. Fan art pays $50, and generative AI is banned for fan art.
- **Criteria:** a community vote cuts the field to the top 30. The Bezi team then picks winners on gameplay, creativity and theme, polish, technical execution, and scope. There is no social-impact criterion.
- **Fit:** low. The game must be original and built for this jam, so Heist cannot be entered, though existing assets are allowed. The theme is "SOMETHING WICKED" plus a sealed second theme. Using Bezi is optional.
- **Eligibility:** teams of up to 3, English, online. The page states no AI ban for the game itself.
- **Human hours:** about 2–4 for a new 3-day game.
- **Arithmetic:** using the prior edition's 58 entries (unverified), k/N is 3/58 = 5.2% and UB70 is 3/17, about 17%. The maximum prize is only $150.

## 9. Terror Jam 2026 (Latinx in Gaming / Vibe XP)
- **Deadline:** Oct 24, 03:59 UTC.
- **N:** 106 joined. The entry count is not shown.
- **k:** 5 cash prizes totalling $1,100 ($500, $200, $200, $100, $100).
- **Criteria:** quality, creativity, theme, and use of the challenges.
- **Eligibility:** age 18+, and the game must be made during the jam. The page says "Any game that has been found to use AI will be disqualified from the prize pool".
- **Human hours:** not estimated, because the entry cannot win.
- **P = 0.** Our work is about 90% AI.

## 10. Others from the sweep
- **Indiepocalypse #83:**
  - 47 entries, 10 selected, $20 up front plus 5–8% royalties. The deadline is Oct 1, 16:00 UTC. The build must be downloadable, and existing games are allowed.
  - k/N is 10/47 = 21%, and UB70 is 10/14, which exceeds 100%. For modelling, treat P as about 0.2–0.5 given the curator's taste, which is unknown.
  - You said "$20 is too much" and did not list it among the committed items, so I have marked it dropped.
- **x402 Foundation micro-grant:** you have now committed to it. The page states:
  - Up to $3,000, called "impact-based micro-grants", for projects that "unlock new demand or supply" and are live on mainnet.
  - To apply, record a video of 2 minutes or less and tag @coinbaseDev on X, or submit a grant or contact @murrlincoln.
  - No window, grant count, approval rate or KYC rules are published, so N and k are not available.
- **Not re-fetched:** the Monad Agora cross-border bounty (sub-page), Daydreams agent-bounties, Celo Proof of Ship, and the non-hackathon grants. None of those can be computed, or they were already ineligible.

## Summary for the model

| Item | Deadline | N (published?) | k | Social impact? | Existing work | Human hours | k/N | UB70 |
|---|---|---|---|---|---|---|---|---|
| Arbitrum Singapore | Oct 4 | reg 1,043 (Y); sub unpublished; ~370 using London's 35.5% (unverified) | 6 plus grants | No | Yes | ~1 | 1.6% | 5.4% plus grants |
| Monad Metropolis | Oct 13 | unpublished | 3 (Consumer) +3 (Social) +1 champion | No | New work only | ~2 | cannot compute | cannot compute |
| Open Agent | Oct 20 | reg 1,200 (Y) | 3 per track, 12 total | Impact is 30% of the score | not stated | 3+ | ≥1% of registrants | cannot compute |
| Hedera Scaffold | Oct 4 | unpublished | 5 | No | Original work | ~2.5 | cannot compute | cannot compute |
| Game Gauntlet SIM | Nov 4 | joined 399, 7 entries so far (Y) | 2 | No | No (Heist ineligible) | 6–8+ | final N unknown | cannot compute |
| Amazon | Oct 23 | reg 24,520 (Y) | 12 in total; 1 Open Source mini | No | Yes, if significantly updated | 3+ | ~0.05% of registrants | cannot compute |
| YouCam | Nov 2 | reg 433 (Y); ~80 submissions (unverified 18.6% ratio) | 3 (+1 Women in Tech if eligible) | Impact is a criterion | Yes | 2–3 | 3.75% | 12.5% |
| Bezi Jam 14 | Oct 26 | joined 26; prior edition 58 entries (unverified) | 3 (max prize $150) | No | No | 2–4 | 5.2% | ~17% |
| Terror Jam | Oct 24 | joined 106 | 5 | No | No | not estimated | 0 (AI ban) | 0 |

**What changes versus the sweep:**
1. SIM Jam now allows AI. Still, it rejects existing work, so Heist cannot be entered.
2. YouCam's UB70 of 12.5% and Bezi's of about 17% cross 10% only under the 70th-percentile assumption. Both still rest on N values I could not verify, and both fit our assets poorly or pay very little.
3. Arbitrum Singapore is the cheapest entry, since the deploy already exists, but its UB70 is still under 10%.

## Charity and public-good tracks

At the 70th percentile, none of the charity or public-good tracks I could check gets us near the top of a small field between Oct 1 and Nov 30 2026. Nothing new clears P > 10%. The Colosseum Public Goods award is the only one we can enter, and it only makes sense as a free tick-box on the Oct 11 entry we already have.

WebSearch had used up its 200-call budget, so all of this comes from WebFetch. Anything that site listings don't show, I could not find.

**The 70th-percentile model.** I wrote a small scratch script (`pct.mjs`, in this session's scratchpad folder). It gives the chance of finishing in the top k of N entries when our entry sits at the 70th percentile and every other entry is independent. The script assumes judges rank entries without noise. Real judging is noisy, which spreads the odds out a bit, but the break-even points stay small. P > 10% needs a field no bigger than this:

| Prize slots (k) | 1 | 2 | 3 | 5 | 10 | 23 |
|---|---|---|---|---|---|---|
| Largest field (N) | 7 | 12 | 16 | 25 | 45 | 94 |

For comparison, one winner needs N ≤ 11 at the 80th percentile and N ≤ 22 at the 90th. In practice, only curated fields under about 50 entries, or bounties with little competition, are worth our time.

### Colosseum Public Goods award (Oct 12, 23:59 PT) — keep, but only as a tick-box
- **URL:** https://colosseum.com/worldsfair. Rules PDF section 14(b): "Public Goods Award: $5,000 CASH". So k = 1. Winners are announced "on or about December 5, 2026".
- **Criteria:** the rules don't say how this award is judged; the page gives only "$5,000 Public Good Prize". The general criteria are functionality and code quality, potential impact, novelty, UX, open source and composability, and business plan.
- **Past winners, all $10k and all open-source developer tools:**
  - Radar: Attest Protocol, 1,359 submissions.
  - Breakout: IDL Space, 1,412 submissions.
  - Cypherpunk: Samui Wallet, 1,576 submissions.
  - Each was described as "an open-source project that benefits developers across the Solana ecosystem."
- **What this means for us:** the award has always gone to developer infrastructure, never to charity. Only the open-source shelter-rail SDK framing fits.
- **N:** 1,359 to 1,576 submissions (the past totals above). How many contest this award specifically is unpublished, and I did not invent a number. P is about 0 against the whole field, 3e-5 if 30 entries contest it, and 4% if only 10 do. All are below 10%.
- **Hours:** 0 extra. Tick it on the existing entry and title the README "open-source shelter payout SDK".

### x402 Foundation micro-grant (committed) — no change
- **URL:** https://github.com/x402-foundation/x402/blob/main/PROJECT-IDEAS.md
- **Terms:** "Impact-based micro‑grants up to $3k" for projects that "unlock new demand or supply and are live on mainnet." To apply: "Open a grant or reach out to @murrlincoln."
- No deadline, no award count and no social-impact angle is stated, so k and N are unknown and there is no P arithmetic. It stays in only because it takes under 1 human hour. Keep it in its Oct 12–16 slot.

### Checked and dropped (Oct 1 – Nov 30)
- **ETHGlobal:** the only event in the window is ETHGlobal Mumbai (Nov 5–7), which is in person. No online public-good prizes.
- **Chainlink:** Convergence ran Feb 6 – Mar 8 2026. No social-impact track and nothing in the window.
- **Hedera:** Hello Future Apex (it had a Sustainability / "social impact" track) closed Mar 23. The AI bounties closed Jun 21.
- **Avalanche:** the only event is Team1 Vietnam UniHack (Nov 2, $3.5k), in person in Ho Chi Minh City.
- **HackQuest, Devfolio, lablab.ai:** no social-impact tracks in the window. The Arbitrum Dubai buildathon (already committed) has $30k total with tracks "TBD"; watch for an impact track when it opens around Oct 31.
- **Devpost "Social Good" listings:**
  - Neighborhood Hacks ($41.7k): "High school students only", "Companies/professional organizations excluded".
  - IEEE ClimateChain ($1.5k / $1k / $500): "Students only", companies excluded, and every track must be climate-focused.
  - Hack Apertus: projects "must be new", and it is built around the Apertus model.
  - DSH Hacks V2: "Students only", and "THIS IS NOT A CASH PRIZE".
  - EurekaDev and Checkpoint 1 Games for Good: students aged 13–19 only, and Checkpoint is in Jan 2027 anyway.
  - OneAquaHealth: health theme, Oct 5, 1,211 registered.
  - The others (ImpactHack, United Hackathons, GIBC, ML Empowerment, 2026 AI for Good Hackathon) show $0 in cash.
- **AI-for-good:** the ITU Innovation Factory pays its $20k only at an in-person final in Geneva, so it fails remote-only. Its application deadline is also Oct 1.
- **Kind, cozy or animal game jams:** all ban AI.
  - Comfy Jam Autumn ($50 × 6, 1,222 joined): "No Ai, No Exceptions".
  - Wholesome Games Jam: "No Generative AI and/or LLM usage of any kind", no prizes, teams of 2–6 only.
  - Cookie Jam #5 ($50 top prize): "NO AI".
  - Digital Pet Jam: "unranked jam, with no prizes", and no generative AI.
- **Open Paws:** no events or prizes listed. **DoraHacks:** the listing returned HTTP 405 on every attempt, so it is unchecked.

### What to do
- Add nothing new. Keep the committed plan and x402.
- Use the charity angle to lift our scores in the fields we already enter, rather than as a separate bet.
- Tick the Colosseum Public Goods box as a zero-hour extra.
- When Arbitrum Dubai publishes its tracks around Oct 31, check for an impact track. It only matters if that track's field is 45 entries or fewer for 10 slots, or 7 or fewer for 1 slot.
