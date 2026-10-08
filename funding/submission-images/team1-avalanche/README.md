# Team1 Avalanche mini grants: image set

Built 2026-10-04 from repo art and real screenshots only: the live site tokentails.com and the working-tree
dev server on localhost:3001. Nothing here is generated or stock. No Avalanche, Team1 or sponsor logos
are used because the repo has none and the form does not ask for them.

**Form spec (not verified):** Team1 uses a Google Form. The form owner sets any upload limit, and the
form may only ask for links. Every file is 1920x1080 or smaller and under 1.2 MB, so it fits a 2 MB
limit. If the form takes a single image, use `02`. If it takes only a deck or a link, put `02`, `04`,
`05` and `06` into the deck, in that order.

**Truth guardrails (updated 2026-10-08):** ShelterSplit `0x457c…b147` is live on **Avalanche C-Chain mainnet** (chain
43114). Its first payout, 0.1 USDC to Pink Paw (block 96969514, tx `0x624c…17b7`), was a **proof payout sent by Token
Tails**; the images say so. Native AVAX gifts are split too (contract feature; no AVAX payout on mainnet yet). The EURC
split exists on Fuji only, so the mainnet images no longer mention EURC on Avalanche. Pink Paw (Rožinė pėdutė) is named
with consent on file; its wallet is held by Token Tails until handover.

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `01-logo-1024.png` | 1024x1024, 384 KB | Project logo or avatar field (it still works when cropped to a circle) | Token Tails logo: a pixel-art white cat holding a gold coin. |
| `02-cover-1920x1080.jpg` | 1920x1080, 308 KB | Main cover or banner image; first slide of a deck | ShelterSplit on Avalanche: a USDC payout rail for animal shelters, live on C-Chain mainnet. The image shows the real rescue receipt for 0.1 USDC to Pink Paw on Avalanche C-Chain, block 96969514. |
| `03-cover-1200x630.jpg` | 1200x630, 168 KB | Link preview, X post, or any 1.91:1 cover field | Same as 02, at social-card size. |
| `04-avalanche-mainnet-1920x1080.jpg` | 1920x1080, 288 KB | Screenshot or "proof of work" field | ShelterSplit on Avalanche C-Chain mainnet since Oct 7: the per-chain card from tokentails.com/shelter-payouts (0.1 USDC in 1 payout, contract balance 0) next to its receipt. The first payout was sent by Token Tails as proof; tested first on the Fuji testnet. |
| `05-how-it-works-1920x1080.png` | 1920x1080, 1.2 MB | Architecture or "how it works" field; deck slide | How ShelterSplit works: Token Tails' operations wallet calls disburse(amount, memo). The contract on Avalanche C-Chain pays each registered shelter its share in basis points, with one Disbursed event per shelter, and sends the rest to the treasury. A public receipt page reads each payout from the chain. Live on C-Chain mainnet; proven on Fuji first. |
| `06-receipt-avalanche-usdc-1920x1080.jpg` | 1920x1080, 216 KB | Screenshot field (desktop) | Rescue receipt read from the chain: 0.1 USDC to Pink Paw (Rožinė pėdutė) on Avalanche C-Chain mainnet, block 96969514, memo "Token Tails first payout". |
| `07-receipt-avalanche-phone-780x1688.jpg` | 780x1688, 268 KB | Screenshot field (mobile) | The same receipt page on a phone. |
| `08-app-landing-1920x1080.jpg` | 1920x1080, 375 KB | Product screenshot ("what is your product") | Token Tails, the cat-rescue game live at tokentails.com, on the App Store and on Google Play. |
| `09-catnip-heist-shelters-1920x1080.jpg` | 1920x1080, 228 KB | Product screenshot (optional) | Catnip Heist on tokentails.com: the "Sent to shelters" panel lists every mainnet payout to Pink Paw (Avalanche C-Chain included) next to the rescue-treat button. |

Replaced on Oct 8: `04-fuji-testnet-proof`, `06-receipt-fuji-usdc` and `07-receipt-fuji-eurc-phone` are deleted.

## Sources

- `02`–`04` load `../_shared/screens/mainnet/` (`rcard-avax.png`, `card-avalanche-c-chain-mainnet.png`; gitignored, retake
  with `node ../_shared/screens-mainnet.mjs`). `06` and `09` are direct live captures:
  `node ../_shared/render.mjs --url "https://tokentails.com/shelter-payouts/receipt?chain=43114&tx=0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7" 06-receipt-avalanche-usdc-1920x1080.jpg 1920 1080 --wait 8000 --quality 88`
  and the same with `https://tokentails.com/heist?payouts` (`--wait 10000`) for 09. `07` is `receipt-avax-390.png` as JPG.
- `08` is https://tokentails.com/ (Oct 4).
- `_src/` holds the HTML and JSON sources; `shots.mjs`/`cards.mjs` and the Fuji crops are the old testnet captures.

## Before you submit

- `framework/applications/team1-avalanche/draft.md` was rewritten for Avalanche C-Chain on Oct 8; check that its
  numbers match the captions above (0.1 USDC, block 96969514) before you paste.
- `05` leaves out the Foundry test count on purpose. The 41/41 evidence comes from a build on Sep 28,
  and the deployed bytecode has changed since then (native-AVAX split).
