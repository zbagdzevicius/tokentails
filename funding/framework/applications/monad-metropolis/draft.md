---
program: Monad Metropolis online hackathon (Consumer Products & Payments track)
version: 1
copied_from: colosseum-worlds-fair
---
# Monad Metropolis online hackathon (Consumer Products & Payments track) — submission draft

<!-- RULES NOT VERIFIED. The official rules sit behind the hackathon.monad.xyz login. The public page
says: build window 1 Sep to 13 Oct (year not shown), submission 13 Oct, existing projects welcome
only if "the work you submit is new" and "what you show on 13 Oct should have been built during the
six weeks". Log in and confirm the year, the deadline time zone, mainnet vs testnet, excluded
countries and KYC before submitting. Required by the public page: working product with a public
project profile, demo video, short written description, code link.

NEW-WORK RULE: show only what was built since 2026-09-01. The work since 2026-09-25 is listed in
"Built in the window" below, and the prior work is labelled as context. Do not present the Token Tails
app, its game modes or the Stellar contracts as hackathon work.

Fill after the deploy (single braces, fund check does not flag them, search for "{"):
{MONAD_SPLIT} ShelterSplit on Monad (not in the Oct 2 wave yet: the Monad chain ID and USDC address
in chains.json are unverified, and the payouts page has no Monad entry; add chain 143 to
client/components/shelter-payouts/chains.ts or leave Monad off the payouts claim) ·
{SPLIT_ADDRESS} ShelterSplit on Arc · {ARC_TX} first sponsored treat on Arc · {DEMO_URL} demo
video · github.com/zbagdzevicius/tokentails public repo. HEIST_URL https://tokentails.com/heist · PAYOUTS_URL
https://tokentails.com/shelter-payouts

Chains, exactly: the one-tap sponsored treat and the x402 endpoint run on Arc only today. On Monad,
ShelterSplit would pay USDC through disburse(). Do not claim a sponsored treat on Monad. -->

## Summary <!-- criterion: C1 | limit: 280 -->
A player wins a round of Catnip Heist, taps "Send Pink Paw a rescue treat", and a real stablecoin payment reaches a cat shelter, with a public receipt. No wallet and no gas for the player. ShelterSplit, the payout rail behind it, deploys on Monad.

## Problem <!-- criterion: C1 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. A consumer who wants to give a little, often, has no way to do it: card fees eat a small gift, and a crypto wallet is too much to ask of a game player. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016]; it had the players and the promise, but not a payout anyone could check.

## Solution <!-- criterion: C1 | limit: 1500 -->
Built in the window (all of it since 2026-09-25; the app around it existed before and is context):
- ShelterSplit, the payout rail: a contract registry of shelter wallets and shares. One call splits a payment across every active shelter, with one public event per payout. Three paths: an ERC-20 path for USDC, a memo path for chains whose stablecoin carries a transfer memo, and a native-coin path for chains where the native coin is USDC.
- The give flow: after a Catnip Heist win at https://tokentails.com/heist, a signed-in player (anti-abuse: verified email, account older than a day) taps once and Token Tails pays a small sponsored treat to Pink Paw, once a day, from a capped daily budget.
- Receipts: every treat gets a receipt page and a share card that link to the transaction, and Pink Paw's profile shows a campaign meter of what it received.
- The payouts page at https://tokentails.com/shelter-payouts: each shelter and each payout, read from chain events, not from our database.
- An x402-compatible agent endpoint, so a software agent can pay the same shelters and get an adoptable-cat card back. It is built and tested but stays off until Pink Paw holds its own keys.
- ShelterSplit Rail: an MIT SDK and a one-tag donate widget for any other app.
The player never touches a wallet: purchases stay card or in-app payments [F-020].

## How it works <!-- criterion: C1 | limit: 1500 -->
- On Monad, ShelterSplit at {MONAD_SPLIT} pays USDC with disburse(amount, memo): it pulls the payment, splits what arrived by basis points, and sends rounding dust to a treasury. Fast blocks and low fees make a small gift settle before the player has left the screen.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelters and memo length. A Foundry suite covers splits, dust, access control, reentrancy and fuzzing.
- The give flow runs on the Arc instance at {SPLIT_ADDRESS} today: a backend wallet with a small float pays, with a memo that holds no personal data. First treat: {ARC_TX}. It pays Arc's native USDC through donate(); on Monad the native coin is MON, so moving the treat to Monad needs the backend to use the USDC disburse path, which is not built yet.
- Agent payments, off until handover and on Arc only: our own onchain-receipt scheme (donate('x402:<nonce>'), tx checked over RPC, accepted once), plus standard x402 exact paid straight to the shelter wallet.
- Donor gifts (built, not deployed; chain-agnostic): a DonateRouter with no owner takes a one-signature USDC gift where the chain's USDC supports EIP-3009 (to check on Monad), and reverts if any share would reach the treasury.
- Trust model: the chain proves the funds reached the registered wallet, not who controls it.
- ShelterSplit and the Rail SDK are MIT (shelter-split/, shelter-rail/ in github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.

## On-chain proof <!-- criterion: C1 | limit: 800 -->
Monad: ShelterSplit at {MONAD_SPLIT}. Arc: ShelterSplit at {SPLIT_ADDRESS}, first sponsored treat {ARC_TX}, listed on the payouts page. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window and not submitted: three Soroban contracts on Stellar mainnet [F-009].

## Team <!-- criterion: C1 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product: the app on both stores [F-015] [F-016], the AI pipeline that writes each cat's story [F-019] and payments on three rails [F-020]. In the window it wrote ShelterSplit and its tests, the give flow, receipts, the payouts page, the agent endpoint, the SDK and the Catnip Heist hook. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets [F-003] in November 2025; that activity ended in March 2026 and none of it is Monad data.
