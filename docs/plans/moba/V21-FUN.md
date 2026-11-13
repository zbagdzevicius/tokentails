# Pawlegends v21: Kibble Cannon, stronger towers, burning towers (2026-11-10)

**Founder ask (verbatim):** "add cool stuff into the game that'll make it more fun to make it viral, like a cannon that
be picked up to do one-shot. also make towers stronger ( hits and more durable ). also make it go on-fire if it's low in
HP, basically tower health must be represented visually."

**Base:** `origin/main` at `8ed04e7e` (live sim v19). Sim v20 (Wild Rift chase/attack fix) is being rebalanced on
`fix/pawlegends-chase-2` in another worktree. This plan does not touch it.

**Split:**

- **(A) Render only, ships now.** Tower and core damage states (§4). No sim bump, no vendor, no replay change.
- **(B) Sim v21.** Kibble Cannon (§1), Boing Beds and the Mega Yarn Ball (§2), and stronger towers (§3). Build on
  main now, rebase onto v20 when v20 lands, then refit balance on the v20 base (the v20 hero rows move kill rates, so
  the v21 numbers below are re-checked after the rebase, not carried over blind).

All names, models and sounds are original (cats-vs-dogs house style). No other game's characters, items or assets.

---

## 0. What exists today (read from code)

| Area | Today | File |
|---|---|---|
| Pickups | Frenzy Catnip pair on the river (0:45, then every 30 s), Fish Snack per team behind its outer tower. Pickup table `pk*` with 4 slots (`CAPS.pickups`), outside the entity ids; snapshot shows them as `kind: 'pickup'` from `PICKUP_ID_BASE` | `data/pickups.ts`, `sim/units/pickup.ts` |
| Skillshots | `fireSkillshot` with `PFLAG.HeroStop` (pierce minions, stop at the first hero), on-hit effects, Clem's parry reflects (`PFLAG.Reflected`), Brutus Guard blocks | `sim/effects/projectile.ts`, `sim/combat/projectile.ts` |
| Forced movement | `FM.Dash`, `FM.Knock`, `FM.Hunt` | `sim/world.ts`, `sim/effects/dash.ts` |
| Towers (3v3) | outer 1,800 / inner 2,200 HP, armour 40 / 50, 1 shot a second, 90 to heroes, +20% a consecutive shot capped at +60%, 1.2 s lock-on, 110 to minions, backdoor −50%, Sunset ×2 damage taken | `data/towers.ts`, `sim/units/tower.ts`, `sim/combat/attack.ts`, `sim/combat/damage.ts` |
| Towers (5v5) | Hearthwood rows: outer 2,400, inner 2,800, gate 3,200, hearth 3,000; same shot rules | `data/maps/hearthwood.ts` |
| Tower render | charge glow, recoil, hit tint, invulnerable bubble, topple + chunks + rubble line (4 s hold, 1.5 s sink), x-ray fade, aggro ring | `render/views/towerView.ts` |
| HP readout | overhead bar with the trailing chunk and a tick every 500 HP; minimap squares, fallen towers greyed and crossed | `ui/overhead.ts`, `ui/minimap.ts` |
| Moments | announcer `Moment` with banner / callout / pop, `slowmo`, `shake`, `crowd`, `rank` (results "Best moment"), `voice` | `render/announcer.ts`, `audio/voiceLines.ts` (clips in `public/voice/`) |
| Bots | take Frenzy within `BOT_AI.pickupRange`; never dodge skillshots | `sim/bots/brain.ts` |
| Gates | 3v3 `--gate balance`: median 6:30–9:00, p95 ≤ 10:30, heroes 46–54%, cats 47–53%, takedowns 2.5–3.5 a minute, trailing at 3:30 wins 20–40%, down 10+ wins < 5%. 5v5 `hearth-gates.mjs`: median 12:00–14:30, ≤ 2% safety end, heroes 46–54%, side and species 47–53% | `tools/lib/funstats.mjs`, `tools/hearth-gates.mjs` |

A Catnip Frenzy pickup is already in the game, so it is not on the new list.

### 0.1 Tower baseline (measured for this plan)

A probe on the bundled v19 sim, with slot 0 as a `normal` player-bot against Normal bots (Crossing: 80 seeds;
Hearthwood: 30 seeds, both with Clem in slot 0). The probe script is a scratch file. It is not committed.

| v19 | Median length | 1st tower falls | 3rd tower falls | Towers a match | Hero deaths a match | Deaths to towers |
|---|---|---|---|---|---|---|
| Crossing (80 seeds) | 7:14 | 3:27 | 4:56 | 4.6 | 24.2 | 2.3 (9.4%) |
| Hearthwood (30 seeds) | 13:04 | 3:52 | 5:14 | 9.8 | 51.4 | 4.1 (7.9%) |

Reading: a tower falls every ~90 s once the first one goes, and towers cause under 10% of hero deaths. A dive under an
outer tower costs little, which is what "make towers stronger" is about.

---

## 1. Kibble Cannon (sim v21)

A big brass party cannon loaded with one giant kibble. One per map at a time. Anyone can grab it. One shot that
one-shots the first enemy hero it hits. Everyone sees it coming.

### 1.1 Spawn

| | Crossing (3v3) | Hearthwood (5v5) |
|---|---|---|
| First spawn | **1:30** (2700) | **3:00** (5400) |
| Respawn | **75 s** after it is fired or fizzles (2250) | **90 s** (2700) |
| Warning | `cannonSoon` event and a minimap marker **10 s** before (300 ticks) | same |
| Spots (alternate per spawn) | (50000, 36000) and (50000, 24000): on the river centre line, 6 m either side of the Pudding pit | (78000, 50000) and (50000, 78000): on the river line `x + y = 128 m`, between the centre crossing and each pit |
| Last spawn | none after Sudden Death starts | same |

- Every spot sits on the line equally far from both cores (Crossing x = 50 m; Hearthwood x + y = W), so no spawn favours
  a team. Each spot must pass `grid.ts` walkability. If a spot is blocked, the build moves it to the nearest walkable
  cell on the same line and the test pins it.
- **Underdog Cannon** (comeback hook, on by default): if a team meets the existing `COMEBACK` trigger at spawn time
  (3+ structures or 8+ takedowns behind), the cannon spawns 5 m toward that team's side of the river on the same
  perpendicular. If the trailing-at-3:30 gate goes above 40%, set the offset to 0.
- It lives in pickup slot 4 (`CAPS.pickups` 4 → **5** on both maps), kind `'cannon'`, team neutral.

### 1.2 Pick up and carry

- Walk over it (the same `PICKUPS.radius` check, run in `collectPickups`, ascending hero id, so ties are deterministic).
- The carrier is stored in new globals: `G.CannonBy` (hero id, −1), `G.CannonT` (fuse ticks left), `G.CannonAt`
  (next spawn tick), `G.CannonSpawns`, `G.CannonX`, `G.CannonY` (drop spot). They are appended after `G.LaneSwapT` and
  `G.Count` grows, so Crossing hashes change, as v21 needs.
- While carrying:
  - **−15% move speed** (added to the move-speed bp sum, so slows still apply).
  - **Revealed to both teams** (refresh `revealT` every tick: no brush or stealth hiding).
  - **Fuse 20 s** (600). At 0 it **fizzles**: a sad "pfft" puff and confetti, no damage, then the respawn timer starts.
  - Abilities, basics and the Paw Trick still work. **Nap drops it** at the carrier's feet. A dash or a blink keeps it.
- **Drop on death** (or Nap): it lies at the spot for **8 s** (240), **pickable by either team** (the steal moment).
  If nobody takes it, it fizzles. A dropped cannon keeps its remaining fuse (at least 5 s), so a steal can still fire.

### 1.3 Fire

- **Command:** new `Op.Fire = 11`, payload x, y (5 B like `Trick`). Dropped (not logged) when the sender does not hold
  the cannon. Replays and the relay carry it like any command. `OP_SIZE`, `quantize`, the codec and `MAX_INPUT_BYTES`
  (+15 B a match is enough) are updated in the same commit.
- **Telegraph:** **0.75 s windup** (23 ticks). The carrier is planted (rooted, can still be hit). Both teams get a
  `windup` event with new `slot: 5` and the aim, and the render draws the shot lane (1.2 m wide, full range) in red for
  enemies and gold for allies, plus a fuse spark on the cannon.
- **Interrupt:** any hard CC on the carrier during the windup (stun, fear, charm, knockback, root does *not* count)
  cancels the shot and **fumbles** it: the cannon drops at the carrier's feet with 5 s fuse left. Callout "Fumble!".
- **Shot:** `fireSkillshot` with a new `PROJECTILE_KIND.kibble = 16` (append only), speed **24 m/s**, range **16 m**
  (Crossing) / **18 m** (Hearthwood), radius **0.7 m**, flags `HeroStop` (it rolls through minions).
  - **First enemy hero hit: KABOOM.** Damage = the hero's HP + shield, dealt as `pure` with a new `execute` option that
    skips Nine Lives (a one-shot that a passive could cancel would read as a bug). Kill credit, Fish, XP and bounty go
    to the shooter as for any takedown.
  - **Still beats it:** a dodge; Clem's parry (it flies back as the parrier's shot: "Return to sender!"); Brutus's Guard
    block (the guard breaks, he lives); a Pounce or dash out of the lane; being untargetable. These are the skill
    moments, and every one of them is a clip.
  - **Minions in the lane:** 250 damage each (they are bowled, not blocking).
  - **Towers and cores** (new: the kibble stops on an enemy structure footprint): **12% of max HP**, respecting
    invulnerability and backdoor protection. Capped, so it never takes a tower alone.
  - **Neutrals** (camps, Grizzlechop, Pudding's calm meter): **10% of max HP**, credit to the shooter's team as usual.
  - **Splash:** none. One shot, one victim, so it reads.
- The cannon is gone after the shot. The respawn timer starts on the shot tick.

### 1.4 Bots

- Grab: a bot goes for the cannon when it is the nearest unit of its team to it, or within 15 m, unless it is below 35%
  HP or defending its base (the existing base-threat rule wins).
- Fire: when an enemy hero is visible within **6 to 14 m** and the line is clear of an enemy Clem facing the carrier,
  fire at the target's **current** position (no lead). Bots do not dodge, so this keeps their hit rate honest against
  moving humans.
- Fuse: with under 3 s left a bot fires at the nearest enemy tower in range, or at its facing.
- All in `bots/brain.ts` on the 6-tick think; deterministic (no `Math.random`, ties by id).

### 1.5 Phone readability

- On the ground: a chunky brass cannon on a red-and-cream party wheelbase, gold ground ring and the existing pickup
  light beam (`PICKUP_BEAM`), 1.4× the Frenzy gem size.
- Carried: the cannon rides on the carrier's back, barrel up, 1.2× scale, a lit fuse spark every 0.5 s, and a gold
  team-coloured ring under the carrier. Seen by both teams at any zoom.
- HUD: the **Attack button turns into the FIRE button** while carrying (cannon icon, pulsing ring, fuse arc counting
  down). **Tap = quick-cast** at the nearest visible enemy hero within range, else straight ahead (the zero-friction
  rule). **Hold and drag** = aim with the existing `abilityAim` stick, release to fire. Desktop: **F** or a click on the
  FIRE button, aimed at the cursor.
- Minimap: a cannon glyph at the spot (both teams), then on the carrier, plus the 10 s warning ring.
- Kill feed: a cannon icon between killer and victim.

### 1.6 Juice and the share moment

| Beat | Visual | Audio | Announcer |
|---|---|---|---|
| 10 s warning | minimap ring, river spot glows | low drum roll | — |
| Spawn | cannon drops from the sky, bounces, dust ring | clank + cheer | **"Kibble Cannon!"** (`cannonSpawn`) |
| Pick up | gold burst, carrier name in the feed | brass "ka-chunk" | own team: "We've got the cannon!"; enemy: "They've got the cannon!" |
| Windup | lane telegraph, fuse sparks, cannon swells | fuse hiss | — |
| Fire | big muzzle cloud (alpha PUFF ×10), recoil pushes the carrier back 0.5 m (render only), kibble spins with a smoke trail | deep boom (`boom` zzfx, pitched down) | — |
| Hit hero | ring shockwave, kibble crumbs (CONFETTI + STAR4), victim flies a cartoon arc (render), 120 ms hit-stop | **"KABOOM!"** (`kaboom`) + crowd roar | banner "KABOOM! {shooter} kibbled {victim}", `slowmo { ms: 900, scale: 0.3 }`, shake 0.9, rank above Triple |
| Miss | kibble bounces off the far edge and rolls away | "boing" | pop "Whiff!" over the shooter, crowd "ooh" |
| Parried | kibble reverses with a gold trail | clang | banner "Return to sender!" |
| Fumble | cannon tumbles to the ground | clatter | callout "Fumble!" |
| Fizzle | "pfft" puff, a flag pops out of the barrel saying "BANG" | sad trombone (zzfx) | — |

- **Slow-mo** only when the impact is on screen; otherwise the banner and minimap ping. The camera gets a 6% zoom punch
  toward the impact (render only, off under reduce motion).
- **Auto highlight (cheap):** a cannon kill ranks as the match's best moment unless a Pentakill-class moment beat it,
  so the results screen shows "Best moment: KABOOM on Brutus" and the existing dare share text (`share/dare.ts`) uses
  it: "I KABOOMed Brutus with the Kibble Cannon. Your turn." No video in v21. A replay clip of the last 5 s (the sim
  re-sims from the record) is listed for later.
- Voice: three new clips (`cannonSpawn`, `cannonOurs` / `cannonTheirs`, `kaboom`) recorded with the same voice and
  pipeline as `public/voice/`; until they exist the keys say nothing (the existing rule).

### 1.7 Expected effect and checks

- About **4 cannons a Crossing match** and **6 on Hearthwood**. With bots aiming at current positions, expect 50–70% to
  kill: **+2 to +3 takedowns a 3v3 match (+0.3 to +0.4 a minute)**. The 3v3 gate band is 2.5–3.5 a minute and v19 sits
  at 3.37, so this is the risk. **Default:** keep the band. If the gate fails, lengthen the respawn to 105 s first,
  then 120 s. Widening the band to 3.8 is a founder call, not a default.
- Tests: pickup / carry / drop / steal / fizzle / fumble / parry / Guard / Nine Lives skipped / tower cap / neutral cap,
  each a scripted unit test; a replay test with `Op.Fire`; determinism over 40 seeds on each map.

---

## 2. More viral mechanics

| # | Idea | Fun / clip value | Cost | Balance risk | v21? |
|---|---|---|---|---|---|
| 1 | **Boing Beds** (springy cat beds that launch you across a wall) | High: flying cats and dogs, surprise ganks, escapes | **Low**: one new FM kind, fixed data, no AI targeting | Low: symmetric, fixed spots | **Yes** |
| 2 | **Mega Yarn Ball** (kick it, it rolls down a lane and bowls enemies over) | Very high: "strike!" moments with 3+ heroes | Medium: reuse the skillshot step for the roll | Medium: knockback near towers | **Yes** |
| 3 | Cardboard Box (a pickup: become a box for 8 s, identical to decor boxes) | High (ambush clips) | Medium: decor boxes on both maps, stealth rules exist | Medium in PvP | Later (v22) |
| 4 | Robo-Vacuum (a neutral that roams the river and pulls nearby units in; dogs bark at it) | High comedy | Medium-high: new neutral AI | Medium | Later |
| 5 | Sprinkler Time (a river zone turns on at Sunset, slows and "wet" cats look grumpy) | Medium | Low | Low | Later |
| 6 | Grizzlechop steal cheer ("Snack thief!" when the last hit steals him across the pit) | Medium | Very low (event + banner exist: `buffSteal`) | None | Render-only, can ride with (A) |

**Picked for v21: Boing Beds and the Mega Yarn Ball.** Boing Beds are the cheapest thing that makes ordinary moments
look funny on a phone (every rotation becomes a cartoon jump) and need no new targeting. The Yarn Ball is the
best clip machine after the cannon (one kick, three dogs knocked over) and is mostly the existing skillshot code. Both
are neutral and symmetric, so they barely move hero balance. The Box needs decor on both maps and PvP stealth testing,
so it waits.

### 2.1 Boing Beds

- **Spots:** Crossing: 2 per side (4), each in the jungle loop: one from the rat camp side over the wall at
  (35000–37000, 26000–34000) to the river, one from behind the outer tower toward the rat camp. Hearthwood: 3 per side
  (6), one per quadrant mouth, plus one each side of each pit's back wall. Exact launch and landing points are authored
  for team 0 and reflected (`mirrorX` / point reflection); each landing must be walkable and outside any wall.
- **Trigger:** a living hero whose centre comes within **0.9 m** of a bed while it has a move order whose goal is
  beyond the bed (so standing next to it never launches anyone). Per-hero, per-bed cooldown **3 s**.
- **Launch:** new `FM.Leap = 4`: a fixed **0.9 s** (27 ticks) flight to the landing point, straight in the sim (the arc
  is render only), unstoppable (no CC can stop it once airborne), cannot attack or cast, still hittable. Landing gives
  nothing extra.
- **Bots:** a bot uses a bed when its landing is at least 8 m closer to the bot's goal along the nav path than the bot
  is now, and the bed is within 5 m. Otherwise it walks.
- **Juice:** squash and stretch of the bed, a "boing" spring sound, a spin in the air, a dust ring on landing. Phone:
  beds are 1.6 m soft pastel cushions with a paw print, readable at any zoom; a faint arc preview when the own hero
  stands within 3 m.
- **Data:** `data/boing.ts` (spots per map), sim in `units/boing.ts` (no new entities: a fixed table, nothing to hash
  but the per-hero cooldowns `boingT`, which are hashed).

#### v24: instant beds (sim v24, 2026-11-12)

Founder report (Blitz, touch): "these in Blitz are glitchy, they must be better, more sensitive, as right now it takes
time and several attempt to be lifted at all". The screenshot showed a hero stopped right next to a bed, not launched.

**Why v21–v23 missed.** A launch needed the hero's centre within 0.9 m of the bed centre AND a move (or attack-move;
v23: kite) whose goal was within 0.6 m of the bed or nearer the landing than the bed. The touch stick sends a move 2 m
ahead along the thumb every 100 ms, so a hero steered onto a bed from the side had a goal past the bed but not toward
the landing and never launched; a hero let go on the cushion (Op.Stop, Order.None) never launched; and the 0.9 m reach
was smaller than the drawn bed (rim to 1.15 m). Headless repro: the 200 touch trials of `tests/unit/boing-v24.test.ts`
run on v23 leave **117 of 200 never launched** (stick, tap and stop styles alike).

**v24 rule** (`units/boing.ts`, `data/fun.ts` BOING):

- The disc: hero centre within `BOING.reach` = **1.2 m** of the bed centre. The drawn rim ends at 1.15 m and a hero is
  0.5 m wide, so a hero half on the cushion is on it; one brushing the rim from outside (centre ≥ 1.65 m) is not.
- **Walking onto it launches at once**: a move, attack-move or kite whose goal is within `BOING.near` = **3.2 m** of the
  bed (a click or tap on or by the cushion; the stick's 2 m look-ahead from anywhere on it), unless the hero walks away
  from the landing (goal more than 120° off the throw: a hero coming back over the wall is not thrown straight back); or
  a far goal the throw brings at least half the throw's length nearer (v21: any far goal nearer the landing than the
  bed, which threw walks across the map that only grazed a bed).
- **Stopped on it launches after `BOING.stand` = 8 ticks (0.27 s)**: Order.None in the disc, counted in the new hashed
  per-hero `bedT`.
- **Not launched:** brushing the rim; walking past to a far goal (a lane walk over a bed beside the lane); an Attack on
  a foe from the cushion (a fight is not cut short by a throw).
- After a launch, a goal no nearer the landing than the bed becomes the landing (v21 did this only for a goal on the
  bed), so a hero thrown off a stick step stays there and does not walk back over the bed.
- Flight, the 3 s cooldown, the `free` conditions (alive; not disabled, rooted, napping, casting, dashing or winding the
  cannon) and the landing are unchanged. Bots use the same rule; `bots/fun.ts` `bedHop` is unchanged (a bot within 5 m
  of a bed whose landing is 8 m nearer its goal walks onto the bed centre, and now launches as it reaches the disc).

**Client** (`render/views/funView.ts`): a bed wobbles (45% of a launch's squash) the moment any hero's drawn centre
enters its disc; while the player's own hero is within 6 m of a bed (and not flying) seven dots drift along the flight
arc to a ring at the landing (bed colour, fading in over the last 2 m, still under reduce motion) and the bed's throw
arrow brightens; on the `boing` event the bed squashes fully, puffs and sends a ring, and `bedBoing` plays on that same
event (gameView), so sound and squash land on the launch tick.

**Tests** (`tests/unit/boing-v24.test.ts`): 200 seeded touch trials over every bed on Crossing and Hearthwood, a random
hero, a start 2.5–5 m out on a walkable line from the throw's side, three styles (the stick held toward and across the
bed with ±0.15 rad wobble; one tap on a random cushion spot; the stick onto the cushion while the bed cooldown runs, let
go as it ends): **200 / 200 launch within 9 ticks (0.3 s)** of the centre reaching the disc (stop style: of the let-go).
A hero placed on the cushion and stopped launches on tick 8. Attack, attack-move and kite fights with the centre
0.15–0.45 m outside the disc never launch, on every bed of both maps (90 ticks each); an Attack from the cushion does
not launch; a lane walk across a bed to a far goal and a walk off it backwards do not; a hero thrown while walking past
stays at the landing.

**Bed use** (headless probe, 80 seeds from 7000001 per mode, `normal` player-bot + bots; launches a match, v23 → v24):
walks onto a bed the bot chose Skirmish 1.99 → 2.42, Blitz 0.36 → 0.36, Classic 0.55 → 0.35 (20 seeds); every other
launch (incidental) 1.90 → 0.66, 0.86 → 0.16, 0.30 → 0.20. Repeat throws of one hero off one bed within 15 s stay at
≤ 0.03 a match (no bed traps).

**Versioning.** `SIM_VERSION` 24 (the world gains the hashed `bedT`, so every match hashes differently from v23).
`tools/vendor-sim.mjs` freezes v23 at `de5ca5b5` (the kite review re-vendored the bundle after `9a743dc7`; bundle
`13d26de9…`, the kite fixture in `extra`), so the backend verifies 10 to 24. The party-identity golden is regenerated
from the v24 sim and its live v24 fixtures (Crossing bots step onto beds differently). Crossing identity
(`map-identity --check`, 500 seeds × 3 profiles from 6500001, baseline written from v23 at `de5ca5b5`): 0 / 1500
identical, by construction (the new hashed field), so the gates below compare v24 with v23 on the same seeds instead.

**Gates on unseen seeds, v24 and v23 on the same seeds** (v23 = `git archive de5ca5b5`):

| Gate | Seeds | v24 | v23 on the same seeds |
|---|---|---|---|
| 3v3 Skirmish (`--gate balance`) | 8,000 from 6200001 | 35 / 35 pass: side 50.0%, cats 49.3%, heroes 47.8–52.3%, median 7:11, p95 8:31, 0 safety, 3.48 takedowns/min, trailing at 3:30 wins 28.3%, down 10+ wins 2.0% | 35 / 35: side 49.7%, cats 49.4%, heroes 47.7–53.3%, 7:11 / 8:31, 3.47, 27.4%, 1.5% |
| Blitz (`--gate blitz`) | 4,000 from 6300001 + 4,000 from 6700001 | pooled: side 47.2% (windows 46.6% / 47.8%), cats 50.7%, 20 / 20 heroes 47.5–52.5% (Brutus 45.9% in window 2 alone), 2:55 / p95 2:59, 100% core, 4.03 takedowns/min, trailing at 1:30 wins 16.0% | pooled: side 47.9% (47.1% / 48.6%), cats 51.5%, 20 / 20 heroes 46.3–53.4% (Marshmallow 45.9% in window 1 alone), trailing 15.4% |
| Classic (`hearth-gates --det 40`) | 600 seed pairs from 6400001 (1,200 matches) | side 48.8%, cats 50.1%, 20 / 20 heroes 47–54%, p50 13:06 / p95 13:13, 0 safety, determinism 120 / 120 | side 49.3%, cats 49.3%, 19 / 20 (Gabe 45.2%), 13:06 / 13:13 |
| Determinism (`determinism.mjs`) | 100 seeds from 6600001 + PvP, Blitz, Hearthwood every 4th | all identical | — |

The Blitz side band (47–53%) misses in window 1 for both versions on the same seeds, and Blitz "trailing at 1:30 wins
20–40%" fails on both (v23's own release table: 15.5%); neither moved with the beds. A first draft of v24 (any far
goal nearer the landing than the bed still launched, with the wider disc) doubled the throws of walks that only grazed
a bed (Classic 0.3 → 1.1 a match) and Classic fell to 15 / 20 heroes (Aviete 43.4%) on these seeds; the half-throw gain
rule for far goals fixed it before these runs.

**Checks.** `tsc` (pawlegends, backend), `lint:sim` (163 files), `vendor-sim:check` (v10–v23 frozen, v24), `vitest`,
backend `jest src/pawlegends src/vendor`, `build`, `budget` (first load 425.0 KB gzip, party chunk 43.6 KB). Not run:
`npm run build:client` (the client bundle ships with the release) and a device check of the new bed guide.

### 2.2 Mega Yarn Ball

- **Spots:** Crossing: two balls, (50000, 46000) and (50000, 14000) (river, beside each lane crossing). Hearthwood: one
  ball at the centre crossing on Yarn Road (64000, 64000). Up from **1:00** (Crossing) / **2:00** (Hearthwood).
- **Kick:** a hero moving into the ball (centre within 1.6 m of it, with a move or attack-move order) kicks it in its
  movement direction. A ball rests **1.5 s** between kicks.
- **Roll:** a skillshot from the ball's position with a new `PROJECTILE_KIND.yarn = 17`, owner = the kicker: **11 m/s**
  (slow and readable), range **20 m**, radius **1.2 m**, `Pierce`. It stops at a wall cell, a structure or the range end
  and rests there.
  - Enemy heroes of the kicker: **120 + 5% max HP** and a **2.5 m knockback** along the roll (each hero once a roll).
  - Enemy minions: 150 and the same knockback.
  - Enemy structure it stops on: **5% max HP** (capped, backdoor rules apply).
  - Allies and neutrals: pass through.
- **Lifetime:** unravels after **3 kicks** (a burst of yarn strands), back at its home spot **45 s** later.
- **Bots:** a bot kicks it when it stands within 4 m and the kick line toward an enemy hero or an enemy wave within
  15 m is clear. Otherwise it ignores the ball.
- **Juice:** the ball spins and leaves a wobbly yarn trail (the existing decal ribbon), knocked heroes tumble, and three
  or more heroes hit by one roll fire a "STRIKE!" banner with a 0.5 s slow-mo and crowd cheer.
- **Data:** the balls live in a small fixed table (`yb*`: x, y, state, kicks, rest ticks, home), all hashed.

---

### 2.3 v25: deliberate toys (sim v25, 2026-11-13)

Founder report (verbatim): "ultracode fix in-game objects in fun mode ( "ball", "cannonball", "trampoline" ) as it's
hard to navigate through them". None of the three is solid (the nav grid never sees them); each one grabbed a hero that
only walked past, and each trigger reached past what is drawn. Headless sweep (straight walks past every toy of both
maps, 24 headings × 0 / 0.6 / 1.2 / 1.8 / 2.4 m off centre; a touch stick is a move 2 m ahead every 100 ms, a click is
one move to the end):

Grabbed at 0 / 0.6 / 1.2 / 1.8 / 2.4 m off centre. "v25 first cut" is commit 4ad0f76a; "v25" is the shipped rule after
the QA re-run (`.toys/measure-v25c.json`; its stick is the client's, with the cannon look-ahead step below).

| Toy, input | v24 | v25 first cut | v25 |
|---|---|---|---|
| Bed, Crossing, stick | 40.6% (84 / 83 / 43 / 0 / 0; 1.09 s lost a walk) | 13.2% | 13.2% (27 / 29 / 15 / 0 / 0; 0.30 s), every one a walk heading within 60° of the throw |
| Bed, Hearthwood, stick | 42.6% (3.08 s, worst 12.1 s) | 0% | 0% |
| Bed, click (both maps) | 0% | 0% | 0% |
| Yarn, stick (both maps) | 60% (100 / 100 / 100 / 0 / 0) | 46.7% (100 / 100 / 33 / 0 / 0) | 40% (100 / 100 / **0** / 0 / 0): only a walk into the ball; no time lost |
| Yarn, click (far goal) | 60% | 0% | 0% |
| Cannon, stick (both maps) | 80% (100 / 100 / 100 / 100 / 0) | 40–41.7% (100 / 100 / 0 / 0 / 0) | **0%** at every offset, straight over it included |
| Cannon, click (far goal) | 80% | 0% | 0% |

The first cut still took the cannon from any stick walk 0–0.6 m off centre (a touch player on Crossing's river centre
line, cannon at (50, 36) / (50, 24), had to steer 1.2 m around it) and kicked the ball on a third of stick passes 1.2 m
off. The QA re-run fixed both (below). Moving the cannon spots off the river line (investigation option B) was not
needed after that and would have re-opened the 3v3 balance gate the cannon respawn was tuned on.

**v25 rule** (`units/boing.ts`, `units/cannon.ts`, `units/yarn.ts`, `data/fun.ts`; heading tests are `within60` in
`fixed.ts`, integer roots, no floats):

- **Boing Bed.**
  - A near goal (within `BOING.near`, 3.2 m) launches only a walk heading within 60° of the throw: onto the bed from
    behind, toward the landing (v24: 120°).
  - The far-goal rule (desktop clicks) is unchanged.
  - A walk that crosses the disc to anywhere else (a stick's look-ahead, a kite) or a fight on it marks the hero
    (`bedT` −1), and a stop there afterwards does not throw it.
  - A hero that arrives at a spot on the cushion (within `BOING.arrive`, 0.6 m, of a goal on it: a tap on the bed from
    any side, a bot walking onto it) and stops is thrown after `BOING.stand`, now 15 ticks (0.5 s; v24: 8 ticks for
    anyone stopped).
  - The rat-camp bed moves 1.5 m nearer its wall, from (33, 30) to (34.5, 30), landing at (42.5, 30): the same 8 m throw, 4.5 m from the camp.
  - Hearthwood's Gutterway beds stay where they are: the forest starts at y = 14 m, so they cannot go further off the
    lane, and the cone rule already takes their walk-past throws to 0.
- **Kibble Cannon.**
  - The reach stays at v24's: the hero's centre within `CANNON.reach` + hero radius, 1.5 + 0.5 = 2.0 m. The gold ring is
    drawn out to it instead (1.15–1.55 m, v24: 1.0–1.35 m), so a hero's body touches the ring exactly when it can take
    the cannon.
    - A 1.5 m sim reach was tried first and moved Hearthwood's 5v5 balance. On the same 600 seeds, 12 of 20 heroes
      were in band against v24's 20 of 20 (Marshmallow 42%, Aviete 56%), with cats at 53.3%.
    - Ablations: the v24 rule at 1.5 m also failed; the v25 rule at 2.0 m passes.
  - The hero must also either stand there (Order.None: a touch stick let go on the ring sends Stop) or walk with its
    goal within `CANNON.aim` (0.8 m) of the cannon: a tap on it, or a bot fetching its spot.
  - **Touch stick (input only, QA re-run).** The stick's 2 m look-ahead swept over the cannon, so every stick walk
    0–0.6 m off its centre counted as "walking at it". `input/touch/assist.ts` `stickAhead` now steps the look-ahead
    further along the stick (250 mm steps, up to 5 m) until it is `STICK_CANNON.clear` (1.1 m) from a grounded cannon.
    A stick walk over it passes; letting the stick go on the gold ring takes it. No sim change, so balance is the
    first cut's. A client-like stick (re-sent once within 1 m of its goal) over the cannon in 24 headings × 0 / 0.3 /
    0.6 m × 4 heroes takes it 0 / 288 times with an input lag of 0, 2 or 4 ticks; at 6+ ticks (200 ms) the hero reaches
    its goal and stops on the ring, and a stop there takes it.
  - A sim rule was tried first (`CANNON.arrive` 250 mm: a walking hero takes it only within 0.25 m of a goal on it).
    It also fixed the stick, but moved Hearthwood's 5v5 balance through the pilots' cannon contests: on 600 seed pairs
    from 6400001, Gabe 44.2% and Sage 45.1% against 20 / 20 in band without it (the yarn 45° rule alone, below).
  - A walk past it, or a fight beside it, leaves it on the ground. There is still no drop, only Fire.
  - By design, a hero standing still within the ring takes it even when it was not after the cannon (all-bot matches:
    3 of 23 Skirmish and 6 of 21 Classic pick-ups came from a bot whose goal was not the cannon, mostly standing).
- **Mega Yarn Ball.**
  - It is kicked when the hero's body touches the ball: within `YARN.kickReach` 1.35 m (0.85 m ball + 0.5 m hero;
    v24: 1.6 m).
  - The walk must also head within 45° of the ball (`YARN.coneBp` 7071, `withinCos` in `fixed.ts`; first cut 60°),
    with its goal within `YARN.near` (3.2 m) of it. With the 1.35 m contact a pass 0.95 m or more beside the ball's
    centre never kicks it, stick or click; a stick walked into it (0–0.6 m off) still kicks it, which costs no time.
  - The ball rolls along the walk (goal − hero), so a stick aims it. A walk through it to a far goal passes.
  - Render: a resting ball leans up to 0.45 m away from a hero body inside it (`BALL_NUDGE`), so a walk through it
    that does not kick reads as brushing a toy rather than a missing hitbox; an unravelled ball shrinks away over
    0.35 s instead of vanishing in one frame (a third kick against a tower stops in about one tick).
- **Enemy fountain (general pathing, every mode and map; call it out in the PR and release notes).** A walking hero slides along its edge (the x step alone, else the y step) instead of stopping
  dead (`units/hero.ts` `walk`). A v25 bot match on Crossing (seed 6, `nav-v16.test.ts`) held a Brutus still for 119
  ticks against it. In 160 seeds this happened once on v25 and never on v24.
- **Render** (`funView.ts`, no hash impact): the cannon ring ends where the body takes it (`CANNON_RING`, 1.15–1.55 m),
  the ball is drawn at the kick contact (`BALL_R` = kickReach − hero radius), and the bed guide adds a faint wedge behind
  the cushion for the ±60° way in that throws.

**Tests.**
- `tests/unit/boing-v25.test.ts` (was boing-v24): 200 seeded approaches within ±55° of the throw.
  - A stick launches within 0.3 s; a let-go launches at the stand; a tap on the cushion launches within 2 s.
  - Every bed of both maps, crossed by stick 75–180° off its throw at 0–1.1 m (let go there or not), is never thrown.
    75° is used because goal quantisation (250 mm) and the shrinking stick look-ahead wobble the heading by about 10°.
  - A fight and then a pause on the cushion does not throw.
  - A tap from the side throws `stand` ticks after the stop.
- `tests/unit/fun-toys-v25.test.ts`:
  - Cannon pick-up radius and intent: client stick walks straight over it and 0.3–1.4 m beside it never take it; a
    stick let go on it, a tap on it (taken as the body reaches the ring) and a stop after a fight do. `stickAhead`
    never leaves the look-ahead within `CANNON.aim` of the cannon (72 headings × ±3 m × ±4 m).
  - Yarn kick contact, intent and kick direction: stick passes 1.0–1.3 m off never kick.
  - A stick straight up Crossing's river centre line over either cannon spot, three heroes, both ways: never taken, no
    stall, the same arrival tick as without the cannon.
  - Crossing's river line with the cannon and both balls on it, walked by stick and by click with three heroes: no
    grab, no still run of 3 ticks, the same arrival tick as without toys.
  - Every toy of both maps walked past in 24 headings: the same checks (the cannon by stick and click straight over its
    middle; the ball by stick 1.2 m beside it, by click straight over it).
  - All-bot Blitz matches still take the cannon, kick a ball and take a bed.

**Versioning.** `SIM_VERSION` 25. `tools/vendor-sim.mjs` freezes v24 at `73b6404e` (bundle `c12a7ae2…`, the same nine
`extra` fixtures as v23), so the backend verifies 10 to 25 (`pawlegends-live.spec.ts`: the version lists, and a v25
case where v25 records verify on v25 only and the frozen v24 still verifies its own). The party-identity golden is
regenerated from the v25 sim and its live v25 fixtures.

**Backend replay worker.** The replay worker now reports `ready` once its sims are loaded, and a replay's 10 s timeout
starts from then (`pawlegends-live.ts`). A start that never gets ready is given up after 60 s.
- Why: with the 16th bundle, a cold start from TypeScript sources (jest, ts-node) took 10.0 s (9.8 s with 15 bundles).
  The first replay after each restart got a 503 and the worker was killed, so every worker-thread case of the `/live`
  spec failed.
- Production loads the compiled worker and was not near the limit.
- **Naive smoke check.** `tests/unit/naive.test.ts` now samples 24 seeds and needs at least 19 wins (it was at least
  6 of seeds 1–8). Two of those eight Rookie wins came from accidental bed throws, which v25 no longer makes. The
  `fun1` gate (200 seeds) reads 93.5% on v25 against 97.0% on v24, above its 85% bar.

**Gates on the shipped v25** (unseen seeds, the same windows as v24):

| Gate | Seeds | v25 | Notes |
|---|---|---|---|
| 3v3 Skirmish (`--gate balance`) | 8,000 from 6200001 | 35 / 35 pass: side 50.5%, cats 49.1%, heroes 47.6–53.5%, median 7:11, p95 8:31, 0 safety, 3.48 takedowns/min, trailing at 3:30 wins 27.5% | — |
| Blitz (`--gate blitz`) | 4,000 from 6300001 + 4,000 from 6700001 | side 47.3% / 48.4%, cats 50.4% / 51.6%, every hero in band in both windows (Duchess 53.3% / 52.8%); trailing at 1:30 wins 13.3% / 15.5% | The trailing check also fails on v24 (16.0%) and v23 (15.4%). |
| Classic (`hearth-gates --det 40`) | 600 seed pairs from 6400001 (1,200 matches) | side 51.3%, cats 50.6%, 20 / 20 heroes 46–53%, p50 13:06 / p95 13:13, 0 safety, determinism 120 / 120 | v24 on the same seeds: cats 50.1%, 20 / 20 |
| Determinism (`determinism.mjs`) | 100 seeds + PvP, Blitz, Hearthwood every 4th | all identical | — |
| `fun1` / `fun2` | 200 each | `fun1` win 93.5% (v24 97.0%); `fun2` win 71.5%, takedowns 2.49/min | v24's `fun2` also fails takedowns (2.50 shown). |

**Watch: Blitz Duchess.** She is in band on the gate seeds, but sits high on every other window and higher than v24
on the same seeds: 2,000 from 7200001 58.2% (v24 53.6%), 7300001 54.2% (v24 51.3%), 6300001 52.7% (v24 50.0%),
6700001 52.3% (v24 54.0%). Over those 8,000 seeds she reads about 54.4% on v25 against 52.2% on v24, about one
standard error over the band. Other single-window misses (Nugget, Stilts, Howler, Brutus on v25; Bravo, Brutus,
Bengas on v24) do not repeat. No toy rule names her; the default is to ship and re-read her on the next Blitz gate.

**Blitz comeback.** "Trailing at 1:30 wins 20–40%" fails on both versions (known). v25 is a little better on the same
seeds: 17.2% / 15.9% against v24's 13.8% / 13.1% (windows 7200001 / 7300001).

**Checks.**
- Pawlegends: `tsc`, `lint:sim` (163 files), `vendor-sim --check` (v10–v24 frozen, v25), `vitest` (3157 pass; the
  three `tools/trailer` copy-gate cases fail in this worktree only because its root has no `node_modules`, so
  `tools/copy-lint` cannot load `typescript`), `build`, `budget` (first load 410.5 KB gzip, party chunk 43.4 KB). Determinism: 100 seeds from 6600001 + PvP, Blitz, Hearthwood every 4th, all identical (re-run on the final tree).
- Toy sweep `.toys/measure.test.ts` re-run on the final tree (`.toys/measure-v25d.json`) gives exactly the v25 column
  above; all-bot stuck check (`.toys/stuck25.test.ts`, seeds 41–160, a moving hero still 3 s): 0. The Hearthwood
  sweep's 1–2 capped walks are the same on v24 (map geometry, not a toy). The `.toys` harnesses print with
  `console.log`; run them as `rtk proxy npx vitest run --config .toys/vitest.config.ts …` (the RTK hook swallows it).
- Backend: `tsc`; `jest src/pawlegends` 1039 / 1040. `src/vendor/pawlegends-sim` holds no specs (the vendored
  bundles are exercised by `pawlegends-live.spec.ts`, the party specs and `boards-live.spec.ts`), so naming it to
  jest adds nothing. The live spec passes 95 / 95 alone. The one miss in the full run was not captured; the
  timing-based LoopGate case, which missed in earlier loaded runs, passes alone.
- Backend cold start: every replay worker now loads 16 vendored bundles. The ready handshake caps the load at
  `PAWLEGENDS_REPLAY_START_MS` (60 s) and then gives the replay its own 10 s, so on a cold production start a `/live`
  request can wait up to about 70 s before a 503.
- Ship notes: `sim-stamp.json` simHash `581e7bab62d5c165` changed and `golden` stays `d03f02e3` (the golden replay
  does not touch the toys or the fountain; party skew detection keys on simHash). The committed
  `client/public/pawlegends-app` OTA bundle is still v24 and is rebuilt at ship time; v24 clients keep verifying
  because v24 is frozen in the backend. Commit b2f00d99's message says the cannon reach is 1.5 m; 4ad0f76a restored
  2.0 m. Squash or reword before the merge.
- Bots: `bots/fun.ts` `bedHop` still walks to the bed centre. A bot coming from the side is thrown only after it stops
  there for `BOING.stand` (15 ticks); a lane order inside that time walks it off. Bots use beds from the side less
  often; "bots still use every toy" passes.
- Touch e2e `tests/e2e/boing-touch.spec.ts` (844×390, Blitz, from behind each bed): 6 / 6 thrown in three of four
  runs (0.5–1.2 s after entering the disc). The first run had one miss, with backend jest loading the machine.
- Not run: `npm run build:client` (the client bundle ships with the release), and a device check of the new bed wedge
  and cannon ring.

## 3. Stronger towers (sim v21)

Founder: "hits and more durable". Two levers: towers hurt more when they shoot heroes (dive costs a life) and take
longer to kill (fewer, later falls). One early guard (**Fortified**) stops early lane snowball, so a strong lane pair
cannot take an outer tower before the others reach it.

### 3.1 Numbers

| Stat | v19 | **v21** | Change |
|---|---|---|---|
| Damage to heroes (base) | 90 | **120** | +33% |
| Ramp per consecutive shot | +20% | **+25%** | |
| Ramp cap | +60% (4th shot 144) | **+100% (5th shot 240)** | 5 shots: 468 → **900** |
| Damage to minions | 110 | 110 | (unchanged: wave clear speed is the lane pace) |
| Crossing outer HP | 1,800 | **2,250** | +25% |
| Crossing inner HP | 2,200 | **2,750** | +25% |
| Hearthwood outer / inner / gate / hearth HP | 2,400 / 2,800 / 3,200 / 3,000 | **3,000 / 3,500 / 3,800 / 3,500** | +25% / +25% / +19% / +17% |
| **Fortified** (new) | — | heroes deal **−35%** to towers before **3:00** (Crossing) / **5:00** (Hearthwood); minions and the Kibble Cannon are not reduced | |
| Armour, range, lock-on, backdoor, Sunset ×2 | | unchanged | |
| Cores | 3,000 / 4,500 | unchanged | (Sunset and Sudden Death close the match) |

What a dive costs now (level 6 squishy, ~770 HP, armour ~30, before Toys): v19 tower shots after armour do 69, 83,
97, 111, 111 → about 470 in 5 s (61%). v21: 92, 115, 138, 161, 184 → about 690 in 5 s (**~90%**). A tank still dives
for 3–4 shots; a squishy that stays for five shots dies. Lock-on (1.2 s) keeps the warning.

Fortified: shown as a soft ribbon wrap on the tower and a shield icon on its bar until it ends ("Towers are no longer
fortified!" callout). It is applied in `dealDamage` right after the Sunset line, only when `srcKind === Kind.Hero`.

### 3.2 Expected effect (probe; final numbers come from the gates)

The same probe, with source patches applied to the bundle only. Variants: **dmg** = the shot changes alone; **strong**
= shots + HP; **v21** = shots + HP + Fortified −35% (the table in §3.1); **mid** = HP +17%, base damage 115, Fortified
−30%.

| Crossing (80 seeds) | Median length | 1st tower | 3rd tower | Towers a match | Deaths a match | Deaths to towers |
|---|---|---|---|---|---|---|
| v19 | 7:14 | 3:27 | 4:56 | 4.61 | 24.2 | 2.27 (9.4%) |
| dmg | 7:18 | 3:35 | 5:04 | 4.44 | 24.0 | 3.11 (13.0%) |
| strong | 7:32 | 3:40 | 5:30 | 4.24 | 24.2 | 2.95 (12.2%) |
| **v21** | **7:39** | **3:41** | **5:31** | **4.36** | **25.0** | **2.98 (11.9%)** |
| mid | 7:27 | 3:31 | 5:04 | 4.58 | 25.4 | 2.84 (11.2%) |

| Hearthwood (30 seeds) | Median length | 1st tower | 3rd tower | Towers a match | Deaths a match | Deaths to towers |
|---|---|---|---|---|---|---|
| v19 | 13:04 | 3:52 | 5:14 | 9.83 | 51.4 | 4.07 (7.9%) |
| strong | 13:05 | 3:41 | 5:40 | 9.80 | 51.9 | 5.67 (10.9%) |
| **v21** | **13:06** | **3:41** | **5:52** | **9.17** | **50.3** | **5.70 (11.3%)** |
| mid | 13:06 | 3:34 | 5:32 | 9.70 | 54.2 | 6.20 (11.4%) |

These are small samples from one probe, not gate runs.

- **Probe result:** v21 towers add about 25 s to a 3v3 match (7:14 → 7:39) and leave the 5v5 median where it was
  (Sunset and the closing rules decide it). The 2nd and 3rd towers fall 35–40 s later. Deaths to towers go up about
  30% (Crossing 2.3 → 3.0, Hearthwood 4.1 → 5.7), and total deaths stay flat, so takedowns a minute fall slightly
  (3v3: 3.35 → 3.27 hero deaths a minute in the probe). That leaves room for the cannon's kills (§1.7).
- **Match length:** the 3v3 balance gate (median 6:30–9:00, p95 ≤ 10:30) and the 5v5 gate (12:00–14:30) stay. The
  timeline rails (Sunset ×2 structure damage, Sudden Death decay, takedown core damage) are untouched, so the stronger
  towers delay falls but cannot stall a match past the rails.
- **Dive:** tower kills of heroes go up (towers become a real threat), which also lifts takedowns a minute. Watch the
  3.5 ceiling together with the cannon (§1.7).
- **Comeback:** stronger towers help the trailing team hold, which helps the 20–40% band; the deficit gate (down 10+
  wins < 5%) is the one to watch, because the leader takes longer to close.
- **Rookie and Easy:** `structureHpBp` and `enemyBackdoor` rules multiply on top as today. Rookie's `towerKnockback`
  stays. Run the `fun1` / `novice` gates; if the first-match length moves past their bands, lower Rookie's
  `structureHpBp` from 12000 to 10500 (it already makes Rookie towers tougher).

### 3.3 Fallback order if a gate fails

1. Match too long: Fortified −35% → −25%, then HP +25% → +15%.
2. Takedowns over 3.5 a minute: ramp cap +100% → +80%, then the cannon respawn (§1.7).
3. A hero leaves 46–54%: per-hero `pvp` rows (3v3) or `HEARTHWOOD_PVP` rows (5v5), as in V18-CHASE §3.

---

## 4. Tower damage states (render only, ship now)

Tower and core health shows on the model itself, so a player reads "that tower is almost down" without the bar.

### 4.1 States

| State | HP | Look |
|---|---|---|
| 0 Clean | 100–66% | as today |
| 1 Cracked | < 66% | crack lines in the walls (shader), a chip burst at the moment it crosses (3 debris chunks from the existing pool), roof tilts 2° |
| 2 Burning | < 33% | a smoke column, flame licks at the top, embers; a warm flicker on the tower's own flash uniform |
| 3 Blazing | < 15% | flames ×2, sparks, a slow wobble (±1.5° at 0.8 Hz), smoke darker and taller |
| 4 Destroyed | 0 | the existing topple, chunks and rubble, plus the rubble smoulders (2 puffs a second) for its 4 s hold |

- Thresholds in `TOWER_DAMAGE = { cracked: 0.66, burning: 0.33, blazing: 0.15 }` in `render/views/towerDamage.ts`.
  The state only ever goes up during a match (towers do not heal), so no flicker at a boundary. A pure
  `damageState(hpFrac)` is unit-tested.
- Crossing a state threshold plays a short crack (state 1) or "whoomph" (states 2, 3) from new zzfx entries and a 0.15
  flash. No looping fire sound (phones).
- Cores use the same states and thresholds, with the column sized ×1.6.

### 4.2 Team readability

- Flames and smoke are the same colours for both teams (fire is fire). The tower body keeps its team colours, and the
  smoke column is tinted 10% toward the team colour at the base (cat: pink-grey; dog: brown-grey).
- **Own tower at state 2+**: the minimap square pulses orange at 1 Hz and gets a small flame glyph; the overhead bar
  shows the same flame glyph. **Enemy tower at state 2+**: the minimap square gets the flame glyph (a "finish it"
  cue), no pulse.
- An own tower that crosses into state 2 fires one info callout "Our {lane} tower is burning!" (rate-limited to once a
  tower).

### 4.3 Cost budget and tiers

- **Cracks:** one new `uDmg` uniform on the tower rig material (`rig.ts`), a procedural crack mask in the fragment
  shader (hash noise on object position, no texture). Free on all tiers.
- **Particles:** emitted into the existing `Particles` pools (one instanced draw each). Per burning tower at Medium:
  smoke 3/s × 2.5 s life, flames 6/s × 0.5 s, embers 4/s × 0.8 s (**≈ 14 live**); at state 3 double. Worst case
  (four towers blazing on screen) ≈ 110 of the 1,600 Medium budget (7%).
- **Low tier** (and the phone profile's Low particle budget, and governor step 2+): rates ×0.5, no embers or sparks
  (`extras: false`), smoke life 1.8 s. Cracks and wobble stay (they cost nothing).
- **Culling:** only towers inside the camera's view box emit; an off-screen tower keeps its state, emits nothing.
- **No per-frame allocation:** per-structure `emitAcc` numbers on the existing `Structure` record; scratch vectors as in
  `towerView.ts`.
- **Reduce motion:** no wobble and no roof tilt; the fire still shows.
- **Check:** the perf trace in `tests/perf` on the phone profile with four burning towers on screen stays inside the
  PERF-IOS frame budget (JS ≤ ½ frame), and `npm run budget` stays under 450 KB first-load.

---

## 5. Build list

### (A) Render only, now (no sim bump, ships before v21)

1. `render/views/towerDamage.ts`: `TOWER_DAMAGE` thresholds, pure `damageState(hpFrac)`, the per-state emit rates per
   tier. Unit test.
2. `render/views/rig.ts`: `uDmg` uniform and the crack mask for the tower and core materials.
3. `render/views/towerView.ts`: track the state per structure (max seen), roof tilt, wobble, chip burst on state 1,
   emit smoke / flames / embers through a callback to `gameView` (like `onShot`), smouldering rubble during the hold.
4. `render/gameView.ts`: wire the emitter callback to the `Particles` pools with the `VfxTier` scaling and view-box
   culling.
5. `audio/sfx.ts`: `towerCrack` and `towerIgnite` zzfx entries, played on a state crossing.
6. `ui/minimap.ts` and `ui/overhead.ts`: flame glyph at state 2+, orange pulse for own towers.
7. `render/announcer.ts`: "Our {lane} tower is burning!" once a tower (info tone).
8. Tests: `damageState`, state never goes down, Low tier emits no embers, no allocation in `update` (the existing
   allocation test pattern), a visual snapshot of the four states in `tests/visual`.
9. Checks: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run budget`, the phone perf trace, then
   `npm run build:client` and commit `client/public/pawlegends-game`.
10. Optional with (A): the Grizzlechop steal banner "Snack thief!" on the existing `buffSteal` event.

### (B) Sim v21 (on main now, rebased onto v20)

1. **Versioning:** `SIM_VERSION` 21. `FROZEN` in `tools/vendor-sim.mjs` gains v20 at its release commit (after v20 is on
   main); the backend verifies 10 to 21. Vendor the v21 bundle and fixtures, regenerate the party-identity golden and
   protocol seed, as V18-CHASE §1 did.
2. **Towers:** `data/towers.ts` (`heroDamage` 120, `rampBp` 2500, `rampCapBp` 10000, outer 2250, inner 2750, new
   `fortifyBp` 6500 and `fortifyUntil` per map: 5400 Crossing, 9000 Hearthwood), `data/maps/hearthwood.ts`
   `TOWER_STATS`, `combat/damage.ts` Fortified line, `fortified` buff bit for the render.
3. **Kibble Cannon sim:** `data/cannon.ts` (spots, timers, numbers per map); `units/cannon.ts` (spawn, carry, fuse,
   drop, steal, fizzle); pickup slot 4 and `CAPS.pickups` 5; globals `G.Cannon*`; `Op.Fire` in `api.ts`, `commands.ts`
   (size, quantize, codec), `input.ts`; windup slot 5; `PROJECTILE_KIND.kibble` 16 and its `SRC_KIND` row; the
   `execute` damage option; structure and neutral hits for the kibble; events `cannonSoon`, `cannonSpawn`,
   `cannonPick`, `cannonDrop`, `cannonFizzle`, `cannonFire`, `kaboom`; `PickupKind` 'cannon'; snapshot field for the
   carrier.
4. **Boing Beds sim:** `data/boing.ts`, `units/boing.ts`, `FM.Leap`, per-hero `boingT` (hashed), event `boing`.
5. **Mega Yarn Ball sim:** `data/yarn.ts`, `units/yarn.ts` (table `yb*`, hashed), `PROJECTILE_KIND.yarn` 17, roll stop
   on walls and structures, knockback on hit, events `yarnKick`, `yarnStrike` (3+ heroes), `yarnUnravel`; snapshot rows.
6. **Bots:** cannon grab / fire / fuse rules, bed use, yarn kicks (`bots/brain.ts`, `BOT_AI` numbers in
   `data/bots.ts`); the naive player-bot grabs the cannon only when it walks over it.
7. **Limits:** `MAX_INPUT_BYTES` (three copies, MAP-5V5 §2.5) for `Op.Fire`; the party relay and backend protocol
   accept opcode 11 through the vendored sim's decoder.
8. **Client:** FIRE button swap with tap quick-cast and drag aim (`input/touch`, `ui/abilityBar.js`), desktop F key,
   cannon / bed / yarn views (`render/views/pickupView.ts` or new `funView.ts`), lane telegraph (`Telegraphs.js`),
   carrier back-mount, KABOOM / Whiff / Fumble / Return to sender / STRIKE moments, slow-mo and zoom punch, kill-feed
   icon, minimap glyphs, sfx, three voice keys, results "Best moment" and dare text.
9. **Tests:** unit tests per mechanic (§1.7, beds, yarn), commands round-trip with `Op.Fire`, replay and determinism
   (`npm run determinism`, `hearth-gates.mjs --det 40`), `lint:sim`, `vendor-sim:check`.
10. **Gates (on the v20 base after the rebase):** `node tools/headless-match.mjs --gate balance` (2,000 seeds, both
    windows), `fun1`, `fun2`, `novice`, `feedNormal`; `node tools/hearth-gates.mjs --seeds 2000`;
    `pvp-symmetry.mjs`. Pass bands: heroes 46–54%, cats 47–53%, side 45–55% (3v3) / 47–53% (5v5), length 6:30–9:00
    (3v3) and 12:00–14:30 (5v5), takedowns 2.5–3.5 a minute (3v3), trailing at 3:30 wins 20–40%, down 10+ wins < 5%.
    Fallbacks in §1.7 and §3.3.
11. **Docs:** this file's status and measured tables; `docs/plans/moba/GDD.md` §3.2 (cannon, beds, yarn, towers).

### Your call (defaults apply if no answer)

| Question | Default |
|---|---|
| Cannon name | **Kibble Cannon** ("KABOOM!") |
| Cannon one-shots through Nine Lives | **Yes** (parry, Guard and dodges still beat it) |
| Takedowns gate fails with the cannon | Lengthen respawn (105 s, then 120 s); do not widen the band |
| Underdog Cannon offset | **On** (5 m toward the trailing team) |
| Extra mechanics in v21 | **Boing Beds + Mega Yarn Ball**; Cardboard Box in v22 |

---

## 6. Status: sim v21 built (2026-11-11, branch `feat/pawlegends-v21-fun`, on main before v20)

Built: the Kibble Cannon, Boing Beds, the Mega Yarn Ball and stronger towers as sim v21, with bots, render, HUD,
touch and desktop controls, announcer moments, the kill-feed cannon, the minimap glyphs and the KABOOM dare text.
Sim v19 is frozen in `tools/vendor-sim.mjs` (at `f9733681`); the backend verifies 10 to 19 and 21. When v20 lands
on main, rebase, add v20's frozen entry and re-run the gates of §5 B10 on that base.

### 6.1 What changed from the plan

| Item | Plan | Built | Why |
|---|---|---|---|
| Cannon respawn (Crossing) | 75 s | **120 s** | the takedowns ceiling (§1.7): 3.52 a minute at 75 s, 3.50 at 105 s |
| Tower ramp cap | +100% | **+80%** (5 shots 876, v19 468) | §3.3 step 2: still on the 3.5 ceiling at 120 s |
| Cannon pick-up slot | pickup slot 4, `CAPS.pickups` 5 | globals `G.Cannon*` (state, spot, carrier, fuse, drop, windup, aim) | no change to the pickup table or its snapshot ids |
| Yarn kick direction | the kicker's movement | from the kicker to the ball | the same thing at contact, and deterministic without a velocity |
| Beds | Crossing 2 a side, Hearthwood 3 a side | Crossing 3 a side (rat camp, Sunny and Puddle sides), Hearthwood 4 a side (one per quadrant wall, both quadrants) | symmetric within a team |
| Bed trigger | goal beyond the bed | goal past the bed, or a tap on the bed (goal within 0.6 m) | phones: tapping the bed is the obvious move; bots walk onto the bed |
| Per-hero, per-bed cooldown | per bed | per hero (any bed), 3 s after landing | one hashed number a hero |
| Fire from a non-carrier | dropped, not logged | logged, ignored by the sim | the gate stays world-free; replays apply it identically |
| Rookie `structureHpBp` | 12000 | **10500** | §3.2 fallback (fun1 core-kill share) |
| Hero rows | – | Lambo takes 7550 (7750), Brutus takes 9850 (9925), Sage deals 9750 (9875), Rocket 9350 / 9300 (9250 / 9400), Frankie takes 9275 (9175); Hearthwood cat row 10220 / 9780 (10120 / 9880), Marshmallow 9560 / 10440 (9660 / 10340) | per-window refits; see 6.3 |
| Input budget | +15 B | **+60 B** a map (Crossing 30,660 B / 40,880 chars, Hearthwood 44,760 / 59,680) in `data/limits.ts` and `shared/caps.ts` (synced) | room for ten shots |
| Announcer voice | three new clips | **none yet**: the moments use the crowd and SFX (boom, clank, fuse, clang, trombone) | the Qwen3-TTS clone run was not allowed in this session; the clip keys can be added later (voice.test.ts needs every listed key to have a clip) |

### 6.1a Review fixes (2026-11-11)

- **Pick-up fairness:** of the heroes in reach, the one nearest the cannon's centre takes it; a tie between the teams
  goes to team (spawns so far & 1), so it alternates per spawn (before, slot order gave every Crossing tie to team 0).
- **Guard block:** a kibble stopped by Sir Brutus's Front Guard (or a Guard Post dome) breaks the Guard (the dome
  falls) and reports `cannonBlock { id: Brutus, src: shooter }`: a "Blocked!" banner for everyone, Brutus's own best
  moment (rank 38, like a parry). Before, it was a shooter-only "Whiff!".
- **Bots** fire only along a clear line: no wall cell (sampled every `EFFECTS.wallStep`, as the kibble flies) and no
  enemy structure footprint between the carrier and the target.
- **Underdog label:** the team chosen at the warning is kept in `G.CannonUnder`, so `cannonSpawn.underdog` matches the
  spot.
- **Phones:** a FIRE press within 400 ms of the button turning into FIRE (or while it still showed ATK) is ignored, and
  the button pops in during that window, so an ATK tap after walking over the cannon never wastes it.
- **Party relay:** `CMD_OP.Fire` is a client op (human seats could not fire; three presses closed the socket). A v19
  room still strikes op 11 in its decoder.
- **Render:** a hidden carrier's cannon follows the snapshot position; an ally's windup lane is blue (self gold, enemy
  red); no per-event closures in `funEvent`; the fuse arc is written per step change only.

Gates after these fixes: 3v3 balance 3.49 takedowns a minute in both windows (1–2000, 2001–4000), trailing at 3:30
wins 27.8% / 27.1%, down 10+ wins 1.3% / 1.7%, cats 49.4% / 49.1%; one hero at the band edge per window (Howler
45.6%, Nugget 54.3%), as before. `pvp-symmetry` 47.6%, `novice` 89.5%, `feedNormal` 3.8%, `determinism.mjs` all
identical. `fun2` still 2.42, `fun1` 79.0% / 6.2 s (open, §6.4). `hearth-gates` 600 seeds: side 49.3%, cats 53.4%,
length 13:06, determinism 120 of 120; per-hero 45–56.5% on ~600 slots (refit on the v20 base).

### 6.2 Usage (probe, Normal pilot vs Normal bots)

| | Crossing (60 seeds) | Hearthwood (20 seeds) |
|---|---|---|
| Median length | 7:29 | 13:06 |
| 1st / 3rd tower | 3:29 / 4:58 | 3:45 / 5:46 |
| Cannons a match (spawned / fired) | 3.2 / 3.2 | 6.1 / 5.9 |
| KABOOMs a match | 1.4 | 1.9 |
| Whiffs, steals, fumbles, fizzles | 1.8, 0.08, 0.02, 0.02 | 4.0, 0.35, 0.1, 0.15 |
| Boing launches a match | 4.4 | 15.1 |
| Yarn kicks a match | 3.9 | 4.5 |
| Deaths to towers | 9.8% | 10.2% |

### 6.3 Gates (2,000 seeds a window)

| Gate | Result |
|---|---|
| 3v3 balance, seeds 1–2000 | length 7:20, p95 8:34, 90% core kill, **3.48–3.49 takedowns a minute**, trailing at 3:30 wins 28–29%, down 10+ wins 1.4–4.4%, sides and species pass; one hero at the band edge per run (Cacklejaw 54.5% in the last run) |
| 3v3 balance, seeds 2001–4000 | length 7:21, **3.49–3.50** takedowns, down 10+ wins 3.0%; per-hero edges flip between runs (Brutus, Sage, Rocket, Chili, Raspberry, Brutus branch at 44–55%) |
| `pvp-symmetry`, 2,000 seeds | map side 48.3%, cats 50.6%: pass |
| `determinism.mjs` | 100 seeds plus PvP, all identical |
| `novice`, `feedNormal` | pass |
| `fun1` | fails on v19 too (core kill before Sudden Death 80.5%, 90%-to-dead 6.7 s); v21 74.5% / 6.2 s, then **78.5% / 6.2 s** with Rookie `structureHpBp` 10500 |
| `fun2` | **fails: 2.42 takedowns a minute** (floor 2.5; v19 2.61). Open |
| `hearth-gates`, 2,000 seeds (4,000 matches) | side 48.4%, length p50 13:06, no safety ends, determinism 120 of 120; **cats 46.8%** and Marshmallow 54.4% failed |
| `hearth-gates`, 600 seeds after the refit (cat row +1%, Marshmallow −1%) | side 49.7%, **cats 52.3%**, length 13:06; four heroes at 45.8–55.2% on 300 slots each (noise at that size): the 2,000-seed refit runs on the v20 base |
| `vitest` | all pass except the two `tools/trailer` copy-gate tests and the two CPU-time perf tests, which fail on the v19 base under the same load (the 11:00 worst case costs about 7% more CPU: stronger towers keep more minions alive) |
| `tsc`, `lint:sim`, `build`, `budget`, `vendor-sim:check` | pass (first load 398.6 KB gzip, party chunk 39.3 KB) |

### 6.4 Open (founder call or after the v20 rebase)

- **Takedowns ceiling:** 3.47–3.50 a minute with the cannon at 120 s and the ramp at +80%, on the 3.5 line in both
  windows. Next levers: the band to 3.6 (founder), or the ramp cap +60% (the v19 cap, keeps 120 base damage).
- **`fun2`** (naive vs Easy) 2.42 takedowns a minute against a 2.5 floor.
- **Per-hero edges** (3v3 and 5v5) move between windows by ±3 pp: refit on two 2,000-seed windows after the v20
  rebase, as §5 B10 says.
- **Voice clips** for the cannon lines (`cannonSpawn`, `cannonOurs`, `cannonTheirs`, `kaboom`, `returnToSender`,
  `strike`): render them with the same Qwen3-TTS clone pipeline, add them to `VOICE_LINES` and the manifest, and set
  `voice` on the announcer moments.
- The Fortified ribbon on the tower model is not drawn; the shield glyph on the bar shows it.

## 7. Release on the released v20 (2026-11-12)

Rebased onto `origin/main` with sim v20 live (`4f9c97d4`, then the chat and store commits after it). v20 is frozen in
`tools/vendor-sim.mjs` at `4f9c97d4`; the backend verifies 10 to 21. Balance rows: cats −2.25% / dogs −2.75% damage to
heroes; Raspberry −100, Meatball −70, Nugget +60, Cacklejaw +40, Brutus +40, Duchess +80 (3v3 rows, as the trial).

Changes made while releasing:

- **Hearthwood cat row back to the v20 row (9920 / 10390).** The trial's +1% row (10020 / 10290) gave cats **54.3%**
  on 5v5 seeds 30001–32000 (every cat 53–56%, every dog 44–49%). Fit on seeds 6001–7000: v20 row 50.6%, −2% row
  47.0%; the v20 row was kept.
- **Relay and referee live sim:** `liveSim()` (referee-core) and the relay lobby walked a hard-coded `[11 … 20]`
  list, so with v21 live the referee specs played v20 rooms and verified them on v21. Both now walk `SIM_VERSIONS`.
  `bot-chat.spec.ts` also covers v21.
- **`net-rejoin` perf-ff:** the v21 log ends on tick 12720, a trail tick inside the last B turns that are stepped live,
  so one HASH is posted after the fast-forward; the test now allows HASH only in that live tail.

### 7.1 Verification on unseen seeds (V20-CHASE §10 method): PASS

3v3 (`--gate balance`, four 2,000-seed windows, per-window gates):

| Gate | 30001–32000 | 32001–34000 | 34001–36000 | 36001–38000 |
|---|---|---|---|---|
| Cats / dogs 47–53 | 48.6 / 51.4 | 48.8 / 51.2 | 48.0 / 52.0 | 49.5 / 50.5 |
| Map side 45–55 | 49.0 / 51.0 | 52.4 / 47.6 | 50.1 / 49.9 | 50.7 / 49.3 |
| Down 10+ at the end wins < 5% | 1.6% of 304 | 1.0% of 298 | 1.0% of 292 | 2.2% of 314 |
| Takedowns a minute 2.5–3.5 | 3.48 | 3.47 | 3.48 | 3.48 |
| Median 6:30–9:00 / p95 ≤ 10:30 | 7:12 / 8:31 | 7:12 / 8:32 | 7:12 / 8:31 | 7:12 / 8:31 |
| Core kill before Sudden Death ≥ 70%, no safety end | 93.8%, 0 | 92.5%, 0 | 94.0%, 0 | 94.0%, 0 |
| Trailing at 3:30 wins 20–40% | 27.7% | 28.3% | 27.9% | 28.6% |
| Tricks 47–53 (pounce/snack/hiss/purrify) | 50.5 / 51.1 / 51.4 / 47.1 | 50.7 / 50.3 / 50.8 / 48.3 | 50.3 / 51.3 / 51.3 / 47.1 | 49.5 / 51.8 / 50.6 / 48.2 |

Pooled over the 8,000 matches (gated): every hero **46.2% (Meatball) to 53.6% (Bravo)**; level-6 branch Sage
**48.9%** of 1,218, Brutus **48.5%** of 1,207. Reported only: per-window hero cells 45.4 (Meatball) to 55.9 (Bravo);
branch windows Sage 44.8–51.7, Brutus 44.3–52.4. These 3v3 runs predate the Hearthwood row change, which does not reach
Crossing.

5v5 Hearthwood (`hearth-gates --seeds 2000`, 4,000 matches a window, with the v20 cat row):

| 5v5 gate | 40001–42000 | 42001–44000 |
|---|---|---|
| G6 side (team 0) 47–53 | 50.1 | 49.5 |
| G5 cats 47–53 | 50.6 | 49.7 |
| G5 p50 12:00–14:30 / p95 | 13:06 / 13:13 | 13:06 / 13:12 |
| G5 safety end ≤ 2% | 0.0% | 0.0% |
| G5 heroes (per window) | 47 (Howler) – 53 (Raspberry, Duchess) | 48 (Bengal, Meatball) – 52 (Domino, Stilts) |
| G2 determinism | 300 / 300 | – |

Pooled 8,000 5v5 matches (gated): every hero **48.5% (Marshmallow) to 52.0% (Stilts)**.

Other checks: determinism 1,000 seeds (30001–31000, + PvP) 2,625,480 commands all identical; `tsc --noEmit` clean
(pawlegends and backend); `lint:sim` ok (158 files); `vendor-sim:check` current (v10–v20 frozen, v21); backend
`src/pawlegends/party` + `mm` 327 / 327 and `pawlegends-live.spec.ts` 75 / 75 at low load (under load 150+ its
worker re-sims time out on `origin/main` the same way). Full `vitest` 3,010 passed; the two `tools/trailer` copy-gate
tests fail on `origin/main` too; `perf-sim` passes at low load (v21 is about 8% slower than v20 on the 11:00 worst
case: 1.65 s vs 1.53 s CPU median at load 20, both above 1.5 s there).
