# Colosseum World's Fair: image set (arena.colosseum.org project page)

Made on 2026-10-04 from existing repo art and real screenshots only: no generated or stock images, and no
sponsor, judge or chain logos. Captions follow `funding/framework/applications/colosseum-worlds-fair/submission.md`.

Platform spec: the Colosseum FAQ asks for "a product logo or graphic". It is square and shown at about 225 px, so
upload 1024x1024. **The size limit is not verified**; every file here is under 1.3 MB. No other image field is
confirmed, so files 02 to 08 go into the pitch video, the product demo, the slides, the README or X posts, or into an
image or gallery field if Arena shows one.

All on-chain numbers are **testnet** data read on 2026-10-04: 49 test payouts on 10 contracts, 6 testnets. No mainnet
payout exists yet. Every image that shows payouts carries a "testnet / test coins, no real money" label. The mainnet
coins are shown as "mainnet plan" (dashed chips).

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `01-logo-1024.png` | 1024x1024, 682 KB | **Arena project logo** (main pick). The cat bust sits on the bottom edge, so it also works under a circle crop | Token Tails pixel-art cat logo on a night-sky temple |
| `01b-graphic-square-1024.png` | 1024x1024, 921 KB | Use it instead of 01 if the field is labelled "graphic" rather than logo; it also works as a square social post | Token Tails logo with the words "ShelterSplit: shelter payouts you can check" |
| `02-cover-1920x1080.jpg` | 1920x1080, 381 KB | Cover or gallery image, the pitch video title card, the first slide | ShelterSplit, a USDC payout rail for animal shelters: one contract on Tempo, Arbitrum, Base and Robinhood Chain. Shown with the testnet proof page and a Tempo testnet receipt (test coins). |
| `02-cover-1200x630.jpg` | 1200x630, 207 KB | X post or link card, Discord announcement | Same as above |
| `03-diagram-one-contract-six-chains-1920x1080.png` | 1920x1080, 1151 KB | Pitch "how it works" slide, README, the "Other chains" section | One ShelterSplit contract on six testnets (Tempo, Arbitrum, Base, Robinhood Chain, Arc, Avalanche), with the coin on each chain and the planned mainnet coin for the four Colosseum tracks (USDC.e, USDC, USDC, USDG), all paying one Pink Paw wallet. Testnet, test coins. |
| `04-receipts-four-tracks-1920x1080.png` | 1920x1080, 1083 KB | Pitch "proof" slide, one image per entered track, X thread | Four testnet receipts from the same contract on Tempo, Arbitrum, Base and Robinhood Chain: each one 1 test coin to Pink Paw (Rožinė pėdutė), with the memo "Token Tails first payout". Test coins, no real money. |
| `05-diagram-tempo-memo-flow-1920x1080.png` | 1920x1080, 1210 KB | Tempo track slide, the "Why Tempo" section | disburseWithMemo splits a payment in one transaction and pays each shelter with TIP-20 transferWithMemo, so the memo is on the shelter's own transfer. Next to it, a real Tempo testnet receipt. Mainnet deploy pending. |
| `06-screen-testnet-proof-1920x1080.png` | 1920x1080, 905 KB | Demo or gallery screenshot | The payouts page's testnet proof section: "Live on 6 testnets. Check every payout." 49 test payouts on 10 contracts, test coins, no real money. |
| `07-screen-heist-pink-paw-1920x1080.jpg` | 1920x1080, 337 KB | Public goods slide, gallery | Catnip Heist (live at tokentails.com/heist): its "Sent to shelters" screen with Pink Paw's real cats. The first real payouts land soon. |
| `08-screen-tempo-testnet-receipt-1440x900.png` | 1440x900, 805 KB | Raw screenshot for the demo or the README | Rescue receipt read from the chain: 1 pathUSD to Pink Paw on the Tempo testnet, memo "Token Tails first payout". Testnet, test coins, no real money. |

## Before you upload

- The testnet proof section (06, 03) and the receipts (04, 05, 08) were taken from the **working tree on
  localhost:3001**. They are not on tokentails.com until that work is pushed. Push it before you submit, or point
  judges to the explorer links in submission.md.
- After the mainnet wave, re-render 03 and 05 with real mainnet chips and drop "Mainnet deploys: pending". Edit
  `src/chains.html` and `src/memo.html`, then run `node ../_shared/render.mjs src/chains.html 03-....png 1920 1080`.
- Don't use stills from `funding/media/out/demo-colosseum.mp4`: its frames show placeholders and a "live on mainnet"
  caption.

## Sources

`src/` holds the HTML and specs: `receipts4.html`, `chains.html`, `memo.html`, `cover-{1920,1200}.json`,
`heist.json`, `logo-sq.json`, and the crops they use. `src/shots.mjs` retakes the receipts (Tempo 42431, Arbitrum
Sepolia 421614, Base Sepolia 84532, Robinhood 46630) and the proof section from localhost:3001 into `screens/`.
Payout counts per chain in 03 come from the proof page: Tempo 7, Arbitrum 5, Base 8, Robinhood 4, Arc 17,
Avalanche 8 (total 49).
