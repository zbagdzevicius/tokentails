# Circle Developer Grants: image set

The set covers agentic payments on Arc: ShelterSplit as a USDC payout rail, plus the x402 agent cat-card flow.
It was built on 2026-10-04 from repo art and real screenshots (`../_shared/screens/`). Nothing is generated or stock.

The form is at https://www.circle.com/grant. Its image fields and size limit are **not verified**: it is a
Google-style form, and the form owner sets the upload limit. Every file is under 1 MB, so it fits any limit of
1 MB or more. If the form has no upload fields, use these in the deck or the linked doc, or host them and paste
the links.

| # | File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|---|
| 1 | `01-logo-1024.png` | 1024x1024, 384 KB | Logo or avatar field | Token Tails logo: a white pixel-art cat holding a gold coin. |
| 2 | `02-cover-1920x1080.jpg` | 1920x1080, 344 KB | Main image, cover or first deck slide | ShelterSplit on Arc: a USDC payout rail for animal shelters. One contract call splits each payment between the shelter and the treasury in the same transaction, with a public event per payout. Arc testnet: 14 test payouts. |
| 3 | `03-cover-1200x630.jpg` | 1200x630, 188 KB | Link preview, social post, or a 1.91:1 cover field | Same as #2. |
| 4 | `04-diagram-agent-flow-1920x1080.png` | 1920x1080, 892 KB | "Architecture" or "Solution" attachment (the key image for the agentic-payments angle) | How an AI agent pays a shelter on Arc: (1) the agent requests a cat card and gets 402 Payment Required with a USDC price and a one-time memo; (2) it pays `donate(memo)` in USDC on Arc, or pays through a facilitator with the standard x402 `exact` scheme; (3) ShelterSplit splits the payment between Pink Paw and the treasury in the same transaction and emits `NativeDisbursed`; (4) the agent retries with the transaction hash and gets the card. The agent endpoint is built and tested but not public yet. |
| 5 | `05-screen-receipt-1920x1080.jpg` | 1920x1080, 272 KB | Screenshot / traction | Arc testnet receipt: 1 test USDC to Pink Paw (Rožinė pėdutė), read from the chain, with the memo and an explorer link. Test coins, no real money. |
| 6 | `06-screen-proof-1920x1080.jpg` | 1920x1080, 316 KB | Screenshot / existing deployments | Testnet proof: ShelterSplit runs on 6 testnets. On Arc testnet it has paid 1.76 test USDC in 14 payouts and holds no balance. Test coins, no real money. |
| 7 | `07-screen-treat-1920x1080.jpg` | 1920x1080, 288 KB | Screenshot / product | Rescue treats: one tap and Token Tails sends a 0.01 USDC treat to Pink Paw through ShelterSplit on Arc testnet. The player needs no wallet. |
| 8 | `08-screen-game-1920x1080.jpg` | 1920x1080, 328 KB | Screenshot / team and traction | Catnip Heist, live at tokentails.com/heist: players free a shelter cat and send Pink Paw a rescue treat. The "Sent to shelters" panel will list each payout with a link to the chain. |

Suggested order if the form takes only a few images: 4 (diagram), 2 (cover), 5 (receipt), 6 (proof).

## Truth checks (keep these when you edit)

- Every on-chain number is from **Arc testnet**. Each image that shows one labels it "testnet" or "test coins, no
  real money". No image claims a mainnet payout. The live site still says "First payouts land soon".
- The agent endpoint (`GET /shelter/agent/cat-card`, `backend/src/shelter/onchain/shelter-x402.service.ts`)
  is in the code with unit tests, but it is off by default (`SHELTER_X402_ENABLED`). The diagram says
  "built and tested · not public yet". Switch that chip only once the endpoint is public.
- The 0.01 USDC treat and the 10-minute memo expiry are the code defaults. The x402 price is configurable.
- The shelter wallet is held by Token Tails until handover, and the diagram footer says so.
- Shots 5–7 come from the working tree (localhost:3001, Arc testnet config), not from tokentails.com. Shot 8 and
  the game page are live.
- The submission text (`framework/applications/circle-developer-grants/submission.md`) still leads with Tempo.
  If the final application leads with agentic payments on Arc, align the summary with the diagram.
- The images use no Circle, Arc, x402 or other sponsor logos (there are none in the repo, and the rules do not
  ask for them).

## Rebuild

Sources are in `_src/`: JSON specs for `../_shared/template.html`, `diagram.html`, and the cropped screenshots.

```bash
cd funding/submission-images/_shared
node render.mjs --spec ../circle-grants/_src/cover-1920.json ../circle-grants/02-cover-1920x1080.jpg --quality 88
node render.mjs --spec ../circle-grants/_src/cover-1200.json ../circle-grants/03-cover-1200x630.jpg --quality 90
node render.mjs ../circle-grants/_src/diagram.html ../circle-grants/04-diagram-agent-flow-1920x1080.png 1920 1080
node render.mjs --spec ../circle-grants/_src/shot-receipt.json ../circle-grants/05-screen-receipt-1920x1080.jpg --quality 88
node render.mjs --spec ../circle-grants/_src/shot-proof.json ../circle-grants/06-screen-proof-1920x1080.jpg --quality 88
node render.mjs --spec ../circle-grants/_src/shot-treat.json ../circle-grants/07-screen-treat-1920x1080.jpg --quality 88
node render.mjs --spec ../circle-grants/_src/shot-game.json ../circle-grants/08-screen-game-1920x1080.jpg --quality 88
```

`01-logo-1024.png` is a copy of `../_shared/logos/cat-1024-night.png`.
