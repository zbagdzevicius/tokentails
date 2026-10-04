# Arc Microgrants: submission images

For `funding/framework/applications/arc-microgrants/submission.md`. Call: community.arc.io (Gradual).
The submission link reportedly goes to a DoraHacks BUIDL form. Neither form's image fields were verified, so
this set covers the likely ones: a square logo, a 1.91:1 cover and 16:9 gallery images, each under 2 MB.

Built 2026-10-04 only from repo art (`_shared/assets`, `_shared/logos`, Catnip Heist still `title-live.jpg`,
Pink Paw logo) and real screenshots of the working tree on `localhost:3001`. Nothing is generated or stock.
There are no Arc, Circle or sponsor logos: the repo has none, and the call does not ask for them.

## Honesty note (read before you upload)

Every on-chain number and screenshot here is from **Arc testnet** (chain 5042002), and every image says so.
The call requires a working Arc **mainnet** deployment when you submit. When ShelterSplit is on mainnet and the
first real payout exists:

- retake 04 to 06 against the mainnet section of `/shelter-payouts` and a mainnet receipt (re-run the
  capture in `src/` or `_shared/screens.mjs`), and
- change the green chips ("Running on Arc testnet", "Every step shown here ran on Arc testnet") in
  `src/s-cover.html` and `src/s-diagram.html`.

Until then, upload them as they are: testnet proof, clearly labelled. Do not caption them as mainnet.

The screenshots come from the working tree (a preview build), not from tokentails.com. The live site still shows
"Treat jar opens soon" and no network picker. The browser bars say "Preview build" for that reason.

Counts at capture time (about 17:10 local time, Oct 4): Arc testnet USDC contract `0x457c…b147`, 15 payouts,
1.77 test USDC, balance 0. EURC instance `0x937f…0bba`, 3 payouts, 1.2 test EURC. The numbers grow as tests run.

## Files

| File | Size | Pixels | Where it goes | Alt text / caption to paste |
|---|---|---|---|---|
| `01-logo-1024.png` | 172 KB | 1024x1024 | Project logo / avatar (DoraHacks BUIDL logo, Gradual profile). The cat sits at the bottom edge, so a circle crop keeps it | Token Tails pixel-art cat logo on a dusk background |
| `02-cover-1200x630.png` | 664 KB | 1200x630 | Cover / banner (BUIDL cover, link preview). For Gradual's 1200x628, let the form crop it: no text sits within 10 px of the edges | ShelterSplit on Arc: shelter payouts you can check. Native USDC, split as it arrives and paid to each registered shelter in one transaction, with a public receipt. Shown: a testnet receipt for 0.01 USDC to Pink Paw (Rožinė pėdutė) |
| `03-architecture-1920x1080.png` | 1.0 MB | 1920x1080 | First gallery image or the "how it works" field | How a treat reaches the shelter: a Catnip Heist player taps Send a treat; the Token Tails backend sponsors it (one a day, capped budget); ShelterSplit on Arc takes native USDC with donate(memo), splits it in one transaction and emits NativeDisbursed; Pink Paw receives it in a wallet Token Tails holds until handover. The payouts page and receipts read the events from Arc's public RPC. Every step ran on Arc testnet |
| `04-sponsored-treat-1920x1080.png` | 1.3 MB | 1920x1080 | Gallery: the give flow | The treat page: a signed-in player taps once and our backend wallet calls donate(memo) on ShelterSplit within a capped daily budget. Memo tt:page:<random id>, no personal data. Arc testnet, 0.01 USDC per treat |
| `05-receipt-1920x1080.png` | 1.3 MB | 1920x1080 | Gallery: the receipt | A public rescue receipt read from the chain: 0.01 USDC to Pink Paw on Arc testnet, memo tt:heist:d0ebbc59 (a sponsored treat after a Catnip Heist run), with a link to the explorer. Labelled "Testnet · test coins, no real money" |
| `06-arc-testnet-payouts-1920x1080.png` | 1.2 MB | 1920x1080 | Gallery: the payouts page | The payouts page testnet proof: ShelterSplit on Arc testnet paid Pink Paw 15 times (1.77 test USDC), and the EURC instance 3 times. Contract balance 0, because each send is split out in the same transaction. Each payout lists its memo (game treat, wallet gift, x402), tx and receipt |

Suggested upload order if the form takes a gallery: 03, 05, 04, 06.

## Sources and re-rendering

`src/` holds the HTML for each image plus the cropped screenshots it uses (`give-tall-2x.png`,
`receipt-zoom.png`, `receipt-card.png`, `card-arc-usdc.png`, `card-arc-eurc.png`, `feed-narrow.png`, all taken
at 2x from `localhost:3001` on 2026-10-04). To re-render one:

```bash
cd funding/submission-images/_shared
node render.mjs ../arc-microgrants/src/s-diagram.html ../arc-microgrants/03-architecture-1920x1080.png 1920 1080
node render.mjs ../arc-microgrants/src/s-cover.html   ../arc-microgrants/02-cover-1200x630.png 1200 630
```

The HTML files use absolute `file://` paths into `_shared/` for fonts, background and logo art.
