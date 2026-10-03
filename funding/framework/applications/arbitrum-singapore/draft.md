---
program: Arbitrum Open House Singapore online buildathon
version: 1
copied_from: colosseum-worlds-fair
---
# Arbitrum Open House Singapore online buildathon — submission draft

<!-- Deadline 2026-10-04 15:59 on HackQuest, zone not shown (Singapore time worst case: 07:59 UTC, 10:59 Vilnius; submit Oct 3 evening). Build window 2026-09-13 to 2026-10-04, so all of
ShelterSplit and the giving loop fall inside it. Testnet and mainnet both qualify; we enter with
Arbitrum One mainnet. The public page lists no form fields or limits: the sections below follow the
profile (Summary, Problem, Solution, How it works, Deployment, Build evidence, Team), which matches
the usual HackQuest project form (one-line intro, description, GitHub, demo video, deployed contract).
Check the real form when you open it.

Fill after the Oct 2 deploy (single braces, fund check does not flag them, search for "{"):
{ARB_SPLIT} ShelterSplit on Arbitrum One (or Arbitrum Sepolia if the mainnet wave slips; both qualify) · {ARB_NETWORK} "Arbitrum One" or "Arbitrum Sepolia" · {SPLIT_ADDRESS} ShelterSplit on Arc ({ARC_NETWORK} is "Arc" for mainnet, "Arc testnet" otherwise) · {ARC_TX} first
sponsored treat on Arc · {DEMO_URL} demo video · github.com/zbagdzevicius/tokentails public repo.
HEIST_URL https://tokentails.com/heist · PAYOUTS_URL https://tokentails.com/shelter-payouts

Be exact about chains: the one-tap sponsored treat and the x402 endpoint run on Arc only (the
backend config is Arc-only). On Arbitrum One, ShelterSplit pays native USDC through disburse().
Do not claim a sponsored treat on Arbitrum. Paxos USDG bonus: ShelterSplit takes any ERC-20 at
deploy time, but no USDG instance is deployed and the USDG address on Arbitrum One is not in
chains.json. Mention USDG only as a constructor argument away, unless a USDG instance is deployed
and recorded before submitting.

If the backend is still down when you submit (no treat tx yet), run `fund fill arbitrum-singapore --write --fallbacks`:
it swaps the present-tense treat sentences for "built, switching on" wording (fill-map.json _fallbacks). -->

## Summary <!-- criterion: C2, C3 | limit: 280 -->
ShelterSplit: a USDC payout rail for animal shelters on {ARB_NETWORK}. One call splits a payment across registered shelters, with a public event per payout. A cat-rescue game feeds the same contract on Arc: a one-tap sponsored treat to Pink Paw, with a public receipt.

## Problem <!-- criterion: C2, C4 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016], so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for. Other games and apps have the same gap, and none of them wants to run its own payout system.

## Solution <!-- criterion: C2, C3, C4 | limit: 1500 -->
Built in the buildathon window, from 2026-09-25:
- ShelterSplit on {ARB_NETWORK} at {ARB_SPLIT}. A registry in the contract holds each shelter's wallet, name and share in basis points. disburse(amount, memo) pulls Circle USDC and pays every active shelter its share in one transaction. The rest goes to a treasury. Low fees on Arbitrum make small, frequent payouts worth sending.
- The payouts page at https://tokentails.com/shelter-payouts lists each shelter, what it received and an explorer link per payout, read from chain events. It lists every mainnet instance, Arbitrum One and Arc included (a testnet fallback is linked by explorer only). No backend is trusted for the numbers.
- The one-tap sponsored treat: after a win in Catnip Heist (https://tokentails.com/heist), a signed-in player (anti-abuse: verified email, account older than a day) taps "Send Pink Paw a rescue treat". Token Tails pays a small gift from a capped daily budget, and the player gets a receipt page and a share card. It runs on the Arc instance of the same contract today.
- ShelterSplit Rail: an open MIT SDK and a one-tag donate widget, so any app or AI agent can pay the same shelters.
The player never touches a wallet: purchases stay card or in-app payments [F-020].

## How it works <!-- criterion: C1 | limit: 1500 -->
- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the payment.
- disburse(amount, memo) pulls the token and splits what actually arrived. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Rounding dust goes to the treasury. preview(amount) shows the split first. The contract never holds funds between calls.
- A second path, donate(memo), splits the native coin. On Arc the native coin is USDC, and it emits separate events so the two decimal scales never mix.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers that handle tokens returning nothing, and caps on shelters and memo length. The Foundry suite covers splits, dust, access control, reentrancy through a malicious token, and fuzzed conservation of the amount.
- Sponsored treats: a backend wallet with a small float pays, once a day per player, with a memo that holds no personal data.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.

## On-chain proof <!-- criterion: C1 | limit: 800 -->
{ARB_NETWORK}: ShelterSplit at {ARB_SPLIT}, paying Circle USDC. {ARC_NETWORK}: the same contract at {SPLIT_ADDRESS}, where the first sponsored treat to Pink Paw is transaction {ARC_TX}, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet. The contract itself holds nothing. Prior work, before the window: three Soroban contracts on Stellar mainnet [F-009] and ERC-721 contracts on SKALE [F-010].

## Team <!-- criterion: C2 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product. It shipped the app to both app stores [F-015] [F-016], built an AI pipeline that writes each cat's story and paints its portraits [F-019], and runs payments on three rails [F-020]. In the window it wrote ShelterSplit and its tests, the payouts page, Catnip Heist, the sponsored-treat flow and the SDK. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets [F-003] in November 2025; that activity ended in March 2026 and none of it is Arbitrum data.
