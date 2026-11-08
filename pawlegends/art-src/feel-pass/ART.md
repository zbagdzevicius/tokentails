# Feel pass art (A1–A10)

Generated with Gemini (`gemini-3-pro-image`) by `gen.py` (raw JPEGs land next to it in `raw/`, not committed), then
keyed, 9-sliced, made seamless and encoded to WebP by `build.py <pawlegends/public/assets>`, which also writes
`public/assets/feel-art.json` (the manifest: file, size, KB, alpha, use). Plan: `docs/plans/moba/FEEL-PASS.md`
(ART checklist). Licences: `public/assets/LICENSES.md`.

Every prompt starts with the shared style line (`STYLE` in `gen.py`): chunky painted cartoon, warm-brown ink outline
#3b2417, cat rose #ff6f91 / cream #fff3dc, dog ochre #b5762b / brown #5b3a1e, no text, no logos, no imitation of an
existing game. Backgrounds also get the existing `lobby/meadow` painting as a style reference. Alpha assets are drawn
on flat #00ff00 and chroma-keyed. Every output was checked by eye for text, logos and keying fringes.

## Wired in this pass (screens only)

- A1 `lobby/castles-*`: `src/render/lobby/lobbyBg.ts`, the title lobby's scene on visits 1, 4, 7… (meadow 2, 5…, arena 3, 6…). `?lobbybg=castles` forces it.
- A2 `screens/pick-stage-*`: the lobby backdrop while `data-screen=pick` (`screenBg` in `lobbyBg.ts`, polled every 0.3 s by `render/lobby.ts`).
- A4 `screens/{win,lose}-{cat,dog}-*`: the lobby backdrop while `data-screen=results`, by the shown hero's species and `.pl-results.won`.
- A3 `screens/matchup-*`: `.pl-loading` background in `src/ui/ui.css` (darkened 50–62 %; 1920 at ≥ 1400 px wide).
- A8 `screens/pause-1280`: `.pl-menu::before` in `src/ui/ui.css` at 30 % opacity (the match still shows through; a party match keeps running).

## For the BUILD agent (in-match HUD, not wired here)

- A5 `ui-frames/top-strip-440x48`: `border-image: url(/assets/ui-frames/top-strip-440x48.webp) 24 fill / 12px` on the 220×24 top strip.
- A5 `ui-frames/minimap-rim-256`: overlay on the 128 px minimap box (transparent centre; the drawn rim is about 10 % thick).
- A5 `ui-frames/pause-panel-192`: `border-image: url(/assets/ui-frames/pause-panel-192.webp) 64 fill / 32px` (cream fill needs dark text; drop `fill` on the dark pause card).
- A5 `ui-frames/talent-card-720x128`: `border-image: url(/assets/ui-frames/talent-card-720x128.webp) 52 fill / 26px` on the 360×64 talent card (cream fill, dark text).
- A6 `stickers/*-256`: base-cat / base-dog for the spawn toast (B2.7), nap-cat for the recall channel, respawn-dog for "Back in N", cheer-cat / cheer-dog for first blood and multi-kill, help-cat for tips. Show at 48–96 CSS px.
- A7 `pings/*-128`: ping wheel (`ui/pingWheel.ts`) and minimap / overhead ping glyphs, 32–48 CSS px.
- A9 `world/offmap-ground-1024`: seamless; `RepeatWrapping`, about one repeat per 12–16 m on the outer ground plane (B1.9).
- A10 `icons/cancel-bubble-144` (72 CSS cancel bubble, B4.2), `icons/lock-r-88` (44 CSS locked R ghost chip, B3).

## Assets

| # | File (under `public/assets/`) | Size | KB | Prompt id |
|---|---|---|---|---|
| A1 | `lobby/castles-1920.webp` | 1920×1080 | 124.4 | `lobby-castles` |
| A1 | `lobby/castles-1280.webp` | 1280×720 | 75.5 | `lobby-castles` |
| A2 | `screens/pick-stage-1920.webp` | 1920×1080 | 58.5 | `pick-stage` |
| A2 | `screens/pick-stage-1280.webp` | 1280×720 | 36.1 | `pick-stage` |
| A3 | `screens/matchup-1920.webp` | 1920×1080 | 132.5 | `matchup-split` |
| A3 | `screens/matchup-1280.webp` | 1280×720 | 81.7 | `matchup-split` |
| A4 | `screens/win-cat-1920.webp` | 1920×1080 | 120.6 | `win-cat` |
| A4 | `screens/win-cat-1280.webp` | 1280×720 | 74.3 | `win-cat` |
| A4 | `screens/win-dog-1920.webp` | 1920×1080 | 81.7 | `win-dog` |
| A4 | `screens/win-dog-1280.webp` | 1280×720 | 51.5 | `win-dog` |
| A4 | `screens/lose-cat-1920.webp` | 1920×1080 | 64.5 | `lose-cat` |
| A4 | `screens/lose-cat-1280.webp` | 1280×720 | 39.5 | `lose-cat` |
| A4 | `screens/lose-dog-1920.webp` | 1920×1080 | 76.5 | `lose-dog` |
| A4 | `screens/lose-dog-1280.webp` | 1280×720 | 47.7 | `lose-dog` |
| A8 | `screens/pause-1280.webp` | 1280×720 | 38.1 | `pause-cushions` |
| A9 | `world/offmap-ground-1024.webp` | 1024×1024 | 37.6 | `ground-tile` |
| A5 | `ui-frames/top-strip-440x48.webp` | 440×48 α | 3.0 | `frame-plate` |
| A5 | `ui-frames/pause-panel-192.webp` | 192×192 α | 6.7 | `frame-panel` |
| A5 | `ui-frames/talent-card-720x128.webp` | 720×128 α | 6.3 | `frame-panel` |
| A5 | `ui-frames/minimap-rim-256.webp` | 256×256 α | 14.0 | `frame-rim` |
| A6 | `stickers/base-cat-256.webp` | 256×256 α | 12.6 | `st-base-cat` |
| A6 | `stickers/base-dog-256.webp` | 256×256 α | 13.0 | `st-base-dog` |
| A6 | `stickers/help-cat-256.webp` | 256×256 α | 11.4 | `st-help-cat` |
| A6 | `stickers/nap-cat-256.webp` | 256×256 α | 14.3 | `st-nap-cat` |
| A6 | `stickers/respawn-dog-256.webp` | 256×256 α | 13.9 | `st-respawn-dog` |
| A6 | `stickers/cheer-cat-256.webp` | 256×256 α | 14.8 | `st-cheer-cat` |
| A6 | `stickers/cheer-dog-256.webp` | 256×256 α | 13.6 | `st-cheer-dog` |
| A7 | `pings/on-my-way-128.webp` | 128×128 α | 5.3 | `ping-onmyway` |
| A7 | `pings/danger-128.webp` | 128×128 α | 6.4 | `ping-danger` |
| A7 | `pings/group-up-128.webp` | 128×128 α | 9.1 | `ping-group` |
| A7 | `pings/nice-128.webp` | 128×128 α | 5.0 | `ping-nice` |
| A7 | `pings/oops-128.webp` | 128×128 α | 5.3 | `ping-oops` |
| A10 | `icons/cancel-bubble-144.webp` | 144×144 α | 6.9 | `icon-cancel` |
| A10 | `icons/lock-r-88.webp` | 88×88 α | 3.3 | `icon-lock` |

## Prompts (after the shared style line)

- `lobby-castles` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. A sunny late-afternoon meadow seen from a slightly high angle. On the far left a pink cat castle with cat-ear turret roofs and rose banners; on the far right a sturdy wooden dog fort with bone-shaped banners and paw carvings. A toy-strewn dirt path (yarn balls, rubber bones, toy mice) winds between them and a sparkling river runs diagonally from the bottom-left to the top-right. Fluffy clouds, warm golden light, gentle foreground grass and flowers framing the bottom edge.
- `pick-stage` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. A cosy theatre stage for a hero line-up: heavy rose velvet curtains drawn open at the sides, a wooden plank stage floor, one warm round spotlight pool on the floor right of centre, paw-print shaped confetti scattered on the floor and drifting in the air, soft warm haze. Colours blend from rose on the left to ochre on the right. The stage is empty: no characters.
- `matchup-split` (16:9, 2K, style ref): Wide landscape splash background. The picture is split by one bold diagonal slash running from the bottom-left corner to the top-right corner. The lower-left half is the cat side: rose and cream, a pink cat castle silhouette, yarn balls, paw prints. The upper-right half is the dog side: ochre and brown, a wooden dog fort silhouette, bones and kennel flags. Where the halves meet along the diagonal, puffy cartoon dust clouds and sparks burst out. High contrast, energetic, no characters.
- `win-cat` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. Victory celebration: on the right side a happy pile-up of chibi cats in rose and cream scarves cheering on top of each other, one holding up a big golden trophy shaped like a fish bone. Gold #ffd34d ribbons, streamers and confetti, warm golden glow, joyful.
- `win-dog` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. Victory celebration: on the right side a happy pile-up of chibi dogs in ochre and brown bandanas cheering on top of each other, one holding up a big golden trophy shaped like a bone. Gold #ffd34d ribbons, streamers and confetti, warm golden glow, joyful.
- `lose-cat` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. A gentle rainy evening on a wooden porch, desaturated lavender (#8a7fb5) and dusty rose palette. On the right a chibi cat sits wrapped in a blanket next to a soggy toy mouse, looking a little sulky but cute, not sad. Raindrops, puddles, a warm lantern glow hinting at a comeback.
- `lose-dog` (16:9, 2K, style ref): Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft low-contrast detail so menu text and buttons can sit on top. A gentle rainy evening on a wooden porch, desaturated lavender (#8a7fb5) and dusty ochre palette. On the right a chibi dog sits under a small umbrella next to a soggy squeaky toy bone, a little grumpy but cute, not sad. Raindrops, puddles, a warm lantern glow hinting at a comeback.
- `pause-cushions` (16:9, 1K, style ref): Wide background: the inside of a cosy blanket-and-cushion fort, soft rose and cream fabrics, plump pillows, fairy lights, very soft focus and low contrast as if slightly blurred, calm, no characters. The whole picture is quiet so a menu panel can sit in the middle.
- `ground-tile` (1:1, 2K, style ref): Top-down orthographic view (camera straight down) of a seamless tileable ground texture: soft cartoon meadow grass in muted greens #7fae5a and #5d8a44 with soft painted grass tufts, sparse tiny flowers, and only a few very small toy blocks and tiny pebbles, all small and evenly scattered across the whole square with no clusters and no focal point, no horizon, no shadows pointing anywhere specific, even lighting. Painted texture, edges must continue seamlessly.
- `frame-plate` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A flat front-facing rounded-rectangle UI plate, almost square, cream #fff3dc fill with a subtle painted texture, a thick warm-brown #3b2417 ink border with rounded corners, a thin inner line of little stitched paw-print dashes running inside the border. Completely flat, no perspective, empty inside.
- `frame-panel` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A flat front-facing square menu panel with big rounded corners: cream #fff3dc paper fill, a thick warm-brown #3b2417 outline, a rose #ff6f91 inner trim band, small cute paw-print studs exactly in each of the four corners. Completely flat, symmetric, no perspective, empty inside.
- `frame-rim` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A flat front-facing square picture frame with rounded corners, thick wooden-and-cream rim with a warm-brown #3b2417 outline and paw-print stitching around the rim, a tiny paw charm in each corner. The inside of the frame is the same flat pure green. Completely flat, symmetric, no perspective.
- `st-base-cat` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. A cheerful rose-and-cream cat pointing down and to the left with one paw, winking.
- `st-base-dog` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. A cheerful ochre-and-brown dog pointing up and to the right with one paw, tongue out.
- `st-help-cat` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. A curious rose-and-cream cat holding up a big golden question-mark shaped balloon.
- `st-nap-cat` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. A rose-and-cream cat curled up asleep on a small round cushion, little "z" bubbles drawn as simple puffs (no letters).
- `st-respawn-dog` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. An ochre-and-brown dog holding a big round brass stopwatch, determined face.
- `st-cheer-cat` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. A rose-and-cream cat jumping with both paws up, celebrating, with a few gold stars around it.
- `st-cheer-dog` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a thick white sticker border around the whole silhouette. An ochre-and-brown dog jumping with both paws up, celebrating, with a few gold stars around it.
- `ping-onmyway` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game ping icon: a big golden paw print with two speed lines, thick white outline, readable at 32 px.
- `ping-danger` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game ping icon: the head of a startled cat with its fur standing up and a red #e8414b exclamation spark, thick white outline, readable at 32 px.
- `ping-group` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game ping icon: three small blue #3d8bff paw prints huddled together in a tight triangle with a curved arrow ring around them, thick white outline, readable at 32 px.
- `ping-nice` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game ping icon: a cartoon cat paw giving a thumbs-up, golden, with a sparkle, thick white outline, readable at 32 px.
- `ping-oops` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game ping icon: a sheepish cat face with a sweat drop and a tiny ball of tangled yarn, thick white outline, readable at 32 px.
- `icon-cancel` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold round game button icon: a red #e8414b circle with a thick white outline holding a big white X made of two crossed fish bones, a tiny scared cat face peeking over the top edge. Readable at 48 px.
- `icon-lock` (1:1, 1K): Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. A bold simple game icon: a chunky grey padlock with a paw-print shaped keyhole, thick white outline. Readable at 32 px.
