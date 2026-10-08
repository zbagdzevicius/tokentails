---
program: Team1 Avalanche mini grants
version: 1
copied_from: colosseum-worlds-fair
---
# Team1 Avalanche mini grants — submission draft

<!-- Rewritten 2026-10-08 for Avalanche C-Chain only (the v0 copy pitched Tempo). Form shape
(RULES-COMPLIANCE §2.8): description 280 chars (Summary below), Summary / Milestones / Why You Deserve up
to 4,000 each, amount up to $10k in whole dollars. Ask: $5,000 (confirm before submitting). Name no other
chain in the text: the committee weights long-term Avalanche commitment. Never claim EURC on the C-Chain.
Do not cite F-001 (unverified). Mainnet facts, all read on-chain 2026-10-07/08: ShelterSplit
0x457c89e10a6e66633eda5bf82fd086febb5db147 (deploy 0xe701d3c22300fd10965065c16040f886d9fd91808e08a0460647d74b550bfd50,
Routescan and Sourcify verified), proof payout 0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7
(0.1 USDC to Pink Paw), DonateRouter 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 (verified, no gift yet).
Sponsored treats on Avalanche switch on only when production donate/status shows enabled:true for 43114;
until then say "funded, switching on". -->

## Summary <!-- criterion: C1 | limit: 280 -->
ShelterSplit pays animal shelters in native USDC on Avalanche C-Chain: one call splits a payment across every registered shelter wallet, with a public event per payout. Live on mainnet with a first payout to Pink Paw. MIT, built by Token Tails.

## Problem <!-- criterion: C1 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has the buyers and the promise to keep. What it lacks is a payout record that neither the app nor the shelter has to be trusted for.

## How it works <!-- criterion: C1 | limit: 4000 -->
ShelterSplit turns the shelter promise into a public record on Avalanche C-Chain. The contract holds a shelter registry: each shelter has a wallet, a name and a share in basis points.
- disburse(amount, memo) pulls native USDC (Circle's C-Chain USDC) and pays every active shelter its share in the same transaction, with one Disbursed(shelter, amount, memo) event per shelter and one batch event per call. Rounding dust goes to the treasury, so the contract holds no balance between calls. preview(amount) shows the split before anyone pays.
- Native AVAX gifts are split the same way through donate(memo).
- One-signature gifts: an ownerless DonateRouter takes a USDC gift signed once with EIP-3009 (receiveWithAuthorization), so a donor needs no approve step. It reverts if the payout list changed or any share would reach the treasury. It opens to the public once Pink Paw holds its own key.
- Sponsored treats: after a win in Token Tails' Catnip Heist (https://tokentails.com/heist) a verified player taps "Send Pink Paw a rescue treat" and a backend wallet with a small capped float pays a tiny gift. Its Avalanche float is funded; it switches on with the production treat wallet.
- Public record: https://tokentails.com/shelter-payouts reads the C-Chain events directly, not our database, and every payout gets a receipt page.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelter count, name and memo length. A Foundry suite covers exact splits, rounding dust, the basis-point cap, registry changes, pause, access control, reentrancy and fuzzing, plus invariant tests. MIT licence, no external dependencies: any Avalanche app can call disburse() and pay the same public registry.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. Token Tails holds Pink Paw's first wallet until the shelter takes it over, and says so on every page.

## On-chain proof <!-- criterion: C1 | limit: 800 -->
Avalanche C-Chain mainnet: ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147, source verified on Routescan and Sourcify. First payout to Pink Paw: 0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7 (0.1 USDC, a Disbursed event). DonateRouter at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, source verified. Disclosure: the receiving wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails on behalf of Pink Paw until handover. The team has shipped production contracts before: three Soroban contracts on Stellar mainnet [F-009].

## Milestones <!-- criterion: C1, C2 | limit: 4000 -->
The grant (amount in the form field) is paid in two equal stages, each with one metric anyone can check on the C-Chain.
1. Stage 1 (half the grant, about four weeks): Pink Paw takes over its own wallet (the registry entry is rotated on-chain and announced), sponsored treats and one-signature DonateRouter gifts open on Avalanche, and three more shelters with their own wallets join the registry. Metric: active shelters in the C-Chain registry, and Disbursed events with a tt: memo per week.
2. Stage 2 (half the grant, about eight weeks): purchases in the Token Tails app route a fixed share through disburse() on Avalanche, each purchase receipt links to its C-Chain payout, and the Rail widget lets other Avalanche apps pay the same registry. Metric: batch events per week and distinct payer addresses.
Budget: shelter onboarding and wallet setup support, C-Chain gas and the sponsored-treat float, the app integration work, and an external review of ShelterSplit and DonateRouter before volume grows.

## Why us <!-- criterion: C2 | limit: 4000 -->
The contract is already live and verified on Avalanche mainnet with a real payout, so the grant funds adoption, not a prototype. Token Tails has the demand side: a consumer cat-rescue app on web, iOS and Android [F-015] [F-016] with five game modes [F-018] that already takes card, in-app and USDC payments [F-020], so payouts grow with app sales and cost shelters nothing. We plan to keep Avalanche as a home for the rail: the registry, the router and the payouts page are built to stay, and every milestone is measured on the C-Chain.

## Traction <!-- criterion: C2 | limit: 1000 -->
On Avalanche: one mainnet split, one router and a first payout to Pink Paw, all public. Around it, from before this grant: Token Tails is live on web, iOS and Android [F-015] [F-016] with five game modes, including an 80-level platformer and a 30-level match-3 with leaderboards [F-018]. Its production Stellar contract has 1,218,693 invocations [F-007]. Blockchain for Good Alliance named Token Tails a top 2025 incubation project [F-014].

## Team <!-- criterion: C2 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. It also wrote, tested and deployed the Stellar contracts behind the game [F-009], and it wrote ShelterSplit, DonateRouter and their test suites.
