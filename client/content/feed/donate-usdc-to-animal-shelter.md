---
title: "How to Donate USDC to an Animal Shelter, Step by Step"
seoTitle: "Donate USDC to an Animal Shelter: A Step-by-Step Guide"
description: "How to give USDC straight to a cat shelter's own wallet: check the recipient, send through Moon Rave on Arc, and verify the payout on a public page."
excerpt: "Stablecoins suit small gifts. Here is how to check a shelter's wallet and contract, give USDC to Pink Paw on Arc in a few clicks, and find your gift on-chain."
slug: donate-usdc-to-animal-shelter
category: giving
publishedAt: "2026-10-19"
updatedAt: "2026-10-19"
author: "Token Tails team"
heroImage:
  src: "/feed/web-rave-usdc-checkout.webp"
  alt: "The Moon Rave checkout with the Crypto tab open: 5 USDC on Arc goes from your wallet into Pink Paw's ShelterSplit"
  width: 980
  height: 720
keywords:
  - donate USDC to animal shelter
  - crypto donation animal shelter
  - donate USDC to charity
  - stablecoin donation
  - donate crypto to a cat shelter
intent: give
cta: rave
faq:
  - q: "Can I donate USDC directly to an animal shelter?"
    a: "Yes, if the shelter has its own wallet. On Moon Rave you can give USDC on Arc, and the full amount goes from your wallet to the Pink Paw split, which passes it on to Pink Paw, a cat shelter in Kaunas, Lithuania."
  - q: "Which network should I use to send USDC to Pink Paw?"
    a: "Arc. Moon Rave accepts USDC gifts on Arc only. Splits for Pink Paw also run on other networks, but those are for developers and partners, not for a plain wallet transfer."
  - q: "Is a USDC gift to Pink Paw tax-deductible?"
    a: "No. Moon Rave gifts are not tax-deductible donations, and Token Tails is a private Lithuanian company, not a charity."
  - q: "How do I know my USDC reached the shelter?"
    a: "Your gift is a public event on the ShelterSplit contract. Find it on tokentails.com/shelter-payouts and open its transaction on the Arc explorer."
sources:
  - label: "Moon Rave (give USDC on Arc)"
    url: "https://tokentails.com/rave"
  - label: "Pink Paw shelter payouts (live)"
    url: "https://tokentails.com/shelter-payouts"
  - label: "ShelterSplit source and deployments (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
  - label: "Arc docs: gas and fees"
    url: "https://docs.arc.io/arc/references/gas-and-fees"
related:
  - verify-crypto-donation
  - usdc-payment-splitter-contract
  - moon-rave
---

Donating USDC to an animal shelter directly works when the shelter has its own wallet and the address is public. The simplest way to do it for Pink Paw, a cat shelter in Kaunas, Lithuania, is Moon Rave: you give USDC on Arc from your own wallet, and the full amount goes to the split contract that passes it to the shelter's wallet.

This guide shows what to check before you send, the exact steps, and how to find your gift on-chain afterwards.

<!-- key-takeaways -->
- Check three things first: whose wallet it is, whether the contract source is public, and whether there is a payout history.
- On [Moon Rave](/rave), choose **Crypto (USDC on Arc)**, pick an amount ($1 = 1 cat) and confirm in your wallet.
- The full amount goes from your wallet to the Pink Paw split; the small network fee is charged in USDC on top.
- Your gift shows up on [/shelter-payouts](/shelter-payouts) with a link to its transaction.
- It is a gift, not a tax-deductible donation.

## Why stablecoins work for small gifts

A stablecoin such as USDC is meant to stay at one US dollar. That matters for giving: if you send 5 USDC, the shelter receives 5 USDC, not a coin that may be worth less by the time anyone uses it.

Small gifts also need cheap networks. On Arc, network fees are paid in USDC itself, so you do not need a second coin just for fees. When we checked one native USDC payment into the Pink Paw split on 19 October 2026, its fee was about 0.001 USDC ([transaction](https://explorer.arc.io/tx/0xc1b6da1f8e979b2c57aa2c2ebc90df6b6823535e7449bbf4633a3ed818215e0a)). Fees change with network load, so your wallet shows the real figure before you confirm.

## Before you send: check the recipient

Anyone can post a wallet address and call it a shelter. Before you give to any shelter in crypto, check three things.

1. **Whose wallet is it?** Pink Paw's wallet is `0x3c833562e682dB66C2415b34961595df135f4771`. Token Tails created it and handed it to the shelter staff, who hold the recovery phrase; Token Tails keeps a recovery backup. The chain can prove that money reached this address, not who controls it, so we state the custody openly.
2. **Is the contract source public?** Gifts go through ShelterSplit, an open-source (MIT) contract. Its [source and every deployed address](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split) are on GitHub, and each address has verified source on its explorer.
3. **Is there a payout history?** The [shelter payouts page](/shelter-payouts) lists every payout the split has made, each with a link to its transaction. A real recipient has a history you can read.

If a shelter cannot answer these three questions, give another way.

## Step by step: give USDC to Pink Paw on Arc

You need a browser wallet (an extension or a wallet app's built-in browser) with some USDC on Arc.

1. Open [tokentails.com/rave](/rave) and press **Add a cat**.
2. Pick how many cats: $1, $5, or a custom whole-dollar amount from $10 to $99. **$1 = 1 cat.**
3. Optionally name your cats and add your X account (shown publicly with your cats).
4. Choose the **Crypto** tab (USDC on Arc), then press **Give USDC on Arc**.
5. Your wallet opens. Check the network is Arc and the amount is right, then confirm.
6. The page checks your gift on Arc. When it shows "Gift received", your cats join the dance floor.

<!-- cta:rave -->

What happens on-chain: the gift is one call to the split's payable `donate` function. The split pays Pink Paw's wallet in the same transaction and records one public event per payout. Today the split sets 100% aside for Pink Paw, so your full amount reaches the shelter's wallet; Token Tails takes nothing from it.

Prefer a card? The same page takes card payments: by card, Token Tails pays the full $1 out to Pink Paw on-chain.

## Other networks where the ShelterSplit runs

ShelterSplit also runs on several other networks, each paying out in its own coin:

- **USDC:** Arc, Base, Arbitrum, Avalanche and Monad.
- **EURC:** a separate split on Arc.
- **USDC.e:** Tempo.
- **USDG:** Robinhood Chain.

These coins are different assets, so the payouts page lists each one separately and never adds them together. Moon Rave gifts use Arc only. Do not send a plain transfer to any split address from an exchange or wallet: a split pays out only when called the right way. If you build on these contracts, start with our [developer guide to the USDC payment splitter](/feed/build/usdc-payment-splitter-contract).

## Check your gift on /shelter-payouts and the explorer

After the gift goes through:

1. Open [/shelter-payouts](/shelter-payouts). New payouts appear after a short indexing delay.
2. Find your payout by time and amount, and open its link.
3. On the Arc explorer, check three things: the transaction succeeded, it called the Pink Paw split, and the recipient is Pink Paw's wallet above.

For a fuller walkthrough of reading a transaction, see [how to verify a crypto donation](/feed/giving/verify-crypto-donation).

## Tax and receipts

Moon Rave gifts are not tax-deductible donations. Token Tails is a private company in Lithuania (an MB, a small partnership), not a registered charity, and does not issue charity tax receipts.

What you do get is a public record: your transaction hash and the payout row on [/shelter-payouts](/shelter-payouts). If you need a tax receipt, give through a channel that issues one for a registered charity. Moon Rave suits gifts where a public, checkable trail matters more than a receipt.
