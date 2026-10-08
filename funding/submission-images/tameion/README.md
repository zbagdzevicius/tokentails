# Tameion Agents Hackathon (Canteen x Circle x Arc): image set

Built 2026-10-04 from repo art and real screenshots only (`../_shared`). No generated or stock images, and no sponsor, judge or chain logos.
Texts follow `funding/framework/applications/tameion/submission.md`.

**Where these go.** The Tameion form is a Google Form that takes the repo, a demo video under 3 minutes and a live link. It has **no image fields** (verified on tameion.thecanteenapp.com). These images are for:
the demo video (title card, diagrams and stills as full-screen frames), the repo README, and the post that shares the entry.

| File | Size | Use | Alt text / caption |
|---|---|---|---|
| `logo-1024.png` | 1024x1024, 384 KB | Repo/social avatar, any square logo slot | Token Tails pixel cat holding a gold coin. |
| `cover-1920x1080.jpg` | 1920x1080, 368 KB | Video title card and thumbnail (first frame), README hero | An AI agent pays a cat shelter in USDC: it asks for an adoptable-cat card, gets a 402 offer, pays ShelterSplit, and the price is split to shelter wallets. ShelterSplit is live on Arc mainnet. |
| `social-1200x630.png` | 1200x630, 881 KB | X/LinkedIn post card, README hero | Same as the cover, for link previews. |
| `diagram-agent-flow-1920x1080.png` | 1920x1080, 1.1 MB | Video frame for the cat-card loop (≈0:20–0:50), README "How it works" | The x402-style loop: 1 Ask, GET /shelter/agent/cat-card returns 402 with payTo ShelterSplit and a one-time memo. 2 Pay, the agent checks its cap and calls donate(memo) with native USDC, which ShelterSplit splits to shelter wallets in the same transaction. 3 Prove, it retries with the tx hash and the server checks the receipt over RPC. 4 Get, 200 with a cat card. Built and tested; mainnet endpoint off until the shelter handover. |
| `diagram-agent-limits-1920x1080.png` | 1920x1080, 1.1 MB | Video frame for the treat agent (Agentic sophistication), README | Claude decides, the contract limits: the agent reads the payouts, budget and goal, Claude calls give_treat or hold with a reason, and CappedSpender enforces per-gift and per-day caps on-chain and pays only the split's shelter wallets. An over-cap proposal reverts. Shown on a local Arc testnet fork with test USDC; testnet deploy pending; caps are demo values. Chip: CappedSpender 26/26 forge tests pass (the treat-agent Node suite is 28/29 as of Oct 4, so no Node count is shown). |
| `screen-proof-1920x1080.png` | 1920x1080, 1.2 MB | Video still for "it's on the chain", README | The live mainnet payouts feed (9 payouts on 7 chains) and the Arc mainnet receipt for 0.1 USDC to Pink Paw, ShelterSplit's first Arc payout, sent by Token Tails as proof. |
| `screen-code-1920x1080.png` | 1920x1080, 1.2 MB | Video still while narrating payAndFetch, README | A trimmed excerpt of shelter-rail/examples/agent-pay.mjs: payAndFetch pays the 402 offer through a signer callback and refuses any price above MAX_PRICE_WEI. |
| `screen-twin-1920x1080.png` | 1920x1080, 1.4 MB | Video still for "same split, for players too" | Catnip Heist's live "Sent to shelters" page: every mainnet payout to Pink Paw, with a link to the chain. |

Every file is under 2 MB. Total ≈ 8 MB.

## Truth notes (keep them when you reuse these)

- The live `/shelter/agent/cat-card` endpoint answers 409 today: agent cat cards stay off on mainnet until the shelter holds its own keys. The images say "built and tested" and "mainnet endpoint off until handover". If a paid agent call lands on Arc (testnet or mainnet) before you submit, you can add its explorer link to the caption. Do not change the images to say "live".
- Oct 8: `cover`, `social`, `diagram-agent-flow`, `screen-proof` and `screen-twin` were re-rendered for mainnet from fresh live screenshots (`../_shared/screens/mainnet/`, retake with `node ../_shared/screens-mainnet.mjs`). The chip now reads "ShelterSplit live on Arc mainnet"; the agent endpoint stays "built and tested · mainnet endpoint off until handover" (it answers 409).
- The limits diagram shows CappedSpender as tested on a local fork only. After the testnet deploy (tracker row, Oct 5), re-render it with the address: edit `src/agent-limits.html`, change the "Testnet deploy pending" chip, and run the render command below.
- Do not use stills from `funding/media/out/demo-*.mp4`: they contain placeholders and a "live on Arc mainnet" caption.

## Re-render

```bash
cd funding/submission-images/tameion
node ../_shared/render.mjs src/cover.html cover-1920x1080.jpg 1920 1080 --quality 90
node ../_shared/render.mjs src/cover.html social-1200x630.png 1200 630
node ../_shared/render.mjs src/agent-flow.html diagram-agent-flow-1920x1080.png 1920 1080
node ../_shared/render.mjs src/agent-limits.html diagram-agent-limits-1920x1080.png 1920 1080
for v in proof code twin; do node ../_shared/render.mjs "src/shot.html?v=$v" screen-$v-1920x1080.png 1920 1080; done
cp ../_shared/logos/cat-1024-night.png logo-1024.png
```
