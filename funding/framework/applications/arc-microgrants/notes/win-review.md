# Win review — Arc Microgrants (2026-09-28)

Short answer: we cannot prove this wins. Today it is **ineligible**. The program's only hard gate is
"Your project must be deployed and working on Arc mainnet at the time you submit"
(https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq), and
`tracks/a-build/deployments.json` is `[]`. We also have no public repo. The text fixes below remove
the false claims, but neither gate can be passed by editing text.

## Judge scores (two blind judges)

| Criterion | Judge 1 | Judge 2 |
|---|---|---|
| Gate: live on Arc mainnet | 0 (FAIL) | 0 (FAIL) |
| Gate: public repo + builder profile | 0 (FAIL) | 0 (FAIL) |
| C1 Relevance to Arc | 3/10 | 3/10 |
| C2 Technical credibility | 6/10 | 6/10 as code, 1/10 as submitted (no one can check it) |
| C3 Quality of what you built | 3/10 | 1/10 |
| C4 Worth taking further | 5/10 | 5/10 |
| C5 Promise over traction | 4/10 | 3/10 |
| Document hygiene | (flagged under C3) | 2/10 |
| Verdict | REJECT | REJECT |

Win probability from both judges: **0% as it stands**. With a deploy, a public repo and a builder
profile only: about 10–15%. With all human fixes below (live page, a named shelter that has agreed,
one real mainnet disbursement, an honest Arc-first text): about 30–40%.

## Benchmark (competition)

- Pool: 20 × 500 USDC (10,000 USDC). Window 2026-09-16 to 2026-10-14 23:59 ET, all decisions by
  2026-10-21. Review is **rolling and in batches**, and "microgrant counts may be adjusted". Slots
  can run out before a late entry is read.
- The field: at least 25 public repos call themselves Arc Microgrants entries about 12 days in
  (https://github.com/search?q=%22Arc+Microgrants%22&type=repositories). The judges' estimate is
  100–300 entries in total, so an average eligible entry has a 7–20% base rate.
- Direct competitors already **live on Arc mainnet** with frontends:
  - arc-split (https://github.com/fusae/arc-split) is a basis-point USDC splitter for 2–5
    recipients with a mainnet receipt.
  - splitpay-arc (https://github.com/chizzy0011/splitpay-arc) does percentage payouts plus escrow
    and was "Built for Circle's Arc Microgrants program via DoraHacks".
  - SharedArc / arcdrip (https://github.com/r4topunk/arcdrip) streams USDC to several recipients.

  ShelterSplit is at best the third or fourth splitter. The **shelter use case** is our only
  differentiator, so a real shelter payout is not optional.
- What the benchmark entry looks like: legwork (https://github.com/edycutjong/legwork). Its mechanism
  works only on Arc (USDC gas repaid from the deposit), it has dozens of mainnet executions, a live
  "#/judge" page, a demo video and 100% coverage. Arc's past hackathon winners solved real-world
  payment problems and shipped verifiable deployments. Circle has disqualified entries for format
  violations
  (https://www.circle.com/blog/meet-the-winners-of-our-first-usdc-openclaw-hackathon----and-what-we-learned).

## What was changed in the text (draft.md v3)

- Removed the leftover AI chat paragraph and the ```markdown fence with its second frontmatter.
- Summary and On-chain proof no longer claim the contract "is deployed and working on Arc mainnet".
  The On-chain proof now introduces the auto-filled deployment table and commits to submitting only
  after a deploy and a first real disbursement.
- Removed F-001 (542,000 users, unverified and self-reported) and the Stellar-traction framing from
  Traction. It now says plainly "none on Arc yet: this is a first proof", which fits "promise counts
  for more than traction". No SEI figures are used anywhere.
- Arc-specific content, sourced from https://docs.arc.io/arc/references/evm-differences:
  - "Arc's native token is USDC".
  - The native and ERC-20 USDC interfaces share one balance.
  - "Transactions finalize on inclusion", which gives a receipt after one confirmation.
  - "A value transfer to or from a blocklisted address reverts". The text now discloses the
    blocked-shelter batch revert and the mitigation (deactivate the shelter).
- Stated the trust model honestly: the owner picks the wallets, and shelters confirm their wallets
  publicly.
- The Solution section now separates what exists (the contract and its tests) from what comes next
  (the public page, then the app trigger and receipt). It no longer describes the receipt in the
  present tense.
- `fund check` passes. The remaining warnings are the mainnet deploy and the repo, both human work.

## Payout mechanics (how the 500 USDC actually lands)

1. Submit via the DoraHacks entry linked from the call page, with the live deployment link and the
   repo, **after** the mainnet deploy.
2. Screening for completeness and fit, then scoring in batches.
3. Only if selected: a private verification step for whoever receives the grant. This covers
   sanctions and restricted-jurisdiction screening. Pseudonymous submission is allowed.
4. The grant is paid **in USDC on Arc** to a wallet that can receive USDC on Arc. Have a
   team-controlled Arc address ready, not the ShelterSplit treasury, and write it down before
   submitting.
5. Every decision is issued by 2026-10-21. There are no milestones and no follow-up reporting.
6. Exclusion to watch: "work already funded by a Circle or Arc program". If
   `circle-developer-grants` funds ShelterSplit first, this entry becomes ineligible. Also, the rule
   is one submission per project.

## Human-only fixes, ranked (do them in this order, as early as possible, because review is rolling)

1. **Commit and push ShelterSplit to a public repo.** Push `funding/framework/tracks/a-build/shelter-split`
   to its own repo or to `zbagdzevicius/tokentails` under `contracts/arc/`. Set `repo:` in call.md,
   then re-run `fund a:build --slug arc-microgrants` so the evidence names a clean commit.
2. **Deploy to Arc mainnet.** Run `fund a:deploy arc mainnet`, simulate, then sign and broadcast
   yourself with a small USDC gas balance. Then run
   `fund a:record arc mainnet <address> --tx <hash>` and `fund a:verify arc mainnet`. Verify the
   source on the Arc explorer if it supports verification.
3. **Get one real shelter.** It must agree in writing to receive USDC on Arc, give its wallet, and
   publish that wallet itself (on its site or socials) so the trust model holds. Register it with
   `addShelter`.
4. **Run one real mainnet disbursement** (any small amount) with a memo, and keep the tx link for
   the submission.
5. **Build a minimal public page** that lists the registry and reads Disbursed events, and set
   `demo:` in call.md. Without it, C3 stays at 1–3/10.
6. **Add the public builder profile** (GitHub, X or Farcaster) to the DoraHacks form. It is a
   mandatory annex.
7. Optional: move ownership to a multisig, and record a short screen video of a disbursement.
8. Human-read `submission.md` next to the call, then submit on DoraHacks yourself. Aim for the week
   of 2026-10-05, not the deadline.

## Honest odds

- As is: 0% (ineligible).
- After steps 1, 2 and 6: about 10–15%.
- After steps 1 to 6: about 30–40%. That is a plausible shortlist entry, not a likely win, because
  the splitter category is already crowded on mainnet.
