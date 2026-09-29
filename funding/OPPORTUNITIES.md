# Verified funding opportunities — reference list

**Research date 2026-09-22/23.** Every entry below was fetched live and then attacked by an
independent adversarial verifier whose job was to kill it. 125 claims were checked; 69 survived as
CONFIRMED-LIVE. Amounts and deadlines are quoted from the program's own page, not from memory or
from third-party databases — several third-party databases were caught carrying figures that do not
appear on the source page.

Ranking, sequencing and the execution plan are in `PLAN.md`. This file is the evidence base.

> **Re-verify before submitting.** Deadlines move. Anything here with a date should be re-checked on
> its own page the day you act on it.

> **Round two (2026-09-23/25) overturned several rows below.** They are corrected in place and marked
> ⚠️. The biggest: SCF has **already awarded Token Tails $144,000** against a $150,000 lifetime cap;
> GameTech Vilnius is **dormant**; the Lithuanian travel subsidy is **blocked by a €2,000 revenue
> floor**; EIT takes a **3% call option** and excludes gaming from the 2027 cohort. New finds from
> round two are in §I, and new kills in §H.

---

## A. Stellar — the home ecosystem

Token Tails is already on Stellar mainnet, so these need no chain migration. The recurring catch:
**five separate SDF programs gate on financial-protocol or payments framing, and SCF's official
rules bar projects "primarily focused on promoting a specific token or a specific NFT or NFT
collection with no real-world use case."** The shelter-disbursement framing is therefore mandatory
across every Stellar application, not a stylistic choice.

| Program | Money | Status / deadline | Notes |
|---|---|---|---|
| **SCF #46 Build Award — Integration Track** | Up to **$150,000 XLM**. Bands: Small $25–50k, Medium $50–100k, Large $100–150k. Tranches 10% / 20% at MVP / 30% at testnet / 40% on a committed on-chain metric | **OPEN — closes 2026-11-08** | ⚠️ **Token Tails has already received $144,000** (SCF #26 $48k + SCF #30 $96k, per `communityfund.stellar.org/project/token-tails-gov`). SCF #41 and #42 ($150k each) both **failed prescreen**. Headroom under the lifetime cap is **$6,000**; above that is case-by-case to $300k and requires contacting `communityfund@stellar.org` first. Across the 69 awards in SCF #43 and #44 there is **no game, no NFT project and no consumer-entertainment app**. Best-fit program found. Explicitly for "teams that have applications with existing traction". Must integrate ≥1 item from the official SCF Integration List (Stellar Disbursement Platform, Privy, DFNS, Mercuryo, Bridge, alfredpay all confirmed on it). $150k is a **lifetime** per-project cap; $300k absolute max by exception. Each tranche must be submitted within 90 days of the previous one. **Requires a clear plan to open-source the smart contracts** — conflicts with the commercial licence on the monorepo. SCF #44 was the largest ever: 175 submissions, 46 awards. 42M XLM across 656 funded submissions to date |
| SCF #46 — Open Track | Same $150k envelope | Same deadline | Wrong track. Excludes applications "primarily focused on integrating existing tools like wallets, anchors, or passkeys" — i.e. exactly the SDP/Privy pitch. Adds a public community vote. SCF #43 accepted 10 of 39 (~26%), the hardest track |
| SCF #46 — RFP Track | Same envelope | Same deadline | Ineligible. Funds developer tooling matching an active SCF RFP (currently a LayerZero DVN and an x402 facilitator). Token Tails is an end-user app |
| **SDF Marketing Grants** | Up to **$500,000** in USD/USDC/XLM. ⚠️ Realistic modal cheque **$50–150k** | **ROLLING, no deadline** | ⚠️ All **7 named recipients** in four years (Arf, Fonbnk, Félix, Beans, Boss Money, Novatti, Elsa.Care) are payments/remittance/on-ramp fintechs with SDF BD relationships — zero games, zero NFT projects. SDF's own ecosystem CMS files Token Tails as subCategory "NFTs" in "United States, Japan" — fix before applying. The largest non-dilutive cheque reachable, and it needs **zero engineering**. Funds paid digital media, offline events, PR, and "in-app incentives, such as new customer bonuses, referrals". **Excludes** promoting price appreciation, speculation, wash trading — so no $TAILS launch spend. Five criteria: traction, mission alignment, impact, feasibility, team capability. Reserved for "qualified teams with proven capability" — reads relationship-gated. `marketinggrants@stellar.org` |
| SDF Matching Fund | Matches a lead investor **1:1 up to $500,000** — ⚠️ a $200k lead unlocks $200k, not $500k | Rolling | **Minimum lead check $200,000** and the lead must have made a similar investment in the last 12 months. The Enterprise Fund portfolio is entirely fintech (Fanvestor, Trace Finance, Afriex, Puntored, …). See §I for the lead-investor pipeline and Coinvest, a second matching pool triggered by the same lead. Stage pre-seed to Series B. Dilutive — it matches an equity round, it does not start one. **Mutually exclusive with the SCF Build Award.** Email `matchingfund@stellar.org` with a term sheet, deck, investor list and a one-page Stellar integration description |
| SDF Enterprise Fund | Nothing published | Rolling form | Outbound-only in practice; SDF initiates contact. File the form for the record, do not model it |
| Soroban Security Audit Bank | Up to **100% of audit cost** in kind; 5% co-pay refunded if all critical/high/medium findings are fixed within 20 business days | Rolling, **invitation only** | **Locked until Token Tails holds an SCF award.** Would cover a professional audit of the Cat/Blessing/Pass contracts, which as far as the repo shows have never been independently audited. Counts as upside on winning SCF #46, not a separate target |
| SCF Instawards | **$1,000–5,000** XLM initial, up to $15,000 aggregate | Rolling — **decision in 3–5 business days** | Fastest money on the entire list by an order of magnitude. Blocker: requires active participation in a local Stellar Ambassador Chapter with Chapter Lead support. No direct-apply route |
| SCF Public Goods Award | Up to **$50,000 XLM per proposal per quarter** | Rolling, invitation only | Token Tails as a commercial app is not a public good. Only credible route is a spun-out OSS artefact (e.g. an open Soroban NFT metadata/minting reference, or a charitable-disbursement attestation contract). Still in soft-launch with snapshot-only proposals |
| SCF Referral Program | 1% of the award — **to the referrer, not to you** | Rolling | A referral code is optional but available, from approved Ambassadors, Navigators, Pilots, partners and SDF staff. Capped at 6 rewards per cycle |
| **HackMeridian 2026** | ⚠️ Now published: **"Up to $30,000 in XLM across the Genesis and Scale tracks."** Travel support available for selected builders | **Oct 25–26, 2026, Lisbon. Meridian registration closes Oct 9** | 2025's six winners were all financial primitives (a fund, a bridge, lending, infra). Developer ticket **$49**; Meridian conference Oct 28–29 at Convento do Beato ($299 GA, $99 gov/policy with code GovPolicyM26). Has a **"Scale" track for teams moving existing products toward production** — removes the usual penalty a mature app carries at a hackathon. The real value is proximity: SDF staff, Pilots, Navigators and Ambassadors in one building **two weeks before the Nov 8 SCF deadline** |

> **Correction on record:** an earlier pass claimed Marketing Grants requires "a live product built
> on Stellar". The page actually targets "both new and existing projects". And HackMeridian's
> widely-repeated "$30,000 prize pool" appears nowhere on the official page.

---

## B. Non-crypto public funding (EU / Lithuania)

Indifferent to token economics in a way crypto grants are not. Largest non-dilutive sums available.

| Program | Money | Deadline | Notes |
|---|---|---|---|
| **EIT Culture & Creativity — Shape / Scale** | Shape: **€100,000** + a further €100,000 for top-ranked after Demo Day. Scale: **€200,000**, or **up to €500,000 for ventures headquartered in an EIT RIS country — Lithuania qualifies**. €8.6M pool across 50 ventures. Cost-reimbursement. ⚠️ **Not equity-free:** Annex V is a standard, non-negotiable **Call Option Agreement for 3% of all shares on a fully diluted basis at nominal value**; every shareholder must sign and every future shareholder must accede | **2026-10-12, 17:00 CEST** | ⚠️ Published slot counts: Shape up to 30; Scale non-RIS 14; **Scale RIS only 4** across all RIS countries. ⚠️ **The 2027 cohort is open only to Fashion, Architecture and Audio-Visual Media — gaming is explicitly deferred to a future call.** Frame as an AI content-production and creator-monetisation studio; get written sector pre-clearance via the call's contact form first. Requires a 9-digit PIC from the EU Funding & Tenders Portal. Any section over its character limit is **inadmissible**. The Fabricant (NFT-native) is in the funded portfolio, so web3 is not disqualifying. Tightest live EU deadline. Shape needs "pilot customers or initial revenues"; Scale needs PMF, recurring revenue **and** an active raise with a lead representing ≥€200k. Form at `wkf.ms/4w2NqlF` |
| **Inovacijų agentūra — foreign-event travel subsidy (TWO parallel calls)** | ⚠️ Regulation §7–8 reads as **up to two subsidies per calendar year across both calls** (so ~€3,500/year, not €7,000); a Portugal or France event pays a flat ~€1,046. De minimis. €87,500 per envelope | **2026-11-11 17:00**, with an early-stop if the pool exhausts | ⚠️ **BLOCKED FOR 2026:** §19.2 requires **≥€2,000 sales revenue in the last filed financial year**. Registry mirrors report the applicant entity's filed FY2025 sales revenue at roughly **€105**. Binary check, no discretion. Verify the filed statement in Registrų centras; if it stands, revisit **July 2027** with FY2026 accounts. The Hopohopo startuolis assessment is still worth doing — it is reusable. The original URL 404s; use the two full-slug call pages. Two distinct calls with separate envelopes, same open and close dates: one forward-looking, one **retrospective covering events held 1 Jan – 15 Jul 2026** — past travel is claimable. Requires **STARTUOLIS status** under Lithuanian law (micro/small enterprise in the JAR), an SME declaration, and a deck uploaded to Hopohopo.io. Submit via the KIP system. Effectively first-come, first-served |
| **GameTech Accelerator Vilnius** (GameBCN + Innovation Agency Lithuania) | **€39,701 + VAT** prototype track or **€59,297 + VAT** for the top 8; plus **€3,000** for completing; plus **€42,000** for best in batch. Realistic **€43k–104k** | ⚠️ **DORMANT** — site untouched since 2025-09-25; header still reads "3rd edition. Applications closed!" | ⚠️ The €39,701 / €59,297 sums came from three Inovacijų agentūra calls (`02-113-J-0001-J02/J04/J07`), all closed, funded by Lithuania's RRF plan which **ended 2026-08-31**. No successor call published. Other gates if one appears: Vilnius-region entity registered ≤5 years, SME/single-undertaking consolidation, **sole authorship** of the game, up to 8 funded per call. Zero-regret: submit the still-live expression of interest and monitor |
| EIC Accelerator | Grant **up to €2.5M** (lump sum, TRL 6–8, 24 months) + optional **€1–10M equity** from the EIC Fund | Step 1 short proposal **always open**, batched; next full cut-off 2026-11-04 | Largest cheque available, worst effort-to-odds ratio. The 2026 overhaul made evaluation "stricter and more technical". **Structural problem:** the grant funds TRL 6–8; Token Tails is live in two app stores at TRL 9, and TRL 9 scale-up is **equity-only**. Consumer entertainment scores poorly without a hard technical moat. Free pre-screening from Inovacijų agentūra as national EIC contact point |
| Creative Europe MEDIA — Video Games and Immersive Content Development | **Up to €200,000** at **60%** of eligible development costs. Single applicants allowed; EU IP retention is an explicit objective | 2026 round closed 2026-02-11. Strictly annual — **next call expected ~Oct 2026, deadline ~Feb 2027** | ⚠️ **The call fiche explicitly excludes "puzzle games… social games… even if they have a narrative."** Paw Match is a match-3. Any application must be built around a **new narrative title**, not the existing portfolio. Funds *development* of a new work, not marketing of an existing one. A cultural-policy jury, not a crypto one |
| Eurostars Call 12 | Set per country by national funding bodies; **not published centrally** | **2027-03-04** | Requires ≥2 independent entities from ≥2 Eurostars countries, SME budget share ≥50%, no participant or country above 70%. The consortium requirement is a genuine blocker, not a formality |
| Women TechEU 2 | **€75,000** non-dilutive + business support. €12M across 160 startups 2026–2028 | Eligibility strand: **weekly cut-offs, every Tuesday 17:00 CET**; full proposal 2027-01-14 | **Conditional on a woman co-founder holding CEO, CTO or equivalent.** Widening countries including Lithuania get 40% of the budget ring-fenced. The eligibility check is cheap — run it first if the condition is met |

---

## C. Gaming, consumer and other chains

Every entry here implies a deployment Token Tails does not currently have. Price the port honestly:
the company has already abandoned this pattern twice (SKALE Nebula deprecated, Solana removed March
2026).

| Program | Money | Status | Chain cost |
|---|---|---|---|
| **SKALE SIP-6 Growth Allocation** | **288,750,000 SKL** across Years 7–10 (Oct 2026 – Sep 2030), including "Ecosystem & Developer Grants: Attracting high-throughput applications" | **UPCOMING — framework still in community discussion at `forum.skale.network` topic 848** | **Zero.** The only entry in the whole sweep with no deployment bill — the ERC-721 contracts are already on SKALE Nebula. Targets "high-throughput applications"; 659k weekly transactions is a literal answer. **Act on the forum thread now, before the vote locks the criteria.** Risk: SKL-denominated grants and live community concern about sell pressure |
| Arbitrum DDA 3.0 — Gaming Domain | Gaming domain funded at **$1.5M** inside a $6.75M program; individual grants historically capped at **$50,000** USDC against milestones. ~$1.7M headroom remains program-wide | Open, rolling until the budget exhausts | Needs an Arbitrum deploy. Gaming is a **named, funded domain** with no financial-protocol gate — rare. Evaluated by two DAO-elected allocators. Apply at `arbitrum.questbook.app` |
| Ronin Proof of Distribution | RON every epoch on a published Builder Score: **NFT volume 30%, DEX volume 30%, active users 13%, new users 11%**, gas 8%, contract volume 8%. Per-epoch pool not published | Rolling, continuous | Needs a Ronin deploy. **Structurally the best fit in the sweep** — 60% of the score is NFT volume plus user counts, which is exactly what a 542k-user cat-NFT game generates. No pitch, no committee, no narrative gate. Register at `pod.roninchain.com` |
| Sonic Fee Monetization (FeeM) | **90% of the network fees your app generates**, paid back to you. 25 S registration fee, refunded | Open, permanent | Needs a Sonic deploy. No selection at all — "All apps on Sonic are eligible." Converts transaction count directly into recurring revenue. Pair with the Sonic Innovator Fund (up to 200,000,000 S treasury; per-project ticket unpublished, `soniclabs.com/bd-intake`) |
| Arbitrum Founder House Singapore | **Up to $300K USDG**: $60K/$40K/$20K podium, Robinhood Chain Founder-in-Residence $60K, Innovation Award $30K, Best Promising Products $20K, $70K in grants | **Event Oct 23–25, 2026.** Application deadline not published anywhere | Named priority verticals include **"consumer applications" and "AI agents"**. Application-only, "built for founders and teams who already have an existing product". Needs an Arbitrum One / Robinhood Chain deploy and a Singapore trip with no stated travel support |
| Arbitrum Open House Singapore Buildathon | **$115,000**: $70k overall (40/20/10), $15k Promising Products, up to $30,000 USDC milestone grants | Registration closed 2026-10-02, **submission 2026-10-04** | Fully online. **All prizes are development-milestone-tied.** Judging is explicitly financial ("novel financial applications"), which is a poor fit for a game. Robinhood Chain has reserved prize slots — that is the arbitrage |
| Arbitrum Open House Dubai Buildathon | **$30,000**, breakdown TBD; "prize amounts may adjust if submissions don't meet the host's quality standards" | Registration opens **2026-10-31**, submission Nov 16 – Dec 6 | Tracks are "DeFi, Gaming, Social, Tools" — more game-friendly than Singapore. Near-zero marginal cost if the Singapore redeploy happens first |
| Game3 Grants | **$5,000–50,000** | Rolling, 4–6 week review | **Chain-agnostic as far as the page discloses** — one of very few gaming grants that does not implicitly demand leaving Stellar. "AI-powered game content generation" is a named priority, which is literally the OpenAI+Gemini pipeline. No public grantee list to pattern-match, so treat expected value as low but cost-to-apply as one hour |
| Team1 Builder Mini Grants (Avalanche) | **Up to $10,000**; Accelerator Grants up to $30,000 are nomination-only | Open, no deadline | Needs an Avalanche deploy. Small, but it is the standard door into the Avalanche gaming stack (Game Accelerator with Helika, Blizzard Fund $200M+) |
| Beam Foundation Grants | **Amounts not published** anywhere. Milestone-based with flexible KPIs | Rolling | Gaming-first L1 with a named "AI & gaming" category. Chain-gated: the application asks how you will grow the Beam ecosystem |
| IMX Ecosystem Foundation Developer Incentives | "500 Million tokens"; "~US$180M signed with partners to date". **Per-deal size not published** | Rolling | Requires Immutable zkEVM — a second full ERC-721 stack plus a second wallet path. Weights "target audience and go-to-market" — i.e. how many users you bring |
| MegaETH Mega Mafia | **Nothing published** — no cheque size, no stipend, no terms. Backers listed only | Open (Google Form only) | Mainnet live. Explicitly wants "zero-to-one apps only possible on MegaETH". The 30+ named cohort projects skew DeFi/trading |
| Base Ecosystem Fund | Pre-seed/seed **investment**, no figure published. Base Batches writes $100K | Rolling, 4-field screening form | Unlike Base Batches, the Ecosystem Fund page states no sector gate. Base Batches itself prioritises "trading, payments, agents, financing, or asset issuance" and would reject a cat game |
| Codebase by Avalanche | **$50K** stipend, $500k prize pool, winner $250K in two SAFEs | Season 4 closed; next ~March 2027 | **Two hard gates: cannot have raised more than $500,000, and must commit to building natively on Avalanche for 24 months.** Most dilutive item found. Almost certainly disqualifying |

---

## D. Accelerators

| Program | Terms | Deadline | Verdict |
|---|---|---|---|
| **a16z SPEEDRUN SR008** | **$500K for 10%** on a SAFE + **$500K** in the next round within 18 months + **$10M+ in credits**. No token side letter, no board seat | **Priority window 2026-10-12 → 2026-11-01**; year-round otherwise | ⚠️ **The "built for games" premise is stale.** Published acceptance **<0.4%** (19,000+ applicants, ~70 accepted). SR006: 1 game studio of ~60, 87% AI, >50% B2B. SR007: 29 mapped companies, **0 games, 0 crypto**. The warm path is ACID Labs / Boinkers (the GM of SPEEDRUN is the quoted partner on that deal); SF Tech Week runs Oct 5–11. Blockers are commercial not formal: **12 weeks on-site in San Francisco, late Jan–Apr 2027**, 10% dilution. "Over $300M across more than 300 startups" since 2023. Note the cheque clears the $200k floor for the SDF Matching Fund |
| **Alliance (ALL19)** | **$400k on admission + $400k follow-on at seed** at **$4M post-money SAFE with a 1:1 token side letter** | Early admission closed 2026-09-23. **Regular admission 2026-11-18.** Program starts 2027-01-11, in person | Canonical consumer-crypto accelerator; explicitly welcomes "web2.5" and any stage. **Direct conflict: the 1:1 token side letter against a TGE on 2026-11-19, which fires before the program starts.** $4M post is a low valuation floor for 542k users and live Stripe revenue. Must be renegotiated in writing or the TGE resequenced |
| **Y Combinator W2027** | **$500,000**: $125K post-money SAFE for 7% + $375K uncapped MFN SAFE | **2026-11-02, 20:00 PT** for an on-time decision by Dec 11 | **Hard structural blocker: YC invests only in US, Canada, Cayman or Singapore corporations.** A Lithuanian entity must restructure a parent company before investment proceeds. Reframe required too — YC reads "NFT cat game" as 2021; it reads "consumer app, 542k users, live iOS/Android, real revenue, AI content pipeline" as 2026 |
| Orange DAO Fellowship OF3 | **$100K uncapped SAFE + 2% advisory fee** | No published deadline; program starts 2027-02-10 | Cheapest terms of any crypto accelerator found. Explicitly accepts funded and launched companies. Network is 1,300+ YC-backed founders, which doubles as a YC referral engine. Blocker: in-person weeks in **both San Francisco and New York**. No eligibility criteria published at all — confirm before investing time |
| Mastercard Start Path | No stipend. Discretionary equity investment from a dedicated fund. Value is distribution | Rolling, no deadline | Named track: "Blockchain & digital assets". **Stage gate: "Investment raised (Seed, Series A or later) with product live in market and generating revenue"** and "reference customers". Fits the payments product, not the game |
| Google for Startups Cloud | **$200,000 in credits, or up to $350,000 for AI-first startups** (Seed to Series A). $2,000 pre-funded tier | Rolling | Directly offsets the Gemini portrait pipeline, which is billed through Google Cloud. Faster with a referral from an affiliated VC or accelerator — **BGA and Bybit are worth testing as the referring relationship** |
| AWS Activate | Realistically **$1,000**, "select participants may qualify for additional credits up to $5,000". The $200,000 Portfolio tier is hard-gated on an Org ID from an accelerator/angel/VC | Rolling | Requires an AWS account on a Paid Tier Plan. **The tier cannot be upgraded retroactively — get an investor Org ID before applying** |
| Anthropic Claude for Startups | Credits — **amount unpublished**. Do not put a figure in any plan | Rolling | Gate is "received equity funding from institutional investor". Unlike Google, **no Web3 carve-out is published** — an SCF grant or token raise is not institutional equity. Scoring axes named on the terms page: business traction, funding, depth of Claude integration |
| Stripe startups program | Fee credits and special pricing. No dollar value published | Rolling | Stripe is already in the stack. Eligibility says "venture-backed businesses that are just getting started". Fastest route is the existing Stripe account team, asking about startup credits and the Partner Program in one thread |

---

## E. Payments, stablecoin and impact

| Program | Money | Status | Notes |
|---|---|---|---|
| **Circle Developer Grants** | **$5,000–$100,000 USDC**, milestone-released | Rolling, via `circle.questbook.app` | Criteria: "Strong platform alignment", "Exceptional teams", "Traction and path to success", "Ecosystem impact" — and the page's own "evidence of usage, pilots, partnerships, revenue" is exactly the axis Token Tails wins on. **Blocker is platform alignment: Circle wants Arc integration and Circle products as meaningful components.** Arc mainnet went live 2026-09-16 with BlackRock, Visa and DTCC as founding validators and USDC as native gas — the freshest major mainnet in the window, and it needs consumer volume. Lead with the shelter payout rail, not the game. First 2026 batch skewed African and global-south markets — real-world-impact framing is visibly rewarded. ⚠️ **Circle Wallets do not support Stellar at all**; applying as-is scores ~2–3%. Related and live: **Arc Microgrants — 20 × $500 USDC, submissions close 2026-10-14 23:59 ET**, excludes "testnet-only builds" |
| Circle Alliance Program | **No money.** Directory listing, networking, Circle team support | Rolling | Three criteria Token Tails nearly meets today (live solution on Circle's platform, supports USDC/EURC, stablecoin-ecosystem service provider). Costs an hour, and it is the cheap prerequisite relationship the money routes care about. `onboarding.circle.com/signup/alliance` |
| Circle Ventures — Arc Builders Fund | Undisclosed, **equity** | Rolling deck submission | Thesis verticals are always-on markets, offchain assets and credit, FX, agentic commerce, energy and compute. A charitable-disbursement consumer app is in none of them |
| Circle Foundation "Unlocking Impact" | **Up to $100K USDC**, single prize at a live pitch event | ⚠️ **Effectively dead for 2026.** The Foundation is a donor-advised fund at Fidelity Charitable with no public application route; its 2026 activity was invite-only grants to two US CDFIs. **2026 edition not found.** 2025 winner announced 1 Oct 2025 (ATEC Global; finalists BUFI, Xcapit) | Best-matched program for the repositioned pitch — the one place where the impact story and the stablecoin payout mechanism are the *same* story. Both the Circle and Goodwall landing paths 404. Monitor `circle.com/circle-foundation` and the pressroom |
| Giveth — "Stellar Community Growth" QF round | **$50,000** matching pool across **68 projects** (mean ≈ $735) | Round ran 2026-09-21 → 2026-10-04. **Roster locked — no entry route** | Ineligible for this round. QF maths rewards donor *count*, not donation size — which makes 542k users an unfair advantage in any round Token Tails can actually enter. Track `forum.giveth.io` for the next Stellar round |
| UNICEF Venture Fund | Up to **$100K equity-free** + 1 year mentoring; up to $400,000 growth funding, in USD and/or cryptocurrency | Rolling; the thematic Blockchain call closed 2026-03-10 | **Fatal: the applicant must be registered in a UNICEF programme country. Lithuania is an EU high-income state and is not one.** Also requires open-sourcing under an OSI licence. Killed on geography |
| Visa Fintech Fast Track | No grant, no cash. Commercial partnership terms | Rolling | **Two hard blockers: must have raised at least $3M, and must be "new to card issuance."** The whole program is built for card issuers. Killed |

---

## F. TGE-adjacent capital (TGE set to 2026-11-19)

None of these were verified as deeply as the grants — they are rolling commercial relationships with
no published terms, so the numbers must be asked for directly.

| Route | Structure | Notes |
|---|---|---|
| **Legion** (`legion.cc`) | MiCA-compliant ICO underwriter. Token-dilutive, no equity. "30+ completed sales", "$450M+ in committed demand" | Most TGE-relevant item found. The **"Legion Score" allocates to users by on-chain activity and reputation** — which rewards exactly what Token Tails has: a large real user base rather than a speculative one. Curated: "top 2–3% of reviewed submissions". Backed by VanEck, Kraken, Coinbase. Apply at `projects.legion.cc/apply` |
| Kraken Launch | Exchange-hosted sale **with the listing attached** — normally the most expensive thing a project buys at TGE | Completed sales named: Squid, Sport.Fun, YieldBasis. Apply route is a Kraken listings service desk portal that requires an account. Kraken is also a Legion backer, so the two may be complementary |
| CoinList / Passage | Token sale. "85+ raises, $1.2B+ raised, 12M+ verified investors" | **Momentum concern:** visible sale cadence looks thin since Feb 2026, and Passage's newer positioning leans to RWAs and tokenised equities. First question to ask them: what has closed since February |
| Fjord Foundry | **Permissionless LBP.** Price discovery by auction; no allocation committee | The one launch route that **cannot reject you** — valuable as a credible BATNA when negotiating with Legion, Kraken or CoinList. Brings no distribution, no listing, no marketing. **Pre-check whether it supports Stellar/Soroban at all or needs a bridged EVM representation** |
| Echo / Sonar | Not an application route — access is via group leads | Frequently mis-listed as a launchpad. The relevant half is **Sonar**, which lets a project host its *own* public sale against its existing users rather than renting a platform |
| Flowdesk | Market maker. **Loan + call-option or retainer** — non-dilutive at signing | EU-headquartered (French), which matters for a Lithuanian counterparty. Published evaluation axes include "Regulatory Status", which favours a MiCA-clean EU issuer. Short intake form with a "Token Project" company type |
| GSR | Market making **bundled with capital** — "liquidity provision, market strategy, and capital" in one intake | One of the few makers that openly advertises capital alongside liquidity. Supports issuers "from launch through growth", so the TGE itself is in scope |
| Keyrock | Market making, options desk, on-chain liquidity | Belgium-based. Materially less public information than Flowdesk or GSR; no issuer-specific intake form. Use as a third quote to put the other two under price pressure |

**A market-making agreement must be signed and the maker onboarded to exchanges *before* the token
trades.** Eight weeks is tight for a three-way quote.

---

## G. Free money with no competition

Easy to overlook because it is not a grant.

| Item | Value | Effort |
|---|---|---|
| **Apple App Store Small Business Program** | **15% commission instead of 30%** on paid apps and IAP for developers at or under $1M proceeds in the prior calendar year. EU alternative-terms developers get a further reduced 10% on subscriptions after year one | **Enrollment only — no evaluation, no competition, no deadline.** Be the Account Holder, accept the latest Paid Apps agreement (Schedule 2) in App Store Connect, enroll, and declare all Associated Developer Accounts. ⚠️ Collective proceeds across *related* accounts must stay under $1M |

---

## H. Killed — do not re-check

Each of these was verified dead, closed, or structurally disqualifying. Recorded so the research is
not repeated.

**Categorically excluded:**
- **NVIDIA Inception** — "Companies associated with cryptocurrency" is a verbatim exclusion on NVIDIA's own page.
- **Microsoft for Startups (Founders Hub)** — two blockers: stated audience is "B2B startups", and without an investor referral code you never reach the evaluated application at all ("you go directly to Azure account creation").
- **Google for Startups "Start" tier** — "Founded within the last 24 months"; Token Tails has shipped since April 2024.
- **UNICEF Venture Fund** — applicant must be registered in a UNICEF programme country.
- **Visa Fintech Fast Track** — $3M raised floor plus "new to card issuance".

**Chain or ecosystem mismatch:**
- **Superteam Earn build bounties** — Solana-ecosystem by construction; Solana was deliberately removed in March 2026. Re-adding it for a median $500 bounty is value-destroying. (The listings JSON is still useful as a *monitoring* example.)
- **Logos λPrize** — the "$500,000" headline is spread across micro-bounties of $400–$1,200 for privacy infrastructure. Total product mismatch.
- **Base Builder Grants** — not an application program. Nomination-only, "responses are not guaranteed", recipients found through ecosystem monitoring and social discovery.
- **Base Batches 004** — confirmed closed; the "Q1–Q2 2027" next round was invented, not published.
- **Outlier Ventures Base Camp** — the single open cohort is DeAI / DeFi / RWA / DePIN. All gaming Base Camps are archived. No track to apply to.
- **BNB Chain MVB** — the headline $500K belongs to the closed EASY Residency; MVB publishes no cheque and needs a BNB deployment.
- **Prezenti (Celo) Anchor + Frontier Pools** — live banner reads "We are currently closed for applications. Season 3 has concluded."

**Dead, vapor, or unreachable:**
- **a16z CSX** — portal frozen on "CSX Application Spring 2025".
- **28DIGITAL** — the only published cut-off (2026-09-08) has passed; second date unpublished; plus a likely fatal "incorporated within the last 5 years" gate.
- **Ronin grants pages** — every grants URL 404s or is an empty Notion shell; the only source is a 20-month-old blog post. *(Proof of Distribution is a separate, live program — see section C.)*
- **Somnia Dream Catalyst** — page exists, but `/apply` and `/faq` both 404 and Somnia's own docs never mention it.
- **Sui Hydropower** — accelerator page is an unreadable Notion redirect; the parent page states Sui is "connecting serious founders with meaningful, long-term support — not grants".
- **X1 EcoChain** — no mainnet exists; roadmap still says "TGE & Mainnet" Q3 2026; grant program 12 months overdue; no named team.
- **Asentum** — the live site says "Incentivized Testnet · coming soon"; the specific XP and multiplier figures circulating do not appear on the cited page.
- **ETHGlobal Mumbai** — no reachable event page (`/events/mumbai` 500s, `/mumbai2026` 404s), no published prize pool, no deadline. The "$375,000" comparable circulating for it is scraped from the **April 2023** Tokyo archive.
- **Arbitrum "Foundation Grant Program $20K–$150K rolling"** — no such program on the live page; the figure comes from a third-party database.
- **Robinhood Chain $1M** — real, but it is the funding *source* behind the Arbitrum Founder House and Buildathon prizes. Counting it separately double-counts $1,000,000.

**Killed in round two (2026-09-23/25):**
- **GameTech Accelerator Vilnius** — dormant; funding instrument closed with the RRF plan on 2026-08-31. See §B.
- **Lithuanian foreign-event travel subsidy, 2026** — ≥€2,000 filed revenue floor. See §B. Revisit July 2027.
- **Gitcoin Grants** — no GG25. The GG25 proposal is stamped "WITHDRAWN"; the canonical round history ends at GG24; Grants Stack and Grants Lab were sunset 2025-05-27.
- **Quest platforms (Zealy, Galxe, Layer3, TaskOn)** — they **bill** apps, they do not pay them. Zealy: "does not fund community rewards". Galxe Business+: $999–1,699/month billed annually.
- **Binance Alpha / Binance Wallet Exclusive TGE** — supported chains are Solana, BNB, Ethereum, Base, Arbitrum, Robinhood Chain. **Stellar is not supported.** Alpha also asks for 2–5% of supply.
- **Bybit direct listing** — ~$150–250k fee (usually in tokens) + $100k+ security deposit; 8–12+ week process that cannot close before Nov 19. Route through BGA instead (§I).
- **OKX Jumpstart** — apply route live, no visible 2026 sales.
- **MEXC** — $60–110k+ all-in. A purchase, not funding.
- **PetSmart Charities** — verbatim: "unable to fund … for-profit organizations, or organizations or programs that operate outside the U.S. and Canada."
- **Petco Love, Maddie's Fund, Banfield Foundation** — US 501(c)(3) or municipal only.
- **EA Animal Welfare Fund** — farmed and wild animals only; treats companion-animal work as out of scope.
- **Companion Fund II (Mars / Digitalis)** — animal-health and veterinary thesis; a token would very likely be disqualifying for a corporate-strategic.
- **Leap Venture Studio — investment seat** — Cohort 11 thesis is pet healthspan science. (The **Impact Seat** is live — see §I.)
- **UNLEASHED by Purina** — closed 2026-09-11. **Calendar the next window (~July 2027)**: the cleanest pet-sector eligibility match found (Europe-based, B2C, founder full-time, MVP; up to CHF 50,000 project funding).
- **DMCC Crypto Centre, in5 Tech** — discounts and desks, not cheques.
- **QFC Digital Assets Lab** — regulatory sandbox, no money.
- **Startup Qatar, Qatar FinTech Hub, K-Startup Grand Challenge, Start-Up Chile, Parallel18, Astana Hub** — wrong fit, closed, or requires local incorporation/relocation for small sums.
- **Cyberport CIP and Blockchain Pilot Subsidy** — requires a Hong Kong entity, ≥51% founder control and a resident authorised representative.
- **InvestHK Global Fast Track 2026** — closed 2026-09-25.
- **Stellar × CV Labs Accelerator (EMEA)** — closed 2026-07-03; DeFi/payments/RWA only. Watch for a 2027 cohort around Meridian.
- **CV Labs Batch_08** — waitlist only; 6% equity + token side letter for $115k cash.
- **Outlier Ventures Base Camp (Post Web) / FutureSpark Riyadh** — DeAI/DeFi/RWA/DePIN only.
- **UNDP SDG Blockchain Accelerator 2026** — applicants are UN Country Offices and UN entities.
- **Nouns DAO** — treasury-preservation mode; the main proposal interface (Nouns Camp) carries a shutdown notice for 2026-09-30.
- **Sfermion, Merit Circle, Lightspeed Faction** — dormant, wrong instrument, or wrong size as leads.

---

## I. Round-two additions

### I.1 Already yours — the Blockchain for Good Alliance relationship

The live BGA domain is `chainforgood.org` (`bga.global` fails TLS). Token Tails holds the **Ascend
Incubation** track, per BGA's own February 2026 announcement, and "is expected to complete the
incubation cycle and graduate at the BGAwards in November 2026."

| Entitlement | Source | Status to verify |
|---|---|---|
| **"$50K USDT in Direct Equity-free Grants"** | `chainforgood.org/incubation`, Ascend benefits | ⚠️ **Published package, not a confirmed Token Tails entitlement.** Token Tails' Feb 2026 release names only undisclosed "grant funding" + 5,000 MNT; the standard track is "up to 10,000 USDT, distributed in milestones". Ask what is owed |
| **"$1 Million in Liquidity Support from Bybit"** | Same page | **Shape unknown.** The 2024 Ascend precedent (EthicHub) was a **"Bybit Pool" of lending capital at 8% over 15 months** with quarterly reporting — not a grant. Get it in writing |
| Legal advisory, "brand development at 10+ events", "1M+ marketing impressions" | Same page | Unclear |
| **BGAwards 2025 Incubation Growth Stage, 1st place — $30,000** | BGAwards 2025 results (Copenhagen, 4–5 Nov 2025) | Confirm received |
| **5,000 MNT from Mantle** | Feb 2026 announcement | Confirm received; Mantle Scouts follow-on ($10–50k) is 30–45% with a delivered milestone |

- **Route in:** BGA's Executive Director (also Bybit's Head of Events & Sponsorship), by email or
  on a call. The incubation page publishes only a chat-app contact, so ask for an email address
  through `chainforgood.org` first. Do not use the public application form — Token Tails
  is already inside.
- **Silence is the failure mode.** BGA has published nothing featuring Token Tails since
  2026-03-19. The Feb 2026 release's "800 cats" figure is seven months stale.
- **Chain mismatch:** Bybit Web3 Wallet supports ~30 chains; **Stellar is not one**, and Bybit does
  not list Stellar as a USDC network. A Mantle USDC checkout path (2.5–3 eng-days) fixes this and
  makes BGA's published Mantle claim true.

### I.2 Pet-sector funding that actually accepts a for-profit

| Program | Money | Deadline | Chance | Notes |
|---|---|---|---|---|
| **Leap Venture Studio — Impact Seat** (Mars Petcare, TAW Ventures, Michelson Found Animals) | No cash, no equity. Full 12-week accelerator + Mars/Michelson network + brand/marketing services | **2026-10-18** | 10–18% | Open to "non-profits and for-profits with impact-focused missions". Past Impact Seats: BestyBnB (Cohort 8), Petcademy (Cohort 9) — both shelter/foster infrastructure. Apply via the Impact Seat Typeform linked from `leapventurestudio.com`; email first to confirm for-profit eligibility. 2 weeks in person in the US |
| **Pet Care Innovation Prize 2027** (Purina + Active Capital) | **$25,000** × 5 + **$25,000** grand prize, non-dilutive, no equity | **2026-10-06** | 3–7% | Hard gate: **"$100,000 or more in annual revenue from the product or service you're pitching"** and legally able to travel/work in the US. 2026 cohort: ~200 applicants for 5 slots. Categories skew to food, litter, diagnostics |
| Boost Capital Partners / Ani VC | Seed equity ~$50–250k | Rolling | 2–5% cheque; 10–20% meeting | The only pet-sector investors whose thesis touches consumer engagement. Ani VC: `hq@ani.vc` |

### I.3 Lead investors — the equity path that fires two matching pools

A qualifying lead unlocks the **SDF Matching Fund** (1:1, $200k–500k) and potentially **Coinvest
Capital** — a Lithuanian sovereign co-investment fund (ILTE), up to **€2M per company**, €13.08M dry
powder, that invests alongside a private lead plus accredited angels.

| Fund | Cheque / stage | Recent relevant lead (≤12 months) | Route | Chance to signed lead (6 mo) |
|---|---|---|---|---|
| **1kx** (Berlin) | $250–750k typical; led $1.2M pre-seed for Giggles in 2026 | Portfolio includes Pudgy Penguins, Moonbirds, Orange Cap Games, Voya Games | Contact form; portfolio-founder intro | **12–20%** — best thematic fit |
| **FIRSTPICK** (Vilnius) | "€100k–€500k initial; up to €1M follow-on" | 49 companies since 2022; thesis "AI-first software" | **Open 4-minute form, 48-hour decisions**; Baltic founders only | 8–15% |
| Practica Capital (Vilnius) | Pre-seed to A; co-led €2M seed for kopa.ai in 2026 | Eneba in portfolio | Warm intro via LitBAN / Startup Lithuania | 6–12% |
| Inovo (Warsaw) | "€0.5m–€4m first tickets"; Lithuania named in scope; B2C mandate | — | LinkedIn outreach to the consumer partner (their stated route) | 4–8% |
| BITKRAFT | Led $3M for Power Protocol (London) Feb 2026 | Web3 gaming, Europe | Warm intro only | 5–10% |
| Fabric Ventures | Co-led CUB3 $6.5M A (with BITKRAFT), Strider $5.5M seed (with Makers) | Earn Alliance | Warm intro; bridge between BITKRAFT and Makers | 5–9% |
| Seedcamp | New $320M fund (June 2026); leads €2–3M | Sorare in portfolio | Open "Pitch Us" form | 3–6% |
| Makers Fund | Fund IV $250M (Aug 2026); led Cheer Games $4.5M pre-seed (Barcelona, Mar 2026) | No blockchain-native lead found | Via Play Ventures (co-investor, more approachable) | 3–7% |
| 6th Man Ventures | "$2–5M on average", consumer-crypto specialists | Pump.Fun, Football.Fun | Cold email with Dune link in line one | 3–6% |
| Variant | Reported $750k–1.5M seed; "consumer crypto with retention metrics" | — | Their site invites cold email | 2–5% |

### I.4 Regional programs worth a look

| Program | Package | Deadline | Chance | Cost |
|---|---|---|---|---|
| **Hub71+ Digital Assets** (Abu Dhabi) | Up to **AED 750,000 (~$204k)**: AED 250k incentives + AED 250k SAFE + AED 250k top-up | **Feb 2027** (Cohort 21; programme Sep 2027) | 20–35% | ADGM tech licence; **at least one founder relocates long-term**. Bybit is UAE-headquartered, which makes the BGA award a local reference |
| Malta Enterprise Accelerate | Up to €100,000 grant | Rolling | 30–40% if set up in Malta | Maltese entity and substance; funds the cost of establishing there. Marginal |

### I.5 TGE-adjacent — round-two verification

| Route | Finding |
|---|---|
| **Bitget** | "There are no additional charges associated with listing on Bitget, including brokerage, application, evaluation fees." Spot + Launchpool + PoolX + Pre-market in one application. 35–50% spot; 15–25% PoolX pre-TGE. Confirm Stellar asset custody first |
| Kraken Launch / Kraken 360 | No fee. Accepts pre-TGE and post-mainnet projects. 10–20% before Nov 19; **30–40% for Q1 2027**. Needs legal opinion, audit, vesting, market maker (~$40–80k) |
| Legion | "Top 2–3%" selectivity. Realistic raise $500k–2M. 15–25% pre-Nov 19; **35–45% Q1 2027**. **Chain support is undocumented** — ask first |
| Coinbase Asset Hub | Free, no fee, no allocation. Coinbase already supports the Stellar network. <5% within 12 months. File it as a free option |
| KuCoin Spotlight | Takes gaming projects (Akedo). No verifiable project-side route or terms |
