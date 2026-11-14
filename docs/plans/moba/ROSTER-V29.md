# ROSTER-V29: four new champions (sim v29, 2026-11-14)

Standing goal (founder): "fully-fledged multiplayer game that's better than mobile-legends and league of legends and
wild rift". Round 3 gap report (`research/gaps3-shipped.html`): roster depth is the largest gap left (20 champions
against ~142 in Wild Rift, 133 in Mobile Legends and 108 in Brawl Stars). This run adds four champions, two cats and
two dogs, and ships them in sim v29 with v28 frozen.

## 1. What was missing

Before v29 each side had 10 heroes: 2 tanks, 2 assassins, 2 mages, 2 marksmen, but only **1 fighter and 1
support**. Wild Rift and Mobile Legends players expect these archetypes, and we had none of them:

| Archetype (WR / MLBB example) | Before | v29 |
|---|---|---|
| Hook catcher support (Blitzcrank, Thresh / Franco) | none (FOOTLONG! is an assassin's gap-closer) | **Biscuit** (dog support): Fetch! |
| Enchanter support (Lulu, Janna / Angela, Estes) | Gabby and Nugget heal; nobody buffs | **Mochi** (cat support): shields, attack speed, speed |
| Dash-reset skirmisher (Riven, Irelia / Lancelot) | none | **Ziggy** (cat fighter): three Zigs, the storm |
| Juggernaut with a wall-stun (Vi, Poppy / Chou) | none | **Champ** (dog fighter): KNOCKOUT! into a wall |

Each side now has 12 heroes, exactly 2 of each of the 6 roles.

## 2. Kits

All numbers are in `pawlegends/src/data/heroes/<hero>.ts`; the kits in `pawlegends/src/sim/heroes/<hero>.ts`, the
bots in `pawlegends/src/sim/bots/heroes/<hero>.ts`. No new effect primitive, projectile kind, world array or
snapshot field: the kits use the shared kit arrays, `fluff` shots and the existing effects. New `clip` kinds (not
hashed): `lullaby`, `zigzag`, `fetch`, `ko` (on the dazed victim, like `frozen`).

### 2.1 Mochi, cat support (FAIRY), index 20

A round ragdoll with a nightcap and a pillow. Passive **Warm Lap**: her shields on a friend below 50% HP are 25%
stronger. **Q Pillow Toss**: an 8 m pillow that stops at the first unit, damage and a 20% slow; a hit on an enemy hero
shields her most hurt friend within 7 m. **W Cuddle Bubble**: a shield and +30% attack speed for 3 s on the friend
nearest the aim (else herself). **E Purr Wave**: +30% speed for her and the friends within 4 m; she shakes off slows.
**R LULLABY** (0.5 s wind-up): friends within 6.5 m heal; enemy heroes within 4.5 m are drowsy (45% slow, 1.2 s), and
the ones still within 5.5 m of her when it ends fall asleep (stunned 0.75 s). Counter-play: walk out of the drowsy
ring, or Purr-ify. Bot: LULLABY on 2+ heroes in the ring (or 1 with a hurt friend), the bubble on the friend nearest
the fight, Purr Wave when slowed or a friend is hurt, the pillow at the foe.

### 2.2 Ziggy, cat fighter (ELECTRIC), index 21

A lightning Bengal. Passive **Static Step**: after a dash his next basic within 2.5 s deals extra damage. **Q Zig**:
a 3 m dash that hits every enemy it passes, recast twice within 3 s (Clem's recast pattern). **W Spark Swipe**: a
0.3 s coil, then a 2.4 m ring that stuns enemy heroes 0.4 s. **E Tail Flick**: a 2.5 m hop and a shield. **R ZIGZAG
STORM** (a target within 6 m, 0.27 s wind-up): untargetable and busy, he strikes 4 times 0.2 s apart, each time beside
the nearest enemy hero within 6 m he has not struck yet (a hero struck again takes half). A stun, a Nap or death ends
it. Bot: storms a foe below 55% HP or two together (never into an untanked enemy tower unless it is about to fall),
swipes foes in the ring, Zigs in, flicks out when focused below 40%.

### 2.3 Biscuit, dog support (SAND), index 22

A golden retriever with a ball on a leash. Passive **Good Boy**: every 9 s his next basic on an enemy hero stuns it
0.4 s and shields him and the nearest friend. **Q Fetch!** (0.4 s wind-up): a 9 m ball that stops at the first unit;
an enemy hero it hits is stunned 0.4 s and pulled to 1.6 m in front of him (hard CC, counted by Steadfast). **W Tail
Wag**: a 2.6 m ring, damage and a 1.5 m knockback. **E Stubborn**: a cleanse, 1 s of CC immunity and 25% less damage.
**R WALKIES!** (0.4 s wind-up): enemy heroes within 5 m are pulled up to 2.5 m toward him (never closer than 1.5 m),
hurt and slowed 35%; he gains a shield. Bot: Fetch! a foe on a clear line with an ally near (or a low foe), never
while he stands in an untanked enemy tower's reach; WALKIES! on 2+ heroes; Tail Wag to peel.

### 2.4 Champ, dog fighter (FIRE), index 23

A boxer in boxing gloves. Passive **One-Two**: every third basic on the same enemy hero within 3 s is a Cross, extra
damage and a 25% slow. **Q Haymaker** (0.2 s wind-up): a 3 m, 75° cone. **W Rope-a-Dope**: 1.5 s of 35% less damage,
then he heals 40% of what he took in it. **E Bob and Weave**: a 3.5 m dash; his next basic within 3 s is a Cross.
**R KNOCKOUT!** (an enemy hero within 2.5 m, 0.5 s wind-up): big damage plus 10% of its missing HP, knocked back 4 m;
if a wall stops the flight short (under 75% of the push) it is stunned 1.25 s on landing. Bot: KNOCKOUT! a foe below
55% (not into an untanked enemy tower), Rope-a-Dope when focused, Haymaker, Bob and Weave in.

## 3. Look, sound and words

- Models (`render/chars/heroes/<hero>.ts`, parts and procedural, like every chibi): Mochi's floppy nightcap and pillow,
  Ziggy's bolt fins and headband, Biscuit's long ears, ball and leash, Champ's two huge red gloves and title belt.
  Move sets (`render/moves/`) bind every clip to the sim timings (timing contract), skill FX in `render/skillfx/`,
  champion identity (motif, colours, timbre, voices) in `render/identity.ts` and `audio/champ/<hero>.ts`.
- Art: face (256) and splash (360, 720) per hero, made with Gemini (gemini-3-pro-image-preview) from the v6 art style
  master and the in-game model render, in the v6 Lightning Rivalry style lock.
- Announcer lines (`name_`, `bounty_`, `onRoll_`): the existing designed announcer voice, cloned locally with
  Qwen3-TTS Base (mlx-audio) from one of her own clips, -16 LUFS, 24 kHz mono mp3.
- Text: heroText, the skill codex words (tips and counters), lore (Mochi and Biscuit, Ziggy and Champ are rivals),
  icons, a win quest each, three Treat Track coats each (chests 67 to 78) and the palette loop coats.

## 4. Balance

Each new hero has its own `pvp` row (3v3, Normal and Hard; the usual lever, V20-CHASE.md §9) and its own Hearthwood
row (`HEARTHWOOD_PVP.hero`, 5v5). The runs are in §7. Tried and dropped: a Biscuit bot that also cast Stubborn
whenever it was hurt and focused (41.1% in a confirm window, against 50.0% pooled without it): Stubborn stays a
cleanse (slowed, rooted or stunned while focused), so bots rarely cast it.

## 5. Store

The champion catalogue (both copies) gets four rows. The existing launch rule applies (CHAMPION-STORE.md §5:
a new champion costs the launch price in its first sim version, then its tier): `CHAMP_LAUNCH` lists the four; tiers
Mochi and Champ T2, Ziggy and Biscuit T3. They join the weekly rotation cycles (now 9 a species, three roles a week).
The Season 1 bundles keep the 14 champions they were priced for; whether the four join a bundle is a pricing call
(founder). Nothing is sold in the apps.

## 6. Versioning

`SIM_VERSION` 29. `tools/vendor-sim.mjs` freezes v28 at 806918b6 (bundle `8cd34c1c…`, the same nine extras), so the
backend verifies 10 to 29. The live v29 directory adds `roster-replay.fixture.json` (Biscuit, seed 2929). A v29 record
with a roster hero is refused by v28 (unknown hero).

## 7. Results

**3v3 balance gate** (`tools/headless-match.mjs --gate balance`, Normal vs Normal, 2,000 seeds a window). First fit
(seeds 1–2000): Biscuit 35.1%, Mochi 39.9%, Ziggy 61.9%, Champ 45.0%, cats 54.8%. Three refits on fresh windows
(2001, 4001), then the shipped rows on four windows, pooled over **8,000 seeds (6001–14000)**:

| Hero | 6001 | 8001 | 10001 | 12001 | Pooled (46–54) |
|---|---|---|---|---|---|
| Mochi | 47.6% | 48.9% | 49.1% | 47.5% | **48.3%** |
| Ziggy | 51.7% | 50.1% | 51.7% | 46.9% | **50.1%** |
| Biscuit | 51.1% | 47.5% | 49.9% | 51.5% | **50.0%** |
| Champ | 48.9% | 51.6% | 49.2% | 49.6% | **49.8%** |
| Cats (47–53) | 49.1% | 51.7% | 50.8% | 49.1% | pass in every window |
| Side (45–55) | 49.7% | 50.1% | 50.6% | 48.5% | pass |
| Length p50 / p95 | 7:48 / 8:40 | 7:50 / 8:40 | 7:48 / 8:40 | 7:48 / 8:39 | pass |

The reaction rule (V17.md §3.2: a hard-CC ability winds up at least 0.3 s, 0.4 s at 9 m) then moved Spark Swipe to
0.3 s and Fetch! to 0.4 s; a confirm window on the final sim (16001): Mochi 48.2%, Ziggy 49.8%, Biscuit 48.9%, Champ
48.5%, cats 49.4%, down 10+ wins 5.5%.

Open, not caused by the roster alone: "down 10+ takedowns at the end wins < 5%" reads 10.0 / 5.8 / 9.0 / 10.5%
(n ≈ 240 a window); v28 on seeds 1–2000 already read 6.3% (it failed before this change). The older heroes' per-hero
rows (Brutus and Bravo low, Raspberry, Duchess and Stilts high in some windows) are as noisy as in v28's own window.

**5v5 Hearthwood** (`tools/hearth-gates.mjs`, 300 seeds = 600 symmetry matches). Without a Hearthwood row (72001):
Mochi 61.4%, Ziggy 58.4%, Biscuit 40.4%, Champ 45.2%, cats 58.2%. With the rows (74001): Mochi 50.0%, Ziggy 50.0%,
Biscuit 52.1%, Champ 44.9% (then +2% on Champ's row), **cats 52.8% (pass)**, length p50 13:07, no safety end,
determinism 30 of 30. Side 47.8% on that window (v28: 49.0% / 51.0%). The per-hero 5v5 gate is judged pooled over
8,000 matches; that run is still open (as it was for v28, V28.md §1.3), and Raspberry (61.6%) and Lambo (58.0%) are the
older heroes furthest out.

**Checks**: tsc, lint:sim, the unit suite (the roster kit tests `tests/unit/heroes/roster-v29.test.ts`, `sim-v29.test.ts`:
bots cast every slot, the clip events, determinism, Hearthwood verify, the vendored fixture), e2e
`tests/e2e/roster-v29.spec.ts` (desktop and landscape: the four in the select and the browser, a match as each, Q
casts), backend `pawlegends-live.spec.ts` (v29 roster record verifies, refused as v28) and
`pawlegends-champion-store.spec.ts` (rotation, launch price, bundles).
