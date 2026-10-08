# Shared kit for submission images

Reusable pieces for every `funding/submission-images/<event-slug>/` set. Built 2026-10-04 only from
existing repo art and real screenshots. No generated or stock images.

## Render

Playwright comes from `client/node_modules` and runs in the Chrome channel, falling back to bundled Chromium.

```bash
cd funding/submission-images/_shared
node render.mjs --spec my.json out.png                      # brand template (template.html) from a JSON spec
node render.mjs --spec my.json out.jpg --quality 88         # JPG by extension
node render.mjs page.html out.png 1200 630                  # any HTML page (link ../_shared/brand.css for fonts/colours)
node render.mjs "logo.html?mark=cat&bg=night" x.png 512 512 # square logo; add --transparent with bg=none
node render.mjs --url https://tokentails.com shot.png 1440 900 [--full] [--mobile] [--scale 2]
node screens.mjs [filter]                                   # retake the common screenshots into screens/
node screens-mainnet.mjs                                    # retake the live mainnet screenshots into screens/mainnet/ (2x)
```

Spec fields are documented at the top of `template.html`. In short: `w`, `h`, `layout`
(split|center|art|stack), `bg` (temple|space|dusk|sky|clouds|payouts|night|none|path), `dim`, `logo`
(text|word|cat|none), `logoH`, `kicker`, `title` (wrap the glowing part in `<em>`), `subtitle`,
`chips` [{text, tone: gold|mint|pink}], `art`, `artPos`, `art2` (phone overlay), `footer`, `scale`,
`textWidth`, `css`. Relative paths resolve from the spec file's folder. The text shrinks itself until
it fits; render.mjs prints `text scaled to N%` when it does. For small covers such as 630x500, pass `"scale": 1.4`
or more so the text stays legible. Examples are in `examples/`.

## Files

| Path | What |
|---|---|
| `brand.css` | @font-face for Passion One (400/700/900), Bebas Neue, Nunito (variable), Cat Paw; colour tokens; `.tt-title`, `.tt-glow`, `.tt-chip`, `.tt-panel`, `.tt-btn` |
| `template.html`, `render.mjs`, `logo.html`, `screens.mjs` | renderers (see above) |
| `fonts/` | copies of `client/public/fonts/*` plus `catpaw.woff2` (= `client/public/font.woff2`), with licences |
| `logos/cat-{512,1024}-transparent.png` | pixel cat mark, transparent |
| `logos/cat-{512,1024}-night.png`, `cat-512-dusk.png`, `cat-1024-dusk.png`, `cat-1024-temple.png` | cat bust anchored to the bottom edge; survives a circular avatar crop |
| `logos/lockup-512-{transparent,night,temple}.png` | cat + TOKEN TAILS wordmark (source art is 600x337, so there is no sharp 1024 lockup) |
| `backgrounds/{temple,space,dusk}-{1200x630,1920x1080}.jpg` | plain brand backgrounds |
| `backgrounds/temple-logo-{1200x630,1920x1080}.jpg` | the temple background with the lockup centred (a generic cover) |
| `assets/` | curated copies of brand art (see the inventory below) |
| `screens/` | real screenshots taken 2026-10-04 (see below) |
| `screens-mainnet.mjs`, `screens/mainnet/` | live-site screenshots after the mainnet wave, taken 2026-10-08 (see below) |
| `examples/` | three specs and their PNGs (split 1200x630, art 630x500, center 1920x1080) |

## Brand

Colours (`client/design/tokens.ts`): night 950 `#07051a`, 900 `#0b0820` (page), 800 `#120d1f`, 700 `#1e1633`,
600 `#2a1f45`, 500 `#3a2d5c`; gold 400 `#ffcc55` (CTA), 500 `#e2c05a` (borders), ink `#4a1d08` (text on gold),
shadow `#713f12`; cream `#fcecbb` (body text), lilac `#f0c5fd`, muted `#9a88c9`; pink `#ff7aa2`, mint `#7fd66b`
(success/testnet chips), sky `#90c5e9`, rust `#ee642a`, ember `#c1260f`; dusk `#2a1f45` → `#7a3e6e` → `#ee8a5c`.
Legacy: grape `#8726B7`.

Fonts: Passion One (headings, glowing titles), Bebas Neue (`font-display`), Nunito (body), Cat Paw (Catnip Heist
display face; mixed-case Latin only).

## Asset inventory (resolution notes)

| Asset | Source | Size | OK for |
|---|---|---|---|
| Pixel cat mark | `client/resources/logo.png` → `assets/cat-logo-1024.png` | 1024 sq, alpha | any size, use pixelated scaling |
| Cat mark (taller) | `client/resources/source/logo.png` | 1200x1300 alpha | large |
| App Store icon | `client/resources/store/app-store-1024.png` | 1024 sq, on night | avatars |
| Lockup (cat in ring + wordmark) | `client/public/logo/logo-text.webp` | 600x337 alpha | up to ~720 px wide |
| Wordmark only | `client/public/logo/logo-pure-text.webp` | 700x165 alpha | up to ~800 px wide |
| Landing layers | `client/public/landing/hero-{bg,grounds,cat,cat-with-ground,top,await}.webp` | 2752x1536 | full HD covers |
| Space starfield | `client/public/landing/card-bg.webp` | 2752x1536 | backgrounds |
| Cloud islands | `client/public/landing/game-bg.webp` | 2752x1536 | backgrounds |
| Payouts dusk hero | `client/public/heist-game/assets/images/payouts-hero.webp` | 1100x614 | ≤1200 |
| OG images | `client/public/logo/og-v2-1200x630.jpg`, `client/public/game-select/heist-og.jpg` | 1200x630 | X cards as-is |
| Catnip Heist stills | `catnip-heist/promo/reel30/assets/clips/stills/*.jpg` | 1920x1080 | key art, itch screenshots |
| Heist reel | `catnip-heist/promo/reel30/out/reel30.mp4`, `client/public/landing/heist-reel-v1.mp4` (+ poster 1280x720) | 1920/1280 | stills via ffmpeg |
| Anitya world previews | `catnip-heist/export/anitya/previews/heist-0{1..8}-*.png` (+ `-crate`) | 1600x900 | feed thumbnails |
| Pink Paw logo | `client/public/logo/shelters/pink-paw.webp` | 400 sq | ≤400 px |
| Pink Paw cats (card + photo) | `client/public/heist-game/assets/images/pink-paw/*` | 216x322 / 168x224 | small tiles only (low res) |
| Shelter collage | `client/public/logo/shelter.webp` | 800x735 | medium |
| Demo videos | `funding/media/out/demo-{arc,colosseum}.mp4` | 1280x720 | **do not still**: frames show `(SPLIT_ADDRESS)`/`(ARC_TX)` placeholders and a "live on Arc mainnet" caption |
| Chain logos | only `client/public/logo/stellar-logo-*.webp` and `images/sponsor/*` (excluded programs) | – | none usable for Arc/Tempo/Arbitrum etc. |

## Screenshots (`screens/`, taken 2026-10-04)

`-1440` = 1440x900 at 1x; `-390` = a 390x844 viewport at 2x DPR, so the files are 780x1688. Full-page shots are taller.

| File | Page | Notes |
|---|---|---|
| `live-landing-*` | https://tokentails.com/ | hero "Your cat awaits" |
| `live-heist-*` | https://tokentails.com/heist | Catnip Heist "Pick your crew" |
| `live-heist-payouts-*` | https://tokentails.com/heist?payouts | "Sent to shelters: First payouts land soon" modal with Pink Paw cats |
| `live-shelter-payouts-*` (full) | https://tokentails.com/shelter-payouts | 2.6–2.7 MB, crop before upload |
| `live-give-*` | https://tokentails.com/shelter-payouts/give | "Send a treat to Pink Paw" |
| `dev-shelter-payouts-*` (full) | localhost:3001/shelter-payouts | working tree; 4.6–5.6 MB, crop before upload |
| `dev-testnet-proof-*` | localhost:3001/shelter-payouts#testnet-proof | "Live on 6 testnets. Check every payout." 49 test payouts on 10 contracts |
| `dev-give-*`, `dev-give-full-*` | localhost:3001/shelter-payouts/give | treat jar state depends on the dev env |
| `dev-receipt-arc-testnet-*` | localhost:3001/shelter-payouts/receipt?chain=5042002&tx=0xa90f…360a | 1 USDC to Pink Paw on Arc testnet, labelled "Testnet · test coins, no real money" |
| wallet chain picker | – | **not reachable**: `[data-testid=wallet-network]` does not render on :3001 (wallet donate is off in that env) |

## Platform image specs

| Platform | Image fields | Size / limit | Source |
|---|---|---|---|
| HackQuest (Arbitrum Singapore, Dubai) | project logo (square; the gallery shows it at 40–80 px) | uploads seen are 400–1338 px square; use 1024x1024 PNG. No cover field found | observed on hackquest.io/projects. Cover and size limit not verified |
| Colosseum Arena (World's Fair) | "a product logo or graphic" | square; the gallery shows it at 225 px, uploads 400–2810 px square; use 1024x1024 | colosseum.com/hackathon FAQ + arena.colosseum.org gallery. Size limit not verified |
| Arc Microgrants (community.arc.io, Gradual; venue reportedly DoraHacks) | event covers on Gradual are 1.91:1 (1200x628). DoraHacks BUIDL: logo (square) + optional cover | 1024 sq logo + 1200x630 cover, each <2 MB | DoraHacks banner spec 2400x1200 ≤2 MB is for hackathon hosts. BUIDL fields not verified |
| itch.io (Anitya jam page) | cover image, 3–5 screenshots | cover 315:250 (min 315x250, use 630x500); screenshots any size up to 3840x2160 (displayed 347 px wide) | itch.io/docs/creators/getting-started (verified) |
| Anitya feed | world thumbnail | likely captured in-app from the world; use 16:9 1600x900 or 1280x720 | not verified |
| GitHub issue / README | inline images | ≤10 MB per image; PNG/JPG/GIF/SVG | docs.github.com (verified) |
| X / Twitter post or card | summary_large_image 1200x628 (1.91:1); in-feed 16:9 1600x900 | ≤5 MB | widely documented (secondary sources) |
| Google-form grants (Team1, Circle) | file upload fields if any; the owner sets the limit (1 MB–10 GB); usually a link to a deck | use 1920x1080 JPG <2 MB | not verified per form |
| Tameion (Canteen) Google Form | none: repo, video under 3 min, live link | – | tameion.thecanteenapp.com (verified: "no image requirements") |
| Monad Metropolis | unknown (rules not verified) | default 1024 sq logo + 1920x1080 cover | not verified |

## Mainnet screenshots (`screens/mainnet/`, taken 2026-10-08 about 07:30 UTC)

Taken from the live site at 2x by `screens-mainnet.mjs` (gitignored, like the rest of `screens/`). The payouts page is
retried until the hero reads "9 payouts on 7 chains", because Arc's public RPC is sometimes busy and a partial read shows
lower totals ("Some chains could not be read right now"). Every payout in them is a proof payout sent by Token Tails
(memo "Token Tails first payout"), plus the Tempo campaign-memo payout (memo "Catnip Heist campaign").

| File | Page | Notes |
|---|---|---|
| `payouts-top.png` | /shelter-payouts hero | 0.5 USDC · 0.1 USDG · 0.1 EURC · 0.2 USDC.e |
| `perchain.png`, `card-<chain>-mainnet.png` | "One contract, every chain" section and each card | 8 contracts, balance 0 each |
| `feed.png` | "Every treat, on the record" | the 9 mainnet payouts with tx and receipt links |
| `fund.png` | Pink Paw rescue fund | 0.8 of the 50,000 USDC goal |
| `give-top.png`, `give-tall.png` | /shelter-payouts/give | 7 open network chips, "Sign in to send a treat", 0.01 USDC on Arc |
| `heist-payouts-{1440,390}.png` | /heist?payouts | "Sent to shelters" with the mainnet payouts list |
| `rcard-<key>.png`, `receipt-<key>-390.png`, `receipt-arc-1440.png` | /shelter-payouts/receipt for arc, arc-eurc, tempo (campaign memo), arb, base, rh, avax, monad | receipt card only / phone / desktop |

Used by the Oct 8 re-renders in `arc-microgrants`, `colosseum`, `monad-metropolis`, `team1-avalanche`, `tameion`,
`circle-grants` and `x402-microgrant`. The `dev-*` and `live-*` shots from Oct 4 above are pre-mainnet: do not use them
for new images.
