---
program: Circle Developer Grants
version: 0
copied_from: colosseum-worlds-fair
---
# Circle Developer Grants — submission draft

<!-- STALE (checked 2026-10-05): this v0 draft is a copy of an early Colosseum draft and pitches
ShelterSplit "on Tempo" in USDC.e. Rewrite it for Arc (native USDC, EURC) and Circle's tools before submitting, using the
current arc-microgrants and colosseum-worlds-fair drafts as the source of truth. State of the build on
2026-10-05: the same ShelterSplit is deployed and verified on seven testnets (Arc, Tempo, Arbitrum
Sepolia, Avalanche Fuji, Base Sepolia, Robinhood testnet, Monad testnet); DonateRouters on Arc,
Arbitrum, Avalanche, Base and Monad testnets; nothing on mainnet until a person runs the mainnet wave
(fund a:mainnet-plan --network mainnet, then CONFIRM_MAINNET=yes wave/mainnet-all.sh). 149 Foundry
tests pass. -->

## Summary <!-- criterion: C2, C3 | limit: 280 -->
ShelterSplit is an open-source payout contract on Tempo. It takes a share of Token Tails' cat-rescue app revenue in USDC.e and pays it to registered animal-shelter wallets, with one on-chain event per shelter that anyone can check.

## Problem <!-- criterion: C2 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has the buyers and the promise to keep. What it lacks is a payout record that neither the app nor the shelter has to be trusted for.

## Solution <!-- criterion: C3, C4 | limit: 1200 -->
ShelterSplit turns the shelter promise into a public record. The contract holds a shelter registry: each shelter has a wallet, a name and a share in basis points. One disburse(amount, memo) call pulls USDC.e from the payer and pays every active shelter its share in the same transaction. The rest goes to the treasury.

The buyer never touches a wallet. The purchase stays a card or in-app payment [F-020]. The payer is Token Tails' own operations wallet, which funds disbursements from its USDC.e balance. The plan is for each receipt to name the shelter and link to that payout on the Tempo explorer. The memo carries the purchase reference, so a shelter or a buyer can match a payout to a purchase.

## Why Tempo <!-- criterion: C4, C5 | limit: 900 -->
Tempo is a payments chain, and Token Tails already takes card payments through Stripe [F-020]. Fees on Tempo are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token. Finality is deterministic, so a receipt can link to a payout that has settled. ShelterSplit is built and tested for Tempo's bridged USDC (USDC.e, a TIP-20 token): a second test suite runs it against a mock TIP-20 at the real USDC.e address. The suite covers transfer-policy reverts, token pause, and receive-policy redirects. If a token policy blocks a shelter, the whole batch reverts and no shelter is paid short. A Tempo receive policy is different: it redirects funds without reverting. So each shelter wallet is checked for a receive policy before it is registered.

## How it works <!-- criterion: C1, C5 | limit: 1500 -->
- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the whole payment. Any unallocated share goes to the treasury.
- disburse(amount, memo) pulls USDC.e with transferFrom and splits the amount that actually arrived. It emits one Disbursed(shelter, amount, memo) event per shelter and one DisbursementBatch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Safety: a reentrancy guard, pause, two-step ownership, safe transfers for tokens that return no bool, and caps on shelter count, name length and memo length.
- Tests: a Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy through a malicious token, and fuzzing over amounts and shares. A Tempo suite runs the same contract against a mock TIP-20.
- Known limit, stated openly: under a Tempo receive policy a shelter can get a Disbursed event without receiving the funds. The planned fix checks each shelter's balance after payment and reverts if the share did not arrive.
- MIT licence, no external dependencies. Any app or DAO can call disburse() and pay the same public registry.

## On-chain proof <!-- criterion: C1, C4 | limit: 800 -->
ShelterSplit's Tempo mainnet address and explorer link appear below once the deployment is recorded. Every payout is a Disbursed event that anyone can look up. Before the hackathon, the team shipped three Soroban contracts on Stellar mainnet [F-009]. One of them, the Cat contract, has 1,218,693 invocations since January 2025 [F-007]. The team also deployed ERC-721 contracts on SKALE testnet and mainnet [F-010].

## Traction <!-- criterion: C2, C6 | limit: 1000 -->
All of the following was built before 2026-09-14 and is disclosed as prior work. ShelterSplit itself is the hackathon build. Token Tails is live on web, iOS and Android [F-015] [F-016]. It reports 542,000 registered users all time (company figure, not independently verified) [F-001]. The game has five modes, including an 80-level platformer and a 30-level match-3 with leaderboards [F-018]. Its production Stellar contract has 1,218,693 invocations [F-007]. The app already takes Stripe, in-app purchases, and XLM and USDC on Stellar [F-020], so ShelterSplit has a payment flow to plug into. Blockchain for Good Alliance named Token Tails a top 2025 incubation project [F-014].

## Team <!-- criterion: C6 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. It also wrote, tested and deployed the Stellar contracts behind the game [F-009], and it wrote ShelterSplit and its test suites.

## Roadmap and business plan <!-- criterion: C2, C6 | limit: 1200 -->
Token Tails earns from card payments and in-app purchases [F-020]. ShelterSplit sends a fixed share of those purchases to shelters and the rest to the treasury. The contract charges shelters nothing. Payout volume grows with app sales, and the public record of payouts becomes something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet with the first named shelters registered and a first real payout. Metric: shelters in the registry.
2. Delivery check and TIP-20 memos: revert if a share does not arrive, and send the purchase reference as a native TIP-20 memo that shelters can reconcile against. Metric: payouts with memos.
3. App integration: purchases in the app trigger disburse(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: a public dashboard read from events, and other apps paying the same shelters. Metric: distinct payer addresses.
