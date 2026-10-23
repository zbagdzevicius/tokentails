# Meow Run: trailer storyboard

Gameplay first. Every picture is the real game, captured frame by frame with a virtual clock (`clock-shim.js`),
played by the shots/bot.mjs brain running frame-exact inside the page (`page.js`), with cinematic camera overrides
where the game camera keeps Mochi too small. Text cards are drawn in the edit (`cards.html`), never by the game.
Music and sfx are rendered offline in node (`audio.mjs`); the sfx sit on the game events logged while capturing
(jump, pounce, land, slide, vault, cloud, fish, bells, near misses, barks, splashes, claws, yarn rumble), so every sound is on its picture.

```
npm run trailer                                   # capture + cards + audio + edit, from meow-run/ (~10 min)
node tools/trailer/capture.mjs [ids] [--aspect 16x9|9x16]   # re-shoot some shots
bash tools/trailer/edit.sh [trailer|mode|loop|stills]       # re-cut only (SKIP_CARDS=1 reuses the card frames)
node tools/trailer/scout.mjs <stage> [--stills s secs]      # piece list / location stills
```

## Beat grid

144 BPM: one beat = 25 frames at 60 fps, one bar = 100 frames (1.667 s). Every cut is on a beat.

## Cut 1: trailer, 16:9 1920x1080, 84 beats = 35.0 s (`meowrun-trailer.mp4`)

The 16:9 takes hide the score, multiplier, hearts, bells, progress bar, coach card and key prompts (`TAKE_CSS` in
`lib.mjs`), so the cards are the only copy and no counter resets at a cut. The game's own comic callouts
("TAIL READY!", "WOOF!", "GIANT YARN!", "CLOSE ONE!") and score pops stay: they are the juice. The fish-combo shot
keeps the score and multiplier. Cameras are track-space overrides around Mochi (`page.js` `applyCam`): `side`
(vaults, leaps), `chase` (low behind), `front` (ahead, looking back at her face and whatever chases her), `dogCam`
(well ahead of Mochi and the dog on the far side of the path, so the dog's face reads; `dogSide` mirrors a camera to the
side the dog is on, since it hops sides). Score pops are hidden (`NO_POPS`) wherever a title or logo sits on the shot.

| Beats | Shot | Camera | Picture | Card |
|---|---|---|---|---|
| 0–4 | `hook` | side | River Gorge side canyon: the tail plant at 0.13 s, the pole vault, the bell at the top, "PURRFECT!" | – |
| 4–8 | `title` | dogCam (3/4 front) | The big dog bounds in beside her, face, tongue and collar in frame | **MEOW RUN** slam in the sky, top right |
| 8–12 | `m-run` | chase | Sunny Meadow, winding path, fish, a log jumped | Race home for dinner |
| 12–16 | `m-slide` | chase low | Slides under low branches, "CLOSE ONE!" | Jump · slide · dodge |
| 16–20 | `m-vault` | side | The meadow tail vault, bell at the top | TAIL VAULT |
| 20–28 | `g-wall`, `g-wall2` | game (closer), tight chase + light roll | Claw wall-runs up the cliff, then the banked one up close with the bell grab | CLAWS OUT! / WALL-RUN |
| 28–34 | `g-river` | chase | Leaf surf, rapid hop, air bell | Leaf surf the river |
| 34–40 | `g-dog` | side tracking (dogSide) | The dog chase in profile: the whole dog bounding, barking and snapping beside her, log hurdles | The big dog wants to play |
| 40–48 | `s-puff`, `s-cloud` | chase | Sunset Hills: the cloud summoned at the canyon edge, the ride, hoops, an air bell | PUFF CLOUD / OVER THE CANYON |
| 48–54 | `s-combo` | chase | Fish line, multiplier climbing to x7, a golden bell (score + multiplier shown) | 7 golden bells · fish combos |
| 54–60 | `s-yarn` | front | The giant yarn ball rolls past ("GO LEFT!") | Outrun the giant yarn ball |
| 60–72 | `m-pounce`, `g-gap`, `s-wall`, `endless` | side, side, chase, chase | Three beats each (1.25 s, big stage tags): pounce, gorge leap, sunset wall-run, Endless (the distance counter shown and enlarged, a giant yarn ball thundering past) | 3 stages + Endless (+ stage tags; ENDLESS / HOW FAR CAN YOU GO?) |
| 72–76 | `cottage` | the game's cutscene | Grandma Cat's cottage, "Home for dinner!" (all 7 bells set, so no "find the bells" line) | – |
| 76–84 | `end` | orbit, blurred | Clean sunset run behind the end card | MEOW RUN / Play free at tokentails.com/meow-run |

## Cut 2: how to play, 9:16 1080x1920, 62 beats = 25.8 s (`meowrun-mode.mp4`)

Captured in portrait with touch emulated, so the real phone HUD (hearts, bells, score, the PUFF meter) is on screen;
the callouts, the in-game prompt banner ("SWIPE UP - JUMP!") and the tutorial coach card are hidden, so each lesson
has one text source, the caption (two banners saying the same thing crowded the top third). A fingertip overlay (`page.js` `touchLook`, above
Mochi at 0.6 H) swipes up, swipes down, drags and taps exactly when the bot does. The game camera everywhere except
`hook` (front 3/4, no score pops under the title) and `p-dog` (far ahead looking back at the dog's face, no finger).

| Beats | Shot | Card |
|---|---|---|
| 0–4 | `hook` | MEOW RUN / How to play |
| 4–8 | `p-steer` | Drag to steer |
| 8–12 | `p-jump` | Swipe up to jump |
| 12–16 | `p-slide` | Swipe down to slide |
| 16–20 | `p-pounce` | Swipe up twice / Pounce over gaps |
| 20–24 | `p-vault` | Tap: tail vault |
| 24–28 | `p-wall` | Claws out on walls / Automatic |
| 28–32 | `p-river` | Surf the river |
| 32–36 | `p-cloud` | Tap: puff cloud |
| 36–40 | `p-bells` | Grab all 7 bells |
| 40–44 | `p-fish` | Fish = combo |
| 44–48 | `p-dog` | Don't get caught / 3 hearts a run |
| 48–52 | `p-yarn` | Stay on the free side |
| 52–56 | `cottage` | – (the game's "Home for dinner!" line only) |
| 56–62 | `end` | MEOW RUN / Play free at tokentails.com/meow-run |

## Loop and stills

- `meowrun-loop.mp4`: 1280x720, 8 s, silent, no HUD, one continuous meadow run into the tail vault (take `loop`);
  the last 0.6 s cross-fade into the first frames so it loops. About 1.1 MB.
- `meowrun-trailer.jpg`, `meowrun-mode.jpg`, `meowrun-loop.jpg`: frames from each cut.
- `game-select/meowrun-preview@2x.webp` (624x436) and `home/media/t/tab-meowrun.webp` (320x200): loop take frame
  368, no HUD: Mochi at the top of the tail vault grabbing the golden bell, the meadow path below.
- The trailer poster is that frame with the title card lifted above her head (`posterLift`).

## Audio

Offline, 48 kHz stereo, -14 LUFS, true peak under -1 dBTP. Music: 144 BPM, F major, bouncy: kick, clap on 2 and 4,
16th shaker, a plucky bass, bright chord stabs, a pizzicato/marimba lead, a glockenspiel answer, risers into the
title and the chases, a darker chase section for the dog and the yarn ball, a soft cozy section under the cottage.
SFX on the captured events: jump boing, pounce whoosh, landing pat, slide swish, tail-vault spring, claw scratches,
leaf-surf spray, puff, fish blip (pitch climbs with the multiplier), bell chime, near-miss whoosh, dog bark, yarn
rumble, meow on the title and the end card.

## Determinism

`clock-shim.js` steps a virtual clock (1/60 s plus 1e-6 ms, so the game's 120 Hz accumulator runs exactly two steps a
frame), seeds `Math.random`, pins `Date.now` while an Endless run starts (its chunk seed), and forces WebGL MSAA on the emulated-touch portrait page. The bot is the
`shots/bot.mjs` brain with zero input latency, acting through `__meow.press` / `input.botSteer`; every take is
replayable (same seed, same events). `TRAILER_CAM='{...}'` and `TRAILER_S=<s>` override one shot's camera and start
for camera tests. `edit.mjs` deletes its ~200 MB of segments after each cut.
