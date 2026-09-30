---
program: Arc Microgrants
version: 5
copied_from: colosseum-worlds-fair
---
# Arc Microgrants — submission draft

<!-- Values in single braces are filled after the Arc deploy session: {SPLIT_ADDRESS} (USDC
instance), {EURC_SPLIT_ADDRESS}, {ARC_TX} (first shelter payout), {SHELTER_WALLET},
{PAYOUTS_URL}, {REPO_URL}, {DEMO_VIDEO_URL}. fund check does not flag single braces: search for
"{" before submitting. The showcase shelter is Pink Paw (Rožinė pėdutė); state nothing about it
beyond its name and the custody disclosure. Before submitting, confirm Pink Paw's written consent
to be named, which the How it works section states. Updated 2026-09-30 to match what is built:
sponsored gifts, receipts, profile, meter, x402 endpoint (off), Rail SDK and widget. -->

## Summary <!-- criterion: C1, C3 | limit: 280 -->
ShelterSplit splits native USDC on Arc as it arrives and pays each registered shelter in one transaction. Players send a sponsored one-tap gift after a game, and every payout gets a public receipt. First shelter: Pink Paw, wallet held by Token Tails until handover.

## Problem <!-- criterion: C4 | limit: 1200 -->
Animal shelters run on small donations and have no cheap way to show where the money went. A player who is told that part of a purchase helps shelters cannot check that it happened. Cross-border giving adds bank fees and delays, and most shelters are too small to integrate a payments provider. Token Tails has the demand side: a live consumer cat-rescue app on web, iOS and Android [F-015] [F-016]. What is missing is a neutral, public record of the part of that revenue that goes to the shelters caring for the cats. On Arc a shelter only needs an address that holds USDC. It receives the payout in the same asset it would pay gas in, so there is no second token to buy.

## Solution <!-- criterion: C3, C4 | limit: 1200 -->
ShelterSplit turns a payout promise into a public ledger entry on Arc. The registry lives in the contract: each shelter has a wallet, a name and a share in basis points. donate(memo), or a plain USDC send, splits the payment on arrival: every active shelter gets its share in the same transaction and the remainder goes to the treasury. A second instance does the same in EURC.
Built around it, all in the public repo:
- One-tap gift: a signed-in player taps "Send Pink Paw a rescue treat" after a Catnip Heist win or on the payouts page. Token Tails pays a small sponsored amount, once per player per day, from a capped daily budget. No wallet, no gas.
- Receipts: each payout has a receipt page decoded from Arc and a downloadable share card.
- Pink Paw's profile with the custody disclosure, and a campaign meter summed from on-chain payouts.
- ShelterSplit Rail: an MIT SDK and a one-tag donate widget any site can embed.
Wallet donations and a paid agent endpoint are built but stay off until Pink Paw holds its own keys.
Live for this entry: both contracts on Arc mainnet, Pink Paw registered, one proof payout, and the payouts page at {PAYOUTS_URL}.

## How it works <!-- criterion: C1, C2, C3 | limit: 1500 -->
- Arc-native path: USDC is Arc's gas token, so the native and ERC-20 balances are one. donate(memo) and receive() split a USDC send with no approve step. disburse(amount, memo) serves ERC-20 payers such as the EURC instance.
- Events: one NativeDisbursed or Disbursed(shelter, amount, memo) per shelter and one batch event per call. The payouts page, receipts and meter read only these.
- Registry: the owner adds, updates, deactivates or removes shelters. Shares never exceed the payment; dust goes to the treasury, so the contract holds no balance.
- Blocklist: a transfer to a blocked wallet reverts the atomic batch; the owner deactivates that shelter. A test covers this.
- Sponsored gifts: a backend wallet with a small float calls donate('tt:<source>:<id>'). The memo holds no personal data.
- Agent payments: an x402-compatible endpoint answers 402 with a price. The agent calls donate('x402:<nonce>') and retries with the tx hash, which the server checks over RPC and accepts once. The scheme is our own onchain-receipt, with no facilitator, since standard facilitators may not support Arc.
- Trust model: the chain proves USDC reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw, which consented in writing, until handover.
- Reentrancy guard, pause, two-step ownership, caps, a fuzzed Foundry suite. MIT, at {REPO_URL}.

## On-chain proof <!-- criterion: C1, C2 | limit: 800 -->
Arc mainnet: ShelterSplit (USDC) at {SPLIT_ADDRESS} and ShelterSplit (EURC) at {EURC_SPLIT_ADDRESS}. The first payout to Pink Paw is transaction {ARC_TX}, a Disbursed event anyone can look up. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. Every payout into it stays public, before and after the handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet [F-009], and ERC-721 contracts on SKALE testnet and mainnet [F-010].

## Traction <!-- criterion: C5 | limit: 1000 -->
None on Arc yet: this is a first proof, and we are asking to be judged on the promise. What ShelterSplit plugs into is live: Token Tails runs on web, iOS and Android [F-015] [F-016], has five game modes [F-018], and already takes card, in-app and USDC payments [F-020]. The promise is simple to check: every purchase-linked shelter payout becomes a public Arc event, starting with Pink Paw.

## Team <!-- criterion: C2 | limit: 800 -->
Token Tails is a Lithuanian company, registered as an MB in October 2024 [F-021]. The team shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. The same team writes, tests and deploys the contracts. Demo video: {DEMO_VIDEO_URL}.

## Roadmap and business plan <!-- criterion: C4, C5 | limit: 1200 -->
Token Tails earns from card payments and in-app purchases [F-020]. ShelterSplit routes a fixed share of each purchase to shelters and the rest to the treasury, so the rail costs shelters nothing and grows with app volume. Each milestone has one metric anyone can check on Arc:
- Now: USDC and EURC instances live, Pink Paw registered, first payout sent, sponsored one-tap gifts switched on. Metric: payouts with a tt: memo per week.
- Handover: the wallet held for Pink Paw passes to the shelter, announced publicly, and wallet donations and the agent endpoint switch on. Metric: shelters controlling their own wallet.
- App integration: purchases in the app trigger the rail and the receipt links to the payout. Metric: batch events per week.
- Open registry: more shelters join once they confirm their wallets, and other sites pay the same registry through the Rail widget. Metric: distinct payer addresses.

