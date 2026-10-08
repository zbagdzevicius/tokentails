# Arc Microgrants: submission images

For `funding/framework/applications/arc-microgrants/submission.md`. Call: community.arc.io (Gradual).
The submission link reportedly goes to a DoraHacks BUIDL form. Neither form's image fields were verified, so
this set covers the likely ones: a square logo, a 1.91:1 cover and 16:9 gallery images, each under 2 MB.

Built 2026-10-04 from repo art; re-rendered 2026-10-08 after the mainnet wave with fresh screenshots of the
**live site** (tokentails.com, taken about 07:30 UTC on Oct 8 with `../_shared/screens-mainnet.mjs`). Nothing is
generated or stock. There are no Arc, Circle or sponsor logos: the repo has none, and the call does not ask for them.

## Truth note (read before you upload)

- ShelterSplit is live on **Arc mainnet** (chain 5042): USDC split `0x457c…b147`, EURC split `0xb3ad…d052`.
  Each has one payout so far (0.1 USDC, 0.1 EURC), and both are **proof payouts sent by Token Tails** with the memo
  "Token Tails first payout". The images say so; do not caption them as player or donor money.
- Sponsored treats are live in production on all 7 chains, but the first real mainnet treat is still to come (you send
  it). The treat flow ran end to end on Arc testnet, so 03 says "treat flow proven on testnet first". After the first
  real treat, you can add its receipt (memo `tt:page:…` or `tt:heist:…`) and drop that phrase.
- Pink Paw's wallet is held by Token Tails until handover; the receipts and 03 say so. Re-render after the handover
  (G2b) only if a caption here contradicts it.
- Counts grow as treats land: 06 shows the feed as of Oct 8 (9 mainnet payouts on 7 chains).

## Files

| File | Size | Pixels | Where it goes | Alt text / caption to paste |
|---|---|---|---|---|
| `01-logo-1024.png` | 172 KB | 1024x1024 | Project logo / avatar (DoraHacks BUIDL logo, Gradual profile). The cat sits at the bottom edge, so a circle crop keeps it | Token Tails pixel-art cat logo on a dusk background |
| `02-cover-1200x630.png` | 676 KB | 1200x630 | Cover / banner (BUIDL cover, link preview). For Gradual's 1200x628, let the form crop it: no text sits within 10 px of the edges | ShelterSplit on Arc: shelter payouts you can check. Native USDC, split as it arrives and paid to each registered shelter in one transaction, with a public receipt. Shown: the Arc mainnet receipt for 0.1 USDC to Pink Paw (Rožinė pėdutė), block 24760885 |
| `03-architecture-1920x1080.png` | 1.1 MB | 1920x1080 | First gallery image or the "how it works" field | How a treat reaches the shelter: a Catnip Heist player taps Send a treat; the Token Tails backend sponsors it (one a day, capped budget); ShelterSplit on Arc takes native USDC with donate(memo), splits it in one transaction and emits NativeDisbursed; Pink Paw receives it in a wallet Token Tails holds until handover. The payouts page and receipts read the events from Arc's public RPC. Live on Arc mainnet; the treat flow was proven on testnet first |
| `04-sponsored-treat-1920x1080.png` | 1.3 MB | 1920x1080 | Gallery: the give flow | The live treat page (tokentails.com/shelter-payouts/give): pick one of 7 networks, sign in, tap once; our backend wallet calls donate(memo) on ShelterSplit within a capped daily budget. 0.01 USDC per treat on Arc. Memo tt:page:<random id>, no personal data |
| `05-receipt-1920x1080.png` | 1.3 MB | 1920x1080 | Gallery: the receipt | A public rescue receipt read from Arc mainnet: 0.1 USDC to Pink Paw, block 24760885, memo "Token Tails first payout" (a proof payout sent by Token Tails), with a link to the explorer. Game treats carry the memo tt:heist:<random id> |
| `06-arc-mainnet-payouts-1920x1080.png` | 1.3 MB | 1920x1080 | Gallery: the payouts page | The payouts page on Arc mainnet: ShelterSplit paid Pink Paw 0.1 USDC and the EURC instance 0.1 EURC, contract balance 0 because each send is split out in the same transaction. Right: the mainnet feed, 9 payouts on 7 chains, each with memo, tx and receipt |

Suggested upload order if the form takes a gallery: 03, 05, 04, 06.

Replaced on Oct 8: `06-arc-testnet-payouts-1920x1080.png` (testnet counts) is deleted; 02 to 05 no longer show testnet
data or "Preview build" browser bars.

## Sources and re-rendering

`src/` holds the HTML for each image. Since Oct 8 the pages load their screenshots from
`../_shared/screens/mainnet/` (gitignored; retake with `node ../_shared/screens-mainnet.mjs`). The old testnet crops
in `src/*.png` are no longer used. To re-render one:

```bash
cd funding/submission-images/_shared
node render.mjs ../arc-microgrants/src/s-diagram.html ../arc-microgrants/03-architecture-1920x1080.png 1920 1080
node render.mjs ../arc-microgrants/src/s-cover.html   ../arc-microgrants/02-cover-1200x630.png 1200 630
node render.mjs ../arc-microgrants/src/s-give.html    ../arc-microgrants/04-sponsored-treat-1920x1080.png 1920 1080
node render.mjs ../arc-microgrants/src/s-receipt.html ../arc-microgrants/05-receipt-1920x1080.png 1920 1080
node render.mjs ../arc-microgrants/src/s-payouts.html ../arc-microgrants/06-arc-mainnet-payouts-1920x1080.png 1920 1080
```

The HTML files use absolute `file://` paths into `_shared/` for fonts, background and logo art.
