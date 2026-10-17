# W1-RENDER-WORLD handover

Package: furniture for every shell, all 63 prop meshes, stack pieces, cloth, cable, puddles, Roomba, tree topple,
box, themes, sponsor label, material shards, world dynamics. Status: done. `npx tsc --noEmit` clean, `npx vitest run`
39 files / 765 tests green (world.test.ts: 35 tests).

## Files

| File | What |
|---|---|
| `src/render/room-view.ts` | `buildRoom(play, mat)` unchanged signature. Per-shell wall/floor styles (tiles, small tiles, planks, boards, parquet, carpet; dado, wallpaper stripes), theme sky per `RoomDef.theme` (night skies get a moon, stars, snowy roofs for xmas), furniture via `world/furniture.ts`, static theme decorations via `world/themes.ts`. Still 3 draw calls (solid, sky, window light) whatever the shell or theme. Re-exports `WALL_H`, `WALL_T`. |
| `src/render/props-view.ts` | `new PropsView(play, mat)`, `update(s, T, alpha, mouth, hud)`, `propPosition(i, out)` unchanged. New: stacks split into tumbling pieces (one InstancedMesh per stack kind, colour + size per instance), cloth spans its w x d (geometry per size) with a ripple slide and a crumple drop after the last pull, tree sway (`PropState.sway`) and topple about its base (lies across the cells, leans when stopped short), open-flap box while `SimState.inBox` is it, Roomba handed to dynamics while `SimState.roomba` drives it, sponsor label (canvas texture, DOM only). Fall/topple/piece timing uses sim ticks, so clip re-renders match. No per-frame `new Matrix4` any more (the old outline code allocated two per target per frame). |
| `src/render/shards.ts` | Material burst styles (confetti, cloud, popcorn, glitter, splat, paper, tinsel): drag, flutter, growth, flattening per particle, inside the 300 pool. `shardColors(kind)` tags its palette so the existing `shards.burst(...)` calls in Renderer.ts pick the style with no change; `burstFor(kind, ...)` does it explicitly. Puddles now sit at 0.021 m on the floor so a spill on a rug shows (they were hidden under rugs; not a documented known bug). |
| `src/render/palette.ts` | `THEME_SKY`, `SHELL_STYLES` (+ types). Existing exports unchanged. |
| `src/render/world-dynamics.ts` | Frozen contract kept; delegates to `world/dynamics.ts`. |
| `src/render/world/dynamics.ts` | Roomba (bumper, googly eyes, LED blink green/amber in its vertex colours, bob, puzzled spin while paused, squash on bonk, "NOT ME" sprite on `framed`), puddles from `grid.puddle` (glossy blue slip, brown soil, fade-in, splash pops on `puddle`), wet wheel tracks after the Roomba drives through a puddle, lamp cables to their floor cell (tug wave on `pull` cable, limp after the lamp breaks), ornament pops on `topple`, TV picture (calm show, rainbow flashing during the ad break `event === 3 && eventActive`), fireplace flames + warm floor glow, webcam REC blink, twinkling string lights (xmas, nye, wedding, valentine), snow behind the window (xmas), drifting confetti (nye, birthday), disco ball + sweeping spots (nye). `update()` never writes state; steady frames allocate nothing (typed-array tables, no hashing or Color calls per frame; a test checks the heap). A tick going backwards (clip pass, restart) resets the transient effects. |
| `src/render/world/furniture.ts` | `FURNITURE_BUILDERS` (one per `FurnitureType`, typed against the union), `addFurniture`, `makeCtx`, `FLAT_TYPES`, `furnitureAnchors(shell)` (TV, fire, REC positions for dynamics). Builders work in the piece's local frame (back wall, west wall, island). |
| `src/render/world/themes.ts` | `addThemeDecor` (merged into the room mesh), `garlandPath`, `stringLightPoints/Colors`, `addHeart`, `roomTheme`. |
| `src/render/world/prop-shapes.ts` | `buildPropGeometry` for kinds 1..63 (re-exported by props-view), `buildClothGeometry(w, d)`, `buildBoxGeometry(open)`, `stackLayout`, `stackTint`, `buildStackPieceGeometry`, `SPONSOR_LABEL`. |
| `src/render/world/layout.ts`, `shell-style.ts`, `label.ts`, `budget.ts` | Shared frame maths, shell style lookup, sponsor/sticker canvas texture, `countDrawCalls` / `countTriangles`. |
| `src/render/world/fixtures.ts` | Test/preview rooms: living, bath-bed and a 14 x 12 boss hall that use every FurnitureType, `denseProps`, v5 `fixtureStateFor`. |
| `src/render/world/preview.html` + `.ts` | Dev page (not shipped): scripted v5 timeline with the real RoomView/PropsView/Shards/WorldDynamics. `http://localhost:5174/src/render/world/preview.html?shell=living|bath-bed|boss|kitchen&theme=<id>&t=<tick>`. |
| `src/render/world.test.ts` | 35 tests (below). |

## Budgets (measured)

- Content dailies 1..60, every shell and theme: world (room + props + dynamics) max **34 draw calls** (daily-027), max
  **27.2k triangles**. Test asserts world <= 48 calls with 3 pooled falling props added (ACTORS reserves the rest of
  80, their notes say <= 35), and the dense 60-prop boss fixture <= 45k world triangles (15k reserved for actors).
- Themes add <= 3 draw calls (glow, additive glow, fx, disco only where needed; static decor is merged). Test: <= 6.
- Hidden meshes (puddles with no puddle, fx with nothing live, stack pieces before a fall, the sticker) are
  `visible = false`, so they cost no draw call.

## Tests (world.test.ts, Node)

Prop meshes for all 63 kinds within bounds (tree 1.4-1.8 m / < 0.8 m spread, cloth 0.4 m per cell, box <= 0.5 m,
others < 0.45 m), stack layouts and pieces, cloth spans and open box, burst styles and tagged palettes, material
shards (confetti falls slower than glass, pool never overruns, flour cloud fades), a builder for every FurnitureType
in every orientation, anchors, every content shell + 4 fixtures in all 8 themes within the draw-call budget, content
dailies 1..42 mid-run within budget, boss triangles, theme cost <= 6, stack split and scatter, Roomba hand-off, box
open/close, tree topple, cloth/tree hand-back after their animations, dynamics on synthetic v5 states (puddles,
moving/pausing Roomba, cable tug, topple, framed, ad break) without throwing and without heap growth, no Roomba in
v4 rooms.

## Acceptance

Screenshots at 390 x 844 in `bad-cat/test-results/world/` (gitignored): every content shell through the ACTORS dev
page (`?shell=0..8`, `?theme=` for all themes on the living room) and the world preview timeline (`pv-*`: puddles,
book stack scattered, ad break, lamp cable, tree mid-topple and lying, box open, NOT ME sticker, flour spill, NYE
boss, valentine bath, spring kitchen, wedding boss). No page errors.

## Deviations and notes for the integrator

- Cable cell convention follows the sim (`PropPlacement.rot` 0 N, 1 E, 2 S, 3 W; `cable` overrides).
- The cloth drop: the sim lands the cloth in place (`LANDED`, same cell); render slides it one cell past its edge
  in the last pull direction and crumples it on the floor (render only). Behind tall furniture it can be hidden.
- Content shells place decor pieces on base pieces (tv on tv-stand, mirror on vanity, webcam on desk). The TV draws
  its own console only when nothing else covers its cells; the mirror hangs on the wall above; the webcam sits on top.
- Stack items are one neutral geometry per kind tinted per instance, so a book's page edges take the cover colour.
- Disco ball and string lights are unlit `MeshBasicMaterial`s (bulbs glow); the puddle and wet-track mesh uses its
  own transparent Lambert material; everything else shares the room/prop material.
- Not done / open: no per-prop shard sets (one generic chunk mesh, per GDD 11.1); the sponsor label is blank in
  Node and in workers (no DOM). No change requests to `types.ts`.
