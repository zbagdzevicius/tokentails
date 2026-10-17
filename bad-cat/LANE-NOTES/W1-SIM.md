# W1-SIM handover: v5 rules with v4 replay

Owner files: `src/sim/**` only. `npx tsc --noEmit` clean for `src/sim` (other lanes had transient errors);
`npx vitest run src/sim`: 4 files, 130 tests green. `grep -rn "Math.random\|Math.sin\|Date" src/sim` finds nothing.

## Built

- **Rules versioning.** `initSim(play, cat, opts?)` and `runToEnd(play, cat, inputs, opts?)` take
  `{ simVersion }` (default `SIM_VERSION` = 5; `RangeError` outside 4..5, `rulesFor(opts)`). `s.rules` is stored,
  `RunResult.simVersion = s.rules`. Every v5 rule is gated on `isV5(s)`; under rules 4 the code paths and RNG draw
  order are the old ones. `hashState` puts `s.rules` in the slot that used the constant, and hashes the v5 fields
  (and the v5 internals below) only when rules >= 5. Under rules 5 `initSim` always sets every v5 field
  (`noise`, `maxNoise`, `slides`, `pulls`, `onCamera` = 0, `inBox` = -1, `roomba` = state or null, `grid.puddle`
  zeroed, per-prop `pulls/w/d/sway/framed/onCam`, `human.routine`); under rules 4 it sets none of them.
- **Golden v4** (`golden-v4.test.ts`, `fixtures/golden-v4.json`, recorded before any v5 edit): 30 runs (The Glass,
  kitchen-v1..v7 as days 1..7, preview days 0 and -4) x ranked/practice/ftue. 20 runs use a closed-loop seeded bot
  (freezes on telegraph/look, swats the auto-assist target, climbs, grabs), 10 use scripted openings + seeded random
  input. Scores up to 4,255, perfect/clean/caught stamps, combos, targets, spills, grabs. The fixture stores the
  resolved PlayableRooms and the inputs (RLE), so content edits can never move it. Each run checks finalScore, stamp,
  ticks, events.length, an FNV digest of `JSON.stringify(events)`, an FNV digest of the canonical final state (sorted
  keys, typed arrays as arrays, without `rules`), that `hashState` equals the old hash with the constant 4, and that
  the old hash with 5 equals the recorded `finalHash`. Re-record only with `BADCAT_GOLDEN_RECORD=1` (never needed).
- **v5 rules** (`src/sim/v5.ts`, hooks in `cat.ts`, `props.ts`, `human.ts`, `sim.ts`, `cone.ts`):
  a. spill-slide (puddle grid, 2x2 spill, one-cell skid, no chain, soil never slides);
  b. stacks (per-item combo, `stack` then the break/land event with the same total);
  c. cloth pull (max 2, riders nearest-to-cat first, pushed-off props fall chain 0, cloth drops 'land' 0 pts);
  d. cable pull (floor cat on or facing the cable cell; push toward the cable whatever the swat count);
  e. Roomba (loop, pauses, blocks the cat, spreads slip puddles; FRAMED +300 and zero suspicion);
  f. accomplice wish (first fall, grab or box entry of `wishPropIndex`, once);
  g. box (never blocks/falls, swats ignored, `enter`, loafing inside sheds 2x the loaf rate);
  h. mirror cone while its human is BUSY (50 % of move rates, `seen {by:'mirror'}`);
  i. on-camera +50 % (`cam: true`, `prop.onCam`, `s.onCamera`);
  j. tall tree (L3 + orthogonal + facing, 3 swats with `sway`, topple 4 cells, domino on L0/L1, scores from L3);
  k. Napper (NAP state, noise meter, quarter `noise` events, `wake`, yawn TELEGRAPH, LOOK, back to NAP at 40 %;
     the room event freezes the meter);
  l. two humans (`routine2` + `humanSpot2`, one shared meter, the event moves both, `coneCells(s, 1)`).
  n. RunResult adds `wish, stashed, slides, pulls, onCamera, maxNoise, humans`; the timeline adds 🤖 per framing.

## Exported API (`src/sim/index.ts`)

Unchanged signatures: `seedRng nextRng rngInt FNV_OFFSET fnvInt fnvInts encodeInputs decodeInputs InputRun
lineOfSight inBounds cellIndex isOccluding initSim stepSim runToEnd hashState canStep canJump stepTicksFor
CONE_OFFSETS CONE_RANGE NEAR_RANGE inConeOffset looksAt seesCell propPoints finalizeScore rankFor FIRST_TURN_TICK
FTUE_EVENT_TICK coneCells swatTarget sim`. `initSim`/`runToEnd` gained the optional `opts`; `swatTarget(s)` now
returns `SwatTarget = { prop, grab, pull?: 'cloth' | 'cable' }` (superset; HUD can show a "pull" icon).

New: `mirrorConeCells(s, play): Int16Array`, `webcamCells(s, play): Int16Array`, `roombaOf(s): RoombaState | null`,
`noiseOf(s)`, `puddleAt(s, x, z)`, `clothCovers(prop, x, z)`, `cableCell(s, prop)`, `mirrorHuman(s, play)`,
`webcamOn(s, play)`, `inShortCone`, `shortConeSees`, `routineOf(play, idx)`, `stackPoints`, `rulesFor`, `rulesOf`,
`isV5`, `type SimOpts`, `type SwatTarget`, constants `SECOND_HUMAN_LAG_TICKS ROOMBA_BLOCK_PAUSE ROOMBA_CRASH_PAUSE
NOISE_NEAR CLOTH_MAX_PULLS KNOCK_TICKS`.

Render: Roomba position = lerp `(fromX, fromZ) -> (x, z)` by `stepProgress / ROOMBA_STEP_TICKS`; the Roomba prop's
`x/z` follow its target cell. Cloth extent = `prop.x .. x + w - 1`, `prop.z .. z + d - 1` at `prop.level`.

## Tick order

combo window -> (CUDDLED: props land, v5 Roomba drives, cuddle timer, end) -> last call -> humans (index order;
humans[1] after humans[0], same RNG) -> falling props (land in index order) -> **v5 Roomba** -> cat (step end: v5
noise, box entry, slide; then buttons; then movement) -> suspicion -> **v5 noise** (a full meter wakes the napper,
else decay on a quiet tick) -> caught -> tick++ -> end.

## Constants chosen (all integers)

| Constant | Value | Where / why |
|---|---|---|
| Slide step | `STEP_TICKS.trotOrtho` 7 / `trotDiag` 10 | act TROT: counts as movement (suspicion) and as a trot step (noise) |
| Puddle cells | landing, +push dir, +clockwise perpendicular, diagonal | diagonal push: its x and z parts are the axes |
| `ROOMBA_BLOCK_PAUSE` | 15 ticks | cat (cell or from-cell mid-step), human or intact blocking L0 prop in the next loop cell |
| `ROOMBA_CRASH_PAUSE` | 30 ticks | a landing within Chebyshev 1 (max with the current pause) |
| Roomba cadence | starts a new cell on the tick it arrives | one loop cell per `ROOMBA_STEP_TICKS` (24) |
| Framed | +`BONUS.framed` 300, flat (no multipliers) | landing within Chebyshev 1 of the Roomba's current cell, a LOOKing human `looksAt` the Roomba cell (cone or near ring) |
| `CLOTH_MAX_PULLS` | 2 | 2nd pull drops the cloth (`land`, 0 points, current combo) |
| Cable cell | `PropPlacement.cable`, else the cell next to the lamp in `rot` (0 N, 1 E, 2 S, 3 W) | push direction = sign toward the cable cell |
| `KNOCK_TICKS` | 9 | tree topple: a path prop with no lower cell ahead falls over in place |
| Topple stop | first off-grid, L2+ or human cell | tree lands on the last free cell, `FALL_TICKS[3][level]` (18 to the floor) |
| `NOISE_NEAR` | 3 (Chebyshev) | noise x3/2 (floored) near the napper |
| Noise sources | trot step completed 4,000; landing of a jump from L2+ to lower 6,000; break/spill (and a toppled tree) 30,000; other prop landing 12,000 | sneak steps and the cloth drop are silent |
| Wake | at `NOISE.max`, checked before decay | `wake`, TELEGRAPH = one roll of routine.telegraph, look facing toward the cat (no RNG), normal LOOK roll; meter frozen until NAP, then `NOISE.afterWake` |
| Box loaf | `2 x SUSPICION.loafInCone` = -666/tick | while loafing in the box, seen or not (stronger than BUSY decay) |
| Mirror gain | `floor(rate x 50 / 100)`: sneak 666, trot 1,166 | only when no human LOOK sees the cat; idle/loaf in the mirror = normal BUSY decay |
| On camera | `pts + floor(pts x 50 / 100)` | applied to the stack total too; landing cell in the webcam cone (range 5, occluded below L3) |
| `SECOND_HUMAN_LAG_TICKS` | 90 | humans[1]'s first turn = 240 + jitter + 90, so the two do not turn as one |

## Deviations / decisions (for the integrator)

- **Napper and the room event:** any room event of a napper routine freezes the meter (GDD names the alarm, kind 6;
  the sim does not read `room.event`). The event pre-empts NAP like any state; she returns to NAP afterwards.
- **Second human's event:** both humans use `play.routine.eventTick` (one room event), the second walks to
  `humanEventSpot2` (falls back to `humanEventSpot`).
- **Stacks with a soft landing** (book stack, towel stack) also raise the combo by their items (the brief says
  "combo rises by items" for stacks). A stack's items start at `nextCombo`.
- **Cloth vs. swat priority:** a prop on the facing cell wins over bare cloth ("a swat at a prop goes to the prop; a
  swat at bare cloth pulls the cloth"), then cable, then the facing ∓ 1 neighbours, then a grabbable underfoot.
- `land` of the cloth uses the current combo, emits no noise and scores 0.
- **Known v4 quirk kept (not fixed):** a non-fragile prop landing on an intact prop that cannot fall scores "hit" =
  half the *occupant's* points; with a tall tree as the occupant that is 750+. Unchanged in both rule sets.
- `RunResult` v5 fields are filled for rules 4 runs too (derived, harmless).

## Gaps / for other lanes

- Every replay caller (W1-CODEC ghosts, W2-UI-RUN ghost race, render ghosts, share `renderFrames`) must pass
  `{ simVersion: ghost.simVersion }` to `initSim`/`runToEnd`; the default is 5. (Change request filed.)
- W1-CONTENT: the Kitchen rooms place the Roomba at (11,9); if the Kitchen shell gets a `roombaLoop` through that
  cell, v5 dailies get a live Roomba (v4 ghosts keep rules 4). Their validator currently reports "the Roomba at 11,9
  is not on its loop" for `daily-001` (content lane in progress, not the sim).
- No coverage package is installed (`@vitest/coverage-v8` absent); every branch of `scoring.ts` is covered by hand in
  `scoring.test.ts` (clamps, combo branches, stash cap, caught/perfect/clean, default tally, stack cap and 0 items).
- Golden digests run in Node only; the GDD's cross-browser golden (Playwright) is the e2e lane's job.
