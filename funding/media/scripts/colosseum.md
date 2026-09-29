---
out: demo-colosseum.mp4
voice: Samantha
rate: 145
var.SHELTER_NAME: our partner shelter
var.SPLIT_ADDRESS: {SPLIT_ADDRESS}
var.TEMPO_TX: {TEMPO_TX}
---
# Token Tails at the Crypto World's Fair: Tempo track

Narration for the Colosseum demo (3 minutes or less). Same format as `arc.md`. Rules for this one:
only in-window work is presented as the build (the rail, the payouts page, Catnip Heist); the app is
disclosed as pre-existing; traction is historical and labelled; no registered-user headline.

## ShelterSplit on Tempo
visual: card
title: ShelterSplit on Tempo\NBuilt September 14 to October 12

This is ShelterSplit on Tempo, from Token Tails.
Everything we present as our build was made inside the hackathon window: the payout rail, the public payouts page, and Catnip Heist, the game you are about to see.
The Token Tails app itself existed before the hackathon, and we say so up front.

## Catnip Heist
visual: heist

Catnip Heist is a voxel stealth game, built during the hackathon.
Here it plays its bundled solution replay at double speed.
The game is deterministic: the same inputs always give the same run, so a replay is a proof of the result.
It is the new front door for purchases that fund shelters.

## Why Tempo
visual: card
title: Stablecoin fees, memo receipts\NUSDC.e with TIP-20 transferWithMemo

Tempo is a payments chain. Fees are paid in stablecoins, so neither the app nor a shelter has to hold a volatile gas token.
ShelterSplit pays out in USDC.e, and each payout uses TIP-20 transfer with memo, so every shelter receives a receipt that carries the purchase reference.
Finality is deterministic, so a receipt can link to a payout that has settled.

## The payouts page
visual: payouts
title: Public payouts page\NRead straight from on-chain events

The payouts page reads the contract's events straight from the chain.
It lists each shelter and what it has received, and it links every payout to the explorer.
No backend has to be trusted for the numbers.

## A named shelter
visual: card
title: First shelter: {SHELTER_NAME}\NWallet held by Token Tails until handover\NShelterSplit {SPLIT_ADDRESS}\NFirst payout {TEMPO_TX}

The first shelter on the registry is {SHELTER_NAME}, and they agreed to be named.
The shelter's wallet is held by Token Tails on behalf of {SHELTER_NAME}, and it will be handed over to them.
Until then, every payout into it is public.
The contract and the first payout are on screen now.

## Honest traction
visual: heist

About traction. The Token Tails numbers you may have seen are historical peaks.
That on-chain activity ran on the SEI chain, and it ended in March 2026. We do not claim it for Tempo.
What carries over is the team that shipped it, and an app on web, iOS and Android that already takes card and in-app payments.

## The business
visual: card
title: Open source, MIT\NAny app can pay the same shelters

The business is simple. A fixed share of each purchase goes to shelters through the rail, and the rest goes to the treasury.
The contract charges shelters nothing, and it is open source, so any app can pay the same shelter registry.
Token Tails. Thank you for watching.
