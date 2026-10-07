# Circle Developer Grants — submission

_Generated 2026-10-07T19:29:52.066Z by `fund a:submission circle-developer-grants` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Circle Developer Grants |
| Deadline | rolling |
| Call | https://www.circle.com/grant |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 231/280 chars -->

ShelterSplit is an open-source payout contract on Tempo. It takes a share of Token Tails' cat-rescue app revenue in USDC.e and pays it to registered animal-shelter wallets, with one on-chain event per shelter that anyone can check.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has the buyers and the promise to keep. What it lacks is a payout record that neither the app nor the shelter has to be trusted for.

## Solution and Circle stack

ShelterSplit turns the shelter promise into a public record. The contract holds a shelter registry: each shelter has a wallet, a name and a share in basis points. One disburse(amount, memo) call pulls USDC.e from the payer and pays every active shelter its share in the same transaction. The rest goes to the treasury.

The buyer never touches a wallet. The purchase stays a card or in-app payment. The payer is Token Tails' own operations wallet, which funds disbursements from its USDC.e balance. The plan is for each receipt to name the shelter and link to that payout on the Tempo explorer. The memo carries the purchase reference, so a shelter or a buyer can match a payout to a purchase.

## Architecture

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the whole payment. Any unallocated share goes to the treasury.
- disburse(amount, memo) pulls USDC.e with transferFrom and splits the amount that actually arrived. It emits one Disbursed(shelter, amount, memo) event per shelter and one DisbursementBatch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Safety: a reentrancy guard, pause, two-step ownership, safe transfers for tokens that return no bool, and caps on shelter count, name length and memo length.
- Tests: a Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy through a malicious token, and fuzzing over amounts and shares. A Tempo suite runs the same contract against a mock TIP-20.
- Known limit, stated openly: under a Tempo receive policy a shelter can get a Disbursed event without receiving the funds. The planned fix checks each shelter's balance after payment and reverts if the share did not arrive.
- MIT licence, no external dependencies. Any app or DAO can call disburse() and pay the same public registry.

## Existing deployments

ShelterSplit's Tempo mainnet address and explorer link appear below once the deployment is recorded. Every payout is a Disbursed event that anyone can look up. Before the hackathon, the team shipped three Soroban contracts on Stellar mainnet. One of them, the Cat contract, has 1,218,693 invocations since January 2025. The team also deployed ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arc mainnet (chain 5042) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.arc.io/tx/0xa88dca321dba7d2669b45defd8f6714f1dac29ad6e16bd47468e0d3a93aa7b1a) | [payout 1](https://explorer.arc.io/tx/0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d) | verified on-chain, source verified |
| Arc mainnet (chain 5042) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://explorer.arc.io/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [deploy tx](https://explorer.arc.io/tx/0xc9e01275524bda5860b4bfd95af13bc0f9db8f384929eeb89d0b72c0af59e469) | [payout 1](https://explorer.arc.io/tx/0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f) | verified on-chain, source verified |
| Arc testnet (chain 5042002) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://explorer.testnet.arc.io/tx/0x6af0fe0eae4abd65d8560cf4ed14ada55f2debd2e14e9306d45d81a271d0ede8) | [payout 1](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) | verified on-chain, source verified |
| Arc testnet (chain 5042002) | [`0x937f13ce28294011567615330dbcb859a06a0bba`](https://explorer.testnet.arc.io/address/0x937f13ce28294011567615330dbcb859a06a0bba) | [deploy tx](https://explorer.testnet.arc.io/tx/0xc63d3c5786aaf15474c0d74c5c65f6e0dcd33d232bdbbee0141a83313a1e59a3) | [payout 1](https://explorer.testnet.arc.io/tx/0xc68ceb5a3633b78cd1681c81dde1ff310ca04f1f378003497acc906eb88f387b) | verified on-chain, source verified |

## Milestones

Token Tails earns from card payments and in-app purchases. ShelterSplit sends a fixed share of those purchases to shelters and the rest to the treasury. The contract charges shelters nothing. Payout volume grows with app sales, and the public record of payouts becomes something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet with the first named shelters registered and a first real payout. Metric: shelters in the registry.
2. Delivery check and TIP-20 memos: revert if a share does not arrive, and send the purchase reference as a native TIP-20 memo that shelters can reconcile against. Metric: payouts with memos.
3. App integration: purchases in the app trigger disburse(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: a public dashboard read from events, and other apps paying the same shelters. Metric: distinct payer addresses.

## Traction

All of the following was built before 2026-09-14 and is disclosed as prior work. ShelterSplit itself is the hackathon build. Token Tails is live on web, iOS and Android. It reports 542,000 registered users all time (company figure, not independently verified). The game has five modes, including an 80-level platformer and a 30-level match-3 with leaderboards. Its production Stellar contract has 1,218,693 invocations. The app already takes Stripe, in-app purchases, and XLM and USDC on Stellar, so ShelterSplit has a payment flow to plug into. Blockchain for Good Alliance named Token Tails a top 2025 incubation project.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. It also wrote, tested and deployed the Stellar contracts behind the game, and it wrote ShelterSplit and its test suites.

## Before you press submit

- [ ] draft.md is a v0 copy that pitches Tempo: rewrite it for Arc before pasting anything (checked 2026-10-05)
- [ ] Each milestone has one on-chain metric that anyone can check in the explorer

