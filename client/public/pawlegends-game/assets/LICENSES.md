# Asset licences

Every shipped asset gets a row here, copied from `swordcat/public/assets/LICENSES.md` for each PPK file used
(POC.md §6.9). The map and units are geometry built in code; the only binary art is the font and the Token Tails
card art under `cards/` (copied from the Token Tails client and shrunk, see below).

| File | Source | Licence |
|---|---|---|
| `fonts/Fredoka-Latin.woff2` | Fredoka (Google Fonts, https://fonts.google.com/specimen/Fredoka), copied from `swordcat/public/assets/fonts/` | SIL Open Font License 1.1, `fonts/licenses/Fredoka-OFL.txt` |

Heroes, minions, towers and the map are procedural geometry built in code (`src/render/views/`), not baked assets.
Sounds are zzfx parameter arrays synthesised at runtime (`src/audio/`); zzfx is MIT (© 2019 Frank Force).

Token Tails card art (`cards/`, about 0.7 MB, loaded only when a screen that shows a card is open): Token Tails' own
client assets, copied from `client/public/cards/` and resized with `cwebp` (backgrounds, patterns, fx) or `ffmpeg`
(icons, nearest-neighbour 64 px). No pack art, no NFT or host cat art.

| File | Source | Licence |
|---|---|---|
| `cards/el/{fire,ice,electric,grass,fairy,dark,wind,sand,stellar,water}.webp` | `client/public/cards/backgrounds/<element>.webp` (384 px, q62) | Token Tails, all rights reserved |
| `cards/tier/{COMMON,RARE,EPIC,LEGENDARY}.webp` | `client/public/cards/backgrounds/pattern-<TIER>.webp` (320 px) | Token Tails, all rights reserved |
| `cards/fx/{sparkle,legendary-sparkle,blue-sparkle,purple-sparkle,blue-paw,claw,whiskers-left,whiskers-right}.webp` | `client/public/cards/backgrounds/` (same names, unchanged) | Token Tails, all rights reserved |
| `cards/fx/{epic-paw,legendary-paws,epic-claw}.webp` | `client/public/cards/backgrounds/` (256 px) | Token Tails, all rights reserved |
| `cards/fx/golden-burst.webp`, `white-burst.webp`, `reveal-sparkle.webp`, `legendary-bg.webp`, `rare-swirl.webp` | `client/public/cards/backgrounds/golden-opening-sparkle`, `white-opening-sparkle`, `opening-reveal-sparkle1`, `legendary-bg`, `rare-swirl2` (384 px) | Token Tails, all rights reserved |
| `cards/back.webp` | `client/public/cards/backgrounds/card-placeholder.webp` (340 px) | Token Tails, all rights reserved |
| `cards/icons/<element>.webp` | `client/public/cards/icons/<element>.webp` (64 px) | Token Tails, all rights reserved |
