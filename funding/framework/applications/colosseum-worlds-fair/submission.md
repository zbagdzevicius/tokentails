# Colosseum Crypto World's Fair — submission

_Generated 2026-10-08T07:50:09.003Z by `fund a:submission colosseum-worlds-fair` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Colosseum Crypto World's Fair |
| Deadline | 2026-10-12T23:59:00-07:00 |
| Call | https://colosseum.com/worldsfair |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |
| Tracks entered | Tempo, Arbitrum, Base and Robinhood Chain |
| Category | Payments (Public Goods not entered) |

## One-line pitch  <!-- 272/280 chars -->

ShelterSplit: one MIT contract that splits stablecoin payments to animal shelters, live on Tempo (TIP-20 memo per shelter), Arbitrum, Base and Robinhood Chain mainnets, with a public payouts page and one-tap sponsored treats. Built Sep 14 to Oct 12; the app is prior work.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for.

## Solution

Built between 2026-09-14 and 2026-10-12, and live on mainnet now:
- ShelterSplit, the rail. A registry in the contract (wallet, name, share in basis points). disburseWithMemo(amount, memo32) pulls the stablecoin and pays every active shelter its share in one transaction; on Tempo each share goes out with TIP-20 transferWithMemo carrying the reference. The rest goes to the treasury.
- The payouts page, https://tokentails.com/shelter-payouts: each shelter, what it received and an explorer link per payout, read from each chain's public RPC, not from our backend. Every payout has a receipt page and a share card.
- Sponsored treats: a verified player taps "Send a treat" (after a Catnip Heist win or on the give page) and Token Tails pays 0.01 of a stablecoin from its own capped float, once a day per player, on any of seven mainnets, Tempo, Arbitrum, Base and Robinhood Chain included.
- Catnip Heist, https://tokentails.com/heist, a deterministic voxel stealth game, the front door for the giving loop.
- An MIT SDK and an embeddable donate widget.
- DonateRouter (no owner; one-signature USDC gifts): deployed on Arbitrum and Base, opened to the public only once Pink Paw holds its own key.
The buyer never touches a wallet: purchases stay card or in-app payments.

## Why Tempo

Tempo is a payments chain, and Token Tails already takes card payments through Stripe. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token: our treat wallet pays Tempo fees in a stablecoin too. Finality is deterministic, so a receipt can link to a payout that has settled. disburseWithMemo pays each shelter with TIP-20 transferWithMemo, so the memo sits on the shelter's own transfer and the shelter can reconcile without us. Every Tempo treat uses it. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A transfer-policy block reverts the whole batch, so no shelter is paid short; a receive-policy redirect does not (see Known limit).

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares never exceed the payment.
- disburseWithMemo(amount, memo32) pulls the token, splits what arrived and pays each shelter (transferWithMemo on Tempo); disburse(amount, memo) does the same with plain transfers. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps. Foundry unit, fuzz and invariant suites; a Tempo suite runs against a mock TIP-20.
- Known limit: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Wallets are checked before registration; a post-payment balance check is next.
- Sponsored treats: a backend hot wallet with a small float per chain calls disburse (disburseWithMemo on Tempo), once a day per player, with a memo that holds no personal data. A health check closes a chain when its float or the split is not ready.
- DonateRouter: the donor's EIP-3009 signature binds the payout list; it reverts if the list changed or any share would reach the treasury.
- Agent payments (x402), off on mainnet until handover.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.

## On-chain proof

All deployed and paid on 2026-10-07, inside the window; sources verified on Sourcify. Tempo mainnet: ShelterSplit 0x9978e60da2352a8de02852788d34bd95849a598d. Its TIP-20 memo payout, 0.1 USDC.e with the memo "Catnip Heist campaign", is https://explore.tempo.xyz/tx/0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5 and its receipt https://tokentails.com/shelter-payouts/receipt?chain=4217&tx=0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5. Arbitrum One, Base and Robinhood Chain: ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147, one payout each (links below). Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw until handover, and every payout so far is Token Tails' own money.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Base mainnet (chain 8453) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://basescan.org/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://basescan.org/tx/0x97459e3c7b00c9d1a0aa0ecb9a6cae6bf82884549c4bc16b678d4e83d634c3ab) | [payout 1](https://basescan.org/tx/0x130fdcc6987ddefb95d787c1bd2da3d210ee844cdbc339c7b59e0949a401da3d) | verified on-chain, source verified |
| Arbitrum One mainnet (chain 42161) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://arbiscan.io/tx/0xf094217e60154b0da6ad74fddf49c65b27002f2e1e1d78eed5acff64300481d4) | [payout 1](https://arbiscan.io/tx/0x74f1eaf7fe3494608f1e80d92afc27c1035b8eaf34e3bd190695f1da46929216) | verified on-chain, source verified |
| Robinhood Chain mainnet (chain 4663) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://robinhoodchain.blockscout.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://robinhoodchain.blockscout.com/tx/0x8a6b3d87cfb893c78ac533dfc49c78745c4e7cac5aa3fbbe6516feb1eaf70ee7) | [payout 1](https://robinhoodchain.blockscout.com/tx/0x4902093822e89d56b49b1168f7c0bf702f0a2cf9b578fe54eb8efdb3a49ad377) | verified on-chain, source verified |
| Tempo mainnet (chain 4217) | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | [deploy tx](https://explore.tempo.xyz/tx/0x94a1ad9d769c411032950013513741653652b6bedef6e78a0762f9d73dee4953) | [payout 1](https://explore.tempo.xyz/tx/0xdc25ffea4a1f97b25c5d3cb5827919bd998f37c676867dd262bcf0158e7d3d33) | verified on-chain, source verified |
| Tempo Moderato testnet (chain 42431) | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | [deploy tx](https://explore.testnet.tempo.xyz/tx/0x8169cd8ca20c3e9a793185c5ef686ed38a460a799abddd075adc74672a0e2575) | [payout 1](https://explore.testnet.tempo.xyz/tx/0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d) | verified on-chain, source verified |
| Robinhood Chain testnet (chain 46630) | [`0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777`](https://explorer.testnet.chain.robinhood.com/address/0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777) | [deploy tx](https://explorer.testnet.chain.robinhood.com/tx/0xf36898d4824c4906bdde2c36792a01c84c12725441cbeb50167cc009931d6881) | [payout 1](https://explorer.testnet.chain.robinhood.com/tx/0x276c904ce4b5862e8cd72b3e561ea9ea2bfc26428844c5035817726c5a84aa23), [payout 2](https://explorer.testnet.chain.robinhood.com/tx/0xaeca9242545aaa31c89eeab0eff49949e4d9f79467b588c5d0e9b9734d143375) | verified on-chain, source verified |
| Base Sepolia testnet (chain 84532) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.basescan.org/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.basescan.org/tx/0x362b82466a4ba86c267bc3f05aea2c4e688d31f53271293050eab1106d293fc6) | - | verified on-chain, source verified |
| Arbitrum Sepolia testnet (chain 421614) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://sepolia.arbiscan.io/tx/0x3f51b51be745eac9ff65434ca4fc8e1ef15dd815c8bdce89decd74439f8f8845) | [payout 1](https://sepolia.arbiscan.io/tx/0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d) | verified on-chain, source verified |
| Base Sepolia testnet (chain 84532) | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://sepolia.basescan.org/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [deploy tx](https://sepolia.basescan.org/tx/0x11bb6a6c264480a7fba025b2b94c7d4b7693e377d5f3289ab8dbe79de0d0b790) | [payout 1](https://sepolia.basescan.org/tx/0x26a7b0135627bd743046a56fdd69a93b1a830472702f241d48bd7790efacc5fb), [payout 2](https://sepolia.basescan.org/tx/0xc8500f47d3a0ac47af26473cd92bb28c14d407df3b98a9affa4af37928a21467) | verified on-chain, source verified |

## Other chains

This one submission enters the Tempo, Arbitrum, Base and Robinhood Chain tracks. Every chain runs the same ShelterSplit, from the same source and tests; only the payout token differs.
- Tempo: its own address 0x9978e60da2352a8de02852788d34bd95849a598d, paying USDC.e with TIP-20 memos.
- Arbitrum One: 0x457c89e10a6e66633eda5bf82fd086febb5db147, paying USDC; DonateRouter 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052.
- Base: 0x457c89e10a6e66633eda5bf82fd086febb5db147, paying native USDC; DonateRouter 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052.
- Robinhood Chain: 0x457c89e10a6e66633eda5bf82fd086febb5db147. It has no USDC, so it pays USDG (Paxos); the payouts page never adds USDG to USDC.
Sponsored treats run on all four. The routers open to the public once Pink Paw holds its own key.

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

## Prior work

Judge only the work done from 2026-09-14 to 2026-10-12: ShelterSplit, DonateRouter, CappedSpender and their tests, every mainnet deployment and payout, the payouts and receipt pages, sponsored treats, the Rail SDK and widget, and Catnip Heist. ShelterSplit was first written on 2026-09-25 and first committed on 2026-09-29. Everything else existed before 2026-09-14 and is prior work: the Token Tails game and app on web, iOS and Android, its card and in-app payments and its AI cat-story pipeline. Also prior work: three Soroban contracts on Stellar mainnet and NFT contracts on SKALE. The public repo has history back to 2024; its 68 commits since 2026-09-14 are the in-window work.

## AI tools used

The team built the in-window code with Claude Code (Anthropic) as a coding assistant: contracts, tests, backend and client code, docs and these drafts. Commits it helped write carry a "Co-Authored-By: Claude" trailer. A person directed the work, and every mainnet deployment and payout was signed and broadcast by a person; the AI never held a mainnet key. The optional treat agent calls the Anthropic API, and the contract caps what it can spend. Prior work: the app uses OpenAI and Gemini for cat stories and portraits. The pitch and demo videos are recorded by a person.

## Open source and third-party code

ShelterSplit, DonateRouter, CappedSpender and the Rail SDK are MIT licensed: https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split. The contracts have no external libraries (Foundry, Solidity 0.8.24). They compose with existing tokens: Circle USDC and its EIP-3009 transferWithAuthorization, Tempo TIP-20 USDC.e and its transferWithMemo, and Paxos USDG.

## Traction

In the window: four track mainnets live, a TIP-20 memo payout on Tempo, and sponsored treats open to players on seven mainnets. Everything below existed before 2026-09-14 and is disclosed as prior work. Token Tails is live on web, iOS and Android, with five game modes, and already takes Stripe, in-app purchases and USDC. Its X account has 181,010 followers. Historical peaks, not current activity: on the SEI chain, Token Tails peaked in the week of 2025-11-17 at 324,422 weekly unique active wallets and 875,907 weekly transactions; that SEI activity ended in March 2026 and none of it is Tempo data. Blockchain for Good Alliance named Token Tails a top 2025 incubation project.

## Team

{TEAM_MEMBERS} Token Tails is a Lithuanian small partnership (MB), registered in October 2024. Team location: {TEAM_LOCATION}. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. In the window it wrote ShelterSplit and its test suites, deployed it to seven mainnets, and built the payouts page, sponsored treats and Catnip Heist. Demo: {DEMO_URL}. Pitch: {PITCH_VIDEO_URL}.

## Go-to-market

Distribution is the app we already run: Token Tails players, the Catnip Heist link and an X audience of 181,010. Treats are the free first step: a player sends one in a tap and gets a receipt and a share card to post, so each gift advertises the rail. Shelters pay nothing to join; they need a wallet, and the handover flow lets a shelter claim its own. Demand validation so far is the live rail and one showcase shelter, Pink Paw; we do not yet have a second shelter or a paying partner app, and that is the next test (roadmap steps 2 and 4).

## Roadmap and business plan

Token Tails earns from card payments and in-app purchases. The plan is to send a fixed share of those purchases to shelters through ShelterSplit (step 3 below). Today: one proof payout on each of seven mainnets, the Tempo memo payout, and sponsored treats live from Token Tails' own capped float. The contract charges shelters nothing. Payout volume grows with app sales, and the public payout record is something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon (done): ShelterSplit on Tempo, Arbitrum, Base and Robinhood Chain mainnets, Pink Paw registered, a real payout with a TIP-20 memo, the payouts page and treats live. Metric: shelters in the registry.
2. Handover and delivery check: the held wallet passes to Pink Paw, which opens wallet gifts and the agent endpoint, and payouts revert if a share does not arrive. Metric: shelters controlling their own wallet.
3. App integration: purchases in Token Tails and Catnip Heist trigger disburseWithMemo(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: other apps pay the same shelters. Metric: distinct payer addresses.

## Before you press submit

- [ ] Public GitHub repo (contracts/shelter-split, MIT); prior work disclosed in the Prior work field (products are judged only on work done Sep 14 - Oct 12)
- [ ] Product demo video recorded by a human, no more than 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Pitch/presentation video recorded by a human, 2 to 3 minutes (colosseum.com/hackathon FAQ)
- [ ] Deployment address and explorer link per entered track: Tempo mainnet (explore.tempo.xyz), Arbitrum One (arbiscan.io), Base (basescan.org) and Robinhood Chain (robinhoodchain.blockscout.com)
- [ ] Tracks ticked: Tempo, Arbitrum, Base, Robinhood Chain. Public Goods NOT ticked
- [ ] Every team member registered on colosseum.com before 2026-10-12 23:59 PT (rules section 6); the Team Leader uploads the submission
- [ ] No {PLACEHOLDER} left in the pasted text

