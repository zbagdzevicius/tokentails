# Colosseum World's Fair: image set (arena.colosseum.org project page)

Made on 2026-10-04 from existing repo art and real screenshots only: no generated or stock images, and no
sponsor, judge or chain logos. Captions follow `funding/framework/applications/colosseum-worlds-fair/submission.md`.

Platform spec: the Colosseum FAQ asks for "a product logo or graphic". It is square and shown at about 225 px, so
upload 1024x1024. **The size limit is not verified**; every file here is under 1.3 MB. No other image field is
confirmed, so files 02 to 08 go into the pitch video, the product demo, the slides, the README or X posts, or into an
image or gallery field if Arena shows one.

Re-rendered 2026-10-08 after the mainnet wave, from fresh screenshots of the **live site** (tokentails.com, about
07:30 UTC, `../_shared/screens-mainnet.mjs`). ShelterSplit is live on 7 mainnets: `0x457c…b147` on Arbitrum One, Base,
Robinhood Chain, Arc, Avalanche and Monad, and `0x9978…598d` on Tempo (nonce-1 address after an out-of-gas deploy).
There are 9 mainnet payouts so far, all **sent by Token Tails**: one 0.1 proof payout per contract plus the Tempo
campaign-memo payout (0.1 USDC.e, memo "Catnip Heist campaign", tx `0xcd33…b8b5`). Sponsored treats are live; the first
real treat is still to come. Pink Paw's wallet is held by Token Tails until handover, and the images say so.

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `01-logo-1024.png` | 1024x1024, 684 KB | **Arena project logo** (main pick). The cat bust sits on the bottom edge, so it also works under a circle crop | Token Tails pixel-art cat logo on a night-sky temple |
| `01b-graphic-square-1024.png` | 1024x1024, 924 KB | Use it instead of 01 if the field is labelled "graphic" rather than logo; it also works as a square social post | Token Tails logo with the words "ShelterSplit: shelter payouts you can check" |
| `02-cover-1920x1080.jpg` | 1920x1080, 372 KB | Cover or gallery image, the pitch video title card, the first slide | ShelterSplit, a USDC payout rail for animal shelters, live on Tempo, Arbitrum, Base and Robinhood Chain mainnet (plus Arc, Avalanche and Monad). Shown with the live payouts feed and the Tempo mainnet receipt with the memo "Catnip Heist campaign". |
| `02-cover-1200x630.jpg` | 1200x630, 200 KB | X post or link card, Discord announcement | Same as above |
| `03-diagram-one-contract-seven-mainnets-1920x1080.png` | 1920x1080, 1.2 MB | Pitch "how it works" slide, README, the "Other chains" section | One ShelterSplit source (73/73 Foundry tests) on seven mainnets, with the coin each pays: Tempo USDC.e (2 payouts, one with a TIP-20 memo), Arbitrum USDC, Base USDC, Robinhood Chain USDG (the four Colosseum tracks), plus Arc USDC and EURC, Avalanche USDC and Monad USDC, all paying one Pink Paw wallet held by Token Tails until handover. 9 mainnet payouts, first payouts sent by Token Tails. |
| `04-receipts-four-tracks-1920x1080.png` | 1920x1080, 1.1 MB | Pitch "proof" slide, one image per entered track, X thread | Four mainnet receipts from the same contract source on Tempo, Arbitrum One, Base and Robinhood Chain, each 0.1 (USDC.e, USDC, USDC, USDG) to Pink Paw (Rožinė pėdutė). Tempo's carries the campaign memo; the others are Token Tails' first payouts. |
| `05-diagram-tempo-memo-flow-1920x1080.png` | 1920x1080, 1.2 MB | Tempo track slide, the "Why Tempo" section | disburseWithMemo splits a payment in one transaction and pays each shelter with TIP-20 transferWithMemo, so the memo is on the shelter's own transfer. Next to it, the real Tempo mainnet payout: 0.1 USDC.e with the memo "Catnip Heist campaign" (contract 0x9978…598d, chain 4217). |
| `06-screen-mainnet-payouts-1920x1080.jpg` | 1920x1080, 344 KB | Demo or gallery screenshot | tokentails.com/shelter-payouts, "One contract, every chain": eight mainnet contracts on 7 chains, each with its total paid and a balance of 0 (pass-through). |
| `07-screen-heist-pink-paw-1920x1080.jpg` | 1920x1080, 372 KB | Public goods slide, gallery | Catnip Heist (live at tokentails.com/heist): its "Sent to shelters" screen lists every mainnet payout to Pink Paw with a link to the chain, next to Pink Paw's rescue fund and the rescue-treat button. |
| `08-screen-tempo-mainnet-receipt-1440x900.png` | 1440x900, 824 KB | Raw screenshot for the demo or the README | Rescue receipt read from the chain: 0.1 USDC.e to Pink Paw on Tempo mainnet, block 43071848, memo "Catnip Heist campaign". |

Replaced on Oct 8: `03-diagram-one-contract-six-chains`, `06-screen-testnet-proof` and `08-screen-tempo-testnet-receipt`
are deleted. No image says "Mainnet deploy(s): pending" or shows testnet data any more.

## Before you upload

- Don't use stills from `funding/media/out/demo-colosseum.mp4`: its frames show placeholders.
- After the first real sponsored treat, 06/07 still hold (they show what was there on Oct 8); retake only if you want
  the treat in the picture (`node ../_shared/screens-mainnet.mjs`, then re-render).

## Sources

`src/` holds the HTML and specs: `receipts4.html`, `chains.html`, `memo.html`, `cover-{1920,1200}.json`,
`payouts.json`, `heist.json`, `logo-sq.json`. Since Oct 8 they load the screenshots from `../_shared/screens/mainnet/`
(gitignored; retake with `node ../_shared/screens-mainnet.mjs`). `src/shots.mjs` and the `src/*.png` crops are the old
testnet captures and are no longer used. Render from this folder:

```bash
R=../_shared/render.mjs
node $R --spec src/cover-1920.json 02-cover-1920x1080.jpg --quality 88
node $R --spec src/cover-1200.json 02-cover-1200x630.jpg --quality 90
node $R src/chains.html 03-diagram-one-contract-seven-mainnets-1920x1080.png 1920 1080
node $R src/receipts4.html 04-receipts-four-tracks-1920x1080.png 1920 1080
node $R src/memo.html 05-diagram-tempo-memo-flow-1920x1080.png 1920 1080
node $R --spec src/payouts.json 06-screen-mainnet-payouts-1920x1080.jpg --quality 88
node $R --spec src/heist.json 07-screen-heist-pink-paw-1920x1080.jpg --quality 88
node $R --url "https://tokentails.com/shelter-payouts/receipt?chain=4217&tx=0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5" 08-screen-tempo-mainnet-receipt-1440x900.png 1440 900 --wait 8000
```
