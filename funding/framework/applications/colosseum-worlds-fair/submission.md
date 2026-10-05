# Colosseum Crypto World's Fair — submission

_Generated 2026-10-05T15:57:05.908Z by `fund a:submission colosseum-worlds-fair` from draft.md, the program profile,
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
- The payouts page at https://tokentails.com/shelter-payouts: each shelter, what it received and an explorer link per payout, read from chain events, not a backend.
- Catnip Heist at https://tokentails.com/heist, a deterministic voxel stealth game, the planned front door for shelter-funding purchases (roadmap step 3).
- The giving loop: after a Heist win a verified player taps "Send Pink Paw a rescue treat"; Token Tails pays a small sponsored gift once a day from a capped budget, on Arc first. Each payout gets a receipt and share card; a meter counts inflows.
- Rail: an MIT SDK and an embeddable donate widget.
- DonateRouter (no owner; one-signature USDC gifts): deployed, public once Pink Paw holds its key. Built: a treat agent with contract-enforced caps.
The buyer never touches a wallet: purchases stay card or in-app payments.

## Why Tempo

Tempo is a payments chain, and Token Tails already takes card payments through Stripe. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token. Finality is deterministic, so a receipt can link to a payout that has settled. disburseWithMemo pays each shelter with TIP-20 transferWithMemo, so the memo on the shelter's own transfer carries the purchase reference and the shelter can reconcile without us. Plain disburse() uses ordinary transfers, with the memo only in ShelterSplit's events. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A transfer-policy block reverts the whole batch, so no shelter is paid short; a receive-policy redirect does not (see Known limit).

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares never exceed the payment.
- disburseWithMemo(amount, memo32) pulls USDC.e, splits what arrived and pays each shelter with transferWithMemo; disburse(amount, memo) does the same with plain transfers. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps. Foundry unit, fuzz and invariant suites; a Tempo suite runs against a mock TIP-20.
- Known limit: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Wallets are checked before registration; a post-payment balance check is next.
- Sponsored gifts, on Arc: a backend wallet with a small float calls donate(), with a memo that holds no personal data.
- Agent payments, off on mainnet until handover: standard x402 exact, paid straight to the shelter wallet, or our own scheme (donate('x402:<nonce>'), tx checked over RPC, accepted once).
- DonateRouter: the donor's EIP-3009 signature binds the payout list; it reverts if the list changed or any share would reach the treasury.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails).

## On-chain proof

Tempo mainnet: ShelterSplit at {SPLIT_ADDRESS}. The first TIP-20 memo payout to Pink Paw is transaction {TEMPO_TX}, and it is listed on the payouts page. Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. Before the hackathon, and disclosed as prior work, the team shipped three Soroban contracts on Stellar mainnet and ERC-721 contracts on SKALE testnet and mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Tempo Moderato testnet (chain 42431) | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | [deploy tx](https://explore.testnet.tempo.xyz/tx/0x8169cd8ca20c3e9a793185c5ef686ed38a460a799abddd075adc74672a0e2575) | [payout 1](https://explore.testnet.tempo.xyz/tx/0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d) | verified on-chain, source verified |
| Robinhood Chain testnet (chain 46630) | [`0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777`](https://explorer.testnet.chain.robinhood.com/address/0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777) | [deploy tx](https://explorer.testnet.chain.robinhood.com/tx/0xf36898d4824c4906bdde2c36792a01c84c12725441cbeb50167cc009931d6881) | [payout 1](https://explorer.testnet.chain.robinhood.com/tx/0x276c904ce4b5862e8cd72b3e561ea9ea2bfc26428844c5035817726c5a84aa23), [payout 2](https://explorer.testnet.chain.robinhood.com/tx/0xaeca9242545aaa31c89eeab0eff49949e4d9f79467b588c5d0e9b9734d143375) | verified on-chain, source verified |
| Base Sepolia testnet (chain 84532) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.basescan.org/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.basescan.org/tx/0x362b82466a4ba86c267bc3f05aea2c4e688d31f53271293050eab1106d293fc6) | - | verified on-chain, source verified |
| Arbitrum Sepolia testnet (chain 421614) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.arbiscan.io/tx/0x3f51b51be745eac9ff65434ca4fc8e1ef15dd815c8bdce89decd74439f8f8845) | [payout 1](https://sepolia.arbiscan.io/tx/0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d) | verified on-chain, source verified |
| Base Sepolia testnet (chain 84532) | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://sepolia.basescan.org/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [deploy tx](https://sepolia.basescan.org/tx/0x11bb6a6c264480a7fba025b2b94c7d4b7693e377d5f3289ab8dbe79de0d0b790) | [payout 1](https://sepolia.basescan.org/tx/0x26a7b0135627bd743046a56fdd69a93b1a830472702f241d48bd7790efacc5fb), [payout 2](https://sepolia.basescan.org/tx/0xc8500f47d3a0ac47af26473cd92bb28c14d407df3b98a9affa4af37928a21467) | verified on-chain, source verified |

## Other chains

This one submission also enters the Arbitrum, Base and Robinhood Chain tracks. Every chain runs the same ShelterSplit, from the same source and tests; only the payout token differs.
- Arbitrum One: ShelterSplit at {ARB_SPLIT}, paying USDC.
- Base: ShelterSplit at {BASE_SPLIT}, paying native USDC.
- Robinhood Chain: ShelterSplit at {ROBINHOOD_SPLIT}. It has no USDC, so it pays USDG (Paxos), readable on robinhoodchain.blockscout.com; the payouts page never adds USDG to USDC.
On Arbitrum and Base a DonateRouter takes one-signature USDC gifts (EIP-3009); it opens to the public once Pink Paw holds its own key. Tempo uses TIP-20 memos instead.

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

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

