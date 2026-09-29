# Token Tails funding plan — Q4 2026 to Q1 2027

**Written 2026-09-25.** Built on two research rounds: 50+ agents, ~2,000 live fetches, 190+
opportunity claims, each attacked by an adversarial verifier. The evidence base is in
`OPPORTUNITIES.md`; the information-gathering system is in `INTEL-PIPELINE.md`.

> **Scope update (2026-09-25):** BGA, Mantle, all Stellar Community Fund programs and Giveth are
> not options for Token Tails, and funding lists are limited to grants and accelerators. Sections
> below that recommend them are superseded — the current list is `ALL-OPPORTUNITIES.md`.

---

## ⚠️ Read first — red-team findings (2026-09-25)

An adversarial review of this whole plan found five problems that override parts of it. The legal
items are research findings from public regulator pages, **not legal advice — confirm with
counsel this week.**

1. **MiCA white-paper deadline ~2026-10-21.** For a public crypto-asset offer, ESMA's MiCA Art. 8
   text requires the white paper to be notified "at least 20 working days before the date of
   publication". An airdrop is not automatically exempt — Art. 4 says a token is not "offered for
   free where purchasers are required to provide... personal data". For a Nov 19 TGE that lands
   around **Oct 21** (reviewer's calculation, excluding the Nov 2 holiday). **No part of this plan
   covered it.**
2. **Custodial wallets may need a CASP licence.** The Bank of Lithuania lists "custody and
   administration of crypto-assets on behalf of clients" as an authorised service, mandatory from
   2026-01-01, with a minimum review of 25 + 40 working days — it cannot be in place by Nov 19.
   Google Play is also reported to require EU custodial-wallet apps to prove MiCA licensing.
3. **The legal entity is an MB (mažoji bendrija), which cannot take investors.** MB members can only
   be natural persons. It cannot sign a SAFE, grant EIT's call option, or bring in a Matching Fund
   lead. Converting to a UAB costs roughly **€1,600–2,000 and about a month**. Its NACE code 58.21 is
   *publishing*, and Creative Europe states "Publishing companies are not eligible" — change it to a
   development code (e.g. 62.01) in the same conversion.
4. **The traction story is thinner than the deck.** The headline 324k MAU / 659k weekly
   transactions are **SEI-era peaks** (`dune.com/token_tails/sei`, Oct 2025 – Feb/Mar 2026); that
   dashboard's latest values are **154,161 weekly transactions and 39,652 weekly active wallets**.
   The iOS app shows **0 US ratings**; Google Play shows **1K+ downloads**. The 542k users are all-time
   registrations, and part of them came through the Telegram Mini App that was retired on
   2026-09-29; those accounts can no longer sign in. Never present 542k as a live audience. Lead with numbers that match their source and chain.
5. **The BGA "$50k + $1M" is the Ascend track's published package, not a confirmed Token Tails
   entitlement.** The Feb 2026 Token Tails release names only undisclosed "grant funding" plus
   5,000 MNT from Mantle; the standard incubation track is "up to 10,000 USDT, distributed in
   milestones". Earlier versions of this plan called the $50k "already yours" — that overstated it.
   The BGA relationship is still the warmest and cheapest item here; **ask what is actually owed**
   rather than invoicing for $50k.

**Two conflicts nobody had named:**
- **The SDF Matching Fund cancels every existing SDF grant.** Verbatim: "any existing SDF grants made
  to your company must be canceled prior to receiving a Matching Fund investment." Taking it would
  also wipe an SDF Marketing Grant.
- **SCF and SDF Marketing Grants block each other on overlapping scope.** An outstanding Marketing
  Grant makes the holder ineligible for an SCF award "for any project or deliverable that falls within
  the scope, whether directly or indirectly". Run SCF first; scope any Marketing Grant to user
  acquisition only — never the payout rail.

**Capacity:** the full plan is ~140–220 person-days after shared work. There are ~40 working days
to Nov 19. It is **3–4× over capacity.** The trimmed remote core below is what actually fits.

**Also missing:** a dead ERC-20 "TAILS" on Ethereum with ~3,650 holders (ticker collision), no
registered trademark, no US-person geofencing plan for the TGE, and the team's real headcount.

### The trimmed remote core — what fits in 40 working days

| Priority | Item | Why now |
|---|---|---|
| 1 | **Counsel this week:** MiCA white paper vs. moving the TGE, CASP exposure of custodial wallets, MB → UAB conversion + NACE change | The Oct 21 date and the licence question decide whether a Nov 19 TGE is legally possible at all |
| 2 | **BGA** — ask what is owed; graduation; Mantle follow-on | Cheapest item, warmest relationship |
| 3 | **SCF cap email + interest form** | One email decides 0 vs. 30 person-days |
| 4 | **Apple Small Business Program** | Self-serve: 15% instead of 30% App Store commission |
| 5 | **Reconcile metrics + Dune dashboard on Stellar** | Every application after this depends on it |
| 6 | FIRSTPICK form — but a SAFE cannot close until the UAB exists | Cheap signal; sequencing matters |
| Optional | Colosseum (Oct 12) / ShelterSplit | Only if an engineer is genuinely free — don't take them off items 1–5 |
| After TGE | SDF Marketing (user acquisition only) · Creative Europe (~Jan–Feb 2027, needs the UAB + NACE fix) · a16z off-cycle | — |

**Red-team portfolio number:** BGA 0.80 · SCF small ask 0.40 · HackMeridian prize 0.20 · SDF
Marketing 0.15 · Creative Europe 0.07 → **~92% if independent, realistically 85–90%** because three
are SDF decisions and share the same credibility risk. Grants alone do not clear 95%.

---

## 0. Remote-only shortlist (constraint set 2026-09-25)

The team can only pursue fully remote options. That removes a16z SPEEDRUN, Alliance, YC, Orange
DAO, Hub71, Leap Venture Studio, the Pet Care Innovation Prize, UNLEASHED by Purina, EIT C&C
(in-person kick-off and Demo Day), Arbitrum Founder House Singapore, and Meridian/HackMeridian. **None
of the high-probability items depended on travel**, so the portfolio still lands near ~90%.

| Date | Remote option | Money |
|---|---|---|
| Now | BGA Ascend — collect the published grant (email, calls) | $50k USDT |
| Now | Mantle follow-on (ship Mantle USDC checkout) | $10–50k |
| Now | Apple App Store Small Business Program | 15% vs 30% commission |
| Now | FIRSTPICK (4-min form, 48h answer) · 1kx · Practica · Inovo · Seedcamp | €100k–1M lead → SDF Matching + Coinvest |
| **Oct 4** | Arbitrum Open House Singapore **online** buildathon | $115k pool (poor fit: financial judging) |
| **Oct 12** | **Colosseum Crypto World's Fair** (online) — Base / Robinhood Chain / Arbitrum tracks + chain-agnostic main prizes | $30k grand, 20 × $15k, $5k Public Goods, Arbitrum $25k/5 |
| **Oct 14** | Arc Microgrants | $500 + Circle grant eligibility |
| **Nov 8** | SCF #46 — fully remote; do the relationship work in the Stellar Dev Discord and via a BGA email intro to SDF instead of Lisbon | up to $150k if cap exception |
| Nov 16 – Dec 6 | Arbitrum Open House Dubai **online** buildathon | $30k |
| Post-TGE | SDF Marketing Grants · Circle Developer Grants · Game3 · Bitget listing | $5k–150k each |
| Feb 2027 | Creative Europe MEDIA (new narrative title) | up to €200k |

**The combined build:** one Solidity `ShelterSplit` contract (splits USDC across shelter wallets),
deployed to Arc (Oct 14) and to Robinhood Chain or Base for the matching Colosseum track (Oct 12), then
reused for the Dubai buildathon. ~4–6 eng-days, all remote. Note: Colosseum's $250k accelerator for
winners is 12 weeks in San Francisco — take the prize, decline the residency.

---

## 1. The honest answer to "100% success"

No single application lands with certainty. Published acceptance rates for the programs you would
name first are brutal: a16z SPEEDRUN **<0.4%** (19,000 applicants, ~70 accepted), SCF #44 **26%**
(175 submissions, 46 awards), Circle ~20 grantees per cohort from an open global portal.

What *does* exist is a **portfolio where at least one award is near-certain** — and, better, a set of
money that is **already yours and uncollected**. Section 4 shows the arithmetic. The portfolio only
works if you first fix the three problems in section 2, because they are *correlated* failure modes:
each one would sink most applications at once.

**The highest-certainty award is not a competition.** It is the Blockchain for Good Alliance Ascend
relationship Token Tails already holds. BGA's incubation page lists a **$50,000 USDT equity-free
grant** in the Ascend package, but Token Tails' own announcement only mentions undisclosed grant
funding plus 5,000 MNT — so the first step is asking what is actually owed (see the red-team
section above).

---

## 2. Six facts that change the plan

These surfaced during research and override assumptions in the original brief.

### 2.1 SCF has already paid Token Tails $144,000 — the "$150k" is not available

The public SCF project page shows **SCF #26 $48,000 (awarded) + SCF #30 $96,000 (awarded) =
$144,000**. Two later asks — **#41 "Catnip Heist – 3D Game Co-op on Soroban" ($150k) and #42
"Token Tails Pet Care Platform" ($150k) — both failed at PRESCREEN**, the stage that checks core
eligibility.

The SCF lifetime cap is **$150,000 per project**, with case-by-case exceptions up to $300,000.
Headroom under the standard rule is **$6,000**. A third identical attempt is a third prescreen fail.

→ **SCF #46 is a cap-exception problem, not a writing problem.** One email to
`communityfund@stellar.org` decides whether it is worth 30 person-days or zero.

### 2.2 The on-chain numbers will not survive a reviewer's 60 seconds

Every crypto-native funder in this plan — SDF, Circle, BGA/Bybit, 1kx, any launchpad — will open a
block explorer. Today they find:

| Claim in the deck | What a reviewer finds |
|---|---|
| 659,000 weekly on-chain transactions | Sourced from `dune.com/token_tails/sei` (`extra/traction.md:18`) — the **SEI/SKALE era**, not Stellar |
| 324,000 monthly active on-chain users | Same source. Not reproducible on Stellar |
| Stellar production traction | Cat contract `CBHOJOPZ…`: **1,218,693 invocations** since 2025-01-12 (~14k/week). Genuinely strong. Blessing contract: **3** invocations. Pass contract: **5**. Deployer account: "Monthly: none" |
| Dune dashboard | `dune.com/token_tails` — **empty. 0 dashboards, 0 queries** |
| Contracts | All three **"Unverified"** on stellar.expert |

An unreconciled headline number is worse than a smaller true one — it taints every other figure in
the submission, and SDF, Circle and Bybit all compare notes. **1.2M mainnet invocations on a
consumer Soroban contract is already one of the larger numbers in the Stellar ecosystem.** Lead with
what you can hash.

### 2.3 Closed: the Telegram Mini App is retired

Decided 2026-09-29: Token Tails dropped Telegram from its goals and systems, so the Mini App ToS
question, its Stars payment rule and the TON-ecosystem route no longer apply. Nothing to decide.

### 2.4 The 2026-11-19 TGE collides with almost everything

| Collision | Why it matters |
|---|---|
| SCF #46 panel review **Nov 11–18** | Rules bar projects "primarily focused on promoting a specific token or … NFT collection". A reviewer who opens tokentails.com mid-review sees a token launch |
| SDF Marketing Grants | Excludes "encouraging investment in any digital asset" and anything promising "appreciation or return". A referral bonus paid in a fresh token is exactly that |
| a16z SPEEDRUN | Review window Oct 12 – Nov 1 plus 4–6 weeks lands directly on the TGE. SAFE needs a clean equity TopCo |
| Alliance ALL19 | 1:1 **token side letter** — the TGE fires before the Jan 11 program start |
| EIT Culture & Creativity | Standard, non-negotiable **3% call option** at nominal value; every future shareholder must accede |
| Lithuanian state aid (EIT, Inovacijų agentūra) | A live token sale disclosed in a de minimis application invites compliance review against a 20-working-day clock |
| BGA/Bybit | Arriving as a token launch turns a grant conversation into a listings conversation, which Token Tails loses on fee and audit grounds |

Several playbooks independently concluded the same thing: **grant money and the TGE want different
calendars.** See section 6 for the recommendation.

### 2.5 Round one got several things wrong — now corrected

| Item | Round-one claim | Verified reality |
|---|---|---|
| GameTech Accelerator Vilnius | "Rolling, €43k–104k, best effort-to-money" | **Dormant.** Site untouched since 2025-09-25. The money came from Lithuania's RRF plan, which closed **2026-08-31**. No successor call published |
| Lithuanian travel subsidy | "€7,000, near-certain" | Requires **≥€2,000 filed sales revenue** in the last financial year. Registry mirrors report the applicant entity's FY2025 sales revenue as roughly **€105**. Binary gate, no discretion. Also, §8 reads as **€3,500 per calendar year across both calls**, not per call |
| EIT Culture & Creativity | "No equity, up to €500k via RIS" | **3% call option, non-negotiable.** The €500k RIS tier is **4 slots** across ~22 countries. The 2027 cohort is **Fashion, Architecture and Audio-Visual Media only — gaming is explicitly deferred** |
| a16z SPEEDRUN | "Built for games" | SR006 had **1 game studio of ~60**. SR007 mapped **0 games, 0 crypto** of 29. 87% AI, >50% B2B |
| HackMeridian prize | "Unpublished" | Now published: **"Up to $30,000 in XLM across the Genesis and Scale tracks."** Meridian registration closes **Oct 9** |
| SDF Marketing Grants | "Up to $500k" | Ceiling, not distribution. Every one of the **7 named recipients** across four years is a payments/remittance/on-ramp fintech with an SDF BD relationship. Realistic modal cheque **$50–150k** |
| Stellar Matching Fund | "One $200k lead unlocks $500k" | 1:1 match. A $200k lead unlocks **$200k**. Only a $500k+ lead maxes it |

### 2.6 Warm relationships nobody was using

- **BGA Ascend** — already awarded (section 3, tier A).
- **Mantle** (Bybit's L2) already **committed 5,000 MNT** via the BGA announcement.
- **Mykolas Majauskas**, Bybit's Senior Director of Policy, is Lithuanian and a former chair of the
  Seimas Finance Committee. Spoke at BGA's own 2025 forum. The ask is an internal pointer and a MiCA
  sanity check, not money.
- **Sandra Persing**, Circle's VP Developer & Ecosystem Marketing, was previously DevRel lead at SDF.
- **Josh Lu**, GM of a16z SPEEDRUN, is the quoted partner on ACID Labs / Boinkers ($8M), a
  crypto-adjacent game in that portfolio.
- **Coinvest Capital** (Lithuanian sovereign co-investment, up to €2M per company) invests
  *alongside* a private lead — the same trigger as the SDF Matching Fund. **One qualifying lead can
  fire two matching pools.**

---

## 3. The scored opportunity table

**Size** = realistic cheque to Token Tails, not the headline pool. **Chance** = honest probability
assuming the work is done well. **Effort** = person-days. **Time** = to money in the bank.

### Tier 0 — Prerequisites. No money, but everything below depends on them

| # | Task | Effort | Unblocks |
|---|---|---|---|
| P1 | **Reconcile the on-chain numbers.** Publish a Dune dashboard in SDF's own vocabulary — Weekly Active Accounts, weekly transaction volume, stated baseline — naming every contract and account range counted. Drop or re-source every claim you cannot tie to a hash | 3–5 | Every crypto funder |
| P2 | **Rotate the RPC API key embedded in `contracts/stellar/soroban-nft/README.md`** (flagged in `docs/CONTRACTS.md:166`), fix the truncated `contracts/LICENSE` (`docs/CONTRACTS.md:154`), then publish and **source-verify all three contracts on stellar.expert** via `stellar-expert/soroban-build-workflow` | 3–5 | SCF open-source requirement, SDF, Circle, any audit |
| P3 | **TGE sequencing memo** — one page, counsel-reviewed. Section 6 | 1 + €2–8k counsel | SCF, SDF, a16z, Alliance, EIT, BGA |
| P4 | Closed 2026-09-29 (section 2.3) | — | — |
| P5 | **Fix SDF's ecosystem listing.** SDF's CMS files Token Tails as subCategory **"NFTs"**, countries **"United States", "Japan"**. Request "Consumer" (or "Gaming"), Lithuania/EU, and a description leading with custodial wallets for mainstream users and shelter payouts | 0.25 | SDF Marketing, SCF, Matching Fund |
| P6 | **Accountant: revenue booking.** Which entity holds Stripe, IAP and on-chain revenue, and what FY2025 actually shows. Not a grant tactic — a correctness question with personal liability attached if misstated | 0.5–1 | LT state aid, EIT, Pet Care Prize |
| P7 | **Name a second team member.** SCF rules require at least 2 individuals; the project page lists Team Size: 1 | 0.1 | SCF |

### Tier A — Collect what is already yours (highest certainty)

| Opportunity | Size | Chance | Effort | Time | Deadline | Verdict |
|---|---|---|---|---|---|---|
| **BGA Ascend — grant funding** (package lists $50k USDT; Token Tails' entitlement unconfirmed; standard track "up to 10,000 USDT") | $10k–50k | **~80% for *some* payout** | 12–15 | Q4 2026 | Target signed by Nov 8 | **DO FIRST — ask what is owed** |
| BGAwards 2025 Growth Stage 1st prize | $30,000 | Verify received | 0.1 | — | — | **CHECK** |
| Mantle — 5,000 MNT committed + follow-on | ~$5k + $10–50k | 30–45% follow-on | 3–5 | Q4 2026 | Rolling | **DO** (ship Mantle USDC checkout) |
| BGAwards 2026 graduation — stage, co-branded PR | Non-cash | ~85% | 3 + travel | Nov 2026 | Date/city unpublished — ask | **DO** |
| Bybit co-marketing / livestream via BGA | Non-cash | 40–55% | incl. above | Q4 2026 | — | **DO** |
| "$1M Bybit Liquidity Support" (Ascend) | Probably a **repayable** pool | 15–35% | incl. above | — | Get the shape in writing by Oct 18 | **ASK, DON'T MODEL** |
| **Apple App Store Small Business Program** | **15% commission instead of 30%** on IAP | ~99% if eligible and not enrolled | 0.5 | Next month | None | **DO TODAY** |

> The EthicHub precedent (2024 Ascend) matters: its "$1M from Bybit" was a **"Bybit Pool" of lending
> capital at 8% over 15 months** with quarterly reporting — not a grant. Expect the same shape. And
> Bybit Web3 Wallet does not support Stellar, which is why the Mantle checkout path matters.

### Tier B — Dated and worth doing now

| Opportunity | Size | Chance | Effort | Time | Deadline | Verdict |
|---|---|---|---|---|---|---|
| **SCF #46 Integration Track** | $6k as-is; up to $150k with a cap exception | **10–15% unconditional; 30–45% if exception granted** | 3–4 to test; 30–38 if go | Tranche 1 ~Dec | **Interest form ASAP; submit by Nov 8** | **TEST THE CAP THIS WEEK** |
| **Meridian + HackMeridian, Lisbon** | Up to $30k XLM pool (realistic Scale prize $5–12k). Real value: SDF relationships 2 weeks before SCF close | 25–40% for a materially warmer SDF relationship | ~10 on-site (2 people) + €2.4–3.2k | — | **Registration closes Oct 9.** Hack Oct 25–26, conf Oct 28–29 | **BOOK NOW** ($49 developer ticket) |
| **FIRSTPICK** (Vilnius) | €100–500k lead; up to €1M follow-on | 8–15% | 0.1 (4-minute form) | 48-hour decision | Rolling | **SUBMIT THIS WEEK** — cheapest real test of a Baltic lead |
| **Arc Microgrants** + ShelterSplit on Arc mainnet | $500 (20 slots). The point is Circle eligibility | ~40% | 4–6 eng | Nov | **Oct 14, 23:59 ET**. Excludes "testnet-only builds" | **DO** if an engineer is free |
| **Leap Venture Studio — Impact Seat** (Mars Petcare / Michelson) | No cash, no equity — 12-week program + Mars network | 10–18% | 1 | Q1 2027 | **Oct 18** | **APPLY** — email first to confirm for-profit eligibility |
| **Bitget** spot + PoolX listing | No cash. **No listing fee** ("no additional charges … including brokerage, application, evaluation fees") vs Bybit's ~$150–250k | 35–50% spot; 15–25% PoolX pre-TGE | 3–5 + $10–30k token audit | Pre-TGE | Rolling | **DO** if TGE stays Nov 19 — confirm Stellar asset support first |
| SKALE SIP-6 Growth Allocation | 288.75M SKL pool; criteria being written now | Unknown | 0.5 (forum post) | 2027 | Before the vote locks criteria | **POST ON FORUM TOPIC 848** — only zero-port-cost chain |

### Tier C — Large but conditional

| Opportunity | Size | Chance | Effort | Time | Deadline | Verdict |
|---|---|---|---|---|---|---|
| **SDF Marketing Grants** | Realistic $50–150k (ceiling $500k) | 15–30% after Meridian with P1/P5 done; lower cold | 55–75 for a competitive file incl. an SDP pilot | Q1 2027 | Rolling — **submit after the TGE**, not before | **PREPARE NOW, SUBMIT LATER** |
| **Lead investor → SDF Matching Fund + Coinvest** | Lead $200k–1M, matched 1:1 by SDF up to $500k, plus Coinvest up to €2M | Matching Fund 55–70% *once a lead signs*; lead itself 5–20% per fund | ~5 per fund | 3–6 months | Rolling | **RUN IN PARALLEL** — 1kx (12–20%), Practica (6–12%), Inovo (4–8%), Seedcamp (3–6%), Fabric (5–9%), BITKRAFT (5–10%) |
| **Circle Developer Grants** | $5–100k USDC, milestone-released | **2–3% as-is**; ~15–25% with a live Arc mainnet payout rail + 3 named shelters | 38–48 + €7–13k | Q1 2027 | Rolling | **CONDITIONAL** on Arc work |
| **Hub71+ Digital Assets** (Abu Dhabi) | Up to AED 750k (~$204k): 250k incentives + 250k SAFE + 250k top-up | 20–35% | 2 to apply; relocation if won | Late 2027 | **Feb 2027** | **CONSIDER** — at least one founder must relocate long-term |
| **EIT Culture & Creativity — Shape** | €100k (+€100k top-ranked) for a **3% call option** | ~5–10% *if* sector pre-cleared as Audio-Visual Media | 13–18 | 2027 | **Oct 12, 17:00 CEST** | **ONLY IF** the 3% option is acceptable and EIT confirms the sector in writing |
| **a16z SPEEDRUN SR008** | $500k for 10% ($5M post) + $500k follow-on + credits | 0.05–0.15% cold; perhaps ~1% with SF Tech Week (Oct 5–11) + an ACID Labs intro | 18–22 + $12–26k | Q1 2027 | Priority window **Oct 12 – Nov 1** | **LIKELY SKIP** — valuation, SF residency, TGE timing |
| Alliance ALL19 | $400k + $400k at $4M post + 1:1 token side letter | ~5% | 3 | Jan 2027 | **Nov 18** | **SKIP** unless the side letter is renegotiated in writing |
| Y Combinator W2027 | $500k | 1–2% | 3 | 2027 | **Nov 2** | **SKIP** — requires US/Canada/Cayman/Singapore parent |
| Pet Care Innovation Prize (Purina) | $25k–50k non-dilutive | 3–7% | 1–2 | 2027 | **Oct 6** | **ONLY IF** the pitched product has **≥$100k annual revenue** — hard gate |
| Creative Europe MEDIA Video Games (last round of 2021–27) | ~€200k at 60% (median award ~€200k; you fund 40%, ~€133k) | Baseline 13–17% (336 proposals for €10M in 2026); **5–10% for Token Tails** | 60–85 + €12–25k before submitting | 2028 | Call expected autumn 2026; deadline ~late Jan–Feb 2027 | **CONDITIONAL** — needs a new standalone narrative title (no puzzle/social), a UAB with a non-publishing NACE code, and a sales report from *one* Token Tails game earned by the applicant entity since 2023. Zero of 194 funded projects 2022–26 mention blockchain/NFT. Remote |
| Orange DAO OF3 | $100k uncapped SAFE + 2% | ~8% | 3 | 2027 | Rolling to Feb 10 | Low priority |
| Game3 Grants | $5–50k | 5–10% | 1 | Q1 2027 | Rolling | **APPLY** — one hour, chain-agnostic, "AI-powered game content generation" is a named priority |
| UNLEASHED by Purina | CHF 50k project funding | 8–15% when open | 1 | — | Closed Sep 11. **Next ~July 2027** | **CALENDAR** — cleanest pet-sector eligibility match found |
| Ronin PoD, Sonic FeeM, Arbitrum DDA | Retroactive/fee rebates/$50k | High *if* deployed | Chain port | — | Rolling | **DEFER** — each is a new chain |

### Killed — see `OPPORTUNITIES.md` §H and §I for evidence

GameTech Vilnius (dormant) · Lithuanian travel subsidy 2026 (revenue floor — revisit July 2027) ·
Gitcoin (no GG25; Grants Stack sunset) · quest platforms (they bill apps,
they don't pay them) · Binance Alpha / Wallet TGE (Stellar unsupported) · Bybit direct listing
($150–250k fee — route through BGA) · OKX Jumpstart (dormant) · PetSmart Charities, Petco Love,
Maddie's Fund, Banfield (US 501(c)(3) only) · EA Animal Welfare Fund (farmed animals only) · Companion
Fund II (animal health) · DMCC, in5, QFC (bills, not cheques) · Qatar, KSGC, Start-Up Chile,
Parallel18, Astana · Cyberport (needs HK entity + resident rep) · Global Fast Track HK (closed Sep 25)
· Circle "Unlocking Impact" (no 2026 edition) · UNDP SDG Blockchain Accelerator (UN entities only) ·
Stellar × CV Labs (closed Jul 3; DeFi/payments/RWA only).

---

## 4. The portfolio arithmetic

Pick items whose failure modes are as independent as possible, and whose prerequisites are P1–P7.

| Item | P(win) — conservative |
|---|---|
| BGA Ascend $50k tranche | 0.65 |
| Mantle follow-on grant | 0.30 |
| SDF Marketing Grants (post-TGE) | 0.15 |
| SCF #46 (unconditional) | 0.10 |
| Arc Microgrant | 0.30 |
| Game3 | 0.05 |
| FIRSTPICK lead | 0.08 |
| 1kx lead (6 months) | 0.12 |

P(all fail) = 0.35 × 0.70 × 0.85 × 0.90 × 0.70 × 0.95 × 0.92 × 0.88 ≈ **0.10**

**P(at least one cash award or lead) ≈ 90%** on conservative numbers. Using each playbook's
with-playbook estimates instead (BGA 0.80, Mantle 0.40, SDF 0.25, SCF 0.15, Arc 0.40) pushes it to
**~96%**.

**The caveat that matters:** these are not independent. The on-chain reconciliation problem (2.2)
and the TGE collision (2.4) hit SDF, SCF, Circle, Mantle and BGA together. If P1 and P3 are not done,
the real number is far lower than 90%. **The prerequisites are what decorrelate the portfolio** —
that is why they come first.

Adding the non-grant money raises the floor further: the Apple Small Business Program (~99% if
eligible and not already enrolled) is not a grant, but it is cash, and it has no gatekeeper.

---

## 5. Calendar — every hard date between now and March 2027

| Date | Event | Action |
|---|---|---|
| **Sep 25–26** | — | Send the four day-one messages (section 7) |
| Sep 28 | Arc Demos & Meetup, London | Optional — only if pursuing Circle |
| Oct 1 | Arc Technical Office Hours, online | Optional |
| Oct 5–11 | SF Tech Week (a16z speedrun events); SR007 Demo Day Oct 6 | Only if pursuing SPEEDRUN |
| **Oct 6** | Pet Care Innovation Prize closes | Only if ≥$100k revenue from the pitched product |
| **Oct 9** | **Meridian registration closes** | Buy the $49 developer ticket before this |
| Oct 9 | SCF go/no-go | No written cap answer by now = treat as no |
| **Oct 12** | EIT C&C closes · Colosseum closes · SPEEDRUN window opens | EIT only if pre-cleared |
| **Oct 14** | Arc Microgrants close | Submit ShelterSplit if built |
| Oct 18 | BGA: target $50k first tranche signed · $1M shape answered in writing | Escalate via Bybit policy contact if not |
| **Oct 18** | Leap Venture Studio Cohort 11 (Impact Seat) closes | Apply |
| **Oct 25–26** | HackMeridian, Lisbon (Scale track) | Build the open-source, verified NFT standard + SDP rail |
| **Oct 28–29** | Meridian, Lisbon | Meetings: SCF program lead, SDF CMO, DevRel, Matching Fund |
| Nov 1 | SPEEDRUN priority window closes | — |
| Nov 2 | YC W2027 on-time deadline | Skip |
| **Nov 8** | **SCF #46 submission closes** | Submit only if the cap exception is granted |
| Nov 11 | Lithuanian travel subsidy closes | Blocked by revenue floor |
| Nov 11–18 | SCF #46 panel review | **Keep TGE messaging off public surfaces** if submitted |
| Nov (TBD) | BGAwards 2026 — Token Tails graduates | Ask BGA for the date and city now |
| **Nov 18** | Alliance ALL19 regular admission | Skip unless side letter renegotiated |
| **Nov 19** | **$TAILS TGE** (as currently coded) | See section 6 |
| Dec–Jan | SDF Marketing Grants · Circle Developer Grant | Submit post-TGE |
| Jan 14, 2027 | Women TechEU full proposal | Only if a woman co-founder holds CEO/CTO |
| **Feb 2027** | Hub71 Cohort 21 · Creative Europe games call (expected) | Decide by December |
| Mar 4, 2027 | Eurostars Call 12 | Needs a foreign consortium partner |
| ~Jul 2027 | UNLEASHED by Purina · Lithuanian travel subsidy (FY2026 revenue) | Calendar now |

---

## 6. The TGE decision

This is the founders' call, not the research's. The trade-off, stated plainly:

**Keep 2026-11-19.** You get the token live and the Bitget/Legion/market-maker routes open.
You accept that SCF #46 is a coin flip you have lost twice, SDF Marketing waits until Q1, a16z and
Alliance are effectively off, and EIT's call option must be modelled against the cap table.

**Move it to Q1 2027.** Grant season (Oct–Nov) runs cleanly: SCF review without a token on the
homepage, BGA's $50k closes as an impact grant, Meridian meetings happen without a launch in the
background, and the market-maker and launchpad work gets the 8–12 weeks those processes actually
take (Kraken and Legion both scored themselves at roughly double the odds for a Q1 sale vs. a
pre-Nov-19 one). Bybit's own listing process is quoted at 8–12+ weeks — it cannot close before
Nov 19 regardless.

**Recommendation: move it**, or at minimum decouple — ship the token later and keep every grant
surface (site, X, apps, decks) free of token messaging from Oct 1 until the SCF panel review
ends Nov 18. Several independent research agents reached the same conclusion from different
programs.

---

## 7. The first 72 hours

Ordered by leverage per hour. Every item here is under half a day.

1. **BGA** — email the contact on `chainforgood.org/incubation` (ask for an email address if only
   a chat handle is listed). Four lines: the current cats-funded / euros-disbursed number, that Token Tails is the Ascend project
   graduating at BGAwards, a request for the 2026 date and city, and a request for 30 minutes. **Do
   not ask for money in this message.** Then write the one-page **Ascend Entitlement Memo**
   (published entitlement / received / requested / by when) and send it 24 hours before the call.
2. **SCF** — email `communityfund@stellar.org`: $144k received across #26 and #30; #41 and #42
   prescreen-failed; two questions — are all #30 deliverables recorded complete, and is a
   case-by-case exception above $150k available for a submission scoped as shelter-disbursement
   infrastructure (Stellar Disbursement Platform + Bridge) rather than a game? Then file the SCF #46
   interest form, Integration Track, **disclosing the $144k in your own words**. `extra/architecture.md`
   is already written as an Integration Track document — trim it, don't rewrite it.
3. **Meridian** — buy the $49 developer ticket; apply to HackMeridian's **Scale** track with travel
   support requested. Registration closes Oct 9.
4. **FIRSTPICK** — the 4-minute form on `firstpick.vc`. A 48-hour answer on whether a Baltic
   institutional lead is achievable at all.
5. **Apple** — check whether the account is enrolled in the App Store Small Business Program. If not,
   enroll (declare all Associated Developer Accounts).
6. **Engineering** — start P1 (Dune dashboard) and P2 (rotate the README key, then verify contracts).
   These two feed every other application.
7. **SDF ecosystem listing** — submit the correction (P5). Two hours, disproportionate payoff.
8. **Accountant** — P6. Which entity carries the revenue, and what did FY2025 actually file.
9. **Founders** — P3. The TGE memo.

---

## 8. Per-target playbooks, condensed

Full playbooks (decision-makers, past winners, rejection causes, required artifacts, week-by-week
timelines) were produced for nine targets; the essentials are below.

### BGA Ascend + Bybit — "rescue infrastructure with a stablecoin payout rail"

- **Frame:** BGA's stated criteria (Director of Global Affairs, March 2026): "real world impact,
  scalability through blockchain technology, and the ability to onboard mainstream users." Answer in
  that order.
- **Replace the "800 cats" figure** in BGA's Feb 2026 press release — seven months stale — with a
  live, shelter-attested ledger: cats funded, euros disbursed, shelters paid, per month, with
  transaction hashes. Bybit pays for countable physical outcomes and then publishes them.
- **Artifacts:** Ascend Entitlement Memo · impact ledger with two shelter attestation letters ·
  `tokentails.com/impact` public page · 10-slide graduation deck (no tokenomics slide on stage) ·
  payout-rail one-pager.
- **Ship a Mantle USDC checkout path** (2.5–3 eng-days). BGA's announcement already implies Mantle
  powers payments; this makes it true, honours the 5,000 MNT, and gives Bybit Web3 Wallet a chain it
  supports.
- **Kill:** no reply within 5 working days → reallocate. No written answer on the $1M shape by
  Oct 18 → remove it from every model. Nothing signed for the $50k by Nov 8 → it is not coming pre-TGE.
- **Named contacts** (published on BGA/Bybit pages): Freya Chen (BGA Executive Director, also Head of
  Events & Sponsorship at Bybit), Glenn Tan (BGA Director of Global Affairs), Mykolas Majauskas
  (Bybit Senior Director of Policy), Joshua Cheong (Mantle Head of Product).

### SCF #46 — "Token Tails Settlement Rail (TTSR)"

- **Frame:** programmatic shelter disbursement on Stellar — SDP for batched USDC payouts, Bridge for
  the fiat leg into shelter bank accounts. **Not** a game, NFT collection or pet universe. Across 69
  consecutive awards in SCF #43 and #44, **there is not one game, not one NFT project, not one
  consumer-entertainment app.** The two closest precedents: Fewticket ($65k, #43) and Beamable
  ($150k, #38, titled "Onboard Game Devs with Beamable").
- **Gating artifacts:** a written cap answer · interest form · KYC refresh (the #30 KYC expires
  ~Q4 2026) · a second named representative.
- **Scoring artifacts:** trimmed `extra/architecture.md` · four-tranche budget tied to a committed
  on-chain metric · public MIT repo for `contracts/stellar/soroban-nft` with a carve-out in
  `COMMERCIAL_LICENSE.md` · **2–3 shelter letters of intent** — this is the real-world-use evidence
  that answers the NFT exclusion directly · SDP standing on testnet (Docker, Postgres, Twilio/SNS,
  distribution + SEP-10 accounts).
- **Do not use** the words game, NFT, play-to-earn or $TAILS on the form. Do not surface card packs,
  loot drops or the spinning wheel — rules disqualify anything that "facilitates gambling".
- **Kill:** no written cap exception by Oct 9 · #30 deliverables not recorded complete · SDP not on
  testnet by Oct 18 · no shelter will sign an LOI · **anyone proposes resubmitting as a new project to
  dodge the cap** (same entity, same KYC — it prescreen-fails and costs three rounds).
- Expected value if the exception is granted: roughly 40% × ~$60k ≈ $20–30k, mostly in 2027, for
  30–38 person-days. Worth it only with the exception.

### Meridian + HackMeridian — the relationship engine

- **One-line frame:** "A consumer Soroban application with 1.2 million mainnet contract invocations,
  building the on-chain disbursement rail that moves player spending to real animal shelters."
- **The hackathon build is the fix for your own weakness:** consolidate the three near-duplicate
  bespoke NFT crates into one open-source, event-emitting, source-verified contract on the
  OpenZeppelin Soroban standard, plus the SDP rail. The thing you build is the thing that otherwise
  sinks the SCF application.
- **Six meetings, one ask each:** SCF program lead (the cap question — get the answer by email
  afterwards), SDF CMO (who should see the Marketing Grants proposal), Head of DevRel (case study for
  consumer apps on Soroban NFT standards), Matching Fund team, Ecosystem Growth lead (Growth Hack
  Cohort 2 timing), one CV VC partner (their Demo Day is at Meridian).
- **Pre-work:** file the SCF interest form *before* Lisbon so every conversation is a warm follow-up
  on a live record. Ask BGA for a warm introduction to SDF — BGA and SDF are both partners in UNDP's
  SDG Blockchain Accelerator.
- **Leave-behind:** one printed page — invocation count with contract ID, Dune QR code, SDP diagram,
  the ask. No deck.
- **Kill:** rejected from the hackathon and no travel budget → run SCF and Marketing by email instead.
  No warm anchor by Oct 10 → one person, developer ticket, hackathon only.

### SDF Marketing Grants — "a consumer distribution channel for Stellar"

- **Frame:** "A consumer distribution channel that has put a custodial Stellar wallet into the hands
  of 542,000 mainstream users who have never used a blockchain, and a Stellar Disbursement Platform
  rail that converts card payments into USDC payouts to animal shelters." Quote SDF's own 2026
  strategy back at them — users who "will not know the asset is onchain".
- **Mission criterion** is where Token Tails is weakest: SDF's card reads "financial inclusion,
  sustainability, compliance, DEI and social responsibility." You cannot claim financial inclusion;
  you can claim social responsibility, evidenced by the BGA award and shelter ledger.
- **Artifacts:** Dune dashboard in WAA vocabulary · a one-page reconciliation note · verified contract
  source · **a costed media plan with CAC, CPA, projected new Stellar wallets, projected WAA lift,
  D30 retention and a month-by-month budget against a ~$150k ask** — written by someone who has
  actually bought app installs · a token firewall memo · a 2-minute no-seed-phrase product video.
- **Submit after both Meridian and the TGE.** Send a scoping email to `marketinggrants@stellar.org`
  in week 2 with the Dune link — if they route you away from consumer/NFT-adjacent, believe them.
- **Kill:** Dune WAA under ~5,000 → this is not winnable at any effort level (try Growth Hack's $20k
  instead) · the token cannot be firewalled from user acquisition · no in-house owner of paid
  acquisition who can hold a CPA target.

### Circle — "a USDC disbursement rail for animal-welfare organisations"

- **Criterion 1 is a gate, not a score:** "Arc is core to your flow of value, liquidity, or settlement
  and Circle products … are meaningful building blocks." Holding USDC on Stellar does not satisfy it.
  **Circle Wallets do not support Stellar at all.**
- **Minimum viable object:** a `ShelterSplit` Solidity contract on **Arc mainnet** (chain ID 5042,
  USDC is native gas) that splits USDC by basis points across registered shelter addresses and emits
  a per-shelter `Disbursed` event. ~150 lines; 4–6 eng-days. Ship it for the **Oct 14 microgrant**.
- **Funded analogues in the current cohort:** Flezpay (retail QR → USDC merchant settlement) and DAPL
  (merchant checkout → USDC treasury router). ViFi Labs was funded while still on Arc testnet — a
  credible in-flight integration can clear criterion 1 if the rest is strong.
- **Cheap first moves:** join the Alliance Program; open a Circle developer console account and start
  KYB now (queue time is the risk, not eligibility). **Do not apply for Circle Mint** — it is gated to
  vetted institutions and a decline goes on your record.
- **Kill:** no Arc mainnet rail with real disbursements to 3 named shelters by Nov 5 · KYB declined or
  stalled 6 weeks · Nanopayments unit economics don't hold for sub-cent splits.

### EIT Culture & Creativity — only if you accept a 3% call option

- **Track:** Shape (€100k). Scale requires ≥€200k secured from an institutional investor.
- **Frame:** "An AI content-production and creator-monetisation studio for character-led audiovisual
  media." Claim four Annex VI phrases: *ethical AI tools for content production*, *creator financing
  platforms* (the 40 influencer cats across 23 profiles is the most under-used asset in any
  application), *rights management and licensing*, *innovative monetisation models*. Never say "game".
- **Precedent:** The Fabricant (NL digital fashion, well-known NFT history) is in the funded
  portfolio. Fabler Kids is a Lithuanian venture in the same portfolio — a plausible referral.
- **Admissibility kills:** any section over its character limit is inadmissible, not penalised ·
  budget tab must match the confirmed funding type · PIC number required (register on the EU Funding
  & Tenders Portal today).
- **FAQ 2.24 discounts audience without conversion** — "a large following or strong social media
  presence without conversion" is explicitly insufficient. The revenue number decides this.
- **Kill (by day 3):** sector pre-clearance negative or silent · revenue won't score above "early
  revenues but weak growth" · no founder can commit full time in 2027 · counsel says the 3% option
  is incompatible with the cap table or token structure.

### a16z SPEEDRUN — likely skip, but if you go

- **Frame:** "A consumer AI entertainment company with its own distribution." Lead with distribution
  — a cohort full of $700k-ARR B2B agents has no users; you are the inverse.
- **Warm path:** ACID Labs (Boinkers) founders → Josh Lu. **Physical path:** SF Tech Week Oct 5–11,
  submit Oct 12 with "we met at your AI Faire" in line one.
- **Required:** a web guest-mode demo that loads cold in <5s with no wallet or login — the single
  highest-value engineering task if you pursue this.
- **Kill (decide in an hour):** $500k for 10% = $4.5M pre — if the answer is "we'd never sign that,"
  stop. Also: no clean equity TopCo separable from the TGE by Nov 1; no founder in SF most weeks
  Jan–Apr 2027; no warm intro and no Tech Week presence by Oct 12.

### Lithuanian travel subsidy — blocked this year

Filed FY2025 sales revenue must be ≥€2,000; registry mirrors show roughly €105. Verify the filed
statement in Registrų centras first. If it stands, **both 2026 calls are closed to Token Tails.**
Put July 2027 in the calendar and make sure FY2026 accounts show the revenue the business actually
earns. Still worth doing now: the **Hopohopo startuolis assessment** — it is reusable across
InoStartas, accelerator instruments and any future GameTech-style call.

### GameTech Vilnius — dormant

The funding instrument closed with Lithuania's RRF plan on 2026-08-31. Zero-regret moves only: email
the GameBCN program contact and the Inovacijų agentūra call administrator asking whether a successor
to call `02-113-J-0001-J07` is planned under the 2021–2027 ERDF; submit the still-live expression of
interest; add the site's WordPress REST endpoint and the esinvesticijos.lt calls page to the monitor
in `INTEL-PIPELINE.md`. Spend nothing further unless a call opens.

---

## 9. What not to do

- **Do not resubmit to SCF as a "new" project** to dodge the lifetime cap.
- **Do not lead any application with 659k weekly transactions or 324k on-chain MAU** until P1 proves
  them on Stellar.
- **Do not publish the contracts before rotating the README key.**
- **Do not apply for Circle Mint.**
- **Do not pay Bybit's ~$150–250k listing fee** — route through BGA, and use Bitget's fee-free desk.
- **Do not port to BNB or Avalanche for a grant.** The company has abandoned that pattern twice.
- **Do not add a second score write path** for any quest or rewards integration — scores go
  through `POST /user/catbassadors/live` only.
- **Do not spend founder time on the pet-industry charities** (PetSmart, Petco Love, Maddie's,
  Banfield) — all are US 501(c)(3)-only by their own published words.
