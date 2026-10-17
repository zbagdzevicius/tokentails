# W1-RENDER-ACTORS: handover

Status: `npx tsc --noEmit` clean, `npx vitest run` 39 files / 765 tests green (Oct 16). The dev page runs on the
shared 5174 server; screenshots are in `bad-cat/test-results/w1-actors/` (Playwright, swiftshader).

## What is built

| Area | Where | Notes |
|---|---|---|
| World seam | `Renderer.ts` | `createWorldDynamics(play, mat)` on load, `dyn.update(s, alpha, events)` every frame (clip pass included), disposed on reload/dispose. The clip camera keeps `dyn.roombaPosition` in frame for framed crimes (`prop.framed`) and `plan.format === 'roomba'`. |
| 7 coat patterns | `actors/patterns.ts`, `cat-material.ts` | Object-space masks (sec/ter weights). The GLSL mirrors the CPU `patternMask` that the tests check. Instanced variant for spectators. |
| One skinned cat | `cat-rig.ts`, `actors/skin.ts`, `cat-outline.ts` | The rigid parts merge into one rigidly skinned mesh (GDD 11.2). A cat costs 3 draw calls (fur, outline, face); a ghost costs 2. The outline is skinned and instanced through three's chunks. New poses: `sit`, `hug` (in the arms) and `lid` ('half' is the smug slow blink). |
| Cosmetics | `actors/cosmetics.ts` | All 7 collars and 7 hats from `COSMETICS` are built into the head part (no extra calls). Unknown ids are ignored. Trails 1–3 (tinsel, paw prints, glitter) go through `setTrail(id)` (`actors/fx.ts`, one instanced pool) and are off with reduceMotion. |
| Personas | `actors/personas.ts`, `human-rig.ts` | All 8 personas: outfit, hair, headwear, glasses, apron/cardigan/hoodie/pyjamas/bow tie, the prop in hand (`holding`), and a BUSY motion each. Postures: stand, sit (sofa / desk chair, turns with torso and head), lie (the Napper on the bed, breathing, Zzz that grow and redden with `s.noise`). The wake TELEGRAPH is a sit-up yawn. Grandma's double-take is 1.5× slower. One skinned mesh per human (1 call). |
| Double-take | `human-rig.ts` | Keeps the 0.8 s `doubleTake`, and adds eyes popping, an "O" mouth and a hop on the snap. |
| Scoop cuddle | `human-rig.ts` (`scoopPhase`, `SCOOP`), `Renderer.cuddle` | The nearest human walks up (at most 1.7 m), leans in, lifts the cat in an arc and hugs it. The bubble says "BAD KITTY… come here", then shows a heart, with heart bursts. The cat's eyes are open ("uh-oh") until the lift, then closed and content. The other boss human claps. |
| Second human | `Renderer.ts` | Loaded when `play.routine2` is set, at `humanSpot2`. Each human has its own bubble, LOOK ring and edge arrow. The shared suspicion ring sits over the human who is turning or looking. Both cones are drawn as one union (`VisionCone`). |
| Mirror and webcam | `actors/extra-cones.ts`, `vision-cone.ts` | The mirror cone is silvery with a glint and shows only while BUSY. The webcam is a blue wedge with scanlines and a blinking REC sprite. Cells come from the sim's `mirrorConeCells` / `webcamCells` (present now), with the render-only `coneFrom` as fallback. |
| projectWorld / edge arrow | `actors/screen.ts`, `Renderer.updateEdgeArrows` | `projectWorld(x, z, level)`, plus `projectHuman(i)` (not in types). When a human's head is off screen, an arrow sprite sits on the screen border and points at it (seen in boss rooms at 9:16). |
| Accomplice | `actors/accomplice.ts` | `setAccomplice`: a lounging Pink Paw cat with a wish bubble showing the prop's emoji icon. On the grant frame the bubble turns into a heart, hearts burst and the cat sits up with a smug blink. A ribbon shows ACCOMPLICE, GUEST STAR or FOUND A HOME (alumni). |
| Cameos | `actors/cameos.ts`, `actors/face-atlas.ts` | `setCameos(bundle, faces)` fills `ShellDef.spectatorSlots` with instanced sitting cats (2 calls for up to 15), decoded with `decodeCat` (a fallback coat if the code is bad). Faces come from the `faces` map (keyed by `CameoEntry.id`) or the default face, through one 512² atlas. The fridge wall is up to 40 magnets in one instanced disc mesh: a face when approved, otherwise a coat-colour dot. Spectators hop on crashes. `spectatorAt(clientX, clientY)` returns the `CameoEntry` under the pointer (spectator or magnet). |
| Editor | `actors/editor-overlay.ts`, `actors/screen.ts` | `pickCell` marches a ray over the heightmap (pure and tested). `setEditorOverlay` draws grid lines, the hover cell, red bad cells, gold target rings and the spawn paw in 2 calls. |
| Streamer layout | `camera.ts` `streamerPose` | `setLayout('streamer')` frames the whole room centred at any aspect, with every head on screen. Boss rooms (14 × 12) fit at 3:4 and 16:9; at 9:16 the 8-cell window keeps the full depth, and the edge arrow covers a human outside it. |
| Stills | `actors/stills.ts` | `renderCatPortrait(spec, face, {w, h, pose})`: 'plinth' (turntable plinth) or 'mugshot' (height chart, front sit, smug half-blink). `renderRoomStill(play, {w, h})` returns a PNG Blob. Both borrow the live GameRenderer's context (module registry; draw, 2D copy and redraw of the live frame all happen in one task, so nothing flickers). Without a live renderer they use a temporary context that is disposed right after. Both resolve null without a DOM or WebGL. Both are added to `render`. |
| Clip pass | `clip-pass.ts` | Honours `plan.frames` and `plan.size`. `clipFrameToTick` follows share's rule for any frame count: the opener (60 frames) and the tail (30 frames) hold `matchCutTick`, and playback is 1× except inside `slowMo`. Held frames keep the cat breathing through `ClipExtras.poseT`. The clip's slow blink is now the smug half-lid. The `onFrame` same-task contract, backpressure and DPR freeze are unchanged. |
| In the box | `Renderer.updateCat` | With `s.inBox >= 0` the cat sits in that prop, sunk `IN_BOX_SINK` (0.36 m), with only the ears showing, facing the camera. |
| Dev page | `dev.ts` | `?shell=<i>|boss|boss-napper&day=&theme=&cats=<pattern>&collar=&hat=&trail=&ghosts=<0..2>&cameos=<n>&napper=1&accomplice=1[&granted=1&badge=]&human=<state>[&scoop=t]&inbox=<prop>&layout=streamer&editor=1&gallery=cats|humans&portrait=plinth|mugshot&still=room&clip=<f>[&frames=&size=WxH&format=roomba]`. Paused, the visuals keep animating. `bossFixture()` in `test-fixtures.ts` is a 14 × 12 room that sets every FULL-build shell field. |

## Budgets (measured)

- Draw calls (dev page, swiftshader, all live overlays): Kitchen 39–45, boss room with 2 humans + 2 ghosts +
  15 spectators + fridge wall + accomplice 44, other boss views 29–37. Actor meshes in a boss room: 17 (test:
  ≤ 17 for the meshes, + ≤ 18 worst-case sprites/overlays). WORLD's test reserves 48 for the world.
- Triangles: one cat ~1.5k including the outline, one human ~0.8k. Boss room on screen 17–33k.

## Deviations and decisions

- The cat and the humans are rigidly skinned single meshes, not part hierarchies. Pivots are Bones, so pose code
  is unchanged, and `rig.body` is now the one skinned fur mesh.
- `clipFrameToTick` no longer plays 1× into the match cut over the opener: it holds `matchCutTick` like share's
  `clipFrameTick`, as the brief asks. The opener close-up still moves (push-in plus breathing via `poseT`).
- Spectator cats have no outline: the outline cost a draw call and blurred them at that size. The outline twin
  exists but is hidden.
- With a live renderer, plinth portraits have an opaque `PAL.bg` background, because the game context is
  `alpha: false`. Mugshots are opaque by design.
- The scoop walk is render only: the human walks up to 1.7 m toward the cat and stops 0.42 m short. The sim's
  human position never changes.
- `projectHuman(i)` and `spectatorAt(x, y)` are extra public methods on `GameRenderer` (change request filed for
  `types.ts`).

## Gaps / for the integrator

- The Home office webcam sees one cell: the desk occludes the sim's short cone. Change request filed to
  W1-SIM/CONTENT; render shows what the sim returns.
- W2-SHARE's `clipFrameTick` still assumes 360 frames (change request filed). Render already handles any count.
- Render never fetches cameo faces. The caller decodes `VITE_BADCAT_API_URL + faceUrl` and passes the image in
  `faces` (change request).
- `renderFrames` calls `initSim(play, cat)` with the default (current) sim version. Clips are always of the
  player's own current run, so v4 replay-only runs are not clipped.
- The UI must wire `setTrail`, `setCameos`, `setAccomplice`, `setLayout`, `setEditorOverlay` and `pickCell`
  (W2/W3). The HUD eye can use `projectHuman`.
- Not run on a real iPhone or Android device: only swiftshader in headless Chromium.
- Known bugs listed in docs/*.md: none touched.
