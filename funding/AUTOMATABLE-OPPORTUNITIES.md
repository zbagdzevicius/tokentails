# Automatable opportunities (as of 2026-09-28)

> **Update 2026-09-28 (user decisions).** Taiko is excluded because it owes the team money, and
> everything Solana is excluded (Solana Foundation, Superteam, Solana bounties). The new bar is a
> realistic success chance **above 10%**. The rows below are kept for history. Each one now has a
> verdict in the last column, and the same verdicts are in `framework/portfolio/opportunities.json`
> (`SKIP` with the note "user excluded: …" or "below the 10% bar"). Only Drips (#14) and the
> Tenstorrent monitor (#19) remain. The items that clear the bar are in
> [HIGH-PROBABILITY-OPPORTUNITIES.md](HIGH-PROBABILITY-OPPORTUNITIES.md).

These are grants, prizes, bounties and competitions where AI agents can do most of the work. A
person only verifies identity, signs, records a short video and presses submit. Everything else is
research, build, test and drafting, which `fund` and `orc` can run.

What this list is and is not:

- **19 items, not 25.** Only 19 passed live verification. The research pool had more, and I did
  not pad the table with unverified ones. Rows 3 (huntr) and 19 (Tenstorrent) were checked from
  their listing pages only and not re-verified adversarially.
- **The EV figures are rough.** Most grants publish no per-grant amount, so a $5k to $10k ask is
  assumed where the Money column says "unpublished". The odds (P) are estimates. Treat the order
  as approximate, especially near the top.
- **Excluded by your rules:** VC or equity, matching funds, token sales, credits, in-person, BGA,
  Mantle, SCF, Giveth, Game3, and the programs already in the portfolio.
- **Dropped during research:** four Superteam Breakpoint bounties (they pay in-person tickets, not
  cash), Meta VR Start (needs a headset), NLnet (it refuses AI-written proposals), Sonic FeeM (fee
  sharing), GitHub Secure Open Source Fund (about 20 hours of live sessions), Sovereign Tech Fund
  (excludes user-facing apps), NEAR Protocol Rewards (no 2026 cohort) and Immunefi (unverified,
  very low odds per hour).

## Top opportunities

Human minutes cover every step a person takes, contingency included. The automation score (0 to
100) measures how much of the work agents can do.

| # | Opportunity | Deadline | Money (quoted) | P | EV | Human min | AI h | Auto | Repeatable | Path | Verdict (2026-09-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [Filecoin Open Grants](https://github.com/filecoin-project/devgrants) | Rolling | "Grants up to $50,000" (ask $5k in FIL) | 8% | $400 | 130 | 10 | 72 | Rolling, follow-ups possible | fund A + B | SKIP: below the 10% bar |
| 2 | [Taiko Grants, Cycle 3](https://taiko.xyz/grant-program) | "Applications open on an ongoing basis" | "$25 million in funding" (total; per grant unpublished) | 3% | $300 | 120 | 6 | 75 | One-off | fund A + B | SKIP: user excluded: Taiko owes the team money |
| 3 | [huntr Blind Trust challenge](https://huntr.com/challenges) | "32 days left" (about Oct 30) | "$15,000 pot" | 8% | $120 | 50 | 10 | 85 | Every 1-2 months | orc flow | SKIP: below the 10% bar |
| 4 | [YouCam VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/) | "November 2, 2026 (11:45 AM ET)" | "1st Place: $2,500", "2nd Place: $1,000", "3rd Place: $500" | 10% | $133 | 60 | 6 | 78 | One-off | orc flow | SKIP: below the 10% bar (10% is not above 10%) |
| 5 | [Algorand xGov (retroactive)](https://forum.algorand.co/t/algonaut-the-rust-sdk-for-algorand-xgov-proposal-3685107518) | Continuous | Proposer sets it, e.g. "Requested Amount: 128,000 ALGO" | 5% | $300 | 150 | 20 | 65 | Continuous | fund D | SKIP: below the 10% bar |
| 6 | [Solana Foundation Standard Grants](https://solana.org/grants-funding) | Rolling (about 3 weeks to decide) | "Milestone-based grants for public goods" (amount unpublished) | 3% | $300 | 150 | 16 | 65 | Rolling | fund A + B | SKIP: user excluded: Solana |
| 7 | [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/) | "October 30, 2026 @ 10:00am PDT" | "Grand Prize: $20,000", "2nd Place: $10,000", "3rd Place: $6,000", "Most Valuable Feedback: $100 each (10 winners)" | 1-20% | $180 | 90 | 8 | 72 | One-off | orc flow | SKIP: below the 10% bar (main prizes about 1%; the 20% upper end is the $100 feedback prizes, with no sourced entrant count) |
| 8 | [Tezos Foundation Grants (Gaming)](https://tezos.foundation/grants/) | Rolling (about 4 weeks review + 4 weeks paperwork) | Unpublished; "payments are usually structured along milestones" | 3% | $300 | 160 | 14 | 62 | Rolling | fund A + B/C | SKIP: below the 10% bar |
| 9 | [Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) | "Oct 23, 2026 @ 12:00pm PDT" | Alexa+ 1st "$25,000 cash + $15,000 AWS Credits"; Open Source "$5,000 cash" | 1.5-2% | $250 | 150 | 10 | 55 | Annual | orc flow | SKIP: below the 10% bar |
| 10 | [Starknet Seed Grants](https://www.starknet.io/grants/seed-grants/) | "you can apply for Seed Grants on an ongoing basis" | "up to $25,000 in STRK in non-dilutive funding" | 2% | $200 | 160 | 14 | 60 | One-off | fund A + B | SKIP: below the 10% bar |
| 11 | [The Graph Grants](https://thegraph.com/ecosystem/grants/) | Rolling | Unpublished | 3% | $150 | 120 | 8 | 65 | Rolling | fund A + B | SKIP: below the 10% bar |
| 12 | [Build With AI: Basics](https://learn-ai-basics.devpost.com/) | "Oct 26, 2026 @ 5:00pm EDT" | "First Place: $1,250", "Second Place: $750", "Third Place: $500" | 6% | $50 | 45 | 4 | 90 | Recurring series | orc flow | SKIP: below the 10% bar |
| 13 | [Superteam Earn agent bounties](https://superteam.fun/skill.md) | Rolling; Steve Agent Arena API close 2026-10-01T21:59:59Z | "500USDC Total Prizes" ($250 / $150 / $100) | 6% | $25 per bounty | 30 | 4 | 92 | Continuous | Track E + orc | SKIP: user excluded: Solana |
| 14 | [Drips Stellar Wave](https://www.drips.network/wave/stellar) | Wave 9 "Sep 23, 1:00 PM - Sep 30, 1:00 PM" | "Reward pool: $75,000" per wave, pro-rata | 60% per PR | $150 per wave | 180 | 20 | 45 | Monthly | orc + Track E (**constraint flag**) | KEEP (60% per merged PR; constraint flag still open) |
| 15 | [Expensify Help Wanted](https://github.com/Expensify/App/issues?q=is%3Aissue+is%3Aopen+label%3A%22Help+Wanted%22) | Rolling, first acceptable proposal | "[$250] …", "[$175] …" (price in title) | 8% per proposal | $20 per proposal | 240 | 3 | 40 | Continuous | orc flow | SKIP: below the 10% bar |
| 16 | [FLOSS/fund](https://floss.fund/faq/) | "evaluates applications at the end of every quarter" | "up to $100,000 in one year"; minimum "$10,000" | 0.5% | $50 | 60 | 1 | 88 | Quarterly | fund B | SKIP: below the 10% bar |
| 17 | [OpenCV AI Competition 2026](https://opencv26.devpost.com/) | "Oct 26, 2026 @ 11:45pm PDT" | "Grand Prize: $5,000", "Second Place: $3,000", "Third Place: $2,000" | 2% | $50 | 90 | 12 | 65 | Annual | orc flow | SKIP: below the 10% bar |
| 18 | [Superteam: Mermail Agent Skill](https://superteam.fun/earn/listing/build-and-demo-a-mermail-agent-skill) | API: October 7, 2026, 13:59 UTC | "500USDC Total Prizes" (250 / 100 / 50 / 50 / 50) | 3% | $12 | 45 | 2 | 70 | One-off | orc flow | SKIP: user excluded: Solana |
| 19 | [Tenstorrent tt-metal bounties](https://github.com/tenstorrent/tt-metal/issues?q=is%3Aissue+is%3Aopen+label%3Abounty+no%3Aassignee) | Rolling; 0 unassigned on 2026-09-28 | Past "$500" to "$35,000" per issue | n/a | n/a | 100 | 8 | 35 | Continuous | Track E monitor only | KEEP (monitor only, no P estimated) |

Flags you need to decide on:

- **Drips Stellar Wave (#14)** pays Stellar-ecosystem money but is not the Stellar Community
  Fund. Decide whether your SCF exclusion covers it before anyone acts on it.
- **Solana (#6):** excluded by the user on 2026-09-28. Do not apply.

Who gets paid:

- **An individual, not the MB:** Drips, Expensify (via Upwork), huntr (via Stripe) and Superteam.
- **The MB can enter:** the Devpost hackathons (through a representative) and most grants (KYB).
- **Volatile tokens:** Filecoin pays in FIL, Starknet in STRK and Algorand in ALGO.

## Agent plans (top 8)

1. **Filecoin devgrants: pinning module for cat-NFT metadata**
   - **Agents:** `fund new filecoin-devgrant --track A`. A research agent reads the proposal
     template and five recent issues. A build agent writes an MIT TypeScript pinning package using
     Lighthouse or Storacha, and wires it into `backend/src/cat/cat.controller.ts` behind a flag.
   - **Verify:** the package's `npm test` and the backend's `npm run lint && npm run build` pass,
     a testnet pin returns a CID, and `fund check filecoin-devgrant` passes.
   - **Human (about 130 min):** own the text, post the issue with `gh`, answer reviewers, then KYC
     and agreement if approved.
   - **Risk:** say that AI helped write it, so reviewers don't lump it in with the spam flood.
2. **Taiko: ShelterSplit redeploy with a donation front end** (SKIP: user excluded, Taiko owes the team money)
   - **Agents:** first confirm the Airtable form still accepts responses, and stop if it does not.
     Then check where ShelterSplit is already deployed, because Taiko must be one of the first
     platforms. Then run `a:build` (33 Foundry tests), `a:deployments` to Taiko with verified
     source, and `b:fill`.
   - **Human (about 120 min):** fund the deployer wallet and sign, review, submit, KYC/KYB.
3. **huntr prompt-injection challenge**
   - **Flow:** `orchestrator/examples/huntr-challenge-flow.json`. It waits at a gate until a
     person reads the rules and creates `RULES-OK`. Parallel sessions then try six attack
     families, logging each attempt to JSONL.
   - **Verify:** every success must replay twice. The package step drafts the findings.
   - **Human (about 50 min):** account, Stripe KYC, rules, submit.
4. **YouCam VTO: pet-and-owner accessory try-on shop that funds shelters**
   - **Flow:** `orchestrator/examples/youcam-hackathon-flow.json`, using Next.js with a mock
     mode and a mock shelter split.
   - **Verify:** `tsc`, ESLint, `npm test` and Playwright all pass. The package step writes the
     Devpost text, a video script and a checklist.
   - **Human (about 60 min):** register, record the video, submit as the MB's representative.
5. **Algorand xGov: retroactive ARC NFT and donation-split toolkit**
   - **Agents:** build and test on localnet, then run `fund d:export` and `d:clock`.
   - **Human (about 150 min):** mostly forum Q&A.
   - **Risk:** it is retroactive, so the build cost is lost if the vote fails.
6. **Solana Standard grant: Anchor donation-split program, SDK and Blinks widget** (SKIP: user excluded, Solana)
   - **Verify:** `anchor test` passes, a devnet deploy is live, and `fund check` passes.
   - **Human (about 150 min):** submit, due-diligence replies, KYC.
7. **Nebius x NVIDIA: cat-care agent on Token Factory with Tavily**
   - **Flow:** `orchestrator/examples/nebius-hackathon-flow.json`. It has a hard spend cap and
     writes `FEEDBACK.md` for the $100 feedback prizes, which are the realistic win here.
   - **Human (about 90 min):** account with a spend cap, video, submit.
8. **Tezos Gaming: Etherlink ShelterSplit and a game NFT hook**
   - **Agents:** use `next/dynamic` with `ssr: false` for the Phaser code, then run the C:plan and
     score loop.
   - **Human (about 160 min):** certify the metrics, answer the committee, paperwork, KYC.

## Wired into the tools

- **Portfolio:** rows 26 to 34 of `framework/portfolio/opportunities.json` hold Filecoin, Taiko,
  Algorand xGov, Solana, Tezos, Starknet, The Graph, FLOSS/fund and Tenstorrent. Each is `COND`
  with `condition_met: false`, so a person confirms it is live, remote and a cash grant, and that
  the payee is acceptable. Set `"condition_met": true`, then run `fund go --scaffold`. Superteam is
  already in the portfolio (row 21).
  **Since 2026-09-28** rows 26 to 33 are `SKIP` (Taiko and Solana are user excluded, the rest are
  below the 10% bar). Row 34 (Tenstorrent) stays `COND`, and row 35 (Micro Jam Ziva) is new.
- **Monitor:** 9 new sources in `framework/tracks/e-monitor/watchlist.json`, all fetched and
  confirmed on 2026-09-28:
  - Devpost's online-hackathon API
  - huntr challenge ids
  - Algora GitHub bounties
  - Tenstorrent bounties
  - Expensify Help Wanted issues
  - Filecoin devgrants commits
  - the Algorand forum RSS feed
  - the Taiko grant page (removed 2026-09-28, user excluded)
  - the Drips Stellar Wave page

  The Superteam agent API (`/api/agents/listings/live`) returned 401 without authentication, so I
  did not add it. The `superteam-listings` source was removed on 2026-09-28 (user excluded Solana).
- **orc flows:** the three flows above, each with a working verify step. All pass
  `orc flow <file> --dry`.

## Why these beat the current portfolio, and where they don't

By EV per hour, these do not beat the current portfolio's leaders. Colosseum is about $2,975 EV
for 7 hours, or roughly 0.14 human minutes per expected dollar. The new top items take 0.3 to 1
minute per dollar: Filecoin is 130 min for $400, huntr 50 min for $120, and YouCam 60 min for $133.

They win on three other things:

- **Nothing heavy stands in the way.** The big current items each need a costly human step. Creative
  Europe needs the MB converted to a UAB, Eurostars needs a consortium partner, Women TechEU needs a
  woman co-founder in a C-role, and SDF and Circle take 42 to 62 framework hours. The new items
  need about 1 to 2.7 hours of a person's time each, with no restructuring, partners or calls
  (except possible grant due-diligence calls).
- **Most of them repeat.** huntr runs every month or two, the Devpost API surfaces new hackathons
  every week, and Superteam, Drips and Expensify never stop. The same flow runs again at almost no
  extra human cost.
- **They don't depend on each other or on Colosseum.** They run in parallel orc sessions and pay
  within weeks to a few months.

The realistic combined EV of the top 8 is about $2,000. That is a modest sum and should not be
presented as more. It costs about 15 human hours in total, and every hour is a step only a person
can do.

Game3 is `SKIP` in `opportunities.json` (the funder appears deleted and the user excluded it).
