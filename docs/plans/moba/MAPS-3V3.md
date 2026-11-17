# 3v3 map pool (sim v34): four new maps beside Purrhaven Crossing

Status: design (the builder's spec). Shipped as sim v34 with the deviations listed in V34-MAPS.md §1. Founder ask: "we need more 3v3 maps variations. implement: Halcyon Fold, twisted
Treeline ( reworked ), Gem Grab / Brawl Ball Maps. take in layouts, some best mechanics based form these
( positioning, elements ). ... so we'll have 5 3x3 maps ( our own, and additional 4 of these I've provided, rotated
randomly )."

Binding interpretation: four **original** 3v3 maps, each drawing on the genre ideas of one reference (layout shape,
positioning, kind of objective) and nothing else: no names, geometry, art, icons, music or trademarks of Vainglory,
League of Legends or Brawl Stars. Win condition stays ours (towers, then the core). With Purrhaven Crossing the pool is
five; every Skirmish and 3v3 PvP match draws one from its seed. Practice lets the player pick.

| # | Id (`MapId`) | Name | Draws on | Signature |
|---|---|---|---|---|
| 0 | `crossing` | Purrhaven Crossing (today) | – | two lanes, rat camps, Pudding in the river |
| 2 | `ridge` | Lanternfall Ridge | Halcyon Fold (one lane, big jungle, mine that turns into a siege monster) | Fish Mill, then Pudding wakes in the mill pit |
| 3 | `thicket` | Twinbark Thicket | Twisted Treeline (two lanes, jungle between, two altars, a den boss) | two Paw Shrines, Pudding's Den |
| 4 | `quarry` | Geode Quarry | Gem Grab (central mine, carry and hold, tall grass and cover) | Catnip Gems, Geode Surge |
| 5 | `pitch` | Pawball Park | Brawl Ball (ball to the enemy goal, goal-side walls, breakable cover) | the match yarn ball, goals, crates |

(`MapId` index 1 is `hearthwood`, the 5v5 map; it is not in the 3v3 pool.)

All coordinates are sim units: integer mm, origin bottom-left, x 0..100,000, y 0..60,000, team 0 (Purrhaven, cats)
on the west. Every new map is **mirrored left to right** (`MAP.point = 0`, team 1's object at (W − x, y)), the same
symmetry as Crossing, so lanes, bots' x-progress, practice dummies, the minimap frame and the camera yaw all work
unchanged. Only team 0's half is authored.

---

## 1. What the references do (research notes)

Kept at the level of genre mechanics; we copy none of their content.

- **Halcyon Fold (Vainglory, 3v3):** a single lane along one edge of the map, a large jungle on the other side with
  minion camps, a central **Gold Miner** that appears at 4:00 and fills slowly, paying the capturing team; a jungle shop
  and a **Crystal Miner** (boosts lane minions while held); at 15:00 the **Kraken** replaces the mine and, once
  released by the team that lands the last damage, walks down the lane attacking turrets. Positioning: the lane is
  fought with jungle ganks from behind; the mine is a jungle teamfight spot.
- **Twisted Treeline (League of Legends, 3v3, retired 2019):** two lanes (top and bottom) with a jungle between them;
  two **altars** left and right of centre that unlock at 2:30, are captured by standing on them, pay gold, lock for
  90 s and give a team buff (one altar: move speed; two: sustain on kills, by patch); **Vilemaw**, a boss in a pit at
  top centre, gives a team buff; a healing/speed relic in the middle. Positioning: altar control, the pit's mouths,
  vision in brush.
- **Gem Grab (Brawl Stars, 3v3):** a symmetric arena; a **gem mine** in the centre spawns a gem every few seconds;
  gems are carried and dropped on death; a team holding 10 starts a countdown and wins if it keeps them. Positioning:
  tall grass for ambushes, short walls for cover, three approaches to the mine; the carrier hangs back, the others
  screen.
- **Brawl Ball (Brawl Stars, 3v3):** a ball at centre carried or kicked into the enemy goal; goal-side walls with gaps;
  walls broken by supers; the ball resets to centre after a goal. Positioning: wings, passing angles, a keeper.

Sources: [LoL wiki: Altar](https://wiki.leagueoflegends.com/en-us/Altar?oldid=3347783),
[Dignitas: a guide to altars](https://dignitas.gg/articles/twisted-treeline-a-guide-to-altars),
[Dignitas: a guide to Vilemaw](https://dignitas.gg/articles/blogs/Unknown/10821/twisted-treeline-a-guide-to-vilemaw),
[Red Bull: it's time to learn Vainglory](https://www.redbull.com/us-en/it%E2%80%99s-time-to-learn-vainglory),
[Vainglory encyclopedia (fan wiki)](https://reddit.birdcat.cafe/r/vainglorygame/wiki/encyclopedia),
[Inven: Vainglory 2.0 meta](https://labs.invenglobal.com/articles/646/early-impression-of-vainglory-20-meta).
Brawl Stars mode rules from general knowledge (gem count and countdown length vary by season).

### Originality rules (apply to every map)

- Names are ours, in the cats-vs-dogs world (Purrhaven, Woof, Fish, Pudding, Yarn, Catnip).
- Geometry is ours: 100 × 60 m, left/right mirror, our lane shapes, our base plaza; no reference outline is traced.
- Objectives reuse **our** systems (Pudding, the Mega Yarn Ball, Fish, Frenzy Catnip, Boing Beds, camp kinds) and add
  three small new ones (Mill, Shrines, Gems) plus goals and crates; none of them wins the match by itself.
- Art: our toon kit (v6 Lightning Rivalry palette), procedural props; no reference icon, silhouette or sound.

---

## 2. Shared rules for all four maps

| Item | Value | Note |
|---|---|---|
| Size | 100,000 × 60,000, `navCell` 1000 (6,000 cells ≤ `MAX_CELLS`) | the minimap frame, LIMITS and caps stay Crossing's |
| Symmetry | `point: 0` (mirror x) | bots, practice, camera need no new symmetry code |
| Base plaza | `[1000, 20000, 15000, 40000]`, core (10000, 30000), fountain (3000, 30000) r 4000 | Crossing's; spawns `HERO_SPAWNS` unchanged |
| Gate barrier | `barrierX` 8000, drops at 0:03 | unchanged |
| Respawn, Sunset, late Sunset, Fortify | Crossing's (`TIMELINE`, `TIMELINE_BY`, `LATE_SUNSET`, `fortifyUntil` 7200) | per-map override allowed, tuned in §9 |
| Limits | `LIMITS_BY_MAP[id]` = Crossing's row (11:00, 30,660 B) | 3v3 input budget unchanged |
| Caps | heroes 6, projectiles 48, zones 24, pickups 4, cores 2, fountains 2; minions, towers, camp monsters per map | entity ids ≤ 64 on every new map, so no big hit masks |
| Playfield | `open: 3`, the new **mirror carve** (§8.3) | lanes ∪ base ∪ clearings ∪ corridors, minus walls and crates |
| Camera | fixed follow (FEEL-PASS B1), yaw `CROSSING_CAMERA_YAW` (−38°) | 30 m of ground across at 844 × 390 |
| Corridors | half width ≥ 2500 (5 m walkways) | a hero is 1 m wide; the touch stick look-ahead is 2 m |
| Lane keys | 2-lane maps reuse `sunny` (north) and `puddle` (south); Ridge's one lane is `sunny` | pings (Push Sunny/Puddle), bots and snacks work unchanged; the UI shows each map's own lane names from `mapInfo` |
| Mutators | Blitz, Cannon, weekly twists, One Lane, Duel, Boss stay Crossing-only (`maps` lists unchanged); `practice` gets all five | |

ASCII legend (1 character = 2 m, top row is y = 60 m, both halves drawn; the coordinate tables are authoritative):
`#` forest/blocked, `.` walkable, `=` lane, `F` fountain, `C` core, `T` tower (o outer, i inner, g gate), `r` camp,
`b` bush, `o` rock wall, `x` crate, `B` Boing Bed, `M` Fish Mill, `P` Pudding, `S` shrine, `G` geode, `@` ball home,
`[ ]` goal mouth.

---

## 3. Lanternfall Ridge (`ridge`), after Halcyon Fold

**Kept from the reference:** one lane along the north edge; the whole south is jungle with camps on each side; a
central mine that fills over time and pays the team that captures it; later the mine gives way to a big neutral that
walks down the lane for whoever wins it (our Pudding); a minion-boost reward for holding the mine; jungle-to-lane gank
paths behind the lane.

**Deliberately different:** our lane bends through the base mouth and over a ravine bridge; three towers per side on
the one lane (outer, inner, gate) instead of turrets plus a base turret; no shop (Toys auto-buy, so the mine pays Fish
and a short minion buff instead); the late monster is Pudding (calm race + escort), timed for a 7–9 minute match; a
Boing Bed throws junglers from the base mouth to the Glow Log.

```
y60 ##################################################
    ##################################################
    ####################=====To==========oT=========## (lane y≈50, outer x37, enemy outer x63)
    ###############==Ti===b===============b===iT==####
    ############=====####.##########..#######====#####
    ##########Tg###########.#######b..####gT##########
    #######..=######.......#.#####...#.....####=######
    ###.....######.....#####....###....#####..########
y30 #F.C......##B.....r?....#........#.......r.....C.F#  (r? = Glow Log beetle at x32)
    ###.....####..r..###.....o..MM..o.....r..##.....###
    #######.....#....####.....M..M.....####...........#
    ##########..b..#######......PP......######..#######
    ############.....######.........######.....########
    ##############..r..#####b.....b#####..r..##########  (toads x36 / x64)
y0  ##################################################
```

| Element | Team 0 data (mirrored for team 1) |
|---|---|
| Lane `sunny` "Ridge Road" waypoints | (10000,30000) → (13000,42000) → (20000,49000) → (34000,51000) → (50000,50000) |
| Towers (lane, tier, x, y) | sunny outer (37000, 50800); sunny inner (24000, 49600); sunny gate (13800, 42800) |
| Tower chain | outer → inner → gate (existing `TIER_PREV`); the core opens when the **gate** tower falls (§8.6 generalises `coreExposed` to "the last tier of a lane"; on Crossing that is still the inner) |
| Caps | minions 24 (one lane), towers 6, camp monsters 8, pudding 1 → 49 entity ids |
| Clearings `[x, y, r]` | Lantern Rats (22000,16000,4500); Glow Log (32000,28000,4500); Moth Pond (36000,11000,4000); Mill Pit (50000,22000,8000) |
| Corridors `[ax, ay, bx, by, hw]` | base mouth (14000,24000,22000,16000,3000); (24000,16000,36000,11000,2500); (24000,16000,32000,28000,2500); gank west (32000,28000,28000,44000,2500); gank east (32000,28000,44000,40000,2500) + (44000,40000,46000,45500,2500); pit links (36000,11000,44000,18000,2500), (32000,28000,43000,25000,2500) |
| Walls | Mill Pit pillars [45500, 24500, 47500, 26500] (mirror at 52.5–54.5 m) |
| Bushes `{x, y, w, h}` | gank-west exit (29000,46000,3000,4000); gank-east exit (44000,42500,3000,4000); pit approach (40000,15000,3000,3000); Glow Log path (28000,22000,3000,3000) |
| Camps (kind, x, y) | rat (22000,16000); beetle (32000,28000); toad (36000,11000) |
| Boing Bed `[bedX, bedY, landX, landY]` | base mouth to the Glow Log: [17000, 21000, 29500, 25500] |
| Frenzy pairs | [50000,53000, 50000,28500], [50000,50500, 50000,15500] |
| Kibble Cannon / yarn | none (`spots: []`, `homes: []`) |
| Pudding | `PUDDING_SPOT` (50000, 22000); Crossing's `PUDDING` stats; timeline `pudding` 8100 (4:30), respawn 3600 |
| Practice spots | standing (46000,50300); walking (44000,19000) ↔ (56000,19000); tower dummy (60000,50600) |

### 3.1 Fish Mill (new objective `mill`)

At (50000, 22000), capture disc r 3500, on the map axis (fair to both teams).

1. Opens at 1:00 (tick 1800). While open its **pot** grows 4 Fish a second (on `TIMELINE.second` ticks), capped at 360.
2. **Capture:** at least one living hero of one team inside the disc and no living enemy hero inside. Progress counts
   up 1 a tick for that team; it resets to 0 when the disc is contested or empty, or when the other team starts. At
   120 ticks (4 s) the team captures.
3. **Reward:** the pot is split evenly among the capturing team's living heroes (remainder to the lowest slot), each
   also gets 60 XP; the team gets **Lantern Wave** for 45 s (1350 ticks): its minions deal +25% damage to towers and
   cores (`lanternStructBp` 12500). Events `millCapture` (team, fish each).
4. The mill then closes for 45 s (1350), the pot back at 0, and reopens.
5. At 4:30 (tick 8100) the mill shuts for good (a capture in progress is lost) and Pudding spawns in the pit: the
   existing calm race; the calming team's escort joins its next Ridge Road wave (existing Pudding code, one lane).

Bots: slot 0 and slot 1 both play Ridge Road (the duo lane: slot 1 holds back to the inner tower when the lane is
pushed past the bridge); slot 2 is the roamer: own camps in order rat → beetle → toad, then the mill when it is open
and the pot ≥ 120 (or an ally is capturing), else a gank on the lane through the nearer gank path. Laners join the
mill when the roamer is contesting and the lane wave is not under their own outer tower. From 4:30 the existing
Pudding contest logic runs with `PUDDING_SPOT` = the pit.

Expected length: 7:30–8:30 median (one lane carries every push, three towers a side slow it; tune the gate tower's HP
before anything else, §9).

---

## 4. Twinbark Thicket (`thicket`), after Twisted Treeline (reworked)

**Kept:** two lanes with a jungle between; two capture points that unlock, pay, lock for a while and buff the owner;
the stronger buff for holding both; a boss pit at top centre reached through mouths from each team's jungle; a speed
spot in the middle; brush around the capture points.

**Deliberately different (the rework):** each team has a **home shrine** on its own half (stealing the other is a deep
invade, not a mid flip); the buffs are ours (one shrine: +10% move speed; both: +15% structure damage, so shrine
control turns into tower pressure); the den holds Pudding (calm race, escort), not a damage boss; no altar gold; the
jungle is a figure-eight of narrow paths, not an open field; lanes run tighter to the edges than Crossing's.

```
y60 ##################################################
    ##########=====To============oT=====#############
    #######==Ti==b====####################b===iT==####
    ####===######.###########.###.#######.#####====###
    ###==######.r.#####.......PPP.....####.r.###==####   (beetles x24/x76; Pudding's Den x50 y42)
    ##=#######...######....##.PPP.##...####...####=###
    #=######.......#..b.######...######.b..#.....###=#
y30 #F.C.........oS.........b.......b..........So....C.F#  (shrines x34 / x66, crossroads x50)
    #=######.......#..b.######...######.b..#.....###=#
    ##=#######...######....####.....####....####...=##
    ###==######.r.#####....##########....####.r.##==##   (toads x24/x76)
    ####===######.###########.....########.####====###
    #######==Ti==b====####################b===iT==####
    ##########=====To============oT=====#############
y0  ##################################################
```

| Element | Team 0 data |
|---|---|
| Lane `sunny` "Bramble Lane" | (10000,30000) → (14000,44000) → (22000,53000) → (50000,54000) |
| Lane `puddle` "Brook Lane" | (10000,30000) → (14000,16000) → (22000,7000) → (50000,6000) |
| Towers | sunny outer (36000,53500); sunny inner (21000,51900); puddle outer (36000,6500); puddle inner (21000,8100) |
| Caps | minions 40, towers 8, camp monsters 4, pudding 1 → 63 ids |
| Clearings | Moonstone Shrine (34000,30000,5000); Beetle Hollow (24000,41000,4000); Toad Hollow (24000,19000,4000); Crossroads (50000,30000,5000); Pudding's Den (50000,42000,4500) |
| Corridors | base mouth (14000,30000,26000,30000,3000); shrine–crossroads (34000,30000,50000,30000,3000); (24000,30000,24000,41000,2500); (24000,41000,18000,47000,2500); (24000,30000,24000,19000,2500); (24000,19000,18000,13000,2500); shrine–north lane (34000,30000,38000,47000,2500); shrine–south lane (34000,30000,38000,13000,2500); den mouth (42000,35000,47000,40000,2500) |
| Walls | shrine pillar [31000, 28500, 32000, 31500] |
| Bushes | (35500,37000,3000,3000); (35500,23000,3000,3000); mid brush (42000,30000,3000,3000); lane brush (42000,52000,3000,3000), (42000,8000,3000,3000) |
| Camps | beetle (24000,41000); toad (24000,19000) |
| Pudding | `PUDDING_SPOT` (50000, 42000), the den; Crossing's stats and 2:30 timeline; the calming team's escort joins its next Bramble Lane (lane 0) wave |
| Frenzy pairs | [50000,54000, 50000,6000], [50000,32000, 50000,28000] |
| Beds, cannon, yarn | none |
| Practice spots | standing (46000,53800); walking (45000,6200) ↔ (56000,6200); tower dummy (61000,53700) |

Den check: the den's top (46.5 m) is 2 m of forest below Bramble Lane's band (48.5 m at x = 50), so the only ways in
are the two mouths, one from each team's crossroads side.

### 4.1 Paw Shrines (new objective `shrines`)

Shrine 0 at (34000, 30000) (team 0's home), shrine 1 at (66000, 30000). Capture disc r 2500.

1. Neutral until 1:30 (tick 2700); before that they cannot be captured.
2. **Capture:** heroes of one team inside, none of the other; progress +1 a tick, −2 a tick when nobody is inside
   (floor 0), reset when contested or when the other team starts; 90 ticks (3 s) captures. A shrine owned by a team
   can be captured by the other in the same way; a shrine the capturer already owns cannot.
3. On capture: owner set, **locked 60 s** (1800 ticks; no progress at all), each capturing hero inside gets 40 Fish
   and 40 XP. Event `shrineCapture` (shrine, team).
4. **Buffs** (read every tick, both teams):
   - owns ≥ 1 shrine: **Swift Paws**, its heroes +10% move speed (`speedBp` 1000, added to the move-speed bp sum, so
     slows still apply);
   - owns both: **Twin Blessing**, its heroes and minions deal +15% damage to towers and cores (`structBp` 11500).
5. A shrine keeps its owner until captured (no decay).

Bots: lane roles as Crossing (slot 0 Bramble, slot 1 Brook, slot 2 roamer). The roamer clears its camps, then takes
its home shrine at 1:30 and whenever it is unlocked and not owned; it invades the enemy shrine when it is unlocked, at
least two allies are within 15 m of it or the enemy team shows ≤ 1 hero alive. A laner whose own shrine is being
captured by an enemy and who is within 18 m with HP ≥ 50% rotates to it (holdObjective with the shrine as the spot).
Pudding: the existing contest logic with the den spot; bots path through the mouths (A* handles it).

Expected length: 7:30–8:30 (Crossing-like lanes; Twin Blessing shortens games that one side controls).

---

## 5. Geode Quarry (`quarry`), after Gem Grab

**Kept:** a central mine that pops gems on a timer; gems carried by heroes and dropped on death; a team threshold that
starts a countdown and pays off if held; tall grass flanking the middle, short walls for cover, three approaches (two
lanes and a middle road).

**Deliberately different:** the payoff is a **siege surge**, not a win; the threshold is the team's sum carried by
living heroes; the middle road has no minions; left/right layout with our lanes on the edges; no jungle camps at all
(XP comes from lanes and gems), a Boing Bed throws a hero from the Gem Road into the arena.

```
y60 ##################################################
    #########======To=============oT=======##########
    #######==Ti===b==###################b====iT==#####
    #####=====#####.##################.####=====######
    ####=####...#####..bbbbb....bbbbb...#####...###=##
    ###=#####..........ooo.......ooo..........#####=##
    ##=######.........................o.......######=#
y30 #F.C......B....b....o...o..G..o...o....b.....B..C.F#  (geode x50; Gem Road y30)
    ##=######.........................o.......######=#
    ###=#####..........ooo.......ooo..........#####=##
    ####=####...#####..bbbbb....bbbbb...#####...###=##
    #####=====#####.##################.####=====######
    #######==Ti===b==###################b====iT==#####
    #########======To=============oT=======##########
y0  ##################################################
```

| Element | Team 0 data |
|---|---|
| Lane `sunny` "Cliff Path" | (10000,30000) → (15000,45000) → (25000,51000) → (50000,51000) |
| Lane `puddle` "Gravel Path" | (10000,30000) → (15000,15000) → (25000,9000) → (50000,9000) |
| Towers | sunny outer (37000,51000); sunny inner (22000,49200); puddle outer (37000,9000); puddle inner (22000,10800) |
| Caps | minions 40, towers 8, camp monsters 0, pudding 1 (never spawns) → 59 ids |
| Clearings | the Arena (50000,30000,13000) |
| Corridors | Gem Road (14000,30000,36000,30000,3500); arena–north lane (41000,37000,36000,46500,2500); arena–south lane (41000,23000,36000,13500,2500) |
| Walls | entrance pillar [39000,29000,40500,31000]; cover [43000,35500,46500,37000], [43000,23000,46500,24500]; geode guard [45500,28000,46500,32000] (with its mirror the geode is open north and south only) |
| Bushes (tall grass) | (43000,39000,5000,2500); (43000,21000,5000,2500); Gem Road (33000,30000,3000,5000); lanes (40000,48000,3000,3000), (40000,12000,3000,3000) |
| Camps | none (`CAMPS: []`) |
| Boing Bed | [24000, 30000, 38000, 34000] (Gem Road into the arena) |
| Frenzy pairs | [50000,51000, 50000,9000] |
| Pudding | timeline `pudding` 19801 (after the safety end: never) |
| Practice spots | standing (46000,51000); walking (45000,9000) ↔ (56000,9000); tower dummy (60000,51000) |

### 5.1 Catnip Gems and the Geode Surge (new objective `gems`)

The Geode stands at (50000, 30000) (render: a crystal cluster, not blocking).

1. From 0:45 (tick 1350) a gem pops every 6 s (180 ticks) while **gems in play** (on the ground + carried) < 20. Spot
   = geode + offset `GEM_RING[spawnCount % 8]`, the ring at 2 m in mirror pairs: (2000,0), (−2000,0), (0,2000),
   (0,−2000), (1414,1414), (−1414,1414), (1414,−1414), (−1414,−1414). No RNG.
2. **Pickup:** a living hero whose centre is within 1500 of a ground gem takes it (every gem in reach the same tick;
   heroes in `heroAt` order so neither team always wins ties). +10 XP per gem. Event `gemPick`.
3. **Drop:** a dying hero drops all it carries at its death spot, on the same 8-spot ring scaled to 1.5 m (the 9th
   onward stack on the ring again). Nap/recall keeps gems. Event `gemDrop`.
4. **Countdown:** when a team's carried total ≥ 8, its countdown starts: 12 s (360 ticks), event `gemCountdown`. It
   cancels the moment the total drops below 8. Both teams can count at once (8 + 8 ≤ 20).
5. **Geode Surge:** when the countdown ends, the team's carried gems are spent (they leave play; the geode resumes) and
   the team has Surge for 45 s (1350): its minions take 70% damage and deal 130% to towers and cores (the Sugar Rush
   numbers, `takenBp` 7000, `structBp` 13000, without Sugar Rush's range condition), its heroes deal +15% to towers and
   cores. No countdown for a team during its own Surge. Events `gemSurge`.
6. The HUD shows both teams' carried totals and any countdown; a carrier shows a gem count over its head (render only).

Bots: slot 0 Cliff Path, slot 1 Gravel Path, slot 2 plays the Gem Road as its "lane" (stand at the arena entrance,
collect gems within 12 m when no enemy hero is within 8 m of the gem). Any bot not in a fight takes a ground gem within
10 m. A carrier with ≥ 3 gems adds 15 points to its retreat threshold and needs 1.3× the usual power to start a fight.
Own countdown running: carriers walk to (24000, 30000) (behind the Gem Road, between the inner towers) and hold;
non-carriers screen at the arena entrance. Enemy countdown running: every bot hunts the visible enemy carrier with the
most gems (foe key halved, like a Focus order) and the roamer stops collecting.

Expected length: 7:00–8:30 (Surges speed up pushes).

---

## 6. Pawball Park (`pitch`), after Brawl Ball

**Kept:** a ball at centre kicked toward the opponent's goal; a goal in front of each base flanked by posts; breakable
cover in front of the goal; an open midfield with grass pockets on the wings; the ball returns to centre after a goal.

**Deliberately different:** no carrying, only our existing walk-to-kick roll (the Mega Yarn Ball); a goal is a
**siege hit** on the conceding team's structures, not a match point; the crates are broken by the ball itself and
regrow after every goal; all crates crumble at Sunset; two minion lanes run along the touchlines, so the pitch sits
inside a normal MOBA.

```
y60 ##################################################
    ###########======To========oT========############
    #######==Ti===b===###################b==iT==######
    #####=====######..###########..#####..#######=####
    ####=#####......x....b........b....x......###==###
    ###=####...........o................o.......###=##
    ##=###.....ooo.x..........................x.ooo..#
y30 #F.C.o[ ]...x.......o...........@...........x...[ ]o.C.F#  (ball home x50; goals x16-19 / x81-84)
    ##=###.....ooo.x..........................x.ooo..#
    ###=####...........o................o.......###=##
    ####=#####......x....b........b....x......###==###
    #####=====######..###########..#####..#######=####
    #######==Ti===b===###################b==iT==######
    ###########======To========oT========############
y0  ##################################################
```

| Element | Team 0 data |
|---|---|
| Lane `sunny` "North Touchline" | (10000,30000) → (13000,44000) → (22000,52000) → (50000,53000) |
| Lane `puddle` "South Touchline" | (10000,30000) → (13000,16000) → (22000,8000) → (50000,7000) |
| Towers | sunny outer (35000,52500); sunny inner (19000,49300); puddle outer (35000,7500); puddle inner (19000,10700) |
| Caps | minions 40, towers 8, camp monsters 0, pudding 1 (never spawns) → 59 ids |
| Pitch | corridor (24000,30000,50000,30000,11000) (with its mirror: x 13–87 m, y 19–41 m) |
| Pitch–lane links | (30000,40000,27000,47500,2500); (44000,40000,44000,48000,2500); (30000,20000,27000,12500,2500); (44000,20000,44000,12000,2500) |
| Goal mouth (team 0's, where team 1 scores) | rect [16000, 26500, 19000, 33500] |
| Goal walls | back [15000, 26000, 16000, 34000]; posts [16000, 25000, 19500, 26500], [16000, 33500, 19500, 35000] (heroes reach the base round the posts, 2.5 m wing gaps) |
| Crates (breakable, 2 hits) | [21500,23500,23000,26500], [21500,33500,23000,36500], centre [25000,28500,26500,31500], wings [29000,20000,30500,23000], [29000,37000,30500,40000] |
| Midfield walls | [36000,23000,38000,25000], [36000,35000,38000,37000] |
| Bushes | wings (32000,39000,4000,2500), (32000,21000,4000,2500); lanes (40000,50000,3000,3000), (40000,10000,3000,3000) |
| Ball | `FUN.yarn` homes [(50000,30000)], first 900 (0:30), overrides below |
| Frenzy pairs | [50000,53000, 50000,7000] |
| Pudding | never (19801) |
| Practice spots | standing (46000,52900); walking (45000,7100) ↔ (56000,7100); tower dummy (62000,52700) |

### 6.1 The match ball, goals and crates (new objective `goal`)

Ball: the existing Mega Yarn Ball (units/yarn.ts, combat/funshot.ts) with per-map overrides in `YarnData` (absent on
Crossing and Hearthwood, so their numbers stay v33's): `kicks: 0` (never unravels), `rest: 30`, `heroDamage: 60`,
`heroBp: 200`, `knock: 1500`, `structureBp: 0`. Kicking is unchanged (walk into it within 45°).

1. **Goal:** a rolling ball whose centre enters a goal mouth rect scores for the other team (an own goal counts for
   the opponent). The roll ends there. Event `goal` (team, scorer = the last kicker, `YF.P`'s owner).
2. **Goal Siege:** the conceding team's standing, non-invulnerable tower with the lowest HP share (ties: lower slot),
   or its core if exposed and no tower qualifies, takes 12% of its max HP as pure damage (`goalSiegeBp` 1200; Fortify
   does not reduce it, like the Kibble Cannon). The scoring team's living heroes get 40 Fish and 50 XP each.
3. **Reset:** the ball is Away for 5 s (150 ticks), then rests at centre. Every crate on both sides regrows at the
   reset (a hero standing in a crate's rect is pushed out by the existing `escapeCell`).
4. **Crates:** each crate blocks walking and the ball (its cells are grid `cover`). A rolling ball stopped by a crate
   cell rests in front of it and the crate loses one hit; at 0 it breaks (cover removed, event `crateBreak`). At Sunset
   (the match's `sunset` tick) every crate breaks and crates no longer regrow (an overtime that opens the goals).
5. Goals are counted per team and shown on the HUD scoreboard (`3 – 1`); they never end the match.

Bots: the roamer (slot 2) and whichever bot is its team's nearest to a resting ball within 15 m play the ball.
**Attack:** walk to the approach point 1.5 m behind the ball on the line from the enemy goal mouth's centre through
the ball, then walk through the ball toward the goal (that walk is the kick). If a crate cell lies on the ball → goal
line, aim at the crate (a crate breaks in two touches) or at a wing angle that clears the posts (try ±25°, take the
first clear `lineClear`). **Defend:** a resting ball within 14 m of the own goal is cleared toward the nearest
touchline. Kicks never take a bot into an enemy tower's reach (existing tower-danger check). Laners keep laning unless
the ball rests in their half within 10 m.

Expected length: 7:00–8:00 (a goal is about a third of an outer tower).

---

## 7. Random rotation and map choice

- `sim/api.ts`: `MAP_POOL_3V3: readonly MapId[] = ['crossing', 'ridge', 'thicket', 'quarry', 'pitch']` and
  `pickMap3v3(seed: number): MapId = MAP_POOL_3V3[new Rng(seed).fork('map').int(5)]`. Pure, not hashed, the same in
  client, relay and backend.
- **Skirmish (solo vs bots):** the client sets `config.map = pickMap3v3(seed)`. A player's first 3 matches stay on
  Crossing (onboarding, the Rookie script runs on Crossing only). To avoid the same map twice in a row the client may
  re-draw the seed (seed + 1, + 2, … at most 8 tries) until the pick differs from the last map played (per-viewer
  `localStorage`, try/catch; empty storage = no avoidance). The record carries the seed and the map, so the backend
  replays exactly what was played.
- **3v3 PvP (casual, ranked) and party 3v3 vs bots:** the party relay picks after its final seed (after the clean-picks
  re-roll loop, party-relay.ts ~2336): `config.map = pickMap3v3(seed)` (omitted when `crossing`, keeping v33's shape).
  Every client gets it in the match start message. 5v5 Classic stays `hearthwood`.
- **Practice:** the Practice card gets a map row: Random (default) · Crossing · Ridge · Thicket · Quarry · Park. The
  `practice` mutator's `maps` list gets all five; dummy spots come from the map's `practice` row.
- **Custom party lobby (friends):** the host may pick Random or a map (same chips). Optional; ship if cheap.
- **Blitz and weekly twists:** Crossing only (unchanged).
- **Loading screen:** map name + one line (client data `MAP_CARDS`, not sim):
  - Purrhaven Crossing: "Two lanes, a rat camp each side, Pudding in the river."
  - Lanternfall Ridge: "One lane on the ridge. Take the Fish Mill in the woods; at 4:30 Pudding wakes there."
  - Twinbark Thicket: "Two Paw Shrines. Hold one to run faster, both to hit towers harder."
  - Geode Quarry: "Grab Catnip Gems from the Geode. Hold 8 for 12 s for a Geode Surge."
  - Pawball Park: "Kick the yarn ball into their goal. Every goal smashes a tower."
- **Match history and results:** the map name chip (backend stores the real map id, §8.10).

---

## 8. Data model: how a map becomes a sim input (minimal change)

The sim already takes the map as an input (`MatchConfig.map`, `ReplayRecord.map`, `MAP_IDS`, `bindMap`). The work is
to add rows, not a new mechanism.

### 8.1 Ids and records

- `MapId` += `'ridge' | 'thicket' | 'quarry' | 'pitch'`; `MAP_IDS` appends them (indices 2..5; append only).
- `MAP_SINCE: Record<MapId, number>` = crossing 10, hearthwood 18 (today's rule), the new four 34. `mapProblem(map,
  simVersion)` in sim/server.ts and sim/party.ts shape checks refuses an unknown map or one older than its version.
- `teamSizeOf`/`slotCountOf` already return 3 for anything but `hearthwood`. Fix the one numeric check:
  `sim/server.ts:117` (`per = m.world.map === 0 ? 3 : 5`) → `teamSizeOf(MAP_IDS[m.world.map])`.

### 8.2 One file per map, one table per map

- `src/data/maps/{ridge,thicket,quarry,pitch}.ts` each export a `MapDef` plus its rows: timeline, timelineBy (=
  Crossing's), pudding stats, frenzy spots, practice spots, fun row (cannon/beds/yarn), objective spec, crates, goals,
  lane display names. Each file reuses Crossing's constants by spread (`...CROSSING`).
- `MapDef` gains optional fields, absent on Crossing and Hearthwood: `objective?: 'mill' | 'shrines' | 'gems' |
  'goal'`; `jungle?: 1` (bots read `CAMPS` as a list, as on Hearthwood, without `mg`); `crates?`, `goals?`, `obj?`
  (spots and numbers); `laneNames`.
- `sim/map/runtime.ts`: replace the `hearth ? HEARTHWOOD_X : CROSSING_X` ternaries by a per-index table
  `MAP_TABLES[index] = { timeline, timelineBy, pudding, frenzy }`; rows 0 and 1 are the very same objects as today.
  `MAP_DEFS` and `STRIP_DEFS` append (strip: `null` for the new maps).
- Indexed arrays append a row per new map: `FUN_BY_MAP`, `TOWERS.fortifyUntil` (7200 each), `LIMITS_BY_MAP`
  (Crossing's numbers), `PRACTICE_BY_MAP` (new; row 0 = today's `PRACTICE`).
- `TowerTier` and the tier chain are unchanged (Ridge uses the existing `gate` tier on a lane).

### 8.3 Playfield: `open: 3`, the mirror carve

`sim/map/grid.ts onPlayfield`: `if (PLAYFIELD.open === 3) return onMirrorCarved(x, y)`. Walkable = within the rim and
(near a lane line by `laneHalf` 5500, or inside the base rect, or, after folding x > W/2 to W − x, inside a clearing
disc or within a corridor capsule). Then `WALLS` (mirrored as today) block. Integer maths, the same helpers as
`onCarved`. Crossing (`open: 0`) and Hearthwood (`open: 2`) never reach the new branch.

Crates: `coverRect(g, rect, ±1)` beside `coverDisc` on the grid's `cover` layer (the same layer structures use), driven
only from hashed crate state, so every client and the referee rebuild the same grid.

### 8.4 World state and the hash

- `mg` (Hearthwood's map globals) is sized only on Hearthwood: `createWorld` uses `MAP_IDS[map] === 'hearthwood'`
  instead of `map !== 0`. Every `w.mg.length > 0` check keeps meaning "Hearthwood".
- New `w.ob: Int32Array`, the objective table, length `OB_COUNT[objective]` (0 on Crossing and Hearthwood). Hashed
  **last** in `hashedArrays` (after `bedT`): a zero-length array hashes no bytes, so Crossing and Hearthwood worlds hash
  exactly as in v33. `ob[0]` = the map index (puts the map into the hash, like `MG.MapId`).
- Layouts (`OB` constants per objective in world.ts):
  - mill (8): MapId, State (0 shut, 1 open, 2 closed-for-good), OpenAt, Pot, Prog, ProgTeam, Lantern0Until, Lantern1Until.
  - shrines (9): MapId, then per shrine (2 × 4): Owner (−1 neutral), Prog, ProgTeam, LockUntil.
  - gems (74): MapId, NextAt, Spawned, InPlay, Count0At, Count1At (−1 off), Surge0Until, Surge1Until (8), Carried
    per hero (6), then 20 ground rows of alive/x/y (60).
  - goal (14): MapId, Goals0, Goals1, ResetAt (−1 none), crate hits left × 10 (5 a side; team 1's are the mirrors).

### 8.5 Systems and hooks

- `src/sim/units/objective.ts`: `initObjective(w)` and `stepObjective(m)` dispatch on `ACTIVE_MAP.objective`; called
  in step 4 right after `stepYarn`. Undefined objective = return at once.
- Hooks, each returning the neutral value when there is no objective (no v33 change):
  - `objSpeedBp(w, team)` in the hero move-speed sum (Swift Paws);
  - `objStructBp(w, team, srcKind)` in the tower/core damage path (Lantern Wave, Twin Blessing, Surge);
  - `objMinionTakenBp(w, team)` in minion damage taken (Surge);
  - funshot yarn end: goal-mouth test during flight and crate cracking at the stop (only when `ACTIVE_MAP.goals`).
- `YarnData` optional overrides (`kicks`, `rest`, `heroDamage`, `heroBp`, `knock`, `structureBp`); `yarn.ts` reads
  `data.kicks ?? YARN.kicks` etc. `kicks: 0` = never unravels.
- Cannon init: a map whose cannon `spots` is empty sets `G.CannonAt` to −1 (as the strip does).
- Pudding: maps without Pudding set the timeline's `pudding` past the safety end (no code).
- Camps: `initCamps`/`rebindCamps` already read `CAMPS`; an empty list means no camps (check `campCount` and the
  rat-only paths treat `CAMPS.length === 0`).
- Snacks: `LANES.length === 1` already resolves to lane 0.
- Events (append to the union): `millCapture`, `shrineCapture`, `gemPick`, `gemDrop`, `gemCountdown`, `gemSurge`,
  `goal`, `crateBreak`. Snapshot: optional `obj` (absent on Crossing/Hearthwood) for the HUD and render.

### 8.6 Bots (sim/bots)

- Replace Crossing assumptions that would break on one lane or new spots:
  - `humanLane`: `LANES.length === 1 ? 0 : …`;
  - `pushLane`: one lane → 0;
  - `laneFor`/`laneRole`: on Ridge roles 0 and 1 map to lane 0;
  - `humanEngaged`: use the map's objective spots and `CAMPS` (not `RAT_CAMP` + mirror) when `ACTIVE_MAP.objective`;
  - `campRat`: when `ACTIVE_MAP.jungle`, iterate `CAMPS` of the bot's side (the Hearthwood branch without `mg`);
  - the Rookie script (`scriptFrom`) only on Crossing (`ACTIVE_MAP.id === 'crossing'`).
- New `sim/bots/objective.ts`: `objectiveAct(m, id, p, mem)` with the per-map rules in §3–§6, called where Pudding is
  contested today (below retreat, fights and orders; above camps and the lane). Bot state that must persist goes in
  existing hashed bot fields (`botOp`, `botX/Y`, `botId`).
- `kitOf`-based casting, retreat, tower danger and fights are unchanged.
- `core exposed` (units/kinds.ts `coreExposed`): non-Hearthwood maps check "a lane's last tier is down" (Crossing: the
  inner; Ridge: the gate).

### 8.7 mapInfo and render

- `sim/map/info.ts mapInfo(id)`: name from `MapDef.name`, yaw `CROSSING_CAMERA_YAW` for the four, `laneNames`,
  objective spots, crates, goal rects; the minimap draws the grid as today.
- Render (lazy, one shared chunk): `render/views/kitMapView.ts` paints the ground texture from the nav grid
  (`onPlayfield`, like mapView), places instanced trees on forest edge cells, rocks on `WALLS`, bushes, and objective
  props from primitives: Mill (stone ring + turning wooden wheel), Shrines (paw-print stone disc + pillar with an owner-
  colour flame), Geode (crystal cluster; gems as small instanced octahedrons), Goal (two posts, net lines, chalk lines
  painted in the texture), crates (instanced boxes with two crack stages). Themes, ~1–2 KB each: Ridge dusk blue with
  paper lanterns (Hearthwood's lantern post model), Thicket deep moss green, Quarry warm sandstone, Park mown-stripe
  grass. `gameView.ts:286` loads it with `import()` for the four ids; `funView` uses `mapIndex(map)` instead of
  `'hearthwood' ? 1 : 0`.
- HUD: Mill pot + capture ring; shrine owner icons + lock timers; gem totals + countdown; goal score.
- Props near walkable cells ≤ 2.5 m tall (Occluders), so the fixed camera never hides a hero at 844 × 390.

### 8.8 Client app

- `app/mapBinding.ts useMap`, `app.ts:1859`, `app.ts:1947`, `app.ts:2109`, `app.ts:2157`: stop coercing every non-
  Hearthwood map to `crossing`; Skirmish/Practice set the map per §7.
- Party/PvP: take `config.map` from the start message (already passed through).

### 8.9 Backend

- Vendor sim v34 (`tools/vendor-sim.mjs`), replay support 10–34; the shape check refuses new maps below 34.
- Party relay: `pickMap3v3(seed)` after the final seed for 3v3 rooms (§7).
- `ranked/settlement.ts:51` `if (mmRoom.map)` voids every rotated ranked match: change to `mmRoom.map === 'hearthwood'`.
- `history/history.model.ts:178` keeps the real map id (today it collapses to `crossing`); `:53` stays (classic only
  for hearthwood).
- All other `=== 'hearthwood' ? 5 : 3` checks already treat the new maps as 3v3 (matchmaker, kudos, boards, reports,
  referee pool).

### 8.10 What stays frozen for v33

- `SIM_VERSION` 34. v33 frozen in `tools/vendor-sim.mjs` FROZEN at its last sim commit on main (origin/main's last
  commit touching `pawlegends/src/sim` or `src/data` at design time was 31c3c5c8a; confirm it is the v33 release commit)
  with its fixtures; `tests/unit/sim-v33.test.ts` runs the v33 checks against the frozen bundle; `sim-stamp.json`
  regenerated; `lint-sim` allowances for the new version constants.
- **Gate G1 (identity):** every v33 fixture (Crossing solo, Hearthwood solo, party, PvP, Blitz, Practice, One Lane,
  Duel, Boss) re-simulated on the v34 code gives the same trail and final hash. The design keeps every Crossing and
  Hearthwood code path byte-identical; this gate proves it. The party golden then only changes its version label.
- Release order (FORCE-UPDATE.md, LIVE-MATCH-DEPLOYS.md): backend first (accepts 33 and 34; a backend push restarts
  live matches, so push it once), then the game build and the OTA, which raises `minSim` to 34; the relay refuses a
  room with mixed sim builds.
- Write `docs/plans/moba/V34-MAPS.md` (changes, measured gates, freeze) like V33-KILLS.md.

---

## 9. Gates (measured before release)

| Gate | Tool | Pass |
|---|---|---|
| G1 identity | v33 fixtures on v34 | 100% identical |
| G2 determinism | `tools/determinism.mjs --map <id>`: 50 solo, 20 party, 20 PvP re-sims per new map | 100% |
| G3 balance | `npm run match -- --gate balance --map <id>` (add `--map`), 2,000 seeds each | side 45–55%, cats 47–53%, median 7:00–9:00, p95 ≤ 10:30, safety ends ≤ 0.5%, trailing at 3:30 wins 20–40%, every hero 44–56% per map and 46–54% pooled over the five |
| G4 objectives | probe per map, 500 seeds | Ridge: a mill capture in ≥ 90%; Thicket: each team owns a shrine at some point in ≥ 80%; Quarry: ≥ 1 Surge in ≥ 70%, median ≤ 4; Park: goals median 1–3, ≥ 1 in ≥ 75% |
| G5 bot nav | 200 matches per map | no bot with a move goal stands still > 5 s; no unit centre on a blocked cell; the ball never ends inside a wall |
| G6 touch and camera | Playwright `--workers=1`, 844 × 390, one `userDataDir` deleted in `finally` | per map: spawn, a lane, the objective, a narrow corridor walked with the stick; screenshots on the hub |
| G7 budget | `npm run budget` | total ≤ 10 MB, first-load JS ≤ 450 KB gzip |

Tuning order if G3 fails: Ridge gate tower HP (3200 → 2600) or its outer spot forward; Thicket Twin Blessing
(115% → 110%); Quarry threshold (8 → 9) or Surge length; Park `goalSiegeBp` (12% → 9%). Change one knob per run.

## 10. Size budget

- Sim (data + objective + bot code): estimate ~25 KB raw, ~7 KB gzip, but the sim is bundled into several chunks (the
  local and net host workers, `sim`, `matchSession`, …), so ~120 KB on disk.
- Render `kitMapView` + themes: ~40 KB raw, one lazy chunk. Client cards: < 1 KB in the entry (first-load JS stays
  ~434 KB).
- Headroom today ~40 KB of 10 MB, so trim ~150 KB first: re-encode `assets/screens/*-1920.webp` (matchup, win-cat,
  win-dog, lose-dog, lose-cat, pick-stage: ~455 KB) at a lower quality (target −150 KB, visual check), or drop the
  splash art of the largest files to the 720 cap they already share. Measure with `npm run budget`; never exceed.
- No new textures, models, audio or fonts.

## 11. Build order (for the builder)

1. Worktree from origin/main (rebase over the parallel mode-unlocks/Yarn/starters/history/chat workflow; it does not
   touch the sim).
2. Sim: ids, `open: 3`, map files, runtime tables, `ob`, objective module, hooks, bots → G1, G2.
3. Tools `--map`, balance and objective probes → G3–G5, tune.
4. Render, HUD, loading card, Practice chips, app wiring → G6, G7.
5. Backend (vendor v34, relay pick, ranked and history fixes) → push backend once.
6. Game build commit, push, pawlegends.app check, OTA run green, CI green; screenshots to gs://pawlegends-pages and a
   hub card; V34-MAPS.md; remove the worktree.
