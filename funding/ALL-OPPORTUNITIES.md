# Every opportunity — grants and accelerators only

As of 2026-09-25, red-team corrections applied. Evidence per row: `OPPORTUNITIES.md`. Sequencing: `PLAN.md`.

**Scope:** grants, prizes and accelerators only. Removed: investment options (VC funds, matching
funds, token sales, listings, market makers), free credits and in-kind perks, fee discounts, and
revenue integrations. Those are listed at the bottom.

- **Capital** = realistic amount to Token Tails, not the headline pool.
- **Success** = single best estimate if the work is done well.
- **EV** = capital midpoint × success.
- **Manual (pd)** = person-days without AI, from the research playbooks.
- **AI (h)** = projected hours for one person using AI tools. Writing ~3–4× faster, decks ~3×,
  engineering ~2×; calls, KYC/KYB, notary, signatures, attestations, audits, legal review and
  on-camera video don't compress. Shared work is counted once, below.
- **Type:** G grant/prize · A accelerator.
- **Verdict:** DO now · COND once a condition is met · LATER after the TGE/next cycle · SKIP.

## Shared prerequisites (do once, feeds most rows)

| Task | AI (h) | Human-only part |
|---|---|---|
| Reconcile on-chain metrics + Dune dashboard on Stellar | 6–10 | Deciding which numbers to defend |
| Rotate README RPC key, fix `contracts/LICENSE`, publish + verify contracts on stellar.expert | 6–10 | Key rotation with the provider |
| Master deck + metrics sheet | 8–10 | Final numbers sign-off |
| Fix SDF ecosystem listing | 0.5 | — |
| MiCA/TGE memo prep for counsel | 3 | Counsel review (external) |
| MB → UAB conversion + NACE change (needed for Creative Europe and equity-taking accelerators) | 3 | Notary, ~1 month registry time |
| Accountant: revenue booking review | 2 | Accountant |
| **Total** | **~29–39 h** | |

## A. Remote and live

Hours are midpoints for one person. **Manual** = no AI (person-days × 8). **AI only** = AI tools
without the framework. **Framework** = using `funding/framework` (`node bin/fund.mjs`). Human-only
work (calls, signing deploys, video, art, partner search, KYC) is included in all three.

| # | Opportunity | Type | Capital | Success | EV | Manual (h) | AI only (h) | Framework (h) | Saved vs manual | Saved vs AI only | Deadline | Verdict | Link |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Colosseum World's Fair | G | $5–30k | 17% | ~$2.5k | 64 | 20 | 7 | **89%** | 65% | **Oct 12** | **DO** | [colosseum.com](https://colosseum.com/worldsfair) |
| 2 | Arc Microgrants | G | $500 | 40% | $200 | 40 | 3 | 1.5 | **96%** | 50% | **Oct 14** | **DO** | [community.arc.io](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq) |
| 3 | Game3 Grants | G | $5–50k | 7% | ~$2k | 8 | 2 | 0.75 | **91%** | 63% | Rolling | **DO** | [game3.foundation](https://game3.foundation/grants) |
| 4 | SKALE SIP-6 forum post | G | Share of 288.75M SKL | ? | ? | 4 | 1 | 0.5 | **88%** | 50% | Before vote | **DO** | [forum.skale.network](https://forum.skale.network/t/848) |
| 5 | Arbitrum Dubai buildathon (online) | G | $5–10k | 15% | ~$1k | 16 | 3 | 1.5 | **91%** | 50% | Nov 16 – Dec 6 | COND | [hackquest.io](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Dubai-Online-Buildathon) |
| 6 | Arbitrum Singapore buildathon (online) | G | $3–40k | 5% | ~$1k | 52 | 4 | 2 | **96%** | 50% | **Oct 4** | SKIP | [hackquest.io](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon) |
| 7 | SDF Marketing Grants | G | $25–100k | 15% | ~$9k | 520 | 60 | 42 | **92%** | 30% | Rolling | **LATER** | [stellar.org](https://stellar.org/grants-and-funding/marketing-grants) |
| 8 | Circle Developer Grants | G | $5–100k | 3% / 20% with Arc rail | ~$1.5k | 344 | 80 | 62 | **82%** | 23% | Rolling | **LATER** | [circle.com](https://www.circle.com/grant) |
| 9 | Creative Europe MEDIA | G | ~€200k (60%) | 7.5% | ~$18k | 580 | 70 | 52 + contracted art | **91%** | 26% | ~Jan–Feb 2027 | **LATER** | [eacea.ec.europa.eu](https://www.eacea.ec.europa.eu/grants/2021-2027/creative-europe_en) |
| 10 | Women TechEU 2 | G | €75k | Conditional | — | 60 | 12.5 | 8.5 | **86%** | 32% | Jan 14 2027 | COND | [womentecheurope.eu](https://womentecheurope.eu/active-calls/) |
| 11 | Eurostars Call 12 | G | ~€200–500k | 5% | ~$17k | 160 | 40 | 30 | **81%** | 25% | Mar 4 2027 | COND | [eurekanetwork.org](https://www.eurekanetwork.org/programmes-and-calls/eurostars/) |
| 12 | EIC Accelerator | G | €2.5M grant | 1% | ~$25k | 240 | 60 | 45 | **81%** | 25% | Rolling | SKIP | [eic.ec.europa.eu](https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en) |
| 13 | Base Builder Grants | G | 1–5 ETH | 3% | — | 8 | 3 | 1 | **88%** | 67% | Nomination | SKIP | [docs.base.org](https://docs.base.org/get-started/get-funded) |
| 14 | Arbitrum DDA Gaming | G | ≤$50k | 30% if deployed | ~$7k | 75 | 37 | 31 | **59%** | 16% | Until exhausted | SKIP | [questbook](https://arbitrum.questbook.app/) |
| 15 | Ronin Proof of Distribution | G | RON/epoch | 90% if deployed | ? | 65 | 32 | 27 | **58%** | 16% | Rolling | SKIP | [roninchain.com](https://docs.roninchain.com/proof-of-distribution) |
| 16 | Sonic Innovator Fund | G | Unpublished | ? | ? | 65 | 32 | 27 (0.75 for the intake form alone) | **58%** | 16% | Rolling | SKIP | [soniclabs.com](https://docs.soniclabs.com/funding/innovator-fund) |
| 17 | Team1 Avalanche | G | ≤$10k | 25% if deployed | ~$1k | 65 | 32 | 3 (ShelterSplit deploy, not a full port) | **95%** | 91% | Rolling | SKIP | [team1.network](https://team1.network/grants) |
| 18 | Beam Foundation | G | Unpublished | 10% | — | 75 | 37 | 31 | **59%** | 16% | Rolling | SKIP | [onbeam.com](https://grants.onbeam.com/) |
| 19 | IMX Developer Incentives | G | Unpublished | 10% | — | 160 | 80 | 67 | **58%** | 16% | Rolling | SKIP | [digitalworldsnfts.com](https://www.digitalworldsnfts.com/developer-incentives) |
| 20 | MegaETH Mega Mafia | A | Unpublished | 3% | — | 4 | 1 | 0.5 | **88%** | 50% | Rolling | SKIP | [megaeth.com](https://www.megaeth.com/builder) |
| 21 | Superteam | G | $150–15k | n/a (Solana-only) | — | — | — | — | — | — | Rolling | SKIP | [superteam.fun](https://superteam.fun/earn/) |
| 22 | Mastercard Start Path | A | Distribution | 5% | — | 24 | 4 | 2 | **92%** | 50% | Rolling | SKIP | [mastercard.com](https://www.mastercard.com/global/en/business/fintech/fintech-programs/startpath.html) |
| 23 | Nouns DAO proposal | G | 10–1,000 ETH | 5% | — | 240 | 40 | 27 | **89%** | 33% | Rolling | SKIP | [nouns.center](https://nouns.center/funding/proposals) |
| 24 | Artizen Fund S7 | G | Unverified | ? | — | 4 | 0.5 | 0.5 | **88%** | 0% | — | CHECK | [artizen.fund](https://artizen.fund/) |
| 25 | Lithuanian travel subsidy | G | ~€3,500/yr | 0% 2026 / ~90% 2027 | — | 24 | 4 | 2 | **92%** | 50% | Nov 11 | **LATER** | [inovacijuagentura.lt](https://www.inovacijuagentura.lt/finansavimo-kvietimas/skatinti-lietuvos-startuoliu-dalyvavima-uzsienio-renginiuose-kurie-vyksta-nuo-2026-m-liepos-16-d-iki-2026-m-gruodzio-31-d/) |

### Time totals

| Scope | Manual | AI only | Framework | Saved vs manual | Saved vs AI only |
|---|---|---|---|---|---|
| **4 DO rows** (#1–4) | 116 h | 26 h | ~10 h | **92%** | **63%** |
| **All 24 attackable options** (excl. Superteam) | 2,897 h | 658 h | 472 h | **84%** | **28%** |
| Shared prerequisites | — | 29–39 h | 23–31 h | — | ~20% |

With the prerequisites, the near-term plan is **~33–41 hours** (about 5 working days for one person).

### Where the time goes, and why the savings differ

| Saving | Rows | What the framework removes |
|---|---|---|
| **90%+ vs manual, 50–91% vs AI only** | #1–6, #13, #17 (Track A) | ShelterSplit is already written and passes 33 tests; `a:init`, `a:submission` and `a:matrix` turn one build into each submission. Left: the signed deploy and a demo video |
| **~90% vs manual, ~50–63% vs AI only** | #3, #4, #20, #22, #24, #25 (Tracks B, E) | `b:fill` builds the paste sheet from approved blocks with limits enforced; `e:scan` replaces manual checking of 22 pages |
| **81–92% vs manual, 23–33% vs AI only** | #7–12, #23 (Tracks C, D) | Rubric extraction, citation and limit checks, `c:score`, `c:budget`, `c:plan`, `d:export`, `d:clock`. Most remaining time is writing, real data (CAC, budgets) and people: partners, sponsors, the narrative lead |
| **~58% vs manual, ~16% vs AI only** | #14–16, #18, #19 | These need a new chain port of the NFT stack; the framework only speeds the application around it |

**These are projections, not measurements.** After the first three submissions, compare actual
hours against these and recalibrate.

**Grant-only portfolio, honestly:** with BGA, Mantle and SCF gone, the three highest-probability
awards are gone too. Colosseum 17% · SDF Marketing 15% · Dubai 15% · Creative Europe 7.5% ·
Game3 7% → **~50% for at least one real award** if independent (≈70% if the $500 Arc microgrant
counts). The list is now thin; expect to lean on Creative Europe (Jan–Feb 2027) and new calls
surfaced by Track E (`node bin/fund.mjs e:scan`). **If Stellar/SDF is off the table entirely, #7 goes too.**

## B. Live but not remote — excluded

| Opportunity | Type | Capital | Success | AI (h) | Deadline | Link |
|---|---|---|---|---|---|---|
| a16z SPEEDRUN SR008 | A | $500k for 10% + $500k | 1% | 20–30 (+ web guest demo) | Oct 12 – Nov 1 | [speedrun.a16z.com](https://speedrun.a16z.com/apply) |
| Alliance ALL19 | A | $400–800k | 5% | 4 | Nov 18 | [alliance.xyz](https://alliance.xyz/apply) |
| Y Combinator W2027 | A | $500k | 1.5% | 6 | Nov 2 | [ycombinator.com](https://www.ycombinator.com/apply) |
| Orange DAO OF3 | A | $100k | 8% | 3 | To Feb 10 | [orangedao.xyz](https://www.orangedao.xyz/orange-fellowship) |
| Hub71+ Digital Assets | A | ~$204k | 12% | 4 | Feb 2027 | [hub71.com](https://www.hub71.com/program/hub71-plus-digital-assets) |
| EIT Culture & Creativity Shape | A (3% option) | €100k | 3.5% | 30–40 | Oct 12 | [eit-culture-creativity.eu](https://eit-culture-creativity.eu/your-opportunities/calls-funding/financial-support-startups-and-scaleups-shape-acceleration-scale) |
| Leap Venture Studio Impact Seat | A | $0 (network) | 14% | 2 | Oct 18 | [leapventurestudio.com](https://www.leapventurestudio.com/) |
| Pet Care Innovation Prize | G | $25–50k | 5% | 4 | Oct 6 | [petcareinnovation.net](https://petcareinnovation.net/prize/) |
| UNLEASHED by Purina | A | CHF 50k | 11% | 3 | ~Jul 2027 | [unleashedbypurina.com](https://www.unleashedbypurina.com/) |
| Arbitrum Founder House Singapore | G | Up to $60k/prize | 10% | 4 (+ deploy) | Oct 23–25 | [luma.com](https://luma.com/openhouse-singapore) |
| HackMeridian + Meridian | G | $5–12k | 20% | 30 | Reg. Oct 9 | [hackmeridian.com](https://www.hackmeridian.com/) |
| Colosseum accelerator | A | $250k | ? | — | After Oct 12 | [colosseum.com](https://colosseum.com/worldsfair) |
| CV Labs Batch_08 | A | $115k for 6% | 20% | 3 | Waitlist | [cvlabs.com](https://www.cvlabs.com/services/accelerator) |
| Cyberport CIP | A+G | ~$90k | <5% | 10 + HK entity | Rolling | [cyberport.hk](https://www.cyberport.hk/) |
| K-Startup Grand Challenge | A+G | ~$10–25k expected | 10% | 6 | Spring 2027 | [ksgc.global](https://ksgc.global/) |
| Start-Up Chile | A+G | ~$83k | 25% | 6 | TBA | [startupchile.org](https://www.startupchile.org/en/) |
| Parallel18 | A | $100k | <5% | 4 | 2027 | [parallel18.com](https://parallel18.com/p18/) |
| Malta Enterprise Accelerate | G | €100k | 35% | 10 + Maltese entity | Rolling | [maltaenterprise.com](https://www.maltaenterprise.com/support/start-finance) |

## Removed from this list

Still documented in `OPPORTUNITIES.md` and `PLAN.md`.

- **Investment:** FIRSTPICK · SDF Matching Fund · Coinvest Capital · 1kx · Practica · BITKRAFT ·
  Fabric · Inovo · Makers Fund · Seedcamp · 6th Man Ventures · Variant · Ani VC / Boost · Base
  Ecosystem Fund · SDF Enterprise Fund · Startup Qatar · Bitget · Kraken Launch · Legion · Coinbase
  Asset Hub · Fjord Foundry · Flowdesk / GSR / Keyrock · CoinList · KuCoin Spotlight · Echo / Sonar.
- **Excluded by you:** BGA Ascend · Mantle · Stellar Community Fund (SCF #46, Instawards, Public
  Goods Award, Soroban Audit Bank) · Giveth.
- **Credits and in-kind:** AWS Activate · Google for Startups Cloud · Anthropic Claude for Startups ·
  Stripe startups.
- **Revenue, fee discounts and non-funding items:** Apple App Store Small Business Program ·
  Sonic FeeM · Circle Alliance Program · Hopohopo startuolis assessment.

## Killed

Reasons are in `OPPORTUNITIES.md` §H. GameTech Vilnius · Gitcoin · quest platforms ·
Binance Alpha · Bybit direct listing · OKX Jumpstart · MEXC · NVIDIA Inception · Microsoft for
Startups · Google Start tier · UNICEF Venture Fund · Visa Fast Track · Circle Unlocking Impact /
Arc Builders Fund / Arc Acceleration · PetSmart · Petco Love · Maddie's · Banfield · EA Animal Welfare ·
Companion Fund II · Stellar × CV Labs · SCF Open/RFP tracks · Base Batches 004 · Outlier · BNB MVB ·
Logos · Prezenti · a16z CSX · 28DIGITAL · Somnia · Sui Hydropower · X1 · Asentum · ETHGlobal Mumbai ·
DMCC · in5 · QFC · QFTH · Astana · UNDP SDG · Mirana · BGA × XION · Sfermion · Merit Circle ·
Lightspeed Faction.
