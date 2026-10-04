# Arbitrum Open House Singapore online buildathon — submission

_Generated 2026-10-04T19:08:53.845Z by `fund a:submission arbitrum-singapore` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arbitrum Open House Singapore online buildathon |
| Deadline | 2026-10-04T15:59:00+08:00 |
| Call | https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | https://tokentails.com/heist |

## Summary  <!-- 268/280 chars -->

ShelterSplit: an open payout rail that sends stablecoins straight to animal shelters, with a public event per payout. On Arbitrum Sepolia it takes USDC payouts, one-signature gifts through a DonateRouter, and sponsored treats from our cat-rescue game, all to Pink Paw.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for. Other games and apps have the same gap, and none of them wants to run its own payout system.

## Solution

Built in the buildathon window, from 2026-09-25:
- ShelterSplit on Arbitrum Sepolia. A registry in the contract holds each shelter's wallet, name and share in basis points. disburse(amount, memo) pulls Circle USDC and pays every active shelter its share in one transaction; donate(memo) does the same for ETH. Low fees on Arbitrum make small, frequent gifts worth sending.
- DonateRouter on Arbitrum Sepolia: a giver signs one EIP-3009 USDC authorization and the router forwards it into ShelterSplit in the same transaction, after checking the split pays only registered shelters. No approval step, nothing parked in the router.
- Catnip Heist (https://tokentails.com/heist): after a win the player taps "Send Pink Paw a rescue treat" and Token Tails pays a small treat from a capped daily budget (signed in, verified email, once a day). The player picks the network the treat lands on, Arbitrum included, and gets a receipt page and a share card.
- The payouts page (https://tokentails.com/shelter-payouts) reads every payout from chain events, with explorer and receipt links. No backend is trusted for the numbers.
- ShelterSplit Rail: an open MIT SDK and a one-tag donate widget, so any app or AI agent can pay the same shelters.
Players never need a wallet: purchases stay card or in-app. Givers who have one can give from it.

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the payment.
- disburse(amount, memo) splits what actually arrived: one Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first. The contract never holds funds between calls.
- DonateRouter: receiveWithAuthorization pulls exactly the signed amount, refuses if any share would reach the treasury or an unregistered wallet, then calls disburse. A gas relay can submit the signed gift, so the giver pays no fee.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers for tokens returning nothing, caps on shelters and memo length. 73 Foundry tests cover splits, dust, access control, reentrancy through a malicious token and fuzzed conservation.
- Sponsored treats: a backend wallet with a small float pays once a day per player, on the network the player picked, with a memo that holds no personal data.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- MIT: shelter-split/ and shelter-rail/ in github.com/zbagdzevicius/tokentails. Demo: https://tokentails.com/heist.

## Deployment

Arbitrum Sepolia, all to Pink Paw (0xE299299b846Ba629f5A591dBF4F562bcC07A0f37):
- ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147 (source verified); USDC payout 0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d
- DonateRouter 0xe271131be71e29f83084fd34aa6c70d50a2aea71; one-signature gift 0xeb52018c3a267e2037becc504afcc0b223e01818829a94484641cedb7c469e6d
- Sponsored treat from the game backend 0x2f40a4f7bb8a4cfb0f3065f00e238de4ec20703ec458f55ad11329b3c1b7b259
Pink Paw's wallet is held by Token Tails until handover.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Arbitrum Sepolia testnet (chain 421614) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.arbiscan.io/tx/0x3f51b51be745eac9ff65434ca4fc8e1ef15dd815c8bdce89decd74439f8f8845) | [payout 1](https://sepolia.arbiscan.io/tx/0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d) | verified on-chain, source verified |

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Status  <!-- 868/1200 chars -->

Live on tokentails.com today: Catnip Heist with an in-game "Sent to shelters" modal, the payouts page and receipts. No mainnet payout exists yet; the production treat is off until the mainnet deploy.
Proven on testnets with real transactions, being shipped to tokentails.com now: the network picker for treats and wallet gifts, a gas relay per network, and the same contract with real payouts on six testnets (Arbitrum Sepolia, Arc, Tempo, Base Sepolia, Avalanche Fuji, Robinhood Chain testnet).
Paxos USDG: Robinhood Chain pays USDG through the same contract (approve, then disburse), tested on a Robinhood mainnet fork; the mainnet deploy is next.
In progress: Arbitrum One mainnet deploy, Monad, x402 agent payments on every network, a multi-chain goal meter.
Prior work, before the window: three Soroban contracts on Stellar mainnet and ERC-721 contracts on SKALE.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. In the window it wrote ShelterSplit, the DonateRouter and their tests, the payouts page, Catnip Heist, the sponsored-treat flow and the SDK. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets in November 2025; that activity ended in March 2026 and none of it is Arbitrum data.

