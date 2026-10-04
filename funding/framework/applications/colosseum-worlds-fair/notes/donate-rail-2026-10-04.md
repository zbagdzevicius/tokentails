# Donate rail, 2026-10-04: what changed for Colosseum World's Fair

Additive note for the revise pass (Oct 8–11). One submission enters Tempo, Arbitrum, Base and
Robinhood Chain (see chain-decision.md). Closes Oct 12 23:59 PT (Oct 13 09:59 Vilnius).

## New mechanics, mapped to the rules (section 8)

| Criterion | What is new |
|---|---|
| 8(a) Functionality and code | DonateRouter (no owner, no balance, treasury guard), CappedSpender (contract-capped agent spending), each with its own forge suite; 144 forge tests green on 2026-10-04 (re-run `forge test` before citing). |
| 8(b) Potential impact | One rail, three givers: players (sponsored treats [C-004], [C-005]), donors (one-signature gifts [P-003], unverified) and AI agents (x402 `exact`, payTo = the shelter wallet). |
| 8(c) Novelty | An agent whose wallet cannot overspend: Claude decides gifts from Token Tails' own float; CappedSpender reverts anything over its caps (per gift, per UTC day) or anywhere but the shelter wallets registered on the split. |
| 8(d) UX via blockchain | Give with one signature, no gas token and no approve step (EIP-3009 `receiveWithAuthorization` on chains whose USDC supports it: Base, Arbitrum, Avalanche, Arc). On Tempo the rail uses TIP-20 memos instead; no EIP-3009 claim there. |
| 8(e) Open source and composability | MIT: ShelterSplit, DonateRouter, CappedSpender, the treat agent (Node, no dependencies) and the shelter-rail widget. The router composes with any ShelterSplit; the agent composes with any CappedSpender. Matches the Public Goods developer-tool angle. |
| 8(f) Business and team | Unchanged; use the existing draft. |

## 3-beat demo (inside the ≤ 3 min product demo)

1. **Give.** Base Sepolia or Arbitrum Sepolia (test USDC, labelled): sign one message → router →
   ShelterSplit → shelter wallet, one transaction on the explorer.
2. **Guard.** Lower the shelter's share on a test split → the same gift reverts `TreasuryShare`
   ([P-002]); no share of a donor's gift goes to Token Tails' treasury. Until the handover, Token
   Tails still holds the shelter's wallet key, and every page says so.
3. **Agent.** `treat-agent/fork-demo.sh`: the agent matches a fan's gift, then its over-cap proposal
   is refused on-chain with `OverTxCap(0.1, 0.05) USDC` (local Arc testnet fork; CappedSpender not
   deployed yet).

## Live, testnet, pending

| Item | State on 2026-10-04 |
|---|---|
| ShelterSplit testnets | live: Tempo Moderato 0x9978…598d, Base Sepolia 0x457c…b147 and 0x8bf0…878c, Arbitrum Sepolia 0x457c…b147, Robinhood testnet 0x2d42…4777 (mock mUSDC, not a real dollar) — from deployments.json |
| Mainnet splits (Tempo, Arbitrum One, Base, Robinhood) | the mainnet wave is running in another session; cite only what deployments.json records |
| DonateRouter, relay, match, CappedSpender, agent | built and tested; not deployed; testnet deploys are founder steps (tracker rows Oct 5) |
| Public mainnet giving | pending the Pink Paw handover (`SHELTER_HANDED_OVER`, `campaign.shelter.handover`) |

## Numbers and their keys

[C-004] treat size, [C-005] daily budget, [C-001] campaign goal, [C-006] x402 price. Money moved:
live [L-disbursed] only. [P-002], [P-003], [C-008] are unverified: "built", not "live". The fork
demo caps are video parameters, not claims. Robinhood testnet payouts are mock tokens: say so.
