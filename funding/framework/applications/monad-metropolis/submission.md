# Monad Metropolis online hackathon (Consumer Products & Payments track) — submission

_Generated 2026-10-07T23:45:24.930Z by `fund a:submission monad-metropolis` from draft.md, the program profile,
deployments.json and build-evidence.md. Edit those, not this file. Paste each section into the
matching form field._

| Field | Value |
|---|---|
| Project | Token Tails — ShelterSplit |
| Program | Monad Metropolis online hackathon (Consumer Products & Payments track) |
| Deadline | 2026-10-13 |
| Call | https://monad.xyz/developers/hackathons/metropolis |
| Repository | https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split |
| Demo | _(not set — add `demo:` to call.md)_ |

## Summary  <!-- 259/280 chars -->

ShelterSplit, live on Monad mainnet, pays a cat shelter in USDC in one transaction, with a public receipt. It powers Catnip Heist's give flow: win a round, tap "Send Pink Paw a rescue treat", and a sponsored gift goes out. No wallet and no gas for the player.

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

- On Monad, ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147 pays USDC with disburse(amount, memo): it pulls the payment, splits it by basis points and sends rounding dust to a treasury. Fast blocks and low fees settle a small gift before the player leaves the screen.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelters and memo length. Foundry tests cover splits, dust, access control, reentrancy and fuzzing.
- The give flow: a backend wallet with a small float pays, with a memo that holds no personal data. It is funded on Monad mainnet and pays treats in USDC through disburse(); it switches on with the production backend's treat key (Arc runs the same flow on its native-USDC split).
- Agent payments: our onchain-receipt scheme (memo x402:<nonce>, checked over RPC, accepted once) on every chain with a split, Monad included, plus standard x402 exact. On mainnet: only once Pink Paw holds its own key.
- Donor gifts: an ownerless DonateRouter takes a one-signature USDC gift (EIP-3009, which Circle USDC on Monad supports) and reverts if any share would reach the treasury. Live on Monad mainnet at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 and on Monad testnet; off for the public until handover.
- Trust model: the chain proves funds reached the registered wallet, not who controls it.
- ShelterSplit and the Rail SDK are MIT (github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.

## Deployment

Monad mainnet: ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147 and DonateRouter at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, both source verified; proof payout 0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5 (0.1 USDC to Pink Paw), listed on the payouts page. Monad testnet (test coins): a 1 USDC payout, a 0.01 MON native gift and a one-signature 0.1 USDC router gift. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window and not submitted: three Soroban contracts on Stellar mainnet.

| Network | Contract | Transaction | Shelter payouts | Status |
|---|---|---|---|---|
| Monad mainnet (chain 143) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://monadvision.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://monadvision.com/tx/0x62cf2ba31e081bade2af850f66970feaf8a4ac28e9ec7eb8a74516ab454c496c) | [payout 1](https://monadvision.com/tx/0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5) | verified on-chain, source verified |
| Monad testnet (chain 10143) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://testnet.monadvision.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [deploy tx](https://testnet.monadvision.com/tx/0x91108a6f79c8da351b5caa39875b497808b4a423580891d480d25cf27b0c0489) | [payout 1](https://testnet.monadvision.com/tx/0x6f360be3884051af5e2ae367bf7d66ae095808110756b3fa740a203ef474a556) | verified on-chain, source verified |

## Build evidence

All 149/149 Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). Creation bytecode sha256 `6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c`, runtime 11199 bytes, commit `4546c17be4e4`, built 2026-10-05.

## Team

Token Tails is a Lithuanian small partnership (MB), registered in October 2024. The same team built and runs the whole product: the app on both stores, the AI pipeline that writes each cat's story and payments on three rails. In the window it wrote ShelterSplit and its tests, the give flow, receipts, the payouts page, the agent endpoint, the SDK and the Catnip Heist hook. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets in November 2025; that activity ended in March 2026 and none of it is Monad data.

