# Monad Metropolis (Consumer Products & Payments): image set

Built 2026-10-04 from existing repo art and real screenshots (see `../_shared/README.md`). Captions match
`funding/framework/applications/monad-metropolis/submission.md`.

**Chain-agnostic on purpose.** No ShelterSplit deployment on Monad is recorded yet, so no image names Monad or
shows a Monad address. After `fund a:deploy monad ...`, add a Monad payout receipt screenshot and update the cover.
**The form's image fields are not verified** (the rules sit behind the hackathon.monad.xyz login). The default is a
1024 square logo, a 1920x1080 cover and 16:9 screenshots, each under 2 MB. Check the form and adjust.

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `logo-1024.png` | 1024x1024, 384 KB | Project logo / avatar | Token Tails pixel-art cat holding a gold coin |
| `cover-1920x1080.jpg` | 1920x1080, 348 KB | Project cover / banner (16:9) | Win a heist, feed a shelter cat: one tap after a Catnip Heist win sends a small USDC treat to a real cat shelter, with a public receipt. Running on testnet now: testnet receipts, test coins. |
| `cover-1200x630.jpg` | 1200x630, 191 KB | Cover if the form wants 1.91:1; X / social card | same as above |
| `01-win-a-heist.jpg` | 1920x1080, 265 KB | Screenshot 1 | Step 1: win a round of Catnip Heist, a free browser game at tokentails.com/heist, and rescue a shelter cat. |
| `02-one-tap-treat.jpg` | 1920x1080, 274 KB | Screenshot 2 | Step 2: one tap, and Token Tails pays a small USDC treat to Pink Paw from a capped daily budget. No wallet and no gas for the player. On the live site the treat jar opens soon. |
| `03-public-receipt.jpg` | 1920x1080, 269 KB | Screenshot 3 | Step 3: every treat gets a public receipt read from the chain, with an explorer link. Shown: a 1 USDC testnet payout to Pink Paw (test coins, no real money). |
| `04-testnet-proof.jpg` | 1920x1080, 351 KB | Screenshot 4 | ShelterSplit: one call splits a payment across the shelter wallets, with one public event per payout. Running on 6 testnets: 49 test payouts on 10 contracts (test coins). |
| `05-pink-paw.jpg` | 1920x1080, 306 KB | Screenshot 5 | Pink Paw (Rožinė pėdutė), the first shelter, and its real cats. Its wallet is held by Token Tails on the shelter's behalf until handover. |
| `06-how-it-works.png` | 1920x1080, 985 KB | Screenshot 6 / architecture diagram | How a treat reaches a shelter: player taps, the Token Tails backend pays from a capped budget, ShelterSplit splits it to the shelter wallets, and each payout emits a public event that drives the receipt and the payouts page. |

## Truth notes

- `03` and `04` come from the working tree (localhost:3001), not yet deployed on tokentails.com. Both are labelled as testnet.
  Deploy before the submission, or note in the form that the testnet section is in the next release.
- `02` shows the live give page, where the jar still says "Treat jar opens soon". The chip in the image says so too.
- `06` shows the ERC-20 `disburse(amount, memo)` path that the Monad plan uses. The live Arc treat uses `donate()`
  (native USDC). Per the submission, the backend does not yet use the USDC disburse path.
- No chain logos, no Monad branding, no prize or judge logos.

## Rebuild

Specs and HTML are in `src/` (crops were made with PIL from `../_shared/screens` and `../_shared/assets/heist-stills`).

```bash
cd funding/submission-images/_shared
node render.mjs --spec ../monad-metropolis/src/cover-1920.json ../monad-metropolis/cover-1920x1080.jpg --quality 88
node render.mjs --spec ../monad-metropolis/src/01-win-a-heist.json ../monad-metropolis/01-win-a-heist.jpg --quality 88   # same for 02..05
node render.mjs ../monad-metropolis/src/how-it-works.html ../monad-metropolis/06-how-it-works.png 1920 1080
```
