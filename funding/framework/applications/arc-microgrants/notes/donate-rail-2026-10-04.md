# Donate rail, 2026-10-04: what changed for Arc Microgrants

Additive note (do not paste as-is). The draft and submission.md belong to other sessions; use this when
revising them. Target submit date Oct 7; closes Oct 14 23:59 ET (Oct 15 06:59 Vilnius).

## New mechanics, mapped to the criteria

| Criterion | What is new | Where |
|---|---|---|
| C1 Relevance to Arc | "USDC is both the gas and the gift." A donor signs one EIP-3009 `ReceiveWithAuthorization` for Arc's own USDC; anyone (our relay) submits it; the DonateRouter pays ShelterSplit, which pays the shelter in the same transaction. On Arc the gas is USDC too, so no second token appears anywhere. Checked read-only on Arc testnet USDC (0x3600…): EIP-712 name "USDC", version "2", `authorizationState()` answers. | `shelter-split/src/DonateRouter.sol` (F1), `backend/src/shelter/onchain/donate-router.ts` |
| C2 Technical credibility | Two rules anyone can check on-chain: the router has no owner and pays every gift on in the transaction that brings it in, and it reverts if any wei would reach the treasury ([P-002], unverified until a router is deployed). The treat agent's spending limit is in a contract, not a prompt: CappedSpender reverts over its per-gift or per-day cap, to anything but ShelterSplit, or when the split's treasury share is not 0. | `src/CappedSpender.sol`, 26 forge tests; full shelter-split suite 144 tests green on 2026-10-04 (re-run `forge test` before citing) |
| C3 Quality of work | Forge suites for router and spender (fuzzed daily cap, rounding-dust treasury guard), Node tests for the agent, a reproducible local demo (`treat-agent/fork-demo.sh`). | `shelter-split/test/`, `treat-agent/test/` |
| C4 Worth taking further | One rail serves three givers: a player's sponsored treat ([C-004], [C-005]), a donor's one-signature gift ([P-003], unverified), an AI agent paying a shelter. Matching ([C-008], unverified) doubles a public gift with Token Tails' own money. | |
| C5 Promise | The campaign is concrete: [C-001] Pink Paw autumn rescue, 90 USDC by 31 Jan 2027. | `client/public/shelter-payouts/campaign.json` |

## 3-beat demo (under 60 s)

1. **Sign.** On /shelter-payouts, "Try it live" on Arc testnet: the donor signs one message (no gas
   token, no approve). Label on screen: test USDC, no real money.
2. **Land.** The explorer shows one transaction: router → ShelterSplit → Pink Paw's wallet, with the
   router's `RouterDonation` and the split's `NativeDisbursementBatch`/`DisbursementBatch` events.
3. **Guard.** Same signature against a split where Pink Paw is not 10,000 bps → `TreasuryShare`
   revert (forge test or testnet simulation), so no share of a donor's gift goes to Token Tails'
   treasury. Until the handover, Token Tails still holds the shelter's wallet key, and every page says so.

## Live, testnet, pending

| Item | State on 2026-10-04 |
|---|---|
| ShelterSplit, Arc testnet | live: 0x457c89e10a6e66633eda5bf82fd086febb5db147 (chain 5042002), Pink Paw at 10,000 bps, not paused (read today) |
| ShelterSplit, Arc mainnet | another session is deploying now; check `tracks/a-build/deployments.json` before citing an address. Arc excludes testnet-only builds, so the submission needs this |
| Sponsored treats (Token Tails' own money) | built; mainnet treats are allowed before handover because the money is Token Tails' own and disclosed |
| DonateRouter, relay, 1:1 match | built in this branch, not deployed; [P-002], [P-003], [C-008] are unverified |
| CappedSpender + treat agent | built and tested; demo on a local fork of Arc testnet only; testnet deploy is a founder step |
| Public mainnet giving (router, wallet button, x402) | **pending the Pink Paw handover** (`campaign.shelter.handover`, backend `SHELTER_HANDED_OVER`) |

Gate G2b (CLAUDE.md): Pink Paw signs the wallet claim and the owner rotates by Oct 6 → mainnet giving
on; otherwise submit Oct 7 with the testnet "try it live" link and the gate disclosed in one line:
"Public giving on mainnet opens when the shelter holds its own key; until then Token Tails holds it
and says so on every page."

## Numbers and their keys

- 0.01 USDC treat [C-004]; 1 USDC a day of treats [C-005]; 90 USDC goal, 31 Jan 2027 [C-001].
- Money sent to shelters: live only, from [L-disbursed]; treats from [L-treats]. Never type a total.
- Match per gift [C-008] and the router guard [P-002] and one-signature giving [P-003] are
  unverified: say "built" or "in testing", never "live", until their facts are verified.
- Do not cite the fork demo's caps (0.05 / 0.10 test USDC): they are video parameters, not a claim.
