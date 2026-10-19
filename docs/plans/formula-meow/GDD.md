# Formula Meow: game design document (v1)

Status: design, 2026-10-19. Package: `formula-meow/` (not built yet). This document merges three pitches
(fun, viral, vibe) into one plan. Where they disagreed, the choice made and the reason are written next to it.

**One line.** A 90-second, 8-cat kart race on a phone. You drive your own cat, every finish makes a 12 s
vertical clip, and every result is a link that dares a friend to beat your ghost. No login and no menu
before the first race.

**Pillars**
1. **Fun in 10 seconds.** Within 10 s of the tap, the player has boosted, grabbed an item and drifted.
2. **Always close.** Item odds and a capped rubber band keep the last lap tight. There is no hidden speed help for the player.
3. **Your cat, your track.** The racer is your cat. Tracks are drawn with one finger. Everything travels in a link.
4. **Screenshot-worthy.** A toon low-poly look with neon accents, and a camera and audio that sell the speed.
5. **Honest.** The Pink Paw cats are real and labelled with their status date. The game moves no money and never says it does.

---

## 1. Core loop

```
tap link ──► grid (3-2-1, ghost already lined up) ──► 3 laps, ~85 s ──► photo finish
   ▲                                                                    │
   │                                                                    ▼
friend opens link ◄── share clip / "Beat 1:24.31" dare ◄── result: clip auto-plays,
                                                            "Put YOUR cat in", "Race my ghost"
                                                                          │
                                         cat maker (after race 1) ◄───────┤
                                         track doodle ─► clean lap ─► publish link
                                         daily cup (1 ranked run a day, emoji card)
```

- **Session shape.** Race (85 s) → result (clip and two buttons) → "Again" is one tap and always restarts on the same track with the same seed. "Next track" is a second button.
- **Return hooks.** The Daily Cup (one ranked run a day and a local streak), dares coming back ("Revenge?"), and new tracks from friends.

### 1.1 First 10 seconds (FTUE, race 1 only)
| t | What happens |
|---|---|
| 0.0 | The page opens straight onto the starting grid on Kitchen Counter GP, Kitten class. The corner button is the only UI (cat and settings). On a dare link, the friend's ghost is in the grid slot beside you. |
| 0.0–3.0 | Countdown: "mrrp, mrrp, mrrp, MEOW!". The hint "Tap on MEOW for a Pounce Start" appears. |
| 3.0 | GO. A press within ±0.15 s of GO gives a **Pounce Start**: a 1.0 s boost and "PURRFECT START". Early presses are not punished in race 1; from race 2 on, an early press stalls the kart for 0.8 s with a cough sound. |
| ~4 | First item row (yarn cubes), set in the middle of the racing line so it can't be missed. |
| ~7 | Wide hairpin with a glowing "HOLD TO DRIFT" ghost arrow (pattern copied from bad-cat `render/ftue-arrow.ts`). It is sized so that the first drift reaches the blue tier. |
| <10 | The player has boosted, held an item and earned a mini-turbo. |

One-thumb mode (see 2.1) is on for race 1. Hints stop once the player has done each action twice.

### 1.2 Race shape
- 8 racers, 3 laps. Authored laps are 650–900 m, which takes 25–30 s at 150cc, so a race lasts 75–95 s.
- **Final lap.** The "FINAL LAP" banner plays a meow-scream, the music steps up (section 10), and the item odds widen for the back half of the field.
- **Photo finish.** If the player and another racer finish within 0.15 s of each other, the game drops to 0.25× slow motion for 0.4 s (real time 1.6 s), shows a split nose cam, and then the result.
- **Finishing in 8th still feels good.** The game shows the best moment from the clip scorer ("Best overtake: 3 cats in 2 s") and never only "8th".

---

## 2. Controls

All devices feed one `TickInput` per sim tick (section 3.1). Steering is analog and quantized to 15 levels
(−7..+7) for ghosts.

### 2.1 Touch (portrait first: iPhone Safari, Chrome Android)
| Zone | Gesture | Action |
|---|---|---|
| Left half, bottom 60% | Drag from wherever the thumb lands (floating stick) | Steer. Dead zone 6 px, full lock at 70 px, response curve x^1.4. The stick base follows if the thumb drifts more than 110 px. |
| Right half, bottom 60% | Press | Hop |
| Right half, bottom 60% | Hold while steering | Drift |
| Item button: a 96 px circle at the right edge, above the drift zone; it shows the current item | Tap | Use the item forward |
| Item button | Hold | Hold the item behind the kart (Yarn as a shield) |
| Right half | Swipe up / swipe down (more than 60 px in under 200 ms) | Throw forward / drop backward (the same action as the item button, for players who never look up) |
| Ramp lip | Any tap within 0.2 s of leaving the lip | Trick |

- Gas is always automatic on touch. Braking is not needed; drifting is the way to slow down. A hard-steer scrub is built into the physics.
- **One-thumb mode.** Holding steering past 70% of lock for more than 0.25 s at more than 60% of top speed starts a drift automatically. Releasing the steer (back inside 30%) releases the drift. It is on for race 1, after which a toast asks "Keep one-thumb drift?" (default: on). It can be changed in settings.
- **Tilt steering.** Optional (`DeviceOrientationEvent`; iOS asks for permission on the toggle). Off by default.
- **Haptics.** `navigator.vibrate` on Android only (Safari ignores it): 8 ms on each drift tier, 25 ms on a hit, 15 ms on landing.
- **Safe areas.** `env(safe-area-inset-*)` is respected, and the HUD never sits under the controls.
- **Landscape.** Same layout, but the horizontal FOV gets 8° wider. The controls zone becomes the bottom 70%.

### 2.2 Keyboard
| Key | Action |
|---|---|
| ↑ / W | Accelerate. Auto-gas is a setting, off by default on desktop. |
| ↓ / S | Brake / reverse |
| ← → / A D | Steer (digital; the input ramps to full lock in 0.10 s so it never feels twitchy) |
| Space | Hop / drift |
| Shift / E | Item, forward |
| Shift / E with ↓ held | Item, backward |
| Q | Look back |
| R | Restart (outside a ranked daily run) |
| Esc | Pause |

### 2.3 Gamepad (Gamepad API, standard mapping)
| Control | Action |
|---|---|
| Left stick | Steer |
| RT or A | Accelerate (auto-gas setting applies) |
| LT or B | Brake |
| RB / R1 | Drift |
| X or LB | Item. Hold to trail it behind; stick down while firing throws it back. |
| Y | Look back |
| Start | Pause |

The stick dead zone is 0.12, rescaled to full range.

---

## 3. Simulation and kart physics

### 3.1 Determinism (resolved: 60 Hz fixed step, whole race deterministic)
- The fun pitch said ghosts could be kinematic, and the viral pitch wanted an input-replay sim. The **input-replay sim** wins: ghosts, clips, daily cups and anti-cheat (a lap time is recomputed, not trusted) all come from one source.
- **Fixed timestep.** 60 Hz with an accumulator; rendering interpolates between the last two states. The sim never reads wall-clock time.
- **A race is a pure function:** `race = f(trackCode, seed, class, modifiers, simVersion, playerInputs[])`. AI drivers, item rolls and hazards are part of the sim, so they replay exactly.
- **Math rules inside `core/sim`:**
  - Only `+ - * /`, `Math.sqrt`, `Math.floor`, `Math.round`, `Math.abs`, `Math.min` and `Math.max`. These are exact or correctly rounded under IEEE-754 on every engine.
  - Trig goes through a 4096-entry LUT (`fixed.ts`: `sinL`, `cosL`, `atan2L`).
  - No `Math.random` and no `Date`.
  - State is plain arrays and objects, iterated in fixed order.
- **RNG.** `rng.ts` (xorshift32, copied from `catnip-heist/src/sim/rng.ts`) with separate streams so that adding one draw never shifts another: `items` per kart, `ai` per kart, `hazards`. Each stream is seeded from `hash(seed, streamId)`.
- **Hash.** An FNV-1a hash of the full state (`hash.ts`, copied from catnip-heist `sim/hash.ts`) every 60 ticks. Tests assert golden hashes.
- **`SIM_VERSION`** is bumped whenever a tuning number or rule changes. A ghost with another version still opens, but as a "target time" race with no ghost and a note that the game was updated.
- **Render-only effects never touch the sim.** Hit-stop, shake, FOV and flashes are rendering. Slow motion steps the sim fewer times per real second, so the tick sequence is unchanged.

### 3.2 Kart model (arcade, no physics engine)
- Each kart has a planar state (`x, z, heading, vx, vz, yawRate`) plus vertical state (`y, vy, airborne`).
- The track query (`core/track/query.ts`) returns, for any position:
  - `s` (arc length), `d` (lateral offset) and the surface height and normal;
  - the surface type: road, curb, off-road, boost, low-grip or void.
- **Grip.** The velocity direction is pulled toward the heading at a grip rate. That gives the slidey-but-planted arcade feel without tyre models.
- **Kart-kart contact.** Circles of radius 0.9 m with a positional push-out and velocity exchange (a boosting kart pushes 2× harder). Collisions are processed in kart-index order.

### 3.3 Feel targets (all in `src/tuning.ts`)
| Parameter | Kitten 50cc | Alley Cat 100cc | Zoomies 150cc |
|---|---|---|---|
| Top speed (no boost) | 22 m/s | 26 m/s | 30 m/s |
| 0 to 90% of top | 1.4 s | 1.5 s | 1.6 s |
| AI skill band | 0.55–0.75 | 0.70–0.85 | 0.82–0.95 |
| Rubber band cap | AI −8% / +3% | ±5% | ±5% |

| Feel | Value |
|---|---|
| Acceleration curve | Fast to 80% of top in half the 0–90 time, then eases (`a = a0·(1 − v/vmax)^0.6`) |
| Max yaw rate | 120°/s at ≤ 8 m/s, falling linearly to 75°/s at top speed |
| Steer smoothing | 0.08 s to full lock (touch / stick); 0.10 s ramp on digital keys |
| Grip rate | 10/s on road, 2.5/s while drifting, 6/s on low-grip patches |
| Hop | 0.15 s, 0.25 m; it opens the drift window |
| Drift entry | Hop plus steer above 30% lock at more than 10 m/s; drift direction locks to the steer side |
| Drift slip angle | 25° neutral; steering inside/outside sets 15–35° (tighten/widen) |
| Drift yaw | 45°/s (wide) to 120°/s (tight) |
| Gravity | 22 m/s² (heavier than real, for snappy jumps) |
| Air steering | 30% of ground yaw rate |
| Trick | A tap within 0.2 s of leaving a ramp lip spins the kart; on landing it gives +25% for 0.6 s |
| Wall graze (under 30°) | −15% speed once per contact; slides along the wall; trauma +0.2 |
| Wall head-on (over 60°) | −40% speed, bounces 1.5 m back along the normal, never to zero; trauma +0.4 |
| Off-road | Top speed ×0.6, acceleration ×0.5. **Any active boost ignores the off-road penalty** (the classic mushroom shortcut). |
| Fall off / void | The "big hand" (a human hand scoops the cat up) puts the kart back on the last valid sample after 1.2 s, facing forward, with 0.5 s of immunity |
| Wrong way | After 1.5 s, a "WRONG WAY" paw arrow appears |

### 3.4 Drift and mini-turbo (resolved: 0.6 / 1.2 / 2.0 s)
The fun and viral pitches used 0.6 / 1.2 / 2.0 s and the vibe pitch 0.8 / 1.6 / 2.6 s. The shorter set wins
because phone races are short and corners must pay off.

| Tier | Charge time | Spark colour | Boost | Sound |
|---|---|---|---|---|
| Blue | 0.6 s | #3AA8FF | +30% for 0.5 s | Whine step 1 |
| Orange | 1.2 s | #FF8A3D | +30% for 0.9 s | Whine step 2 |
| Pink "MEOWTURBO" | 2.0 s | #FF3EA5 | +30% for 1.4 s, plus a purr crescendo and an extra screen-edge flash | Whine step 3 + meow |

- Charging is faster while the drift is held tight: ×1.25 above 70% inside steer, ×0.75 when wide.
- Releasing before the blue tier just cancels; nothing is lost.
- A drift ends on release, on a wall hit or when speed drops below 8 m/s.

### 3.5 Boosts
- Every boost source sets `boostTimer = max(boostTimer, duration)` and `boostLevel = max(level, sourceLevel)`. Boosts refresh rather than add, so the cap is a speed multiplier of **1.35**. The single exception is Zoomies, at **1.40**.
- The boost acceleration is 3× the normal acceleration until the kart reaches the boosted top speed.

| Source | Level | Duration |
|---|---|---|
| Mini-turbo | 1.30 | 0.5 / 0.9 / 1.4 s |
| Boost pad (dryer vent, neon arrow) | 1.35 | 0.8 s |
| Pounce Start | 1.30 | 1.0 s |
| Trick landing | 1.25 | 0.6 s |
| Slipstream: 1.2 s within 8 m behind a rival, inside a 15° cone; charges with a wind-line effect, releases on leaving the cone | 1.25 | 1.0 s |
| Catnip charge | 1.35 | 1.0 s each |

### 3.6 Hits (never cost more than about 1.5 s)
| Hit | Effect | Time lost (approx.) |
|---|---|---|
| Spin-out (Hairball, Yarn, Laser Dot) | 1.1 s spin, speed falls to 30%, then a normal recovery | 1.3 s |
| Cucumber leap | 0.9 s airborne jump-scare (2 m), keeps 50% speed, lands facing forward | 1.0 s |
| Bell wobble | 0.8 s of steering noise ±25%, speed ×0.85 | 0.3 s |
| Laser chase | 0.5 s steering pulled toward the dot (−20% steering authority) | 0.2 s |

All hit effects are render-only: 70 ms hit-stop on the victim's view, a one-frame white flash, trauma +0.6 and 6 frames of victim pose hold.

---

## 4. Items (8, one slot, position-weighted)

Item boxes are glowing yarn cubes in rows of 4–6. They respawn 1.5 s after pickup. The roulette spins for
1.2 s with 12 bell ticks that slow down. The result is drawn **at pickup** from the kart's `items` RNG
stream (deterministic) and only revealed at the end of the spin.

| # | Item | Use | Effect | Role |
|---|---|---|---|---|
| 1 | **Hairball** | Forward (or backward) | A straight shot at 45 m/s that bounces off walls up to 3 times and lives 4 s; spins out the kart it hits | Bread-and-butter hit |
| 2 | **Yarn Trap** | Drop behind, or hold as a shield | Unravels into a tangle on the track (lives 30 s, at most 12 on the track); spins out the kart that drives into it | Defence |
| 3 | **Cucumber** | Lob ahead about 18 m (or drop) | Lands as a trap; the cat that hits it does the jump-scare leap | The meme clip moment |
| 4 | **Catnip** | Use ×3 | 3 boost charges; each use gives a short psychedelic tint and a purr | Speed, comeback |
| 5 | **Cardboard Box** | Use | 3 s "if I fits I sits" shield. The kart becomes a box; hits and traps bounce off; no item use while it lasts | Comeback defence |
| 6 | **Bell Collar** | Use | Rings a 25 m radius; every other racer inside it gets the 0.8 s wobble | Mid-pack chaos |
| 7 | **Zoomies** | Use | 3 s on autopilot along the racing line at 1.40×, invincible, knocks karts aside, ignores off-road | Back-of-pack catch-up (Bullet Bill) |
| 8 | **Laser Dot** | Use | A red dot runs ahead along the track at 1.5× leader speed. Every racer it passes over chases it (laser chase); then it spins the leader. The leader's screen shows the dot coming for 1.5 s, and a Cardboard Box blocks it. | Blue shell |

**Laser Dot rules:**
- It cannot appear on lap 1.
- At most one can be active, with a 10 s cooldown race-wide after one resolves.
- If it is rolled but blocked, the roll is redrawn from the remaining items.

Cut from the pitches, and why:
- **Catnip Cloud** (inverted steering). Inverted controls on a phone feel like a bug, not a hit.
- **Can Opener** and **Nine Lives.** They overlap with Zoomies and the respawn hand.
- **Laser Pointer as an area item.** Folded into the Laser Dot's pass-over chase.

### 4.1 Distribution (weights out of 100)
- The **effective position** is the race position, made one place worse when the gap to the leader is more than 6 s and two places worse when it is more than 12 s (capped at 8th). This is the distance-based Mario Kart 8 approach.
- The player and AI use the same table.

| Eff. pos | Hairball | Yarn | Cucumber | Catnip | Box | Bell | Zoomies | Laser |
|---|---|---|---|---|---|---|---|---|
| 1st | 30 | 35 | 25 | 5 | 5 | 0 | 0 | 0 |
| 2nd | 25 | 20 | 20 | 15 | 10 | 10 | 0 | 0 |
| 3rd | 20 | 15 | 15 | 20 | 10 | 15 | 5 | 0 |
| 4th | 15 | 10 | 10 | 25 | 15 | 15 | 10 | 0 |
| 5th | 10 | 5 | 10 | 30 | 15 | 15 | 15 | 0 |
| 6th | 5 | 0 | 5 | 35 | 15 | 10 | 25 | 5 |
| 7th | 0 | 0 | 5 | 30 | 15 | 5 | 30 | 15 |
| 8th | 0 | 0 | 0 | 30 | 10 | 5 | 35 | 20 |

Daily modifiers can replace the table (for example "Cucumbers Only"). Balance target, checked by a headless
harness over 2,000 AI-only races per track: the average place change for the field from lap 1 to the finish
is at least 1.5 places, the winner leads by less than 3 s in 70% of races, and no item has a hit rate under 20%.

---

## 5. Racers and AI

### 5.1 The field
- 8 racers: the player plus 7 AI cats.
- **Roster.** The default field is drawn from the Pink Paw snapshot (section 13), e.g. Medutis, Gabė, Tita, Unis, Lambo, Mora, Vane. On a dare link, the challenger's ghost is a non-colliding ninth translucent kart.
- Each AI has a **personality**, a few numbers in `items-ai/ai/personalities.ts`:
  - `skill` (racing-line precision and drift tier reached);
  - `aggression` (item use: fire at once or hold);
  - `mistakeRate` (missed apexes and late drifts; higher at 50cc);
  - `lineBias` (a preferred lateral offset of −0.6..+0.6 of the half width).
- Personalities are deterministic from the race seed and the AI's slot.

### 5.2 Driving
- **Racing line.** Each track has a precomputed optimal-ish line, made by smoothing the minimum-curvature offset along the spline (done at track build, so UGC tracks get it too). Each AI follows that line plus its `lineBias`, with a look-ahead target 8–18 m ahead (more at higher speed).
- **Drifting.** The AI drifts where curvature passes a threshold, and its skill decides the tier: a 50cc AI rarely reaches pink, and a 150cc AI gets pink on the hairpins.
- **Mistakes.** A seeded RNG adds late turn-ins and wall grazes. Off-road shortcuts are taken only while boosting.
- **Items.**
  - Hairball when a target is within 30 m inside a 10° cone ahead.
  - Yarn is held as a shield when a kart is within 15 m behind.
  - Catnip on straights; Box when a projectile is incoming or the Laser Dot is targeting it; Bell when at least 2 karts are within 25 m.
  - AI karts more than 4 s ahead of the player use items 50% less often.

### 5.3 Rubber band (fair, capped)
- The AI target speed is `vmax × (1 + clamp(k × gapToPlayer, −cap, +cap))`, where the cap comes from the class table in 3.3.
- An AI **never exceeds the player's unboosted top speed** except when it is itself boosting.
- The player never gets hidden speed. Catch-up comes only from item odds, slipstream and shortcuts.
- **Kitten class is tuned so that race 1 is podium-friendly.** Its AI band and −8% cap make a first podium likely for a player who drifts at all. A headless check asserts that a scripted "average" player bot (holds the line and drifts the hairpin) reaches the top 3 in at least 80% of Kitten seeds on Kitchen Counter.

### 5.4 Classes and unlocks
- Kitten (50cc) is the default.
- Finishing a Kitten race unlocks Alley Cat (100cc).
- A podium at 100cc unlocks Zoomies (150cc).
- Winning a 150cc race unlocks Mirror.
- Progress is stored locally only.

---

## 6. Tracks

### 6.1 v1 tracks (resolved: 4, two polished)
| # | Track | Theme | Signature features | Polish |
|---|---|---|---|---|
| 1 | **Kitchen Counter GP** | Day, butter-yellow sky; palette #FFE9B0 / #F25C3B / #3BB273 | Tutorial hairpin; counter to cutting board ramp; sink splash zone (low grip); a toaster that pops a toast ramp every 4 s (deterministic timer); fridge-door shortcut (boost only) | Full (FTUE track, same world as Bad Cat) |
| 2 | **Kaunas Neon Rooftops** | Night synthwave; #1A1238 / #FF3EA5 / #2CF6F3 | Tin roofs, chimney jumps, a billboard shortcut, laundry-line bunting, fake wet-road reflection strips; the **Pink Paw garage** (section 13) | Full (trailer and hero shots) |
| 3 | **Laundry Spin** | Pastel laundromat | Spinning-drum chicane (rotating hazard on a fixed period), sock mounds (off-road), dryer-vent boost pads | Spline + palette + 3 signature props |
| 4 | **Yarn Canyon** | Sunset #FF8A3D → #7B2CBF | Yarn-ball mesas, needle bridge, loose-thread zipline (boost strip), stripe-shader ground | Spline + palette + 3 signature props; first to cut |

- **Kibble Cup** is all 4 tracks in a row, about 6 minutes, with points of 15/12/10/8/6/4/2/1.
- Mirror mode flips the track data on X at build time.
- Two pitch ideas are **out of v1**: the anti-gravity loop and the Cat Café / Fish Market tracks. They are noted for v2.

### 6.2 Track data format (`TrackDef`, one format for authored and UGC tracks)
```ts
interface TrackDef {
  v: 1;
  id: string;                 // authored: "kitchen"; UGC: "u-" + FNV-1a(code)
  name: string;               // ≤ 16 chars, text-filtered
  creator?: string;           // ≤ 10 chars, text-filtered
  parent?: number;            // 32-bit key of the remixed track (remix chain)
  theme: 0 | 1 | 2 | 3;       // kitchen, rooftops, laundry, yarn
  timeOfDay: 0 | 1 | 2;       // day, dusk, night
  laps: 3 | 5;                // UGC: 5 if the loop is under 450 m
  points: Array<{ x: number; z: number; h: number; w: 0 | 1 | 2 | 3 }>; // 8–32 closed control points
  //   x, z: metres on a 4 m grid within ±128 m; h: height step 0..7 (×1.5 m); w: width class 10/12/14/16 m
  features: Array<{ s: number; kind: FeatureKind; side?: -1 | 0 | 1 }>;  // s = 0..255 fraction of the lap
  props?: number[];           // up to 3 theme prop sets (UGC); authored tracks use their own dressing modules
}
type FeatureKind = 'items' | 'pad' | 'ramp' | 'lowgrip' | 'offroad' | 'hazard' | 'shortcut' | 'start';
```
- **Build** (`core/track/build.ts`). The steps:
  1. A centripetal Catmull-Rom through the points, with an arc-length table (0.5 m samples).
  2. Frames, with banking from curvature (`bank = clamp(k × curvature, ±12°)`).
  3. Walls: soft curbs plus invisible walls at ±(w/2 + 1.5 m).
  4. A query grid of 8 m cells listing the nearby samples.
  5. The racing line.
  6. The start line (the authored `start` feature, or the straightest 40 m on UGC tracks).
- **Mesh** (`core/track/mesh.ts`). The road is an extruded ribbon. The curbs are an `InstancedMesh` of alternating boxes. Props are merged per 64 m chunk (`mergeGeometries`, `geo.ts` style).
- Authored tracks are TypeScript files that export a `TrackDef` plus a dressing function (props only, no gameplay), so the gameplay of every track can still be shared as a code.

### 6.3 Track share code
- Encoding is bit-packed with the copied `codec/bits.ts`, then CRC-16, then base64url (same as bad-cat).
- Fields:

| Field | Bits |
|---|---|
| version | 4 |
| theme | 2 |
| timeOfDay | 2 |
| lapsFlag | 1 |
| point count | 5 |
| per point: x / z | 6 + 6 (grid steps) |
| per point: h | 3 |
| per point: w | 2 |
| feature count | 5 |
| per feature: s | 8 |
| per feature: kind | 3 |
| per feature: side | 2 |
| prop sets | 3 × 4 |
| name | 6-bit charset |
| creator | 6-bit charset |
| parent key | optional 32 |
| creator lap | 16 (centiseconds); the maker's clean-lap time, re-verified when the maker's ghost travels with it |

- Size: a 24-point track with 12 features and names is about 95 bytes, or about 128 characters. That fits in a URL and in a clip caption.
- Names are filtered on encode **and** decode (`text-filter.ts`). A bad CRC or version shows "This track link is broken. Race Kitchen instead?"

### 6.4 Track editor ("Track Doodle", phone first, lazy chunk)
The three pitches proposed freehand doodle, a tile grid, and control-point stickers. The editor combines
doodle and stickers; tiles are dropped. A doodle is the fastest way to a fun, unique shape on a phone, and
stickers give control without a grid UI.

1. **Draw.** Drag a finger around a closed loop on a top-down canvas (the theme backdrop is shown). On release, the loop is closed automatically if the ends are within 40 m. It is resampled to 16–24 points by Ramer-Douglas-Peucker plus even spacing, snapped to the 4 m grid, and smoothed until the minimum turn radius is at least 9 m.
2. **Tweak.** Drag the control points (48 px handles). A double-tap on the road adds a point; a long-press removes one. A height slider applies to the selected point.
3. **Stickers.** A bottom tray holds 7 stickers: item row, boost pad, ramp, low-grip, off-road, hazard and shortcut gate. Drag one onto the road and it snaps to the nearest `s`; tap it to flip its side; drag it off to delete.
4. **Theme.** Pick theme, time of day and up to 3 prop sets.
5. **Name.** A ≤ 16-character name, with the creator tag remembered.
6. **Test lap → publish.** The validator must pass, then the maker drives **one clean lap** (time trial, no AI). The "Share track" link unlocks only after that lap, the same rule as bad-cat's clear-to-publish. The link carries the maker's lap time as the target to beat.

- **Validator** (`ugc/editor/validate.ts`), which the decoder runs too:
  - closed loop; 8–32 points; length 300–1200 m;
  - no self-intersection, with the road width as margin (or a height difference of at least 4.5 m, which makes a bridge);
  - minimum radius 9 m after smoothing; climbs of at most 25%;
  - at least one item row; one start.
- Each failure highlights the problem segment in red with a single plain sentence.
- **Remix.** Opening any track link offers "Remix". The new code stores the parent key, and the result card shows "remix of <name> by <creator>".
- Undo and redo come from the copied `editor/history.ts`.

---

## 7. Your cat as racer, and the garage

- **Cat maker.** `catmaker/` is copied from bad-cat (photo to face decal, k-means palette, pattern guess) as a lazy chunk.
  - It is offered **after the first finish** ("Put YOUR cat in the kart"), never before.
  - The photo stays on the device (copied `photo-store.ts`).
  - Links carry only the 18-character cat code (`cat-codec.ts`: pattern, colours, ears, tail, body, eyes, hat), **not the face**. A friend sees your cat's coat and pattern; the face decal appears only in your own clips and cards.
- **Driver rig.** The copied `cat-rig.ts` / `cat-material.ts` / `cat-outline.ts` / `face-decal-material.ts`, posed sitting in the kart:
  - the head leans into turns (±18°);
  - ears flatten above 85% speed;
  - the tail is a flag at the back;
  - paws reach for the wheel.
- **Garage** (`ugc/garage`). All of it is unlocked from the start, except trails, which unlock by finishing tracks:
  - **Body:** v1 ships 3 bodies (Tuna Can, Shoebox, Sardine F1). Laundry Basket, Roomba and Teacup are v1.1.
  - **Wheels:** Yarn, Donut, Bottle Cap, Paw.
  - **Paint:** 3 colour slots from a 12-colour palette, defaulting to the cat's fur palette.
  - **Decal:** paw, flame, fish or heart.
  - **Trail:** Sparkle, Fish Bones, Hearts, Paw Prints.
  - **Horn:** 6 synth meows.
  - **Number:** 0–99.
  - Bodies differ only in looks. There are **no stat differences** in v1, which keeps balance simple and ghosts fair.
- **Kart code.** 6 bytes (body 3 bits, wheels 2, 3 × 4-bit paint, decal 2, trail 2, horn 3, number 7) plus CRC, about 11 characters. It travels with the cat code.

---

## 8. Ghosts, dares and links

### 8.1 Ghost codec (`ugc/codec/ghost-codec.ts`, adapted from bad-cat)
- **Wire format.** Byte 0 holds version:4 and flags:4 (bit 0 means the body is deflate-raw). Then the body, then CRC-16, all base64url.
- **Body:**
  - `trackKey:32`, `seed:32`, `class:2`, `modifiers:6`, `simVersion:8`, `ticks:16`;
  - then RLE runs of `steer:4, gas:1, brake:1, drift:1, item:1, itemBack:1, trick:1` with a variable-length count. The count format is copied from bad-cat.
- **Input latching.** Inputs are latched every **2 ticks** (30 Hz) before quantizing. That halves the run count, and the steering smoothing in the sim hides it.
- **Size target.** A 90 s race should be 1.5 kB or less after deflate. A test asserts the median over the bot corpus.
- **Verification.** Opening a ghost re-simulates it. The displayed time is the recomputed one.

### 8.2 Dare flow
- After any race, "Beat 1:24.31 →" opens the share sheet with "My cat can't be beaten on Kitchen Counter. Prove me wrong." and the link.
- **On open:**
  1. The grid loads with the same track, seed, class and modifiers.
  2. The challenger's race is re-simulated **in a shadow world in lockstep**.
  3. Only the challenger's kart is drawn, translucent, with their cat's coat and name tag.
- The recipient's own race has the same seed, so the AI and the item rolls start out the same. The two races diverge as soon as the inputs differ.
- When the friend wins, the result says "You beat <name>!" and offers "Send revenge →". The new link carries the friend's run.
- **Rivalry ledger.** Stored on the device and shown on the result screen: "Mochi 3 · Luna 2".
- Cost: the shadow world doubles sim cost, which is still under 0.5 ms per frame (section 12).

### 8.3 Routes (all work without a server)
| Path | Opens |
|---|---|
| `/meow-race` | Race 1, or the last track |
| `/meow-race/r#g=<ghost>&c=<cat>&k=<kart>&n=<name>[&t=<trackcode>]` | A dare. The track is an authored id inside the ghost, or `t=` for UGC. |
| `/meow-race/t#t=<trackcode>` | A UGC track (time trial with the maker's target, then a race) |
| `/meow-race/d/<n>` | Daily Cup day n (pre-rendered OG page per day, like bad-cat) |
| `/meow-race/c/<cat>` | "Race as this cat" (the cat code in the path, a short OG page) |
| `/meow-race/make` | Track Doodle |

- Heavy payloads go in the hash, so they never hit Vercel or the logs and have no path-length limits. `r.html` and `t.html` carry generic OG tags ("Beat my cat in Formula Meow").
- The redirect block `meowRaceRewrites` in `client/next.config.js` is modelled on `badcatRewrites`:
  - `const MEOW = "/formula-meow-game"`;
  - `/meow-race` → `${MEOW}/index.html`;
  - `/meow-race/d/:n(\\d{1,4})` → `${MEOW}/d/:n.html`, with a fallback to `index.html`;
  - `r`, `t`, `c` and `make` go to their `.html` shells;
  - `/meow-race/:path*` → `${MEOW}/:path*`.
- There is no service worker in v1 (it is on the cut list).

---

## 9. Finish clip and cards

### 9.1 Clip (12 s, 720×1280, H.264/AAC via mediabunny, lazy chunk)
- **Production.** The clip is made **after** the race from the replay, not by screen capture:
  - re-simulate from seed and inputs;
  - render the chosen spans offscreen with `clip-camera.ts` / `clip-pass.ts` (copied and adapted);
  - render the audio from the offline music and SFX schedule (`scheduleSpan` pattern).
- It starts encoding while the result screen shows. A progress ring sits on SHARE CLIP. If WebCodecs is missing, the button falls back to the result card image.
- **Highlight score.** Computed over a sliding 4 s window of the race event log:
  - +2 per overtake by the player in 3 s;
  - +3 per item hit landed;
  - +2 for a pink mini-turbo;
  - +2 for a trick;
  - +4 for a cucumber leap caused by the player;
  - +6 for a photo finish.
- **Cut.** Unchanged from the pitch:

| Time | Shot |
|---|---|
| 0–1.5 s | Your cat's face, a close orbit in the kart (match cut on a horn) |
| 1.5–8.5 s | Best moment, cutting between chase cam and a low side cam |
| 8.5–10.5 s | Finish line at 0.4× |
| 10.5–12 s | End card: place, time, track, `tokentails.com/meow-race` and "Beat my cat" |

- A 1 s synth sting plays at the end.
- The caption copied to the clipboard holds the link plus `#formulameow`.

### 9.2 Cards (canvas, copied `share/image-card.ts` approach)
- **Result card** 1080×1350: place, race time, best lap, cat face (local only), track name and creator credit.
  - It shows only numbers the game measured. **No invented stats** and no global ranks.
- **Track card** 1200×630 OG, an overhead render: "<name> by <creator>. Lap it under 0:24?" The time is the maker's verified lap.
- **Daily card**, text and emoji, Wordle style: `Formula Meow Day 12 · 3rd/8 · 1:41.22` followed by one coloured square per lap for the position band at lap end (🟪 top 3, 🟧 4–6, ⬜ 7–8) and the link.

### 9.3 Share sheet
- The copied `share/share-sheet.ts` uses Web Share Level 2 with files where supported, falling back to download plus copied text.
- The in-app-browser handoff (`inapp-handoff.ts`) is copied so that TikTok and Instagram webviews offer "Open in browser" for the clip.

---

## 10. Audio and music (WebAudio synth only)

The code is copied from bad-cat `audio/synth.ts` (`tone`, `noise`, `filter`, `purr`, `voice`, `bell`,
`brass`, `prng`), `voices.ts` (`mrrp`, meows, hiss) and the look-ahead scheduler from `music.ts`. No audio
files are used.

- **Engine.** A `purr()` amplitude-modulated at 22–28 Hz (rising with rpm), layered with two detuned saws whose pitch maps rpm to 70–240 Hz, through a lowpass from 600 to 3,200 Hz that follows speed.
  - On boost, a meow formant sweep (about 400 ms) plays on top.
  - Rival engines go through a `PannerNode`; at most the 3 nearest are audible.
- **Drift.** Noise squeal plus a rising whine in 3 pitch steps, one per tier.
- **SFX:**
  - hiss on being hit, a squeak toy on landing, a trill on an overtake, a yowl when a rival passes you;
  - item roulette: 12 bell ticks that slow down;
  - box "thunk", cucumber "AAAH" meow-scream, laser zap;
  - the horn button plays the cat's chosen meow.
- **Music.** 128 BPM synthwave/chiptune with saw bass, gated pad, square arpeggio, kick, snare, hats and lead. Each track has its own key and pattern set.
  - **Reacts to race position:**
    - 5th–8th: full band plus lead (chase).
    - 2nd–4th: the arpeggio filter opens from 800 Hz to 4 kHz.
    - 1st: drums drop to hats plus a heartbeat kick, and the lead goes up an octave (protect the lead).
  - **Final lap:** 140 BPM, up 2 semitones, with a riser across the line.
  - Results: a short loop. Editor: a calm lo-fi loop.
- **Countdown.** "mrrp, mrrp, mrrp, MEOW!" on the beat grid, so the Pounce Start lands on the downbeat.
- **Budget.** At most 24 voices. Music is scheduled 100 ms ahead. Audio is unlocked on the first touch.
- **Mixer.** Music, SFX and engine sliders; a mute icon in the corner; muted by default inside in-app webviews.

---

## 11. Visual direction and juice

- **Look.**
  - `MeshToonMaterial` with one shared 3-step gradient (3×1 px, nearest filter).
  - Inverted-hull outlines (`cat-outline.ts`) on karts, cats and items only. The world uses rim colour.
  - One gradient sky sphere per theme plus 30 instanced clouds or stars.
  - Blob shadows on low and mid. One 1024 px directional shadow map on high, covering the player's area only.
- **Camera** (`core/camera`):
  - Chase position 4.8 m behind and 1.9 m up, with a spring lag of 0.12 s.
  - Look-ahead 6 m, rotating into drifts by 8°.
  - FOV is specified as **horizontal** and converted per aspect, because portrait screens make a vertical FOV feel cramped:
    - base 75°, +12° at boost (over 120 ms, easing back over 600 ms), +3° in a drift;
    - vertical FOV clamped to at most 100°.
- **Speed lines.** A full-screen pass with radial streaks. Alpha = clamp((v − 0.6·vmax) / (0.4·vmax)), jumping to 0.9 at boost in the theme's accent colour.
- **Shake.** Trauma model: shake = trauma², with trauma decaying 1.6/s. Maximum offset 0.35 m and 2.5° roll. Each event adds trauma:

| Event | Trauma |
|---|---|
| Hit | +0.6 |
| Wall | +0.2 / +0.4 |
| Landing | +0.3 × airtime |
| Mini-turbo release | +0.15 |

  Reduced-motion setting: shake ×0.3 and no FOV kick.
- **VFX:**
  - instanced drift sparks (at most 64 per kart) in the tier colour;
  - paw-print skid decals (a ring buffer of 120);
  - boost flames; trails;
  - hit flash; finish confetti (paw shapes);
  - catnip tint: a hue shift for 0.6 s.
- **Post-FX.** One combined pass for speed lines, vignette, flash and catnip tint. Bloom is off on low, faked with additive sprites on mid, and a half-resolution 2-tap bloom on high.
- **UI.** Chunky sticker style:
  - a 4 px dark outline, badges tilted 6°;
  - the system rounded stack at `font-weight: 800`, no font download;
  - a huge position number at top left whose ordinal shakes when it changes;
  - item slot at top centre, mirrored by the touch item button;
  - lap count and a 64 px canvas mini-map at top right;
  - a small race timer.

---

## 12. Performance budget (iPhone 12 / Pixel 6a at 60 fps)

| Budget | Target |
|---|---|
| Frame time | Under 16.6 ms. Sim (2 worlds) under 1 ms, render under 10 ms on mid. |
| Draw calls | Mid 120 or fewer, low 80 or fewer |
| Triangles | 150k or fewer on screen. Kart plus cat about 2.5k each; AI karts beyond 40 m use a merged LOD (about 600) with no outline |
| DPR | Governor copied from `quality.ts`: start at 1.25 on Android and 1.5 on iOS, cap at 2, step down 0.25 after 2 s under 45 fps |
| Quality tiers | Low / mid / high, with the existing tier rules |
| Initial JS | 450 kB gzip or less including three.js. Cat maker, editor, clip encoder (mediabunny) and garage are lazy chunks. `tools/budget.mjs` is copied and enforced in CI |
| First input | Under 3 s on 4G from link tap to the countdown |
| Memory | Under 250 MB on iOS. GPU context loss is handled by the copied `context-loss.ts` |

---

## 13. Pink Paw tie-in (honest)

- **Rivals are real shelter cats.** The default AI field uses the Pink Paw snapshot. `pink-paw.ts` is copied from bad-cat `platform/pink-paw.ts`, along with its existing licence and `statusAsOf` rule.
  - Names and coat colours come from the shelter's data. Coats are stylised, not a claim about the cat.
  - Each rival's tag reads "Real cat at Pink Paw shelter, Lithuania", and the status is always shown with its date ("Waiting, as of 2026-10-04").
  - Cats marked ADOPTED are left out of the default field.
- **Result screen.** One line about the rival who finished closest to you: "Meet Medutis, waiting at Pink Paw (as of <date>)". It links to `pinkPawAdoptUrl`.
- **Kaunas Neon Rooftops.** Has a Pink Paw garage building with a neon sign reading "Pink Paw · Rožinė pėdutė". If the repo's existing Pink Paw logo asset (the one used by the rave) is suitable, use it; otherwise use a text sign.
- **Giving.** One optional link, "Give a treat to Pink Paw", goes to the existing sponsored-treat flow on tokentails.com/heist. The copy says exactly what that flow does.
- **The game itself moves no money.** No copy says or implies "each race donates", "proceeds go to", or any count of cats helped, races or players. Any number shown is measured on the device.
- The roster refresh reuses the bad-cat `tools/sync-pink-paw.mjs` pattern, copied into `formula-meow/tools/`.

---

## 14. Daily Cup

- **Day number.** `dayNo = daysBetween(DAY1, local date) + 1`. The logic is copied and adapted from bad-cat `content/daily.ts`; the streak logic comes from `meta/` with no server.
- **Track rotation.** One track a day, rotating through the 4 tracks. On Sundays it can be a founder-picked community track: a UGC code in `public/daily/index.json`, the same pattern as bad-cat's Community Sunday, with a fallback to an authored track if the code is invalid.
- **One modifier a day** from: Mirror, Night, Cucumbers Only, Catnip Rain (every box is Catnip), Zoomies+ (150cc with +10% top speed for everyone), Box Party.
- **Same seed worldwide:** `seed = hash("daily", dayNo)`.
- **Ranked run.** The first finished race of the day is the ranked one; practice is unlimited. Ranked runs can't be restarted.
- **Shares.** The daily emoji card, plus the dare link for that run.
- **No server leaderboard in v1.** Competition comes from dares and the rivalry ledger.

---

## 15. Measurement (no invented numbers)

- Analytics are consent-gated, copied from bad-cat `platform/analytics.ts` / `posthog.ts`.
- Events: `race_start`, `race_finish` (place, time, class), `drift_tier`, `item_use`, `clip_made`, `share` (kind), `dare_open`, `dare_won`, `cat_made`, `track_published`, `track_opened`.
- **Success test from the viral pitch.** Of first-time visitors who finish race 1, at least 25% either make a cat or send a dare. This is a target to measure, not a claim.

---

## 16. Package and module layout (`formula-meow/src`, by lane)

- **Toolchain.** three ^0.183, Vite ^8, TypeScript, vitest, Playwright, mediabunny (lazy). Dev on port **5175**.
- **Scripts:** `dev`, `build`, `typecheck`, `test`, `e2e`, `budget`, `validate` (all authored tracks pass the validator and decode round-trip), `og`, `og:pages`, `sync:pinkpaw`, and:
  ```
  build:client = MEOW_BASE=/formula-meow-game/ vite build --outDir ../client/public/formula-meow-game --emptyOutDir && node tools/og-pages.mjs ../client/public/formula-meow-game
  ```
- **Copy, never import.** Every file copied from `bad-cat/` or `catnip-heist/` starts with a header naming its source path and commit. Those packages are not modified.

```
formula-meow/
  index.html  r.html  t.html  c.html  make.html        # OG shells (same bundle)
  vite.config.ts  tsconfig.json  playwright.config.ts  package.json
  public/daily/index.json                              # founder-editable daily overrides
  tools/  og-pages.mjs  render-og.mjs  budget.mjs  validate-tracks.mjs  sync-pink-paw.mjs
  e2e/    race.spec.ts  dare.spec.ts  editor.spec.ts
  src/
    main.ts                    # boot: router → shell (core lane)
    types.ts                   # SHARED CONTRACT: TickInput, KartState, RaceState, RaceEvent, TrackDef,
                               #   ItemId, ItemState, Modifiers, SIM_VERSION. Frozen after M0; changes need all lanes.
    tuning.ts                  # SHARED: every number in sections 3–5 (sections: physics, boost, hits, items, ai)

    core/                      # LANE core: sim, physics, track, race, camera, input, HUD, app shell
      sim/   fixed.ts (trig LUT)  rng.ts (from heist)  hash.ts  kart.ts  contact.ts  race.ts (countdown,
             laps, positions, finish, event log)  world.ts (SimWorld.step(inputs[]))  replay.ts  shadow.ts
      track/ spline.ts  build.ts  query.ts  racing-line.ts  mesh.ts  themes.ts  dressing/*.ts
             tracks/ kitchen.ts  rooftops.ts  laundry.ts  yarn.ts
      render/ scene.ts  kart-view.ts  kart-parts.ts  world-view.ts  interp.ts
             (copied) cat-rig.ts  cat-material.ts  cat-outline.ts  face-decal-material.ts  palette.ts
                      quality.ts  context-loss.ts  geo.ts  ftue-arrow.ts
      camera/ chase-camera.ts  lookback.ts  fov.ts
      input/  touch.ts  keyboard.ts  gamepad.ts  tilt.ts  mux.ts (→ TickInput, 30 Hz latch, quantize)
      hud/    hud.ts  position.ts  item-slot.ts  minimap.ts  countdown.ts  results.ts  hud.css
      app/    loop.ts (fixed step + accumulator)  router.ts  shell.ts  settings.ts  storage.ts  progress.ts

    items-ai/                  # LANE items-ai: items, AI drivers, balance
      items/  defs.ts  roulette.ts (table 4.1, effective position)  projectiles.ts (hairball, laser dot)
              traps.ts (yarn, cucumber)  effects.ts (box, zoomies, catnip, bell)  boxes.ts (item rows)
              item-view.ts (meshes, instanced)
      ai/     driver.ts  personalities.ts  rubber-band.ts  item-brain.ts  roster.ts (Pink Paw field)
      balance/ harness.ts (headless N races)  bots.ts (scripted "average player")  report.ts

    ugc/                       # LANE ugc: editor + codecs + garage + cat maker
      codec/  (copied) base64url.ts  bits.ts  crc16.ts  text-filter.ts  cat-codec.ts
              track-codec.ts  ghost-codec.ts  kart-codec.ts  link.ts (parse/build all routes)
      editor/ TrackDoodle.ts  doodle.ts (RDP + resample + smooth)  handles.ts  stickers.ts
              validate.ts  test-lap.ts  publish.ts  history.ts (copied)  editor.css
      catmaker/ (copied from bad-cat, lazy chunk) + adapter.ts (CatSpec → driver rig)
      garage/ garage.ts  parts.ts  garage.css

    juice/                     # LANE juice: audio, music, vfx, post-fx, camera feel
      audio/  (copied) synth.ts  voices.ts  recipes.ts
              engine.ts  sfx.ts  music.ts (adaptive layers, final-lap shift)  mixer.ts  unlock.ts
      vfx/    sparks.ts  skids.ts  flames.ts  trails.ts  confetti.ts  hit-flash.ts  speed-lines.ts
      postfx/ combined-pass.ts  bloom-lite.ts
      feel/   shake.ts (trauma)  hitstop.ts  slowmo.ts  haptics.ts  reduced-motion.ts
      bus.ts  # subscribes to RaceEvent log + KartState; the ONLY way juice reacts to the sim

    share/                     # LANE share: clip, links, cards, daily, client integration
      clip/   (copied) clip-camera.ts  clip-pass.ts
              highlight.ts (score 9.1)  clip-job.ts (re-sim + offscreen render)  encoder.ts (mediabunny)
      cards/  result-card.ts  track-card.ts  daily-card.ts  image-card.ts (copied)
      links/  dare.ts  rivalry.ts (ledger)  share-sheet.ts  inapp-handoff.ts (copied)
      daily/  daily.ts  modifiers.ts  streak.ts
      pinkpaw/ pink-paw.ts (copied snapshot)  adopt.ts
      analytics/ analytics.ts  posthog.ts (copied, consent-gated)
```

**Integration outside the package (share lane):**
- `client/next.config.js`: the `meowRaceRewrites` and fallback block (section 8.3).
- `client/public/formula-meow-game/`: the committed build output.
- A row for `formula-meow/` in the root `CLAUDE.md` table and in `docs/CLIENT.md`. Optionally, a game card on the client game-select screen.

**Lane contracts:**
- `core` owns `types.ts`, `SimWorld` and the `RaceEvent` log.
  - `items-ai` plugs into the sim through `world.ts` hooks: `onPickup`, `stepItems`, `stepAI`.
  - `juice` only reads state and events through `bus.ts`.
  - `share` only uses `replay.ts`, the event log and `link.ts`.
- `ugc/codec` is pure, with no DOM, and is shared with `share/links`.
- **M0 handshake:** `types.ts`, `tuning.ts`, an empty `SimWorld` and a straight-line test track land first. After that, the five lanes work in parallel.

---

## 17. Tests

| Test | Where |
|---|---|
| Same inputs give the same state hash every 60 ticks and the same final hash; golden hashes per track | `core/sim/*.test.ts` |
| Trig LUT accuracy and that the sim source never calls `Math.sin` / `Math.random` (lint test) | `core/sim/fixed.test.ts` |
| Track build: arc length, query (s, d) round-trip, banking limits, racing line inside the walls | `core/track/*.test.ts` |
| Codecs: round-trip, a CRC flip is rejected, the text filter applies on decode, size targets (track ≤ 140 chars, median ghost ≤ 1.5 kB) | `ugc/codec/*.test.ts` |
| Validator: the fixture set of good and bad doodles; all authored tracks pass | `ugc/editor/validate.test.ts`, `npm run validate` |
| An AI-only race finishes under 100 s on every track and class; no kart stuck for more than 5 s | `items-ai/balance/*.test.ts` |
| Item table and balance targets (section 4.1); the Kitten podium bot reaches the top 3 in at least 80% of seeds | `items-ai/balance/balance.test.ts` |
| Ghost re-sim reproduces the recorded finish time exactly | `core/sim/replay.test.ts` |
| Playwright: link → countdown → race (scripted inputs) → result → share sheet stub; dare link shows the ghost; editor doodle → test lap → share | `e2e/` (iPhone 13 and Pixel 7 profiles plus desktop) |
| Bundle budget | `npm run budget` |

---

## 18. v1 scope

### Must have (in build order)
1. Sim core, kart physics, track build from `TrackDef`, chase camera, touch/keyboard/gamepad input, HUD, Kitchen Counter GP.
2. 7 AI drivers with the racing line, personalities and capped rubber band.
3. Drift and mini-turbo, boosts, Pounce Start, tricks, walls, off-road, the respawn hand.
4. All 8 items with the distribution table, roulette and item views.
5. Engine, SFX and adaptive music; core juice (speed lines, FOV, shake, sparks, hit-stop).
6. Kaunas Neon Rooftops (full polish), with the Pink Paw garage and rivals.
7. Dare links with ghost re-sim; the result screen; the result card.
8. Finish clip (12 s).
9. Cat maker plus the garage (3 bodies).
10. Track Doodle, codec, validator, clean-lap publish.
11. Laundry Spin, Daily Cup.
12. `build:client`, rewrites, OG pages, budget, e2e.

### Cut list (cut from the bottom up if time runs short)
| Order | Cut | Fallback |
|---|---|---|
| 1 | Yarn Canyon | 3 tracks |
| 2 | Kibble Cup | Single races only |
| 3 | Tilt steering | Drag only |
| 4 | Bloom on high | Additive sprites everywhere |
| 5 | Garage parts beyond body + paint | Fur-palette kart |
| 6 | Remix chain | Plain track links |
| 7 | Daily modifiers beyond Mirror / Cucumbers Only | — |
| 8 | Laundry Spin | 2 tracks + UGC |
| 9 | Clip encoding | Result card image + dare link (the clip is the first thing restored in v1.1) |

### Out of v1
- Online live multiplayer, accounts, server leaderboards.
- Paid cosmetics or any money flow.
- Service worker / PWA install.
- The anti-gravity loop, Cat Café and Fish Market tracks.
- Kart stat differences.
- Battle mode.

---

## 19. Your call (each has a default; work proceeds on the default)

| # | Question | Default |
|---|---|---|
| 1 | Route name | `/meow-race` (alternative: `/formula-meow`) |
| 2 | First track on a cold open | Kitchen Counter GP (tutorial). Alternative: Kaunas Neon Rooftops for a stronger first impression. |
| 3 | Rival roster | All 7 rivals are Pink Paw cats (licence already exists). Alternative: 4 Pink Paw + 3 Token Tails mascot cats. |
| 4 | Treat link on the result screen | On, to the existing tokentails.com/heist treat flow, with its exact copy |
| 5 | Desktop auto-gas | Off (hold W). Touch is always auto. |
| 6 | Landing or game-select card on tokentails.com | Add a card after v1 passes the e2e and budget checks |
