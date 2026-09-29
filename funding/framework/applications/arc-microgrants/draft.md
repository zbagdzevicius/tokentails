---
program: Arc Microgrants
version: 4
copied_from: colosseum-worlds-fair
---
# Arc Microgrants — submission draft

<!-- Values in single braces are filled after the Arc deploy session: {SPLIT_ADDRESS} (USDC
instance), {EURC_SPLIT_ADDRESS}, {ARC_TX} (first shelter payout), {SHELTER_NAME},
{SHELTER_WALLET}, {PAYOUTS_URL}, {REPO_URL}, {DEMO_VIDEO_URL}. fund check does not flag single
braces: search for "{" before submitting. -->

## Summary <!-- criterion: C1, C3 | limit: 280 -->
ShelterSplit splits native USDC on Arc as it arrives: a plain send, no approve step, pays each registered animal shelter its share in one transaction. First payout: {SHELTER_NAME}, wallet held by Token Tails until handover.

## Problem <!-- criterion: C4 | limit: 1200 -->
Animal shelters run on small donations and have no cheap way to show where the money went. A player who is told that part of a purchase helps shelters cannot check that it happened. Cross-border giving adds bank fees and delays, and most shelters are too small to integrate a payments provider. Token Tails has the demand side: a live consumer cat-rescue app on web, iOS and Android [F-015] [F-016]. What is missing is a neutral, public record of the part of that revenue that goes to the shelters caring for the cats. On Arc a shelter only needs an address that holds USDC. It receives the payout in the same asset it would pay gas in, so there is no second token to buy.

## Solution <!-- criterion: C3, C4 | limit: 1200 -->
ShelterSplit turns a payout promise into a public ledger entry on Arc. The shelter registry lives in the contract: each shelter has a wallet, a name and a share in basis points. Sending USDC to the contract splits it on arrival. Every active shelter gets its share in the same transaction and the remainder goes to the treasury. A second instance does the same in EURC for shelters that account in euros.
What is live for this entry: the USDC and EURC contracts on Arc mainnet, {SHELTER_NAME} registered as the first shelter, one real proof payout, and a public payouts page at {PAYOUTS_URL} that reads Disbursed events straight from Arc. What comes next is the app trigger: a backend job sends a purchase's shelter share through the payment rails the app already has [F-020], and the receipt names the shelter and links to the payout on the Arc explorer.

## How it works <!-- criterion: C1, C2, C3 | limit: 1500 -->
- Arc-native receive path: USDC is Arc's native gas token, and the native balance and the ERC-20 balance are one balance. The contract's payable receive() splits a plain USDC send on arrival, so a payer needs no approve step. disburse(amount, memo) remains for ERC-20 payers such as the EURC instance.
- Finality on inclusion: a payout is settled once included, so a receipt can link to it after one confirmation.
- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never exceed the full payment. Rounding dust and any unallocated share go to the treasury, so the contract holds no balance.
- Events: one Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. The payouts page reads only these.
- Blocklist: a USDC transfer to a blocklisted address reverts. A batch is atomic, so one blocked wallet reverts the payout; the owner deactivates that shelter and its share falls back to the treasury. A test covers this.
- Trust model, stated plainly: the chain proves USDC reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of {SHELTER_NAME}, which consented in writing, and will be handed over to them.
- Safety and tests: reentrancy guard, pause, two-step ownership, safe transfers, caps. A Foundry suite covers splits, dust, the cap, pause, access control, reentrancy, blocked recipients and fuzzing.
- MIT, no external dependencies, at {REPO_URL}.

## On-chain proof <!-- criterion: C1, C2 | limit: 800 -->
Arc mainnet: ShelterSplit (USDC) at {SPLIT_ADDRESS} and ShelterSplit (EURC) at {EURC_SPLIT_ADDRESS}. The first payout to {SHELTER_NAME} is transaction {ARC_TX}, a Disbursed event anyone can look up. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of {SHELTER_NAME}, to be handed over to the shelter. Every payout into it stays public, before and after the handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet [F-009], and ERC-721 contracts on SKALE testnet and mainnet [F-010].

## Traction <!-- criterion: C5 | limit: 1000 -->
None on Arc yet: this is a first proof, and we are asking to be judged on the promise. What ShelterSplit plugs into is live: Token Tails runs on web, iOS and Android [F-015] [F-016], has five game modes [F-018], and already takes card, in-app and USDC payments [F-020]. The promise is simple to check: every purchase-linked shelter payout becomes a public Arc event, starting with {SHELTER_NAME}.

## Team <!-- criterion: C2 | limit: 800 -->
Token Tails is a Lithuanian company, registered as an MB in October 2024 [F-021]. The team shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. The same team writes, tests and deploys the contracts. Demo video: {DEMO_VIDEO_URL}.

## Roadmap and business plan <!-- criterion: C4, C5 | limit: 1200 -->
Token Tails earns from card payments and in-app purchases [F-020]. ShelterSplit routes a fixed share of each purchase to shelters and the rest to the treasury, so the rail costs shelters nothing and grows with app volume. Each milestone has one metric anyone can check on Arc:
- Now: USDC and EURC instances live, {SHELTER_NAME} registered, first payout sent. Metric: shelters in the registry.
- Handover: the wallet held for {SHELTER_NAME} passes to the shelter, announced publicly. Metric: shelters controlling their own wallet.
- App integration: purchases in the app trigger the rail and the receipt links to the payout. Metric: DisbursementBatch events per week.
- Open registry: more shelters join once they confirm their wallets, and other Arc apps pay the same registry. Metric: distinct payer addresses.
