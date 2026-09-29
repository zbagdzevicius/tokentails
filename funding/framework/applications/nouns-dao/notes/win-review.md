# Win review — Nouns DAO proposal candidate (2026-09-28)

Short answer: we cannot prove this wins. As it stood (v2: 11.5 ETH, no sponsor), two blind judges put
it at **about 2%** and **about 3–5%**, and both said REJECT. The text fixes below remove the false
and weak claims and bring the ask down into the band where 2026 props passed. The text alone cannot
fix the two things that decide the result: nobody has sponsored it, and the DAO's voters have been
withholding quorum from outsider creative proposals.

## Judge scores (two blind judges, v2 draft)

| Criterion | Judge 1 | Judge 2 |
|---|---|---|
| C1 What the project is | 6/10 | 6/10 |
| C2 Proliferation of Nouns | 3/10 | 3/10 |
| C3 Funding needed | 6/10 | 6/10 |
| C4 Cost breakdown | 2/10 | 3/10 |
| C5 Success metrics and milestones | 4/10 | 5/10 |
| Sponsorship / eligibility gate | 1/10 | 1/10 |
| Fit with the DAO's current state | 1/10 | (covered under C3) |
| Verdict | REJECT, about 2% | REJECT, about 3–5% |

Fatal flaws both judges named:

1. No sponsor. sponsors.md shows zero asks sent. "Only Noun owners (Nouners) can submit official
   proposals to the DAO for funding" (https://nouns.center/funding/proposals).
2. 4 ETH (35% of the budget) went to building and auditing a custom splitter (ShelterSplit) when
   audited 0xSplits already exists on Ethereum mainnet (https://splits.org/protocol/docs/core/split/).
3. "Drawn by hand ... [F-019]" cited the OpenAI/Gemini AI pipeline, so anyone checking the source
   would read it as AI art passed off as hand-drawn.
4. The traction numbers were weak or wrong: 186,000 X followers (the pending correction is 181,010),
   a self-reported 542K users next to 1K+ verified Android downloads, and "1st place" wording that
   the BGA release does not use.
5. Governance context was ignored. See the benchmark below.

## Benchmark (as reported by the benchmark researcher; spot-check the links before posting)

- The DAO: Bankless and Yahoo (2026-04-23) report that a coalition "blocked quorum on legitimate DAO
  votes for creative experiments for months by intentionally not voting on them"
  (https://www.bankless.com/read/long-live-nouns-dao). Prop 955 set a 2.8 ETH auction reserve, and
  Prop 969 says "we've gone over two weeks without a single sale"
  (https://www.tally.xyz/gov/nounsdao/proposal/969). So the treasury has little auction income and
  quorum is about 184–191 votes.
- 2026 props that passed: 960 (13,000 USDC, noggles reef), 962 (20,000 USDC plus 1 Noun, from an
  insider), 965 (28,535 USDC, a resubmission from an established Nouns artist with line items and a
  profit share).
- 2026 props that failed on quorum despite a For majority: 946, 948 (4.8 ETH), 967, 975 and 978.
  Some came from proposers who had been funded before.
- The closest precedent: Prop 462 (Nouns Winter Shelter, 39,850 USDC) passed in an easier era. Its
  follow-up, Prop 572 (423,570 USDC), was cancelled.
- Winners in 2026 had these in common: USDC asks of $13k–$28.5k, a known proposer or resubmitter,
  line-item costs, and noggles placed where many people see them.
- Nouns Camp shows "Camp will be sunset on September 30, 2026" (https://www.nouns.camp/). Check
  which candidate UI is live before posting.
- A note on nouns.center: it still frames proposals as "10-1,000Ξ". A 13,000 USDC ask is below that
  range in ETH, but several 2026 props of that size went onchain and passed (960, 965). Expect
  someone to suggest small grants (https://nouns.center/funding/smallgrants). That is an acceptable
  fallback.

## What was changed (draft.md v3, budget.md, call.md)

- **Ask:** 11.5 ETH became **13,000 USDC** in three line items (art 6,000, integration 4,000,
  split setup/onboarding/reports 3,000). `budget_unit: USD`, and the bounds are now $1,000–$30,000.
  **The team must confirm these amounts.** They are a re-cost, not quotes. The old budget is kept
  under "Before" below.
- **ShelterSplit dropped.** The payout now uses an existing audited 0xSplits split on Ethereum
  mainnet. There is no contract-development line, and no text says a contract is live.
- **Payout mechanics made real.** The old "four milestone tranches" had no mechanism, and Nouns
  cannot escrow by milestone. The text now says: a 16-week USDC stream from the Nouns stream factory
  that either side can cancel, with unstreamed funds returning to the treasury. That matches
  `cancel() external onlyPayerOrRecipient` in https://github.com/nounsDAO/streamer
  (src/Stream.sol). It adds a self-cancel commitment if a milestone is more than four weeks late.
  **The team must confirm that commitment.**
- **Art honesty.** "Drawn by hand" is gone. The text now says the pipeline uses AI image generation
  [F-019] and commits to posting sample art with a note on which steps are AI and which are manual.
- **Traction.** X followers are now 181,010 [F-011]. F-001 is worded "company-reported 540K+" with a
  promise to post a dated export. The verified Stellar Cat contract figure, 1,218,693 invocations
  [F-007], leads. No SEI numbers are used.
- **F-014** now reads "named Token Tails its top 2025 incubation project", with no "1st place".
- **Success metrics** now include monthly reporting targets for six months: purchases, USDC
  distributed, card views and shelters paid. The text refuses to invent a sales target.
- A **Trust** risk was added: the payout is onchain, but the sales figure comes from our books.
- **Why this DAO** now cites the Prop 462 precedent. The "preservation mode" line was replaced with
  "little auction income right now".
- The team line no longer says handles are "listed in the forum thread", because no thread exists.
  It now says names will be posted before the proposal goes onchain.
- `d:export` was re-run and `fund check` passes (warning: F-001, F-011 and F-022 are still
  unverified).

### Before (v2 budget, for reference)

| Item | ETH |
|---|---|
| CC0 art | 3 |
| In-game integration | 3 |
| ShelterSplit deployment and security review | 4 |
| Shelter onboarding and reports | 1.5 |

## Payout mechanics (how the money would actually land)

1. Post the candidate (Discourse thread plus a candidate on a live Nouns client), then run
   `fund d:post nouns-dao --url <thread-url>`. The 21-day kill clock starts.
2. A sponsor or sponsors with enough Nouns voting power (reported as three Nouns) sign the
   candidate onchain. It becomes a proposal, then goes through the voting delay and the vote.
3. It needs a For majority **and** dynamic quorum (about 184–191 votes in 2026). Most 2026 failures
   had a For majority and failed on quorum.
4. After it passes: a queue/timelock, then execution. The proposal's transactions create a USDC
   stream through the stream factory, which is funded via the Payer/TokenBuyer path, so USDC may
   arrive asynchronously.
5. We withdraw vested USDC from the stream as it accrues over 16 weeks, into a team-controlled
   Ethereum address. **Decide which address before posting.** It is written into the proposal
   calldata and cannot change later.
6. If either side cancels, we keep only what has vested, and the DAO recovers the rest.
7. Our side: monthly 0xSplits distributions to shelter wallets, and a monthly forum report.

## Human-only fixes, ranked

1. **Get a sponsor before you post, not after.** Bring the draft to one or two active Nouners or
   Nouncil members in DMs or Discord calls. Log each ask with `fund d:log`. Without this the chance
   is effectively 0%. If nobody bites in 21 days, park the candidate. A realistic alternative is to
   co-propose with an established Nouns artist who draws the ten cats. That fixes the sponsor gap
   and the AI-art objection at once (the pattern behind Prop 965).
2. **Decide the art process and state it truthfully.** Either commission a named human (Nouns)
   artist for the art line, or accept that the art is AI-assisted and cut the art line
   substantially. Post sample art for at least two cats in the thread.
3. **Sign letters of intent with at least three named shelters**, each with its own wallet, and name
   them in the thread. The text now promises this before the proposal goes onchain.
4. **Name the team** (names plus X/Farcaster handles) in the thread. The text promises it.
5. **Apply the FACTS-proposed corrections** to facts/FACTS.md: F-011 to 181,010 (the draft already
   uses it), and the F-014 wording. Pull the F-001 DB export and post it dated, or remove F-001 from
   the draft.
6. **Confirm the re-costed budget** (13,000 USDC, three lines), the self-cancel commitment and the
   recipient address. Consider a small floor, such as the company guaranteeing a minimum USDC per
   month to shelters for six months. That answers "payouts may be a few dollars".
7. **Clarify iOS/Android revenue.** Say whether in-app-purchase sales of nounish cats still go to
   shelters if the payout wording is removed.
8. **Create the 0xSplits split** (it needs a wallet signature, so a person must do it) only after
   the letters of intent are signed.
9. Set `eth_usd` to the day's rate before exporting, and re-run `node bin/fund.mjs d:export nouns-dao`.
10. Build a Nouns presence first: post in Farcaster /nouns and the Discourse thread, and join a
    Nouncil call. A first-time proposer with no history is the category that fails quorum.

## Honest odds

- v2 as it was: about 2–5% (both judges).
- v3 text only (smaller USDC ask, no custom contract, honest art and metrics): about 5–8%. It is
  still gated on a sponsor and on quorum.
- After human fixes 1–6, with a sponsor who actively campaigns for votes: about 15–25%. That is a
  plausible pass in a hostile DAO, not a likely one. Small grants are the realistic fallback.
