---
out: demo-arc.mp4
voice: Samantha
rate: 145
var.SHELTER_NAME: our partner shelter
var.SPLIT_ADDRESS: {SPLIT_ADDRESS}
var.ARC_TX: {ARC_TX}
---
# Token Tails on Arc: ShelterSplit

Narration for the Arc Microgrants demo. `make-demo.mjs` reads this file. Each `##` heading is one
segment. `visual:` picks the footage (`heist`, `payouts` or `card`), `title:` is the large on-screen
text for cards (and for `payouts` segments when no payouts URL was recorded). Every other line is
spoken by macOS `say` and burned in as captions. `{VAR}` values come from `--var KEY=value`, falling
back to the `var.` defaults above. Keep addresses and hashes out of the spoken text: they go in titles.

## ShelterSplit on Arc
visual: card
title: ShelterSplit on Arc\NA public USDC payout rail for animal shelters

This is ShelterSplit, a shelter payout rail built for Arc.
Token Tails is a cat rescue game.
When a player buys something, a fixed share should reach a real animal shelter, and anyone should be able to check that it did.

## Where the purchases come from
visual: heist

What you are watching is Catnip Heist, our voxel stealth game, playing its bundled solution replay at double speed.
Two cats sneak past guard dogs, collect coins and free a caged friend.
Games like this are where the purchases will come from, once the purchase pledge starts.
The part we built for Arc is what happens to the money next.

## Why Arc
visual: card
title: Native USDC\NSend it, and it splits on arrival

On Arc, USDC is the native gas token, and the native balance and the ERC-20 balance are the same money.
So ShelterSplit can accept a plain USDC send, with no approve step, and split it the moment it arrives.
Every registered shelter gets its share in the same transaction, and each payout emits its own event.
Transactions are final on inclusion, so a receipt can link to a payout that has already settled.
A second instance does the same in EURC, for shelters that think in euros.

## A named shelter
visual: payouts
title: First shelter: {SHELTER_NAME}\NWallet held by Token Tails until handover

The first shelter on the registry is {SHELTER_NAME}.
One thing we disclose plainly.
The shelter's wallet is held by Token Tails on behalf of {SHELTER_NAME}, and it will be handed over to them.
Until then, every payout into that wallet is public on the Arc explorer, so nothing can go missing quietly.

## The proof payout
visual: card
title: ShelterSplit {SPLIT_ADDRESS}\NFirst payout {ARC_TX}

The contract is live on Arc mainnet, and the first real disbursement has already run.
The contract address and that transaction are on screen now, and they are linked in our submission.

## Open and tested
visual: heist

ShelterSplit is MIT licensed and has no external dependencies.
Its Foundry test suite covers exact splits, rounding dust, pause, access control, reentrancy, blocked recipients and fuzzing.
Any app on Arc can call it and pay the same public shelter registry.

## What comes next
visual: card
title: Promise over traction\NEvery purchase, a public payout

We are not here with traction on Arc. This is a first proof, and the promise is the point.
Next, purchases in the app trigger the rail, each receipt names the shelter and links to its payout, and more shelters join once they confirm their wallets.
Token Tails. Every purchase, a public payout to a real shelter.
