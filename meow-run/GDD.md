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

Set-piece blocks from the shared block library (`src/stages/blocks.ts`, 20 blocks) are chained with weighted picks: log runs, branch runs, rock slaloms, bends, hills, puddles, bridges, gaps, pounce gaps, short vaults, a river stretch, a chase stretch, an S-bend, fish lines and (from chunk 11, gorge and sunset only) the puff cloud. Speed ramps from 19 to 32 over 9 km. There are no bells and no stars. Out of hearts ends the run, and the best score and distance are saved. The theme follows the stage defs (meadow for now; world-art may cycle themes per km).

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

## Save (localStorage `meowrun.save`, version 2, `src/meta/save.ts`)

| Field | Contents |
|---|---|
| `stages[id]` | `{ stars: [b, b, b], best, bestBells, plays, finished }` |
| `endlessBest` | `{ score, distance }` |
| `unlockAll` | dev flag |
| `settings` | `{ master, music, sfx, quality: auto/low/high, reducedMotion, shake }` |
| `tutorialDone`, `endingSeen`, `totals` | progress flags and lifetime totals |
| `settings.capture`, `settings.clipVertical` | Replays AUTO/ON/OFF, vertical (9:16) clips |
| `player.name` | display name for cards and links (at most 14 characters, `sanitizeName`) |
| `wardrobe` | `{ look: 6-char code, seen: item keys }` |
| `daily` | `{ day: 'YYYY-MM-DD' (UTC), best, distance }` |
| `ugcStats` | `{ bestChain, tricks, clips, photos, shares, challengesWon, dailyPlays, trailsFinished }` |
| `trails.mine[]` | the player's trails: `{ code, name, best, finished }` |

Version 1 saves migrate to version 2 with nothing lost.

Unlocks:

- Stage 1 is always open.
- Stage 2 and Endless open after stage 1 is finished.
- Stage 3 opens after stage 2 is finished.
- The Daily Run opens with Endless. The Trail Maker is always open. Challenge and trail links ignore locks.

`migrate()` accepts anything and never throws.

## HUD (like the reference)

- **Top left:** a pause button, 3 hearts and 7 bell slots with "n/7".
- **Top centre:** a progress bar with checkpoint ticks, a runner knob and a home icon at the end.
- **Top right:** a big score with "xN" under it.
- **Bottom centre:** the ability meter (PUFF) with a key hint.
- **Under the bar:** contextual prompts (`SPACE - JUMP!`). On phones the hint shows "SWIPE UP" or "TAP" instead.
- **Centre:** comic callouts.
- **Under the hearts:** a small kitten portrait that reacts to events (nom, wow, ouch, happy, scared).
- **Under the score:** the combo meter ("COMBO 23", tier name, draining bar). Tier stamps pop at upper centre; trick popups appear by the meter.
- **Bottom left (challenges):** the race pill "vs Mia +34 m", green when ahead and rose when behind.
- Stages without bells (player trails) hide the bell row; endless and the Daily Run show the distance pill instead of the progress bar.

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

## Iteration 2: cooler runs and things players make (`ITERATION2.md`)

The menus carry the new entries in four hub rows: under PLAY on the title (WARDROBE, DAILY, TRAIL MAKER), under the stage map (DAILY RUN, TRAIL MAKER), on the pause card (PHOTO, SAVE CLIP) and on the results card (SHARE, SAVE CLIP, SHARE TRAIL, EDIT TRAIL). Each button shows only when it applies. The results and pause cards scroll on short screens.

### Style and scoring (`src/style/**`, `src/juice/**`)

- **Air tricks:** an ability press in the air (run or ride mode) spins Mochi: SPIN 250, DOUBLE 600, TRIPLE 1200. The pounce is a FLIP (200); an ability press within 0.35 s after a pounce is a CORKSCREW (700); a fast fall into a landing is a PAW-DIVE (300). A part-finished spin pays the last level completed; nothing finished is SLOPPY! (0 points, chain kept). A hit in the air breaks the chain.
- **Combo chain:** fish 1, yarn or treat 1, near miss 2, bell 3, trick 2 (double 3, triple 4), set-piece style 3 (a clean vault, wall run, cloud ride, river or chase, 400 points). The window is 3 s, refreshed by each event and held in the air. Tiers at 5, 10, 20, 35, 50 and 75: NICE!, PURRFECT!, CLAW-SOME!, FUR-OCIOUS!, NINE LIVES!, CAT-ASTROPHIC!, with multipliers 1, 1.25, 1.5, 2, 2.5 and 3. When the window runs out the chain banks `round(15 x n x tierMul)` raw points; a hit or a fall shows COMBO BROKEN and banks nothing.
- **Fair targets:** style points are raw (never times the score multiplier). A heavy synthetic run (double spin on every jump, chain 60) stays under 12% of each stage target (meadow 7.8%, gorge 5.5%, sunset 5.0%), so star targets are unchanged.
- **Rank:** style points per 100 u: S 1200, A 600, B 250, otherwise C (runs under 200 u count as 200 u). Shared cards and clips leave a C rank off.
- **Feel:** near-miss slow motion (0.35x for 0.28 s, 3.5 s cooldown, vignette, whoosh, music duck; never with reduced motion or in the tutorial), gold speed lines from tier 3, landing shockwaves with dust, shake and a 3-degree FOV kick, and a finish flourish (0.45x slow motion, three confetti waves, a camera swing to Mochi's face that releases before the run-out ends, then the rank stamp). A one-time "SPIN!" hint appears on a long jump.

### Share and challenges (`src/share/**`)

- **Share card:** a 1080x1350 PNG built when the results show: a scene snapshot, the stage, score, stars or distance, the look portrait, the player's name, the style row and "Can you beat me?", plus the `tokentails.com/meow-run` watermark.
- **Challenge link** `?c=`: deflate-raw plus base64url, at most 3000 characters. It carries the stage (or the endless or daily seed, or a trail code), score, name, look and a ghost (6 Hz samples, 3.5 bytes each; resampled down to fit). Opening it shows "Mia challenges you!" and races a translucent ghost kitten in Mia's look, with a name tag, the race pill and a results banner ("You beat Mia's 512,340!" or "Mia wins by 12,000 - rematch?"). The share sheet then sends your own ghost back. Only runs started from the beginning make links.
- **Name:** asked on the first share, skippable ("A Mochi fan"), at most 14 characters, sanitised, rendered only as text.

### Daily Run

A seeded endless course that is the same for everyone each UTC day (it resets at 00:00 UTC, 03:00 in Vilnius in summer). The seed is an FNV-1a hash of the date; the theme follows the seed. The best score and distance of the day are saved, and the result can be shared as a challenge. A plain endless run's link also replays its exact course as an "Endless challenge".

### Wardrobe (`src/wardrobe/**`, `src/cat/**`)

- **Slots:** 9 furs, 6 patterns, 5 eyes, 9 hats, 6 scarves and 6 trail effects, with at least two free items per slot.
- **Unlocks:** stars 3/6/9, bells 7/14/21, endless 2000 and 5000 m, combo 20 and 50, tricks 25 and 100, and the first clip, photo, share, Daily Run, finished trail and won challenge. Locked tiles show the rule and a progress bar and can be tried on; DONE saves only owned items. New items toast on the results or the title ("New in the Wardrobe: Flower crown!").
- **Screen:** a live 3D Mochi that slowly orbits, spins on drag, zooms and cycles six poses (sit, wave, loaf, stretch, leap, proud); RANDOM picks owned items only.
- **Where the look shows:** in game, the title mascot and the title runner, the cottage cutscene, the HUD, pause and results portraits, share cards, challenge ghosts, photos and clips.

### Trail Maker (`src/trails/**`)

- **Building:** a name, a theme (meadow, gorge, sunset), a pace (chill 18 to 24, zoomy 20 to 28, turbo 22 to 31 u/s) and 2 to 24 blocks from the block library (mirror and hard per block), with a live minimap, an estimated time and a validation badge. Every trail must pass the same layout validator as the campaign (gaps, vaults, clouds, walls, rivers and reaction spacing at top speed), be 400 to 6000 u long and take 25 to 240 s. RANDOM and SURPRISE ME always make a valid trail.
- **Playing and sharing:** TEST RUN plays it as the `trail` stage. A trail can be shared as `?t=<code>` (at most 120 characters) only after its maker has finished it once. Every link is validated again when it is opened; the overlay offers PLAY, OPEN IN MAKER and SAVE COPY. A trail run has no bells, stars or NEXT.

### Clips and photos (`src/clip/**`, `src/photo/**`)

- **Clips:** the game keeps a rolling replay of the last ~14 s (three 6 s MediaRecorder segments; MP4 where the browser supports it, else WebM; 30 fps / 2.5 Mbit on HIGH, 24 fps / 1.2 Mbit on LOW). SAVE CLIP on pause or results re-encodes the last 12 s in real time with a 16:9 or 9:16 crop, a stage tag, the watermark and a 1.2 s end card (portrait, name, score, stage or distance, rank, "Can you beat me?"), then SHARE (Web Share with the file) or DOWNLOAD. Replays AUTO/ON/OFF and Vertical clips sit in the settings. The clip shows the 3D scene only (the DOM HUD is not in it).
- **Photo mode** (from pause): an orbit camera with view presets, filters (warm, noir, dreamy, pixel), 12 stickers, frames (polaroid, comic, film, postcard, badge), six poses and a hide-UI button. The shutter saves a PNG of at least 1080 px on desktop (780 px on phones) with the watermark. Photo mode never resumes the run.

### Links on the site and the release checks

- **Where links point:** every challenge, trail and share link is `https://tokentails.com/meow-run?c=<code>` or `?t=<code>` when the game runs on tokentails.com (also from the raw build path `/meowrun-game/index.html`); in dev and previews it is the page itself (`src/ugc/sharekit.ts` `shareBase`, tested in `sharekit.test.ts`). The game reads only `location.search`, never the path, so the Next rewrite `/meow-run` -> `/meowrun-game/index.html` (which keeps the query string) is enough. A consumed `c` or `t` is dropped from the address bar with `history.replaceState`; other parameters (`from`) stay. A `?c=` wins over a `?t=` on the same link (the challenge loads its own trail).
- **No server:** links carry everything (course, score, name, look, ghost); there is no backend write and no per-link preview page, so a link preview shows the plain `/meow-run` page.
- **Checks before a release** (dev server on any port with `MEOW_URL`): `npm run smoke` (both viewports, campaign journey and every UGC entry), `node shots/bells.mjs`, `node shots/release-gate.mjs` (each feature from a real run across fresh browser contexts: v1 save migration, the look across a reload, photo PNG, a clip that ffprobe/ffmpeg decode with video and audio, a `?c=` link with card, ghost and result banner, a `?t=` link that round-trips and is finishable, the same Daily course in two contexts) `npm run build && npm run budget` (main JS ≤ 1,150 KB raw and ≤ 350 KB gzip, CSS ≤ 60 KB raw and ≤ 14 KB gzip; `tools/budget.mjs`), `npm run budget:draws` (starts its own vite on port 5191; draw calls per frame in every stage, a ghost race and a trail, capped at 385 on desktop HIGH and 265 on phone LOW; `shots/draw-budget.mjs`) and, after `npm run build:client`, `node shots/client-host.mjs` (serves `client/public` with the `/meow-run` rewrite on port 5190: the built index under `/meowrun-game/`, 10 s of play, `?c=` and `?t=` on the site route).
