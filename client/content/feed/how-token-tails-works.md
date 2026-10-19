---
title: "How Token Tails Gets Money to a Real Cat Shelter"
seoTitle: "How Token Tails Works: Where the Money Goes"
description: "Token Tails makes free cat games tied to Pink Paw, a cat shelter in Kaunas. See the three ways you can help, where money goes and how to check each payout."
excerpt: "Free cat games, one real shelter, and payouts anyone can check. Here is who pays what, where it goes, and how to verify it."
slug: how-token-tails-works
category: giving
publishedAt: "2024-05-22"
updatedAt: "2026-10-19"
author: "Token Tails team"
heroImage:
  src: "/landing/game-bg.webp"
  alt: "Pixel-art floating islands with cats, cat trees and a small garden: the Token Tails game world"
  width: 2752
  height: 1536
keywords:
  - how Token Tails works
  - Token Tails Pink Paw
  - Pink Paw cat shelter
  - check a shelter donation
intent: give
cta: heist
faq:
  - q: "Is Token Tails a charity?"
    a: "No. Token Tails is a small Lithuanian company (an MB) that makes cat games. It sends money to Pink Paw, a cat shelter in Kaunas, and every on-chain payout is public at /shelter-payouts."
  - q: "Do I have to pay anything to help?"
    a: "No. Catnip Heist is free and needs no sign-up. After a win, one tap and Token Tails sends Pink Paw a 0.01 USDC treat from its own budget."
  - q: "Where does the $1 go in Moon Rave?"
    a: "By card, Token Tails pays the full $1 out to Pink Paw on-chain. In USDC on Arc, the full $1 goes from the giver's wallet straight to the Pink Paw split."
  - q: "Can Paws or Tails be cashed out?"
    a: "No. Paws and Tails are points inside the game. They are never money."
  - q: "Which shelter receives the money?"
    a: "Pink Paw (Rožinė pėdutė), a cat shelter in Kaunas, Lithuania. It is the only shelter Token Tails pays today."
sources:
  - label: "Shelter payouts (every payout, with explorer links)"
    url: "https://tokentails.com/shelter-payouts"
  - label: "Impact totals and evidence labels"
    url: "https://tokentails.com/impact"
  - label: "ShelterSplit and DonateRouter source (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
related:
  - pink-paw-cat-shelter-kaunas
  - verify-crypto-donation
  - moon-rave
legacySlugs:
  - how-token-tails-saves-cats-with-web3-gaming
claims:
  - C-004
  - C-005
  - F-026
---

Token Tails makes free cat games in the browser and ties them to one real shelter: Pink Paw (Rožinė pėdutė) in Kaunas, Lithuania. Anyone can help in three ways, and every payout to the shelter is public at [tokentails.com/shelter-payouts](/shelter-payouts): it is paid out in stablecoins through open-source contracts.

This page explains who pays what, where it goes, and what you can and cannot verify yourself.

<!-- key-takeaways -->
- Playing is free. After a win in Catnip Heist, one tap and Token Tails sends Pink Paw a 0.01 USDC treat (one treat per player per UTC day). No sign-up.
- Moon Rave is $1 = 1 cat. By card, Token Tails pays the full $1 out to Pink Paw on-chain; in USDC on Arc, the full $1 goes from the giver's wallet to the Pink Paw split.
- Pink Paw's share is 50% of each $5 shelter cat.
- Each on-chain payout is listed at /shelter-payouts with a link to its transaction.

## The short version

Token Tails is a small Lithuanian company (an MB) that makes cozy cat games: [Catnip Heist](/heist), [the main game](/game), [Moon Rave](/rave), [Bad Cat Daily](/badcat) and [Pink Paw Knight](/swordcat). They run in the browser, and Catnip Heist and the main game need no sign-up to start.

The shelter side is real. Pink Paw is a cat shelter in Kaunas, and the money Token Tails sends it arrives in Pink Paw's wallet as USDC or another stablecoin.

Why stablecoins? Each payout becomes a public record on a blockchain. You do not have to trust a screenshot or a yearly report: you can open the transaction.

## Three ways you can help Pink Paw

### 1. Free treats that Token Tails sends

Win a [Catnip Heist](/heist) run, or save a kitten in [Pink Paw Knight](/swordcat), and the game offers a tap. Tap, with no sign-in needed, and Token Tails sends Pink Paw a 0.01 USDC treat from its own budget (one treat per player per UTC day). It costs the player nothing.

The treat budget has public limits: 1 USDC of treats a day, at most 100 treats a day on Arc, reset at 00:00 UTC. When the day's treats are gone, the game says so. You can also tap for a treat without playing at [/shelter-payouts/give](/shelter-payouts/give).

### 2. Moon Rave: $1 = 1 cat

[Moon Rave](/rave) is a moonlit dance floor for Pink Paw. Every $1 paid out for Pink Paw on-chain puts one more cat on the floor, and much of the floor today comes from sponsor gifts (see below). Anyone can add a cat for $1:

- **By card.** Token Tails pays the full $1 out to Pink Paw on-chain.
- **In USDC on Arc.** The full $1 goes from the giver's wallet straight to the Pink Paw split.

More detail: [Moon Rave: $1 for a cat shelter](/feed/giving/moon-rave).

### 3. $5 shelter cats

In the main game's Shelter you can meet Pink Paw's cats as pixel cards. A shelter cat card costs $5, by card or crypto, on the web. Pink Paw's share is 50% of each $5 shelter cat; the other half stays with Token Tails. How it works: [Shelter cats in Token Tails](/feed/giving/shelter-cats-in-token-tails).

<!-- cta:heist -->

## How to check every payout

Open [/shelter-payouts](/shelter-payouts). It lists the payouts of the ShelterSplit contracts, read from public on-chain events. Each amount links to its transaction on that network's block explorer.

1. Pick a payout and open its transaction.
2. Check the recipient. Since 16 October 2026, the mainnet splits pay Pink Paw's wallet, `0x3c833562e682dB66C2415b34961595df135f4771`.
3. Check the amount and the coin. Totals are shown per coin (USDC, EURC, USDC.e, USDG) and never added across coins.

<!-- payouts-live -->

**Custody disclosure.** Token Tails created Pink Paw's wallet and keeps a recovery backup; the shelter's staff hold the recovery phrase. Before 16 October 2026, payouts went to a wallet Token Tails held for the shelter. The chain proves that money reached the registered wallet, not who controls it.

**Sponsor gifts.** Most payouts so far carry a `motored:` memo. Those are sponsor gifts from Motored, a company owned by Token Tails' founder (a related party). They are not players or outside givers.

The [/impact](/impact) page labels every figure by how you can check it:

- **ON-CHAIN · SHELTER WALLET**: an indexed payout to the shelter's own wallet.
- **ON-CHAIN · CUSTODIAL**: an indexed payout to a wallet Token Tails held for the shelter, before the handover.
- **COMPANY-REPORTED**: Token Tails' own figure. No outside source has confirmed it.

A step-by-step walkthrough is in [How to verify a crypto donation](/feed/giving/verify-crypto-donation).

## What Token Tails reports but you cannot check on-chain

The on-chain payouts started on 7 October 2026. Token Tails also reports giving directly, outside these contracts. Its own figure is "$40K+ donated directly in crypto and goods (Oct 2026, company-reported)".

That number is a founders' statement. It comes with no public recipient list, so it carries the COMPANY-REPORTED label and is never added to the on-chain totals.

## The contracts are open source

The payouts run through three small Solidity contracts, MIT licensed, with no external dependencies: [contracts/shelter-split on GitHub](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split).

- **ShelterSplit** pays every active shelter in the same transaction and emits one public event per payout. The remainder and rounding dust go to a treasury, so the contract holds no balance between calls.
- **DonateRouter** is a front door with no owner: a gift given through it can never reach the treasury.
- **CappedSpender** limits how much an agent can give per gift and per day, with caps fixed at deploy.

Developers can read the full walkthrough in [A USDC payment splitter contract](/feed/build/usdc-payment-splitter-contract).

## What Paws and Tails are

Paws and Tails are points you collect inside the games. They unlock things in the game and nothing else. They are never money, and no amount of play turns them into a payout.

## Where are the totals?

On the live pages, not in this article. A number printed here would be out of date by tomorrow, so the current figures sit on [/shelter-payouts](/shelter-payouts) (each payout, per coin) and [/impact](/impact) (totals with their evidence labels).

<!-- cta:payouts -->
