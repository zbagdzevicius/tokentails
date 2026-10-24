# Meow Run: lanes and integration contract

The design is in `GDD.md`. Four lanes work in parallel in this folder, and each lane edits only the files it owns. The core in `src/core/` is frozen: the code there is the source of truth, and this file summarises it.

## Ownership map

```
package.json, package-lock.json, tsconfig.json, vite.config.ts, .gitignore, GDD.md, LANES.md   ARCHITECT (frozen)
src/main.ts                 FROZEN  bootstrap + window.__meow test hook
src/core/**                 FROZEN  types, track, path, engine, loop, input, player, camera, collision, score,
                                    scoring, session, state, hud (data model), events, registry, rng, place, fx, *.test.ts
src/audio/synth.ts          FROZEN  AudioContext, buses (out/sfx/music), noise(), env(), tone(), setVolumes(), onAudioInit()

src/world/**                WORLD-ART   themes (meadow, gorge, sunset), terrain, foliage, sky, water, cottage exterior
src/setpieces/**            SETPIECES   every set-piece type (obstacles, pickups, vault, cloud, chases ...)
src/stages/**               SETPIECES   the 3 stage scripts + the endless chunk generator
src/cat/**                  CAT-AUDIO   kitten rig + actors (dog, cloud, leaf, grandma ...)
src/audio/** (not synth.ts) CAT-AUDIO   music + sfx
src/juice/**                CAT-AUDIO   speed lines, landing dust, claw sparks, wet shake drips, spray helpers
index.html                  META-UI     markup + CSS (HUD, menus)
src/ui/**                   META-UI     flow (title, stage select, pause, settings, results), HUD view, cutscene, tutorial, touch hints
src/meta/**                 META-UI     save.ts (schema, migrate), dev.ts (window.__meow.dev)
shots/smoke.mjs             META-UI     the end-to-end smoke (keep every existing check; update selectors if the flow changes)
shots/<lane>-*.mjs          each lane   your own Playwright scripts + screenshots
```

Each lane has one entry point that `main.ts` calls once:

| Lane | Entry point |
|---|---|
| WORLD-ART | `registerWorld()` in `src/world/index.ts` |
| SETPIECES | `registerSetPieces()` in `src/setpieces/index.ts` and `registerStages()` in `src/stages/index.ts` |
| CAT-AUDIO | `registerCatAudio()` in `src/cat/index.ts` (also wires up audio and juice) |
| META-UI | `registerMetaUi()` in `src/ui/index.ts`; it must call `session.prepareStage(...)` before it returns |

Everything in those folders today is a **placeholder** written by the architect. Replace it freely, but keep the exported entry names.

Nobody edits a frozen file. If you need something a frozen file does not offer, build it in your own files. If that is impossible, write `// CONTRACT-REQUEST: ...` in your own file and mention it in your final report.

## Rules for every lane

- Work only inside `meow-run/`.
  - Never git commit, push, stash, clean or checkout.
  - Never read `.env*` files.
  - No feature flags.
  - Do not `npm install` (all dependencies are present).
- Everything is procedural: no image, model or audio files. Canvas textures, shaders and WebAudio are fine.
- Keep `npx tsc --noEmit` clean for your own files.
  - Another lane's errors may show up while that lane works; ignore them.
  - At the end, `npm run build` must pass.
- Tests are vitest, colocated as `*.test.ts` in your folders. Run them with `npx vitest run src/<folder>`.
  - Only pure modules can be imported in node. `three` math is fine. Anything that touches `engine.ts`, `document` or `window` is not.
  - So keep your logic (layouts, scoring, schedules, music sequencing) in pure files.
- **Hot loops:** no per-frame allocations. That means no `new Vector3`, no closures, arrays or spreads in `update`/frame code. Use module-level temps.
  - Pool or instance meshes. Share geometries and materials and mark shared geometry `geometry.userData.shared = true` (see Disposal).
- **Phones:** respect `getQuality()` (`'low' | 'high'`, from `core/engine.ts`) and the `qualityChange` event.
  - On LOW use fewer instances and cheaper shaders, cast no shadows, and keep the view to 360 u.
- **Dev server:** http://127.0.0.1:5178/ (strictPort; 5177 is ultra-cat). It is already running with HMR, so don't stop it. If it is down, start `npx vite` in the background.
- **Playwright:** copy `shots/smoke.mjs`.
  - Chromium args: `--use-gl=angle --enable-unsafe-swiftshader`, or set `MEOW_GPU=1` for `--use-angle=metal`.
  - Name your scripts and screenshots `shots/<lane>-*` and look at the screenshots with the Read tool.
  - A run must have 0 page errors and 0 console errors. Unknown set-piece types only `console.warn`.
- Before you report done, run `npm run smoke`. It runs the desktop pass at 1280x720 and the phone pass at 390x844.

## Coordinates and units

| Term | Meaning |
|---|---|
| `s` | Distance along the track centre line (u, about 1 m), exact arc length. |
| `x` | Lateral offset; `+x` = the runner's right. |
| `y` | Height above the track surface (along the frame's `up`). |
| `bank` | Degrees in authoring, radians in frames. `+` lowers the right side. |
| World | three.js, y up. A track with heading 0 runs along +z, so the runner's right is world -x. |
| Rig local axes | `+z` forward, `+y` up, `+x` = the runner's left. `placeOnTrack` and core's kitten placement use this basis. |

## Frozen core API (summary)

### Boot (`src/main.ts`)

1. `registerWorld()`, `registerSetPieces()`, `registerStages()` and `registerCatAudio()` fill the registries.
2. `initInput(actionHandler)` binds the keys and touch gestures. Actions only reach the player while `game.mode === 'play'`. Esc and P only pause, and only from play.
3. `registerMetaUi()` sets up the menus and must prepare a stage for the title attract.
4. `startLoop()`.

### Registries (`core/registry.ts`)

| Registry | Holds |
|---|---|
| `stages` | `StageDef` by `StageId`: `meadow`, `gorge`, `sunset`, `endless` |
| `themes` | `ThemeDef` by `ThemeId`: `meadow`, `gorge`, `sunset` |
| `setPieceTypes` | `SetPieceType` by string id |
| `actors` | `ActorDef` by string id |

- Every registry has `add`, `get`, `has` and `all`. `add` replaces an existing entry, so a lane may swap a placeholder for the real thing. `stageList()` returns the stages sorted by `index`.
- `registerKitten(build)` registers the player model, and `kittenFactory()` returns the builder. Meta-ui may use it for the cutscene.

### Track (`core/track.ts`, `core/path.ts`; pure)

`Track` is a polyline sampled every 1 u.

- **Queries** (all allocation-free; pass a frame from `newFrame()`):
  - `sample(s, frame)` returns `{ s, pos, fwd, right, up, width, bank, kind }`.
  - `toWorld(s, x, y, out)`
  - `kindAt(s)`, `widthAt(s)` and `length`.
  - `segments`, `segmentAt(s)` and `nextSegment(s, kind)`.
- **Building:** `Track.fromPoints(controlPoints)` resamples Catmull-Rom control points.
- **Authoring:** `PathBuilder` is how stages author.
  - `b.run(len, { turn, rise, ease, width, bank, kind })` returns `{ s0, s1 }`.
  - `turn` is the total heading change in degrees (+ = right) at constant curvature.
  - `rise`, `width` and `bank` ease in and out.
  - `kind` is one of `ground`, `bridge`, `wall`, `river`, `cloud` or `gap`.
  - Shorthands: `b.straight(len, kind)`, `b.gap(len)`, and `b.s` for the current end.
- `NO_FLOOR` = `gap` and `cloud`. Without an arc or ride, the player falls there. A fall costs a heart and puts the player 1.5 u past the segment.
- `core/place.ts` provides:
  - `placeOnTrack(obj, track, s, x, y, upright?)`: oriented to the frame, or yaw-only if `upright`.
  - `trackPoint(track, s, x, y, out)`.

### Stages (`StageDef` in `core/types.ts`)

| Field | Meaning |
|---|---|
| `id`, `index`, `name`, `blurb` | identity and menu text |
| `theme`, `music` | theme id and music track id |
| `speed` | `{ start, max, rampDist }`: a linear ramp over s |
| `scoreTarget` | the third star |
| `bells` | 7 in the campaign, 0 in endless |
| `ending` | play the cottage cutscene after the finish |
| `tutorial` | stage 1: meta-ui shows the tutorial prompts |
| `start` | `StartPose` |

- **Campaign:** `build(b, rng)` authors the whole path with the builder and returns `PieceSpec[]`.
  - The finish line is `b.s` when `build` returns. Core then adds a 90 u run-out.
- **Endless:** `chunk(b, rng, index)` appends one chunk and returns its pieces. Core calls it whenever less than 700 u of track lie ahead.
  - Every chunk must add path.

### Set pieces (`SetPieceType`)

Each set piece is `{ id, checkpoint?, create(ctx): PieceInstance }`. A `PieceSpec` is `{ type, s, len?, x?, y?, checkpoint?, params? }`.

- **Spawning:**
  - Instances spawn when `spec.s < P.s + 300` and despawn when `inst.end < P.s - 40`.
  - A checkpoint goes 12 u before every piece whose type has `checkpoint: true`. `spec.checkpoint` overrides the type.
- **What `ctx` gives you:** `{ stage, track, spec, group, quality, addCollider, removeCollider }`.
  - Put meshes in `ctx.group`. Core adds it to the scene, and removes it and disposes non-shared geometry on despawn.
  - Colliders added through `ctx` are removed automatically.
- **The instance** is `{ end, update?(dt, t), onRespawn?(s), dispose? }`.
  - `update` runs on the 120 Hz fixed step, before collision.
  - For visual-only animation you may `addFrameHook` from `core/loop.ts`, as long as you unsubscribe in `dispose`.
- **Respawn** (0 hearts, campaign): every live piece is disposed and the pieces from the checkpoint on are recreated, so keep piece state in the instance.
  - Bells check `G.bells[index]` and do not reappear once collected.
  - A piece may call `hurt()`. A respawn triggered by it happens at the end of that step, never inside your update.
- **Context ability (E / tap):** `onAbility(fn)` from `core/player.ts` registers a handler. Return `true` to consume the press.
  - It returns an unsubscribe; call it in `dispose`.
  - Handlers run newest first.
  - Show the prompt yourself with `prompt('ability', 'TAIL VAULT!', 0.2)` every step while the window is open.
- **Ability ids by convention:**
  - `vault` uses `beginArc`.
  - `cloud` uses `beginRide` over a `cloud` segment.
  - Leaf surf is automatic on `river` (`P.surface === 'river'`).
  - The claw wall-run is automatic on `wall`.
  - Set pieces must never soft-lock. A missed vault falls (heart, placed past the gap), and the cloud auto-summons at the edge.

### Collision (`core/collision.ts`)

Colliders live in track space: `addCollider({ shape: 'box' | 'sphere', s, x, y, hs, hx, h, r, kind: 'hurt' | 'trigger', label, once, near, onTouch })`.

- **Shapes:**
  - A box spans `y..y+h` with half extents `hs` (along s) and `hx` (lateral).
  - A sphere uses `y` as its centre and `r` as its radius.
- **The player** is a vertical capsule: radius 0.4, height 1.1, or 0.5 while sliding.
- **Kinds:**
  - `hurt` costs a heart once per collider, unless the player is invulnerable.
  - `trigger` calls `onTouch` once per entry. `once` defaults to true for triggers.
- **Near miss:** a `hurt` collider passed within 0.5 u emits `nearMiss`, scores, and shows "CLOSE ONE!".
  - Chasers set `near: false` and call `nearMiss(label)` from `core/score.ts` themselves.
- **Moving colliders:** mutate `c.s`, `c.x` and `c.y` in `update` (chasers, the rolling yarn ball). Only colliders within ±12 u of the player are tested.

### Player (`core/player.ts`)

- **State:** `P` is the full state, and lanes read it as `PlayerView`.
  - Fields: `s, x, y, vy, speed, mode, surface, grounded, sliding, sinceLand, sinceJump, sincePounce, sinceHit, landImpact, airTime, lean, invuln, wet, ability, abilityT`.
  - `P.world.{pos, fwd, up, right}` is updated every frame.
- **Modes:** `P.mode` is `run`, `arc` (vault), `ride` (cloud) or `finish`.
- **Set-piece API:**

| Function | What it does |
|---|---|
| `beginArc(len, height, id)` | parabola from here; collisions stay on |
| `beginRide(id, untilS, height)` | ride at a height; jumps hop on top |
| `endAbility()` | end an arc or ride now |
| `boost(mul, seconds)` | speed multiplier; emits `boost` |
| `soak(seconds, slow)` | puddle: slowed and wet |
| `hurt(label)` | lose a heart |
| `teleport(s, x)` | move the player there |
| `onAbility(fn)` | register a context action (see Set pieces) |

- **Tuning:** `TUNING` holds the feel numbers. It is frozen; a CONTRACT-REQUEST is needed to change it.
- **Core's own work:**
  - Places the kitten rig every frame at `P.world` (local +z forward) and flashes `root.visible` while invulnerable.
  - Without a registered kitten it draws a capsule.

### Scoring (`core/score.ts`, rules in `core/scoring.ts`)

| Function | Effect |
|---|---|
| `collectFish(at)` | 50 points x mult, then mult +1 |
| `collectBell(index, at)` | 500 points x mult; ignored if already collected |
| `collectPickup(kind, at, points, meter, calloutText?)` | yarn, treats, food |
| `addPoints(base, raw?)` | add points, x mult unless `raw` |
| `addMeter(a)` | fill the meter (`G.meter` is 0..1) |
| `spendMeter(a)` | returns false if the meter is short |
| `nearMiss(label)` | near-miss points, mult +1, "CLOSE ONE!" |

Distance points, the finish bonus, the respawn penalty and stars are handled by core.

### State (`core/state.ts`)

- **`game`:** `{ mode: 'title' | 'play' | 'paused' | 'finish' | 'over', stage, track }`.
- **`G`:**
  - Score and progress: `score, mult, maxMult, hearts, bells[7], fish, meter, time, distance, hits, respawns`.
  - Checkpoints and position: `checkpoints[], cpIndex, finishS, progress`.
  - Run flags: `endless, invincible, seed`.
- **`prefs`:** `{ reducedMotion, shake }`. Meta-ui writes it from the save, and the camera and juice read it.

### Session (`core/session.ts`)

- **Calls:**
  - `prepareStage(id)`: builds the track and theme for the title attract.
  - `startStage(id, { at })`: `at` is 0..1 and starts at the checkpoint at or before that point.
  - `retry()`, `pause()`, `resume()`, `quit()`.
- **Flow:**
  1. Crossing the finish switches the mode to `finish`, adds the finish bonus and emits `finishLine`.
  2. After a 2.2 s run-out the mode becomes `over` and `stageEnd { result: RunResult }` fires. Endless at 0 hearts goes straight to `over`.
- **Scenery streaming:**
  - Chunks are `CHUNK_LEN` = 80 u, built from 40 u behind to `VIEW_AHEAD` (high 560, low 360) ahead.
  - At most one chunk is built per frame while playing.
- `rebuildScenery()` runs on `qualityChange` (theme `exit` then `enter`, chunks rebuilt).

### Themes (`ThemeDef`)

- **`enter(ctx)`** sets the sky, fog, lights (`ctx.sun`, `ctx.hemi`, `sunDir` from `engine.ts`) and global meshes. It must be undone by `exit(ctx)`.
- **`buildChunk(ctx, s0, s1)`** returns an `Object3D` for that stretch.
  - Keep it under about 4 ms on desktop.
  - Share geometries and materials across chunks.
- **`disposeChunk(obj)`** is optional.
- **`update(dt, t, ctx)`** runs every frame for water, clouds and so on.
- **What the theme draws:**
  - The path ribbon for every kind: dirt for ground, planks for bridges, rock faces for walls, water for rivers.
  - Chasm walls under `gap` and the canyon under `cloud`.
  - Cliffs along the sides.
- **The cottage exterior** goes near `G.finishS` on stages with `ending`. Import `G` from `core/state.ts`.

### Actors and the kitten (cat-audio)

- **`KittenRig`:** `{ root, animate(dt, t, p: PlayerView), dispose? }`.
  - `animate` drives every pose from `PlayerView`: run cycle, jump, pounce, slide, the stretching tail pole (`ability === 'vault'`, `abilityT`), claws on `surface === 'wall'`, the leaf board on `river`, sitting on the puff cloud when `ability === 'cloud'`, hit and wet shake.
  - The kitten draws the puff cloud and the leaf as attachments. Set pieces don't draw them.
- **`ActorDef`:** `{ id, build(): ActorRig }`, and `ActorRig` is `{ root, animate(dt, t, { speed, action }), dispose? }`.
  - Ids: `dog` (actions run, bark, leap, tumble), `cloud`, `leaf`, `grandma` (sit, wave, for the cutscene).
  - Set pieces build actors, place them and call `animate`.

### HUD data (`core/hud.ts`)

- **API:**
  - `prompt(action, text, seconds)` and `clearPrompt()`. The HUD view picks the key label (keyboard or touch).
  - `callout(text, tone)` and `react(mood)` emit events.
- **`hud` object:** `{ prompt, meterLabel, ticks, now }`.
- **Rendering:** meta-ui's view reads `hud`, `G` and `P` every frame through `addFrameHook`.

### Input (`core/input.ts`)

- **Keys:** `keys` is a Set of `e.code`.
- **`input`:** `{ touchSteer, dodgeT, dodgeDir, botSteer, lastGesture }`. `botSteer` (-1..1 or null) overrides steering for bots.
- **Other calls:** `press(action)` sends a synthetic action, and `steerAxis()` reads the combined steer.
- **Touch:** gestures listen on `window` and ignore targets inside `button, a, input, select, label, .ui`. Menus must carry `.ui` or be buttons, and overlays (speed lines, the HUD) need `pointer-events: none`.

### Loop (`core/loop.ts`)

- The simulation runs fixed 120 Hz steps while the mode is `play` or `finish`. Order per step: input, player, session (piece updates), collision, step hooks.
- Every frame, in order:
  1. Scenery streaming and the theme `update`.
  2. Kitten placement.
  3. Camera.
  4. Particles.
  5. Frame hooks.
  6. Render.
- `addStepHook(fn)` and `addFrameHook(fn)` both return an unsubscribe. Frame hooks get `dt = 0` while paused.

### Camera (`core/camera.ts`)

- The camera rides the track 7.2 u behind the player and 3.1 u up, looks 13 u ahead and lags smoothly.
- It leans half the bank and has a speed FOV, `fovKick(deg)` and `shake(amount)`. All of these respect `prefs.reducedMotion`.
- `setCameraOverride(fn | null)` lets a cutscene take over.
- The sun follows the player.

### FX (`core/fx.ts`)

- `spawnParticle(...)` and `burst(pos, n, color, speed, life, size, gravity, upBias)` share one pooled `THREE.Points` draw call.
- LOW quality drops half the spawns.

### Events (`core/events.ts`; `events.on(name, fn)` returns an unsubscribe)

| Group | Events |
|---|---|
| Session | `stageLoad`, `stageStart`, `finishLine`, `stageEnd`, `quit`, `pause`, `resume`, `checkpoint`, `lifeLost`, `respawn` |
| Player | `action`, `jump`, `pounce`, `land`, `slide`, `fastFall`, `surface`, `abilityPress`, `abilityStart`, `abilityEnd`, `hit`, `fall`, `boost`, `wet` |
| Scoring | `pickup`, `bell`, `mult`, `nearMiss`, `meter` |
| Set pieces emit | `chase { on, kind: 'dog' \| 'yarn' }`, `setPiece { id, phase }` |
| HUD | `callout`, `react` |
| Engine | `qualityChange`, `bigHit` |

Meta-ui emits `setPiece { id: 'ending', phase: 'start' | 'end' }` around the cutscene, which is the audio lane's jingle cue.

### Test hook (`window.__meow`)

`mode`, `game`, `G`, `P`, `hud`, `prefs`, `TUNING`, `CAM`, `clock`, `session` (including `sessionInfo`), `events`, `stages`, `themes`, `setPieceTypes`, `actors`, `colliders()`, `camera`, `setCameraOverride`, `press`, `input`, `keys`, `quality { get, mode, set }`, `dev`.

`dev` (META-UI keeps these working):

| Shortcut | Effect |
|---|---|
| `dev.unlockAll()` | unlock every stage (saved) |
| `dev.jump(stageId, t)` | start a stage at 0..1 progress |
| `dev.invincible(on)` | toggle invincibility |
| `dev.reset()` | wipe the save and return to the title |
| `dev.save()` | return the stored save |

## What each lane delivers

### WORLD-ART (`src/world/**`)

1. **Themes.** `meadow`, `gorge` and `sunset`; endless uses `meadow`, or world-art may vary it by s inside the theme.
2. **Path ribbon.**
   - A dirt shader with tyre-less footpath texture, edge grass tufts and soft verges.
   - Plank bridges with rope rails over gaps.
   - Rock-face material on `wall`.
   - A river water shader with foam and edges, plus spray emitters through `core/fx.ts`.
   - Nothing under `gap` or `cloud` except chasm or canyon walls.
3. **Landscape.**
   - Sandstone cliffs and mesas framing the path.
   - Rolling hills.
   - Instanced grass, bushes, trees, bamboo and rocks.
   - A sky gradient dome with puffy clouds and far blue haze or mountains.
   - Fog tuned to `VIEW_AHEAD`.
4. **Sunset and cottage.** The sunset palette for stage 3, and Grandma's cottage exterior with a garden gate at the finish of `sunset`.
5. **Quality tiers.** LOW and HIGH density and shader tiers.
6. **Constraints.** Scenery must never sit inside the path corridor (`|x| < width / 2 + 1.5`) or the camera corridor above it. The camera rides the track.

### SETPIECES (`src/setpieces/**`, `src/stages/**`)

1. **Obstacles and pickups.** Logs, rocks, low branches, gap edges and bridges (with world-art: bridge planks come from the theme on `bridge` segments), puddles, fish lines, bells (including air bells), yarn and treats.
2. **Big set pieces.**
   - Tail vault.
   - Wall-run entries and exits with a prompt and claw cue (`setPiece` events).
   - Puff cloud (meter-based speed, auto-summon).
   - Leaf surf river stretches with rocks and spray hooks.
   - Dog chase (actor `dog`, `chase` events, near-miss callouts).
   - Rolling yarn-ball chase.
3. **The 3 stage scripts.** Follow the GDD beat sheets, run 90–150 s, place 7 bells by the bell rules, and add tutorial hints in stage 1.
4. **The endless chunk generator.** Chain set-piece chunks and ramp the difficulty by index.
5. **Tests.** Vitest checks the layouts (bells, spacing, reaction time at max speed, no impossible combos), and the stage-length test is tightened to 90–150 s.

### CAT-AUDIO (`src/cat/**`, `src/audio/**` except `synth.ts`, `src/juice/**`)

1. **Mochi.** An orange-and-white kitten built from primitives (copy the pattern from `ultra-cat/src/cats/model.ts`). Animations:
   - run cycle, jump, pounce, slide, land squash and stretch
   - vault with the stretching tail pole
   - wall-run claws with sparks
   - sitting on the cloud, balancing on the leaf
   - hit, wet shake, and a victory pose (`P.mode === 'finish'`)
2. **Actors.** `dog`, `cloud`, `leaf` and `grandma` rigs.
3. **Music.** Procedural music for each stage's `music` id plus the chase variant (`chase` events), ducking on `bigHit`, pause behaviour and the finish fanfare.
4. **SFX.** Every sound listed in the GDD, driven by events.
5. **Juice.**
   - Speed lines at the screen edges scaled by speed and `boost`.
   - Landing dust, claw sparks, wet drips, pickup sparkles, the pounce trail and river spray helpers.
   - Everything respects `prefs.reducedMotion` and LOW quality.

### META-UI (`index.html`, `src/ui/**`, `src/meta/**`, `shots/smoke.mjs`)

1. **Screens.**
   - Title screen over the attract scenery.
   - Stage select map with stars, locks and the endless best.
   - Results with a star reveal, new best, retry, next and stages.
   - Pause and settings: volumes, quality (auto, low, high) and reduced motion. Apply them through `setVolumes`, `setQualityMode` and `prefs`.
2. **Ending cutscene.** A short scene at Grandma's cottage (`setCameraOverride`, `kittenFactory()`, actor `grandma`, a portrait canvas texture, the 7 bells on the door). It can be skipped, lasts 12 s or less, and emits `setPiece` ending events.
3. **Tutorial.** Prompts for stage 1, shown when `stage.tutorial` is set and `!save.tutorialDone`: steer, jump, slide, pounce, vault.
4. **Touch.** Phone layout and touch hints for portrait and landscape at 390x844, with safe areas.
5. **HUD visuals.** The full reference HUD look, with the kitten portrait reactions and comic callouts.
6. **Save.** Versioned, with defensive `migrate`; keep `dev.*` working.

## Testing

| Check | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Unit tests | `npx vitest run` (track math, scoring, save, stages are covered by the architect) |
| Build | `npm run build` |
| Smoke | `npm run smoke` (dev server running): the desktop pass at 1280x720, then the phone pass at 390x844. Each pass runs the fast path, then the full journey (about 8 min each) |
| Fast smoke | `npm run smoke:fast` (dev shortcuts, invincibility allowed; about 1.5 min per pass) |
| Journey | `npm run smoke:journey`: the whole campaign, reload, endless, played by `shots/bot.mjs` through real input only |
| UGC smoke | `npm run smoke:ugc` (both viewports): every iteration 2 entry with real clicks (`shots/ugc-smoke.mjs`); `npm run smoke` runs it as its third step |

### Integration notes

- `shots/bot.mjs` is the shared playtest bot. It reads `window.__meow` to decide, but acts only through real input: Playwright keyboard events on desktop (A/D held, Space, S, E) and CDP touch events on phones (finger drag, swipes, taps). It measures its own input latency and opens its timing windows early by that much.
- While several people edit, a dev-server HMR reload resets the page to the title and kills a running smoke. For a reliable run, build a snapshot and serve it: `npx vite build --outDir /tmp/meow-dist && npx vite preview --outDir /tmp/meow-dist --port 4188 --strictPort`, then `MEOW_URL=http://127.0.0.1:4188/ npm run smoke`.
- On macOS the smoke uses the Metal GPU by default (`MEOW_SWIFT=1` forces SwiftShader, which is too slow for the journey).

The smoke runs:

1. A fresh save, then the title screen.
2. The stage select (3 locked).
3. Sunny Meadow with keyboard or swipe input, then 20 s with a bot.
4. Pause and resume.
5. `dev.jump` near the finish, then results and the save.
6. `dev.unlockAll`.
7. `dev.jump` into gorge, sunset and endless.
8. `dev.reset`.

It must print `SMOKE OK` with `ERRORS 0`.

The bot in the smoke reads `colliders()` and `hud.prompt`:

- Low hurt colliders get a jump, and high ones (`y > 0.5`) get a slide.
- An `ability` prompt gets an ability press.
- Keep that convention: hazards that must be slid under start above 0.5, and anything needing E shows an `ability` prompt.

## Iteration 2 (UGC): ownership and contract summary

The full plan, lane briefs and acceptance checks are in `ITERATION2.md`. This is the summary that stays true after integration.

```
INTEGRATOR  src/main.ts, src/core/**, src/ugc/**, src/meta/**, index.html, src/ui/* (except portrait.ts),
            src/audio/**, src/world/**, shots/smoke.mjs, shots/bot.mjs, shots/ugc-smoke.mjs, docs, package.json
CLIP        src/clip/**          rolling MediaRecorder replay, clip re-encode + sheet, Replays settings rows
PHOTO       src/photo/**         photo mode: orbit camera, filters, stickers, frames, poses, PNG export
SHARE       src/share/**         share card, ?c= challenge links, ghost record/playback, the Daily Run stage
WARDROBE    src/wardrobe/**, src/cat/**, src/ui/portrait.ts   looks, unlocks, the Wardrobe screen, Mochi rig
STYLE       src/style/**, src/juice/**                        tricks, combo chain, slow motion, finish flourish
TRAILS      src/trails/**, src/stages/**, src/setpieces/**    block library, Trail Maker, ?t= trail links
```

- **Entry:** `registerUgc()` (`src/ugc/index.ts`, called from `registerMetaUi()` after `prepareStage('meadow')`) starts the lanes in this order: wardrobe, style, trails, share, clip, photo. A lane that throws is logged and the others still start.
- **Cross-lane calls** go only through the `ugc` service object (`src/ugc/contract.ts`): `currentLook`, `buildKitten`, `drawLook` (WARDROBE; `drawLook(ctx, look, x, y, size)` draws into the square whose top-left is `x, y`), `playerName`, `askName`, `challengeUrl`, `activeChallenge` (SHARE), `loadTrail`, `currentTrailCode` (TRAILS), `styleSummary` (STYLE), `clipReady`, `openClip` (CLIP), `openPhoto` (PHOTO). Every service has a safe default. The only shared import between lanes is the pure look codec `src/wardrobe/look.ts`.
- **UI:** `src/ugc/hub.ts` provides `addButton` (slots `title`, `select`, `pause`, `results`; ids and order in `ITERATION2.md` 4), `addScreen` (`wardrobe`, `photo`, `trails`), `openOverlay`, `toast`, `onScreen` and `refreshHub`. Lanes never edit `index.html` or `flow.ts`.
- **Save:** version 2. Each lane writes only its own fields through `setSave` (table in `ITERATION2.md` 4.5).
- **Stages:** `daily` (index 90, SHARE) and `trail` (index 91, TRAILS) are registered by the lanes, are not on the map and start with `play(id)`. The endless generator is deterministic: the same rng sequence and index order give the same chunks, and index 0 resets its state.
- **Time scale:** only STYLE calls `setTimeScale`; it resets on pause, stageEnd, quit and respawn.
- **Camera override:** one owner at a time: PHOTO (photo screen), STYLE (finish run-out only, released before 2.2 s), WARDROBE (wardrobe screen), the cutscene (after stageEnd).
- **HUD:** `body.nobells` hides the bell row on stages with `bells === 0` (trails); `body.endless` covers endless and the Daily Run.
- **Links:** `?c=` (SHARE) wins over `?t=` (TRAILS); both are cleared after reading, ignore stage locks and treat names as untrusted text.
- **Test hooks:** `window.__meowUgc.{clip, photo, share, wardrobe, style, trails}` next to the frozen `window.__meow`.
