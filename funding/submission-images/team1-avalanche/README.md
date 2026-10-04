# Team1 Avalanche mini grants: image set

Built 2026-10-04 from repo art and real screenshots only: the live site tokentails.com and the working-tree
dev server on localhost:3001. Nothing here is generated or stock. No Avalanche, Team1 or sponsor logos
are used because the repo has none and the form does not ask for them.

**Form spec (not verified):** Team1 uses a Google Form. The form owner sets any upload limit, and the
form may only ask for links. Every file is 1920x1080 or smaller and under 1.2 MB, so it fits a 2 MB
limit. If the form takes a single image, use `02`. If it takes only a deck or a link, put `02`, `04`,
`05` and `06` into the deck, in that order.

**Truth guardrails:** ShelterSplit is on the **Avalanche Fuji testnet** only, with no Avalanche
mainnet deployment recorded. Every image that shows a payout carries a "testnet / test coins, no real
money" label, and mainnet is always called the "next milestone". Pink Paw (Rožinė pėdutė) is named
with consent on file.

| File | Size | Where it goes | Alt text / caption to paste |
|---|---|---|---|
| `01-logo-1024.png` | 1024x1024, 384 KB | Project logo or avatar field (it still works when cropped to a circle) | Token Tails logo: a pixel-art white cat holding a gold coin. |
| `02-cover-1920x1080.jpg` | 1920x1080, 302 KB | Main cover or banner image; first slide of a deck | ShelterSplit on Avalanche: a USDC and EURC payout rail for animal shelters. The image shows a real rescue receipt for 1 USDC to Pink Paw on the Avalanche Fuji testnet, labelled as test coins. C-Chain mainnet is next. |
| `03-cover-1200x630.jpg` | 1200x630, 152 KB | Link preview, X post, or any 1.91:1 cover field | Same as 02, at social-card size. |
| `04-fuji-testnet-proof-1920x1080.jpg` | 1920x1080, 290 KB | Screenshot or "proof of work" field | ShelterSplit on Avalanche Fuji testnet: 3 contracts and 8 test payouts in USDC, EURC and native AVAX. Each contract keeps a zero balance because donations are split out in the same transaction. Test coins only, no real money. |
| `05-how-it-works-1920x1080.png` | 1920x1080, 1.17 MB | Architecture or "how it works" field; deck slide | How ShelterSplit works: Token Tails' operations wallet calls disburse(amount, memo). The contract on Avalanche C-Chain pays each registered shelter its share in basis points, with one Disbursed event per shelter, and sends the rest to the treasury. A public receipt page reads each payout from the chain. Proven on Fuji testnet; mainnet is the next milestone. |
| `06-receipt-fuji-usdc-1920x1080.jpg` | 1920x1080, 223 KB | Screenshot field (desktop) | Rescue receipt read from the chain: 1 USDC to Pink Paw (Rožinė pėdutė) on Avalanche Fuji testnet, block 59013637, memo "Token Tails first payout". Labelled testnet, test coins, no real money. |
| `07-receipt-fuji-eurc-phone-780x1688.jpg` | 780x1688, 180 KB | Screenshot field (mobile) | The same receipt page on a phone: 1 EURC to Pink Paw on Avalanche Fuji testnet, block 59013677. Test coins, no real money. |
| `08-app-landing-1920x1080.jpg` | 1920x1080, 375 KB | Product screenshot ("what is your product") | Token Tails, the cat-rescue game live at tokentails.com, on the App Store and on Google Play. |
| `09-catnip-heist-shelters-1920x1080.jpg` | 1920x1080, 217 KB | Product screenshot (optional) | Catnip Heist on tokentails.com: the "Sent to shelters" panel with Pink Paw's real cats. It says first payouts land soon, because there is no mainnet payout yet. |

## Sources

- `04` uses the three Avalanche Fuji cards from `localhost:3001/shelter-payouts` (testnet proof section).
  The contracts are `0x457c…b147` (1 payout of 0.01 AVAX), `0x8bf0…878c` (4 payouts, 1.3 USDC) and `0x6f0a…a022`
  (3 payouts, 1.2 EURC). The data is in `client/public/shelter-payouts/testnet-deployments.json`.
- `06` and `07` are `localhost:3001/shelter-payouts/receipt?chain=43113&tx=0x4170…6f02` (USDC) and `…tx=0xa0a9…efa` (EURC).
- `08` is https://tokentails.com/ and `09` is https://tokentails.com/heist?payouts, both live.
- `_src/` holds the HTML and JSON sources, the scripts (`shots.mjs`, `cards.mjs`) and the full-resolution
  screenshots. Re-render with `funding/submission-images/_shared/render.mjs`.

## Before you submit

- `framework/applications/team1-avalanche/draft.md` is still a copy of the Colosseum (Tempo) draft. The
  Summary, "Why Tempo" and the explorer links name Tempo and USDC.e. Rewrite them for Avalanche C-Chain
  so the captions above match the text.
- If ShelterSplit gets an Avalanche C-Chain mainnet deployment, re-render `02`, `03`, `04` and `05`. Change
  "C-Chain mainnet next" only when a real mainnet payout exists.
- `05` leaves out the Foundry test count on purpose. The 41/41 evidence comes from a build on Sep 28,
  and the deployed bytecode has changed since then (native-AVAX split).
