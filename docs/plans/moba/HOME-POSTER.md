# Home poster (lobby v2, mockup #30 "Flat poster")

Founder, Nov 18: "implement this one: 30Flat poster for our landing page background … position champ itself based on
type (cat / dog) … 2 versions will be needed that'll swap … programatically if possible." The Home backdrop (the
painted "Storm Clash Arena" key art and the pedestal) is replaced by a poster drawn in code. Mockup:
`~/Downloads/paw-legends/lobby-v2/lobby-30-d06-clem-poster-flat.jpg`.

## Layers (back to front)

| # | Layer | How |
|---|---|---|
| 0 | CSS fields behind the canvas | `home.css`: `html[data-screen='title'] body` gradient (rose, orange, bolt yellow, sky), mirrored for a dog. Shows on the first paint and if WebGL is late. |
| 1 | Poster fields, prints, streaks, grain | `render/lobby/backdrop.ts` shader `posterCol()` on the existing backdrop plane (one draw call, no extra pass, screen space). |
| 2 | Rival silhouette | Same shader: an alpha-only image sampled in screen space, tinted 50% darker than its field with a touch of plum, clipped to its own field. |
| 3 | Contact shadow and chest glow | Same shader, at the champion's feet (`setFoot`). |
| 4 | Bolt | Same shader: gold to yellow band with cream halftone dots, orange outline, a thin plum edge. Drawn over the rival. |
| 5 | Champion | The 3D model (`render/lobby.ts`), no pedestal, warm rim light from its own side, a field-coloured rim from the bolt side. |
| 6 | Home HUD | Unchanged (`ui/home/homeScreen.ts`). |

## Colours (v6 Lightning Rivalry)

Rose `#FF3D7F` (cats), sky `#39A6FF` (dogs), bolt `#FFE14A`, gold `#F7BC3C`, orange outline `#FF8A1E`, cream dots
`#FFF3E3`, plum `#12091F`. Fields darken 20% toward the floor and the outer edges so the HUD reads; a soft 22% light
sits behind the champion's chest. Paw prints (rose) and bones (sky) are 14% darker, sparse (about 4 in 10 cells).

## Bolt geometry

Centre line in screen-height units from the screen centre, y 0 (bottom) to 1 (top), for a cat champion
(`poster.ts` `BOLT`): (0.20, 1.08) → (−0.02, 0.60) → (0.13, 0.53) → (−0.12, −0.08), shifted 0.05 right (`BOLT_SHIFT`).
A dog champion uses `flip = −1`: every x is negated (the mirror image, the bolt left of centre). The fields split along
the centre line; the band is 0.018 to 0.068 wide (tapering to the foot) plus a 0.01–0.02 outline. Halftone: a 45°
grid of 1/75 screen height, dot radius 0.14 → 0.40 cell from the band's centre to its edge.

## Rival silhouette

Each champion meets the other species' hero of the same role and the same place in that role (`rivalFor`, HERO_IDS
order): Clem ↔ Howler, Sir Brutus ↔ Lambo, … one to one. The silhouettes are supplementary assets: Gemini
(`gemini-3-pro-image-preview`) redrew each splash full body on a green screen, facing the bolt; the green is keyed and
only the alpha kept, 640 px tall WebP, 6–13 KB each (260 KB for 28), in
`pawlegends-web/public/pawlegends-art/silhouettes/` (served by pawlegends.app with `access-control-allow-origin: *`,
outside the game bundle). Regenerate with `pawlegends/tools/poster-silhouettes.py`. The poster is complete without
them (offline, before a deploy).

The rival box (`rivalBox`) is 88% of the screen height, bottom cropped 6% below the edge, centred 22% of the width
(at most 0.55 screen heights) from the centre on the other field.

## Framing per faction

`posterBox` (pure, tested): the champion starts 62% of the screen height tall with its feet at 93%, centred 20% of the
width (at most 0.52 heights) from the centre on its own side. Every Home HUD element it touches (the overlap audit's
Home keys: profile, chips, corner, left rail, promo, name plate, nav, PLAY, line, peek, version) pushes it with an 8 px
margin: above lowers its head, below lifts its feet, beside slides it toward the bolt. Never under 40% of the height.
The width used is the hero's bind-pose reach × 1.2 (its idle sway and held shields). `lobby.ts` `placePoster` fits the
camera so the hero's top and feet land on the box. The champion turns 0.55 rad toward the bolt.

HUD safe areas (measured, the HUD did not move):

| Size | Cat champion | Dog champion |
|---|---|---|
| 844x390 | between the left rail and the bolt, feet above the nav, head under the plate | between the bolt and PLAY / promo |
| 667x375 | as 844x390, slightly smaller | slides left of PLAY |
| 1440x900 | big, left third; the centred nav is clear | big, right third, left of PLAY |
| 2560x1080 | at most half a height from the centre (stays near the bolt) | mirror |

## Swap

A change of species (Heroes → SELECT, the champion browser's arrows) swings the bolt through upright to the mirror in
300 ms (`SWAP_S`, cubic in-out) with a flicker (`uFlash`), slides the champion's box to the other side over the same
time, and fades the rival out (150 ms), swaps it and fades it back in. The same species only refreshes the rival.
Reduced motion or the Low tier: a cut (no swing, no flicker, no fade); the grain and streaks stand still.

## Budget

The game bundle loses the four `lobby/legends-*.webp` (about 248 KB). No new bundled image; the shader adds ~3 KB of
source. One plane, one draw call: the same cost on phones as the painted backdrop (less: no 1280–1920 px texture).

## Marketing site option (not done)

pawlegends.app's hero could reuse the same look cheaply as CSS (the layer 0 gradient plus an SVG halftone pattern and
one silhouette `<img>`), with no WebGL. Not changed here.

## Tests

- `tests/unit/home-poster.test.ts`: side per faction, mirror math (bolt, boxes), rival one to one, HUD-clear box.
- `tests/e2e/home-poster.spec.ts`: a cat and a dog champion at 844x390, 667x375, 1440x900, 2560x1080 (screenshots in
  `~/Downloads/paw-legends/lobby-v2/poster/`), the champion's drawn box clear of every Home HUD rect; switching species
  swings the layout (the flip passes between the sides); reduced motion cuts.
