# ROSTER-V31: four more champions (sim v31, 2026-11-15)

Standing goal (founder): "fully-fledged multiplayer game that's better than mobile-legends and league of legends and
wild rift". Round 5 gap report (`research/gaps5-shipped.html`): roster depth is still the largest gap (24 champions
against ~142 in Wild Rift, 133 in Mobile Legends and 108 in Brawl Stars; "a steady cadence, for example 2 a month").
This run adds four champions, two cats and two dogs, and ships them in sim v31 with v30 frozen.

## 1. What was missing

After v29 each side had exactly two heroes of each role. Mage and marksman are the two largest role pools in Wild
Rift and Mobile Legends (and the two solo/duo lanes), and four archetypes those games build whole metas around had no
hero here:

| Archetype (WR / MLBB example) | Before | v31 |
|---|---|---|
| Artillery mage: long-range delayed poke (Xerath, Vel'Koz / Pharsa) | none (Bengal and Domino zone at 7–9 m) | **Nova** (cat mage, STELLAR): a 14 m meteor shower |
| Ammo gunslinger: the 4th shot crits (Jhin / Granger) | none (Sage's 4th arrow pierces, no reload) | **Dusty** (cat marksman, FIRE): Four Corks |
| Drain battle mage: fights up close, heals off his spells (Vladimir, Swain / Cecilion, Esmeralda) | none (no ability lifesteal on any hero) | **Barkula** (dog mage, DARK) |
| Stealth sniper (Lesley / Caitlyn, Twitch) | none (Cacklejaw slinks, but no hero hides by standing still) | **Ranger** (dog marksman, WIND): Camouflage, LONG SHOT |

Each side now has 14 heroes: two fighters, supports, tanks and assassins, three mages and three marksmen. The four
elements fill the side's thinnest roles (cats had one STELLAR and one FIRE hero, dogs one DARK and one WIND).

## 2. Kits

All numbers are in `pawlegends/src/data/heroes/<hero>.ts`; the kits in `pawlegends/src/sim/heroes/<hero>.ts`, the
bots in `pawlegends/src/sim/bots/heroes/<hero>.ts`. No new effect primitive, projectile kind, world array or snapshot
field: burst zones, `fluff` shots, homing bolts, stealth and the shared kit arrays. New `clip` kinds (not hashed):
`ricochet`, `lasso`, `bigcork`, `highnoon`, `redmoon`, `bitten`, `longshot`, `camoshot`. Every hard-CC skill keeps
the reaction rule (V17.md §3.2): the Lasso winds up 0.3 s; Warning Bark is a self-peel knockback with no stun (exempt
like Domino's Big Shake).

### 2.1 Nova, cat mage (STELLAR), index 24

A slim blue-grey stargazer with a gold crescent circlet and a brass telescope. Passive **Starlight**: her hits on an
enemy hero 7 m or more away deal +15%. **Q Starfall**: a point within 9.5 m; 0.7 s later a 1.7 m disc (damage, 25%
slow). **W Shooting Star**: an 11 m line shot that flies through everything (minions 60%) and reveals heroes 2 s.
**E Moon Hop**: a 3.5 m hop; the moonbeam left where she stood slows dogs 40% after 0.4 s. **R METEOR SHOWER**
(0.4 s wind-up): a point within 14 m; 0.8 s later a 3.8 m disc takes four meteors 0.4 s apart (damage and a slow
each). Every delayed hit is a burst zone both teams see while it arms: walking out is the counter-play. Bot: meteors on
a foe below 55% or two together, hops away from a diver, Starfall on the foe, Shooting Star along the line.

### 2.2 Dusty, cat marksman (FIRE), index 25

An orange tabby cowgirl with a wide hat and a toy cork popgun. Passive **Four Corks**: every 4th basic is a Big
Cork (+70%, a 25% slow), then a 0.6 s reload. **Q Trick Shot**: a cork at an enemy within 6.5 m that bounces to the
nearest other enemy within 4 m (a hero first) for 70%. **W Lasso** (0.3 s wind-up): the first enemy hero on a 6 m line
is hurt and rooted 1 s. **E Quick Draw**: a 3 m dash that loads a Big Cork she can fire at once. **R HIGH NOON**
(0.5 s wind-up): she plants (busy) and fires three big corks 0.4 s apart along the aim, through minions, stopping at
the first hero; the last +50%. A stun ends it. Bot: HIGH NOON at a foe below 55% (not with a foe on top of her),
Quick Draw away from a diver, Lasso on the line, Trick Shot the foe (or a minion beside a pack).

### 2.3 Barkula, dog mage (DARK), index 26

A black-and-tan Doberman count in a tall-collared cape. Passive **Night Thirst**: his ability damage heals him 18% of
it on enemy heroes, 6% on anything else. **Q Bat Bite**: a 7.5 m bat that stops at the first unit. **W Bat Swarm**:
2.5 s of bats round him (every 0.5 s damage to enemies within 2.8 m) and +15% speed. **E Mist Form**: 0.6 s
untargetable, +40% speed, slows shaken off. **R RED MOON** (0.4 s wind-up): enemy heroes within 5 m are marked and
slowed 30% for 1.5 s; when the marks pop, each marked hero still within 7 m is bitten and he drinks another 20%.
Running out of the moon is the counter-play. Bot: RED MOON on two heroes (or one below 45%), the swarm with a foe in
it, Mist when focused and slowed or low, Bat Bite on the line. (The ultimate is "RED MOON", not "BLOOD MOON": the
copy rule keeps blood words out of the game, `nap-card.test.ts`.)

### 2.4 Ranger, dog marksman (WIND), index 27

A tricolour beagle park ranger in a leafy cape with a tennis-ball launcher. Passive **Camouflage**: 3 s without
dealing or taking damage hides him (stealth, rolling, so any hit ends it); his first basic from hiding deals +45%.
**Q Tracer Ball**: a 10 m ball that passes minions (60%) and stops at the first hero, revealing it 3 s. **W Warning
Bark**: a 3 m, 90° cone: damage, a 2 m knockback and a 30% slow. **E Bush Dive**: a 3.5 m dash, hidden 1.5 s, the
Camouflage shot loaded. **R LONG SHOT** (an enemy hero within 13 m, 0.5 s wind-up): he settles (busy) and fires
three homing balls 0.4 s apart, each with +8% of the target's missing HP; the target is revealed until the last ball
(a bush cannot drop it); a stun, untargetability or a target past 15 m ends it. Bot: LONG SHOT a foe below 50% with
no enemy hero within 4 m of him, the bark at a diver, Tracer Ball on the line.

## 3. Look, sound and words

- Models (`render/chars/heroes/<hero>.ts`, parts and procedural like every chibi): Nova's circlet, mantle, cape and
  diagonal telescope; Dusty's wide hat (team crown and brim trim, so the team reads from the iso camera), bandana,
  popgun and spurs; Barkula's Doberman head, cape with the stand-up collar and medallion; Ranger's beagle head, leaf
  tufts, bandana and launcher. Move sets (`render/moves/`) bind every clip to the sim timings (timing contract), skill
  FX in `render/skillfx/` (falling stars queued to land on the zone's arm tick, the cork bounce line and lasso loop,
  the bat ring and the moon, the scope ring on LONG SHOT's target), identity and sounds in `render/identity.ts` and
  `audio/champ/<hero>.ts`.
- Art: face (256) and splash (360, 720) per hero and painted art for every coat (256/360/720), Gemini
  (gemini-3-pro-image-preview) paint-overs of the in-game model renders in the painted look of the other 24 (the
  round-5 method); Dusty's popgun is drawn as a toy, never a real gun.
- Announcer lines (`name_`, `bounty_`, `onRoll_`): the designed announcer voice cloned locally with Qwen3-TTS Base
  (mlx-audio 0.6.5) from her own "Mochi is on a roll!" clip, -16 LUFS, 24 kHz mono mp3.
- Text: heroText, the skill codex (tips and counters), lore (Nova and Barkula are rivals over the night sky, Dusty and
  Ranger over who shoots better), icons, a win quest each, three Treat Track coats each (chests 79 to 90) and the
  palette loop coats; landing roster portraits.

## 4. Balance

Each new hero has its own `pvp` row (3v3) and Hearthwood row (5v5); the runs are in §7. Besides the four, the 3v3 rows
of Chili (+2%) and Bengal (−2%) moved (they were out of band on both fit windows with the new four; a 3v3 row applies
on Hearthwood too), and the Hearthwood rows of Ziggy (+5% in two steps), Meatball (+4%), Gabby and Lambo (+1%), Pixel
(−3% in two steps), Clem (−2%) and Chili (−1.5%, after his 3v3 +2%). Every step moves `dmgBp` up and `takenBp` down by
the same amount (the V30 convention). Kits, bots, map and modes are untouched by the balance pass.

## 5. Store

The champion catalogue (both copies) gets four rows. The launch rule (CHAMPION-STORE.md §5) puts the four at the
launch price in sim v31 (`CHAMP_LAUNCH`); the v29 four move to their tiers. Tiers: Dusty and Barkula T2, Nova and
Ranger T3. The weekly rotation cycles grow to 11 a species, ordered so every three in a row are three roles; the four
are free in the first week (CHAMPION-STORE.md). The Season 1 bundles keep their 14 (adding later champions to a
bundle is a pricing call, founder). The Founders roster stays the release's 20. Nothing is sold in the apps.

The local unlock cap (`UNLOCKS_MAX`) grows 240 → 320 for the 90 track rewards and the 192-coat loop (the account blob
keeps 400).

## 6. Versioning

`SIM_VERSION` 31. `tools/vendor-sim.mjs` freezes v30 at dc053f38 (its last commit on main; bundle `6c53591e…`, the
same ten extras as v29), so the backend verifies 10 to 31. The live v31 directory adds `roster31-replay.fixture.json`
(Ranger, seed 3131). A v31 record with a new hero is refused by v30 (unknown hero). Bot picks change on every map, so
v31 changes Crossing replays too (as v29 did). Force update: the backend deploys first, then the OTA publish raises
`minSim` (FORCE-UPDATE.md §3.3).

Tool fixes: `tools/headless-match.mjs` CAT_HEROES missed Mochi and Ziggy since v29, so the 3v3 species check counted
them as dogs; every tool hero list now has the 28.

## 7. Results

**3v3 balance gate** (`tools/headless-match.mjs --gate balance`, Normal vs Normal). First fit (seeds 1–2000): Nova 57.6%,
Dusty 50.2%, Barkula 44.5%, Ranger 47.2%; refit rows on 2001–4000: 48.9 / 48.6 / 46.5 / 48.9%, cats 50.5%. The shipped
rows, judged pooled over **8,000 unseen seeds (20001–28000)**:

| Gate | Result |
|---|---|
| Nova / Dusty / Barkula / Ranger (46–54) | **51.6% / 48.5% / 50.1% / 50.3%** |
| Every hero (46–54, pooled) | **28 of 28**, 46.0% (Mochi) to 53.2% (Champ) |
| Cats (47–53) | 48.8% |
| Side (45–55) | Purrhaven 47.7% / Woof 52.3% |
| Length p50 / p95 | 7:45 / 8:39, core kill before Sudden Death 80.3%, no safety end |
| Takedowns a minute | 3.38 |
| Down 10+ takedowns at the end wins < 5% | **9.7% of 944: fails, as it did before this release** (v29 read 6.3–10.5%, ROSTER-V29.md §7) |

Mochi at 46.0% sits on the band's edge (her 5v5 row is fine at 49.4%): the next balance pass should give her 3v3 row
+1%.

**5v5 Hearthwood** (`tools/hearth-gates.mjs`, ten `normal` pilots, each seed played twice with the sides swapped).

1. Neutral rows for the four, 2,000 matches (110001): Nova 59.7%, Dusty 56.0%, Ranger 55.3%, Barkula 44.1%, cats 53.7%
   (the strong new cats lifted every cat). First rows −5 / −5 / −5 / +2.5%.
2. 2,000 matches (112001): cats 49.4%, side 48.4%, only Ranger 54.1% and Ziggy 43.4% out. A joint logistic fit of the
   line-ups (`hero strength` terms, the row step as a covariate at 0.065 logit per 1%, V30-BALANCE.md §2) gave the
   next steps.
3. First 8,000 verify (24001–28000): side 50.0%, cats 48.4%, but Barkula 54.8% (his 3v3 +1% applies here too) and
   Meatball 44.3%. Refit on 10,000 matches.
4. Second 8,000 verify (28001–32000): side 49.5%, cats 51.3%, only Nova 54.4% out. Joint fit on 18,000 matches: Nova
   −2.5%, Clem −2%, Pixel −1.5%.
5. **Shipped rows, 8,000 unseen matches (32001–36000; the tool's 20001–28000 verify range was used up by v30 and step
   3)**:

| Gate | Target | 32001 | 33001 | 34001 | 35001 | Pooled 8,000 |
|---|---|---|---|---|---|---|
| G6 side (team 0) | 48–52% | 48.5% | 49.9% | 50.9% | 48.7% | **49.5%** |
| G5 cats vs dogs | 47–53% | 48.5% | 48.4% | 48.6% | 49.6% | **48.8%** |
| G5 every hero (pooled) | 46–54% | | | | | **28 of 28, 47.3% (Gabby) to 53.4% (Ranger)** |
| G5 length p50 / p95 | 12:00–14:30 | | | | | 13:07 / 13:14 |
| G5 safety end | ≤ 2% | | | | | 0% |
| G2 determinism (solo, party, PvP 5v5) | identical | | | | | 90 of 90 |

The four on the shipped 5v5 rows: Nova 49.0%, Dusty 47.7%, Barkula 51.7%, Ranger 53.4%. The comeback numbers (V30 §4)
were not re-measured; the target stays the founder's call.

**Checks**: tsc, lint:sim, the unit suite (`tests/unit/heroes/roster-v31.test.ts`: every slot and passive through the
cast pipeline; `sim-v31.test.ts`: version and freeze, bots cast every slot of the four and fire their clip events,
determinism, Hearthwood verify, the vendored fixture), the reaction-window, codex, lore, identity, readability and
team-read tests, `vendor-sim` and the party golden (regenerated from v31), e2e desktop and landscape
(`roster-v31.spec.ts` and the champion select, store, side tabs, no-scroll, browser and skins specs), backend
`pawlegends-live.spec.ts` (v31 accepted, a Ranger record refused as v30, v30 frozen) and
`pawlegends-champion-store.spec.ts` (rotation of 11, launch price, tiers), `build:client`, budget.
