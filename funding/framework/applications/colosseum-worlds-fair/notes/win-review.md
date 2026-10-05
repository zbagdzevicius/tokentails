# Win review — Colosseum Crypto World's Fair (2026-09-28)

> **Status of the human fixes on 2026-10-05** (the scores below are from 2026-09-28):
> - H1 done: the repo is public, and build evidence shows 149/149 tests at a clean commit on `main`.
> - H2 open: Tempo, Arbitrum, Base and Robinhood are deployed on testnet, not mainnet. Mainnet is one
>   script now (`fund a:mainnet-plan --network mainnet`, then a person runs
>   `CONFIRM_MAINNET=yes wave/mainnet-all.sh`), not `fund a:record` per chain. The delivery-check fix
>   is still not applied.
> - H3 partly: Pink Paw is the named shelter, but Token Tails still holds its wallet.
> - H5 partly: `disburseWithMemo` pays each shelter with TIP-20 `transferWithMemo` and has a testnet
>   memo payout; no fee sponsorship.
> - H6 done: https://tokentails.com/shelter-payouts and the sponsored treat with receipts are live.
> - H8 partly: entering several tracks with one entry was confirmed by the user on 2026-10-03; whether
>   Tempo needs mainnet is still open.
> - H4, H7, H9, H10: open.

This review cannot show that the entry will win, and the evidence says the opposite. As of today
(14 days before the 2026-10-12 23:59 PT deadline), two blind judges and a benchmark researcher all
say it would **win nothing**. The text fixes below remove the false and overstated claims. They do
not change the verdict. Only the human fixes in the ranked list can change it.

## Judge scores (before the text fixes)

| Criterion (rules §8) | Judge 1 | Judge 2 | Main reason |
|---|---|---|---|
| Tempo integration depth (track filter, §14(f)) | — | 2/10 | Uses only transfer/transferFrom/balanceOf; no memos, fee sponsorship or MPP |
| C1 Functionality and code quality | 4/10 | 4/10 | Clean, tested Solidity, but not deployed, not integrated, not committed; open T6 receive-policy gap |
| C2 Potential impact / TAM | 2/10 | 3/10 | No market size; filed FY2025 revenue EUR 105 [F-022, unverified]; no shelter partner |
| C3 Novelty | 2/10 | 2/10 | Split and donation contracts are well-worn ideas (0xSplits, Endaoment, Giveth) |
| C4 UX via blockchain | 2/10 | 3/10 | The receipt and explorer link are not built; card-to-USDC.e flow and shelter off-ramp unexplained |
| C5 Open-source and composability | 4/10 | 4/10 | MIT, no deps, but no public repo; single-owner registry |
| C6 Business plan and team | 2/10 | 3/10 | Cost centre, not a business; Team names no people |
| Submission readiness | — | 1/10 | submission.md still said Base / Robinhood (fixed now) |

Both verdicts: **REJECT**. Judge 1: about 4% for any prize, under 1% for a main prize. Judge 2:
about 3% for a Tempo slot, under 1% for a main prize, and 10 to 15% for a Tempo slot if fixes H1 to
H5 all land.

## Benchmark

- Scale: 6,910 builders registered with two weeks to go (https://colosseum.com/hackathon). Frontier
  had 2,857 submissions (https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/).
  Cypherpunk had 1,576 (https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/).
  Expect about 2,000 to 3,000 here, all chains in one pool.
- Slots (rules §14, https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf):
  Grand Champion $30k, Public Goods $5k, University $5k (not eligible), 20 x $15k. Tempo:
  "$100,000 ... across 10". Arbitrum: "$25,000 ... across 5". The rules give no per-place amounts.
  Do not use the "Tempo 1st $25,000" figure: a summariser made it up.
- Past winners were venture-scale products with working demos. Public Goods went to developer tools
  (Zoneless, Samui Wallet), not charity. No past winner was a single-purpose split or donation
  contract.
- Judging counts only in-window work: "products are judged only on the work completed between the
  competition's start and end dates" (FAQ). The app, users and Stellar history are prior work.
- Tempo competition: Tempo's own one-day MPP hackathon produced 43 projects
  (https://tempo-hackathon-projects.vercel.app/). Expect 150 to 400 Tempo-tagged entries, many
  built on MPP and memos.

## Realistic odds

| Outcome | As it stands | Text fixes only | Text + human fixes H1 to H5 |
|---|---|---|---|
| Tempo track slot (1 of 10, $100k pool) | ~1-3% | ~2-3% | ~10-15% |
| Arbitrum track slot (1 of 5) | ~1% | ~1% | ~2-3% (if one entry may enter two tracks) |
| Any main prize (20 x $15k) | <1% | <1% | ~1-2% |
| Public Goods / Grand Champion | <1% | <1% | <1% |

## Payout mechanics (if it wins)

- Prizes are paid in Phantom CASH stablecoin to the Team Leader's wallet (§14, §15(b)).
- Payment follows signed Prize Acceptance Documents and passed due diligence (§13). Due diligence
  will see the real revenue (F-022) and the real user count (F-001), so no claim may exceed them.
- Winners are announced by 2026-12-05 (§5). Main and track prizes can stack ("Track prizes are
  awarded in addition to the awards above", event page).
- The track prize split per winner is not stated. Assume $10k for Tempo ($100k / 10) and $5k for
  Arbitrum ($25k / 5) only as averages.
- Accelerator: the real upside is a Colosseum accelerator interview ($250k pre-seed). That goes to
  founders, which is why H4 (named team) matters.

## Text fixes applied (draft v2)

- Summary and Solution: pitched as a Tempo payout contract; buyer-side flow explained (card or IAP
  purchase, Token Tails ops wallet pays in USDC.e, memo carries the purchase reference); receipt link
  worded as a plan.
- Why Tempo: removed the false claim that any blocked shelter stops the whole payout. The draft now
  separates TIP-403 policies (atomic revert) from T6 receive policies (silent redirect), and states
  the pre-registration check.
- How it works: removed "deploys unchanged to Tempo, Arbitrum, Base, Arc and Avalanche" (it read as
  "not built for Tempo"). Stated the receive-policy limit and the planned delivery check.
- On-chain proof: no longer implies the addresses exist; pre-hackathon contracts are labelled prior
  work.
- Traction: disclosure line for pre-hackathon work (FAQ rule). F-001 marked company-reported.
  Removed "revenue that exists today". Added the BGA recognition [F-014], worded as the press release
  words it (no "1st place").
- Team: removed "a human reviews every mainnet deployment".
- Roadmap: added the delivery check and native TIP-20 memos as milestone 2; milestone 1 now needs a
  real payout.
- No SEI figures (F-003 to F-006) are cited anywhere. If one is added, say "weekly" and "on SEI",
  and give the 2025-11 peak (875,907 weekly transactions) and the March 2026 end date.
- submission.md regenerated: Tracks entered now reads Tempo (not Base / Robinhood).

## Ranked human-only fixes

1. **H1 Commit, push and make the repo public** (tracks/a-build/shelter-split plus a README with a
   prior-work disclosure). Set `repo:` in call.md and re-run `fund a:build --slug
   colosseum-worlds-fair` so the evidence shows 41 tests and a real commit. Without it the entry
   fails C1, C5 and the in-window rule.
2. **H2 Deploy to Tempo mainnet** (the commands are in notes/chain-decision.md). Apply the
   delivery-check fix first, or check every shelter wallet for a receive policy. Then run
   `fund a:record tempo mainnet <address> --tx <hash>`.
3. **H3 Get one named shelter with a wallet it controls, and send one real payout.** A letter or
   public post from the shelter, and a plan for turning USDC.e into euros (the off-ramp), answer C2
   and C4. Le Chat-Rivari (the Paris event, F-023 proposed) is an obvious first candidate.
4. **H4 Name the founders in Team,** with roles and one line of background each. Add the facts to
   FACTS.md first; the AI must not invent them.
5. **H5 Do real Tempo-native work:** send the payout with TIP-20 `transferWithMemo` using the
   purchase ID, and ideally add fee sponsorship so the ops wallet needs no fee token. Then move the
   memo claim from the roadmap into How it works.
6. **H6 Build the thin user-facing part:** one purchase in the app (test mode is fine) that calls
   disburse() and shows the explorer link on the receipt, or a public payouts page read from events.
7. **H7 Record both videos:** the pitch (2 to 3 minutes) and the product demo (at most 3 minutes).
   Judges watch the video first.
8. **H8 Ask in the Colosseum Discord** whether one entry can take both the Tempo and Arbitrum tracks,
   and whether Tempo needs mainnet. If only one track is allowed, enter Tempo only.
9. **H9 Confirm F-001 and F-022** (see facts/FACTS-proposed.md). Judges and due diligence will check
   them.
10. **H10 Apply FACTS-proposed.md** corrections to FACTS.md (F-003 to F-006, F-011, F-014).

If H1 to H3 are not done by about 2026-10-08, the honest call is to spend the remaining time on a
program that rewards existing traction, not in-window work.
