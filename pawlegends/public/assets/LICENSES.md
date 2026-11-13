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
| `cards/icons/<element>.webp` | `client/public/cards/icons/<element>.webp` (64 px) | Token Tails, all rights reserved |

Lobby backgrounds (`lobby/`, UX pass 2, about 126 KB, loaded by the lobby only): painted scenes generated for
Token Tails with Google Gemini (`gemini-3-pro-image-preview`, 2752 x 1536 masters, SynthID watermarked), edited
in follow-up turns and encoded with `cwebp` (quality 78).

| File | Source | Licence |
|---|---|---|
| `lobby/meadow-{1280,1920}.webp` | Gemini, "meadow bridge at dusk" (cat castle, paw bridge, dog fort) | Token Tails, all rights reserved |
| `lobby/arena-{1280,1920}.webp` | Gemini, "tournament arena at sunset" (paw and bone pennants) | Token Tails, all rights reserved |

Feel pass art (2026-11, about 1.3 MB in all, each file loaded only by the screen or HUD piece that uses it): generated
for Token Tails with Google Gemini (`gemini-3-pro-image`, SynthID watermarked), keyed and encoded by
`art-src/feel-pass/build.py`. Prompts and usage: `art-src/feel-pass/ART.md`; sizes: `feel-art.json`.

| File | Source | Licence |
|---|---|---|
| `lobby/castles-{1280,1920}.webp` | generated, Gemini, 2026-11 (A1 daylight cat castle and dog fort) | Token Tails, all rights reserved |
| `screens/{pick-stage,matchup,win-cat,win-dog,lose-cat,lose-dog}-{1280,1920}.webp`, `screens/pause-1280.webp` | generated, Gemini, 2026-11 (A2, A3, A4, A8) | Token Tails, all rights reserved |
| `world/offmap-ground-1024.webp` | generated, Gemini, 2026-11 (A9, made seamless by an edge crossfade) | Token Tails, all rights reserved |
| `ui-frames/*.webp` | generated, Gemini, 2026-11 (A5, 9-sliced) | Token Tails, all rights reserved |
| `stickers/*.webp`, `pings/*.webp`, `icons/*.webp` | generated, Gemini, 2026-11 (A6, A7, A10, chroma-keyed) | Token Tails, all rights reserved |

Home and Mode Select art (docs/plans/moba/HOME-MODES.md, 2026-11, about 0.6 MB in all): generated for Token Tails
with Google Gemini (`gemini-3-pro-image-preview`, SynthID watermarked) with the game's own champion portraits as
references, no text and no third-party characters, encoded to WebP. Prompts and scripts are kept outside the repo
(`~/Downloads/paw-legends/home-art/scripts/`). The key art loads with Home; mode art loads when Mode Select opens.

| File | Source | Licence |
|---|---|---|
| `lobby/legends-{1280,1920}.webp`, `lobby/legends-wide-{1280,1920}.webp` | generated, Gemini, 2026-11 (Home key art "Storm Clash Arena", Nov 13: cats left, dogs right, a bolt left of centre, calm sand centre; side champions cut from a generated green-screen sheet; 16:9 desktop, 21:9 phones; scripts in `~/Downloads/paw-legends/home-bg-variants/`) | Token Tails, all rights reserved |
| `lobby/promo-{pass,cannon}.webp` | crops of the Home key art and the Cannon Chaos tile | Token Tails, all rights reserved |
| `modes/{blitz,skirmish,classic,coop,ranked,cannon}-{256,512}.webp` | generated, Gemini, 2026-11 (round mode tiles) | Token Tails, all rights reserved |
| `screens/modes-{1280,1920}.webp` | generated, Gemini, 2026-11 (Mode Select backdrop: a moonlit hall of banners) | Token Tails, all rights reserved |

### Treat Track and Legends Pass art (Hearth Storybook, brandbook v1)

Generated with gemini-3-pro-image-preview from the repo portraits (prompts in `~/Downloads/paw-legends/brandbook/pass/scripts/`).
No text or logo is drawn in any image; titles are set in HTML. Each file has a smaller `-lo` copy for the Low quality tier.

| File | Source | Licence |
|---|---|---|
| `pass/banner{,-lo}.webp` | generated, Gemini, 2026-11 (Season 1 banner: Clem and Duchess casting over an open storybook) | Token Tails, all rights reserved |
| `pass/book{,-lo}.webp` | generated, Gemini, 2026-11 (blank open-book parchment spread) | Token Tails, all rights reserved |
| `pass/chest{,-lo}.webp`, `pass/sealed{,-lo}.webp` | generated, Gemini, 2026-11 (treat chest; wax-sealed postcard envelope), green screen keyed | Token Tails, all rights reserved |
| `pass/node-{free,premium,now}{,-lo}.webp` | generated, Gemini, 2026-11 (tier node emblems), green screen keyed | Token Tails, all rights reserved |

### Champion faces and skin art (v6 Lightning Rivalry skins library)

Generated with gemini-3-pro-image-preview from each champion's in-game reference art (splash, model render), prompts
and notes in `~/Downloads/paw-legends/brandbook/v6-lightning-rivalry/skins/_work/`. Imported by
`tools/import-skin-art.mjs` (webp q78).

| File | Source | Licence |
|---|---|---|
| `faces/<hero>-256.webp` | generated, Gemini, 2026-11 (each champion's default-look head portrait) | Token Tails, all rights reserved |
| `pawlegends-web/public/pawlegends-art/skins/<skin id>-{256,360,720}.webp` (served by pawlegends.app, not in this folder) | generated, Gemini, 2026-11 (one face and one 4:5 story splash per skin of the game's skins library) | Token Tails, all rights reserved |
