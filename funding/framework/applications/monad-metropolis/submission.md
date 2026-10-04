# Monad Metropolis online hackathon (Consumer Products & Payments track) — submission

_Generated 2026-10-04T07:59:06.037Z by `fund a:submission monad-metropolis` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Monad Metropolis online hackathon (Consumer Products & Payments track) |
| Deadline | 2026-10-13 |
| Call | https://monad.xyz/developers/hackathons/metropolis |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/funding/framework/tracks/a-build/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 247/280 chars -->

A player wins a round of Catnip Heist, taps "Send Pink Paw a rescue treat", and a real stablecoin payment reaches a cat shelter, with a public receipt. No wallet and no gas for the player. ShelterSplit, the payout rail behind it, deploys on Monad.

## Problem

Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. A consumer who wants to give a little, often, has no way to do it: card fees eat a small gift, and a crypto wallet is too much to ask of a game player. Token Tails is a consumer cat-rescue game on web, iOS and Android; it had the players and the promise, but not a payout anyone could check.

## Solution

Built in the window (all of it since 2026-09-25; the app around it existed before and is context):
- ShelterSplit, the payout rail: a contract registry of shelter wallets and shares. One call splits a payment across every active shelter, with one public event per payout. Three paths: an ERC-20 path for USDC, a memo path for chains whose stablecoin carries a transfer memo, and a native-coin path for chains where the native coin is USDC.
- The give flow: after a Catnip Heist win at https://tokentails.com/heist, a signed-in player (anti-abuse: verified email, account older than a day) taps once and Token Tails pays a small sponsored treat to Pink Paw, once a day, from a capped daily budget.
- Receipts: every treat gets a receipt page and a share card that link to the transaction, and Pink Paw's profile shows a goal meter of the USDC that came in to its campaign wallet.
- The payouts page at https://tokentails.com/shelter-payouts: each shelter and each payout, read from chain events, not from our database.
- An x402-compatible agent endpoint, so a software agent can pay the same shelters and get an adoptable-cat card back. It is built and tested but stays off until Pink Paw holds its own keys.
- ShelterSplit Rail: an MIT SDK and a one-tag donate widget for any other app.
The player never touches a wallet: purchases stay card or in-app payments.

## How it works

- On Monad, ShelterSplit at {MONAD_SPLIT} pays USDC with disburse(amount, memo): it pulls the payment, splits what arrived by basis points, and sends rounding dust to a treasury. Fast blocks and low fees make a small gift settle before the player has left the screen.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelters and memo length. A Foundry suite covers splits, dust, access control, reentrancy and fuzzing.
- The give flow runs on the Arc instance at {SPLIT_ADDRESS} today: a backend wallet with a small float pays, with a memo that holds no personal data. First treat: {ARC_TX}. It pays Arc's native USDC through donate(); on Monad the native coin is MON, so moving the treat to Monad needs the backend to use the USDC disburse path, which is not built yet.
- Agent payments, off until handover and on Arc only: our own onchain-receipt scheme (donate('x402:<nonce>'), tx checked over RPC, accepted once), plus standard x402 exact paid straight to the shelter wallet.
- Donor gifts (built, not deployed; chain-agnostic): a DonateRouter with no owner takes a one-signature USDC gift where the chain's USDC supports EIP-3009 (to check on Monad), and reverts if any share would reach the treasury.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it.
- ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.

## Deployment

Monad: ShelterSplit at {MONAD_SPLIT}. Arc: ShelterSplit at {SPLIT_ADDRESS}, first sponsored treat {ARC_TX}, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window and not submitted: three Soroban contracts on Stellar mainnet.

_No ShelterSplit deployment recorded on monad yet — run `fund a:deploy monad mainnet`, then `fund a:record`._

## Build evidence

All 73/73 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `9734bed09985`, built 2026-10-01.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product: the app on both stores, the AI pipeline that writes each cat's story and payments on three rails. In the window it wrote ShelterSplit and its tests, the give flow, receipts, the payouts page, the agent endpoint, the SDK and the Catnip Heist hook. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets in November 2025; that activity ended in March 2026 and none of it is Monad data.

