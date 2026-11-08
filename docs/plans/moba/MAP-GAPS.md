# Pawlegends map gaps (2026-11-07)

This document lists the verified gaps in the Pawlegends map, navigation and minimap. It is based on 41 confirmed findings from four audit lanes (geometry, nav, design and readability), with probes and screenshots in `pawlegends/.shots-map/` and in the session scratchpad. After merging duplicates and splitting mixed findings into a client part and a sim part, they become 25 fix-now items (A) and 15 sim specs (B).

The goal is a map that reads better than Wild Rift, Mobile Legends and LoL, with zero friction on phones (667x375 and 844x390 touch).

SIM_VERSION 14 is live, and another team is building v15 (3 more dogs) now. So the work splits in two:

- **Part A: fix now.** Render, UI, camera, minimap and client input only. None of it changes a sim result, so replays and hashes stay the same and SIM_VERSION is not bumped.
- **Part B: later SIM version (v16, after v15 lands).** Anything that touches `src/sim/**` or sim data in `src/data/map.ts`, `camps.ts`, `pudding.ts` or `tricks.ts`. These items are specs only. Do not start them on this branch.

Severity uses the auditors' rating, corrected where verification showed the claim was overstated.

## Merged duplicates

| Kept as | Merged in |
|---|---|
| A1 Draw the jungle walls | `geometry-invisible-jungle-walls`, `nav-invisible-rocks`, `geometry-camp-rocks-never-placed` (the dead rock loop is fixed in the same pass) |
| B1 Forest soft-lock | `nav-softlock-forest` plus the "dash starts inside a wall" part of `nav-hunt-tether-unclipped` (`clipTravel` start-blocked early return) |
| B9 Corridors | `design-open-jungle` plus the spec option in `nav-invisible-rocks` (move walls 3 and 4 off y=30) |
| A10 and B13 | `design-pudding-lane-tiebreak` has a sim part (B13) and a minimap part (A10, which shows the lane once it is known) |
| A20 and B12 | `design-bush-scouting` has a render part ("cleared" tint, A20) and a sim part (minion reveal range or ward, B12) |
| A16 and B8 | `nav-lanes-through-towers` has a render push-out bias (A16) and a data fix (B8) |
| A14 and B4 | `nav-move-to-structure-never-ends` has a client goal snap (A14) and a sim completion fix (B4) |

---

## A. Fix now without a sim change (ordered implementation checklist)

The order is by player impact first, then by shared files (the `mapView.ts` items go together, and so do the `minimap.ts` items). Each item names its files, the change and the check that proves it.

**Rules for every A item:**

- Do not import anything into `src/sim/**` and do not write to it. Reading `createGrid()`, `WALLS`, `onPlayfield` and `mirrorX` from render or UI is fine.
- Run `npx tsc --noEmit` and `npx vitest run`. `determinism.test.ts`, `replay.test.ts` and `hash.test.ts` must stay green and unchanged.
- Take screenshots at 667x375 and 844x390 touch and at 1440x900, at default zoom and at max zoom.

### A1. Draw the 8 jungle walls and re-route the footpaths (critical)
Source: `geometry-invisible-jungle-walls` and `nav-invisible-rocks`, plus `geometry-camp-rocks-never-placed`.

- In `render/views/mapView.ts`, build one merged rock-and-root cluster per WALLS rect and its `mirrorX` copy. Take the cells from `createGrid().walls` minus the `!onPlayfield` cells, so the mesh always matches the nav grid. Use the cell-centre rule so edges fall on whole metres. Use dodecahedron boulders 0.8 to 1.6 m tall plus 1 to 2 logs or stumps, cast shadows, and fill each rect to its edges.
- Paint a darker dirt footprint under each wall on the ground canvas.
- Re-route the painted footpaths from CORE (10,30) through RAT_CAMP (30,30) to (44,30), and their mirrors. Bend them round the x16-18 and x35-37 walls (via y 34.5, which matches the A* detour), or stop them at the wall faces.
- Add the wall clusters to the `uSee` canopy-cut shader, so a hero behind a tall rock stays visible.
- Fix or delete the dead camp-rock loop (`mapView.ts:512-525`). It places 0 of 400 rocks. Replace it with low, non-blocking pebbles (under 0.25 m) outside the 5.5 m camp clearing and off the footpaths.
- Check: a unit test asserts that every blocked on-playfield cell is covered by a wall-cluster footprint and that no footpath sample lies on a blocked cell. Re-shoot `wallE`, `wallW`, `wallN` and `jungle` at all three sizes. The minimap blocks and the 3D rocks must line up.

### A2. Touch minimap: drag to scrub, and long-press ping without panning (high)
Source: `readability-mm-touch-no-drag-scrub`.

- In `ui/minimap.ts`, call `setPointerCapture` on pointerdown. On pointermove, call `host.lookAt(x, y, hold=Infinity)` so the camera follows the finger. On pointerup, release with a 0.6 s hold, then snap back.
- Start the 450 ms "Go here" ping timer only while the finger stays within about 6 px. A ping that is not dragged must not move the camera, or must restore it.
- `canvas { touch-action: none }` already exists in `ui.css:24`, so it needs no change.
- Check: a Playwright touch spec at 667x375 drags across the minimap, asserts the camera focus tracks the drag, and asserts it returns about 0.6 s after release. A long press pings and leaves the focus unchanged.

### A3. Minimap hero portraits (high)
Source: `readability-mm-heroes-are-anonymous-dots`.

- Cache one 16 to 20 px round portrait canvas per hero from `render/portraits.ts`. Give it a ring in the relation colour (self gold, thicker). Fall back to a 1 to 2 letter `HERO_TEXT` initial on a coloured disc, which is the default on the 132 px touch minimap.
- Draw self last, so it is always on top.
- Check: a unit test of the draw order (self last), plus a screenshot at 667x375 where each enemy can be told apart.

### A4. Minimap colour-blind safety and outlines (medium; the audit said high)
Source: `readability-mm-cvd-enemy-on-grass`.

- Give minion squares and the Pudding disc the dark outline that towers and heroes already have (`minimap.ts:225-228`).
- Draw enemy minions as diamonds and ally minions as squares.
- Optional: add a "Colour-blind" setting in `ui/settings.ts` that swaps `RELATION_CSS.enemy` to `#ff8a00` or `#ff3fd0` with a dark outline.
- Check: extend the ΔE probe so that every unit mark against grass, lane and neutral has an outline contrast of ΔE ≥ 30 under deuteranopia and protanopia.

### A5. Minimap size, opacity and unit scale on touch (medium)
Source: `readability-mm-touch-size-and-opacity`.

- Make the touch minimap about 160x96 at 667 px wide and 176x106 at 844 px wide, at opacity 1 with a dark border.
- Scale unit marks with `this.w` (hero radius about `w/36`).
- Add an S/M/L "Minimap size" setting.
- Move the dependent layout: the enemy portrait strip at `top:95px`, the kill feed (it must end before the top ability button at about y 175), and `.pl-pingbtn` at `right:152px` (`ui.css:1076` and `1323-1328`).
- Check: a Playwright layout spec at 667x375 and 844x390 asserts that the minimap, ping button, portrait strip, kill feed and ability buttons do not overlap.

### A6. Minimap edge inset (low; it shares A5's coordinate change, so do it now)
Source: `readability-mm-clipped-at-edges`.

- Map into an inset rectangle: `X = pad + x/W*(w-2*pad)` with pad of about 6 px. Do the same for Y and `toMap`. Repaint the background with the same inset.
- Clamp the view-quad points into the inset rectangle, so the quad stays closed.
- Check: a unit test that the self dot at the fountain (3000, 32000) is fully inside the canvas, and that `toMap(X(x))` round-trips.

### A7. Bush versus forest versus rock on the minimap (medium)
Source: `readability-mm-bush-vs-forest`.

- Draw bushes as a lighter catnip green (`#5fae4a`) in an outlined rounded rect with a dot texture.
- Make the forest and WALLS fill darker and desaturated (`#2f4f2c`). Optionally draw rocks as grey-brown, so a rock is not a bush.
- Check: ΔE ≥ 25 under deuteranopia between bush and forest, and between bush and rock.

### A8. Pudding and its timer leave the self gold (medium)
Source: `readability-mm-pudding-timer-is-self-gold`.

- Give Pudding and its countdown ring their own objective hue (for example `#b07cff`) and a 6 px rounded square with a dark outline and a glyph. Gold stays for self only, as the `palette.ts:25-27` rule says.
- Check: grep shows no `#ffd34d` or `RELATION_CSS.self` in the minimap except the self dot.

### A9. Minimap base tint follows relation, not team index (medium)
Source: `readability-mm-core-tint-ignores-side-swap`.

- In `paintBg`, tint the base area with the relation colour (ally or enemy) at about 30% alpha.
- Invalidate `this.bg` in `setSpecies` and `setSideSwap`.
- Fix the stale "dogs blue" comments at `palette.ts:58` and `:95`.
- Check: a unit test where a team-0 dog player sees the ally tint under their own base.

### A10. Ping glyphs on the minimap and a dedicated ground ping decal (medium)
Source: `readability-ping-markers-colour-only`.

- Pass the ping kind through `Minimap.ping(x, y, color, ms, kind)` and the `pingAt` multiplayer path.
- Draw the `pingText.ts` icon for each kind (paw, heart, sun, wind, shield, dash, sword) in a dark bubble inside the ring.
- Add a world ping decal in the ping's colour (a pillar plus a glyph), separate from the mint `orderMarker`, and a 1 s screen-edge arrow when the ping is off-screen.
- Give pushSunny and pushPuddle, and goHere and group, distinct colours, since today they share them.
- Also draw the Pudding escort lane on the minimap once `G.PudLane` is set, the moment the escort spawns. Showing it at calm needs B13.
- Check: a unit test that each `PingKind` maps to a distinct glyph and colour, and that a world ping never calls `orderMarker`.

### A11. "Last seen" ghosts on the minimap (medium)
Source: `readability-fog-no-last-seen`.

- In `Minimap`, remember each enemy hero's last visible position and tick.
- For 6 s after the hero leaves the frame while alive (not dead or recalled), draw a faded, desaturated portrait with a "?" and a shrinking ring. Clear it when the hero is seen again.
- Use snapshot data only.
- Check: a unit test that feeds frames with the hero present and then absent, and asserts the ghost shows and expires after 6 s or on re-sight. It must not ghost a hero that died.

### A12. Outer field dressing to the camera's real reach (medium; the audit said high)
Source: `geometry-bare-outer-field-max-zoom`.

- Size the outer dressing band from `CAMERA_FRAME` and `zoomMax`: about 41 m beyond the west and east edges, 35 m north and 20 m south, plus 5 m. Include the 4 corner quadrants.
- Fill the band with a jittered grid of instanced trees that thins with distance (InstancedMesh, LOD-0), within the triangle budget per tier.
- Alternative or complement: clamp `clampFocusX/Z` by the current zoom.
- Check: a new e2e probe raycasts the 4 screen corners at zoomMax for the 4 map corners and asserts every hit is inside the dressed radius.

### A13. Fountains clear of the hedge, and the plaza not cut at x=0 (medium)
Source: `geometry-fountain-clipped-by-hedge`.

- Skip `edgeBush` within `FOUNTAIN.radius + 1.6 m` of each fountain. Bend the hedge into an arc of about 6 m behind the basin, or put a stone back wall there.
- Draw the plaza as a mesh disc at y 0.005, so it continues past x=0 and x=W.
- Check: a unit test that no hedge sphere intersects the fountain rim torus. Re-shoot the `fountain19_edge` crop.

### A14. Client input grid mirrors the standing structures (low, with medium knock-on)
Source: `nav-preview-vs-sim-structures`, plus the client half of `nav-move-to-structure-never-ends`.

- Keep a client copy of the structure footprints: `coverDisc` from the snapshot's alive towers and cores, removed when a structure dies. `input/heading.ts` (flash ghost, `landing`, `clip`) and `input/orders.ts` (`reachableGoal`, `clearAlong`, `slideAngle`) read this copy.
- In `reachableGoal`, snap a goal inside a standing footprint to the nearest walkable edge cell.
- This changes only which command the client sends. Commands are recorded and replayed as sent, so determinism is unaffected.
- Check: a unit test that a Pounce aimed onto a tower lands its ghost at the footprint edge where the sim's `blink` stops, and that a tap on a core yields a goal outside the footprint.

### A15. River beyond the map edge: banks, boundary markers and canopy (medium)
Source: `geometry-river-runs-off-map-no-banks`.

- Extend the sand banks as two strip meshes along the full river plane.
- Mark the boundary across the river at y=2 and y=58 with a log jam, rocks and reeds, where the sim's `PLAYFIELD.rim` stops units.
- Close the forest over the river beyond about 8 m, or fade the river plane out.
- Check: a screenshot of `botbridge` and `topbridge` at z1.9, plus a unit test that a boundary marker sits at each river and rim crossing.

### A16. Bridge deck covers the walkable band (medium)
Source: `geometry-bridge-rails-inside-walkable-lane`.

- Widen the planks to at least 11.4 m (±5.7 m) and move the rails to ±5.7 m, or keep only low end posts at the bank corners.
- Lower the plank top to y ≤ 0.015, using polygonOffset or renderOrder over the 0.02 river plane.
- Separate fix in `minionInstances.ts`: for a minion near a tower centre, bias the push-out direction to the lane's outside normal, so it never flips sides. This is the interim fix for `nav-lanes-through-towers`.
- Check: a unit test that no walkable lane-band cell in the river lies under a rail mesh, and a unit test that the push-out direction is stable for an offset of ±1 mm.

### A17. Structure clear radius from the sim radius (low)
Source: `nav-structure-visual-vs-sim-radius`.

- In the `OBSTACLE_CLEAR` push-out (`heroView.ts:64`, `towerView.ts:372`, `gameView.ts:873` and `892`), compute the clear radius as `RADIUS.tower/1000 + 0.6` and `RADIUS.core/1000 + 0.6` instead of from the mesh bounding box. Optionally shrink the base meshes to match.
- Check: a unit test that a hero hugging a tower is drawn within 0.6 m of its sim point.

### A18. Destroyed towers stay on the minimap (low)
Source: `readability-mm-dead-towers-vanish`.

- Cache tower positions and teams from the first frame and draw a greyed, crossed-out square at 35% alpha once a tower is gone.
- Check: a unit test with a frame where the tower is present, then dead, then absent.

### A19. Lane glyphs and static objective markers on the minimap (low)
Source: `readability-mm-no-lane-labels-landmarks`.

- Draw sun and puddle glyphs at the lane midpoints, with "Sunny" and "Puddle" labels on desktop.
- Draw static, dimmed rat camp and Pudding pit markers.
- Flash the named lane for 1 s when an announcement or ping names a lane.
- Check: a screenshot at 667x375, plus a unit test that the announcer's lane name triggers the flash.

### A20. "Cleared" bush tint (low)
Source: the render part of `design-bush-scouting`.

- When an allied hero or minion stands in a bush, tint that bush lighter in 3D (`mapView` bush material uniform) and on the minimap.
- This uses only data the client can already see: an ally in a bush sees everything in that bush.
- Check: a unit test of the tint toggle from the snapshot.

### A21. Touch minimap move order by double-tap (low)
Source: `readability-mm-touch-no-move-order`.

- Detect a double-tap from timestamps in the minimap's own `pointerdown`. Do not use `dblclick`, because `app/noZoom.ts` cancels it.
- Call `host.moveTo` (an existing op) and show a mint path marker until the hero arrives or the joystick is used.
- Check: a Playwright touch spec at 844x390.

### A22. Outer ground matches the playfield, and the hedge is natural (low)
Source: `geometry-playfield-outer-color-seam`.

- Give the outer plane a tileable grass canvas texture at 20 px/m (RepeatWrapping) that darkens with distance, or paint the ground canvas with a 20 m margin.
- Jitter the hedge: ±0.5 m position, varied radius, about 15% gaps, and mixed flowers and rocks.
- Check: a pixel probe at the `cornerNW` z1.9 seam shows a step of ΔE < 8.

### A23. Shadow budget at desktop max zoom (low)
Source: `geometry-shadow-box-clamped-max-zoom`.

- Use the tier's `shadowMap` size (2048 on high) instead of the hardcoded 1024 in `renderer.ts:78`, and raise `SHADOW_BOX.max` to about 54 on med and high when zoom is above 1.5.
- Better: fit the box to the view trapezoid in light space. Keep 1024 on low.
- Check: extend the probe so that every visible ground corner is inside the box at zoomMax for each tier.

### A24. Red-side camera and minimap flip (low now; required before PvP M1b)
Source: `design-camera-red-side`.

- `cameraYaw = myTeam === 1 ? Math.PI : 0` in renderer and IsoRig. Feed the same yaw to `screenToWorldDir` and stick aim (`ctx.cam.yaw`) and to the yaw-baked FX (`skillfx/bengas.ts:66`, `fx/fun/skills2Fun.ts:81`). Flip minimap X and Y for team 1.
- Check: a Playwright spec boots a humans config with a team-1 seat at 844x390 and asserts that the enemy core projects to screen-right and that the stick pushes toward it.

### A25. Optional stopgap for hero bodies grazing static walls (low)
Source: the render part of `nav-corner-clip-body`.

- Extend the `layoutBodies` obstacle push-out to static wall cells near each hero, so the 0.5 m body does not draw inside rocks and trees.
- This is cosmetic only. The real fix is B7.

Not done in A, on purpose:

- Corridor landmarks for `design-open-jungle`, and preview bushes for `design-bush-layout`. They would show walls or brush the sim does not have, so they ship with B9 and B10.
- The bush "rustle" on a hidden attacker. It leaks information the sim hides, so it ships with B11.

---

## B. Sim and map-data changes for a later SIM version (v16, after v15 lands)

**These rules apply to every B item:**

- Each item changes replay outcomes, so it ships under `SIM_VERSION = 16` (`src/sim/version.ts`).
- Freeze v15 into the backend vendor (`backend/src/vendor/pawlegends-sim`, `SIM_VERSIONS`), so old records still re-sim under their own version. `pawlegends-replay.worker.ts` already routes by `simVersion`.
- The party referee (`backend/src/pawlegends/party/referee-*`) and `partyClient` check `sim` and `simHash`, so mixed-version parties are refused. That is expected behaviour.
- Regenerate the golden fixtures (`tests/unit/golden/*`) and bot balance baselines in the same commit.
- Keep integer-only maths and fixed iteration order, so `determinism.test.ts` must pass: two runs give the same hash, and the replay hash equals the live hash.
- Client code that reads sim data (minimap `createGrid`, `input/` grids, `mapView` walls from A1) picks up data changes automatically, because it imports the same modules.
- Bump `version.ts` only once per batch, not per item.

The items are listed by severity. Batch 1 (nav fixes, B1 to B7) can ship together as v16. Batch 2 (layout and objectives, B8 to B14) is a design batch that can be v16 or v17. It needs the PARITY §6.3 gates and an A1-style render pass for every new wall and bush.

### B1. Forest soft-lock (critical)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-softlock-forest`.

**Change:**
- `effects/dash.ts` `clipTravel`: when the start cell is blocked, do not return early. Sample the segment at `NAV.losStep`. If a sample is walkable, stop at the first walkable sample (leaving the wall). Otherwise keep the start position and never move deeper. Blink (`blink.ts:23`), dash and knockback all inherit this.
- `nav/astar.ts` `findPath`: when `snapCell(start)` is -1, run a BFS over the grid from the start cell to the nearest walkable cell (bounded by the grid size, with a fixed neighbour order for determinism) and path from there. `walk()` then always has a way out.

**Determinism and replay:** this changes the outcome of any tick where a unit is on a blocked cell. Integer BFS with a fixed neighbour order keeps it deterministic.

**Tests:**
- Hero at (8000,51000), Trick west, then Move (30000,30000): the hero reaches the playfield within 5 s.
- A hero placed at (2000,56000) and given Move moves.
- A dash that starts inside a rock never ends deeper (`depth(end) ≤ depth(start)`).

### B2. Gate barrier clamp walks heroes into the forest and through their own tower (high)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-gate-clamp-forest`.

**Change:**
- In `units/hero.ts` `walk()` (about lines 193-199), step toward the real path point, then clamp the resulting position: `x = min(out.x, gate)` for team 0 and `max` for team 1. When the clamp bites, keep the previous y as well, so the hero stands at the barrier instead of sliding along it.
- Block Trick and ability movement across the gate before `barrierDrop`, with the same clamp on `fmX`.

**Determinism and replay:** opening movement changes in every match, so every replay hash changes.

**Tests:**
- Move (37000,51000) at t0: the hero is never on a blocked cell during ticks 0-200.
- A pounce at t30 does not cross `MAP.barrierX`.
- Bot runs (24 seeds): 0 hero-ticks inside the forest or their own tower before t200.

### B3. Order lost after a dash or knockback, and the stale path walks through rocks (high)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-order-lost-after-forced-move`.

**Change:**
- In `effects/dash.ts` `stepForced`, on landing (`n === 1`): keep `moveX`/`moveY` when the order is Move or AttackMove, and otherwise set them to the landing point. Always set `pathLen = 0`, `pathIdx = 0` and `timer = 0`.
- In `units/hero.ts` `applyOrder`, skip `planPath` while `fmKind !== None`. The hero re-plans on landing.

**Determinism and replay:** this changes every order issued during forced movement.

**Tests:**
- Knock Sage 2 m west from (37100,38900), Move (3000,30000) during the push: after landing the goal is still (3000,30000), and the hero is on 0 blocked cells until it arrives.
- Bot runs: 0 "hero rock via walk" entries.

### B4. A Move onto a structure never completes (medium)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-move-to-structure-never-ends`.

**Change:**
- In `walk()`, when the path is used up, the hero is at the last point, and the last `PathResult.complete === false`, end the order (`return true`, state Idle). Store `complete` on the unit (one new int field) so the check does not re-plan.
- Change the bot goals in `sim/bots/orders.ts` and `brain.ts` that target `CORE` or tower centres to target the nearest walkable cell outside the footprint.

**Determinism and replay:** the new world field must be added to `hashWorld` and snapshot ordering.

**Tests:**
- Move to own core (10000,30000): the order clears within 2 s of arrival.
- Move to own tower (20000,48000): the order clears.
- Bot runs: 0 heroes "standing Moving" for more than 90 ticks.

### B5. Minions, rats and feared units ignore the nav grid (medium)
**Status:** B5a (heroes only) shipped in sim v17: feared and charmed heroes slide along walls (`nav/slide.ts` `slideStep` in `fleeStep`, `docs/plans/moba/V17.md` §4). The minion, rat and camp part is still later (it moved last hits and gold and failed the v16 PvE gate: Purrhaven 47.6%, −2.6 pp). A v17 bot sweep also found walking heroes grazing wall cells at path corners; that is B7.
Source: `nav-units-ignore-walls`.

**Change:**
- Add a shared `slideStep(m, id, nx, ny)` helper. If the target cell is blocked, try the x-only step, then the y-only step, else stay.
- Use it after `moveToward` in `minion.ts` (chase and lane), in `separate()`, in `camp.ts` `walk()`, and in `fear.ts` `fleeStep` for every kind, not only heroes.
- When a minion's chase target is behind a wall and `lineClear` fails, drop the target, or use `findPath` with a small expand cap.

**Determinism and replay:** this changes minion and rat movement, last hits and gold, so it changes every match. The cost is about 2 extra grid reads per moving unit per tick, which is well within budget. Measure it in `perf` tests.

**Tests:**
- Over N bot matches, no minion or camp unit ends a tick strictly inside a WALLS cell or a forest cell.
- A feared minion next to a wall slides along it.

### B6. Pack Hunt hops and tether clamps skip the wall check (low)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-hunt-tether-unclipped`.

**Change:**
- In `heroes/cacklejaw.ts`, `hopToward` and the hunt start: clip each hop with `clipTravel` and end the hunt when the hop is cut to 0.
- In `effects/tether.ts` `clampToArena`: if the clamped point is blocked, step it toward the arena centre in `losStep` increments until it is walkable.

**Determinism and replay:** this changes Cacklejaw and tether outcomes near walls.

**Tests:**
- A hunt toward a victim behind rock [24-30 x 37-41] stops at the rock face.
- A tether clamp next to a core never lands on a blocked cell.

### B7. Point pathing and the 250 mm line-of-sight sampling clip wall corners (low)
Source: `nav-corner-clip-body`.

**Change:**
- In `map/grid.ts`, make `lineClear` an exact integer grid traversal (Amanatides-Woo, rejecting segments that cross a corner diagonally between two blocked cells).
- Add an inflated static-wall layer (+1 cell) that A* plans on and string pulling tests against, with a fallback to the uninflated grid when start or goal sits in the inflated band.

**Determinism and replay:** this changes every hero path, and it needs integer DDA only, no floats.

**Tests:**
- Over 1000 seeded random pairs, 0 path segments enter a blocked square.
- Fewer than 5% of segments pass within 500 mm of a static wall.
- `nav.test.ts`: still 1 connected component and 0 incomplete paths.

### B8. Lane centre lines run through the inner towers (medium, design)
Source: `nav-lanes-through-towers`.

**Change:**
- In `data/map.ts`, move each `TOWER_SPOTS` entry about 3 m to the outside shoulder of its lane: inner towers off the (16,44) to (22,50) and (16,16) to (22,10) segments, and outer towers by the same rule. Mirror them for Woof.
- Alternatively, add one lane waypoint per tower that bends round it.
- Update every copy that reads tower spots (minimap static markers from A18, bots, and the `TOWER_SPOTS` copies listed in `docs/DEVELOPMENT.md` if any).
- After this lands, remove the A16 push-out bias.

**Determinism and replay:** this changes the map layout, so balance must be re-baselined.

**Tests:**
- Every tower centre is at least 3 m from its lane polyline.
- Bot runs: 0 "minion structure via lane" entries.
- Tower aggro timing tests still pass.

### B9. Jungle corridors instead of one open meadow (high, design)
Source: `design-open-jungle`, plus the wall option in `nav-invisible-rocks`.

**Change:**
- Redraw `WALLS` into 2 to 3 corridors per side (lane to river, lane to camp, camp to river). Each corridor is 3 to 4 m wide, with mouths left for brush (B10). Keep the mirror symmetry.
- Move walls 3 and 4 off y=30, or make the straight core-to-camp footpath a real corridor.

**Determinism and replay:** the nav grid changes, so all paths change. Check that `NAV.maxExpand` 3000 still finds the longest path.

**Tests:**
- 1 connected walkable component and 0 incomplete A* paths over 4000 pairs.
- Each corridor is at least 3 cells wide.
- Gates (PARITY §6.3): median takedown gap and p90 ≤ 60 s in bot runs.
- A1 render covers every new wall automatically.

### B10. Bush layout around the objectives (medium, design)
Source: `design-bush-layout`, corrected.

**Change:**
- In `data/map.ts`, add 2 bushes per side flanking the Pudding pit, at about (46,36) and (46,24). Check them against the river band x 46-54 and against walkability. Optionally add 1 bush at the rat camp mouth.
- Do not add the proposed lane bush at (42,49). It sits inside the 8 m lane band and duplicates the existing (40,44) bush.
- Keep `BRUSH_REVEAL_MM` at 2000.

**Determinism and replay:** this changes the vision rules (`hiddenFrom`) and the snapshot contents.

**Tests:**
- `brush.test.ts` covers the new bushes and their mirror.
- No bush overlaps the lane band.
- The minimap (A7) draws the new bushes automatically.

### B11. Attacking or casting from a bush reveals the attacker (high)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `design-brush-attack-no-reveal`.

**Change:**
- In `combat/damage.ts`, after a hit from a hero source: `if (w.bush[src] >= 0) w.revealT[src] = max(w.revealT[src], 45)` (1.5 s).
- Apply the same at cast start in the shared cast path, for every kit.
- Render, in the same release: a rustle burst on the bush when a revealed unit attacks from it.

**Determinism and replay:** this changes visibility, so the snapshot and bot targeting change.

**Tests:**
- Bengas basic-attacks from bush (40,44) at 5.5 m: the victim's team sees her for 45 ticks.
- A cast from a bush also reveals.
- PARITY.md:323 is ticked.

### B12. Bush scouting (low, design)
**Status:** shipped in sim v17 (`MINION_BRUSH_REVEAL_MM = 3000`, `docs/plans/moba/V17.md` §4). On the v17 sim it held the PvE gate: human side 49.5% with it against 50.1% without (two pooled 2,000-seed windows). The Whisker Ward trick is still later.
Source: the sim part of `design-bush-scouting`.

**Change:** raise the reveal range for allied minions from 2 m to 3 m in `hiddenFrom`. A separate later item is a "Whisker Ward" Paw Trick that reveals one bush for 4 s (`data/tricks.ts`, per GAPS.md:27).

**Determinism and replay:** this changes visibility.

**Tests:** `brush.test.ts` reveals at 2.9 m for a minion and not at 3.1 m.

### B13. Pudding escort lane tie-break is always Sunny (low)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `design-pudding-lane-tiebreak`.

**Change:**
- In `units/pudding.ts`, break ties by the lane whose enemy outermost tower has lower HP, then by a seeded RNG draw from the match RNG (not `Math.random`).
- Set `G.PudLane` at the moment of the calm, not at escort spawn, so A10 can show the lane right away.

**Determinism and replay:** use the match RNG in a fixed call order. This shifts the RNG stream, so all later draws change.

**Tests:**
- With equal towers, the lane varies across seeds.
- With an HP difference, the lower-HP lane is picked.
- `PudLane` is set on the calm tick.

### B14. Objectives: one central Pudding, uncontested camps, and Pudding with no pit (high and medium, design)
Source: `design-single-objective` and `design-pudding-no-pit`.

**Change:**
- Add Crow roosts at mirrored off-centre river spots, (50,44) and (50,16), alternating sides (GAPS N3 and PARITY S-Obj).
- Move one rat camp per side toward the river so it can be contested (a second camp per GDD §3.2, in `data/camps.ts` and `camp.ts`).
- Give Pudding a pit: a ring of WALLS segments at about 7 m radius round (50,30), with 2 mirrored entrances per side and B10 brush at the entrances.
- Check the Pudding escort path out (`pudding.ts:77` placement and walk out), the bot objective goal (`brain.ts:586-587`, A* within `NAV.maxExpand`) and the `brain.ts:284` leash radius.

**Determinism and replay:** this adds new world entities and fields, which go into `hashWorld` and the snapshot schema. Bot balance must be re-baselined.

**Tests:**
- Gates (PARITY §6.3): at least 40% of matches end before Sunset, and the team with more Feathers wins at most 65%.
- Pudding can always reach both lanes.
- The pit has exactly 4 entrances, each at least 3 cells wide.

### B15. Enemy fountain is missing from the nav grid (low)
**Status:** shipped in sim v16 (feat/pawlegends-v16).
Source: `nav-enemy-fountain-not-in-grid`.

**Change:**
- Add a per-team block mask for the enemy fountain disc (radius `FOUNTAIN.radius + RADIUS.hero`), and pass a team argument to `planPath` and `findPath` so A* routes round it.
- Knockbacks can still push a hero in, as designed.

**Determinism and replay:** this changes hero paths in the enemy base.

**Tests:** a Move from (90500,24500) to (96500,35500) arrives without entering the fountain zone, and the hero does not freeze.

---

## Coverage check

All 41 confirmed gaps map to at least one item. A1 and B1 absorb the duplicates. Gaps with both a client part and a sim part appear in A and in B. 25 items are in A, and B has 15 specs across 2 batches.
