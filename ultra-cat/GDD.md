# Ultra Cat: game design

You are 60 m of orange cat. Five cities, about 90 seconds each, everything knocked off the table.
Numbers here are the targets. Code that disagrees with them should be changed, or the change noted here.

## Pillars

- **One punchy round per city.** 90 to 150 s, a final 10-second frenzy (x2 score, faster paws, clear sky), then results.
- **Cat logic.** Water, cucumbers and vacuums are the enemies. The cat swats things off and naps when it is too wet.
- **Everything procedural.** No asset files: meshes, textures, music and sound effects are all built in code.
- **Phone and desktop.** Touch UI everywhere, 60 fps target, instanced pools, no allocations in per-frame hot loops.

## Core loop (unchanged from the POC)

| Verb | Input (desktop / touch) | Effect |
|---|---|---|
| Move | WASD or arrows / left stick | Camera-relative. Buildings block the cat; walking into one at speed > 20 bonks off the low floors |
| Swat | J, F, left click / SWAT | Floors in an arc ahead (reach 26, r 17, y 5..52) fly off and everything above falls. Bats down helicopters you face |
| Pounce | Space, K, right click / POUNCE | Leap (vy 95, fwd 85) and land: r 32 area smash, punts cars, passes through flyers |
| Zoomies | Shift / hold ZOOM | Speed 62 (walk 34), bulldozes buildings |
| ULTRA | E, Q, L / ULTRA when the meter is full | The cat's ultra ability for `ultraTime` s |

- **Score.** $M per floor = value x (1 + elapsed/45) x (3 for the WANTED tower) x combo (x1, +1 per 8 hits, max x5) x frenzy x2 x city `valueMul`.
- **Combo.** A 2 s window. Hits under $0.1M (trees, taxis) don't extend it. The laser feeds it at most 4 times a second.
- **ULTRA meter.** +min(hit, 3) x `ultraCharge` per hit, +25 per fish truck. It doesn't charge while an ultra is active.
- **Patience.** Starts at `patienceMax`. Water drains it (x `wetResist`). Stacked sprays share a bucket: soak beyond 18 in the bucket (which drains 9/s) lands at 35%. A fish truck gives +35. At 0 the run ends ("TOO WET. NAP TIME."). After a cucumber startle ends, the cat is immune to new startles for 1.5 s.
- **WANTED landmark.** The first one appears at 5 s, then one every 20 s. It is the tallest tower 120 to 300 away. Toppling it (80% of its floors) pays a 50 bonus x combo and +2 s.
- **Ranks** (by damage): Lap Kitten 0, Curtain Climber 60, Vase Assassin 200, Alley Menace 600, CAT-ASTROPHE 1.5B, ULTRA CAT 3B.

## Campaign

Each city has 3 objectives, one star each. A city unlocks when the previous city has at least 1 star and the campaign total reaches `unlock`.

| # | City (id) | Look and layout | Time | valueMul | Enemies (first spawn s) | Boss | Objectives (1 star each) | Unlock | Catnip | Music |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Meowhattan (`meowhattan`) | Grey-beige day downtown. 9x9 grid, towers up to ~180 in the centre, 10% parks | 90 | 1.0 | heli (12) | – | $800M; 3 landmarks; swat 6 helis | 0 | 40 | swing 120 bpm, D mixolydian |
| 2 | Catfish Wharf (`docks`) | Orange dusk harbour. Low warehouses and container stacks, one side open water with piers, cranes as props | 90 | 1.2 | cannonTruck (14, max 1 until 30 s), heli (14) | – | $900M; flip 4 cannon trucks; finish with patience >= 50 | 1 | 60 | surf 140, A dorian |
| 3 | Purrburbia (`suburbia`) | Sunny pastel suburb. Small 2 to 4 floor houses, wide lawns, lots of trees, cul-de-sac blocks | 100 | 1.6 | vacuum (6), cucumberTower (15) | **Mecha-Dog** mini-boss at 40 s (does not end the level) | $1B; scrap Mecha-Dog; unplug 6 vacuums | 3 | 80 | suburb 110, F major |
| 4 | Nekotown (`nekotown`) | Neon night. Densest and tallest grid, 60% lit windows, glowing signs, pink road lines | 90 | 1.4 | heli (8), cucumberTower (10), cannonTruck (12), vacuum (20) | – | $1.8B; 4 landmarks; 250-hit combo | 5 | 100 | synthwave 128, A minor |
| 5 | Fort Fluffington (`base`) | Khaki military base. Hangars, bunkers, runways, radar dishes | 150 | 1.5 | heli (10), vacuum (12), cannonTruck (15), cucumberJet (25) | **Roomba Prime** at 70 s (defeat ends the level after a 5 s outro, "BOSS DOWN!"; every regular spawner waits while it is up) | defeat Roomba Prime; $2B; finish with patience >= 30 | 8 | 150 | march 132 to boss, G phrygian |

- 15 stars in total. A good first run on city 1 earns 1 to 2 stars.
- Spawning is controlled by each `EnemySpec`: `delay`, then every `max(minEvery, every - elapsed/10 x everyRamp)` s, with up to `max + floor(elapsed/maxRamp)` alive at once.
- Stars are evaluated on the final `RunResult`. `patience` objectives fail on TOO WET. A quit counts nothing.
- **Tutorial** (city 1, first play, skippable): MOVE (walk 1 s) -> SWAT a building -> POUNCE -> ULTRA (meter filled for you) -> "RAMPAGE!". The clock and spawners are frozen while it runs (`G.timeFrozen`).

## Enemies

All enemies are pooled, procedural low-poly meshes. A kill calls `reportKill` (for objectives and events), scores money and shows a pop.

| Enemy (id) | Look | Behaviour | Threat | How to kill | $ on kill |
|---|---|---|---|---|---|
| Spray-bottle heli (`heli`) | Red heli with a blue nozzle | Orbits at r 80, then hovers on a flank above paw reach for 5 s, spraying | Soak 7.5/s | Swat while facing it (d < 75, facing > 0.78), pounce through it, laser | 6 |
| Water-cannon truck (`cannonTruck`) | Red fire engine with a turret hose | Drives the streets toward the cat. Stops within 90; 1 s wind-up (turret rises, hose dribbles, hiss), then arcs water for 2.5 s at an aim point that chases the cat at 55 u/s, 3.5 s cooldown. Soaks only where and when the water lands. Flees during zoomies; drives off while a boss is up | Soak 6/s, pushes the cat 15 u/s | Swat, pounce, bulldoze, laser (flips over and burns) | 4 |
| Cucumber tower (`cucumberTower`) | Green launcher on a rooftop, 150 to 300 away | Lobs a cucumber every 3 s, leading the cat. A swatted cucumber flies back | A hit within 14 startles for 1.2 s (no input, "!" pop, fur poof) | Knock its building's top floors off, swat or laser it | 5 (a swatted cucumber is 0.5, "NOPE!") |
| Cucumber jet (`cucumberJet`) | Grey delta jet with green bombs | Strafing pass at altitude 120, dives to 70 over the cat, drops 3 cucumber bombs in a line | Startle 1.5 s and splash soak 6 | Pounce through it while low, laser, or swat it on the dive | 8 |
| Robot vacuum (`vacuum`) | 6 m disc with a bumper and a blinking eye | Chases at 26 (slower than walking, zoomies escape). Suction cone within 40 | Tug toward it 18 u/s, slow x0.7, soak 3/s | Swat, pounce landing, bulldoze, laser | 3 ("UNPLUGGED!") |
| **Mecha-Dog** (`mechaDog`, mini-boss) | 45 m chrome robo-dog with a ball cannon and a wagging antenna | Phase 1 (100 to 50%): chases, barks a cone shockwave every 4 s. Phase 2 (< 50%): charges in straight lines through buildings, fires bouncing fetch balls | Bark: startle 0.8 s + soak 8. Ball: startle 0.6 s | HP 80 (a hit stops at the 50% cut, then 1.5 s invulnerable). Swat 2, pounce 4, laser 0.15 per frame, blast 4 x power | 120 + "GOOD BOY. NOT." |
| **Roomba Prime** (`roombaPrime`, final boss) | 60 m wide disc, brushes, a water tank dome and an angry LED face | Drawn 1.75x (disc r 52), the camera widens near it. P1 (100 to 70%): roams, suction r 140 (tug 30, soak 4.5/s), drops 2 vacuums every 10 s. P2 (70 to 42%): spin attack 3 s, then dizzy for 3 s (takes double damage); shield up while not dizzy. P3 (< 42%): tank mode, sprays a water ring every 5 s and calls cucumber jets, 1.3x speed | Suction, spray ring soak 15 | HP 135 (hits stop at each phase cut, 1.5 s invulnerable transition). Pounce onto it 8 (12 when dizzy), swat 2, laser 0.2 per frame, blast 5 x power | 500 + level ends |

- Boss types emit `bossSpawn` (name and maxHp), `bossHp` on every hit and `bossPhase`. meta-ui shows the health bar.
- The final frenzy calls `onFrenzy`: flyers crash and ground units retreat. Bosses ignore it.

## Cat roster

Stats are relative to the tabby (the POC tuning). Upgrades are in the next section.

| Cat (id) | Name | Cost | Stats | ULTRA |
|---|---|---|---|---|
| `tabby` | Marmalade, orange tabby | free | walk 34, zoom 62, turn 7, r 13, swatCd .32, swat r 17, power 1, pounceCd 2.0, pounce r 32, patience 100, ultra 7 s | **LASER EYES**: twin beams sweep +-0.35 rad, reach 170, burn one floor per sample, lock on to flyers. Move x0.6 |
| `chonk` | Big Biscuit, white-orange chonk | 300 | walk 28, zoom 52, turn 5.5, r 16, head 56, scale 1.25, swatCd .40, swat r 20, power 1.25, pounceCd 2.4, pounce r 44, patience 130, wetResist .8, stunResist 1.2, charge .9, ultra 5 s | **BELLY FLOP**: 3 auto-leaps (vy 140) toward the move direction; leaps 2 and 3 home onto the nearest boss or ground threat within 160. Each landing is a radius 90 blast: power 3 for enemies and bosses, 1.45 for city $. Water-proof while airborne |
| `shadow` | Midnight, black cat with yellow eyes | 600 | walk 40, zoom 74, turn 9, r 12, swatCd .26, swat r 15, power .9, pounceCd 1.6, patience 85, wetResist 1.1, stunResist .7, charge 1.15, ultra 6 s | **SHADOW DASH**: every 0.6 s, teleport-dash 120 forward through everything (smash along the line, r 18), leaving afterimages. Immune to water and stuns while active |
| `siamese` | Duchess, siamese | 900 | walk 36, zoom 64, turn 7.5, swat reach 28, swatCd .30, stunResist .5, charge 1.1, ultra 6 s | **SONIC YOWL**: a 60-degree cone shockwave every 0.5 s, range 220. Floors fly up and away, flyers drop, ground enemies stunned 2 s. Visible ring waves |

Each cat has its own model (colours, proportions, eyes), meow pitch (`voice`: 1, 0.7, 1.1, 1.3) and ULTRA sfx.

## Economy (Catnip)

- **Catnip per run:** min(150, round(damage $M / 20)) + `catnipBase` if finished (a third of it on TOO WET) + 30 per new star. A quit earns 0.
- **Upgrades:** 4 tracks x 5 levels per cat. Cost [40, 80, 140, 220, 320] x cat multiplier (tabby 1, chonk 1.2, shadow 1.4, siamese 1.6).

| Track | Per level |
|---|---|
| `power` | swatPower +8%, swat r +4%, pounce r +4% |
| `speed` | walk and zoom +5%, turn +4% |
| `fur` | patienceMax +8, wetResist -6%, stunResist -6% |
| `ultra` | ultraCharge +8%, ultraTime +0.4 s |

- Pacing target: chonk after about 2 runs, all 4 cats and some upgrades by the boss. Maxing everything takes about 25 runs.

## Save

`localStorage['ultracat.save']` holds the JSON `SaveData` (see `src/core/types.ts`, `SAVE_VERSION = 1`).

- `migrate(raw)` accepts anything: null, garbage, older versions or partial objects. It clamps every number, drops unknown ids, keeps the tabby owned and falls back to the defaults field by field. It never throws.
- Writes happen after results, purchases and settings changes. If storage is blocked, the game plays on without saving.

## Menus and flow

1. **Title:** the attract city behind the logo, PLAY, settings cog.
2. **City map:** 5 nodes on a winding paw-print path, each with its stars, best $ and a lock with its requirement. Catnip counter.
3. **Cat select:** 4 cards with stat bars and the ULTRA name. BUY (cost), SELECT, and UPGRADE for 4 tracks with level pips and costs.
4. **Intro card:** city name, tagline, the 3 objectives (met ones ticked), PLAY. The city is already loaded behind it in the street-level shot.
5. **Play:** HUD plus a compact objectives tracker, a boss bar when a boss is up, and a pause button (also on touch).
6. **Results:** reason, damage count-up, rank, stars animating in one by one against the objectives, catnip earned, new unlocks ("NEW CITY!", "Big Biscuit affordable!"). Buttons: NEXT CITY, RETRY, MAP, CATS.
7. **Pause** (Esc, P or the pause button): RESUME, RESTART, SETTINGS, QUIT TO MAP.
8. **Settings:** master, music and sfx volume, screen shake (0 to 100%), quality (low: no shadows, pixel ratio 1; high), replay tutorial, reset save (confirm).

Every screen works with keyboard (Enter, Esc, arrows) and touch, at 390x844 and 1280x720.

## Audio

- **Music** is procedural per `MusicSpec`: kick, snare and hat from noise and sine, a bass line on scale degrees, a lead arpeggio, 4-bar loops, with a style table (swing shuffle, surf tremolo, suburb ukulele pluck, synthwave saw pad, march snare rolls; boss = double-time with an alarm stab).
  - Title and menu music is a calm variant of city 1.
  - Music ducks -8 dB for 0.4 s on `bigHit`, `ultraStart` and boss events, and is low-passed while paused.
- **New sfx:**
  - enemies: truck siren and hose, cucumber thwip and boing, vacuum whine loop (louder when near), robo bark, boss alarm and power-down.
  - cats: belly-flop splat, shadow whoosh, yowl.
  - ui: click, star ding, buy chime, unlock fanfare.
- **Buses:** master, music and sfx (`src/audio/synth.ts`), set from the settings.
