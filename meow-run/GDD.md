# Meow Run: game design

Mochi, a small orange-and-white kitten, races home across the countryside so she is not late for dinner at Grandma Cat's cottage. It is a third-person runner on a winding path through a bright toon landscape. Each stage is a hand-authored track with set pieces, not random lanes. The tone is funny and cozy, in the Token Tails style. Everything is procedural: geometry, materials, shaders and WebAudio. There are no asset files.

Inspiration: a fan runner video (frame grids in the architect's scratchpad). We borrow its structure: winding path, set pieces, HUD layout and a cozy arrival. We use none of its IP, names, characters or callouts.

## Pillars

1. **Gameplay first.** Story beats are short: the ending cutscene lasts at most 12 s and can be skipped. There are no intro cutscenes.
2. **Readable set pieces.** Every hazard can be read about 1.5 s ahead. A prompt (`SPACE - JUMP!`, `E - TAIL VAULT!`) appears for anything new. A failed set piece costs a heart, never the run.
3. **Juicy and fast.** Speed runs from 18 to 30 u/s. The game has squash and stretch, landing dust, speed lines, FOV kicks and comic callouts ("CLOSE ONE!", "PURRFECT!", "NOM NOM!"). All text is in English.
4. **Phone-ready.** Swipes and taps work at 390x844 in portrait and in landscape. Phones start on LOW quality, and the game holds 60 fps on desktop.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Steer (free lateral movement within the path width) | A/D or Left/Right | drag sideways (analog), or flick to dodge |
| Jump | Space, W or Up | swipe up |
| Pounce (air dash, double jump) | Jump again in the air | swipe up again |
| Slide (in the air: fast fall, then slide on landing) | S or Down | swipe down |
| Ability (context: tail vault, puff cloud) | E or Shift | tap |
| Pause | Esc or P | pause button |

Feel numbers live in `TUNING` in `src/core/player.ts`:

- Gravity is 52 and jump velocity is 16.5, so the apex is about 2.6 u.
- Coyote time is 0.11 s and the jump buffer is 0.13 s.
- The slide lasts 0.75 s.
- The pounce gives speed x1.45 for 0.35 s at half gravity.
- Lateral speed is 11 u/s.
- A hit gives 1.4 s of invulnerability with flashing, and speed drops to x0.55, recovering over 0.9 s.

## Abilities (cat versions of the reference moves)

- **Tail vault.** Mochi's tail stretches into a springy pole and vaults a chasm too wide to jump. Press `E - TAIL VAULT!` in the approach window. The player follows an authored arc (`beginArc`).
- **Claw wall-run.** Mochi sprints up and along cliff faces with claw scratch sparks. The track itself climbs or banks steeply (segment kind `wall`), and Mochi runs it automatically. Set pieces may add a "claws out" prompt.
- **Puff cloud.** A fluffy cat-shaped cloud carries Mochi over the big canyon (`beginRide` over a `cloud` segment). Yarn and treats fill the PUFF meter, and a fuller meter means a faster cloud with more bonus. If Mochi reaches the edge without pressing, the cloud is summoned anyway, so the player can never get stuck.
- **Leaf surf.** On `river` segments Mochi surfs a leaf, with spray, rocks to dodge and fish lines.
- **Pounce.** A jump in the air: a forward dash with a little hang time. It is the expert tool for long gaps and air bells.

## Hazards and chasers

- **Ground hazards:** logs (jump), rocks (dodge or jump), low branches (slide) and gaps (jump, pounce or vault).
- **Puddles:** cats hate water. Mochi slows to x0.75 for 1.2 s with a funny wet shake.
- **Big goofy dog chase** (stage 2). A huge happy dog bounds behind Mochi for about 20 s. It looms in camera and barks at near misses. It only catches Mochi on a hit, as a comic tumble that costs a heart.
- **Rolling chase** (stage 3). A giant yarn ball, or hay bale, rolls down a hill behind Mochi. It is wide, so the player must stay on the racing line ("CLOSE ONE!").

## Stages

Every campaign stage has 7 golden bells, checkpoints at every big set piece and a finish line followed by a 90 u run-out. Placement rules for the 7 bells:

- At least one bell is a "grab it in the air" bell.
- At least one sits on a set-piece route, such as the vault arc or the cloud ride.
- At least one sits off the racing line.

Timings below are at the stage's average speed.

### 1. Sunny Meadow Canyon (about 100 s, 18 to 23 u/s): the tutorial

Sandstone mesas, rolling green hills, bamboo and puffy clouds.

| Time | Beat |
|---|---|
| 0–8 s | Steer through a fish line on a gentle bend; tutorial prompt "A/D to steer". |
| 8–20 s | Logs: `SPACE - JUMP!`, two single logs, then an offset pair. |
| 20–30 s | Low branches: `S - SLIDE!`. |
| 30–38 s | Yarn ball (meter), then a bell above the path: "GRAB IT IN THE AIR!" |
| 38–48 s | First small chasm (jump), then a wooden rope bridge over a ravine. |
| 48–62 s | Downhill bend through mesas: rocks and two puddles (the wet shake). |
| 62–72 s | Tail vault tutorial: big chasm, `E - TAIL VAULT!`, with a bell at the top of the arc. |
| 72–88 s | Climb with mixed logs and branches; pounce tutorial over a wider gap. |
| 88–98 s | Second vault, then a bell. |
| 98–105 s | Home stretch to the meadow gate (finish). |

### 2. River Gorge (about 120 s, 20 to 26 u/s)

| Time | Beat |
|---|---|
| 0–15 s | Into the gorge: cliffs close in, logs and rocks. |
| 15–30 s | Claw wall-run up a steep cliff face (kind `wall`, steep rise), with sparks; a bell on the wall line. |
| 30–40 s | Cliff-top ridge with a branch and a fish line, then a drop down the far side. |
| 40–65 s | Leaf surf on the river (kind `river`, wider path): spray, rocks, fish lines, an air bell over a small rapid. |
| 65–85 s | Dog chase: a bridge crossing, then the dog bursts out of the bushes. Log hurdles, "CLOSE ONE!", and the music switches to the chase variant. |
| 85–100 s | Wall-run along a cliff (banked about 60°) to dodge the dog, then a vault across a side canyon. |
| 100–120 s | Footbridge finish. |

### 3. Sunset Hills (about 135 s, 21 to 28 u/s)

Warm sunset palette.

| Time | Beat |
|---|---|
| 0–15 s | Rolling hills with yarn and treats to fill the PUFF meter. |
| 15–35 s | Puff cloud ride over the big canyon (kind `cloud`). Steer and hop for 3 air bells and fish rings. |
| 35–55 s | Bamboo grove slalom with branches. |
| 55–75 s | Yarn-ball chase down a long hill (wide boulder, stay on line). |
| 75–95 s | Wall-run, vault, puddles. |
| 95–125 s | Final run with the cottage visible at the end of the valley; fish lines and the last bell. |
| 125 s+ | Finish at Grandma Cat's garden gate, then the ending cutscene. |

**Ending cutscene** (12 s or less, any key or tap skips it):

1. Mochi trots up the garden path at sunset.
2. Inside: a bowl of food on the table and Grandma Cat's portrait on the wall.
3. The 7 bells (as many as were collected) hang on the door.
4. "Home for dinner!" leads to the results screen.

### Endless (unlocked after stage 1)

Set-piece chunks are chained procedurally: log runs, branch runs, rock slaloms, gaps, short vaults, a river stretch, a chase stretch and fish lines. Speed ramps from 19 to 32 over 9 km. There are no bells and no stars. Out of hearts ends the run, and the best score and distance are saved. The theme follows the stage defs (meadow for now; world-art may cycle themes per km).

## Scoring and stars

All numbers live in `src/core/scoring.ts`.

- **Distance:** 1 point per u.
- **Pickups:** fish 50, treat 150 and bell 500 points, each times the multiplier.
- **Multiplier:** every fish or near miss adds +1, up to x99. A hit halves it.
- **Near miss** (a hazard passed within 0.5 u): 100 points times the multiplier, +1 multiplier, and "CLOSE ONE!".
- **Finish:** a bonus of 2000 + 500 per heart left.
- **Hearts:** 3. At 0 hearts Mochi respawns at the last checkpoint with full hearts and loses 10% of the score. Endless ends instead.
- **Stars per stage:** finishing earns one star, all 7 bells earn one star, and reaching the score target earns one star.
- **Score targets:** with the multiplier climbing +1 per fish, a clean run scores about 0.75 to 1.15 million. The targets sit at a strong run, roughly the top third (`GOOD_RUN` in `src/stages/validate.ts`: every bell, 9 of every 10 fish, one hit halfway, two hearts left): meadow 490,000, gorge 940,000, sunset 860,000. A clean run clears them; two hits and a sloppy fish line do not (`src/stages/*.ts`, checked by `src/stages/stages.test.ts`).

## Save (localStorage `meowrun.save`, version 1, `src/meta/save.ts`)

| Field | Contents |
|---|---|
| `stages[id]` | `{ stars: [b, b, b], best, bestBells, plays, finished }` |
| `endlessBest` | `{ score, distance }` |
| `unlockAll` | dev flag |
| `settings` | `{ master, music, sfx, quality: auto/low/high, reducedMotion, shake }` |
| `tutorialDone`, `endingSeen`, `totals` | progress flags and lifetime totals |

Unlocks:

- Stage 1 is always open.
- Stage 2 and Endless open after stage 1 is finished.
- Stage 3 opens after stage 2 is finished.

`migrate()` accepts anything and never throws.

## HUD (like the reference)

- **Top left:** a pause button, 3 hearts and 7 bell slots with "n/7".
- **Top centre:** a progress bar with checkpoint ticks, a runner knob and a home icon at the end.
- **Top right:** a big score with "xN" under it.
- **Bottom centre:** the ability meter (PUFF) with a key hint.
- **Under the bar:** contextual prompts (`SPACE - JUMP!`). On phones the hint shows "SWIPE UP" or "TAP" instead.
- **Centre:** comic callouts.
- **Under the hearts:** a small kitten portrait that reacts to events (nom, wow, ouch, happy, scared).

## Audio

All music and sound are procedural WebAudio.

- **Music:** one upbeat loop per stage (meadow, gorge, sunset, endless), a chase variant (dog or yarn ball) and a short cozy jingle at the cottage.
- **SFX:** jump, pounce, land, slide, fish, bell, yarn, hit, splash or puddle, wet shake, claws, tail boing, cloud puff, river surf, dog bark, yarn rumble, near-miss whoosh, checkpoint, finish fanfare and UI clicks.
- **Volumes:** master, music and sfx in the settings.

## Quality tiers

- **HIGH (desktop default):** shadows, pixel ratio up to 2, dense instanced foliage, 560 u view distance, water shader with foam, full particles.
- **LOW (phone default):** no shadows, pixel ratio 1, thinned foliage, 360 u view distance, cheaper water and half the particles.
- **Auto mode:** drops HIGH to LOW once if the frame rate stays under 45 fps for two 2 s windows. The settings offer Auto, Low and High.
- **Reduced motion:** no shake, no FOV kick, no speed FOV, softer speed lines.
