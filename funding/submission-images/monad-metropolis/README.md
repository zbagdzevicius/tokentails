# Monad Metropolis (Consumer Products & Payments): image set

Built 2026-10-04 from existing repo art and real screenshots (see `../_shared/README.md`). Captions match
`funding/framework/applications/monad-metropolis/submission.md`.

**Monad mainnet, as of 2026-10-08.** ShelterSplit `0x457c…b147` is live on Monad mainnet (chain 143), and its first
payout, 0.1 USDC to Pink Paw (block 111375456, tx `0xd550…99f5`), was a **proof payout sent by Token Tails**. The cover,
02, 03, 04 and 06 were re-rendered from fresh screenshots of the live site (`../_shared/screens-mainnet.mjs`, about
07:30 UTC Oct 8). 03 is the Monad image: the Monad mainnet receipt. Sponsored treats are live on 7 networks, Monad
included; the first real treat is still to come.
**The form's image fields are not verified** (the rules sit behind the hackathon.monad.xyz login). The default is a
1024 square logo, a 1920x1080 cover and 16:9 screenshots, each under 2 MB. Check the form and adjust.

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `logo-1024.png` | 1024x1024, 384 KB | Project logo / avatar | Token Tails pixel-art cat holding a gold coin |
| `cover-1920x1080.jpg` | 1920x1080, 376 KB | Project cover / banner (16:9) | Win a heist, feed a shelter cat: one tap after a Catnip Heist win sends a small USDC treat to a real cat shelter, with a public receipt. Shown: the live treat page (7 networks, Monad included) and the Monad mainnet receipt for 0.1 USDC to Pink Paw. |
| `cover-1200x630.jpg` | 1200x630, 196 KB | Cover if the form wants 1.91:1; X / social card | same as above |
| `01-win-a-heist.jpg` | 1920x1080, 268 KB | Screenshot 1 | Step 1: win a round of Catnip Heist, a free browser game at tokentails.com/heist, and rescue a shelter cat. |
| `02-one-tap-treat.jpg` | 1920x1080, 304 KB | Screenshot 2 | Step 2: one tap, and Token Tails pays a small USDC treat to Pink Paw from a capped daily budget, on the network the player picks (Monad is one of seven). No wallet and no gas for the player. |
| `03-public-receipt.jpg` | 1920x1080, 280 KB | Screenshot 3 | Step 3: every payout gets a public receipt read from the chain, with an explorer link. Shown: the first Monad mainnet payout, 0.1 USDC to Pink Paw, sent by Token Tails as proof (block 111375456). |
| `04-mainnet-payouts.jpg` | 1920x1080, 324 KB | Screenshot 4 | ShelterSplit: one call splits a payment across the shelter wallets, with one public event per payout. Live on 7 mainnets, Monad included: 9 payouts so far, contract balance 0 on every chain. |
| `05-pink-paw.jpg` | 1920x1080, 308 KB | Screenshot 5 | Pink Paw (Rožinė pėdutė), the first shelter, and its real cats. Its wallet is held by Token Tails on the shelter's behalf until handover. |
| `06-how-it-works.png` | 1920x1080, 988 KB | Screenshot 6 / architecture diagram | How a treat reaches a shelter: player taps, the Token Tails backend pays from a capped budget, ShelterSplit splits it to the shelter wallets, and each payout emits a public event that drives the receipt and the payouts page. Live on Monad mainnet at 0x457c…b147. |

Replaced on Oct 8: `04-testnet-proof.jpg` is deleted (now `04-mainnet-payouts.jpg`).

## Truth notes

- Every payout shown is real mainnet money sent by Token Tails (proof payouts). No image claims a player or donor payout.
- `06` shows the ERC-20 `disburse(amount, memo)` path. The Arc treat uses `donate()` (native USDC).
- No chain logos, no Monad branding, no prize or judge logos.

## Rebuild

Specs and HTML are in `src/`. 01 and 05 use the older crops in `src/`; the cover, 02, 03 and 04 load `../_shared/screens/mainnet/` (gitignored; retake with `node ../_shared/screens-mainnet.mjs`).

```bash
cd funding/submission-images/_shared
node render.mjs --spec ../monad-metropolis/src/cover-1920.json ../monad-metropolis/cover-1920x1080.jpg --quality 88
node render.mjs --spec ../monad-metropolis/src/cover-1200.json ../monad-metropolis/cover-1200x630.jpg --quality 90
node render.mjs --spec ../monad-metropolis/src/01-win-a-heist.json ../monad-metropolis/01-win-a-heist.jpg --quality 88   # same for 02, 03, 05
node render.mjs --spec ../monad-metropolis/src/04-mainnet-payouts.json ../monad-metropolis/04-mainnet-payouts.jpg --quality 88
node render.mjs ../monad-metropolis/src/how-it-works.html ../monad-metropolis/06-how-it-works.png 1920 1080
```
