# Pawlegends 5v5: Hearthwood rebuilt to the standard MOBA layout (sim v22, 2026-11-11)

**Founder ask (verbatim):** "adapt base on that as well ultracode". The founder pasted this with it:

> Yes, for 5v5 Classic. Follow the standard MOBA layout that players already know, but with our own geometry and art,
> not a copy of any specific game's map. [...] 3 lanes (top, mid, bottom) with 2–3 towers each and a base core. A
> diagonal river splitting the map, with brush at its entrances. 4 jungle quadrants, 2 per side, each with a buff camp
> and 2–3 small camps, plus paths into each lane for ganks. 2 river objectives, early and late (our cats-vs-dogs
> versions of dragon and baron), on clear spawn timers. Symmetric or mirror-balanced so neither side is favoured.
> [...] The 3v3 map stays compact and different. [...] Twists on top of the standard base, such as launch pads,
> destructible walls and map events. [...] a new or reworked Hearthwood map, retrained bot pathing and a full
> rebalance, shipped as its own sim version.

**Base:** branch `feat/pawlegends-5v5-standard`, cut from `feat/pawlegends-v21-fun` at `77f3b273` (sim v21: Kibble
Cannon, Boing Beds, Mega Yarn Ball, stronger towers). This plan is **sim v22**. v19, v20 and v21 stay frozen bundles,
so their replays and live matches keep working.

**Supersedes:** the geometry sections of `MAP-5V5.md` (§1.5 river pickups, §1.6 jungle, §1.8 walls and bushes) for
v22. The rest of MAP-5V5 (interface, roles, server, timeline row) still holds. `PVP-MAP.md` (parked on
`wip/pawlegends-pvp-map-old`, `c5814a72`) is not continued. This plan reuses the parts listed in §13.4.

**Sources read:** `src/data/maps/hearthwood.ts`, `data/{map,camps,pudding,timeline,fun,towers,minions}.ts`,
`sim/map/{grid,info}.ts`, `sim/bots/{brain,roles}.ts`, `sim/world.ts` (entity ranges, hit masks),
`render/views/hearthwoodView.ts`, `ui/minimap.ts`, `tools/{hearth-gates,map-identity}.mjs`, `GDD.md` §3, `V21-FUN.md`,
`MAP-5V5.md` §1, and on the parked branch `PVP-MAP.md`, `data/river.ts` and `sim/bots/river.ts`.

**Units:** mm in data, metres in this text. 30 ticks = 1 s. Team 0 is Purrhaven (bottom-left base) and team 1 is Woof
(top-right base). Hero walk speed is about 4.9 m/s (Clem 5.0, Brutus 4.8).

All names, shapes and art in this plan are original. No coordinates, shapes or landmarks come from Summoner's Rift,
Land of Dawn or any other game's map. §11.3 lists the checks.

---

## 0. Summary

The old Hearthwood already has the standard parts on paper: three lanes, a diagonal river, four quadrants, buff
camps and two river objectives. It does not play like a standard map, because **its jungle is an open meadow**.
`PLAYFIELD.open = 1` makes every cell inside the rim walkable, and only five small rocks per eighth stand in it. There
are no jungle paths, so there are no gank routes, no river entrances and no chokepoints. A hero walks in a straight
line from anywhere to anywhere. Bots look random because the map gives them nothing to route along.

v22 keeps what already follows the standard: the frame, lanes, towers, base, river band, the two pits, the timeline and
the camp kinds. It **replaces the jungle**:

- the jungle becomes **forest by default**, with walkable **corridors and clearings carved** into it;
- each quadrant gets **1 buff camp and 3 small camps** (a new Beetle Log joins the Rat Nest and the Frog Pond);
- each quadrant has **7 named exits**: 2 into its side lane, 2 into mid, 2 into the river and 1 into the base;
- **brush at every river entrance and gank exit**;
- the river **widens around both pits**, so the river stays one continuous road from side lane to side lane;
- the late objective gets a team buff, **Sugar Rush**, on top of its escort push;
- bots get a **jungle route graph** with a clear plan, gank checks, objective rotations and contests;
- **twists**: Boing Beds as lane-to-buff launch pads, plus the v21 cannon and yarn ball. **Box Forts** (breakable walls)
  and the **Zoomie Mouse** river critter are the v22 tail, built only if the gates leave room.

| | Old Hearthwood (v19–v21) | **Hearthwood v22** |
|---|---|---|
| Jungle ground | open meadow (`open: 1`), 5 rocks per eighth | **carved forest** (`open: 2`): corridors 5–6 m wide, camp clearings |
| Walkable share | about 95% | **about 69%** (prototype raster, §8.2) |
| Camps per quadrant | buff + Rat Nest + Frog Pond (4 monsters) | buff + Rat Nest + Frog Pond + **Beetle Log** (5 monsters) |
| Gank routes | none (any straight line) | **2 side-lane exits and 2 mid exits per quadrant**, each with brush |
| River | 10 m band; each pit blocks it | 10 m band that **widens to a 24 m bulge** at each pit, so traffic flows round |
| Early / late objective | Grizzlechop (2:00–8:30) / Great Pudding (8:00), escort push | the same, plus **Sugar Rush** (a team minion aura) from the Pudding; spawn timers on the minimap |
| Bot jungling | camp nearest the bot, help the weakest lane | **route graph**: fixed first clear, gank checks at exits, objective rotations, Hard-only invades |
| Twists | v21 cannon, yarn ball, 4 beds over rocks | cannon and yarn ball unchanged; **4 beds from lane to buff**; Box Forts and Zoomie Mouse as tail |

---

## 1. Diagnosis: the old map against the standard layout

| Standard part | Old Hearthwood | Verdict | v22 |
|---|---|---|---|
| 3 lanes, 2–3 towers each, a base core | Fenceline, Yarn Road, Gutterway; outer, inner and gate towers; 2 Hearth Guards; a core | standard | keep (§3) |
| Diagonal river | the band `|x + y − 128 m| ≤ 7.07 m` | standard | keep; widen at the pits (§4) |
| Brush at the river entrances | 1 bush near a pit entrance and 2 beside the centre crossing; no other entrances exist | **missing** | 2 entrances per quadrant, each with brush (§4.3) |
| 4 jungle quadrants, each with a buff camp | Prickle Hollow (S, N) and Crow Roost (W, E) | standard | keep the kinds; new clearings (§5) |
| 2–3 small camps per quadrant | Rat Nest and Frog Pond | thin | add the **Beetle Log** (§5.4) |
| Paths into each lane for ganks | the meadow is open everywhere, so no route is a "path" | **missing** | 7 corridors and exits per quadrant (§5.2) |
| Early and late river objectives on clear timers | Grizzlechop 2:00 / 2:00 respawn / none after 8:30; Great Pudding 8:00 / 2:30 | standard timing | keep; add Sugar Rush and the minimap timers (§6) |
| Mirror balance | D2 symmetry: point reflection plus diagonal swap | standard | keep; the bake test pins it (§2) |
| Bots that rotate | Prowl clears the nearest own camp and then helps the weakest lane | random-looking | route graph and rules (§9) |

The map study behind `PVP-MAP.md` measured what the open meadow does. On Hearthwood, heroes were calm 53% of the
time. The longest calm stretch was 77 s at p50 and 128 s at p90. Ambush brush caused 0% of deaths, and the pits saw
6% of deaths. v22 fixes the cause (no routes) instead of adding features on top.

---

## 2. Frame, symmetry and authoring

- **Size:** 128 × 128 m, 1 m nav cells, 16,384 cells (= `MAX_CELLS`, unchanged). A smaller map would only make
  objectives closer. The carved forest already cuts the walkable area by about a quarter, so the size stays.
- **Symmetry:** unchanged D2 symmetry.
  - Point reflection `R(x, y) = (W − x, W − y)` maps team 0 onto team 1.
  - The diagonal swap `S(x, y) = (y, x)` maps team 0's south quadrant onto its west quadrant.
  - Their product is the river mirror `M(x, y) = (W − y, W − x)`. M maps team 0's south quadrant onto team 1's east
    quadrant, the one across the river from it.
- **Authoring:** only team 0's south eighth (`y ≤ x`, `x + y ≤ W`) is written down. That covers its clearings,
  corridors, bushes, beds and forts. S gives the west quadrant and R gives team 1's two quadrants. The pits are
  authored whole and must be their own M mirror, as today.
- **Camp kinds follow M** (as today): the buff across the river from a Prickle Hollow is another Prickle Hollow. Both
  Prickle quadrants flank Grizzlechop on the Gutterway side, and both Crow quadrants flank the Great Pudding on the
  Fenceline side. Each team therefore has the same buff next to the same objective.
- **Map id:** stays `hearthwood`, and the name stays "Hearthwood Divide". Matchmaking, party, limits and backend rows
  need no new id. v21 and older bundles carry the old geometry inside them.

---

## 3. Lanes, base, towers and core (kept)

### 3.1 Lanes

Unchanged waypoints, lane width 8 m and shoulder (`laneHalf`) 5.5 m:

| Lane (index) | Role | Team 0 points, core to river | Core to core |
|---|---|---|---|
| `fence` (0) Fenceline, top | Solo | (16,16) → (8,26) → (8,104) → (12,116) | about 207 m |
| `yarn` (1) Yarn Road, mid | Mid | (16,16) → (64,64) | about 136 m |
| `gutter` (2) Gutterway, bottom | Fish (carry and Guard) | (16,16) → (26,8) → (104,8) → (116,12) | about 207 m |

Roles stay physical and the same for both teams (MAP-5V5 D1). The river meets each side lane near its outer corner,
which gives a third river access point per lane besides the jungle entrances.

### 3.2 Base

- Fountain (6.5, 6.5), radius 5 m.
- Core (16, 16).
- Hearth Guards at (21.5, 12.5) and (12.5, 21.5).
- Gate barrier `x + y = 26 m` until 0:05.
- In carved mode the base plaza is the triangle `x + y ≤ 48 m` inside the rim (new field `PLAYFIELD.baseSum = 48000`).
  It holds the fountain, core, guards and three lane mouths, plus the jungle base mouth P1 (§5.2).

### 3.3 Towers (v21 numbers, kept)

| Tier | Gutterway spot (Fenceline = swap) | Yarn Road spot | HP | Armour | Range | Opens when |
|---|---|---|---|---|---|---|
| outer | (80, 8) | (46, 46) | 3,000 | 40 | 7 m | always |
| inner | (54, 8) | (36, 36) | 3,500 | 50 | 7 m | that lane's outer has fallen |
| gate | (30, 8) | (26.5, 26.5) | 3,800 | 55 | 7 m | that lane's inner has fallen |
| Hearth Guard (2) | (21.5, 12.5), (12.5, 21.5) | – | 3,500 | 55 | 7 m | any gate tower has fallen |
| Core | (16, 16) | – | 4,500 | 60 | 7.5 m | both Hearth Guards have fallen |

Shot rules are the v21 ones: 120 base damage to heroes, +25% per consecutive shot up to +100%, 110 to minions, a 1.2 s
lock-on and backdoor −50%. Towers are **Fortified** (heroes deal −35% to them) until 5:00, and take ×2 damage from
Sunset. The corridors put two jungle exits within reach of each side lane's towers (§5.2). Gank dives therefore meet
these stronger towers, which keeps dives costly and readable.

---

## 4. River, pits and brush

### 4.1 Band

The river stays the band `|x + y − 128 m| ≤ 7.07 m` (10 m wide). It is walkable and has no slow. The centre crossing
(64, 64) is on Yarn Road (the **Thread Bridge**, §11).

### 4.2 Pit bulges

The old pits are rings of rock on the river axis, about 7 m in radius. They fill the 10 m band, so river traffic has to
go through a pit. In v22 the carved playfield adds a **disc of radius 12 m** at each pit centre: Grizzlechop's island at
(92, 36) and the Great Pudding's hollow at R = (36, 92). The existing `PIT_WALLS` ring stands inside the disc. The
result is a ring of rock with a walkable moat round it:

- the river flows round both sides of each pit: through team 0's half on one side and team 1's half on the other,
  each side the other's M mirror;
- the ring keeps its three mouths: one toward each team's jungle and a wide one toward the centre;
- each team's jungle corridor P7 (§5.2) ends at its own mouth.

A pit is then a place you go round or into, never a wall across the road. Prototype: fountain to Grizzlechop is 98.4 m
for team 0 and 97.0 m for team 1. The 1.4 m gap is raster rounding on the axis. The bake test pins the real gap at
≤ 1 m (gate G4, as in v19).

### 4.3 Brush (catnip bushes, existing rules)

The existing bush rules all apply: reveal within 2 m, minions see 3 m into brush, and attacking reveals for 1.5 s.

| South eighth bush (×4 with S and R) | Centre (m) | Size (m) | Where |
|---|---|---|---|
| River-side lane brush | (88, 13) | 3 × 6 | Gutterway, at the P8 exit beyond the outer tower |
| Inner-tower lane brush | (62, 13) | 3 × 6 | Gutterway, between the inner and outer towers |
| River entrance (upper) | (74, 46) | 4 × 3 | the river mouth of P6 |
| Pit approach | (86, 27) | 3 × 3 | P7, just before the pit's team mouth |
| Mid gank brush | (61, 48) | 3 × 3 | the mid end of P5, outside the lane band |
| Buff flank | (67, 28) | 3 × 3 | on P3 beside Prickle Hollow (ambush or buff steal) |
| Inner lane exit | (48, 16) | 3 × 3 | the lane end of P9 |

| River bush (×2 with R) | Centre (m) | Size (m) | Where |
|---|---|---|---|
| Centre crossing | (70, 58) | 3 × 3 | beside the Thread Bridge (kept) |
| Pit wide mouth | (84, 44) | 3 × 3 | its own M mirror; where both teams arrive for Grizzlechop (from the parked plan) |

That makes 28 + 4 = **32 bushes**, about 2.6% of the map. Test rule (from the parked plan): no bush overlaps a lane
band, a corridor's centre line, a camp leash centre, a cannon spot, a yarn home or a bed landing.

---

## 5. Jungle: carved forest, four quadrants

### 5.1 Playfield mode

`PLAYFIELD.open` gets a third value: **2 = carved**. A cell is walkable when any of these holds:

- it is inside the rim; and
- it is in a lane band (`laneHalf`), in the river band, in the base plaza (`x + y ≤ baseSum`, own corner), in a
  **clearing** disc, within a **corridor**'s half width of its segment, or in a **pit** disc.

Then `WALLS` (the pit rings) are stamped as today. Everything else is forest. `grid.ts onPlayfield` gains the carved
branch using the integer `nearSegment` it already has, and the clearings, corridors and pits are expanded to all
copies with S and R at bind. Crossing (`open: 0`) and old bundles do not change.

### 5.2 The south quadrant (team 0, Prickle side)

**Clearings** (disc centre and radius, metres):

| Id | Camp | Centre | r |
|---|---|---|---|
| C1 | Rat Nest | (42, 22) | 4.5 |
| C2 | **Prickle Hollow** (buff) | (58, 30) | 6 |
| C3 | Frog Pond | (80, 24) | 5 |
| C4 | **Beetle Log** (new) | (64, 42) | 4.5 |

**Corridors** (segment and half width; widths of 5 m, or 6 m for the trunk):

| Id | From → to | Half width | Job |
|---|---|---|---|
| P1 | (30, 18) → (42, 22) | 2.5 | base mouth into the jungle |
| P2 | (42, 22) → (58, 30) | 3 | trunk: Rat Nest to buff |
| P3 | (58, 30) → (80, 24) | 3 | trunk: buff to Frog Pond |
| P4 | (58, 30) → (64, 42) | 2.5 | buff to Beetle Log |
| P5 | (64, 42) → (57, 51) | 2.5 | **mid gank exit, river side** (between the mid outer tower and the river) |
| P6 | (64, 42) → (76, 48) | 2.5 | **river entrance, upper** (toward the centre and the cannon spot) |
| P7 | (80, 24) → (87, 30) | 2.5 | **river entrance, pit**: to Grizzlechop's team mouth |
| P8 | (80, 24) → (88, 13) | 2.5 | **side-lane gank exit, river side** (past the outer tower) |
| P9 | (50, 26) → (48, 13) | 2.5 | **side-lane exit, inner** (between the gate and inner towers) |
| P10 | (42, 22) → (35, 30) | 2.5 | **mid exit, base side**: near the mid inner tower, the safe crossing to the west quadrant |
| P11 | (72, 13) → (78, 20) | 2 | **Box Fort cut**, closed by a fort (tail item, §7.4); a short lane-to-Frog flank once broken |

Wall thickness checks from the prototype (forest between two walkable areas):

| Between | Wall |
|---|---|
| C2 buff and the Gutterway shoulder | 10.5 m |
| C3 Frog Pond and the lane | 5.5 m |
| C4 Beetle Log and the mid shoulder | 5.6 m |
| C4 and the river edge | 4 m |
| C1 Rat Nest and either lane | ≥ 4 m |

The rule: every wall is ≥ 3 cells. Below that, the renderer cannot place a tree in it and a skillshot reads as passing
through.

**Exits per quadrant:** 2 into the side lane (P8 risky, P9 safe), 2 into mid (P5 risky, P10 safe), 2 into the river
(P6 upper, P7 pit) and 1 into the base (P1). This is the grammar MOBA players expect. A risky exit sits toward the
river and puts you near the enemy. A safe one sits under your own towers.

### 5.3 The other three quadrants

| Quadrant | How it is made | Buff camp |
|---|---|---|
| West (team 0, Fenceline side) | `S` of South | **Crow Roost** at (30, 58) |
| North (team 1, Fenceline side) | `R` of South | **Crow Roost** at (70, 98): kinds follow M, so it faces team 0's Crow Roost across the river |
| East (team 1, Gutterway side) | `R` of West = `M` of South | **Prickle Hollow** at (98, 70) |

The North and East positions take each quadrant's geometry from R and its buff kind from M, as today's code does
(`hearthwood.ts` CAMPS). The build pins all four positions in a test.

### 5.4 Camps

| Camp | Monsters | HP | Armour | Damage | Leash | First / respawn | XP | Fish (last / near) | Reward |
|---|---|---|---|---|---|---|---|---|---|
| **Prickle Hollow** (buff, S/E) | 1 hedgehog | 1,800 | 40 | 60 / 1.0 s | 9 m | 0:30 / 90 s | 120 | 90 / 20 | **Prickle Coat** 75 s: basics slow 20% for 1 s and deal +3% of the target's max HP (cap 90 a hit) |
| **Crow Roost** (buff, W/N) | 1 old crow, ranged 4 m | 1,500 | 30 | 55 / 1.0 s | 9 m | 0:30 / 90 s | 120 | 90 / 20 | **Feather** 75 s: cooldowns recover 20% faster, +5% move speed |
| Rat Nest | 2 rats | 450 each | 0 | 25 / 1.0 s | 8 m | 0:30 / 60 s | 110 | (rats) | – |
| Frog Pond | 1 toad | 900 | 20 | 35 / 1.2 s | 8 m | 0:30 / 60 s | 80 | 70 / 15 | – |
| **Beetle Log** (new) | 1 stag beetle | 1,100 | 25 | 45 / 1.2 s | 8 m | 0:30 / 60 s | 90 | 70 / 15 | – |

- These are the existing `CAMP_KINDS` rows, plus one appended row: `beetle`, index 5.
- **Buff steal** stays: a hero who takes down a buff holder gets the buff's remaining time.
- **Species flavour (render only):** the buffs keep one name each, so callouts stay clear, but they look different on
  the two species.
  - Prickle Coat: puffed bristles on a cat's tail, raised hackles on a dog.
  - Feather: a feather-toy bob over a cat's head, a fetch stick wagging on a dog.
- **Jungle income:** 20 monsters instead of 16 raise the gold available from the jungle by about a fifth. The economy
  probe in §14 checks that a Prowl who full-clears is within ±10% of the average laner's Fish and XP at 5:00. If it is
  not, the first lever is the Beetle Log's XP and Fish, and the second is `HEARTHWOOD_RULES.xpBp`.

---

## 6. River objectives

### 6.1 Early: Captain Grizzlechop (kept)

Grizzlechop is our rat-pirate boss (GDD §3.2). His island pit sits at (92, 36), in the south-east river between the two
Prickle quadrants, on the Gutterway side.

- **Spawn:** first at 2:00, then 2:00 after he falls. No spawn after 8:30.
- **Stats:** 3,400 HP (+6% per minute at spawn), armour 30.
- **Attacks:** Bite 140 every 1.2 s, and Tail Sweep every 6 s: a 1 s telegraph, then a 4 m ring for 160 and a slow.
- **Reset:** he heals to full after 4 s with no hero in his leash.
- **Reward (last hit):**
  - every hero on the team gets +150 Fish (+30 per earlier take) and +100 XP, and the last hitter +50 Fish;
  - each living hero gets **Grizzlechop's Hoard**, a shield of 250 + 25 × level for 45 s;
  - a team 2 or more towers behind gets +50% of the Fish and XP (the comeback rule).

This is the "dragon" slot: an early, repeatable fight that rewards teams but cannot end a match.

### 6.2 Late: Great Pudding, plus Sugar Rush (new reward)

The Great Pudding's mould hollow is at (36, 92), in the north-west river between the two Crow quadrants.

- **Spawn:** first at 8:00, then 2:30 after the escort leaves.
- **Fight:** the calm meter (7,000) fills with damage. A scared hop knocks back everyone within 4 m every 4 s.
- **Reward, kept:** Pudding's Courage. The Great Pudding walks with the calming team's next wave on the lane with the
  fewest enemy towers left; a `push` ping overrides the lane. Escort HP 6,000, breath 260 within 7 m every 2 s.
- **Reward, new: Sugar Rush.** Each living hero of the calming team gets it for 90 s. Allied minions within 8 m of a
  Sugar Rush hero take −30% damage and deal +30% to structures. It shows as a candy-pink ring under the hero and pink
  sparkles on the boosted minions.

Sugar Rush is the "baron" grammar: a team buff that turns a won fight into a siege anywhere on the map, while the escort
pushes one lane. Its cost is one aura check per minion each second (96 minions × 5 heroes), with no allocation.

### 6.3 Timers and readability

- **Minimap:** each pit icon shows a countdown ring from 60 s before its spawn, and a pulsing icon while the objective
  is up. Both teams see them; the data comes from `mapInfo` plus the existing snapshot globals.
- **Announcer:** "Grizzlechop in 30 seconds", "The Great Pudding wobbles awake!" and "Sugar Rush!" use the existing
  `Moment` path. Voice keys stay silent until recorded, under the existing rule.
- **On the ground:** brush sits at each pit's team mouth and at its wide mouth (§4.3), so an objective fight starts
  with a read of who is where. That is the decision the standard layout teaches.

---

## 7. Twists on top

### 7.1 Kibble Cannon (v21) in 5v5: keep, unchanged

- Its two spots, (78, 50) and (50, 78), are on the river axis next to each quadrant's upper river entrance (P6 ends at
  (76, 48)). The carved map already funnels traffic past them.
- Timing stays as in v21: first at 3:00, respawn 90 s, alternating spots, no spawn after Sudden Death, and the
  Underdog offset.
- **Where it fits:** it is a mid-river map event between the two objectives. It is not a third objective: it never
  spawns in a pit, and it gives no team reward of its own.
- Founder call in §17: pause it while the Great Pudding is wild (default: no).

### 7.2 Mega Yarn Ball (v21): keep

One ball at the Thread Bridge (64, 64), up from 2:00. Unchanged.

### 7.3 Boing Beds: re-authored as lane-to-buff launch pads

v21's four Hearthwood beds launch over rocks that no longer exist. The new rows give one bed per quadrant: a cushion on
the side-lane shoulder just past the inner tower, (58, 12.5), launches to the buff clearing edge, (58, 25). Its copies
come from S and R.

- **Job:** a laner joins a buff fight, or a jungler escapes into the safety of its lane. The flight takes 0.9 s over
  12.5 m of forest.
- **Use:** anyone can use a bed, as today. An invader can escape through your bed, which is symmetric for both teams.
- **Rules unchanged:** reach 0.9 m, 3 s cooldown, and the bot rule (use when the landing is ≥ 8 m closer to the goal).

### 7.4 Box Forts (v22 tail): breakable walls

- **What:** one stack of cardboard boxes per quadrant, closing corridor P11 at (75, 16), 3 × 3 m.
- **Breaking:** a fort has 600 HP and armour 0. Only heroes damage it; minions and towers ignore it. It gives no
  reward.
- **Rebuilding:** it comes back 150 s after it falls, on the first tick no unit stands in its footprint
  (deterministic).
- **Effect:** a broken fort opens a short flank from the lane to the Frog Pond. Breaking one is a visible, audible
  decision: "the dogs chewed through!"
- **Sim:** a new `Kind.Fort` range after Pudding (`CAPS.forts`: Hearthwood 4, Crossing 0, so Crossing ids do not
  move). Its footprint uses the structure `cover` path in `grid.ts`, which already frees cells when a tower falls. No
  dynamic re-bake is needed, which answers the parked plan's objection to breakable walls.

### 7.5 Zoomie Mouse (v22 tail): river critter, reused from the parked branch

- **When:** a passive wind-up mouse on a seeded river half at 1:00, then every 2:00. It is Hearthwood only here.
- **What it gives:** a Sunbeam Spot (+25% move speed, reveals bushes within 10 m to the owner's team, 90 s). It deals
  no damage and gives no stats, so it adds early fights without snowball.
- **Code:** `data/river.ts` (MOUSE and SUNBEAM only; River Current is dropped because it is not part of the standard
  grammar), `units/mouse.ts`, and the mouse and Sunbeam parts of `bots/river.ts`.
- **Path:** the mouse paths change to the new river entrances: south-east (72, 56) ↔ (86, 42), north-west reflected.
  Both stay on the river band.

---

## 8. Sketches

### 8.1 Schematic (team 0's view: own base bottom left)

```
 y=128 ┌──────────────────────── FENCELINE (top) ─────────────────────────────┐
       │ t1 outer      t1 inner      t1 gate                  [WOOF BASE]   │
       │  ║ ~~ ( Great Pudding  )        NORTH jungle (t1)   Kennel Keep  ║  │
       │  ║  ~~(  mould hollow   )~~   Crow · rat · frog · beetle         ║  │
       │  ║ "   ~~~~~~~~~~~~~~~~~~~~ "   (corridors, brush at exits)      ║  │
       │ T║  WEST jungle (t0)   K  ~~~~ river ~~~~           ╱   EAST     ║t │
       │  ║  Crow Roost · rat ·   ~~~~~~~ "Thread Bridge"  ╱  jungle (t1) ║  │
       │ T║  frog · beetle          ~~~~~~(Y)~~~~~~~   ╱  Prickle · rat  ║t │
       │  ║        ↘ P5/P10 mid exits      ╱   ~~~~~~~ K   · frog · beetle  ║  │
       │ T║   o bed          YARN ROAD ╱          ~~~~~~~~~~~~ "          ║t │
       │  ║                       ╱    SOUTH jungle (t0)  ~( Grizzlechop )~ ║  │
       │  ║ [PURRHAVEN BASE]  ╱   Prickle Hollow · rat ·   ~( wreck island)~║  │
       │  ║ Hearth Cottage ╱    frog · beetle    X fort  o bed     ~~~~~~  ║  │
 y=0   └──────────── T gate ────── T inner ────── T outer ── GUTTERWAY (bottom) ┘
      x=0                                                                x=128
   ~ river (widens round both pits)   " brush   K cannon spots   Y yarn ball   o Boing Bed   X Box Fort
```

### 8.2 Prototype raster (2 m wide × 4 m tall per character, y up)

This raster was made by a throwaway script from the numbers in §3–§7: the lanes, the river, the base, the clearings,
the corridors, the pit discs and the existing pit rings.

- **Results:** walkable share 69.0%, zero cells off the D2 symmetry, every walkable cell reachable from the fountain.
- **Legend:** `.` walkable, `:` partly walkable, `#` forest or rock, `~` river, `=` lane, `"` bush, `T`/`t` towers
  (team 0 / team 1), `H`/`h` cores, `P` Prickle Hollow, `C` Crow Roost, `r` Rat Nest, `f` Frog Pond, `b` Beetle Log,
  `G` Grizzlechop, `U` Great Pudding, `K` cannon spots, `Y` yarn ball, `o` Boing Bed, `X` Box Fort.

```
#~~~~:####::...................................................#
#~~~~~~.....============t============t===========t=............#
#~~~~~================================================.........#
##:~~==~~~~.........".....X......".o...."............t==h......#
##..==~~~~~~~:#####:...::..:##########...:...........=====.....#
#..==..~~~~~~~~:#####...f..::#########.....r...::..====..t==...#
#..==..#:~~~~~~~~...."........"...............:..=t==......==..#
#..==..###:~~~##~~~.....:#:::......C...:####...====..:.....=t..#
#..==..#####.~:~~~U~~:..########.....:####:..=t==..:#...:..==..#
#..==."::###...~~~~~~~~.######:....#####:..====........##..==..#
#..==.....::."...~~~~~"~~:#::...b.####:..====..:##:..r.##..==..#
#..=T..:....f......~~~~~~~~".....".::..==t=..:####......"..==..#
#..==..:......:#####:~~~~K~~~:###....====..:#####..........==..#
#..==...X:#...:######:."~~~~~~~::..====..:####:.....#####..=t..#
#..==..:###:...#####:...:~~~~"~~~====....:##::...P..#####o.==..#
#..==..#####..".##:..b.:##:~~~~=Y==..:::"..b.......:#####".==..#
#..==."#####:..........."::..====~~~~:##:....:##..".#####..==..#
#..==.o#####...C..::##:....====~~~~"~~~:...:#####...:###:..==..#
#..=T..#####.....:####:..====..::~~~~~~~~":######:...#:.X..==..#
#..==..."......#####:..====..."###:~~~~K~~~:#####:..f...:..=t..#
#..==.........####:..==T=..::........"~~~~"~~...........:..==..#
#..==..##..r.:##:..====..:####..b..::#:~~~~~~~~...".::...".==..#
#..==..##........=T==..:#####....:######.~~~~~G~~...###::..==..#
#..==..:...#:..====..:####:.....########..:~~~~~~:~.#####..==..#
#..=T.....:..====...####:....P...".:::#:.....~~~##~~~:###..==..#
#..==......==T=..:......................f.."...~~~~~~~~:#..==..#
#...==T..====..::....r....#########::......#####:~~~~~~~~..==..#
#.....==H==...........:.".##########:X.::...:#####:~~~~~~~==..##
#......===T..................o."............"........~~~~==~~:##
#.........=====T===========T============T=================~~~~~#
#............=======================================.....~~~~~~#
#...................................................::####:~~~~#
```

The real bake (`grid.ts`, 1 m cells) replaces this raster, and the tests in §16 step 2 pin it.

### 8.3 Walk distances (prototype, 8-direction grid, metres; ÷ 4.9 for seconds)

| From → to | m | s |
|---|---|---|
| Fountain → own Rat Nest / buff / Frog Pond / Beetle Log | 43 / 62 / 83 / 73 | 9 / 13 / 17 / 15 |
| Fountain → Grizzlechop / Great Pudding / centre | 98 / 98 / 82 | 20 / 20 / 17 |
| Own buff → Grizzlechop (Prickle side) | 39 | 8 |
| Frog Pond → Grizzlechop | 17 | 3.5 |
| Own buff → enemy buff across the river | 58 | 12 |
| Fountain → enemy buff (invade) | 119 | 24 |
| Beetle Log → cannon spot (same half) | 17 | 3.5 |
| West Rat Nest → South Rat Nest (crossing mid at P10) | 28 | 6 |

---

## 9. Bots: route graph and behaviour

### 9.1 The graph (static, derived, not hashed)

The south quadrant's nodes are written once and copied to all four quadrants with S and R:

| Kind | South quadrant nodes |
|---|---|
| Base | B (30, 18) |
| Camps | C1 Rat (42, 22), C2 Buff (58, 30), C3 Frog (80, 24), C4 Beetle (64, 42) |
| Junction | J (50, 26), on P2 |
| Lane exits | L-safe (48, 13), L-risky (88, 13) |
| Mid exits | M-safe (35, 30), M-risky (57, 51) |
| River entrances | R-up (76, 48), R-pit (87, 30) |
| Fort | F (75, 16), open only while its fort is down |

Shared nodes: the two pit centres, the centre crossing (64, 64), each lane's outer and inner tower front, and both
fountains. That makes about 60 nodes.

Edges are the corridors, with lengths measured by A* on the baked grid. At bind, `sim/bots/graph.ts` builds an
all-pairs next-hop table, about 60 × 60 bytes. This is derived state, like the nav grid, so it is not hashed. Bots
route node to node and use A* only for the last stretch inside a clearing or a fight. That keeps the A* cost below
today's open-meadow searches.

### 9.2 Prowl (jungler)

**First clear.** The route is fixed and deterministic. It mirrors per team, and it ends at the early objective:

```
Crow Roost (W) 0:30 → Rat Nest (W) → cross mid at M-safe → Rat Nest (S) → Prickle Hollow (S) → Beetle Log (S)
→ Frog Pond (S) → Grizzlechop (≈ 2:10)
```

Estimate, assuming about 100 dps at levels 1–2 and the Solo laner helping on the first buff for 5 s:

| Arrives at | Time |
|---|---|
| Crow done | 0:45 |
| West Rat Nest | 0:58 |
| South Rat Nest | 1:13 |
| Prickle done | 1:37 |
| Beetle done | 1:51 |
| Frog done | 2:07 |
| Grizzlechop | about 2:11 |

The probe measures the real times (§14).

**After the first clear,** the Prowl picks the best of these on each think. Ties go to the lower node id.

1. **Gank.** At any exit node (L-*, M-*), it ganks a lane when all of these hold:
   - an enemy laner on that lane is visible within 18 m of the exit;
   - that laner is at ≤ 60% HP or stands past its lane midpoint toward our towers;
   - an allied laner is within 10 m of it;
   - the enemy heroes within 12 m are no more than the allies plus the Prowl.

   The Prowl walks through the exit's brush (the parked gank-path rule: a detour of ≤ 4 m is allowed). A gank that
   finds the target gone within 6 s goes back to the plan.
2. **Objective.** If Grizzlechop or the Great Pudding spawns within 20 s, or is up, the Prowl goes to its own pit mouth
   brush (the parked objective-wait rule) and calls the team (§9.4).
3. **Farm.** Otherwise it goes to the nearest own camp that is up, by graph distance. A buff wins a tie with a small
   camp.
4. **Invade** (Hard only). If an enemy buff will be up within 10 s and the enemy Prowl was last seen in the other
   enemy quadrant, or on our side, within 15 s, the Prowl takes the enemy buff through R-up. It retreats when 2 or more
   enemy heroes show.

**Rookie and Easy** Prowls skip gank rule 1's brush detour, never invade, and help the weakest lane after each camp, as
today.

### 9.3 Laners

- They stay in lane as today.
- Each lane gets a **danger read**: on Normal and Hard, a laner past its lane midpoint backs off to its outer tower
  when the enemy Prowl has been unseen for ≥ 12 s and was last seen in a quadrant that touches its lane. This is what
  makes a gank feel like a decision rather than a coin flip.
- **Lane exits back:** after a recall, a side laner takes the bed or the safe exit route when that is shorter. The graph
  decides.

### 9.4 Rotations and contests

- **Who goes to Grizzlechop:** the Fish laner, the Guard and the Prowl (as v19), once spawn is ≤ 15 s away. Mid joins
  when its wave has just crashed (no enemy minion within 10 m of its lane front) and its HP is ≥ 50%.
- **Who goes to the Great Pudding:** all five, from 7:45 or whenever it is wild. Lanes that are pushing go after the
  wave crashes.
- **Contest:**
  - count the visible heroes within 20 m of the pit, ours (plus our Prowl if it is within 25 m) against theirs;
  - **take** when ours ≥ theirs and our average HP is ≥ 50%;
  - **hold at the mouth brush** when ours < theirs;
  - **steal** when the enemy is taking it, its HP ≤ 15%, and our hero with the most burst is within 10 m.
- **After a take:** with Hoard, push the nearest lane whose outer tower stands. With Sugar Rush, push the lane the
  escort walks. With neither, go back to farm and lanes.
- **The cannon** keeps the v21 rules. The **Zoomie Mouse** (tail) keeps the parked rules.

### 9.5 Determinism

All of §9 runs on the 6-tick think from world reads and the bot RNG, in slot order, with no `Math.random`. The graph is
rebuilt identically in a live match and in its replay.

---

## 10. Expected timings (bots, all Normal, fresh seeds)

| Beat | Target (p50) | Window (p10–p90) | Why |
|---|---|---|---|
| First wave meets (mid / side lanes) | 0:39 / 0:49 | fixed | waves from 0:20, 3.6 m/s |
| First jungle exit used by a Prowl | 1:50 | 1:30–2:20 | end of the first clear (§9.2) |
| **First blood** | 1:45 | 1:00–2:45 | lane meets plus first-clear ganks; the old layout's p50 was 0:59, with no ganks |
| **First Grizzlechop take** | 2:40 | 2:10–3:30 | spawn 2:00, the Prowl arrives about 2:10 |
| Kibble Cannon first fired | 3:30 | 3:05–4:30 | spawn 3:00 |
| First tower | 5:00 | 4:00–6:00 | Fortified ends at 5:00 |
| **First Great Pudding calm** | 9:00 | 8:15–10:30 | spawn 8:00 |
| Sunset / Sudden Death (Normal) | 10:00 / 13:00 | fixed | timeline row unchanged |
| **Match length** | **12:00–14:30 median**, ≤ 2% safety end (16:00) | | GDD §3: 12–15 min; the existing 5v5 gate |

**Flow targets** (map-study probe, against the v21 baseline measured first on the same seeds):

| Metric | Target |
|---|---|
| Hero time calm | ≤ 42% (v19: 53%) |
| Longest calm stretch p50 / p90 | ≤ 50 s / ≤ 85 s |
| Takedowns where the killer's team had a hero arrive through a jungle exit in the last 10 s (the gank share) | ≥ 25% |
| Deaths within 15 m of a pit | ≥ 12% |
| Fights that start in a base | ≤ 22% |

---

## 11. Art direction and landmarks (render only)

### 11.1 Theme

A cozy autumn wood, at dusk, on the edge of a village. Cats keep the bottom-left; dogs keep the top-right. The existing
Hearthwood palette (`HW`), leaf litter, lantern posts and instanced autumn forest stay. What changes is what the forest
*is*: dense hedgerow-and-tree mass with warm-lit paths through it.

### 11.2 Landmarks (one per place a player should name)

| Place | Landmark | Readable from |
|---|---|---|
| Team 0 base | **Hearth Cottage**: the core as a big iron stove with a cushion pile, cat banners | anywhere: chimney smoke |
| Team 1 base | **Kennel Keep**: the core as a red barrel-roofed kennel tower, bone banners | anywhere: weather-vane dog |
| Mid crossing | **Thread Bridge**: plank bridge wrapped in Yarn Road's red thread; the yarn ball's home | the red thread line |
| Grizzlechop's island | **Wreck of the Cheddar Gull**: the rat-pirate wreck (existing) on a sandbar, moat round it | the mast and cheese-wheel sail |
| Great Pudding's hollow | **Jelly-Mould Hollow**: the mossy mould (existing), a wobbling pink glow | the pink glow |
| Prickle Hollow | **Apple Den**: a fallen log full of apples, a hedgehog asleep in leaves | red apples |
| Crow Roost | **Lantern Oak**: a dead oak hung with lanterns and shiny trinkets | blue lantern light |
| Rat Nest | **Flowerpot Nest**: tipped terracotta pots | terracotta |
| Frog Pond | **Lily Pond**: a round pond with lily pads | blue disc |
| Beetle Log | **Glow Log**: a mossy hollow log with green-glowing beetles | green glow |
| River entrances | **Reed Steps**: stepping stones flanked by tall reeds (the brush) | reeds |
| Fenceline / Gutterway | picket fence / stone gutter along the lane (existing) | lane edging |
| Boing Beds | pastel cushions with a paw print (v21) | pastel |
| Box Forts | stacked cardboard boxes with paw doodles; on the dogs' side, chewed corners | brown boxes |

Buffs, pits and camps each get a **colour key** that holds on the minimap and on Low tier:

| Colour | Means |
|---|---|
| red | Prickle |
| blue | Crow |
| rust | Grizzlechop |
| pink | Pudding / Sugar Rush |
| green | Beetle |
| grey | Rat |

### 11.3 Originality checks

- Every coordinate in this plan comes from our own 128 m frame, our existing lane lines and our own D2 rule. No other
  map's image or coordinates were used.
- Our quadrant shape (4 clearings on a trunk, 7 exits), our island pits with a moat, the pit placement on the axis and
  our landmark set are our own. No traced wall outlines.
- No borrowed names or monster designs: hedgehog, crow, rats, toad, beetle, rat pirate, pudding, mouse.
- Before the art lands, the build checks that the shot from the `shot-5v5.mjs` camera does not read as a recolour of a
  known map. The founder sees it in the PR.

---

## 12. Phones: 60 fps

The carved forest roughly doubles the blocked area that needs dressing. Budget rules:

- **Edge trees only, in full:** trees are instanced only on blocked cells that touch a walkable cell (the silhouette).
  Deeper forest cells get a **canopy card layer** instead, a few large instanced canopy quads over a dark ground tint.
  Estimate: about 600 edge trees and about 120 canopy cards, in 3 instanced draws.
- **Low tier** (and the governor's first step): edge trees at half density (the existing "far forest at half" rule),
  canopy cards only, no tree sway, no shadows. **Med:** full edge trees, no sway beyond 30 m from the camera.
- **Occlusion:** the existing `CANOPY_CUT` fade applies near the own hero and the camera target, so the forest never
  hides your own hero. Corridors are ≥ 5 m wide, so tree crowns lean away from the path centre (authoring rule).
- **Ground:** clearings, corridors and reed steps are painted into the existing 2,048 px ground texture
  (`HW_PX_PER_M` 16). That adds no draws.
- **Budget gate:** the phone perf trace (PERF-IOS) is measured in a 5v5 team fight at the Grizzlechop island with
  Sugar Rush, the cannon and 2 burning towers on screen. It must hold 60 fps on the reference phones on Low and Med.
  Draw calls must not exceed today's Hearthwood, and `npm run budget` must stay under its first-load cap.
- **Sim cost:** graph routing replaces most long A* searches; `NAV.maxExpand` 8000 stays. The Sugar Rush aura is one
  pass per second. The tick budget is checked by the existing headless timing (`tools/measure.mjs`) at ≤ v21 + 10%.

---

## 13. Sim and data changes

### 13.1 Versioning

- `SIM_VERSION` 21 → **22**. Freeze v21 at its release commit, `77f3b273` on this branch's base, with
  `tools/vendor-sim.mjs`, as "freeze sim v19 at f9733681 and vendor sim v21" did. Then vendor v22 to the backend. Update
  the backend's version list and the replay version list in the same commit.
- **Crossing is byte-identical to v21:** no Crossing data changes. All new state is hashed only when the map is
  Hearthwood (the v19 pattern for the extra hit-mask words). Gate G1 (`map-identity.mjs --check` against a v21
  baseline) must pass.
- **Old replays:** a v21 Hearthwood replay must render the v21 scenery. The client builds `mapInfo` from the replay's
  own sim bundle, or else keeps a frozen copy of the v21 Hearthwood info for the replay viewer. The build checks which
  path is live and pins it with a test.

### 13.2 Data (`src/data`)

- **`maps/hearthwood.ts`**:
  - `PLAYFIELD.open: 2`, `baseSum: 48000`;
  - new `CLEARINGS`, `CORRIDORS` and `PIT_DISCS` (south eighth, mm);
  - `SOUTH_WALLS` emptied (the forest replaces the rocks); `PIT_WALLS` kept;
  - new `SOUTH_BUSHES` and `RIVER_BUSHES` (§4.3);
  - `SOUTH_CAMPS` gains the Beetle Log;
  - `CAPS.campMonsters` 17 → 21 (20 jungle + Grizzlechop);
  - `HEARTHWOOD_PVP` refit (§14).
- **`map.ts`**: `PLAYFIELD` type gets the carved fields (Crossing values 0); `MAX_ENTITIES` 150 → **160**. The hit masks
  already cover 160 ids: 2 base words plus `MASK_EXTRA` 3.
- **`camps.ts`**: append `beetle` (index 5) to `CAMP_KINDS` and `CAMP_KIND`.
- **`pudding.ts`**: `HEARTHWOOD_PUDDING` gets the Sugar Rush fields (`rushTicks` 2700, `rushRange` 8000,
  `rushTakenBp` 7000, `rushStructBp` 13000).
- **`fun.ts`**: new `HEARTHWOOD_BEDS` rows (§7.3). The cannon and yarn rows are unchanged.
- **New `maps/hearthwoodGraph.ts`**: the south-quadrant nodes and edges (§9.1).
- **Tail:** `FORTS` rows and `Kind.Fort`; `data/river.ts` (MOUSE and SUNBEAM only).

### 13.3 Sim (`src/sim`)

- **`map/grid.ts`**: the carved branch of `onPlayfield`, plus expanding the clearings, corridors and pit discs with
  S and R. Fort footprints go through `cover`.
- **`map/info.ts`**: `mapInfo` gains `clearings`, `corridors`, `beds`, `forts`, `jungleNodes`, the `beetle` camp kind
  name, and the objective timers.
- **`units/camp.ts`**: the beetle kind (a plain camp, no new behaviour).
- **`units/pudding.ts`**: grant Sugar Rush on the calm. **`combat/damage.ts`**: apply the minion aura (taken / structure
  bp).
- **New `bots/graph.ts`**: next-hop table at bind.
- **`bots/brain.ts`**: the Prowl plan, gank rule, objective wait, invade, laner danger read, rotations and contest
  (§9).
- **`bots/river.ts`**: port the parked objective-wait and gank-path helpers (§13.4).
- **Snapshot:** the Sugar Rush buff bit, the fort entities, and (tail) the mouse and Sunbeam. All are appended.

### 13.4 Reused from the parked branch (`c5814a72`)

| Parked piece | Use in v22 |
|---|---|
| `bots/river.ts` objective wait + gank path | **yes**: core of §9.2 rules 1–2 and §9.4 hold at the mouth brush |
| Pit wide-mouth bush (84, 44) and pit-mouth bushes | **yes** (§4.3) |
| `units/mouse.ts`, `data/river.ts` MOUSE/SUNBEAM, `render/views/riverView.ts` mouse and Sunbeam, minimap glyphs | **tail** (§7.5), with new paths |
| River Current | **no**: not part of the standard grammar; the corridors do the routing job |
| Crossing Pudding Hollow, Crossing Ambush Brush, Crossing mouse | **no**: the 3v3 map is not touched in v22 (§15) |
| `tools/pvp-map-probe.mjs` + `lib/pvp-map-entry.ts` | **yes**: the base of the v22 map probe (§14) |
| `tests/unit/sim-v22.test.ts` | rewrite; keep its determinism and replay harness |

### 13.5 Entity budget (Hearthwood, ids < 160)

| Kind | Count |
|---|---|
| heroes | 10 |
| minions | 96 |
| towers | 22 |
| cores | 2 |
| fountains | 2 |
| camp monsters | 21 (Grizzlechop included) |
| (tail) Zoomie Mouse | +1 |
| Pudding | 1 |
| (tail) forts | +4 |
| **Total** | **154 without the tail, 159 with it** |

If the tail needs more, cut the minion cap to 90 (3 lanes × 2 teams × 3 waves × 5) before raising past 160.

---

## 14. Balance gates (fresh seeds)

Run on seeds the v19–v21 fits never used (`--from 50001`). Every slot is a `normal` player-bot unless a row says
otherwise.

| Gate | Pass |
|---|---|
| G1 Crossing identity | `map-identity.mjs --check` against the v21 baseline: 0 differences (500 seeds) |
| G2 Determinism | `hearth-gates.mjs --det 40`: a solo, a party and a PvP 5v5 match per seed replay to the same hash |
| G4 Map fairness | the bake test: D2 symmetry 0 cells off; each objective's path length from the two fountains within 1 m; every camp, exit and bed landing reachable; 0 incomplete A* over 4,000 random pairs |
| G5 Side | team 0 win rate **48–52%** over the mirrored pairs (`hearthSymmetryPair`; tighter than v19's 47–53, per the request) |
| G6 Heroes | every hero 46–54% (heroes under 60 matches reported, not gated); cats 47–53% |
| G7 Length | median 12:00–14:30; ≤ 2% reach the 16:00 safety end |
| G8 Comeback | a team trailing at 7:00 by ≥ 2 towers or ≥ 5 takedowns wins 20–40%; a team down 10+ takedowns at any point wins < 5% |
| G9 Jungle economy | the Prowl's Fish and XP at 5:00 within ±10% of the average laner |
| G10 Flow | the §10 flow table, measured by the v22 map probe |
| G11 First match | `fun1` / `novice` bands still pass (Rookie and Easy bots skip ganks, invades and brush waits) |
| G12 Phones | §12 perf trace and `npm run budget` |

**Fallback order if a gate fails:**

1. Side or a hero out of band: refit the `HEARTHWOOD_PVP` rows (logistic fit plus residual, as MAP-5V5 §12.10).
   Geometry is symmetric, so a side gap points at a bot rule that reads team order. Find it before tuning numbers.
2. Too long: Sugar Rush structure bonus +30% → +40%, then Fortified ends at 4:30.
3. Too short or snowbally: Grizzlechop's per-take Fish +30 → +20, then the Prowl's invade rule off on Normal.
4. Comeback over 40%: the Underdog Cannon offset → 0 (V21-FUN rule), then the Grizzlechop behind bonus +50% → +30%.
5. Flow short: the brush wait on Hard only, then the corridor widths (never narrower than 5 m).

Record the gate numbers in §18 of this file when built.

---

## 15. The 3v3 map stays compact and distinct (confirmed)

Purrhaven Crossing (100 × 60 m, mirrored left to right, 2 lanes, a single rat camp per side, the Pudding at the
centre) is **not changed in v22**:

- its hash is identical to v21 (gate G1);
- the v21 **Kibble Cannon** stays its central chaos, at (50, 36) and (50, 24) beside the Pudding: first 1:30, then
  every 120 s;
- the two yarn balls and the three beds per side stay;
- matches stay short (median 6:30–9:00).

The two maps now teach different things:

| | 3v3 Crossing | 5v5 Hearthwood |
|---|---|---|
| Lanes | 2 | 3 |
| Jungle | 1 camp per side | 4 quadrants with corridors |
| The map's main fight | the cannon and the Pudding at the centre, a scramble every 2 minutes | the read of lanes, jungle and objective timers |
| Speed | brawl in 7 minutes | standard grammar in 13 minutes |

The parked Crossing ideas (Pudding Hollow, the Crossing mouse) stay parked.

---

## 16. Build list (sim v22, branch `feat/pawlegends-5v5-standard`)

Order matters: the map bake comes first, so the client lane can draw against `mapInfo` while the bot work runs.

1. **Freeze and bump.** Freeze sim v21 (at `77f3b273`) with `tools/vendor-sim.mjs`. Set `SIM_VERSION` to 22. Update
   the backend and replay version lists. Record the Crossing v21 baseline: `map-identity.mjs --write`.
2. **Carved playfield.**
   - `PLAYFIELD.open: 2`, `baseSum`, `CLEARINGS`, `CORRIDORS`, `PIT_DISCS` in `maps/hearthwood.ts`;
   - the carved branch of `grid.ts onPlayfield` and its S/R expansion;
   - empty `SOUTH_WALLS`; keep `PIT_WALLS`;
   - `MAX_ENTITIES` 160.
   - Tests: D2 symmetry, wall thickness ≥ 3 cells, lanes and the river never blocked, every clearing, exit and landing
     reachable, the pit path gap ≤ 1 m, 0 incomplete A* over 4,000 pairs (the G4 bake test).
3. **Camps.** The `beetle` kind (index 5); the Beetle Log in `SOUTH_CAMPS`; `CAPS.campMonsters` 21; camp positions
   pinned for all four quadrants (kinds by M).
4. **Brush.** New `SOUTH_BUSHES` and `RIVER_BUSHES`. Test: no overlap with lanes, corridor centre lines, camp centres,
   cannon spots, yarn home or bed landings.
5. **Beds.** New `HEARTHWOOD_BEDS` rows. Test that every landing is walkable and outside brush.
6. **Sugar Rush.** Pudding grant and minion aura; snapshot bit; announcer; tests for the aura range, the duration and
   the structure and taken bp.
7. **`mapInfo`.** Clearings, corridors, beds, forts, jungle nodes, `beetle`, objective timers. This publishes the client
   interface.
8. **Bots.**
   - `bots/graph.ts` next-hop table;
   - the Prowl's first clear, gank, objective, farm and invade rules;
   - the laner danger read;
   - rotations and contest;
   - port the objective-wait and gank-path helpers from the parked `bots/river.ts`;
   - the Rookie and Easy limits.
   - Tests: the Prowl reaches Grizzlechop by 2:30 in ≥ 80% of seeds; at least one gank per Prowl before 4:00 in ≥ 60%
     of seeds; no bot is stuck for over 3 s (position delta) over 200 seeds.
9. **Render.**
   - `hearthwoodView`: painted corridors and clearings, edge-tree instancing and canopy cards, the pit moats,
     landmarks (§11.2), reed steps, Beetle Log, Sugar Rush ring and sparkles, buff species flavour;
   - minimap: corridors from `playable`, objective countdown rings;
   - Low and Med tier rules (§12).
10. **Probe and gates.**
    - Port `pvp-map-probe.mjs` to the v22 metrics (first blood, gank share, objective times, calm, pit deaths, base
      fights, jungle economy);
    - set `hearth-gates.mjs` side band to 48–52 and add the comeback rows;
    - run G1–G12 on fresh seeds;
    - refit `HEARTHWOOD_PVP`;
    - record the numbers in §18.
11. **Phones.** The perf trace on the reference phones (§12). Fix before merging if under 60 fps.
12. **Tail (only if G5–G10 pass with room):**
    - Box Forts (`Kind.Fort`, `cover` footprint, rebuild rule, render, bot "break the fort when ganking through F");
    - Zoomie Mouse and Sunbeam ported from the parked branch with new paths;
    - re-run G5–G12.
13. **Docs and release.** Update `MAP-5V5.md` §1 with a pointer here, `GDD.md` §3.2 (the map text), and the lore rows
    for the Beetle Log and Sugar Rush. Release notes: "Hearthwood rebuilt: real jungle paths, gank routes, river
    entrances". Merge into `main` when the gates pass (no flag).

**Estimate:**

| Steps | Work |
|---|---|
| 1–7 | about 2 days |
| 8 (bots) | 2–3 days |
| 9 (render) | 2 days |
| 10–11 (gates, refit, perf) | 2 days |
| 12 (tail) | 1–2 days |

---

## 17. Your call (the default applies if there is no answer)

| Question | Default |
|---|---|
| Keep Captain Grizzlechop (early) and the Great Pudding (late) rather than new creatures such as a yarn kraken or an alpha hound? A cat- or dog-themed boss would read as one side's; our two are neutral house creatures and already have art, lore and announcer lines | **Keep both**; add Sugar Rush so the late one reads as the "baron" |
| Pause the Kibble Cannon while the Great Pudding is wild, so the late fight is decided by the team, not one shot? | **No**: keep v21 timing; revisit with human PvP data |
| Box Forts and the Zoomie Mouse in v22 if the gates pass with room? | **Yes**, as the tail series on the same branch |
| Side win-rate gate 48–52% (the request) instead of v19's 47–53%? | **48–52%** |
| Keep the 128 m frame (vs shrinking to about 112 m)? | **Keep**: the carved forest already shortens the walks that matter, and the size keeps `MAX_CELLS` and every buffer as they are |

---

## 18. Gate results

Built on `feat/pawlegends-5v5-standard` (2026-11-11). Every number below is measured on fresh seeds (50001 on), on a
machine shared with other gate runs (timings in seconds are slow, results are not).

### 18.1 What the build changed from the plan

- **Jungle monsters, Hearthwood only:** `HEARTHWOOD_RULES.campHpBp` 6000 and `campDmgBp` 6000 (60% HP, 60% damage to
  heroes). At the §5.4 stats a level 1 Prowl took over 30 s on the Crow Roost, left at half HP and reset it, and earned
  almost no camp XP by 5:00 (probe: 0 to 80 camp XP). The §5.4 rows stay as data; the rule scales them.
- **Jungle pay:** `jungleXpBp` 7500 and `jungleFishBp` 6200 (camps only; Grizzlechop keeps his reward), fitted to G9.
- **Bots, beyond §9:** a gank may start during the first clear on a hurt laner (≤ 50% HP) near an exit; contest holds
  apply only within 30 m of the pit and last 3 s; the laners' danger read applies only to a bot laning near its own
  outer structure; on Hearthwood a bot keeps a walk goal for 1.5 s before a goal more than 8 m away replaces it (not
  when retreating). Without the last two, two rules taking turns (push and back-off, lane and objective hold) held bots
  at forks of the carved jungle.
- **Gank memory** starts at the target, not the exit brush (the parked brush-detour helper was not ported).
- **Not built:** Box Forts and the Zoomie Mouse (the §16 tail), the phone perf trace (§12, needs the reference
  phones), the Hard-only invade has no probe coverage. `npm run budget` was not run in this pass.

### 18.2 Gates

| Gate | Result | Pass |
|---|---|---|
| G1 Crossing identity | `map-identity.mjs --check` against a v21 baseline written from `77f3b273`: 1500 / 1500 identical | yes |
| G2 Determinism | `hearth-gates --det 12`: 36 / 36 solo, party and PvP records re-sim identically | yes |
| G4 Map fairness | `sim-v22.test.ts`: D2 symmetry 0 cells off; forest walls ≥ 3 cells; lanes and river open; every cell reachable; each pit equally far (A*, ≤ 1 m) from both fountains; 0 short A* over 4,000 random pairs | yes |
| G5 Side | team 0 49.1% of 1,200 (seeds 50001–50600) | yes |
| G5 Species | cats 52.1% | yes |
| G6 Heroes | seeds 50001–50600: 17 of 20 in 46–54% (Domino 42.9%, Rocket 45.5%, Meatball 54.1%) → `HEARTHWOOD_PVP` rows +3%, +1.5%, −1%. Re-check on seeds 51001–51400 (800 matches): 19 of 20 in band (Domino 50, Rocket 53, Meatball 50); Stilts 45.6% of 408 (49.2% of 608 before; 47.7% pooled), read as noise and left alone; side 51.0%, cats 49.3% | yes, pooled |
| G7 Length | median 13:06, p95 13:13, 0% safety end | yes |
| G8 Comeback | probe, 48 seeds: behind at 7:00 wins 31% (20–40 ✓); down 10+ takedowns wins 11% (< 5% ✗; 35 matches) | partly |
| G9 Jungle economy | Prowl at 5:00: XP 109%, Fish 110% of the laners' average (v21 on the same seeds: 65% / 76%) | edge |
| G10 Flow | calm 56.5% (target ≤ 42; v21 54.5%); longest calm p50 52 s / p90 106 s; gank share 29% (≥ 25 ✓); pit deaths 10% (≥ 12 ✗); base fights 5% (≤ 22 ✓) | partly |
| Bots | Prowl at Grizzlechop by 2:30 in 99%; a gank before 4:00 in 100%; heroes stuck over 3 s in 5 of 48 seeds (v21: 4 of 48) | 2 of 3 |
| G11 First match | not re-run (Rookie and Easy keep the v19 jungle habit, `BotParams.jungle` 0) | – |
| G12 Phones | not run | – |

**Timings (probe p50, 48 seeds):** first blood 0:58 (target 1:45: lanes meet and trade before any gank), Prowl at
Grizzlechop 2:04, first gank 1:05, first Grizzlechop take 2:47 (target 2:40), Kibble Cannon fired 3:09, first tower
4:02, first Great Pudding calm 8:33 (target 9:00), match 13:06.

### 18.3 Old replays (§13.1 risk)

The client has no replay viewer (GAPS N1, the kill cam, is not built). It renders only live matches with its own
bundled sim, so no client path draws a v21 Hearthwood match with v22 scenery. Old records are only re-simulated by the
backend, each with its own frozen bundle. When the kill-cam viewer is built, it must take `mapInfo` from the record's
own sim bundle.

### 18.4 Balance pass (2026-11-11, fresh windows 61001 to 66300)

All numbers are Normal player-bots on all ten slots. Tuning was done on seeds 61001–61200; the gates were run on
windows the fits never saw: A 62001, B 63001 (before the hero refit), C 64001 (a rejected bot change), and the final
build on D 65001 and E 66001. Each window is `hearth-gates --seeds 300` (600 mirrored matches) plus
`map5v5-probe --seeds 200`.

**What changed**

- **Bots, Hearthwood only** (`w.mg.length > 0`; Crossing is untouched, G1 below):
  - *Walk hold for attacks too* (`brain.ts holdWalk`): a walk goal, or an attack on a target out of reach, keeps
    for `JUNGLE_BOT.goalHold` (1.5 s) before a new goal more than `goalFar` away replaces it. Before, only Moves were
    held, so a bot at the edge of a rule (siege range, tower or core fire, engage range, two objectives) flipped
    between "walk there" and "attack that" every think: 30 of 120 seeds had a hero stuck over 3 s.
  - `goalFar` 8 m → **5 m** (two lane goals 7.5 m apart flipped under 8 m). 3 m was tried on window C and rejected:
    cats 45.8%, 10 heroes out of band.
  - *Fountain foes*: a foe standing in its own fountain is not picked unless it is already in reach (bots stood at the
    fountain edge under core fire).
  - *No fight step into the forest*: a kite or dodge point on a blocked cell is skipped; the bot hits its foe instead.
  - *Grouping at 8:00*: Normal and Hard teams group in one push lane from `JUNGLE_BOT.groupAt` 14400 (8:00, the Great
    Pudding spawn) instead of the Crossing's 3:55; a team 5+ takedowns ahead still groups early (leadPressure). Grouped
    teams pushed separate lanes (83% calm while grouped), so 3:55 to 8:00 was a quiet walk.
- **Hero rows** (`HEARTHWOOD_PVP`, fitted on A+B, 600 matches each): Stilts +2%, Duchess +1%, Brutus −1%, Bravo −1%,
  Howler −1%.
- **Probe**: "stuck" now means every 1 s sample of the last 3 s within 1 m of the latest (the old rule, two samples 3 s
  apart under 0.3 m, also flagged a lane dance that came back to the same spot). The probe records core HP at 10:00 and
  13:00, the takedowns at 13:00, final takedowns and towers, and `--out` writes every row.
- **Map numbers not changed**: camp pay (`jungleXpBp` 7500, `jungleFishBp` 6200) already meets G9; tower stats, respawn
  and objective rewards were tried (below) and left as they were.

**Gates on the final build**

| Gate | D 65001 | E 66001 | Pass |
|---|---|---|---|
| G1 Crossing identity (`map-identity --check`, v21 baseline from `77f3b273`) | 1500 / 1500 identical | | yes |
| G2 Determinism (`--det 40`) | 120 / 120 | (A: 120 / 120) | yes |
| G4 Map fairness (`sim-v22.test.ts`, `hearthwood.test.ts`) | 27 / 27 tests | | yes |
| G5 Side, team 0 (48–52%) | 49.7% | 50.3% | yes |
| G5 Species, cats (47–53%) | 51.3% | 49.3% | yes |
| G6 Heroes (46–54%) | 18 / 20 (Lambo 54.6, Nugget 45.9) | 19 / 20 (Marshmallow 54.2) | pooled 1,200: all 20 in 46.1–52.2 |
| G7 Length | median 13:06, p95 13:13, 0% safety end | the same | yes |
| G8 Behind at 7:00 wins 20–40% | 18.9% of 122 | 23.2% of 125 | no (D), yes (E) |
| G8 Down 10+ takedowns wins < 5% | 10.3% of 136 | 14.5% of 138 | **no** |
| G9 Prowl at 5:00, XP / Fish (±10%) | 103% / 106% | 103% / 110% | yes (E at the edge) |
| G10 Calm (≤ 42%) | 54.1% | 54.1% | **no** |
| G10 Longest calm p50 / p90 (≤ 50 / 85 s) | 39 / 57 s | 39 / 59 s | yes |
| G10 Gank share (≥ 25%) | 33.5% | 35.5% | yes |
| G10 Pit deaths (≥ 12%) | 10.1% | 10.0% | **no** |
| G10 Base fights (≤ 22%) | 3.1% | 2.7% | yes |
| Bots: Prowl at Grizzlechop by 2:30 (≥ 80%) | 94.8% | 97.0% | yes |
| Bots: a gank before 4:00 (≥ 60%) | 99.8% | 98.8% | yes |
| Bots: no hero stuck over 3 s | 1 of 200 seeds | 0 of 200 | no (D) |
| G11 First match, G12 Phones | not run | | – |

**Timings (probe p50, D / E):** first blood 0:59 / 0:59 (target 1:45), Prowl at Grizzlechop 2:04 / 2:05, first gank
1:07 / 1:05, first Grizzlechop take 2:44 / 2:44, Kibble Cannon fired 3:07 / 3:08, first tower 3:57 / 4:04, first Great
Pudding calm 8:30 / 8:31, match 13:06 / 13:06. **Jungle and ganks:** 12.1 / 12.3 gank starts a match (6.8 before the
pass), a third of takedowns are ganks.

**Before and after (seeds 61001–61120, the same 120 seeds):** calm 57.8% → 53.4%, longest calm p50 / p90 60 / 103 s →
41 / 66 s, ganks a match 6.8 → 12.2, stuck seeds 30 → 0 (old rule), down 10+ wins 19.4% → 19.0%.

**What did not move G8 "down 10+ wins < 5%"** (200 seeds each, 61001–61200, ~135 matches with a 10+ gap; one match's
noise is about ±3 points): baseline 16.5%; catch-up XP off 7.7% (but behind-at-7:00 17.8%, cats 41.5%); catch-up
halved 8.5% (behind-at-7:00 17.5%); camp XP for the team behind 1.5× → 1.0× 10.8%; Grizzlechop's behind bonus 1.5× →
1.0× 14.3%; respawn × 1.3 → × 1.5 11.8%; respawn cap 25 s → 35 s no change (the cap never binds); all three bonuses off
18.4%; Sudden Death counting each tower a team trails by as 3 or 6 takedowns 14.3% / 11.3%. No lever reached 5% while
keeping behind-at-7:00 in 20–40%.

Why: nearly every match ends at Sudden Death (p10 13:00). At 10:00 both cores stand at 80%; from Sunset each takedown
burns the victim's core, so the team that wins the fights between 10:00 and 13:00 enters Sudden Death with the higher
core. In the matches the early leader lost, it still led on towers and often on takedowns, but its core was at 15–35%
against 60–75%. The 10+ lead is real (two in three matches have one) but it does not become the core lead. Fixing it is
a rule decision, not a number: for example Sunset core damage that counts the whole match's takedown and tower lead,
or towers that open the core to a lead before 13:00. Calm (54%) and pit deaths (10%) are structural too: the laners
stand off their lane opponent beyond 14 m most of the time (Lane mode is 70% calm), and the pit fights are short.

### 18.5 Release on main's v20 and v21 (2026-11-12)

Sim v22 was built on the v21 branch before sim v20 (the Wild Rift chase fix) shipped. Main took v20, then v21 (released
at `61cf4f5d`, with its own Hearthwood refit). The v22 work was replayed on that main as one change: the v22 hero
deltas were applied to main's v21 rows, `vendor-sim` freezes v20 (`4f9c97d4`) and v21 (`61cf4f5d`), and the backend
verifies 10 to 22. Every number below is on unseen seeds from 3000001 up.

- **Crossing identity** (`map-identity --check`, 1,500 seeds × 3 profiles from 3000001, baseline written from main's
  v21 at `61cf4f5d`): 4,500 / 4,500 identical. Skirmish plays byte for byte as the live v21.
- **Determinism** (`determinism.mjs --seeds 100 --from 3100001`, plus a Blitz match per seed and Hearthwood every 4th):
  all identical; `hearth-gates --det`: 120 / 120 solo, party and PvP 5v5 records over six windows.
- **Hero rows refit** on the first three windows (A–C, 1,800 matches): Stilts 54.7% → the v21 row −1% (the v22 +2% was
  fitted without v20), Marshmallow 46.3% → +2% on the v21 row. The other v22 deltas stay.

| Classic gate (`hearth-gates --seeds 300`) | A 3200001 | B 3300001 | C 3400001 | D 3600001 | E 3800001 | F 3900001 | Pooled 3,600 |
|---|---|---|---|---|---|---|---|
| G5 side, team 0 (48–52%) | 51.7% | **46.3%** | 48.8% | 50.5% | **54.0%** | 49.3% | 50.1% |
| G5 cats (47–53%) | 52.3% | 48.3% | **53.5%** | 50.5% | **46.0%** | 51.0% | 50.3% |
| G6 heroes (46–54%) | 16 / 20 | 16 / 20 | 13 / 20 | 16 / 20 | 12 / 20 | 19 / 20 | 20 / 20 (46.8–53.1) |
| G7 length p50 / p95, safety | 13:06 / 13:14, 0 | 13:06 / 13:13, 0 | 13:06 / 13:13, 0 | 13:06 / 13:13, 0 | 13:06 / 13:13, 0 | 13:06 / 13:12, 0 | yes |

A to C ran the pre-refit rows, D the first refit, E and F the final rows. E + F pooled: Stilts 50.6%, Marshmallow
49.1%; Cacklejaw 55.3% and Bravo 54.5% are over the band on E + F alone (52.1% and 50.9% over all six windows). The side and species figures swing by up
to ±4 points between 600-match windows with the same build (each seed draws its line-up, and both mirrored matches share
it), so the bands are met pooled, not in every window.

**Probe** (`map5v5-probe --seeds 200 --from 4400001`): first blood 0:59, Prowl at Grizzlechop 2:04 (99.5% by 2:30),
first gank 1:08 (99.5% before 4:00), Grizzlechop 2:41, cannon 3:09, first tower 4:11, Great Pudding 8:29, match
13:06. Calm 53.5%, longest calm p50 / p90 39 / 62 s, ganks 12.3 a match (32.5% of takedowns), pit deaths 10%, base
fights 3%, Prowl XP / Fish at 5:00 103% / 111%. G8: behind at 7:00 wins 22.7% of 119 (pass); down 10+ wins 11.4% of
132 (fail, as in §18.4); 2 of 200 seeds had a hero stuck over 3 s. Calm, pit deaths and down 10+ are the §18.4 rule
questions, unchanged by the rebase.
