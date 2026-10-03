# Arbitrum Open House Singapore online buildathon — submission

_Generated 2026-10-03T19:13:10.903Z by `fund a:submission arbitrum-singapore` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Arbitrum Open House Singapore online buildathon |
| Deadline | 2026-10-04T15:59:00+08:00 |
| Call | https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 268/280 chars -->

ShelterSplit: a USDC payout rail for animal shelters on {ARB_NETWORK}. One call splits a payment across registered shelters, with a public event per payout. A cat-rescue game feeds the same contract on Arc: a one-tap sponsored treat to Pink Paw, with a public receipt.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. Token Tails is a consumer cat-rescue game on web, iOS and Android, so it has buyers and a promise to keep. What it lacked is a payout record that neither the app nor the shelter has to be trusted for. Other games and apps have the same gap, and none of them wants to run its own payout system.

## Solution

Built in the buildathon window, from 2026-09-25:
- ShelterSplit on {ARB_NETWORK} at {ARB_SPLIT}. A registry in the contract holds each shelter's wallet, name and share in basis points. disburse(amount, memo) pulls Circle USDC and pays every active shelter its share in one transaction. The rest goes to a treasury. Low fees on Arbitrum make small, frequent payouts worth sending.
- The payouts page at https://tokentails.com/shelter-payouts lists each shelter, what it received and an explorer link per payout, read from chain events. It lists every mainnet instance, Arbitrum One and Arc included (a testnet fallback is linked by explorer only). No backend is trusted for the numbers.
- The one-tap sponsored treat: after a win in Catnip Heist (https://tokentails.com/heist), a signed-in player (anti-abuse: verified email, account older than a day) taps "Send Pink Paw a rescue treat". Token Tails pays a small gift from a capped daily budget, and the player gets a receipt page and a share card. It runs on the Arc instance of the same contract today.
- ShelterSplit Rail: an open MIT SDK and a one-tag donate widget, so any app or AI agent can pay the same shelters.
The player never touches a wallet: purchases stay card or in-app payments.

## How it works

- Registry: the owner adds, updates, deactivates or removes shelters. Shares can never add up to more than the payment.
- disburse(amount, memo) pulls the token and splits what actually arrived. One Disbursed(shelter, amount, memo) per shelter and one DisbursementBatch per call. Rounding dust goes to the treasury. preview(amount) shows the split first. The contract never holds funds between calls.
- A second path, donate(memo), splits the native coin. On Arc the native coin is USDC, and it emits separate events so the two decimal scales never mix.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers that handle tokens returning nothing, and caps on shelters and memo length. The Foundry suite covers splits, dust, access control, reentrancy through a malicious token, and fuzzed conservation of the amount.
- Sponsored treats: a backend wallet with a small float pays, once a day per player, with a memo that holds no personal data.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it. The first wallet is held by Token Tails on behalf of Pink Paw until handover.
- ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.

## Deployment

{ARB_NETWORK}: ShelterSplit at {ARB_SPLIT}, paying Circle USDC. {ARC_NETWORK}: the same contract at {SPLIT_ADDRESS}, where the first sponsored treat to Pink Paw is transaction {ARC_TX}, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet. The contract itself holds nothing. Prior work, before the window: three Soroban contracts on Stellar mainnet and ERC-721 contracts on SKALE.

_No ShelterSplit deployment recorded on arbitrum yet — run `fund a:deploy arbitrum mainnet`, then `fund a:record`._

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product. It shipped the app to both app stores, built an AI pipeline that writes each cat's story and paints its portraits, and runs payments on three rails. In the window it wrote ShelterSplit and its tests, the payouts page, Catnip Heist, the sponsored-treat flow and the SDK. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets in November 2025; that activity ended in March 2026 and none of it is Arbitrum data.

