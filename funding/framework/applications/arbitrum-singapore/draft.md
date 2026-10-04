---
program: Arbitrum Open House Singapore online buildathon
version: 1
copied_from: colosseum-worlds-fair
---
# Arbitrum Open House Singapore online buildathon — submission draft

<!-- Updated 2026-10-04 17:20 Vilnius. Deadline 2026-10-04 15:59 on HackQuest, zone not shown: 18:59 Vilnius if UTC
(already closed if Singapore time). We enter with Arbitrum Sepolia (testnet qualifies, mainnet_required: false).
Be exact about what is where:
- LIVE on tokentails.com: Catnip Heist + in-game "Sent to shelters" modal, the payouts page, receipts. No mainnet
  payout exists yet, and the production sponsored treat is switched off until the mainnet deploy.
- PROVEN ON TESTNET (real transactions, linked below), built in the repo, not yet deployed to tokentails.com:
  ShelterSplit + DonateRouter on Arbitrum Sepolia, wallet giving and sponsored treats with a network picker,
  per-chain gas relay, the same contract on six testnets.
- IN PROGRESS (say so): Monad, x402 agent payments on every chain, multi-chain goal meter, Arbitrum One mainnet.
- USDG bonus: USDG is integrated on Robinhood Chain (mainnet-fork tested, approve + disburse path). No USDG
  instance on Arbitrum. Do not claim more. -->

## Summary <!-- criterion: C2, C3 | limit: 280 -->
ShelterSplit: an open payout rail that sends stablecoins straight to animal shelters, with a public event per payout. On Arbitrum Sepolia it takes USDC payouts, one-signature gifts through a DonateRouter, and sponsored treats from our cat-rescue game, all to Pink Paw.

## Problem <!-- criterion: C2, C4 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for. Other games and apps have the same gap, and none of them wants to run its own payout system.

## Solution <!-- criterion: C2, C3, C4 | limit: 1500 -->
Built in the buildathon window, from 2026-09-25:
- ShelterSplit on Arbitrum Sepolia. A registry in the contract holds each shelter's wallet, name and share in basis points. disburse(amount, memo) pulls Circle USDC and pays every active shelter its share in one transaction; donate(memo) does the same for ETH. Low fees on Arbitrum make small, frequent gifts worth sending.
- DonateRouter on Arbitrum Sepolia: a giver signs one EIP-3009 USDC authorization and the router forwards it into ShelterSplit in the same transaction, after checking the split pays only registered shelters. No approval step, nothing parked in the router.
- Catnip Heist (https://tokentails.com/heist): after a win the player taps "Send Pink Paw a rescue treat" and Token Tails pays a small treat from a capped daily budget (signed in, verified email, once a day). The player picks the network the treat lands on, Arbitrum included, and gets a receipt page and a share card.
- The payouts page (https://tokentails.com/shelter-payouts) reads every payout from chain events, with explorer and receipt links. No backend is trusted for the numbers.
- ShelterSplit Rail: an open MIT SDK and a one-tag donate widget, so any app or AI agent can pay the same shelters.
Players never need a wallet: purchases stay card or in-app [F-020]. Givers who have one can give from it.

## How it works <!-- criterion: C1 | limit: 1500 -->
- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the payment.
- disburse(amount, memo) splits what actually arrived: one Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first. The contract never holds funds between calls.
- DonateRouter: receiveWithAuthorization pulls exactly the signed amount, refuses if any share would reach the treasury or an unregistered wallet, then calls disburse. A gas relay can submit the signed gift, so the giver pays no fee.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers for tokens returning nothing, caps on shelters and memo length. 73 Foundry tests cover splits, dust, access control, reentrancy through a malicious token and fuzzed conservation.
- Sponsored treats: a backend wallet with a small float pays once a day per player, on the network the player picked, with a memo that holds no personal data.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- MIT: shelter-split/ and shelter-rail/ in github.com/zbagdzevicius/tokentails. Demo: https://tokentails.com/heist.

## On-chain proof <!-- criterion: C1 | limit: 800 -->
Arbitrum Sepolia, all to Pink Paw (0xE299299b846Ba629f5A591dBF4F562bcC07A0f37):
- ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147 (source verified); USDC payout 0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d
- DonateRouter 0xe271131be71e29f83084fd34aa6c70d50a2aea71; one-signature gift 0xeb52018c3a267e2037becc504afcc0b223e01818829a94484641cedb7c469e6d
- Sponsored treat from the game backend 0x2f40a4f7bb8a4cfb0f3065f00e238de4ec20703ec458f55ad11329b3c1b7b259
Pink Paw's wallet is held by Token Tails until handover.

## Status <!-- criterion: C2 | limit: 1200 -->
Live on tokentails.com today: Catnip Heist with an in-game "Sent to shelters" modal, the payouts page and receipts. No mainnet payout exists yet; the production treat is off until the mainnet deploy.
Proven on testnets with real transactions, being shipped to tokentails.com now: the network picker for treats and wallet gifts, a gas relay per network, and the same contract with real payouts on six testnets (Arbitrum Sepolia, Arc, Tempo, Base Sepolia, Avalanche Fuji, Robinhood Chain testnet).
Paxos USDG: Robinhood Chain pays USDG through the same contract (approve, then disburse), tested on a Robinhood mainnet fork; the mainnet deploy is next.
In progress: Arbitrum One mainnet deploy, Monad, x402 agent payments on every network, a multi-chain goal meter.
Prior work, before the window: three Soroban contracts on Stellar mainnet [F-009] and ERC-721 contracts on SKALE [F-010].

## Team <!-- criterion: C2 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. In the window it wrote ShelterSplit, the DonateRouter and their tests, the payouts page, Catnip Heist, the sponsored-treat flow and the SDK. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets [F-003] in November 2025; that activity ended in March 2026 and none of it is Arbitrum data.
