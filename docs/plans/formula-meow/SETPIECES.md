# Formula Meow: set pieces (loops, wall rides, jump gaps, tunnels)

Status: plan, 2026-10-20. Branch `feat/formula-meow` (HEAD 55cde0ff, SIM_VERSION 7). Sources: engine scout and
placement scout reports (read-only passes, same day). Related: `GDD.md`, `ITERATION-2.md`, `formula-meow/LANES.md`.

**Engine step: done (SIM_VERSION 8).** The contract the lanes build on is in `formula-meow/LANES.md` ("Iteration 3").
Where the Engine step changed the numbers below, the code is the source of truth:

| Plan | Built | Why |
|---|---|---|
| Ribbon: lead-in 8 m, a circle (R 6.5), lead-out 8 m, ≈ 57 m, k ≈ 0.77; sway ±5 m linear | A teardrop loop (trochoid, R 6.5, forward drift 0.45 R per radian), leads of 12.8 m, sway −4.7·sin θ, `LOOP_LP` ≈ 74.2 m, `LOOP_K` ≈ 0.593 | A vertical circle returns to where it started, so the ribbon could not end 44 m ahead; the loop has to move forward while it turns, and the way up and the way down then cross in side view. The sin sway keeps the two decks 8.5 m apart where they cross and starts and ends at 0 (no swerve into the loop) |
| Deck half width 4.5 m | 3.6 m (sd within ±2 m, plus the kart's 0.8) | The narrower deck fits through the crossing |
| Speed on the rail: normal, floor 0.75 × top; exit 1.2 for 0.6 s | Accelerates to 1.35 × the kart's own top speed (rubber band included), floor 0.75; exit 1.35 for 1.3 s | Lap-time neutral (measured −0.02 to 0.00 s on the stunt lab, all three classes). A global boost would have evened out the field (Kitten podium fell to 75 %) |
| Wall-lane rail: soft | Soft, and a nose pointing into it turns along it | Otherwise grip bled the speed into the rail (31 → 4 m/s) |
| Net trigger: below the far deck by 1.5 m, or 1.5 s in the air | Also when the flight reaches the far deck more than 0.5 m below its edge | It used to pop up onto the deck as a "clean landing" |
| Loop on Kitchen: none (tutorial) | One reference loop at s217 (and the wall at s33 on side +1, the outside of that left-hander) | The Engine step's brief: one reference example of each kind; tracks-A decides the final placement |

Founder request: "improve map, make it more interesting, like tunnels, jump spaces, 360 circles (loop-the-loop), and
wall drives with accelerated options; basically it should be easy to handle as it is, but with more fun things along
the way to attract users".

## 0. Pillar: spectacle with assist

- Every set piece looks thrilling and is never hard. Handling stays exactly as easy as today, and there are no new controls.
- **Acceptance bar:** a phone player at 50cc with auto-gas and one-thumb drift clears every set piece on every track the first time, with zero respawns.
- **Hard limits:**
  - one SIM_VERSION bump (7 → 8)
  - ≤ 120 draw calls and 60 fps on a mid-range phone
  - initial JS ≤ 450 kB gzip
  - procedural low-poly three.js and WebAudio only
  - no feature flags (set pieces are on by default)
- **Never touch:** `funding/`, `landing-poc/`, `swordcat/`, `docs/plans/moba/`, `client/public/tail/mascot*`.

## 1. Architecture decision: flat sim, warped render ("shadow zones")

**Decision.** The sim stays 2.5D. Each set piece is a stretch of the main loop (the "shadow") with special sim rules.
The render warps that stretch into 3D: a loop, a curled wall, a gap with lips, or a tunnel shell.

There is no 3D kart state, no up vector in the sim, and no change to `nearestSample`, the spline, or the arc length.

| Kind | Sim | Render |
|---|---|---|
| **Loop** | **Rail mode.** The kart rides a 1D rail: `su` is metres along the ribbon and `sd` is a lateral offset. Its planar position sits on the shadow straight at `along = su·k`, where `k = Lz/Lp ≤ 1` (shadow length over ribbon length). | A precomputed ribbon table (lead-in, a vertical circle, lead-out, with a sideways corkscrew shift) gives the 3D pose at `su`. |
| **Wall ride** | A flat lane, 6 m wide, beyond the normal edge on one side. It has a mild boost surface, a soft magnet, and a soft outer rail. | The lane curls up a quarter-pipe. The curl angle follows `d`, up to 75°. |
| **Jump gap** | The deck is missing over a main-loop gap (a void). The existing air physics apply, plus a launch floor, an aimed launch, an air magnet, a clean-landing boost, and a catch net. | Lips, the far deck, a glowing landing ring, and a net under the gap. |
| **Tunnel** | No sim change. `tunnelMask` is a build output that only render and juice read. | An arch shell, neon rings, streak strips, a tighter camera, and muffled audio. |

**Why this and not the others.**
- **Full 3D ribbon sim (engine scout option B).** It needs 3D frames in `buildTrack`, a 3D basis in the kart step, and attached-mode exceptions in contacts, items and the camera.
  - Shadow zones get the same feel. The kart is visibly locked to the loop surface ("gravity follows the normal") and keeps its speed.
  - But in shadow zones every sim quantity stays planar. Contacts, items, coins, laps, time-trial checkpoints, branch-ai and hashing keep working as they are.
  - The rail keeps B's best idea: the kart spends real ribbon length in the loop (`su += v·DT`), so the visual speed on the ribbon equals the sim speed. There is no 2–3× warp speed-up at the bottom of the loop, which a pure render warp (placement scout) would cause.
- **Fixed scripted rail (option C).** Rejected: steering must still work.
- **Steep height-field banks (option D).** Deferred. `B12 stepGrade` makes banks steeper than about 17° bump karts, and the wall lane already delivers the "bowl" feel.

**Determinism.**
- The sim is float64 restricted to `+ − × ÷`, `sqrt`, `floor`, the trig lookup table (`sinL`/`cosL`) and the polynomial `atan2L` (`core/sim/fixed.ts`).
- New sim code follows the same rule. It never calls `Math.sin`/`cos`/`atan2`/`pow`, and never uses quaternions.
- The ribbon table, the curl angles and every 3D pose are render-only, so render may use `Math` and three.js freely.
- Entry and exit use the sample-crossing test (`before < i ≤ after`), as the ramp lip does (`kart.ts:403-406`), never float equality.

## 2. Data contract (`src/types.ts`, Engine step)

```ts
/** SIM_VERSION 8: set pieces. Optional, so v1/v2 track codes and authored ghost headers are unchanged. */
export type SetPieceKind = 'loop' | 'wall' | 'jump' | 'tunnel';
export const SET_PIECE_KINDS: readonly SetPieceKind[] = ['loop', 'wall', 'jump', 'tunnel'];

export interface SetPiece {
  kind: SetPieceKind;
  /** main-loop lap fraction 0..255 (like features): loop = zone start, jump = lip, wall/tunnel = start */
  s: number;
  /** wall/tunnel length in lap units (wall 8..20, tunnel 10..26). Loop and jump lengths are fixed in metres (STUNT). */
  len?: number;
  /** wall: -1 left / +1 right (the outer side of the bend), 0 = both sides (half-pipe, straights only). Mirror flips it. */
  side?: -1 | 0 | 1;
  /** jump: gap length m 6..12 (default 10), far deck lower by drop m 0..2.5 (default 0) */
  gap?: number;
  drop?: number;
  /** render skin 0..15 per theme (drum, cat wheel, neon ring, bread bin...); 0 = the theme's default */
  skin?: number;
}

export interface TrackDef {
  // ...existing fields...
  /** SIM_VERSION 8 (iteration 3): loops, wall rides, jump gaps, tunnels on the main loop */
  setPieces?: SetPiece[];
}
```

**Other `types.ts` additions (Engine step only):**
- `Surface.WallRide = 6`
- `BoostSource.Stunt = 7`
- New events:
  - `'stuntEnter'` (a = kind index)
  - `'stuntExit'` (a = kind index, b = 1 clean)
  - `'stuntLand'` (clean landing after a jump; a = air ticks)
  - `'netCatch'`
- `KartState` fields, all appended to `KART_FIELDS` in `hash.ts`:
  - `rail`: 0, or the set-piece index + 1 while on a loop rail
  - `su`: metres along the ribbon
  - `sd`: lateral offset on the rail, in metres
  - `netTicks`: catch-net freeze countdown, 0 = none
  - `gapLaunch`: the index + 1 of the jump the kart launched from, 0 = none; cleared on landing or catch

**`BuiltTrack` additions (`core/track/stunt.ts`, built at the end of `buildTrack`):**
- `pieces: BuiltPiece[]`, where each piece has `{ kind, i0, i1, lenM, side, gap, drop, skin, Lz, Lp, k, landI0, landI1, vAimLen }`.
- `pieceAt: Int8Array`, indexed by main sample: the piece index + 1, including the loop's entry strip and the jump's landing window.
- `gapMask: Uint8Array`
- `tunnelMask: Uint8Array`
- `wallLane: Float32Array`: the extra lane width per sample, signed by side, with tapers.
- The **ribbon table** (`ribbonOf(piece)`) is render-only and lazy. It lives in `core/render/stunt-pose.ts`, never in `BuiltTrack`, so the sim cannot depend on it. It is a pure function of the piece's numbers and the theme.

**Placement and behaviour rules:**
- Authored tracks put `setPieces` in their own track file (`core/track/tracks/<id>.ts`), not in `extras.ts`. This keeps lane ownership clean.
- UGC tracks carry `setPieces` in track code v3 (§10).
- The ghost header is unchanged: authored tracks are referenced by id, UGC by the code.
- Arenas (`kind: 'arena'`) accept only `wall` (side 0, as a half-pipe) and `jump` with `gap: 0`, which is a kicker: a full-width ramp with no void.

## 3. Sim rules with numbers

**Constants.** All new tunables go in a `STUNT` block in `src/tuning.ts`. `g = 22`, `DT = 1/60`, and `top` is the kart's effective top speed (`topScale` × the class top). 50cc top is 24 m/s (32 m/s padded); 150cc top is 32 m/s (about 43 m/s padded).

### 3.1 Loop (rail)

**Geometry.**
- Shadow `Lz = 44 m`, about 12 lap units on a 3.6 m/unit track. It must be straight or a gentle jog: R ≥ 60 m, grade ≤ 5 %.
- Ribbon:

| Part | Size |
|---|---|
| Lead-in | 8 m |
| Vertical circle | R = 6.5 m, 40.8 m |
| Lead-out | 8 m |
| Total `Lp` | ≈ 57 m |

- `k = Lz/Lp ≈ 0.77` (must be ≤ 1; a build assert enforces it, so the `advanceDist` cap holds).
- The ribbon deck is 9 m wide (`halfW` 4.5 m). Corkscrew shift: the lateral offset goes −5 m over the lead-in, through 0 at the top, to +5 m by the end of the circle, then eases back to 0 over the lead-out. The ribbon therefore never meets itself.
- Total height is ≈ 14 m. Nothing may sit within 12 m laterally or 16 m vertically (dressing and the validator).

**Entry strip.** The 10 m before `i0` is a `Boost` surface: the existing pad gives 1.35 for 0.8 s. The build generates it, so authors don't add a pad.

**Attach (entry).**
- When to attach: the kart crosses `i0` on the main loop (`branch == -1`) with `air == 0` and `|d| ≤ halfW`. The full-width walls funnel every kart in.
- An airborne kart over the zone is set down onto the shadow and attached on the same tick. The validator keeps ramps ≥ 30 m away, so this is only a safety net.
- On attach:
  - `rail = idx+1`, `su = 0`, `sd = clamp(d, ±2.0)`
  - `v = max(v, 0.75·top)`, the speed floor
  - an active drift ends and pays its earned mini-turbo at once ("free payout")
  - hop and drift input are ignored until exit
  - emit `stuntEnter`

**Per tick while on the rail.** This replaces `kart.ts` steering, grip, integration, ground follow and the safety checks.
- **Speed.** `v = nextV(v)` with gas or auto-gas, and boosts apply as normal. Brake or no gas never takes `v` below `0.75·top`, so no kart stalls upside down. Gravity does not act on `v`.
- **Ribbon advance.** `su += v·DT`.
- **Steering.** `sd += (steer/7)·2.4·DT` (2.4 m/s at full lock, 0.4× the road feel). With `|steer| < 2` (out of 7), `sd` moves toward 0 at 1.5 m/s.
- **Lateral clamp.** `|sd| ≤ 2.0 m`, which is the **max steer deviation** inside a loop. It is a soft rail: clamp, zero the lateral rate, no `wall` event, no speed loss.
- **Planar pose.**
  - `along = su·k`, and `si`, `s`, `d` come from the shadow samples at `along` (with `d = sd`)
  - `x`, `z` come from the shadow frame
  - `y = py` of the shadow
  - `heading` = the shadow tangent heading
  - `vx, vz = tangent·v` (needed for contacts and continuity), `air = 0`
- **Progress.** `advanceDist` from the new `s`. The step is `k·v·DT`, which is ≤ `v·DT`, so it is monotonic.
- **Immunity.**
  - `applyHit` returns false: projectiles pass and homing items do not target the kart.
  - Item use is buffered in `itemBuf` until exit.
  - Kart-kart contacts between two railed karts only nudge `sd` by up to ±0.3 m, with no speed loss and no spin.
  - Slipstream charge does not build.
  - There are no coin rows or item boxes in zones (the build strips line coins; the validator rejects authored rows and boxes).
- **Suspended:** the fall check, wall pin, progress watchdog, stuck check, and wrong way (`kart.ts:460-503`). `settleAfterPush` never runs on a railed kart.

**Detach (exit).**
- When: `su ≥ Lp`.
- Set the kart at shadow sample `i1` with `d = sd`, heading = the tangent, `vx, vz = tangent·v`, `rail = 0`.
- Then run `queryTrack`, apply an exit boost of 1.2 for 0.6 s (`BoostSource.Stunt`), and emit `stuntExit` with b = 1.

**Timing target.** At 24 m/s the rail takes 2.38 s against 1.83 s to drive the shadow flat, a cost of 0.55 s. The entry pad and the exit boost give it back, so a loop is lap-time neutral within ±0.3 s. A test checks this (§11).

### 3.2 Wall ride (lane)

**Lane.**
- `wallLane` adds `Wl = 6 m` beyond `halfW` on `side`, with 16 m linear tapers at both ends.
- The wall on that side moves out by `Wl`.
- Allowed on bends with 10 m ≤ R ≤ 40 m, on the outer side only. Side 0 (both sides) is allowed on straights only.

**Surface.** `|d| > halfW` on the lane side reports `Surface.WallRide`. It has road grip, and each tick on it calls `applyBoost(Stunt, level 1.15, time 0.25 s)`, refreshed every tick. It leaves a 0.25 s tail and never stacks above `BOOST.cap`.

**Magnet.** On the lane, `d` is pulled toward the lane centre (`±(halfW + Wl/2)`) at 1.0 m/s. The pull is off while steering inward with `|steer| ≥ 4`, so leaving is a clear, deliberate steer. A one-thumb player who holds the turn stays on.

**Outer rail.** The outer rail is soft: clamp `d`, remove the outward lateral speed, emit a graze only (never head-on), and lose no speed.

**Lane end.** The lane tapers in over 16 m (a slope ≤ 1:6) and pushes karts back onto the road without a head-on. Riding the lane is optional:
- The lane's line has a larger radius, so a phone player holding steer takes the corner without drifting. This makes the hardest bends easier.
- The longer path is balanced by the 1.15 boost, to within ±0.2 s of the inside line (test in §11).

**Entry and exit events.** Juice gets `stuntEnter` and `stuntExit` with kind = wall. Entry fires after 0.3 s on the lane, which avoids spam from a brush. Exit fires on leaving, with b = 1 if the kart rode ≥ 70 % of the lane length.

### 3.3 Jump gap

**Layout, along the main loop:**

| Part | Length | Notes |
|---|---|---|
| Run-up | 25 m | R ≥ 40 m, grade ≤ 10 % |
| Lip | at sample `i0` | — |
| Gap | `gap` m (6..12) | `gapMask` = 1. The query reports `py − 14` (the existing `VOID_DROP`) across the full width |
| Far deck | — | `drop` m lower |
| Landing window | ≥ 16 m | `landI0..landI1` |

- The side walls continue across the gap as invisible rails, rendered as glass posts, so a kart cannot leave sideways.
- Bank is forced to 0 from the run-up end through the landing window.

**Launch (crossing the lip forward at any speed).**
- `vh = max(v, vFloor)` with `vFloor = 0.75·top` (18 m/s at 50cc).
- The heading error to the tangent is clamped to ±10°.
- **Aimed arc.** With `Laim = gap + 5 m` (the landing target is 5 m past the far lip):
  - `T = clamp(Laim/vh, 0.55, 1.0)` s
  - `vy = (g·T²/2 − drop)/T`
  - Every kart at or near the floor lands on the target. Fast karts land at `vh·0.55 s`, still inside the landing window (the validator checks it at 43 m/s).
  - Example: gap 12, drop 1.5, `vh` 18 → T 0.944 s, vy 8.8 m/s, apex ≈ 1.8 m.
- Set `gapLaunch = idx+1` and emit `ramp`. The trick-tap window (`BOOST.trick`) still applies.

**Air magnet** (while `air > 0` with `gapLaunch` set):
- `d` moves toward the racing line at the landing target at 3 m/s.
- `heading` turns toward the tangent at 2 rad/s.
- Air steering still adds on top.

**Hit immunity.** While `gapLaunch` is set, `applyHit` returns false and contacts are skipped (`|dy|` is usually > 1.6 already).

**Clean landing.** Landing in the window with `|heading error| ≤ 25°` and `spinTicks == 0`:
- applies `applyBoost(Stunt, 1.2, 0.5 s)` and emits `stuntLand`
- stacks with the trick boost up to `BOOST.cap`

**Catch net.** This is the always-safe fallback.
- **Trigger:** over `gapMask` and either `y < farDeckY − 1.5` or `airTicks > 90`. It also covers reversing into a gap from the far side.
- **Effect:**
  - `netTicks = 24` (0.4 s): the kart is frozen and the render shows a net bounce
  - then it is placed at the far lip + 4 m, with `d` clamped to ±2 m of the racing line and heading = the tangent
  - `v = 0.7·top`, `invTicks = 30`, `gapLaunch = 0`, and `netCatch` is emitted
- The placement uses the respawn `pend` path in `tracks/hazards/rules.ts` with a new code `net`, which sets `si`, `s` and `dist` consistently.
- **Penalty:** ≤ 0.8 s against a clean jump by the same kart, enforced by a test. A kart is never sent back to a fork.
- **The Yarn branch gap moves to the same rules** (launch floor, aimed arc, magnet, net), replacing "back to the fork". On branches `vFloor = 0.7·top`, and tracks-B tunes `gap`/`drop` so the shortcut gains about 0.6 s.

**Kicker** (arena `jump` with `gap: 0`): a full-width ramp, the existing ramp code with an aimed `vy` for 0.6 s of air. There is no void and no net.

### 3.4 Tunnel

- No sim change, no hashed state.
- `tunnelMask` is 1 on `[i0, i1]` and is read by render and juice from `k.si` (and from the branch map, if a tunnel is on a main-loop stretch shared by a branch window; the validator forbids that).
- Boost pads inside a tunnel use the existing `pad` feature.

### 3.5 Respawn inside a piece

- A forced respawn inside a loop zone places the kart 8 m before the entry strip on the centre line at `0.75·top`, and it re-enters.
- On a wall lane, the normal hand sets the kart on the road line.
- In a jump gap, the net applies.

## 4. AI behaviour (ai-ugc lane)

- **Loops:**
  - AI steer is 0 inside the rail; auto-centre does the work.
  - No new drift may start within 20 m of a loop's entry or a jump lip (one check next to the ramp check at `driver.ts:211`).
  - Items are not thrown at railed or `gapLaunch` karts: `item-brain` skips immune targets.
- **Wall ride:** AI with `skill ≥ padSkill` (0.5) targets the lane centre on the stretch, through a second line (`lineWall`) built from `wallLane`. Lower skill drives the normal line, so the field spreads visually.
- **Jumps:**
  - Aim the racing line at the landing target.
  - Skill ≥ 0.6 taps a trick at the lip with the existing timing; lower skill does not.
  - No brake within 25 m of the lip.
- **Branch AI.** `tBranch` counts rail time `Lp/v`, the entry pad and the exit boost, and the wall boost. Route choices stay balanced:
  - Rooftops: alley against loop, within 0.3 s.
  - Yarn: gap shortcut gains about 0.6 s.
  - A build-time assert: no piece inside a branch fork or merge window.
- **Rubber band and autopilot.** The rubber band is unchanged. `autopilot.ts` (the phone auto-steer and the test bot) follows the same rules as the AI driver at skill 0.

## 5. Progress, laps and positions

- Laps, places, time-trial checkpoints and the B4 "progress jump" metric all read `dist`/`s`.
  - **Rail:** `s` advances by `k·v·DT` (k ≤ 1), so the step is monotonic and inside the `advanceDist` cap.
  - **Jumps:** air uses the normal query. The net placement goes through the `pend` path, so `dist` jumps by at most `gap + 4 m`, and B4 allows this for `netCatch` only.
- **Validator spacing** (applies to authored tracks too, by test):
  - the start line ≥ 40 m from any piece
  - pieces ≥ 10 m apart (end to the next start, including the loop entry strip; authored only)
  - UGC: ≥ 40 m apart
- Every kart traverses every mandatory piece (loop, jump), so order inside them is preserved. A wall ride is a lane, not a route.
- Wrong way and the watchdog are suspended only while `rail > 0` or `gapLaunch > 0`.

## 6. Ghosts, replays and versions

- **The Engine step bumps `SIM_VERSION` from 7 to 8, once.** No lane after it touches `SIM_VERSION`.
- Regenerate the golden hash (`core/sim/race.test.ts`) and the `ghost-codec` fixtures.
  - Lanes may update the golden hash on their branches.
  - The integrator regenerates it after the last merge, as in iteration 2.
- Old v7 ghost links already fall back to a target-time race (`share/index.ts:183`, `ghost-runner.ts:107`). Old time-trial records stay as previous-version records (`modes/flow.ts:537-547`).
- `replay.ts` needs no format change, since inputs are unchanged.

## 7. Render rules

**Kart pose** (Engine step: `core/render/stunt-pose.ts` new, `race-view.ts`, `kart-view.ts`):
- `stuntPose(track, k, alpha)` returns position plus a basis (T, U, R), or null.
  - **Loop:** the ribbon table sampled at the interpolated `su` and `sd`.
  - **Wall ride:** the curl.
    - `φ = 75°·clamp((|d| − halfW)/(Wl − 1), 0, 1)`
    - lateral offset `= halfW + Rq·sin φ`, height `= Rq·(1 − cos φ)`, with `Rq = 3.8 m`
    - roll = φ toward the wall
- `KartView.update` gains an optional basis path (`Matrix4.makeBasis` → quaternion on the root). The Euler path stays for every other case.
- The ground shadow ring is hidden when the kart is > 1.5 m from the shadow deck.
- Projectiles and coins in zones stay on the shadow. They visibly pass under the loop, which matches the sim's immunity.

**Meshes** (Engine step builds the generic geometry; the track lanes add skins):

| Piece | Geometry | Draw calls |
|---|---|---|
| Loop | Ribbon deck: 96 segments × 4 verts; rails; glow chevrons and an edge strip. The shadow road under the zone is still drawn (it is the floor) | 0 (merged into `track-solid` and `track-glow`) |
| Wall ride | The curled lane: 8 facets across the quarter-pipe; the barrier at the top; chase-light strip | 0 |
| Jump | No road deck over the gap; lip faces (`mesh.ts:298-309` pattern); glow landing ring; far-lip chevrons | 0, plus the net (shared, below) |
| Tunnel | Arch shell (8 facets around, a segment every 2 m, ceiling 6.5 m above the road); neon ring every 6 m; 2 streak strips | 0 (shell into solid, rings and strips into glow) |
| Approach cue | Cyan chevrons on the road 40 m before each piece; an entry arch | 0 |
| Moving skins (drum shell, cat wheel, cat flap) | One merged mesh per track for all animated parts, rotated per part by vertex groups → one `InstancedMesh` or a group | ≤ 1 per track |
| Nets and glass rails | One merged transparent mesh per track | ≤ 1 per track |

- **Budget:** at most 2 extra draw calls per track. The validator's per-track limits (§10) cap the vertex growth to ≈ 20 k verts.
- The perf HUD (`juice/perf/quality.ts`) must show ≤ 120 calls on the busiest track at 8 karts. The low-quality tier drops the tunnel rings' glow and the nets' transparency.
- **Dressing:** props avoid piece footprints: the loop ±12 m laterally and 16 m up, the wall lane and 4 m beyond, the tunnel shell, and the landing zone. Each `dressing/<track>.ts` calls a shared `pieceClear(track, x, z)` helper that the Engine step adds to `dressing/common.ts`.
- **Mirror** flips the corkscrew sign, the wall side and the curl. The sim gets the flip through `side`.

## 8. Camera rules (juice lane, `core/camera/chase-camera.ts`)

- **Loop (default):**
  - Position `= kartPos − T·6.0 + U·2.6`, using the ribbon basis.
  - `cam.up` is slerped to U with a 0.15 s time constant and capped at 240°/s.
  - Roll about the view axis is capped at **10°** (only the corkscrew shift causes any). The loop is a pitch rotation, which is the comfortable axis.
  - FOV +6°.
  - The wall and floor clamps (`:225`, `:230`) are skipped while railed.
  - Return to world up over 0.3 s after exit.
- **Loop (reduced motion, `reducedMotion()`):**
  - A fixed "TV cam" beside the loop: the loop centre + 14 m on the side away from the corkscrew, world up, looking at the kart.
  - Hard cut in at entry and out at exit (cuts, not swoops). No FOV kick.
- **Wall ride:**
  - Camera roll is 0.5·φ, capped at **35°**, with a 0.2 s time constant.
  - The camera stays on the road side of the kart.
  - Reduced motion: roll 0.
- **Jump:**
  - Camera height +1 m; look-at blends 40 % toward the glowing landing ring; FOV +4°.
  - On landing, a 0.15 shake (none in reduced motion).
  - Net: the camera holds its position and looks at the kart (no shake).
- **Tunnel:**
  - FOV −5°, distance −0.5 m, height −0.3 m.
  - Camera y is clamped to ≤ ceiling − 1.0 m.
  - Blended over 0.25 s at the portals.

## 9. Audio, FX, announcer and HUD cues (juice lane)

| Cue | Loop | Wall ride | Jump | Tunnel |
|---|---|---|---|---|
| Approach | Chevrons glow 40 m before; minimap icon | Chase lights start running | The landing ring pulses | Portal lights brighten |
| Announcer (`hud.say`, low priority, never over "Final lap") | "LOOP-DE-LOOP!" (on the first entry per race only) | "WALL RIDE!" | "BIG AIR!" (existing), "NICE LANDING!" on `stuntLand` | "TUNNEL RUN!" (first only) |
| SFX | Rising whoosh tied to `su/Lp`; exit boost sting | Tyre hum; squeal muted | Lip whoosh, then a landing thump plus sparkle; net: a soft "boing" and a cushion puff | Music low-pass to 900 Hz in 0.25 s; 120 ms echo (feedback 0.25, wet 0.3) on the sfx and engine buses; engine +3 dB; whoosh at the exit |
| VFX | Speed lines on; pink and cyan ribbon trail | Spark trail on the rail side | Dust ring on landing; confetti puff on a clean landing | Streak strips (light scroll speed ∝ v); speed-lines strength +30 % |
| Haptics | Light on exit | – | Light on landing; medium on a net catch | – |
| Reduced motion | No trail strobe | No sparks | No shake | No flicker or scroll; static strips |

- **Tunnel triggers** come from `tunnelMask[k.si]` (only for the player kart); there is no sim event.
- The audio echo is a `DelayNode` with a feedback gain, a sibling of `pauseLp` (`race-audio.ts:101-111`).
- **Minimap and HUD.** Icons on the minimap (loop ring, wall arc, gap marks, tunnel bar). A results-screen stat "Stunts: N" counts `stuntExit` with b = 1 and `stuntLand`, client-side from events. It is not a sim field and not hashed.

## 10. Editor stickers, codec and validation (ai-ugc lane)

**Stickers.** Four new stickers in the Track Doodle tray: Loop, Wall ride, Jump and Tunnel. They are dropped onto the drawn loop and snap to `s`.

| Sticker | Footprint | Side | Limit per track |
|---|---|---|---|
| Loop | 10 m strip + 44 m zone | — | 2 |
| Wall ride | 50 m | Auto-flipped to the bend's outer side. Side 0 (half-pipe) on a straight | 3 |
| Jump | 25 m run-up + 10 m gap + 18 m landing | `gap`/`drop` steppers: gap 6–12 m in 1 m steps, drop 0–2.5 m in 0.5 m steps | 3 |
| Tunnel | 60 m (stretchable 40–90 m) | — | 3 |

- **All set pieces:** at most 6 per track, inside the 24-sticker limit.

**Codec v3** (`ugc/codec/track-code.ts`):
- Write v3 only when `setPieces` is non-empty, so v1 and v2 codes stay byte-identical.
- The feature section is unchanged (3-bit kinds).
- A trailing section is added: `count` (3 bits), then per piece `kind` 2 bits, `s` 8 bits, `side` 2 bits, and `param` 8 bits:
  - wall/tunnel: `len`
  - jump: `gap−6` (3 bits) and `drop·2` (3 bits)
  - loop: 0
  - then `skin` 4 bits
- CRC as today. The decoder rejects unknown kinds with the existing "bad code" path.

**Validation** (`ugc/editor/validate.ts`, new issue codes; the same rules run on authored tracks in a test):
- `loopBend`: R ≥ 60 m and grade ≤ 5 % over [−15 m, +55 m].
- `loopClear`: no other road part within 12 m in plan unless it is ≥ 18 m above or below.
- `wallBend`: 10 ≤ R ≤ 40 m, outer side. The ends are ≥ 40 m from a junction. No lowgrip, offroad or hazard on the lane. `minGap` is clear beyond the extra 6 m.
- `jumpLine`: R ≥ 40 m and grade ≤ 10 % over the run-up, gap and landing.
  - No hazard, lowgrip, offroad, item row or ramp in the landing window.
  - `gap + 5 ≤ vFloor50·1.0 s` (that is, gap ≤ 13 m).
  - Landing length ≥ `43 m/s · 0.55 s − gap + 3 m`.
- `tunnelLen`: 40–90 m, R ≥ 15 m. No ramp, jump or loop inside or within 10 m of the exit. Any road above or below is ≥ 6 m away vertically. It does not cover the start line.
- `pieceSpacing`: start line ≥ 40 m from any piece; pieces ≥ 40 m apart; no piece inside a branch fork or merge window or the 15 m flattening window; ramps ≥ 30 m before a loop entry.
- `pieceCount`: the per-kind and total limits above.
- **Drive check** (extends `ugc/editor/drive.test.ts`). One headless lap of the 50cc autopilot with auto-gas through the deterministic sim, about 2,300 ticks and a few milliseconds. It fails, with the offending piece painted red, on:
  - any respawn
  - any `netCatch`
  - a stall (v < 3 m/s for > 1 s)
  - a loop entered below the floor

## 11. Tests

**Engine:**
- `core/track/stunt.test.ts`:
  - masks and `pieceAt` built correctly
  - `k ≤ 1`
  - continuity at `i0`/`i1`
  - Mirror flips the side and the corkscrew
  - the asserts fire on overlaps with branch windows, ramps and the start
- Kart rules, on a synthetic track with one of each piece:
  - rail entry, floor, `|sd| ≤ 2`, and exit boost
  - no wrong-way or watchdog during the rail
  - hit immunity on the rail and in jump air
  - wall-lane boost, magnet and soft rail (no head-on)
  - aimed arc lands within ±1.5 m of the target for v ∈ {0, 8, 18, 24, 32, 43} m/s and drop ∈ {0, 1.5, 2.5}
  - clean-landing boost
  - net catch at ≤ 0.8 s penalty against a clean jump
- Golden hash regenerated, and a replay round trip on a track with every piece.
- Determinism: the same seed and inputs give the same hash 3 times, also with the Mirror flag.

**Tracks:** each authored track passes the §10 validator (the `tracks.test.ts` extension), plus the harness acceptance below.
- `tracks/harness.ts` acceptance, run with `playerBot` at skill 0.2, 50cc, auto-gas, steering noise, 3 seeds:
  - zero respawns, zero `netCatch`, zero DNFs
  - zero head-on walls inside pieces
  - zero B4 progress jumps (except a net, which shouldn't happen)
  - every piece entered and exited by every kart
- Lap-time neutrality: a loop costs within ±0.3 s; wall line against inside line within ±0.2 s.
- Branch balance: Rooftops alley against loop within 0.3 s; Yarn shortcut gains 0.4–0.8 s.

**AI:**
- `ai.test.ts`: no drift start within 20 m of a loop or lip.
- `item-brain` skips immune targets.
- The skill ≥ 0.5 AI uses the wall lane at least 80 % of the time; the skill 0.2 AI uses it at most 30 %.
- Branch-ai `tBranch` includes the stunt terms.

**UGC:**
- Codec round trip v1, v2 and v3. A v1 or v2 code with no pieces stays byte-identical.
- Every new validator code, with positive and negative cases.
- Drive-check failure paints the piece.
- `e2e/editor.spec.ts`: drop each sticker, the validator responds, then test-drive.

**Juice:**
- `audio.test.ts`: tunnel low-pass and echo node graph present and restored.
- Camera unit tests:
  - loop up-vector rate ≤ 240°/s
  - roll ≤ 10° in a loop and ≤ 35° on a wall
  - reduced motion gives the TV cam and roll 0
- Callouts don't override "Final lap".

**E2E** (`e2e/setpieces.spec.ts`, ai-ugc): for each of the 6 tracks at 390×844, 50cc, `bot=1`:
- finish 3 laps
- assert from the event log: ≥ 1 `stuntExit` per loop and per lap, and every jump landed with no `netCatch`
- screenshot one frame inside a loop, on a wall and in a tunnel
- draw calls ≤ 120 from the perf HUD

**Gate before commit:** `npx tsc --noEmit`, `npx vitest run`, `npm run build` (budget ≤ 450 kB), `npm run e2e`, `npm run build:client` (commit `client/public/formula-meow-game`).

## 12. Per-track placement

- **Units.** `s` is the lap fraction 0..255 from point 0, as in `features`.
- **Order:** ★ is mandatory (every kart drives it); ○ is optional (a lane, or on one route).
- **Final numbers:** each lane confirms them against the built track. The §10 validator is the judge, and the lane may move a piece by up to ±4 units to pass.

### Kitchen Counter (tracks-A; the FTUE, gentlest)

| # | Piece | Where | Notes |
|---|---|---|---|
| K1 ★ | Tunnel "bread bin" | s196–210, 50 m on the bottom straight | Pad moved into it at s205. The toaster (s214, right) pops as you exit; exit chevrons point left. Pad s222 and ramp s236 kept |
| K2 ★ | Jump "sink gap" | Lip s118, gap 12 m, drop 1.5 m, landing s123–128 (≥ 16 m) | Replaces the ramp at s119. Both routes feed it. Dish-towel net; water shimmer below |
| K3 ○ | Wall ride "mixing bowl" | s38–52, outer side −1 of the tutorial hairpin | Ends before the crumb-cut fork's flattening window (about s55). Turns the hardest corner into a hold-steer ride |

### Neon Rooftops (tracks-A)

| # | Piece | Where | Notes |
|---|---|---|---|
| R1 ○ | Loop "neon ring" | Zone s244–256, entry strip s240–243 | On the long way that coexists with the billboard cut (branch 211→4). The pad from s250 moves into the strip. Exit 14 m before the merge at s4. The 14 m ring reads from the bottom straight. Loop against alley within 0.3 s |
| R2 ○ | Wall ride "LED billboard" | s222–236, outer side −1 of the R15 right-hander | Combo into R1: ≥ 10 m before the R1 strip |
| R3 ★ | Jump "roof to roof" | Lip s185, gap 11 m, drop 1.5 m, landing s190–197 (25 m) | The ramp at s176 stays (≥ 20 m before the lip). Laundry-line net. Makes the header's "chimney jumps" promise true |
| R4 ★ | Tunnel "air duct" | s96–110 | After the pad at s92. Magenta strips; city glow at the exit |

Nothing else goes in s200–s4.

### Laundry Spin (tracks-A)

| # | Piece | Where | Notes |
|---|---|---|---|
| L1 ★ | Loop "drum" | Zone s66–78, entry strip s62–65 | Replaces the drum hazard at s68. The drum shell rotates (render only, by tick). The `drum` kind code stays; the sheet hazard at s122 keeps "≥ 1 hazard per track" true. The porthole swallows the pack. **This is the player's first loop (race 2).** |
| L2 ★ | Jump "folding table" | Lip s166, gap 12 m, drop 2.3 m, landing s171–181 | Towel-pile net. The ramps at s136/s150 stay on the table |
| L3 ○ | Wall ride "dryer row" | s191–207, side +1 (confirm the wall side when building) | On the long way that coexists with the soap slide (180→246). Items at s196 stay on the flat road |
| L4 ★ | Tunnel "shirt rack" (optional if over budget) | s32–42 | ≥ 15 m clear of the off-road verge at s22. Hanging-shirt curtains |

### Yarn Canyon (tracks-B)

| # | Piece | Where | Notes |
|---|---|---|---|
| Y0 | Fix the yarn-ball branch gap (`extras.ts`) | — | §3.3 rules plus a yarn hammock net; never back to the fork. Shortcut gain about 0.6 s |
| Y1 ★ | Tunnel "mesa" | s24–36 | After the thread pads at s14/18/22. Items move from s34 to s38. You exit onto the needle bridge with the sunset ahead |
| Y2 ★ | Jump "needle-bridge strand" | Lip s56, gap 10 m, flat, landing s61–66 (17 m) | Inside the bridge void range s50–66: soft side rails over the gap and landing, so the void edge is not live during the jump |
| Y3 ○ | Wall ride "canyon wall" | s148–160, outer side −1 of the R19 right-hander | On the switchbacks (107→177), after the steam at s142 |

### Cat Café Chaos (tracks-B; dark theme, bright emissive skins)

| # | Piece | Where | Notes |
|---|---|---|---|
| C1 ★ | Tunnel "cat tree" | s198–212 | Sisal walls, glowing cat eyes, warm strips. Items at s198 at the entrance |
| C2 ○ | Wall ride "coffee-cup half-pipe" | s146–158, outer side −1 of the R10 right-hander | On the long way that coexists with the kitchen pass (121→179) |
| C3 ★ | Jump "koi pond" | Lip s104, gap 12 m, drop 0.8 m, landing s109–115 (≥ 16 m) | The pad at s112 is removed; the clean-landing boost replaces it. Lily-pad net. The launch floor covers roomba hits at s100 |
| C4 ★ | Loop "mug handle" (optional) | Zone s220–232, strip s216–219 | Replaces the ramp at s216. The roomba moves from s236 to s242. Drop it if the café exceeds the draw-call budget |

### Pink Paw Shelter Sprint (tracks-B; the finale, cosy and generic, no kennels)

| # | Piece | Where | Notes |
|---|---|---|---|
| S1 ★ | Loop "cat exercise wheel" | Zone s70–82, strip s66–69 | On the 100 m climb; the wheel turns as you ride (render). Exit ≥ 20 m before the cat-tree ramp at s88. The trailer shot |
| S2 ★ | Tunnel "cat flap" | s106–118 | After the items at s104; the flap swings up on approach (render). Into the pad at s128 |
| S3 ★ | Jump "cushion hop" | Lip s205, gap 8 m, flat, landing s209–222 | Replaces the ramp at s212. Blanket net; sleeping baskets as dressing |
| S4 ○ | Wall ride "carpet scratch wall" | s154–166, outer side −1 of the R10 right-hander | Coexists with the play-room branch (139→187); starts after the fork window (about s153) |

### Living Room Rug arena (tracks-B, only if it fits)

- One kicker (`jump`, `gap: 0`) on the open floor.
- One sofa-cushion half-pipe (`wall`, side 0) along a straight stretch of the frame ring.
- Battle rules are unchanged, and kicker air gives hit immunity only as normal air does.
- If this adds more than 1 draw call or breaks `rug` battle tests, ship the kicker only.

## 13. Lanes and strict file ownership

**Order:** Engine (sequential, alone) → 4 parallel lanes → integrator merge, in the order tracks-A → tracks-B → ai-ugc → juice. Then regenerate the golden hash, run the full gate and `build:client`, and make one commit per lane on `feat/formula-meow`. Do not push or merge `main`.

**Contract requests.** A lane that needs a change outside its files writes a contract request in its report, and the integrator applies it. No lane edits `SIM_VERSION`, `types.ts` or `hash.ts`.

### Engine step (one agent; may touch frozen files)

**Files:**
- `src/types.ts` (§2), `src/tuning.ts` (`STUNT` block), `src/core/sim/kart.ts`, `src/core/sim/contact.ts`, `src/core/sim/hash.ts`, `src/core/sim/race.test.ts`
- `src/core/track/stunt.ts` (new), `src/core/track/stunt.test.ts` (new), `src/core/track/build.ts`, `src/core/track/query.ts`, `src/core/track/mesh.ts` (generic geometry for all 4 kinds), `src/core/track/racing-line.ts` (`lineWall`), `src/core/track/dressing/common.ts` (`pieceClear`)
- `src/tracks/hazards/rules.ts` (the `net` pend code, the branch-gap net)
- `src/core/render/stunt-pose.ts` (new), `src/core/render/kart-view.ts` (basis path), `src/core/render/race-view.ts` (pose and shadow hide)
- `src/tracks/skins/{index,a,b}.ts` (new: a `registerPieceSkin(theme, kind, skin, builder)` registry; `a.ts`/`b.ts` stubs pre-wired in `index.ts`)
- `src/share/codec/ghost-codec.test.ts` fixtures
- `formula-meow/LANES.md` (iteration 3 section)
- `SIM_VERSION` 8

**Deliverables:**
- Every rule in §3.
- A synthetic test track `stunt-lab` (test-only, in `stunt.test.ts`).
- Camera left in its old behaviour (juice adds the rest).
- A green gate.

### tracks-A (Kitchen, Rooftops, Laundry)

**Owns:**
- `src/core/track/tracks/{kitchen,rooftops,laundry}.ts` (`setPieces`, moved features and hazards)
- `src/core/track/dressing/{kitchen,rooftops,laundry}.ts`
- `src/tracks/skins/a.ts` (bread bin, sink net, mixing bowl, neon ring, billboard, duct, drum, folding table, dryer row, shirt rack)
- `src/tracks/setpieces-a.test.ts` (new: validator plus harness acceptance for its 3 tracks)

**Does not touch:** `extras.ts`, `tracks.test.ts`, `e2e/tracks.spec.ts`. Request changes to those through the integrator.

### tracks-B (Yarn, Café, Shelter, Rug)

**Owns:**
- `src/core/track/tracks/{yarn,cafe,shelter,rug}.ts`
- `src/core/track/tracks/extras.ts` (the Yarn gap retune; only tracks-B edits it)
- `src/core/track/dressing/{yarn,cafe,shelter,rug}.ts`
- `src/tracks/skins/b.ts` (mesa, strand, canyon wall, cat tree, cup half-pipe, koi pond, mug handle, cat wheel, cat flap, cushion hop, scratch wall, rug kicker and half-pipe)
- `src/tracks/setpieces-b.test.ts` (new)

### juice (camera, VFX, audio, announcer, HUD callouts, tunnel lighting)

**Owns:**
- `src/core/camera/**`
- `src/juice/**`: `audio/` (tunnel low-pass and echo, stings, announcer lines), `vfx/` (new `tunnel-fx.ts`, `stunt-fx.ts`), `perf/`, `feel.ts`, `haptics.ts`, `index.ts`
- `src/core/hud/**` (callouts, minimap icons, the "Stunts" result row through `registerResultSection`)
- `src/ui/strings/core.en.ts` (announcer and HUD strings)
- `src/ui/screens/settings.ts`, only if a "loop camera: follow / steady" option is added. It defaults to follow, and reduced motion forces steady.

**Reads:** `stunt-pose.ts` and the events. It does not edit `race-view.ts` or `kart-view.ts`; it requests changes through the integrator.

### ai-ugc (AI through set pieces, editor stickers, codec, validation)

**Owns:**
- `src/items-ai/**` (driver, item brain, balance bots)
- `src/core/sim/autopilot.ts`
- `src/core/track/branch-ai.ts`
- `src/ugc/**`: `codec/track-code.ts` v3, `editor/TrackDoodle.ts` stickers, `editor/validate.ts`, `editor/drive.test.ts`, `editor/doodle.ts`
- `src/ui/strings/tracks.en.ts` (sticker labels, validator messages)
- `e2e/setpieces.spec.ts` (new) and `e2e/editor.spec.ts`

**Note:** `validate.ts` exports a `validateSetPieces(def)` used by the track lanes' tests. The Engine step creates a stub with that signature, so the lanes compile before ai-ugc fills it in.

## 14. Known issues to mention, not fix silently

- Laundry: L1 removes the only authored `drum` hazard. The kind stays registered.
- Yarn: the branch gap today sends a kart back to the fork. Y0 replaces this with the net.
- Kitchen: K3 sits close to the crumb-cut fork window.
- Rooftops: the header says "two chimney jumps" but the track has plain ramps. R3 fixes this.
- The brief says "integer fixed-point", but the sim is restricted float64 (`core/sim/fixed.ts`). This plan keeps that rule.

## 15. Playtest fixes (SIM_VERSION 9)

Two playtests of iteration 3 (fun-ease and bugs-perf, 2026-10-20) led to these changes. Old ghosts and links open as a target-time race, as with any version bump.

**Sim (SIM_VERSION 9):**
- Jump gaps have hang time. Every gap flight now peaks `STUNT.jump.apex` (2.2 m) over the lip: about 0.9 s over a flat gap, longer over a drop. The forward speed in the air keeps the landing inside the window, and the run-up speed comes back on landing (`KartState.gapV`). Kickers keep the old aimed arc.
- Wall lanes draw karts in. A kart in the outer `drawShare` (40 %) of the road on the lane's side slides onto the lane at `drawIn` (3 m/s) unless it steers inward. On the lane the boost is 1.3, the kart is carried along the road by the extra way round the bend (at most `carryMax` of its own move), and a clean ride pays an exit boost (1.35 for 1 s). The lane now gains 0 to 0.45 s at 50cc against the racing line. The AI lane cost counts the carry. The AI skips a lane that sits inside a branch's fork-to-merge window (Shelter, Café) or on the inside of its bend, keeps braking for the bend until it is on the lane, and never steers for a lane while heading for a branch.
- Railed karts that the lateral limit cannot separate spread along the ribbon (`alongPush`). Two karts in the same gap flight are pushed apart sideways.
- A kart rolling backwards off a gap's far lip stops at the lip. Before this, holding brake reversed it into the net again and again.
- Tunnels emit `stuntEnter` / `stuntExit` (a = 3) and feed the stunt combo. Each tunnel has a full-width boost pad in the middle.
- Rug: the kicker moved from s192 to s128, across the rug from the grid. Rooftops: the billboard cut is off-road (a boost shortcut), so the loop is the racing line.

**Render and camera:**
- The loop pose takes forward from the offset path, so a kart off the centre line no longer crabs. Outside 0..LOOP_LP the ribbon continues as the shadow road, so the loop camera no longer drops to deck height for the first 7.5 m.
- On the rail, the camera's up turns at the pitch rate (speed / R × 1.5, τ 0.06 s) and keeps that rate for 0.6 s after the exit.
- The wall-lane rig stays within the lane at its own sample, is kept inside the walls, and sits 0.7 m higher.
- Readability cues are drawn on top of any skin. Jumps get kicker fins, deck stripes, an entry arch and a dark void under the gap. Wall lanes get run-in arrows and a boost strip.
- Touch devices are capped at DPR 1.5. The e2e tests run on the Metal GPU on macOS.
- When the ±8 search finds no valid spot for an editor sticker, the snap searches the whole lap.

## 16. What shipped (iteration 3, SIM_VERSION 9)

All four piece kinds are in the game on `feat/formula-meow`, with the §15 playtest fixes. Positions are `s` (lap
fraction 0..255) as built; the lanes moved some pieces from the §12 plan to pass the validator.

| Track | Loop | Wall ride | Jump gap | Tunnel |
|---|---|---|---|---|
| Kitchen Counter | s217 | s177, 16 units | s116, gap 12 m, drop 1.5 m | s196, 14 units (bread bin) |
| Neon Rooftops | s244 (the racing line; the billboard cut is off-road) | s123, 13 units | s186, gap 11 m, drop 1.5 m | s96, 14 units (air duct) |
| Laundry Spin | s66 (the drum, race 2: the first loop) | s208, 12 units | s168, gap 12 m, drop 2 m (a share code stores 0.5 m steps) | s35, 9 units (shirt rack) |
| Yarn Canyon | none | s148, 12 units, side +1 | s56, gap 10 m, flat | s24, 12 units (mesa) |
| Cat Café Chaos | s220 (mug handle) | s146, 12 units, side +1 | s104, gap 12 m, flat (koi pond) | s198, 14 units (cat tree) |
| Pink Paw Shelter Sprint | s74 (exercise wheel) | s154, 12 units, side +1 (main route; the AI takes it only off the play-room branch) | s205, gap 8 m, flat (cushion hop) | s106, 12 units (cat flap) |
| Living Room Rug (battle) | – | – | kicker at s128 (`gap: 0`) | – |

- **Assist.** Loops and wall lanes hold the kart to the surface (the sim stays flat: shadow zones, §1). Jump gaps have
  2.2 m of hang time, an air magnet toward the racing line, a clean-landing boost and a catch net that sets the kart
  down 4 m past the far lip at 70 % of top speed. Each tunnel has a full-width boost pad, light streaks, a tighter rig,
  a FOV kick and a low-pass echo on the music. No new controls.
- **Editor.** Track Doodle has Loop, Wall ride, Jump and Tunnel stickers. Track code v3 carries them; v1 and v2 codes
  still open, with no set pieces.
- **Versions.** Dares, ghosts and records stamped SIM_VERSION 7 or 8 open as a target-time race with the "another
  version of the game" notice; SIM_VERSION 9 dares race the ghost.
- **Checks.** `npx tsc --noEmit`, `npx vitest run`, `npm run build` (budget), `npm run e2e` (the phone bot clears every
  piece for 3 laps without a net on all 6 tracks), and `npm run review:v3`: every piece frozen mid-piece on all 6 tracks
  at 1440x900 and 390x844 (`formula-meow/review/v3/<size>-<track>-<piece>.png`, gitignored), old dares and track codes,
  and editor stickers through a share link into a fresh browser context. Peak draw calls during the pieces: 48–70
  (budget 120).

**Final review (2026-10-21) findings:**
- No game defect found in the 46 set-piece screenshots or the probes behind them. The failures were in the review
  harness, which teleports the bot onto each wall lane, and are fixed there: Shelter's wall shot came in lap 3, where
  the bot takes the play-room branch (shots now go in track order); a fixed +5.2 m offset sat past Shelter's narrow
  lane and the bot's own heading flew it off (now 60 % into the lane, velocity along the road); the teleport left the
  camera to chase 17 m through the Yarn canyon rock (now a camera cut); Laundry's kart was set below the lane's curl,
  a step it cannot climb, and lost 80 % of its speed (now dropped from 3 m); and the desktop stadium stroke ended more
  than `CLOSE_DIST` (40 m) from its start, so the editor rightly asked to close the loop.
- A sweep in the sim (every track, 50/100/150cc, steering 0 to 7 toward the lane from the centre and from half-way out)
  found no wall hit and no speed loss on any wall lane. Steering hard toward the outside 20 m before a lane drives onto
  the verge first and loses speed there, as on any corner.
- The bot leaves a wall lane after about 0.7 s because it steers back to its racing line. A player with no steering is
  drawn onto the lane (§15).

**Known gaps:**
- Yarn Canyon has no loop (the plan had none).
- The AI never rides Shelter's or Café's wall lane (they sit inside a branch's fork-to-merge window, §15), so only the
  player rides them there.
- In the editor, a stunt sticker can sit on top of a starter feature's icon (a boost next to the loop), which is hard
  to read on the 2D map. The track still validates and races.
- Set pieces have not been checked on a real mid-range phone; the 60 fps target is measured on desktop Metal and in
  the headless phone viewport only.
