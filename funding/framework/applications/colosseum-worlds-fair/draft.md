---
program: "Colosseum Crypto World's Fair"
version: 4
---
# Colosseum Crypto World's Fair — submission draft

<!-- Values in single braces are filled after the Tempo deploy session: {SPLIT_ADDRESS},
{TEMPO_TX} (first shelter payout), {SHELTER_WALLET}, {PAYOUTS_URL}, {HEIST_URL},
{REPO_URL}, {DEMO_VIDEO_URL}, {PITCH_VIDEO_URL}. fund check does not flag single braces: search
for "{" before submitting. The showcase shelter is Pink Paw (Rožinė pėdutė); state nothing about
it beyond its name and the custody disclosure, and confirm its consent to be named (stated in
On-chain proof) before submitting. {HEIST_URL} is tokentails.com/heist (catnip.tokentails.com was
dropped). Updated 2026-09-30: the giving loop runs on Arc's native-USDC instance, not on Tempo. -->

## Summary <!-- criterion: C2, C3 | limit: 280 -->
Built in the hackathon window: ShelterSplit, a USDC.e payout rail on Tempo with a TIP-20 memo per shelter, a public payouts page, Catnip Heist, and a one-tap sponsored gift to Pink Paw with public receipts. The Token Tails app existed before.

## Problem <!-- criterion: C2 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for.

## Solution <!-- criterion: C3, C4 | limit: 1200 -->
Built between 2026-09-14 and 2026-10-12:
- ShelterSplit, the rail. A registry in the contract (wallet, name, share in basis points). disburse(amount, memo) pulls USDC.e and pays every active shelter its share in one transaction, each with a TIP-20 memo carrying the purchase reference. The rest goes to the treasury.
- The payouts page at {PAYOUTS_URL}: each shelter, what it received and an explorer link per payout, read from chain events. No backend is trusted for the numbers.
- Catnip Heist at {HEIST_URL}, a deterministic voxel stealth game and the new front door for purchases that fund shelters.
- The giving loop: after a Heist win a signed-in player taps "Send Pink Paw a rescue treat", and Token Tails pays a small sponsored gift, once a day, from a capped budget. Each payout gets a receipt page and a share card. Pink Paw's profile carries the custody disclosure, and a campaign meter sums the payouts. The gift runs on the Arc instance first.
- ShelterSplit Rail: an MIT SDK and an embeddable donate widget.
The buyer never touches a wallet: purchases stay card or in-app payments [F-020].

## Why Tempo <!-- criterion: C4, C5 | limit: 900 -->
Tempo is a payments chain, and Token Tails already takes card payments through Stripe [F-020]. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token. Finality is deterministic, so a receipt can link to a payout that has settled. ShelterSplit pays each shelter with TIP-20 transferWithMemo, so the memo on the shelter's own transfer carries the purchase reference and the shelter can reconcile without us. A Tempo test suite runs the contract against a mock TIP-20 at the real USDC.e address and covers transfer-policy reverts, token pause and receive-policy redirects. A policy block reverts the whole batch, so no shelter is paid short.

## How it works <!-- criterion: C1, C5 | limit: 1500 -->
- Registry: the owner adds, updates, deactivates or removes shelters. Shares never add up to more than the payment.
- disburse(amount, memo) pulls USDC.e and splits what arrived, paying each shelter with transferWithMemo. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Dust goes to the treasury. preview(amount) shows the split first.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps. A Foundry suite covers splits, dust, access control, reentrancy and fuzzing; a Tempo suite runs it against a mock TIP-20.
- Known limit: under a Tempo receive policy a shelter can get a Disbursed event without the funds. Wallets are checked before registration; a post-payment balance check is next.
- Sponsored gifts: a backend wallet with a small float pays, with a memo that holds no personal data.
- Agent payments, off until handover: an x402-compatible endpoint. The agent pays donate('x402:<nonce>') and retries with the tx hash, checked over RPC and accepted once. Our own onchain-receipt scheme, no facilitator.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- MIT, at {REPO_URL}.

## On-chain proof <!-- criterion: C1, C4 | limit: 800 -->
Tempo mainnet: ShelterSplit at {SPLIT_ADDRESS}. The first payout to Pink Paw is transaction {TEMPO_TX}, with its memo, and it is listed on the payouts page. Disclosure: the receiving wallet {SHELTER_WALLET} is held by Token Tails on behalf of Pink Paw, to be handed over to the shelter. The shelter consented to be named. Before the hackathon, and disclosed as prior work, the team shipped three Soroban contracts on Stellar mainnet [F-009] and ERC-721 contracts on SKALE testnet and mainnet [F-010].

## Traction <!-- criterion: C2, C6 | limit: 1000 -->
Judge only the in-window work: the rail, the payouts page, Catnip Heist and the giving loop. Everything below existed before 2026-09-14 and is disclosed as prior work. Token Tails is live on web, iOS and Android [F-015] [F-016], with five game modes [F-018], and already takes Stripe, in-app purchases and USDC [F-020]. Historical peaks, not current activity: on the SEI chain, Token Tails peaked at 324,000 monthly active on-chain users [F-003] and 659,000 weekly transactions [F-004] in 2025-26; that SEI activity ended in March 2026 and none of it is Tempo data. Blockchain for Good Alliance named Token Tails a top 2025 incubation project [F-014].

## Team <!-- criterion: C6 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. In the window it wrote ShelterSplit and its test suites, the payouts page and Catnip Heist. Demo: {DEMO_VIDEO_URL}. Pitch: {PITCH_VIDEO_URL}.

## Roadmap and business plan <!-- criterion: C2, C6 | limit: 1200 -->
Token Tails earns from card payments and in-app purchases [F-020]. ShelterSplit sends a fixed share of those purchases to shelters and the rest to the treasury. The contract charges shelters nothing. Payout volume grows with app sales, and the public payout record is something the app can show buyers. Each milestone has one on-chain metric anyone can check:
1. Hackathon: ShelterSplit on Tempo mainnet, Pink Paw registered, a first real payout with a memo, and the payouts page live. Metric: shelters in the registry.
2. Handover and delivery check: the held wallet passes to Pink Paw, which switches on wallet donations and the agent endpoint, and payouts revert if a share does not arrive. Metric: shelters controlling their own wallet.
3. App integration: purchases in Token Tails and Catnip Heist trigger disburse(), and the receipt links to the payout. Metric: DisbursementBatch events per week.
4. Open registry: other apps pay the same shelters. Metric: distinct payer addresses.
