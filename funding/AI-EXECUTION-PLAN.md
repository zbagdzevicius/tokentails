# AI execution plan — attacking all 25 options

Written 2026-09-25. Companion to `ALL-OPPORTUNITIES.md` (the list) and `PLAN.md` (the strategy).
Constraints applied: remote-only; grants and accelerators only; no BGA, Mantle, SCF or Giveth.

---

## 1. The operating model

One person plus AI can run all 25 options if the work is **built once and reused**, not written 25
times. Four principles do most of the work:

1. **One fact base, zero invented numbers.** Every figure an application uses comes from
   `facts/FACTS.md`, each with an ID, a source and a date. AI drafts cite fact IDs; any number
   without one is rejected. This matters more here than usual — the red team found the headline
   traction numbers come from SEI, not Stellar, and funders compare notes.
2. **Rubric first, prose second.** Before drafting anything, AI extracts the funder's scoring
   criteria, limits, mandatory annexes and exclusion clauses into `call.md`. Every section of the
   draft maps to a named criterion.
3. **Separate drafter and reviewer.** One AI session drafts; a *separate* session, given only the
   rubric and the draft, scores it as a hostile evaluator. Two rounds, then a human read. This is
   the same draft → adversarial-verify pattern used for the research itself.
4. **Build once, submit many.** One Solidity `ShelterSplit` contract (splits USDC across
   registered shelter wallets, emits per-shelter events) feeds eight options across hackathons and
   ecosystem grants.

### What AI should and should not do

| AI does | A human does |
|---|---|
| Extract rubrics, limits and exclusions from call documents | Decide go/no-go on each option |
| Draft narratives, budgets, milestone plans, forms, Lithuanian translations | Sign-off on every number and every declaration |
| Write, test and security-review contracts and integrations | Deploy to mainnet; hold keys |
| Play the hostile reviewer; check character limits | Calls, relationships, forum presence |
| Triage new calls from the intel pipeline | KYC/KYB, notary, signatures |
| Produce deck and dossier text | On-camera video; hand-made art where a funder expects it |

### Guardrails

- **Never paste secrets, keys, `.env` values, bank data or personal data into AI prompts.** Redact
  before sharing documents. (Organisation policy, and a leaked key is already sitting in
  `contracts/stellar/soroban-nft/README.md` — rotate it first.)
- **Check each funder's AI policy.** EIT's FAQ warns evaluators will judge whether AI-assisted
  content "makes sense". Creative Europe's winning dossiers use hand-made key art and a named
  narrative lead — don't submit AI art there, even though the product itself uses AI.
- **One frame per funder, one set of facts for all.** The red team flagged four competing
  identities (settlement rail, AI entertainment, game studio, AI content studio). Keep a
  positioning matrix (section 3) so framing changes per audience but facts never do.
- **Contracts:** testnet first, full tests, an AI security-review pass, then a human review before
  mainnet. Keep mainnet balances minimal; ShelterSplit should never custody meaningful funds
  unaudited.
- **Token silence:** no $TAILS or TGE language in any grant application (SDF, EU and hackathon
  rules all penalise token promotion).

---

## 2. Workspace setup (do first — ~8 h AI-assisted)

```
funding/
├── facts/
│   ├── FACTS.md          # every number: ID, value, source link, date, chain
│   ├── BLOCKS.md         # reusable paragraphs per frame (see §3)
│   └── assets/           # logos, screenshots, architecture diagram, demo links
├── applications/
│   └── <program-slug>/
│       ├── call.md       # AI-extracted rubric, limits, annexes, exclusions, deadline
│       ├── draft.md      # the proposal, sections mapped to criteria
│       ├── review.md     # hostile-reviewer scores per round
│       └── submitted/    # exact text/PDFs sent, with date
├── TRACKER.md            # one row per option: status, next action, owner, date
└── prompts/              # the five prompts in §4
```

**FACTS.md must include, each sourced:** company legal form and registration (after the UAB
conversion), team and roles, product surfaces, **Stellar-only** on-chain metrics from the new Dune
dashboard, SEI-era metrics clearly labelled as such, revenue by rail, shelter partners and
disbursements with references, awards, and the three contract IDs with verification links.

---

## 3. Positioning matrix

| Frame | Used for | Lead with | Never mention |
|---|---|---|---|
| **Payout rail** — "USDC disbursement rail for animal-welfare organisations, with a consumer app generating the volume" | Colosseum, Arc, Circle, Dubai, Base, SDF Marketing, Mastercard | ShelterSplit on mainnet, named shelters, verifiable disbursements | $TAILS, NFT packs, loot mechanics |
| **Game studio** — "a Vilnius studio whose cat-rescue game shipped to 542k registered players" | Game3, Creative Europe, Beam, IMX, Team1, Ronin, Sonic | Playable build, art, shipped record, AI content pipeline | Token, NFT collection framing |
| **AI creative tech** | Game3 (AI content priority), Artizen, Women TechEU, EIC | AI generation pipeline, unit economics | Token |
| **High-throughput app** | SKALE SIP-6, MegaETH | Existing SKALE deployment, transaction history (labelled by chain) | Unlabelled cross-chain totals |

---

## 4. The prompt library (reuse for every option)

1. **Rubric extractor:** "From this call document, list every scoring criterion with its weight,
   every character/page limit, every mandatory annex, every exclusion clause, eligibility gates,
   and the deadline with timezone. Quote each verbatim with its section."
2. **Fit check:** "Given FACTS.md and call.md, list every gate Token Tails fails or cannot evidence.
   Default to 'fails' if unsure." → go/no-go input.
3. **Drafter:** "Draft section X to criterion Y using only facts from FACTS.md, citing fact IDs.
   Use the <frame> from BLOCKS.md. Stay under N characters."
4. **Hostile reviewer** (fresh session): "You are an evaluator for <funder>. Score this draft
   against call.md, criterion by criterion, as harshly as the real panel. List every unsupported
   claim, every missing annex and every sentence that reads as token promotion."
5. **Compliance pass:** "Check every limit, required heading, file name and annex against call.md.
   Output a pass/fail table."

Loop: draft → review → revise → review → **human read** → submit → save to `submitted/`.

---

## 5. The 25 options — AI play for each

Grouped into five tracks. Hours are AI-assisted, one person; shared setup is counted in §2 and §6.

### Track A — Build once, submit many (8 options)

The ShelterSplit build is the engine. **~20–26 h** for contract, tests, security review, deploys to
Arc plus one EVM chain, a demo page, and a README.

| # | Option | AI play | AI (h) | Date |
|---|---|---|---|---|
| 1 | **Colosseum World's Fair** | Build ShelterSplit in a public repo with commits inside Sep 14 – Oct 12; enter the Base or Robinhood Chain track *and* the Public Goods prize; AI drafts the submission and pitch script; human records the demo | build + 4 | **Oct 12** |
| 2 | **Arc Microgrants** | Deploy the same contract to Arc **mainnet** (testnet-only builds are excluded); AI writes the DoraHacks entry | 3 | **Oct 14** |
| 6 | Arbitrum Singapore buildathon | Only if the Arbitrum/Robinhood deploy exists by Oct 3; reuse the Colosseum write-up | 2 | **Oct 4** |
| 5 | **Arbitrum Dubai buildathon** | Same contract plus six weeks of added features (shelter registry UI, dashboard); AI updates the write-up | 3 + features | Nov 16 – Dec 6 |
| 8 | Circle Developer Grants | Extend ShelterSplit into the full Arc rail (Circle Wallets, Gateway, backend queue, admin UI, public dashboard); AI drafts the 4-milestone plan with one on-chain metric each | 50–70 | Submit Dec 2026 |
| 13 | Base Builder Grants | Deploy ShelterSplit on Base, publish the build, post it on Base/Farcaster channels; there is no application — visibility is the play | 3 | Rolling |
| 14 | Arbitrum DDA Gaming | Only if the Arbitrum deploy exists; AI drafts a ≤$50k milestone proposal for a gaming feature on Arbitrum; human checks allocator fit first | 6 | Until exhausted |
| 17 | Team1 Avalanche Mini Grants | Deploy ShelterSplit on Avalanche C-Chain; AI fills the mini-grant form | 4 | Rolling |

### Track B — Quick rolling forms (8 options, ~15 h total)

Batch these in one or two sittings in week 1. AI drafts from BLOCKS.md; human submits.

| # | Option | AI play | AI (h) |
|---|---|---|---|
| 3 | **Game3 Grants** | Game-studio + AI-content frame ("AI-powered game content generation" is a named priority) | 2 |
| 4 | **SKALE SIP-6** | AI drafts a forum post on topic 848 arguing consumer-app throughput belongs in "high-throughput applications", with SKALE-labelled transaction data | 1 |
| 16 | Sonic Innovator Fund | BD intake form; AI drafts a migration-volume projection (clearly labelled as a projection) | 2 |
| 18 | Beam Foundation | Application form with a milestone plan for a Beam deployment; decide deploy only if they reply | 2 |
| 19 | IMX Developer Incentives | Google Form; AI drafts the go-to-market section; no build unless they engage | 1 |
| 20 | MegaETH Mega Mafia | Google Form, high-throughput frame | 1 |
| 22 | Mastercard Start Path | Payout-rail frame; AI checks the "seed raised + revenue" gate first — likely a no | 1 |
| 24 | Artizen Fund S7 | Open in a browser; AI summarises the Season 7 rules into a go/no-go in 30 minutes | 0.5 |

### Track C — Large written proposals (5 options)

Where AI saves the most time. Each gets the full rubric → fit check → draft → two hostile reviews →
human loop.

| # | Option | AI play | AI (h) | Date |
|---|---|---|---|---|
| 7 | **SDF Marketing Grants** | Scoping email first (1 h). Then AI builds the costed media plan (CAC, CPA, projected Stellar wallets, WAA lift, D30 retention, month-by-month budget) from real historical spend, plus narrative, reconciliation note and token-firewall memo. Human owns the CAC numbers and records the video. **User-acquisition scope only** | 50–70 | Submit after the TGE |
| 9 | **Creative Europe MEDIA** | Set a Portal alert now. AI drafts the ~70-page Part B, GDD, budget table and financing plan against the scoring grid (Innovation 15, Quality 25, Originality 10). **Human-contracted** narrative lead and hand-made key art — do not use AI art here. Needs the UAB + non-publishing NACE code and a sales report from one Token Tails game | 60–80 | ~Jan–Feb 2027; internal deadline 7 days earlier |
| 10 | Women TechEU 2 | **Only if** a woman co-founder holds CEO/CTO. AI drafts the eligibility-strand answers; weekly Tuesday cut-offs make it a cheap test | 10–15 | Jan 14 2027 |
| 11 | Eurostars Call 12 | AI drafts the R&D scope and a partner-search one-pager; the human finds a partner in a second Eurostars country (EEN, Innovation Agency Lithuania) — that is the real bottleneck | 40+ | Mar 4 2027 |
| 12 | EIC Accelerator | Probe only: AI drafts the Step 1 short proposal (~8 h) around the AI pipeline as the technical core; stop if Step 1 returns NO-GO | 8 (probe) | Rolling |

### Track D — Community-governed funding (1 option)

| # | Option | AI play | AI (h) |
|---|---|---|---|
| 23 | Nouns DAO | Probe: AI drafts a proposal candidate (e.g. a nounish cat line with shelter payouts); human posts on the Nouns forum and canvasses for a sponsor. Stop if no sponsor in 3 weeks — the DAO is in treasury-preservation mode | 3 (probe) |

### Track E — Monitor, don't build (3 options)

| # | Option | AI play | AI (h) |
|---|---|---|---|
| 15 | Ronin Proof of Distribution | Rewards come from real NFT volume on Ronin, so a thin deploy earns little. AI drafts a one-page port assessment; revisit only if a Ronin partner appears | 1 |
| 21 | Superteam | Solana-only. Add the listings API to the intel pipeline with an AI filter for chain-agnostic bounties | 0.5 |
| 25 | Lithuanian travel subsidy | Blocked in 2026 by the €2,000 filed-revenue floor. AI drafts a note for the accountant on booking FY2026 revenue in the applicant entity; calendar July 2027 | 1 now, 4 in 2027 |

---

## 6. Calendar

| Week | Work | AI (h) |
|---|---|---|
| **Sep 26 – Oct 2** | Workspace + FACTS.md + BLOCKS.md; shared prerequisites (Dune dashboard, key rotation, contract verification); **Track B batch** (#3, #4, #16, #18, #19, #20, #22, #24); start ShelterSplit on testnet; SDF Marketing scoping email | ~45–55 |
| **Oct 3 – 9** | ShelterSplit tests + AI security review + human review; deploy to Arc and Base/Robinhood/Arbitrum mainnet; #6 only if deployed by Oct 3; Colosseum draft | ~20 |
| **Oct 10 – 16** | **Submit #1 Colosseum (Oct 12)** and **#2 Arc (Oct 14)**; deploy to Base (#13) and Avalanche (#17); EIC Step 1 probe (#12) | ~15 |
| Oct 17 – 31 | Creative Europe: rubric extraction when the call publishes, hire narrative lead and artist, story bible; Nouns probe (#23); #14 if Arbitrum is deployed | ~20 |
| Nov 1 – 19 | SDF Marketing media plan (don't submit yet); Creative Europe GDD; **TGE window — no submissions** | ~30 |
| Nov 16 – Dec 6 | **#5 Dubai** on the extended ShelterSplit; start the Circle rail (#8) | ~25 |
| Dec | **Submit #7 SDF Marketing** and **#8 Circle**; Creative Europe dossier v1; #10 if eligible | ~60 |
| Jan 2027 | **Submit #9 Creative Europe** a week early; #10 full proposal by Jan 14 | ~40 |
| Feb – Mar 2027 | **#11 Eurostars** by Mar 4 if a partner is found | ~40 |
| Jul 2027 | #25 travel subsidy with FY2026 accounts | ~4 |

**Total if all 25 are attacked:** ~300–360 AI-assisted hours over six months (~40–45 working days
for one person), front-loaded into October. **Without the three expensive long shots** (#11
Eurostars, #12 EIC beyond the probe, #23 Nouns beyond the probe) it drops to ~250 h.

---

## 7. Tracking and review cadence

- **TRACKER.md**, one row per option: status (researching / drafting / in review / submitted /
  won / lost / parked), next action, date, link to the application folder.
- **Weekly 30-minute review:** AI summarises tracker changes and new calls from
  `INTEL-PIPELINE.md`; the human decides go/no-go on anything new.
- **After every decision (won or lost):** record the reviewer feedback in `review.md` and feed it
  into BLOCKS.md. Rejections are the cheapest training data you will get.
- **Kill rules:** stop any option after its fit check fails, after two hostile-review rounds score
  it below the funder's threshold, or after three unanswered touches over six weeks.
