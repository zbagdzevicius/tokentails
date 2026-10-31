# Pawlegends sim v11 build spec: four new original cats

**The four:** Meatball (tank), Pixel (marksman), Duchess (mage) and Stilts (assassin). On screen they read as a ball, a box, a cloud and a stick. Each has a role and an element (GRASS, ICE, DARK, SAND) that no cat has today. Difficulty runs from easy (Meatball) to hard (Stilts). None of them is a Pink Paw shelter champion: they get no catalogId and no row in `shelter.ts` or the backend champions list.

I worked read-only and changed no files. I checked the HeroData shape, the effect primitives, `casts.ts`, `PROJECTILE_KIND`/`SRC_KIND`, the World `k*` arrays and `hashedArrays` against the worktree at c7a694f0.

**Decisions for the user** (each has a default; build with the default unless told otherwise):

1. **Roster tilt.** After this the roster is 10 cats against 2 dogs. Dog teams already field a duplicate, and both dogs now carry the dog side's whole win rate in the 46–54% per-hero gate. Default: ship the 4 cats now and plan a dog wave next, starting from the runner-up ideas (a hook and swap dog from Tackle or Nox). Easy and Rookie (`src/data/bots.ts:167-176`) will need retuning again.
2. **Treat Track.** Default: the 4 cats join `TRACK_ORIGINALS` with 3 coats each, appended after the current 30 rewards, and they wear breed coats (`CAT_HEROES`).
3. **Existing bug, reported and not fixed here.** On touch, the Attack button treats only Sage as ranged (`src/input/touch/touchControls.ts:351,405`), so ranged heroes get a 1.6–1.8 m button. Pixel (5.8 m) and Duchess (5.0 m) would inherit it, as Bengas and Gabė already do. Default: report it and fix it in its own commit, not inside this work.

---

## 0. Scores for all 12 proposals

Each criterion is 0–10. For balance, a higher score means safer. "Different" means different from all 8 current heroes in both play and silhouette.

| id | Different | Fun and readable on mobile | Cheap to build | Bot can cast it | Balance safety | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| meatball | 9 | 9 | 9 (no new primitive) | 8 | 6 | **41** | Picked (tank) |
| pixel | 10 (box silhouette, channelled beam) | 8 | 8 | 8 | 7 | **41** | Picked (marksman) |
| duchess | 9 (stacking mark, floats on a cushion) | 8 | 7 (one new hashed stack array, fluff gear) | 8 | 6 | **38** | Picked (mage) |
| stilts | 8 | 8 | 7 (fallback without rig code, ghosting dropped) | 7 | 5 | **35** | Picked (assassin; tie-break: thin silhouette against three round ones, and the hard pick) |
| tundra | 8 | 7 | 8 | 8 | 4 (2 s hold against only 2 dogs) | 35 | Runner-up: its drain-when-still momentum goes to Stilts |
| mirage | 7 (zone mage close to Bengas's burn disc; hairless like Purl) | 7 | 8 | 8 | 5 | 35 | Runner-up: its gold-accent override goes to Stilts |
| tackle | 8 | 8 | 6 (new vortex zone) | 7 | 5 | 34 | Next wave (as a dog) |
| splash | 7 | 7 | 6 (ON_HIT.Push, soak arrays) | 7 | 6 | 33 | Runner-up: its "damage first, then add stacks, trigger once" rule goes to Duchess |
| nox | 8 | 7 | 6 (ON_HIT.Pull, omen array) | 6 | 5 | 32 | Runner-up: its lantern anti-stealth idea goes to Stilts W (cut down) |
| pip | 9 | 7 | 2 (form engine, two meshes, two HUD kits) | 6 | 4 | 28 | Parked |
| purl | 10 | 6 (pets clutter a phone screen) | 2 (pet primitive, minion slots) | 5 | 4 | 27 | Parked: its "fizzle when there is no target, no cooldown spent" rule goes to Meatball E |
| moss | 9 | 6 | 3 (hedge zone; static nav ignores it) | 5 | 4 | 27 | Parked |

No two of the four share a role. Their elements are all new to cats (`Element` gains `ICE` and `GRASS`; `SAND` and `DARK` exist but were dog-only until now). Difficulty: Meatball easy, Pixel and Duchess medium, Stilts hard.

---

## 1. Roster

| HERO_IDS index | id | Name | Role | Element | Fantasy | Silhouette |
|---|---|---|---|---|---|---|
| 8 | `meatball` | Meatball | tank | GRASS | A round orange snack-loving bouncer who bowls dogs off his friends and naps in a catnip patch when hurt | The widest body in the game: an orange tabby ball with a small head, a stubby tail, a team-coloured bandana cape and a fish lunchbox |
| 9 | `pixel` | Pixel | marksman | ICE | A tiny tuxedo kitten in a home-made cardboard robot box with a bottle-cap cannon and a laser pointer; in her ultimate the box grows legs | A square: a kraft-brown box with team-coloured flaps, a kitten head peeking out and an antenna bead |
| 10 | `duchess` | Duchess | mage | DARK | A vain Persian puffball floating on a velvet cushion; three snubs and a dog is too stunned to move | A giant cream cloud on a team-coloured cushion, with a tiara, a flat face and a plume tail; she never walks |
| 11 | `stilts` | Stilts | assassin | SAND | A lanky Savannah with radar ears who builds speed by running and pounces from absurd range | The tallest and thinnest cat: huge upright ears, long legs in leg-warmers, a whip tail and a trailing team-coloured scarf |

---

## 2. Per-cat specs

Units throughout: mm, mm/s, ticks at 30 Hz, bp (10000 = 1.0) and 1/4096-turn arcs (1024 = 90°, 910 ≈ 80°). Every gameplay number lives in `src/data/heroes/<id>.ts` and is read by name through `abil(w, id)`. Primitive paths are under `src/sim/effects/`.

### 2.1 Meatball (`meatball`, index 8)

**HeroData:** `src/data/heroes/meatball.ts`
```ts
/** Meatball, Tank (sim v11, original cat): a displacement tank who bowls enemies off his allies. */
import type { HeroData } from './types';

export const MEATBALL: HeroData = Object.freeze<HeroData>({
  id: 'meatball',
  name: 'Meatball',
  side: 'cat',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Starting point; tune on the 2,000-seed gate. */
  pvp: { dmgBp: 10000, takenBp: 9400 },
  element: 'GRASS',
  base: { hp: 780, hpPerLevel: 80, attack: 50, attackPerLevel: 4, attackEvery: 34, range: 1600, speed: 4700, armour: 36, armourPerLevel: 3 },
  /** Food Coma: a hit that drops him below 30% HP puts him to sleep: a shield of 15% max HP for 3 s. 60 s lockout. */
  passive: { thresholdBp: 3000, shieldBp: 1500, duration: 90, cooldown: 1800 },
  abilities: {
    /** Bowling Roll: roll 6 m; enemies within 1.2 m of his path are knocked 1.5 m sideways, 55 (+5/lvl, +15 a rank); heroes slowed 25% for 1 s. */
    q: { cooldown: 270, dash: 6000, touch: 1200, push: 1500, dmg: 55, dmgPerLevel: 5, slowBp: 2500, slow: 30 },
    /** Loaf Mode: rooted loaf for 2 s, 40% less damage; enemy heroes within 3 m are charmed to him for 0.75 s. */
    w: { cooldown: 420, duration: 60, reduceBp: 4000, radius: 3000, charm: 23, slowBp: 5000 },
    /** Big Brother: dash to the allied hero nearest the aim (6 m); shield them 8% of his max HP for 2.5 s and knock enemy heroes within 2.2 m of them 2 m away. No ally: dash 4 m, half the shield on himself. */
    e: { cooldown: 450, range: 6000, pickRadius: 2500, shieldBp: 800, duration: 75, radius: 2200, push: 2000, soloDash: 4000 },
    /** Unstoppable Chonk: 4 s cleanse and CC immunity, +35% speed; enemy heroes he bumps take 90 (+9/lvl, +40 a rank) and fly 2.5 m along his heading, once a second each. */
    r: { cooldown: 2100, duration: 120, hasteBp: 3500, touch: 1300, push: 2500, rehit: 30, dmg: 90, dmgPerLevel: 9 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 40, cooldown: -100 } },
  talents: [
    [
      { id: 'hungry-roll', name: 'Hungry Roll', mods: { q: { dash: 7500 } } },
      { id: 'heavy-roll', name: 'Heavy Roll', mods: { q: { slowBp: 4000 } } },
    ],
    [
      { id: 'long-loaf', name: 'Long Loaf', mods: { w: { duration: 75 } } },
      { id: 'protective', name: 'Protective', mods: { e: { shieldBp: 1100 } } },
    ],
    [
      { id: 'extra-chonk', name: 'Extra Chonk', mods: { r: { duration: 150 } } },
      { id: 'bowling-pin', name: 'Bowling Pin', mods: { r: { push: 3500 } } },
    ],
  ],
});
```

**heroText (HERO_TEXT):**
- Title: "The Bouncer". Role: Tank.
- Blurb: "Rolls into dogs and bowls them off his friends."
- Passive, Food Coma: "Dropping low puts him to sleep under a big shield."
- Q, Bowling Roll: "Roll forward; everything in the way is knocked aside."
- W, Loaf Mode: "Become a loaf: rooted, tougher, and nearby dogs can't resist coming over."
- E, Big Brother: "Jump to a friend, shield them and push dogs off them."
- R, Unstoppable Chonk: "Nothing stops you. Bump into dogs to send them flying."
- New icons: `roll`, `loaf`, `bodyguard`, `chonk`.

**Sim kit:** `src/sim/heroes/meatball.ts`. Header comment "Kit arrays: kHuntT Food Coma lockout; kRT loaf ticks; kWindow Chonk ticks; kCount Chonk bump bitmask (bit = enemy hero id); kEmpower ticks until the bitmask clears; kStage 1 = Big Brother landing pending; kFoe the ally being guarded".
- `aim`: Q `Aim.Dir`, mobility. W `Aim.Self`. E `Aim.Point` with reach 0, mobility (cast picks the ally, as `gabe.ts` W does). R `Aim.Self`.
- **Passive.** In `incoming()`: if `kHuntT === 0` and `hp - dmg < maxHp*thresholdBp/10000`, call `addShield(w,id,idiv(maxHp*shieldBp,10000),duration)` (`shield.ts:13`) and set `kHuntT = cooldown`. Tick it down in `stepKit`.
- **Q.** `dash(m,id,angle,q.dash)` (`dash.ts:64`). In `onDashTick`, find touched enemies with `collect` plus the dasher's `fmHitLo/fmHitHi` mask; this is the existing pattern at `cacklejaw.ts:132-136`. For each unit hit:
  - Compute the side sign with a cross product of his heading and the vector to the victim.
  - Call `knockback(m,e, ex - perpX, ey - perpY, push, heading ± 1024)` (`knockback.ts:12`). This pushes it sideways off the path. A unit dead on the line goes to the +1024 side, lowest id first.
  - Then `dealDamage` (`combat/damage.ts:54`). Heroes also get `slow` (`slow.ts:5`).
- **W.** `root(w,id,duration)` (`root.ts:5`); `kRT = duration`; `incoming()` applies `reduceBp` while `kRT > 0`. Enemy heroes within `radius` (`inRing`, `collect`) get `charm(w,e,charm,id)` (`fear.ts:25`) plus `slow(w,e,slowBp,charm)`, the same pattern as `gabe.ts:104-105`. A Q or E cast clears `kRT` and `w.rootT[id]`.
- **E.** Ally pick: the nearest allied hero to the aim point within `pickRadius`, aim clamped to `range` (copy Gabė's W pick). Dash to `dist - radii - 300` and set `kStage = 1`, `kFoe = ally`.
  - In `stepKit`, once `fmKind === FM.None` and `kStage === 1`, land: `addShield(ally, idiv(maxHp[id]*shieldBp,10000), duration)`. Every enemy hero within `radius` of the ally gets `knockback(m,e, allyX, allyY, push, …)`.
  - No ally in the pick: `dash(soloDash)` along the aim and shield himself for half. It never fizzles.
- **R.** `cleanse(w,id,duration)` (`status.ts:22`) and `haste(w,id,hasteBp,duration)` (`buff.ts:15`); `kWindow = duration`.
  - Each tick of `stepKit` while `kWindow > 0`: enemy heroes within `touch + radii` whose bit is not set in `kCount` take `dealDamage`, then `knockback(m,e,x[id],y[id],push,facing)`, and their bit is set.
  - Every `rehit` ticks (`kEmpower`), `kCount` resets to 0.
- No new primitive and no new World array.

**Bot** (`src/sim/bots/heroes/meatball.ts`, called from `casts.ts`):
- fight:
  - Q when an enemy hero lies on the 6 m line, aimed through `aimed()`.
  - W when `foesNear(3000) >= BOT_AI.meatballLoafFoes (2)`, or when he is the dive target.
  - E toward `hurtAlly()` when an enemy hero is within `BOT_AI.meatballPeelRange (3000)` of that ally.
  - R when `allyNear` and `foesNear(5000) >= 2`, or to chase a foe below 35% within 4 m.
- clear: Q through 3 or more minions only.
- escape: R if he is rooted or stunned (it cleanses), else E toward the ally farthest from the threat, else Q along `awayFrom()`.

**Chibi** (`src/render/chars/heroes/meatball.ts`, see §4):
- RigSpec: `width 1.35, bodyScale 1.25, headScale 0.95, tier 'hero', earsLow 0.25`, short tailCurve.
- `tail.thick 1.4, cheeks 0.9, eyes.size 0.85, blush on`.
- Coat: tabby in orange (`base 0xe07a35, deep 0xb5521f, light 0xf2a65e, cream 0xfbe3c4`).
- Gear: team-coloured bandana (cape + mantle, which carry the team-read share), a sweatband ring on the head, and a new `fishLunchbox` builder (~120 tris) in `gear.ts`.
- HERO_HEIGHT 2.5; HERO_RING 2.25.
- HERO_MOTION: idle `sit`, run `stand` with a short waddle stride, cast `block`, attack `bash`.
- No rig code needed.

**Moves and VFX:**
- Q and R clips tuck the head and spin the root into a ball; the fx bit `form` shows that ball pose. R also scales him to 1.15.
- skillfx: Q a green grass skid trail along the path. W a "Zzz" loaf glow ring (radius from `w.radius`). E an ally shield bubble plus a push ring. R a leafy ground wave each bump. Food Coma: a Zzz bubble overhead.
- `ultName` 'Chonk!'.
- HERO_COLOR_CSS `#d9662b`. Accent: leave it on the GRASS element colour (not gold).

### 2.2 Pixel (`pixel`, index 9)

**HeroData:** `src/data/heroes/pixel.ts`
```ts
/** Pixel, Marksman (sim v11, original cat): a planted turret kitten in a cardboard robot box. */
import type { HeroData } from './types';

export const PIXEL: HeroData = Object.freeze<HeroData>({
  id: 'pixel',
  name: 'Pixel',
  side: 'cat',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 10600, takenBp: 9600 },
  element: 'ICE',
  base: { hp: 460, hpPerLevel: 48, attack: 50, attackPerLevel: 5, attackEvery: 27, range: 5800, speed: 4700, armour: 16, armourPerLevel: 2 },
  /** Cardboard Plating: an 8%-max-HP plate that refills after 4 s without hero damage; when it breaks she pops out, +25% speed for 1.5 s. */
  passive: { plateBp: 800, refill: 120, hasteBp: 2500, haste: 45 },
  abilities: {
    /** Cap Cannon: 8.5 m shot, stops at the first hero, 75 (+7/lvl, +18 a rank), minions 50%, reveals the hero 2 s. */
    q: { cooldown: 240, range: 8500, width: 900, speed: 18000, dmg: 75, dmgPerLevel: 7, minionBp: 5000, reveal: 60 },
    /** Laser Pointer: 1.5 s channelled 9 m beam that turns with her; every 8 ticks 18 (+2/lvl, +6 a rank) to all enemies on it, slow grows 10% a pulse to 40%; she is slowed 60%. */
    w: { cooldown: 360, range: 9000, width: 600, duration: 45, every: 8, dmg: 18, dmgPerLevel: 2, slowStepBp: 1000, slowMaxBp: 4000, selfSlowBp: 6000, turn: 16 },
    /** Duck and Cover: 1 s in the box, rooted, 75% less damage, plate refilled; melee attackers slowed 30% for 1 s. */
    e: { cooldown: 480, duration: 30, reduceBp: 7500, slowBp: 3000, slow: 30, meleeRange: 2000 },
    /** BOXBOT MK II: 7 s, shield 220 (+20/lvl, +60 a rank), +15% speed, CC-immune 0.5 s, basics splash 1.6 m for 70%, cooldowns 30% faster. */
    r: { cooldown: 1950, duration: 210, shield: 220, shieldPerLevel: 20, hasteBp: 1500, immune: 15, splash: 1600, splashBp: 7000, cdrBp: 3000 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 6 }, e: { cooldown: -15 }, r: { shield: 60, cooldown: -100 } },
  talents: [
    [
      { id: 'long-shot', name: 'Long Shot', mods: { q: { range: 10000 } } },
      { id: 'spotlight', name: 'Spotlight', mods: { q: { reveal: 120 } } },
    ],
    [
      { id: 'overclock', name: 'Overclock', mods: { w: { duration: 60 } } },
      { id: 'hot-dot', name: 'Hot Dot', mods: { w: { slowMaxBp: 5500 } } },
    ],
    [
      { id: 'double-tape', name: 'Double Tape', mods: { r: { shield: 320 } } },
      { id: 'big-boom', name: 'Big Boom', mods: { r: { splash: 2200 } } },
    ],
  ],
});
```

**heroText:**
- Title: "Gadget Kitten". Role: Marksman.
- Blurb: "Shoots from a cardboard robot she built herself."
- Passive, Cardboard Plating: "Her box soaks hits and refills when she's left alone."
- Q, Cap Cannon: "A bottle-cap shot that stops on the first hero and lights them up."
- W, Laser Pointer: "Hold a beam on them; dogs can't stop chasing the dot."
- E, Duck and Cover: "Hide in the box; melee hits on her are slowed."
- R, BOXBOT MK II: "The box grows legs: shield, speed and exploding shots."
- New icons: `capCannon`, `laser`, `duck`, `boxbot`.

**Sim kit:** `src/sim/heroes/pixel.ts`. Header comment "Kit arrays: kHonour plate HP; kWT beam ticks left; kStage beam angle; kCount beam pulses; kRT duck ticks; kWindow Boxbot ticks; kHurt (shared) last hero damage".
- `aim`: Q `Dir`. W `Dir`. E `Self`. R `Self`.
- **Passive.** Same shape as Brutus's Honour (`brutus.ts:135-136`, `absorb` at `:176`):
  - `absorb()` takes from `kHonour`. When it goes from above 0 to 0, call `haste(w,id,hasteBp,haste)`.
  - `stepKit` refills `kHonour` to `idiv(maxHp*plateBp,10000)` once `tick - kHurt >= refill`.
  - The snapshot shield already adds `kHonour` for every hero (`src/sim/index.ts:344`), so the plate shows with no wire change.
- **Q.** `fireSkillshot(w,id,{kind: PROJECTILE_KIND.cap, angle, speed, range, radius: width>>1, dmg: lvl(...), flags: PFLAG.HeroStop, minionBp, effect: ON_HIT.Reveal, effA: reveal})` (`effects/projectile.ts:48`). Return -1 if the projectile cap is reached.
- **W.** Set `kWT = duration`, `kStage = angle`, `kCount = 0`; `slow(w,id,selfSlowBp,duration)`.
  - Each `stepKit` tick: turn `kStage` toward `w.facing[id]` by at most `turn` steps (walking steers the beam, for humans and bots alike).
  - Every `every` ticks: `kCount++`. `collect` enemies with `inLine(x,y, x+cos·range, y+sin·range, width>>1, …)` (`line.ts:21`), using `icos/isin` with TRIG_ONE. Then `dealDamage` and `slow(e, min(slowMaxBp, slowStepBp*kCount), every+2)`.
  - The beam ends early when `disabled(w,id)` (`status.ts:58`), on a forced move, or when she casts Q, E or R (cast sets `kWT = 0`).
- **E.** `root(self,duration)`; `kRT = duration`; `kHonour` = full plate. `incoming(src)`: while `kRT > 0`, multiply by `(10000 - reduceBp)`. If `src` is an enemy hero with `attackRange(src) <= meleeRange`, `slow(src,slowBp,slow)`.
- **R.** `addShield(lvl(shield))`, `haste`, `cleanse(w,id,immune)`, `cooldownRate(w,id,cdrBp,duration)` (`buff.ts:23`); `kWindow = duration`.
  - `afterDeal(m,id,dst,dmg,kind)`: if `kind === 'basic'` and `kWindow > 0`, every other enemy within `splash` of `dst` takes `dealDamage(idiv(dmg*splashBp,10000))` with kind `'ability'`.
  - Using `'ability'` for the splash stops recursion and keeps it out of the basic-attack count.
- New projectile kind `cap = 12` (see §3).

**Bot:**
- fight:
  - Q at the nearest visible enemy hero within 8.5 m (`aimed()`).
  - W when an enemy hero is 4–8 m away and none is within `BOT_AI.pixelBeamSafe (2500)`. Bot movement keeps facing its target, so the beam tracks it.
  - R when `foesNear(7000) >= 1` and HP is above `BOT_AI.pixelBoxbotHpBp (4000)`.
  - E when an enemy hero is within 2 m and HP is below `blinkOutHpBp`.
- clear: W into 3 or more minions on a line; Q at a siege minion.
- escape: E if she is being hit in melee, else walk `awayFrom()`.

**Chibi:**
- RigSpec: `tier 'kid', headScale 1.35, width 0.85, bodyScale 0.8`; `armoured {body:true, feet:true}`.
- Coat: tuxedo (`base 0x2a2a33, light 0xf4f4f4`); `eyes.size 1.3`.
- New gear `cardboardBox` (~300 tris: open box on the chest and hips bones, 4 flap quads on the spine; kraft `0xc49a6c`). The flaps and a tape stripe are team colour; make the flaps big enough for at least 15% at Low.
- `capCannon` cylinder on the weapon socket; antenna with a red bead on the head; brown stubby boots.
- HERO_HEIGHT 2.3. HERO_TOP must be measured; the head sits on top of the box, so the upright test passes.
- HERO_MOTION: idle `stand` (peek bob), run `stand` (short shuffle stride), cast `aim`, attack `shoot`.
- No rig code needed.

**Moves and VFX:**
- The fx `form` bit scales the box gear 1.25 and shows the arm tubes in R.
- Q: a spinning cap bolt (`projectileView` case `cap`, HERO_SHOTS).
- W: a beam mesh (MeshFxKind `beam`, length and width from `fx.abil`) in ice-cyan with a red dot at the end, shown from the fx `channel` bit and facing.
- E: the flaps clap shut with a frost-rim shell. R: a cardboard-confetti splash ring at `splash` radius on each basic.
- `ultName` 'BOXBOT!'. HERO_COLOR_CSS `#7fc8e8`.

### 2.3 Duchess (`duchess`, index 10)

**HeroData:** `src/data/heroes/duchess.ts`
```ts
/** Duchess, Mage (sim v11, original cat): a floating Persian whose hits stack Disdain into a Snub stun. */
import type { HeroData } from './types';

export const DUCHESS: HeroData = Object.freeze<HeroData>({
  id: 'duchess',
  name: 'Duchess',
  side: 'cat',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 10400, takenBp: 9600 },
  element: 'DARK',
  base: { hp: 480, hpPerLevel: 50, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5000, speed: 4800, armour: 16, armourPerLevel: 2 },
  /** Utter Disdain: her ability hits on a hero add 1 Disdain (4 s); at 3 the hero is Snubbed: stunned 0.75 s, 40 (+4/lvl); then 6 s immune. */
  passive: { stacks: 3, window: 120, stun: 23, dmg: 40, dmgPerLevel: 4, lockout: 180 },
  abilities: {
    /** Fluff Puff: slow fat 7.5 m shot, 1.4 m wide, pierces; 60 (+6/lvl, +15 a rank), slow 20% 1 s. */
    q: { cooldown: 210, range: 7500, width: 1400, speed: 9000, dmg: 60, dmgPerLevel: 6, slowBp: 2000, slow: 30 },
    /** Not Amused: 0.35 s wind-up, cone 5 m, 80°; 50 (+5/lvl, +12 a rank), slow 35% 1.5 s. */
    w: { cooldown: 300, windup: 11, range: 5000, arc: 910, dmg: 50, dmgPerLevel: 5, slowBp: 3500, slow: 45 },
    /** Cushion Glide: glide 4 m at 12 m/s, leaving a 2.2 m fluff cloud for 2.5 s that slows enemies 30%. */
    e: { cooldown: 390, dash: 4000, speed: 12000, radius: 2200, ttl: 75, every: 15, slowBp: 3000, slow: 18 },
    /** Royal Decree: 0.6 s wind-up; enemy heroes within 6 m take 110 (+11/lvl, +45 a rank), are slowed 40% 1.5 s and gain 2 Disdain; she gains a 120 (+12/lvl) shield for 3 s. */
    r: { cooldown: 1950, windup: 18, radius: 6000, dmg: 110, dmgPerLevel: 11, slowBp: 4000, slow: 45, stacks: 2, shield: 120, shieldPerLevel: 12, duration: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 45, cooldown: -100 } },
  talents: [
    [
      { id: 'double-fluff', name: 'Double Fluff', mods: { q: { width: 1900 } } },
      { id: 'grand-glare', name: 'Grand Glare', mods: { w: { arc: 1200 } } },
    ],
    [
      { id: 'cloud-nine', name: 'Cloud Nine', mods: { e: { ttl: 120 } } },
      { id: 'shedding-season', name: 'Shedding Season', mods: { e: { radius: 3000 } } },
    ],
    [
      { id: 'imperial-decree', name: 'Imperial Decree', mods: { r: { radius: 7500 } } },
      { id: 'utterly-unamused', name: 'Utterly Unamused', mods: { passive: { stun: 33 } } },
    ],
  ],
});
```

The R knockback from the proposal is replaced by "2 Disdain plus a slow". Meatball and Stilts already move dogs around, and a third displacement kit against only 2 dog heroes is the main chain-CC risk.

**heroText:**
- Title: "The Diva". Role: Mage.
- Blurb: "Floats about on her cushion. Three snubs and a dog can't move."
- Passive, Utter Disdain: "Ability hits add Disdain. At 3, the dog is Snubbed: stunned and hurt."
- Q, Fluff Puff: "A big slow fluffball that rolls through everyone."
- W, Not Amused: "Glare in a cone; they slow down."
- E, Cushion Glide: "Glide away and leave a cloud of shed fur."
- R, Royal Decree: "Everyone near her is hurt, slowed and nearly Snubbed."
- New icons: `fluffPuff`, `glare`, `cushion`, `decree`.

**Sim kit:** `src/sim/heroes/duchess.ts`. Header comment "Kit arrays: none of her own; Disdain lives on the victim in the new `mk*` arrays (effects/stack.ts)".
- `aim`: Q `Dir`. W `Dir` with windup `a.w.windup`. E `Dir`, mobility. R `Self` with windup `a.r.windup`.
- **New primitive 19, `stack`** (`src/sim/effects/stack.ts`, exported from `effects/index.ts`). New World arrays sized by `CAPS.heroes`: `mkStack: Uint8Array`, `mkT: Int16Array`, `mkLock: Int16Array`. Add them to `createWorld`, `hashedArrays` (`world.ts:575`) and `clearStatus`. API:
  - `addStack(w, victim, n, max, ttl): boolean`. Does nothing if `mkLock > 0`. Otherwise `mkStack = min(max, mkStack + n)` and refresh `mkT = ttl`. Returns true once the count reaches `max`.
  - `consumeStack(w, victim, lockout)`: sets the stack to 0 and `mkLock = lockout`.
  - `tickStatus` (`status.ts:94`) decrements `mkT` and `mkLock`; when `mkT` reaches 0 the stack resets.
  - Why it is new: kit `k*` arrays belong to the caster, so per-victim state has nowhere to live today.
  - Only cats can be Duchess's victims, and the cat team never holds two Duchesses. Keying by victim alone is still correct if that ever changes, because the stacks belong to the victim.
- **Passive.** In `afterDeal(kind !== 'basic')` on an enemy hero:
  - `if (addStack(…,1,stacks,window))`, call `consumeStack(lockout)` first, then `stun(e,stun)` and `dealDamage(lvl(dmg))`.
  - Consuming first means the bonus damage cannot re-enter (Splash's ordering rule).
  - Snub-lockout ticks count down even while she is dead.
- **Q.** `fireSkillshot({kind: PROJECTILE_KIND.fluff, flags: PFLAG.Pierce, effect: ON_HIT.Slow, effA: slowBp, effB: slow, radius: width>>1, …})`.
- **W.** After the wind-up: `collect` + `inCone(x,y,facing,range,arc,…)` (`cone.ts:8`), then `dealDamage` + `slow`.
- **E.** First `spawnBurst(w,team,id,x,y,radius,0,ttl,0,0,every,slowBp,slow)` (`zone.ts:56`) at the origin; if it returns -1 the cloud is skipped and the glide still happens. Then `dash(m,id,angle,dash,speed)`.
- **R.** After the wind-up: `inRing` + `collect` enemy heroes, `dealDamage` (the passive adds 1 stack through `afterDeal`), `slow`, then `addStack(e, stacks-1, …)` and check for a Snub. Finish with `addShield(self, lvl(shield), duration)`.
- **Snapshot:** the victim's `mkStack` (0–3) goes in the reserved u8 at entity offset 55, as EntitySnap `stacks?` (§3).
- New projectile kind `fluff = 13`.

**Bot:**
- fight:
  - Q at the enemy hero with the highest `mkStack`; ties go to the nearest, then the lowest id.
  - W when that hero is inside the cone.
  - R when `foesNear(6000) >= 2`, when an enemy is within `BOT_AI.duchessPeelRange (3000)`, or when a hero on 2 stacks is within 6 m.
  - E in a fight only to keep `BOT_AI.duchessSpacing (4500)` from a melee foe.
- clear: Q through the densest line; W at 3 or more minions.
- escape: E `awayFrom()`, then R if a foe is within 3 m and HP is below `blinkOutHpBp`.

**Chibi:**
- RigSpec: `width 1.15, bodyScale 1.05, headScale 1.15, earsLow 0.7, earSplay 0.2`, plume tailCurve over the back.
- `tail.thick 1.7, cheeks 1.15, face 0.75, eyes.size 1.15` (copper eyes), `ears.size 0.7, whiskers off`, `armoured.feet true`.
- Coat: solid cream (`0xf4ece0 / 0xd8c8b0 / 0xffffff`).
- New gear:
  - `fluffPuffs(A, n)`: 6–8 low-poly icosphere shells on chest, neck and hips, about 600 tris at Med and 300 at Low. It is a shared builder that later heroes can reuse.
  - `velvetCushion`: a rounded box (~200 tris) plus 4 tassels under the hips; its top is team colour.
  - `tiara`: a ring plus 3 gem cones.
  - A team-coloured mantle and a silver comb prop.
- HERO_HEIGHT 2.6.
- Flat face: fallback only (`face 0.75` plus a pushed-in nose); no per-hero FACE landmarks in this wave.
- HERO_MOTION: idle `sit`, run `sit` (the root bobs as the cushion floats), cast `groom`, attack `paw` (a "hmph" puff bolt).
- Budget check: she has the most gear, so measure Med triangles first.

**Moves and VFX:**
- Q: a fat fluffball bolt (`projectileView` case `fluff`).
- W: a purple glare cone sized from `arc` and `range`.
- E: a fur-cloud disc (burst zone look).
- R: a crown-shaped ring wave at `radius`.
- Snub: a "hmph" puff and stars over the victim.
- Overhead pips: 0–3 small crowns on the enemy plate (`overhead.ts`, the same pattern as Avietė's charge ring at `:101`).
- `ultName` 'Begone!'. HERO_COLOR_CSS `#8a5cd6`.

### 2.4 Stilts (`stilts`, index 11)

**HeroData:** `src/data/heroes/stilts.ts`
```ts
/** Stilts, Assassin (sim v11, original cat): a lanky Savannah who builds Stride by running and pounces. */
import type { HeroData } from './types';

export const STILTS: HeroData = Object.freeze<HeroData>({
  id: 'stilts',
  name: 'Stilts',
  side: 'cat',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 11800, takenBp: 9000 },
  element: 'SAND',
  base: { hp: 500, hpPerLevel: 52, attack: 56, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5300, armour: 18, armourPerLevel: 2 },
  /**
   * Long Stride: +10 Stride per metre walked (max 100); standing still 0.5 s drains 20. At 100 she pounces on her attack
   * target from up to 3 m: the basic deals +60% and slows 30% for 1 s, then Stride resets.
   */
  passive: { perMetre: 10, max: 100, drain: 20, drainEvery: 15, leap: 3000, bonusBp: 16000, slowBp: 3000, slow: 30 },
  abilities: {
    /** High Leap: leap up to 6 m (untargetable in the air); landing within 1.3 m of an enemy hero deals 80 (+7/lvl, +20 a rank) and fills Stride. */
    q: { cooldown: 300, dash: 6000, speed: 15000, touch: 1300, dmg: 80, dmgPerLevel: 7 },
    /** Ear Swivel: reveal enemy heroes within 8 m for 2 s; +30% attack speed for 3 s. */
    w: { cooldown: 420, radius: 8000, reveal: 60, attackSpeedBp: 3000, duration: 90 },
    /** Swat-Swat: two swats in a 2.8 m line 0.25 s apart, 45 (+4/lvl, +12 a rank) each; the second slows 30% 1 s and adds 30 Stride on a hero. */
    e: { cooldown: 210, range: 2800, width: 1100, gap: 8, dmg: 45, dmgPerLevel: 4, slowBp: 3000, slow: 30, stride: 30 },
    /** Zoomies: 5 s, +50% speed, Stride locked full, pounce reach 5 m; each pounce takes 1 s off High Leap. */
    r: { cooldown: 1800, duration: 150, hasteBp: 5000, leap: 5000, refund: 30 },
  },
  ranks: { q: { dmg: 20 }, w: { cooldown: -15 }, e: { dmg: 12 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'pounce-power', name: 'Pounce Power', mods: { passive: { bonusBp: 18000 } } },
      { id: 'quick-stride', name: 'Quick Stride', mods: { passive: { perMetre: 14 } } },
    ],
    [
      { id: 'big-ears', name: 'Big Ears', mods: { w: { radius: 11000 } } },
      { id: 'twitchy', name: 'Twitchy', mods: { w: { attackSpeedBp: 4500 } } },
    ],
    [
      { id: 'extra-zoomies', name: 'Extra Zoomies', mods: { r: { duration: 195 } } },
      { id: 'sky-high', name: 'Sky High', mods: { r: { leap: 6500 } } },
    ],
  ],
});
```

Changes from the proposal:
- **Ghost collision dropped.** It would mean a sim-wide movement change.
- **W cut down.** Radius 10 m to 8 m and reveal 3 s to 2 s, so the counter to Cacklejaw (one of only two dogs) is not hard.
- **Drain added**, taken from Tundra: standing still drains Stride.

**heroText:**
- Title: "The Zoomer". Role: Assassin.
- Blurb: "All legs and ears. Runs to build Stride, then pounces."
- Passive, Long Stride: "Walking fills Stride; at full, she pounces on her target."
- Q, High Leap: "A high leap; land on a dog to fill Stride."
- W, Ear Swivel: "Hear everything nearby: reveals hidden dogs and speeds up her swipes."
- E, Swat-Swat: "Two quick swats; the second slows."
- R, Zoomies: "Super speed and every attack is a pounce."
- New icons: `leap`, `ears`, `swat`, `zoomies`.

**Sim kit:** `src/sim/heroes/stilts.ts`, exporting `STILTS_INDEX = 11` (11 is not above 16, so no lint allow is needed). Header comment "Kit arrays: kValor Stride; kCount mm walked carry; kChain/kEmpower last x/y; kHuntT ticks standing still; kStage 1 pounce in flight, 2 High Leap landing; kWT second-swat timer; kWAge swat angle; kRT Zoomies ticks".
- `aim`: Q `Point`, reach `a.q.dash`, mobility. W `Self`. E `Dir`. R `Self`.
- **Passive, in `stepKit`:**
  - Distance walked: `d = isqrt(dist2(lastX,lastY,x,y))`, counted only when `fmKind === FM.None`. Accumulate `kCount += d`; while `kCount >= 100`, subtract 100 and add `idiv(perMetre,10)`. Use the integer carry for `perMetre` 14. Clamp at `max`.
  - Drain: when `d === 0`, `kHuntT++`; every `drainEvery` still ticks, subtract `drain`.
  - While `kRT > 0`, `kValor = max`.
  - Auto-pounce: when `kValor === max`, `w.target[id]` is a live enemy hero, `attackRange < d <= reach + attackRange` (reach is `passive.leap`, or `r.leap` during Zoomies), and she is not disabled or rooted: `dash(m,id,angleTo, d - attackRange + 200)` and `kStage = 1`.
  - Pounce: the `basic(m,id,dst,dmg)` hook. When `kValor === max` and `dst` is a hero, `dealDamage(idiv(dmg*bonusBp,10000), 'basic')`, `slow`, and set `kValor = 0` (unless `kRT > 0`) and `kStage = 0`. During Zoomies also `w.cooldowns[slot q] -= refund`, floored at 0. Return true.
- **Q.** `dash(m,id,angle,min(dist,dash),speed)`; `w.untargT[id] = max(…, travelTicks(dist,speed))` (the Tumble pattern at `clem.ts:95`); `kStage = 2`. On landing (`fmKind === FM.None` in `stepKit`): `inRing(touch)` against enemy heroes → `dealDamage` to the nearest (lowest id breaks ties), and `kValor = max`.
- **W.** `collect` enemy heroes in `inRing(radius)` → `reveal(w,e,reveal)` (`mark.ts:21`; no `breakStealth`). Then `attackSpeed(w,id,attackSpeedBp,duration)` (`buff.ts:19`).
- **E.** First swat immediately: `inLine` along the aim → `dealDamage`. Store `kWAge = angle`, `kWT = gap`. When `kWT` reaches 0, the second swat (re-anchored at her current position) does damage, `slow`, and `+stride` Stride if it hit a hero. Cancel it if she is disabled.
- **R.** `haste(w,id,hasteBp,duration)`; `kRT = duration`.
- **Snapshot:** `resource = kValor` for `STILTS_INDEX` (`src/sim/index.ts:360`, the same path as Clem's Valor). The fx `form` bit is set during Zoomies.

**Bot:**
- fight:
  - W first when an enemy hero is hidden within 8 m, or when committing.
  - Q onto an enemy hero within 6 m below `BOT_AI.stiltsCommitHpBp (5500)`, or to set up a pounce.
  - E when an enemy hero is in the 2.8 m line.
  - R when a foe below 50% is within 9 m and `allyNear`, or in a 1v1.
  - Otherwise orbit the target at `BOT_AI.stiltsOrbit (4500)` to build Stride, using an orbit move with the seeded side. Watch the idle and parked gates.
- clear: E only.
- escape: Q to an `awayFrom()` point (untargetable in the air), then R if HP is below `blinkOutHpBp`.

**Chibi:** fallback only; no rig code in this wave.
- RigSpec: `width 0.78, bodyScale 0.9, headScale 0.9, tier 'lite', earsLow 0`. `ears.size 1.6` with gear cone tufts on `earL`/`earR`.
- Long low tailCurve, `tail.thick 0.7`.
- Coat: spots with high `spotFreq` (`base 0xd9a66b, deep 0x3a2a1c, light 0xf2dcbc, cream 0xfaf0e0`); amber-green eyes.
- Gear: a team-coloured trailing scarf (cape-style, carries the team read), team-coloured `legWarmers` (new tube builder on the shins that makes the legs look longer), a bell collar.
- HERO_HEIGHT 2.95 (the tallest).
- HERO_MOTION: idle `ready`, run `stand` with a long bounding stride, cast `boop`, attack `claw`.
- Real per-hero leg and neck length (RigSpec `legLen`/`neckLen` through `layout()`, `restPose()` and the IK) is a later polish item.

**Moves and VFX:**
- Q: a high arc leap with a ground shadow, and a dust ring on landing at `touch`.
- Pounce: a short arc clip plus claw streaks.
- W: ear swivel plus a sonar ring at `radius`.
- E: two quick claw arcs.
- R: speed lines and paw-print afterimages.
- Stride meter: a HUD bar from `resource`, the same as Clem's Valor.
- `heroAccentRaw` must return terracotta `0xd9734a`; the SAND colour `0xe8c27a` is gold-family and would fail `combat-vfx.test`.
- `ultName` 'Zoomies!'. HERO_COLOR_CSS `#c9874a`.

---

## 3. Shared changes

**HeroId and HERO_IDS (append only).**
- `HeroId` gains `'meatball' | 'pixel' | 'duchess' | 'stilts'` at the end.
- `HERO_IDS` becomes `[..., 'gabe', 'meatball', 'pixel', 'duchess', 'stilts']`, so the new indices are 8, 9, 10 and 11.
- Append in the same order in: `KITS` (`kit.ts:84`), `PawlegendsHeroId` (`tools/vendor-sim.mjs:170`), `PAWLEGENDS_HEROES` (`client/components/pawlegends/bridge.ts:57`), and the tool lists (`headless-match.mjs:108,110`, `grade-calibrate.mjs:23`, `lib/fuzz-entry.ts:12`, `anim/capture.mjs:38`).

**Element.**
- `types.ts:6` gains `'ICE' | 'GRASS'`.
- `ELEMENT_COLOR` already has every key, and the backend and client `CatAbilityType` already include ICE and GRASS, so nothing changes there.
- Add ICE and GRASS to `director.ts:1026` `ELEMENT_TRAIL`; today they fall back to white.

**BRANCH_TALENT.** `null` for all four, so `gaps-b6` `BRANCH_HEROES` stays `['sage','brutus']`.

**Sim engine additions:**
1. **`effects/stack.ts`** (primitive 19): `addStack` and `consumeStack`, ticked in `tickStatus` and cleared in `clearStatus`. New World arrays `mkStack` (Uint8), `mkT` and `mkLock` (Int16), each `CAPS.heroes` long, added to `hashedArrays` (`world.test` enforces this).
2. **`PROJECTILE_KIND`** (`data/towers.ts:37`): append `cap: 12, fluff: 13`, and append `Kind.Hero, Kind.Hero` to `SRC_KIND` (`combat/projectile.ts:28`). Both kinds count as ability damage because they are above `hero`.
3. **Snapshot** (`src/sim/index.ts:358-366`, `api.ts:190-210`, `host/protocol.ts:108-115,186-196,248-262`):
   - fx bit 4 `form`: Meatball rolling or Chonk, Pixel Boxbot, Stilts Zoomies.
   - fx bit 8 `channel`: Pixel's beam.
   - Reserved u8 at entity offset 55: `stacks` (Disdain on the victim).
   - `resource`: Stilts `kValor`.
   - Update the protocol layout comment; `protocol.test` checks the round trip.
4. **Bots.**
   - In `casts.ts`, add explicit `case` lines for all four heroes to `fightCast` (`:116`), `clearCast` (`:212`) and `escapeCast` (`:290`). Each delegates to `src/sim/bots/heroes/<id>.ts`.
   - Make each `default:` a no-op and move Gabė's logic into an explicit `case 'gabe'`. This is a deliberate fix of the silent fallback, so call it out in the commit.
   - Add BOT_AI keys in `data/bots.ts`: `meatballLoafFoes 2, meatballPeelRange 3000, pixelBeamSafe 2500, pixelBoxbotHpBp 4000, duchessPeelRange 3000, duchessSpacing 4500, stiltsCommitHpBp 5500, stiltsOrbit 4500`.

**Hard caps.**
- Hero byte 11 < 0x80; `w.sub` is Uint8.
- No index constant is above 16, so no `lint-sim: allow` is needed.
- Zones: Duchess adds 1 at a time (cap 24). Projectiles: about 2 more (cap 48).
- `HERO_CACHE_MAX` 32 → 48 (`render/chars/index.ts:41`).
- Pick grid (`champions.css:3`): 10 cats. Use `repeat(5,1fr)` over 2 rows, and recheck the 844×390 landscape screens (no-zoom, hud-compact, match-touch) and `ui.css:885-886`.

**SIM_VERSION and the dual-version verifier.**
- `src/sim/version.ts` goes 10 → 11. `fillPicks` (`src/sim/index.ts:97-120`) draws cat bots from a pool of 10 now, so every cat-side replay changes.
- In `tools/vendor-sim.mjs` FROZEN (`:57-64`), add `{ simVersion: 10, commit: <commit holding backend/src/vendor/pawlegends-sim/v10>, from: 'backend/src/vendor/pawlegends-sim/v10', bundle: <sha256 from v10/pawlegends-sim.sha256.json> }` and retire v9.
- `npm run vendor-sim` regenerates `backend/src/vendor/pawlegends-sim/v11/*` and the `index.ts` dispatcher (`SIM_VERSIONS = [10, 11]`). Run `vendor-sim:check`.
- `CHAMPION_FIXTURE_HERO` stays `'gabe'`/909. The rookie, champion and forfeit fixtures are regenerated.
- In `backend/src/pawlegends/pawlegends-live.spec.ts:203-205,220-225,513-528`, change `SIM_VERSION 10 → 11` and `[9,10] → [10,11]`. `PAWLEGENDS_MUTATOR_SINCE` stays 10.
- Deploy the backend before the game (`vendor-sim:check-remote`).
- Scores still save only through `POST /user/catbassadors/live`; no new write path.

**Meta (none of the four are champions):**
- `quests.ts`: 4 `win_<id>` quests, so the pool goes 17 → 21 and the rotation is 12 days.
- `treats.ts`:
  - `NAME` entries for the four.
  - `TRACK_ORIGINALS` gains the 4, with 3 coats each appended after reward 30 (total 42).
  - Each coat gets a `FREE_COATS` palette in `cosmetics.ts:134`.
  - Each original also adds 8 loop coats; confirm the total stays under `UNLOCKS_MAX = 160`.
- `CAT_HEROES` gains the 4. `SHELTER_HEROES` is unchanged.
- `grade.ts`: no new role; the tank, marksman, mage and assassin fits shift, so rerun `grade-calibrate --check`.

**Tests to add or update:**
- New per hero: `tests/unit/heroes/<id>.test.ts` (template `gabe.test.ts` plus `kit-helpers`) and `tests/unit/anim-<id>.test.ts` (template `anim-gabe`).
- New shared:
  - `tests/unit/stack.test.ts`: cap, ttl, lockout, hashed, cleared on death.
  - A snapshot round trip for `form`, `channel` and `stacks`.
- Update:
  - `picks.test.ts:6,17,28` (cat list and seen set).
  - `bots.test.ts:44-66`: the 4 new heroes cast Q, W, E and R.
  - `sim-v10.test.ts:27,91,98`, `round2.test.ts:34`, `sim-v7.test.ts:23`: the `SIM_VERSION` literal becomes 11; add a `sim-v11.test.ts` for the new primitives.
  - `determinism.test.ts:148` plus `fuzz-entry.ts:35`: draw the hero deterministically as `seed % HERO_IDS.length` so 24 seeds cover all 12.
  - `skins-chars.test.ts:158`: 192 → 288, plus 96 new keys in `tests/fixtures/skins/golden-looks.json`.
  - `anim/timing.contract.test.ts:19`: periods, dash and windup for the 4.
  - `combat-vfx.test.ts:152`: add `meatball` and `stilts` to the melee list.
  - `grade.test.ts:55`.
  - `gaps-wave-a.test.ts:72-83,195-203`: reward count 42, pool 21, a 12-day window.
  - `champions-final`/`wave-c` equivalents for readable numbers.
- Loop-based tests (chars, team-read, readability, springs, registry, wave-c) cover the new heroes automatically once the data is valid.

**heroText numbers.** `reachAndTimer`/`dmgOf` (`heroText.ts:255`) read only known keys. Add `leap`, `push`, `charm` and `splash` so the new numbers appear in the UI.

**Docs:**
- POC.md §6.8c addendum: v11 roster, kits, the `stack` primitive, projectile kinds 12–13, snapshot bits, balance retune.
- GDD hero table, `docs/GAMES.md` (roster, quest count), `docs/DEVELOPMENT.md:244-247` (mirrors), `pawlegends/README.md`, ANIM-SPEC §14 briefs.

---

## 4. Implementation order and file ownership

**Phase 0: integration agent scaffolds alone, one commit.** The goal is that per-hero agents never touch a shared file.
- Append the ids to `types.ts`, `index.ts` (`HERO_IDS`, `HEROES`, `BRANCH_TALENT`), `kit.ts` `KITS`, and the Element union.
- In every shared table, add an entry for each hero that imports from the hero's own new module:
  - `casts.ts` cases → `src/sim/bots/heroes/<id>.ts`
  - `specs.ts` heroBase case, HERO_MOTION, HERO_HEIGHT, HERO_TOP → `src/render/chars/heroes/<id>.ts` (export `extras`, `TEAM` and the gear helpers that need it)
  - `HERO_TEXT` → `src/ui/heroText/<id>.ts`
  - icons `P` spread from `src/ui/icons/<id>.ts`
  - `heroAims` → `src/input/aims/<id>.ts`
  - `HERO_SPRINGS`, `HERO_SCALE`/`HERO_RING`, `HERO_COLOR_CSS`, `ultName`/`heroAccentRaw` → constants exported by the hero render module
  - `HERO_ANIM` → `moves/<id>`, `skillfx/<id>`
- Create every per-hero module as a compiling stub: `stubMoves`, `stubFx`, a placeholder kit returning cooldown 0.
- Add the `stack` primitive and World arrays, `PROJECTILE_KIND` 12–13 with their `SRC_KIND` entries, the snapshot bits, the BOT_AI keys and the casts.ts `default` no-op change.
- Add the gear builders `fluffPuffs`, `cardboardBox`, `fishLunchbox`, `legWarmers` and `tiara` in `gear.ts` as stubs; each hero agent then fills its own builder in its own module (see the next phase).
- Exit gate: typecheck green and `lint:sim` green.

**Phase 1: four hero agents in parallel.** Each owns only these files:
- `src/data/heroes/<id>.ts`
- `src/sim/heroes/<id>.ts`
- `src/sim/bots/heroes/<id>.ts`
- `src/render/chars/heroes/<id>.ts`, including its own gear builders, so `gear.ts` stays untouched after Phase 0
- `src/render/moves/<id>.ts`
- `src/render/skillfx/<id>.ts`
- `src/ui/heroText/<id>.ts`
- `src/ui/icons/<id>.ts`
- `src/input/aims/<id>.ts`
- `tests/unit/heroes/<id>.test.ts`
- `tests/unit/anim-<id>.test.ts`

Agents must not edit shared files; they ask the integration agent for changes there.

**Phase 2: integration agent.**
- `version.ts` → 11; vendor-sim FROZEN; `npm run vendor-sim`; backend specs and fixtures.
- Pinned test lists, golden looks, treats, quests, cosmetics, `CAT_HEROES`, `HERO_CACHE_MAX`, `champions.css`.
- `heroText` number keys; the client bridge mirror; the tool hero lists.
- Docs.

**Phase 3: tuning loop (integration agent; hero agents adjust only their own data file).**
- Balance gates, Easy and Rookie in `data/bots.ts`, `pvp` numbers, grade calibration.

**Phase 4: release.** Build, budget, e2e, `npm run build:client`, and commit `client/public/pawlegends-game`.

**Bundle risk.** About 16 KB of first-load gzip is left. The data, kit, bot, spec, text, icons and aims of 4 heroes are expected to take about 3–4 KB each. Measure after Phase 1. If over budget, move the heroText blurbs and talent lines into the lazy hero chunk first.

---

## 5. Acceptance gates

Run from `pawlegends/` unless noted.

**Static checks:**
1. `npx tsc --noEmit`: exit 0.
2. `npm run lint:sim`: ok (no floats, no `/`, integer data only).

**Tests:**
3. `npx vitest run --project unit`: green, except the two existing `tools/trailer` copy-gate failures (typescript ^7 does not export the API they need), which predate this work.
4. `npm run determinism -- --seeds 1000`: 0 mismatches. `world.test` confirms every new array is hashed.
5. `node tools/vendor-sim.mjs --check` shows v10 (frozen) and v11. In `backend/`, `npx jest src/pawlegends` is green.

**Balance:**
6. `npm run match -- --seeds 200 --profile normal --difficulty normal --hero random --balance --quiet` while iterating, then `npm run match -- --gate balance` (2,000 seeds). Thresholds:
   - Length: median 6:00–8:00, p95 at most 8:30, no safety ends, at least 70% core kills before Sudden Death.
   - Sides and heroes: side 45–55%, every hero including brutus and cacklejaw 46–54%, cat species 47–53%.
   - Pace: 2.5–3.5 takedowns per minute. A team trailing at 3:30 wins 20–40%; a team 10+ takedowns down wins under 5%.
   - Tricks 47–53% each.
   - Also report each new cat's win rate on its own.
7. Gates `fun1`, `fun2`, `novice` (at least 85% against Easy, 40–60% against Normal), `idle` (at most 50%; watch the Stilts orbit), `parked`, `feeder` (watch the Pixel channel), `hard` (30–48%).
8. `node tools/grade-calibrate.mjs --seeds 400 --from 1001 --check`: every role within ±5 points.
9. `perf-sim.test.ts`: a Normal match median at most 1.0 s, worst case at 11:00 at most 1.5 s.

**Render and browser:**
10. Render tests:
    - `chars.test`: Med at most 6,000 triangles, Low below Med, one SkinnedMesh, 28 bones, upright. Duchess and Pixel are the ones to watch.
    - `team-read.test`: at least 15% team colour, other team under 3%.
    - `readability.test`: HERO_TOP within 4%.
    - `combat-vfx.test`: no gold-family colour (Stilts terracotta override).
    - `springs.test`.
11. `npm run build && npm run budget`: first-load JS at most 450 KB gzip; total output at most 10 MB.
12. `npx playwright test`, including `tests/e2e/champions.spec.ts` (still 4 champions, and the new cats have no champion badge), plus the landscape 844×390 no-zoom, hud-compact and match-touch specs with the 2-row cat grid.

**Visual check:**
13. Gallery screenshots for each new cat, both teams, Low and Med: idle, Q, W, E, R, death, and the alt states (Meatball ball and Chonk, Pixel Boxbot and beam, Duchess Disdain pips on a dog, Stilts Stride meter and Zoomies). Capture them with `tools/anim/capture.mjs` after adding the ids there, and check them by eye.

**Release:**
14. `npm run build:client`; commit `client/public/pawlegends-game` and the backend vendor folder; deploy the backend first.
---

## 6. As built (Phases 1 and 2, 2026-10-31)

Where the build departs from §2 and §3, the code wins; this list says why.

**Meatball**
- HeroData `e` gained `gap: 300`: Big Brother stops this far short of touching the ally (lint:sim refuses the literal).
- A Q or E cast does not end Loaf Mode: `canCast` refuses mobility casts while rooted, so only R (it cleanses) breaks a loaf. Kept as is: the loaf is a commitment.
- BOT_AI gained `meatballChonkRange 5000`, `meatballChaseHpBp 3500` and `meatballChaseRange 4000` for the §2.1 R rule.

**Pixel**
- RigSpec `tier 'kid', headScale 1.15, bodyScale 1.0` (not 1.35 / 0.8): the spec numbers put the neck only 0.19 H above the hips, and the upright test needs 0.25 H. HERO_TOP 2.5, measured.
- BOXBOT's bigger box is the whole character scaled 1.25 by the R clips (one skinned mesh, so gear cannot be shown or hidden; no arm tubes).
- The W self-slow is refreshed each tick, so it ends with the beam.
- `cardboardBox` lives in her chibi module; the gear.ts stub is gone.
- BOT_AI gained `pixelBeamMin 4000` (the 4–8 m beam window) and `pixelBoxbotRange 7000`.

**Duchess**
- Motion idle and run `stand`, not `sit`: the upright test fails in `sit`, and the pose library has no floating sit. The cushion is worn at shin height and hides the legs; the idle bobs her up. A `float` pose is a later polish item.
- `fluffPuffs` moved into `gear.ts` as the shared builder; `velvetCushion`, `tiara` and `comb` stay in her module.
- The overhead draws Disdain as 0–3 purple crowns under any hero's bar (`disdainPips` in `src/ui/overhead.ts`).

**Stilts**
- HERO_HEIGHT 3.2 (not 2.95) and TOP 3.23: at 2.95 her ear tips were only level with Clem's bow, so she did not read as the tallest cat.
- `STILTS_RULES = {metre: 1000, stepBp: 15000, overshoot: 200}` in her data file holds engine numbers lint:sim would refuse inline. A one-tick move longer than 1.5× her move speed is not walking (Nap's trip home, blinks, dash landings and respawn never fill Stride).
- The overhead draws Stride as a thin meter under her own plate (`strideMeter`; `resource` reaches her own team only).
- BOT_AI gained `stiltsZoomiesHpBp 5000` and `stiltsZoomiesRange 9000` for the §2.4 R rule.

**Shared**
- `dash(m, id, angle, dist, speed)` types `speed` as `number`, so Duchess's glide and Stilts's leap use it directly. `slotTimingFrom` gives a dash slot its own `dashSpeed` (the slot's `speed`, else 20 m/s) and no projectile speed; Stilts Q is aim-clamped like Lambo's E. The director and the gallery scenarios time a dash at that speed.
- heroText reads `splash` as reach, `push` as "push N m" and `charm` as a timer; talent cards show `push`, `splash`, `touch` in metres, `ttl` in seconds and `arc` in degrees (the arc change also covers Avietė's and Cacklejaw's arc talents).
- The pick grid uses 5 columns; at heights up to 520 px the tiles shrink (22 px icons) so three rows still leave the Paw Trick chips above the fold. The champions, no-zoom, hud-compact and match-touch Playwright specs pass with the 2-row cat grid.
- `vendor-sim` freezes v10 at 18cbcf31 with its forfeit fixture (`extra` in FROZEN) and retires v9.

**Reported, not fixed here**
- Nap (`units/hero.ts`, `toSpawn` when the channel ends) teleports a hero home without the kit's `reset` hook. Stilts guards against it in her kit; any kit that tracks a last position would see a jump.
- The touch Attack button treats only Sage as ranged (decision 3 above).
