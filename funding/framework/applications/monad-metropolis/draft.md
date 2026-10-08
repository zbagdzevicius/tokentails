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
{MONAD_SPLIT} ShelterSplit on Monad and {MONAD_NETWORK} its network label, both filled by `fund fill`
from deployments.json (mainnet first, else testnet). Monad testnet (10143) is live since Oct 4:
ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147 (Sourcify verified), proof payout
0x6f360be3884051af5e2ae367bf7d66ae095808110756b3fa740a203ef474a556 (1 USDC), native gift
0xf88e8625dd8c1f60ab8cd35e1eab940fecc0e5e41784ef5f43f604449cd1b887 (0.01 MON), DonateRouter
0xe271131be71e29f83084fd34aa6c70d50a2aea71 with a one-signature 0.1 USDC gift
0x5f5099e0cbbe7e7434fac2456d5b0a1ef4f2c787046e976ae617dc6a68f68f36, all to Pink Paw. Monad mainnet
(143) since Oct 7: ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147 (Sourcify exact match), proof payout
0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5 (0.1 USDC to Pink Paw), DonateRouter
0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 (Sourcify exact match, no gift yet). The payouts page lists Monad
testnet and Monad. · {SPLIT_ADDRESS} ShelterSplit on Arc · {DEMO_URL} demo
video · github.com/zbagdzevicius/tokentails public repo. HEIST_URL https://tokentails.com/heist · PAYOUTS_URL
https://tokentails.com/shelter-payouts

Chains, exactly (re-checked 2026-10-08): production serves mainnets only. Mainnet splits are recorded on
7 chains, Monad included, but /shelter/donate/status shows enabled:false on all of them until the
production backend gets its treat wallet key, so no treat runs in production yet. The backend offers the sponsored treat
and the x402 card on every chain with a recorded split of its network class, Monad included; on a
mainnet the x402 card waits for Pink Paw's signed per-chain claim. On Monad, ShelterSplit pays USDC
through disburse(). Do not claim a production sponsored treat on Monad until donate/status shows enabled:true
for chain 143. -->

## Summary <!-- criterion: C1 | limit: 280 -->
ShelterSplit, live on Monad mainnet, pays a cat shelter in USDC in one transaction, with a public receipt. It powers Catnip Heist's give flow: win a round, tap "Send Pink Paw a rescue treat", and a sponsored gift goes out. No wallet and no gas for the player.

## Problem <!-- criterion: C1 | limit: 1200 -->
Apps that say "part of your purchase helps shelters" give the buyer no way to check it. The shelter sees a bank transfer weeks later, if at all, and the buyer sees nothing. Small shelters cannot integrate a payments provider, and cross-border giving adds bank fees and delays. A consumer who wants to give a little, often, has no way to do it: card fees eat a small gift, and a crypto wallet is too much to ask of a game player. Token Tails is a consumer cat-rescue game on web, iOS and Android [F-015] [F-016]; it had the players and the promise, but not a payout anyone could check.

## Solution <!-- criterion: C1 | limit: 1500 -->
Built in the window (all of it since 2026-09-25; the app around it existed before and is context):
- ShelterSplit, the payout rail: a contract registry of shelter wallets and shares. One call splits a payment across every active shelter, with one public event per payout. Three paths: an ERC-20 path for USDC, a memo path for chains whose stablecoin carries a transfer memo, and a native-coin path for chains where the native coin is USDC.
- The give flow: after a Catnip Heist win at https://tokentails.com/heist, a signed-in player (anti-abuse: verified email, account older than a day) taps once and Token Tails pays a small sponsored treat to Pink Paw, once a day, from a capped daily budget.
- Receipts: every treat gets a receipt page and a share card that link to the transaction, and Pink Paw's profile shows a goal meter of the USDC that came in to its campaign wallet.
- The payouts page at https://tokentails.com/shelter-payouts: each shelter and each payout, read from chain events, not from our database.
- An x402-compatible agent endpoint, so a software agent can pay the same shelters and get an adoptable-cat card back. It is built and tested but stays off until Pink Paw holds its own keys.
- ShelterSplit Rail: an MIT SDK and a one-tag donate widget for any other app.
The player never touches a wallet: purchases stay card or in-app payments [F-020].

## How it works <!-- criterion: C1 | limit: 1500 -->
- On Monad, ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147 pays USDC with disburse(amount, memo): it pulls the payment, splits it by basis points and sends rounding dust to a treasury. Fast blocks and low fees settle a small gift before the player leaves the screen.
- Safety: reentrancy guard, pause, two-step ownership, safe transfers, caps on shelters and memo length. Foundry tests cover splits, dust, access control, reentrancy and fuzzing.
- The give flow: a backend wallet with a small float pays, with a memo that holds no personal data. It is funded on Monad mainnet and pays treats in USDC through disburse(); it switches on with the production backend's treat key (Arc runs the same flow on its native-USDC split).
- Agent payments: our onchain-receipt scheme (memo x402:<nonce>, checked over RPC, accepted once) on every chain with a split, Monad included, plus standard x402 exact. On mainnet: only once Pink Paw holds its own key.
- Donor gifts: an ownerless DonateRouter takes a one-signature USDC gift (EIP-3009, which Circle USDC on Monad supports) and reverts if any share would reach the treasury. Live on Monad mainnet at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 and on Monad testnet; off for the public until handover.
- Trust model: the chain proves funds reached the registered wallet, not who controls it.
- ShelterSplit and the Rail SDK are MIT (github.com/zbagdzevicius/tokentails). Demo: {DEMO_URL}.
## On-chain proof <!-- criterion: C1 | limit: 800 -->
Monad mainnet: ShelterSplit at 0x457c89e10a6e66633eda5bf82fd086febb5db147 and DonateRouter at 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, both source verified; proof payout 0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5 (0.1 USDC to Pink Paw), listed on the payouts page. Monad testnet (test coins): a 1 USDC payout, a 0.01 MON native gift and a one-signature 0.1 USDC router gift. Disclosure: Pink Paw (Rožinė pėdutė) is the first shelter, and its receiving wallet is held by Token Tails on behalf of the shelter until handover. Until then Token Tails controls the funds that reach that wallet; the contract itself holds nothing. Prior work, before the window and not submitted: three Soroban contracts on Stellar mainnet [F-009].

## Team <!-- criterion: C1 | limit: 800 -->
Token Tails is a Lithuanian small partnership (MB), registered in October 2024 [F-021]. The same team built and runs the whole product: the app on both stores [F-015] [F-016], the AI pipeline that writes each cat's story [F-019] and payments on three rails [F-020]. In the window it wrote ShelterSplit and its tests, the give flow, receipts, the payouts page, the agent endpoint, the SDK and the Catnip Heist hook. Historical, not current: on the SEI chain the app peaked at 324,422 weekly active wallets [F-003] in November 2025; that activity ended in March 2026 and none of it is Monad data.
