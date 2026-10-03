# Colosseum Crypto World's Fair — submission

_Generated 2026-10-03T19:05:08.675Z by `fund a:submission colosseum-worlds-fair` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Colosseum Crypto World's Fair |
| Deadline | 2026-10-12T23:59:00-07:00 |
| Call | https://colosseum.com/worldsfair |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |
| Tracks entered | Tempo, Arbitrum, Base and Robinhood Chain |
| Category | Payments / public goods |

## One-line pitch  <!-- 242/280 chars -->

Built in the hackathon window: ShelterSplit, a USDC.e payout rail on Tempo with a TIP-20 memo per shelter, a public payouts page, Catnip Heist, and a one-tap sponsored gift to Pink Paw with public receipts. The Token Tails app existed before.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for.

## Solution

Built between 2026-09-14 and 2026-10-12:
- ShelterSplit, the rail. A registry in the contract (wallet, name, share in basis points). disburseWithMemo(amount, memo32) pulls USDC.e and pays every active shelter its share in one transaction, each with TIP-20 transferWithMemo carrying the purchase reference. The rest goes to the treasury.
- The payouts page at https://tokentails.com/shelter-payouts: each shelter, what it received and an explorer link per payout, read from chain events. No backend is trusted for the numbers.
- Catnip Heist at https://tokentails.com/heist, a deterministic voxel stealth game and the new front door for purchases that fund shelters.
- The giving loop: after a Heist win a signed-in player taps "Send Pink Paw a rescue treat", and Token Tails pays a small sponsored gift, once a day, from a capped budget. Each payout gets a receipt page and a share card. Pink Paw's profile carries the custody disclosure, and a campaign meter sums the payouts. The gift runs on the Arc instance first.
- ShelterSplit Rail: an MIT SDK and an embeddable donate widget.
The buyer never touches a wallet: purchases stay card or in-app payments.

## Why Tempo

Tempo is a payments chain, and Token Tails already takes card payments through Stripe. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token. Finality is deterministic, so a receipt can link to a payout that has settled. disburseWithMemo pays each shelter with TIP-20 transferWithMemo, so the memo on the shelter's own transfer carries the purchase reference and the shelter can reconcile without us. Plain disburse() uses ordinary transfers, with the memo only in ShelterSplit's events. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A transfer-policy block reverts the whole batch, so no shelter is paid short; a receive-policy redirect does not (see Known limit).

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares never add up to more than the payment.
- disburseWithMemo(amount, memo32) pulls USDC.e, splits what arrived and pays each shelter with transferWithMemo; disburse(amount, memo) does the same with plain transfers. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps. A Foundry suite covers splits, dust, access control, reentrancy and fuzzing; a Tempo suite runs it against a mock TIP-20.
- Known limit: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Wallets are checked before registration; a post-payment balance check is next.
- Sponsored gifts, on Arc: a backend wallet with a small float calls donate(), with a memo that holds no personal data.
- Agent payments, off until handover: an x402-compatible endpoint. The agent pays donate('x402:<nonce>') on Arc and retries with the tx hash, checked over RPC and accepted once. Our own onchain-receipt scheme, no facilitator.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- MIT, at github.com/zbagdzevicius/tokentails.

## On-chain proof

Tempo mainnet: ShelterSplit at {SPLIT_ADDRESS}. The first payout to Pink Paw is transaction {TEMPO_TX}, with its memo, and it is listed on the payouts page. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. Before the hackathon, and disclosed as prior work, the team shipped three Soroban contracts on Stellar mainnet and ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Tempo testnet (chain 42431) | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | [deploy tx](https://explore.testnet.tempo.xyz/tx/0x8169cd8ca20c3e9a793185c5ef686ed38a460a799abddd075adc74672a0e2575) | [payout 1](https://explore.testnet.tempo.xyz/tx/0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d) | verified on-chain, source verified |

## Other chains

This one submission also enters the Arbitrum, Base and Robinhood Chain tracks. Each chain runs the same ShelterSplit contract, from the same source and test suite; only the payout token differs.
- Arbitrum One: ShelterSplit at {ARB_SPLIT}, paying out USDC.
- Base: ShelterSplit at {BASE_SPLIT}, paying out native USDC.
- Robinhood Chain: ShelterSplit at {ROBINHOOD_SPLIT}. Robinhood Chain has no USDC, so this instance pays out USDG (Paxos), and its payouts are readable on robinhoodchain.blockscout.com. The payouts page shows USDG as its own total and never adds it to USDC.

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Traction

Judge only the in-window work: the rail, the payouts page, Catnip Heist and the giving loop. Everything below existed before 2026-09-14 and is disclosed as prior work. Token Tails is live on web, iOS and Android, with five game modes, and already takes Stripe, in-app purchases and USDC. Historical peaks, not current activity: on the SEI chain, Token Tails peaked in the week of 2025-11-17 at 324,422 weekly unique active wallets and 875,907 weekly transactions; that SEI activity ended in March 2026 and none of it is Tempo data. Blockchain for Good Alliance named Token Tails a top 2025 incubation project.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. In the window it wrote ShelterSplit and its test suites, the payouts page and Catnip Heist. Demo: {DEMO_URL}. Pitch: {PITCH_VIDEO_URL}.

## Roadmap and business plan

Token Tails earns from card payments and in-app purchases. The plan is to send a fixed share of those purchases to shelters through ShelterSplit (step 3 below); today the payouts are sponsored gifts and a proof payout. The contract charges shelters nothing. Payout volume grows with app sales, and the public payout record is something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet, Pink Paw registered, a first real payout with a memo, and the payouts page live. Metric: shelters in the registry.
2. Handover and delivery check: the held wallet passes to Pink Paw, which switches on wallet donations and the agent endpoint, and payouts revert if a share does not arrive. Metric: shelters controlling their own wallet.
3. App integration: purchases in Token Tails and Catnip Heist trigger disburseWithMemo(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: other apps pay the same shelters. Metric: distinct payer addresses.

## Before you press submit

- [ ] Public GitHub repo; disclose pre-hackathon work (products are judged only on work done Sep 14 - Oct 12)
- [ ] Product demo video recorded by a human, no more than 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Pitch/presentation video recorded by a human, 2 to 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Deployment address and explorer link per entered track: Tempo mainnet (explore.tempo.xyz), Arbitrum One, Base and Robinhood Chain (robinhoodchain.blockscout.com)
- [ ] Every team member registered on colosseum.com before 2026-10-12 23:59 PT (rules section 6)

