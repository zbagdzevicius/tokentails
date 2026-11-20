# Home map backdrops

Founder, Nov 20: "implement Real map backdrops that rotates, we have 18 here". The source is the lobby concepts page
(pawlegends-lobby-concepts.vercel.app, "Real map backdrops"): 18 spots, three on each of six maps (Crossing, Ridge,
Thicket, Quarry, Pitch, Hearthwood).

## What Home does

- Home shows the selected champion standing in a real map spot. The first spot is random on each page load. After
  that, Home shows one spot from each map in turn, so the same map never comes up twice in a row.
- Each spot stays **12 s**. The next spot then fades in over **1.2 s**, while the camera and the sun ease from one
  spot's values to the next. The fade waits until the next picture has loaded, so a slow network keeps the current spot
  on screen instead of fading to nothing.
- The rotation stops in these cases:
  - Reduced motion is on: one spot stays, with no sway.
  - The tab or app is hidden: no frames are drawn, and the clock does not run.
  - Something covers Home: a panel, a modal or the loading veil (`screenBusy()`, checked 4 times a second). The
    champion browser and What's New already freeze the lobby.
  - Home is not the current screen.
- A plum scrim darkens the top bar, the bottom row, the left stack and the right side, and leaves the champion's middle
  clear. A soft contact shadow sits under the champion on every tier. Medium and High also draw the sun's real shadow
  on a shadow-only ground plane. The poster's drifting motes are hidden over the map.
- If a tall champion stands on a near spot, its head could reach under the nameplate (844x390). In that case the
  champion is drawn smaller (never under 0.72 of its size), with its feet kept on the spot.
- If the pictures cannot load (offline, or before the art deploy), two failed spots in a row switch Home to the drawn
  poster (HOME-POSTER.md).

## How it works: hybrid (decided on measurements, Nov 20)

- **The map is a picture.** Each picture shows the empty spot, drawn by the real renderer
  (`tools/bake-lobby-maps.mjs`, which uses `tools/clips/stills.mjs` with `empty: true`). Pictures are 2.164:1 (the
  844x390 frame), with the feet at (0.42, 0.8). Each comes in two widths: 1920 px (45–105 KB) and 1280 px (28–44 KB).
  They live in `pawlegends-web/public/pawlegends-art/lobby-maps/`, and pawlegends.app serves them outside the game's
  10 MB budget. Home loads only the spot on screen and the next one, decoded as ImageBitmaps and uploaded to the GPU on
  arrival.
- **The champion is live 3D.** It is drawn with the camera the picture was shot with. Every spot is stored in a
  champion-centred frame (`src/render/lobby/mapViews.ts`):
  - the feet are at the origin;
  - the camera is at (0, h, gd), with a 32° vertical FOV;
  - the champion turns 45° toward PLAY;
  - each spot has its own sun direction, sun colour and sky light.

  The picture is cover-cropped so that the feet stay at (0.42, 0.8) on any screen. The 3D camera uses the same crop as
  its view offset.
- **A live 3D map was rejected.** It would cost 35–60 draw calls on a menu, close to a match. It would also mean a map
  rebuild on every rotation (seconds on a phone) and loading the match code before PLAY.

## Numbers (Nov 20, shipped build, M3 Pro headless, 14 s window with 4 s stays so it crosses 2–3 fades)

| Profile | Draw calls | p50 / p95 / max frame |
|---|---|---|
| Desktop 1920x1080 | 5 (was 4 with the poster) | 16.7 / 16.7 / 16.8 ms |
| 844x390 touch, DPR 3, CPU 4x slower | 5 | 16.7 / 16.7 / 16.8 ms |
| Same, Low quality | 3 (was 3) | 16.7 / 16.7 / 16.8 ms |

The bundle budget after the change: first-load JS is 437.3 KB gzip (was 432.8 KB, budget 450 KB), and the total is
9.61 MB (budget 10 MB).

## Hooks

- `?mapbg=<id>` pins one spot (e2e and screenshots).
- `?mapbg=off` shows the poster fallback.
- `?mapbgEvery=<s>` shortens the stay (e2e).
- With `?e2e=1`, the page sets these attributes on `html`:
  - `data-map-bg`: the id of the spot shown;
  - `data-map-bg-ready`: whether that spot's picture has loaded;
  - `data-hero-box`: the champion's drawn box, in CSS px.
- Tests: `tests/unit/home-map-bg.test.ts` and `tests/e2e/home-map-bg.spec.ts`.

## Changing a spot

1. Edit `pawlegends/tools/clips/lobby-maps.shots.json`.
2. Run `node tools/bake-lobby-maps.mjs --only <id>` (it needs a GPU).
3. Update that spot's row in `MAP_VIEWS`: `h`, `gd`, the `target` from the solved camera, and the light. The unit test
   checks that every spot's camera puts the feet at (0.42, 0.8).
