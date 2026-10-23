# Ultra Cat: trailer storyboard

Gameplay first. Every picture is the real game, captured frame by frame with a virtual clock (`clock-shim.js`),
driven through `window.__ultra` by a scripted bot (`page.js`). Text cards are drawn in the edit (`cards.html`),
never by the game. Music and sfx are rendered offline in node (`audio.mjs`); the sfx are placed on the game events
logged while capturing (swat, crash, pounce landing, ultra, boss), so every sound sits on its picture.

```
npm run trailer                       # capture + audio + edit, from ultra-cat/
node tools/trailer/capture.mjs [ids] [--aspect 16x9|9x16]   # re-shoot some shots
bash tools/trailer/edit.sh            # re-cut only (SKIP_CARDS=1 reuses the card frames)
```

## Beat grid

150 BPM: one beat = 0.4 s = **24 frames at 60 fps**, one bar = 96 frames (1.6 s). Every cut is on a beat.

## Cut 1: trailer, 16:9 1920x1080, 22 bars = 35.2 s (`ultracat-trailer.mp4`)

The 16:9 takes hide the DAMAGE/HITS counter, the money pops and the game banners (`TAKE_CSS` in `lib.mjs`), so the
cards are the only copy and no counter resets at a cut. Two exceptions, set per shot with `L.show`: Roomba Prime keeps
its "UNPLUGGED!" banner (no card on that beat) and the frenzy keeps the combo burst. The white screen flash is dimmed
in every take. Both cuts are edited at 60 fps and shipped at 30 fps, capped at 1.8 Mb/s (web budget).

| # | Shot id | Bars | Beats | Picture | Card |
|---|---|---|---|---|---|
| 1 | `hook` | 0 | 4 | Purrburbia, 3/4 front camera: the tabby's face, LASER EYES into the apartment block, the block falls | – |
| 3 | `title` | 1 | 4 | Game camera: the cat stomps on, swatting down a block | **ULTRA CAT** slam |
| 4 | `combo` | 2–3 | 8 | Downtown rampage with the HUD: combo climbs past x3, damage counter rolls | KNOCK EVERYTHING OFF THE TABLE |
| 5 | `heli` | 4 | 4 | Closer camera: helicopters spray water on the cat | THE CITY FIGHTS BACK |
| 6 | `truck` | 5 | 4 | Catfish Wharf dusk: water-cannon truck arcs water | Fire trucks |
| 8 | `u-tabby` | 6 | 4 | Nekotown neon night: Marmalade's LASER EYES sweep the towers | 4 CATS · LASER EYES |
| 9 | `u-chonk` | 7 | 4 | Purrburbia: Big Biscuit's BELLY FLOP, three landings | BELLY FLOP |
| 10 | `u-shadow` | 8 | 4 | Catfish Wharf: Midnight's SHADOW DASH through the warehouses, afterimages | SHADOW DASH |
| 11 | `u-siamese` | 9 | 4 | Fort Fluffington: Duchess's SONIC YOWL rings flatten hangars | SONIC YOWL |
| 12–16 | `c-meow`, `c-docks`, `c-sub`, `c-neko`, `c-base` | 10–12 | 2 each | 5 cities, one swat or pounce each, city name lower third | 5 CITIES + name |
| 17 | `wanted` | 12.5 | 2 | WANTED tower topples (landmark bonus pop) | – |
| 18 | `dog` | 13–14 | 8 | Purrburbia, two-shot camera (`kind: 'two'`): MECHA-DOG boss, the cat pounces it, boss bar drops | BOSS: MECHA-DOG |
| 19 | `roomba` | 15–17 | 12 | Fort Fluffington: ROOMBA PRIME: suction, spin, dizzy, pounces, tank phase, the game's "UNPLUGGED!" banner | FINAL BOSS: ROOMBA PRIME (first 8 beats) |
| 20 | `frenzy` | 18 | 4 | Nekotown final frenzy: laser + swats, the x10 combo burst | FINAL FRENZY |
| 21 | `end` | 19–21 | 12 | Blurred city behind the end card | ULTRA CAT / Play free at tokentails.com/ultra-cat |

## Cut 2: how to play, 9:16 1080x1920, 16.5 bars = 26.4 s (`ultracat-mode.mp4`)

Captured in portrait with touch emulated, so the real touch controls (stick, SWAT, POUNCE, ZOOM, ULTRA) are on
screen (the HUD and pops stay, the game banners are hidden); the injected script presses the matching button visually when the bot acts.

| # | Shot id | Bars | Picture | Card |
|---|---|---|---|---|
| 1 | `p-hook` | 0 | Tower collapse | HOW TO PLAY |
| 2 | `p-move` | 1–2 | Drag the stick, the cat stomps down a street | DRAG TO STOMP |
| 3 | `p-swat` | 3–4 | SWAT button: floors fly | TAP SWAT |
| 4 | `p-pounce` | 5–6 | POUNCE: leap and land | POUNCE TO SMASH |
| 5 | `p-zoom` | 7 | ZOOM: zoomies bulldoze | HOLD ZOOM |
| 6 | `p-ultra` | 8–9 | Meter full, ULTRA, laser eyes | ULTRA WHEN FULL |
| 7 | `p-heli` | 10–11 | Heli sprays the cat, swat it | WATER = NAP TIME |
| 8 | `p-boss` | 12–13 | Roomba Prime | BEAT THE BOSSES |
| 9 | `p-cats` | 14–15 | 4 cats, half a bar each | 4 CATS · 5 CITIES |
| 10 | `p-end` | 15–16.5 | End card (2.4 s) | Play free at tokentails.com/ultra-cat |

## Loop and stills

- `ultracat-loop.mp4`: 1280x720, 8 s, silent, no HUD, the tabby wrecking Meowhattan with laser eyes; the last 0.6 s
  cross-fade into the first frames so it loops. Under 1.5 MB.
- `ultracat-trailer.jpg`, `ultracat-mode.jpg`, `ultracat-loop.jpg`: frames from each cut.
- `game-select/ultracat-preview@2x.webp` (624x436) and `home/media/t/tab-ultracat.webp` (320x200): a no-HUD frame.

## Audio

Offline, 48 kHz stereo, -14 LUFS. Music: 150 BPM, D minor; kick on every beat, clap on 2 and 4, 16th hats, a
saw-bass riff, a square lead hook from bar 6, a riser into bars 1, 13, 18, and a half-beat music drop-out before the title slam and before Roomba Prime
(`DROPS` in `audio.mjs`).
SFX on the captured events: swat whoosh, crash per damage burst, pounce thud, cartoon meow on ultra and at the end
card, laser zap, boss bark, explosion on BOSS DOWN.
