# x402 Foundation impact micro-grant: images

For the GitHub grant issue on x402-foundation/x402 and the X post that tags @coinbaseDev. Built
2026-10-04 from repo art and real screenshots only. Texts: `funding/framework/applications/x402-microgrant/answers.md`.

**Do not post yet.** The grant requires "live on mainnet". Right now the `exact` scheme runs on testnet
only, and mainnet stays off until Pink Paw holds its own key (`SHELTER_HANDED_OVER`). None of these images
names a chain or claims a mainnet payment, so they still hold after the build. Before posting:

- Retake `screen-pink-paw-cats-1440.jpg` and `screen-shelter-payouts-hero-1440.jpg` after the handover
  (`node ../_shared/screens.mjs live-shelter`, then crop again). Today they say "Not handed over yet" and
  "First payouts land soon". That is true now, but it contradicts the post once the handover is done.
- Use `screen-testnet-proof-1440.png` only if `/shelter-payouts#testnet-proof` is live on tokentails.com.
  It was taken from the working tree (localhost:3001).
- answers.md still promises "a real cat's story and portrait". The endpoint returns `{ name, imageUrl, shelterName }`,
  with no story, so the images say "cat card" only. Fix the answer text or the endpoint.
- Best image of all: a real screenshot of the terminal (402, then 200) and of the explorer tx, taken
  after the mainnet run. Add them as the issue's first images.

Specs: GitHub issue images can be up to 10 MB each (PNG/JPG). X in-feed images are 16:9 1600x900, link cards 1.91:1, and the limit is 5 MB.
Every file here is under 1.2 MB.

| File | Size | Where it goes | Alt text / caption |
|---|---|---|---|
| `x-card-1600x900.png` | 1600x900, 1.1 MB | X post image (attach it, or post the video and put this in a reply) | Alt: "Token Tails card. An AI agent buys a shelter cat card over standard x402 (exact scheme). The terminal shows GET /shelter/agent/cat-card, 402 Payment Required with payTo set to the shelter's wallet, an X-PAYMENT header with a signed EIP-3009 transfer, then 200 OK and the cat card. Example card: Raudvis from Pink Paw." |
| `x-card-1200x675.png` | 1200x675, 729 KB | Same layout, smaller: issue header image, or X if the 1600 one gets compressed | Same alt as above |
| `diagram-x402-flow-1600x900.png` | 1600x900, 0.3 MB | GitHub issue, under "What x402 unlocks" | Caption: "The flow, per `backend/src/shelter/onchain/x402-exact.ts`: 402 with an `exact` offer whose payTo is the shelter's wallet; the agent signs one EIP-3009 transfer; the facilitator verifies, settles and pays gas; the API reads the transfer back from the chain and returns the cat card. Token Tails never holds the money." |
| `screen-pink-paw-cats-1440.jpg` | 1440x1110, 0.3 MB | GitHub issue, under "Disclosure" (retake after handover) | Caption: "tokentails.com/shelter-payouts: Pink Paw (Rožinė pėdutė), its wallet, and the cats waiting for a home. The agent's cat card is one of these cats." |
| `screen-shelter-payouts-hero-1440.jpg` | 1440x780, 0.15 MB | GitHub issue, under "Live on mainnet", next to the payouts link (retake after the first mainnet payout) | Caption: "Every payout is read live from the chain's public RPC, not from our servers." |
| `screen-heist-payouts-1440.jpg` | 1440x900, 0.2 MB | Optional, GitHub issue "What it is": the game side | Caption: "Catnip Heist, the game: the Sent to shelters view with Pink Paw's real cats and their Token Tails cards." |
| `screen-testnet-proof-1440.png` | 1440x900, 0.5 MB | Optional, GitHub issue: proof the rail runs on test networks today (only if this section is live) | Caption: "Testnet proof: the same ShelterSplit contract on 6 testnets, 49 test payouts on 10 contracts. Test coins, no real money." |
| `logo-1024.png` | 1024x1024, 0.4 MB | Spare square mark (avatar or project logo if asked); neither GitHub nor X needs one | Alt: "Token Tails pixel cat" |

Sources: `src/x-card.html` and `src/flow-diagram.html`. Render them from this folder with
`node ../_shared/render.mjs src/x-card.html x-card-1600x900.png 1600 900` (the card is laid out in rem,
so `1200 675` gives the smaller one). The example cat Raudvis is from
`client/public/heist-game/assets/images/pink-paw/raudvis-card.webp`. The screenshots come from `_shared/screens/` (2026-10-04).
