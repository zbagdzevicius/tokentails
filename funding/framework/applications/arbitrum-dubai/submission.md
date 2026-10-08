# Arbitrum Open House Dubai online buildathon — submission

_Generated 2026-10-07T19:57:10.150Z by `fund a:submission arbitrum-dubai` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arbitrum Open House Dubai online buildathon |
| Deadline | 2026-12-06 |
| Call | https://www.hackquest.io/hackathons/Arbitrum-Open-House-Dubai-Online-Buildathon |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 231/280 chars -->

ShelterSplit is an open-source payout contract on Tempo. It takes a share of Token Tails' cat-rescue app revenue in USDC.e and pays it to registered animal-shelter wallets, with one on-chain event per shelter that anyone can check.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has the buyers and the promise to keep. What it lacks is a payout record that neither the app nor the shelter has to be trusted for.

## Solution

ShelterSplit turns the shelter promise into a public record. The contract holds a shelter registry: each shelter has a wallet, a name and a share in basis points. One disburse(amount, memo) call pulls USDC.e from the payer and pays every active shelter its share in the same transaction. The rest goes to the treasury.

The buyer never touches a wallet. The purchase stays a card or in-app payment. The payer is Token Tails' own operations wallet, which funds disbursements from its USDC.e balance. The plan is for each receipt to name the shelter and link to that payout on the Tempo explorer. The memo carries the purchase reference, so a shelter or a buyer can match a payout to a purchase.

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the whole payment. Any unallocated share goes to the treasury.
- disburse(amount, memo) pulls USDC.e with transferFrom and splits the amount that actually arrived. It emits one Disbursed(shelter, amount, memo) event per shelter and one DisbursementBatch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Safety: a reentrancy guard, pause, two-step ownership, safe transfers for tokens that return no bool, and caps on shelter count, name length and memo length.
- Tests: a Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy through a malicious token, and fuzzing over amounts and shares. A Tempo suite runs the same contract against a mock TIP-20.
- Known limit, stated openly: under a Tempo receive policy a shelter can get a Disbursed event without receiving the funds. The planned fix checks each shelter's balance after payment and reverts if the share did not arrive.
- MIT licence, no external dependencies. Any app or DAO can call disburse() and pay the same public registry.

## What we built during the buildathon

Token Tails earns from card payments and in-app purchases. ShelterSplit sends a fixed share of those purchases to shelters and the rest to the treasury. The contract charges shelters nothing. Payout volume grows with app sales, and the public record of payouts becomes something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet with the first named shelters registered and a first real payout. Metric: shelters in the registry.
2. Delivery check and TIP-20 memos: revert if a share does not arrive, and send the purchase reference as a native TIP-20 memo that shelters can reconcile against. Metric: payouts with memos.
3. App integration: purchases in the app trigger disburse(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: a public dashboard read from events, and other apps paying the same shelters. Metric: distinct payer addresses.

## Deployment

ShelterSplit's Tempo mainnet address and explorer link appear below once the deployment is recorded. Every payout is a Disbursed event that anyone can look up. Before the hackathon, the team shipped three Soroban contracts on Stellar mainnet. One of them, the Cat contract, has 1,218,693 invocations since January 2025. The team also deployed ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arbitrum One mainnet (chain 42161) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://arbiscan.io/tx/0xf094217e60154b0da6ad74fddf49c65b27002f2e1e1d78eed5acff64300481d4) | [payout 1](https://arbiscan.io/tx/0x74f1eaf7fe3494608f1e80d92afc27c1035b8eaf34e3bd190695f1da46929216) | verified on-chain, source verified |
| Robinhood Chain mainnet (chain 4663) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://robinhoodchain.blockscout.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://robinhoodchain.blockscout.com/tx/0x8a6b3d87cfb893c78ac533dfc49c78745c4e7cac5aa3fbbe6516feb1eaf70ee7) | [payout 1](https://robinhoodchain.blockscout.com/tx/0x4902093822e89d56b49b1168f7c0bf702f0a2cf9b578fe54eb8efdb3a49ad377) | verified on-chain, source verified |
| Robinhood Chain testnet (chain 46630) | [`0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777`](https://explorer.testnet.chain.robinhood.com/address/0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777) | [deploy tx](https://explorer.testnet.chain.robinhood.com/tx/0xf36898d4824c4906bdde2c36792a01c84c12725441cbeb50167cc009931d6881) | [payout 1](https://explorer.testnet.chain.robinhood.com/tx/0x276c904ce4b5862e8cd72b3e561ea9ea2bfc26428844c5035817726c5a84aa23), [payout 2](https://explorer.testnet.chain.robinhood.com/tx/0xaeca9242545aaa31c89eeab0eff49949e4d9f79467b588c5d0e9b9734d143375) | verified on-chain, source verified |
| Arbitrum Sepolia testnet (chain 421614) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.arbiscan.io/tx/0x3f51b51be745eac9ff65434ca4fc8e1ef15dd815c8bdce89decd74439f8f8845) | [payout 1](https://sepolia.arbiscan.io/tx/0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d) | verified on-chain, source verified |

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. It also wrote, tested and deployed the Stellar contracts behind the game, and it wrote ShelterSplit and its test suites.

## Before you press submit

- [ ] draft.md is a v0 copy that pitches Tempo: rewrite it for Arbitrum before pasting anything (checked 2026-10-05)

