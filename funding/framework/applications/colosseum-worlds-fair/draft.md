---
program: "Colosseum Crypto World's Fair"
version: 6
---
# Colosseum Crypto World's Fair — submission draft

<!-- v6 (2026-10-08): rewritten after the mainnet wave. Every statement is checked against the chain
and production on 2026-10-08: ShelterSplit on Tempo (0x9978…598d), Arbitrum One, Base and Robinhood
Chain (0x457c…b147) with one successful proof payout each (Oct 7); the Tempo TIP-20 memo payout
0xcd33…b8b5 paid 0.1 USDC.e to the held Pink Paw wallet with the memo "Catnip Heist campaign";
GET https://api.tokentails.com/shelter/donate/status shows treats "live" on all 7 mainnets (no player
treat confirmed yet, so never state a treat count). Placeholders still open: {DEMO_URL},
{PITCH_VIDEO_URL}, {TEAM_MEMBERS}, {TEAM_LOCATION}; search for "{" before submitting.
The showcase shelter is Pink Paw (Rožinė pėdutė): state nothing about it beyond its name and the
custody disclosure, and do not claim its consent until the signed letter or public post exists.
Public Goods is NOT ticked (its prize is paid in Solana CASH, decided 2026-10-03/07). Never link
funding/ from here; judges go to contracts/shelter-split. -->

## Summary <!-- criterion: C2, C3 | limit: 280 -->
ShelterSplit: one MIT contract that splits stablecoin payments to animal shelters, live on Tempo (TIP-20 memo per shelter), Arbitrum, Base and Robinhood Chain mainnets, with a public payouts page and one-tap sponsored treats. Built Sep 14 to Oct 12; the app is prior work.

## Problem <!-- criterion: C2 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for.

## Solution <!-- criterion: C3, C4 | limit: 1300 -->
Built between 2026-09-14 and 2026-10-12, and live on mainnet now:
- ShelterSplit, the rail. A registry in the contract (wallet, name, share in basis points). disburseWithMemo(amount, memo32) pulls the stablecoin and pays every active shelter its share in one transaction; on Tempo each share goes out with TIP-20 transferWithMemo carrying the reference. The rest goes to the treasury.
- The payouts page, https://tokentails.com/shelter-payouts: each shelter, what it received and an explorer link per payout, read from each chain's public RPC, not from our backend. Every payout has a receipt page and a share card.
- Sponsored treats: a verified player taps "Send a treat" (after a Catnip Heist win or on the give page) and Token Tails pays 0.01 of a stablecoin from its own capped float, once a day per player, on any of seven mainnets, Tempo, Arbitrum, Base and Robinhood Chain included.
- Catnip Heist, https://tokentails.com/heist, a deterministic voxel stealth game, the front door for the giving loop.
- An MIT SDK and an embeddable donate widget.
- DonateRouter (no owner; one-signature USDC gifts): deployed on Arbitrum and Base, opened to the public only once Pink Paw holds its own key.
The buyer never touches a wallet: purchases stay card or in-app payments [F-020].

## Why Tempo <!-- criterion: C4, C5 | limit: 900 -->
Tempo is a payments chain, and Token Tails already takes card payments through Stripe [F-020]. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token: our treat wallet pays Tempo fees in a stablecoin too. Finality is deterministic, so a receipt can link to a payout that has settled. disburseWithMemo pays each shelter with TIP-20 transferWithMemo, so the memo sits on the shelter's own transfer and the shelter can reconcile without us. Every Tempo treat uses it. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A transfer-policy block reverts the whole batch, so no shelter is paid short; a receive-policy redirect does not (see Known limit).

## How it works <!-- criterion: C1, C5 | limit: 1500 -->
- Registry: the owner adds, updates, deactivates or removes shelters. Shares never exceed the payment.
- disburseWithMemo(amount, memo32) pulls the token, splits what arrived and pays each shelter (transferWithMemo on Tempo); disburse(amount, memo) does the same with plain transfers. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps. Foundry unit, fuzz and invariant suites; a Tempo suite runs against a mock TIP-20.
- Known limit: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Wallets are checked before registration; a post-payment balance check is next.
- Sponsored treats: a backend hot wallet with a small float per chain calls disburse (disburseWithMemo on Tempo), once a day per player, with a memo that holds no personal data. A health check closes a chain when its float or the split is not ready.
- DonateRouter: the donor's EIP-3009 signature binds the payout list; it reverts if the list changed or any share would reach the treasury.
- Agent payments (x402), off on mainnet until handover.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.

## On-chain proof <!-- criterion: C1, C4 | limit: 900 -->
All deployed and paid on 2026-10-07, inside the window; sources verified on Sourcify (Tempo on its own Sourcify server, contracts.tempo.xyz). Tempo mainnet: ShelterSplit 0x9978e60da2352a8de02852788d34bd95849a598d. Its TIP-20 memo payout, 0.1 USDC.e with the memo "Catnip Heist campaign", is https://explore.tempo.xyz/tx/0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5 and its receipt https://tokentails.com/shelter-payouts/receipt?chain=4217&tx=0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5. Arbitrum One, Base and Robinhood Chain: ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147, one payout each (links below). Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw until handover, and every payout so far is Token Tails' own money.

## Other chains <!-- criterion: C1, C5 | limit: 800 -->
This one submission enters the Tempo, Arbitrum, Base and Robinhood Chain tracks. Every chain runs the same ShelterSplit, from the same source and tests; only the payout token differs.
- Tempo: its own address 0x9978e60da2352a8de02852788d34bd95849a598d, paying USDC.e with TIP-20 memos.
- Arbitrum One: 0x457c89e10a6e66633eda5bf82fd086febb5db147, paying USDC; DonateRouter 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052.
- Base: 0x457c89e10a6e66633eda5bf82fd086febb5db147, paying native USDC; DonateRouter 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052.
- Robinhood Chain: 0x457c89e10a6e66633eda5bf82fd086febb5db147. It has no USDC, so it pays USDG (Paxos); the payouts page never adds USDG to USDC.
Sponsored treats run on all four. The routers open to the public once Pink Paw holds its own key.

## Prior work <!-- criterion: C1, C6 | limit: 900 -->
Judge only the work done from 2026-09-14 to 2026-10-12: ShelterSplit, DonateRouter, CappedSpender and their tests, every mainnet deployment and payout, the payouts and receipt pages, sponsored treats, the Rail SDK and widget, and Catnip Heist. ShelterSplit was first written on 2026-09-25 and first committed on 2026-09-29. Everything else existed before 2026-09-14 and is prior work: the Token Tails game and app on web, iOS and Android [F-015] [F-016], its card and in-app payments [F-020] and its AI cat-story pipeline [F-019]. Also prior work: three Soroban contracts on Stellar mainnet [F-009] and NFT contracts on SKALE [F-010]. The public repo has history back to 2024; its 68 commits since 2026-09-14 are the in-window work.

## AI tools used <!-- criterion: C1 | limit: 700 -->
The team built the in-window code with Claude Code (Anthropic) as a coding assistant: contracts, tests, app code, docs and these drafts. Commits it helped write carry a "Co-Authored-By: Claude" trailer. A person directed the work, and every mainnet deployment and payout was signed and broadcast by a person; the AI never held a mainnet key. The optional treat agent calls the Anthropic API, and the contract caps what it can spend. Prior work: the app uses OpenAI and Gemini for cat stories and portraits [F-019]. The pitch video is recorded by a person. The demo video is real screen footage (the game's solution replay and the live payouts page) cut by a script, with a text-to-speech voice.

## Open source and third-party code <!-- criterion: C5 | limit: 600 -->
ShelterSplit, DonateRouter, CappedSpender and the Rail SDK are MIT licensed: https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split. The contracts have no external libraries (Foundry, Solidity 0.8.24). They compose with existing tokens: Circle USDC and its EIP-3009 transferWithAuthorization, Tempo TIP-20 USDC.e and its transferWithMemo, and Paxos USDG.

## Traction <!-- criterion: C2, C6 | limit: 1000 -->
In the window: four track mainnets live, a TIP-20 memo payout on Tempo, and sponsored treats open to players on seven mainnets. Everything below existed before 2026-09-14 and is disclosed as prior work. Token Tails is live on web, iOS and Android [F-015] [F-016], with five game modes [F-018], and already takes Stripe, in-app purchases and USDC [F-020]. Its X account has 181,010 followers [F-011]. Historical peaks, not current activity: on the SEI chain, Token Tails peaked in the week of 2025-11-17 at 324,422 weekly unique active wallets [F-003] and 875,907 weekly transactions [F-004]; that SEI activity ended in March 2026 and none of it is Tempo data. Blockchain for Good Alliance named Token Tails a top 2025 incubation project [F-014].

## Team <!-- criterion: C6 | limit: 800 -->
{TEAM_MEMBERS} Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. Team location: {TEAM_LOCATION}. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. In the window it wrote ShelterSplit and its test suites, deployed it to seven mainnets, and built the payouts page, sponsored treats and Catnip Heist. Demo: {DEMO_URL}. Pitch: {PITCH_VIDEO_URL}.

## Go-to-market <!-- criterion: C2, C6 | limit: 900 -->
Distribution is the app we already run: Token Tails players, the Catnip Heist link and an X audience of 181,010 [F-011]. Treats are the free first step: a player sends one in a tap and gets a receipt and a share card to post, so each gift advertises the rail. Shelters pay nothing to join; they need a wallet, and the handover flow lets a shelter claim its own. Demand validation so far is the live rail and one showcase shelter, Pink Paw; we do not yet have a second shelter or a paying partner app, and that is the next test (roadmap steps 2 and 4).

## Roadmap and business plan <!-- criterion: C2, C6 | limit: 1200 -->
Token Tails earns from card payments and in-app purchases [F-020]. The plan is to send a fixed share of those purchases to shelters through ShelterSplit (step 3 below). Today: one proof payout on each of seven mainnets, the Tempo memo payout, and sponsored treats live from Token Tails' own capped float. The contract charges shelters nothing. Payout volume grows with app sales, and the public payout record is something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon (done): ShelterSplit on Tempo, Arbitrum, Base and Robinhood Chain mainnets, Pink Paw registered, a real payout with a TIP-20 memo, the payouts page and treats live. Metric: shelters in the registry.
2. Handover and delivery check: the held wallet passes to Pink Paw, which opens wallet gifts and the agent endpoint, and payouts revert if a share does not arrive. Metric: shelters controlling their own wallet.
3. App integration: purchases in Token Tails and Catnip Heist trigger disburseWithMemo(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: other apps pay the same shelters. Metric: distinct payer addresses.
