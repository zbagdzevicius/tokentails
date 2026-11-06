# Pawlegends sim v13 build spec: five new dogs and the Cats / Dogs switch

**The five:** Nugget (corgi, support), Marshmallow (Samoyed puppy, mage), Bravo (pug, tank), Chili (chihuahua,
marksman) and Boomer (husky, fighter). Nugget and Marshmallow are the cute ones. Bravo, Chili and Boomer are the
funny ones: a pug who fakes his own death, a tiny dog who turns huge when angry, and a husky who screams. With them
the dogs go from 2 heroes to 7 (the cats have 10). Every dog role is covered, so a dog team never has to field the
same hero twice (GAPS N4). The pick screen gets a **CATS / DOGS** switch: the player picks a side, then a hero from
that side.

None of the five is a Pink Paw shelter champion: no catalogId, no row in `shelter.ts` or in the backend champions
list. Like the v11 cats, they are originals.

Written against `c49733c2` (branch `feat/pawlegends-dogs`), read-only apart from this file. I checked it against the
HeroData shape (`src/data/heroes/types.ts`), the effect primitives (`src/sim/effects/*`), the HeroKit hooks
(`src/sim/heroes/kit.ts`), the World `k*` arrays, `PROJECTILE_KIND` / `SRC_KIND`, `ZONE_KIND`, `fillPicks`
(`src/sim/index.ts:96`), the pick screen (`src/ui/screens.ts:300-410`, `champions.css`), side swap
(`src/render/palette.ts:41-84`, `gameView.ts:551`, `matchSession.ts:470`), `tools/vendor-sim.mjs` FROZEN, and the
v11 and v12 build docs (`CATS-V11.md`, `pawlegends/docs/FUN-PROGRESSION-V12.md`).

**Decisions for the user.** Each has a default; the build goes ahead with the default unless the user says otherwise.

1. **Lord Barkus.** The request asks for 2–3 cute dogs and 2–3 funny ones, so five slots leave no room for
   Barkus, a serious boss character. Default: he waits for the next dog wave (v14), together with Pilfer and a
   sausage dog (Longfellow, GDD §heroes). GAPS N4 is still closed, because 7 dogs end the forced mirror. Swap
   option: Barkus replaces Boomer as the fighter, keeping Boomer's scream as a Barkus skin moment.
2. **Meme names.** No real meme names and no trademarked dogs: no "Doge" or "Cheems" (CLAIMS R9 and GDD Kibo) and
   no famous internet pets. Each joke is a generic behaviour (fake death, small-dog rage, husky screaming, the
   corgi sploot), never a copied clip. Default: the five names below.
3. **Species edge.** Brutus and Cacklejaw deal 111% and take 93.5% (`pvp`) because two kits carried the whole dog
   side. Default: the new dogs start at about 10500 / 9400 and Phase 3 re-tunes all 17 heroes. The edge on the two
   old dogs probably comes down.
4. **Switch default for a first-time player.** Default: **Cats** (match 1 stays Clem, the guided hero), with the
   Dogs tab one tap away. The switch is visible from match 1.
5. **Branches.** All five get `BRANCH_TALENT: null` ("Branch coming soon"), as the v11 cats did.

---

## 0. Roster after v13

| HERO_IDS index | id | Name | Breed | Role | Element | Vibe | Difficulty |
|---|---|---|---|---|---|---|---|
| 2 | `brutus` | Sir Brutus | pug knight | tank | SAND | (exists) | easy |
| 3 | `cacklejaw` | Cacklejaw | hyena | assassin | DARK | (exists) | medium |
| **12** | `nugget` | Nugget | Pembroke corgi | **support** | FAIRY | cute | easy |
| **13** | `marshmallow` | Marshmallow | Samoyed puppy | **mage** | ICE | cute | medium |
| **14** | `bravo` | Bravo | pug (theatre) | tank | STELLAR | viral | easy |
| **15** | `chili` | Chili | chihuahua | **marksman** | ELECTRIC | viral | medium |
| **16** | `boomer` | Boomer | Siberian husky | **fighter** | WIND | viral | medium |

The dogs before v13 covered only tank and assassin; they now cover all six roles (tank × 2). Every element is one
the `Element` union already has, so `types.ts` gets no new element and `ELEMENT_COLOR`, `ELEMENT_TRAIL` and the
backend `CatAbilityType` stay as they are.

**Silhouettes at game-camera scale** (each must read in one glance among the 17):

| Hero | Shape | Read |
|---|---|---|
| Nugget | a long low loaf on stubby legs, huge upright ears, a heart-shaped fluffy bum | "the low one" |
| Marshmallow | a near-perfect white sphere with a smiling face and a curled plume tail | "the white ball" (Meatball is orange and tabby; Duchess floats on a cushion, cream, flat-faced) |
| Bravo | a small fawn pug in a big velvet cape and a ruff collar, holding a rose | "the cape" (Brutus is armour and a tower shield) |
| Chili | the smallest hero in the game, enormous ears, bug eyes, a team-coloured knit sweater; in R he is the biggest | "the tiny one" |
| Boomer | tall and lean, grey and white mask, ice-blue eyes, mouth always half open | "the screamer" |

---

## 1. Per-dog specs

Units: mm, mm/s, ticks at 30 Hz, bp (10000 = 1.0), arcs in 1/4096 of a turn (1024 = 90°, 853 ≈ 75°, 796 ≈ 70°).
Every gameplay number lives in `src/data/heroes/<id>.ts` and the kit reads it by name through `abil(w, id)`.
Primitive paths below are under `src/sim/effects/`. Ranks: Q/W/E rank up at levels 2, 5 and 8; R ranks up at 7
and 10 (`growth.ts`).

### 1.1 Nugget (`nugget`, index 12): cute support

**Fantasy:** "A loaf with legs who herds the whole team. Throws a frisbee, splooting heals."

**HeroData** `src/data/heroes/nugget.ts`:
```ts
/** Nugget, Support (sim v13, original dog): a corgi who herds foes, rushes to friends and heals by splooting. */
import type { HeroData } from './types';

export const NUGGET: HeroData = Object.freeze<HeroData>({
  id: 'nugget',
  name: 'Nugget',
  side: 'dog',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Starting point; tune on the 2,000-seed gate. */
  pvp: { dmgBp: 10000, takenBp: 9500 },
  element: 'FAIRY',
  base: { hp: 540, hpPerLevel: 56, attack: 50, attackPerLevel: 5, attackEvery: 29, range: 4800, speed: 4900, armour: 20, armourPerLevel: 2 },
  /** Treat Pouch: every 8 s his next basic on an enemy hero tosses a treat to the lowest-HP-share allied hero within 6 m (him too): heals 30 (+5/lvl). */
  passive: { every: 240, heal: 30, healPerLevel: 5, range: 6000 },
  abilities: {
    /** Frisbee: 8 m disc that pierces enemies, 55 (+5/lvl, +15 a rank), slow 20% for 1 s. */
    q: { cooldown: 210, range: 8000, width: 900, speed: 15000, dmg: 55, dmgPerLevel: 5, slowBp: 2000, slow: 30 },
    /** Best Friend: dash to the allied hero nearest the aim (6 m); shield them 70 (+14/lvl) for 3 s and both get +20% speed for 1.5 s. No ally: dash 3.5 m, half the shield on himself. */
    w: { cooldown: 390, range: 6000, pickRadius: 2500, gap: 300, soloDash: 3500, shield: 70, shieldPerLevel: 14, duration: 90, hasteBp: 2000, haste: 45 },
    /** Sploot: 1.5 s flat on his belly: rooted, 40% less damage; allied heroes within 3.5 m (him too) heal 60 (+8/lvl, +15 a rank) over the sploot. */
    e: { cooldown: 450, duration: 45, reduceBp: 4000, radius: 3500, heal: 60, healPerLevel: 8 },
    /** Herding Time: 0.5 s wind-up; enemy heroes within 6 m are herded up to 2.5 m toward the aim point, take 80 (+8/lvl, +35 a rank) and are slowed 30% for 1.5 s; allied heroes in the ring get +25% speed for 3 s. */
    r: { cooldown: 2100, windup: 15, radius: 6000, push: 2500, dmg: 80, dmgPerLevel: 8, slowBp: 3000, slow: 45, allyHasteBp: 2500, allyHaste: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { heal: 15 }, r: { dmg: 35, cooldown: -100 } },
  talents: [
    [
      { id: 'long-throw', name: 'Long Throw', mods: { q: { range: 9500 } } },
      { id: 'big-pouch', name: 'Big Pouch', mods: { passive: { heal: 45 } } },
    ],
    [
      { id: 'very-good-boy', name: 'Very Good Boy', mods: { w: { shield: 100 } } },
      { id: 'long-sploot', name: 'Long Sploot', mods: { e: { duration: 60, heal: 80 } } },
    ],
    [
      { id: 'border-collie-energy', name: 'Herding Pro', mods: { r: { push: 3500 } } },
      { id: 'zoomie-squad', name: 'Zoomie Squad', mods: { r: { allyHasteBp: 4000 } } },
    ],
  ],
});
```

**heroText** (`src/ui/heroText/nugget.ts`): title "Nugget", role Support, side Dog. Blurb: "A loaf with legs.
Herds cats, rushes to friends and heals by splooting."
- Passive, Treat Pouch: "Every few seconds his next hit tosses a treat to the most hurt friend."
- Q, Frisbee: "Throw a frisbee that flies through every cat in its path."
- W, Best Friend: "Run to a friend and shield you both, with a burst of speed."
- E, Sploot: "Flop flat: tougher, and nearby friends heal."
- R, Herding Time: "Herd every cat nearby into one spot, then speed your team in."
- New icons: `frisbee`, `bestfriend`, `sploot`, `herd`.

**Sim kit** `src/sim/heroes/nugget.ts`. Kit arrays: `kValor` Treat Pouch ready (0/1), `kHuntT` pouch timer, `kRT`
sploot ticks, `kStage` 1 = Best Friend landing pending, `kFoe` the ally.
- `aim`: Q `Aim.Dir`. W `Aim.Point` with reach 0, mobility (the cast picks the ally, as `gabe.ts` W and
  `meatball.ts` E do). E `Aim.Self`. R `Aim.Point`, reach `r.radius`, windup `r.windup`.
- **Passive.** `stepKit` counts `kHuntT` down to 0, then sets `kValor = 1`. `afterBasic(m, id, dst)`: if `kValor`
  is set and `dst` is an enemy hero, call `weakestAlly(w, id, range)` (`gabe.ts:36`), then `heal` and
  `creditHealShield` (`heal.ts`), then `kValor = 0` and `kHuntT = every`. `resource()` returns 255 when ready
  (a pouch pip on his own plate).
- **Q.** `fireSkillshot` (`projectile.ts:48`) with `PFLAG.Pierce`, new `PROJECTILE_KIND.frisbee` (14) and
  `ON_HIT` slow, the way Duchess's Fluff Puff does it.
- **W.** A copy of Meatball's Big Brother (`meatball.ts:49 bigBrother`, `:75 guardLand`): pick the ally with
  `wrapTarget` (`gabe.ts:48`), dash to `dist − radii − gap`, set `kStage = 1`, and on landing call `addShield` on the
  ally plus `haste` on both. With no ally, dash `soloDash` along the aim and shield himself for half. It never
  fizzles.
- **E.** `root(w, id, duration)`, `kRT = duration`; `incoming()` applies `reduceBp` while `kRT > 0`; and
  `healOverTime(w, a, heal, duration)` (`heal.ts:19`) on each allied hero within `radius` at cast. Snapshot
  `SNAP_FX.Form` while `kRT > 0` (the sploot pose).
- **R.** For each enemy hero within `radius` (`collect` + `inRing`), the herd point is the aim clamped to the ring.
  Call `knockback(m, e, 2·ex − px, 2·ey − py, min(push, dist(e, aim)), facing)` (`knockback.ts:12`). Knocking back
  from the mirror point moves the hero toward the aim and stops it there. Then `dealDamage` and `slow`. Allies in
  the ring get `haste`.
- No new primitive and no new World array.

**Bot** (`src/sim/bots/heroes/nugget.ts`):
- fight: Q on a foe in the 8 m line (`aimed`); W toward `hurtAlly()` when a foe is within
  `BOT_AI.nuggetPeelRange (3000)` of that ally; E when 2+ allied heroes are within 3.5 m and one is under 70%, or
  when he is focused and below 50%; R when 2+ foes are in 6 m, aimed at the nearest allied hero (herd them into the
  team), or at his own tower when he is losing the fight.
- clear: Q through 3+ minions.
- escape: W to the ally farthest from the threat, else E only if no foe is in melee.
- New BOT_AI keys: `nuggetPeelRange 3000`, `nuggetSplootHpBp 7000`, `nuggetHerdFoes 2`.

**Render** (`src/render/chars/heroes/nugget.ts`):
- RigSpec `width 1.25, bodyScale 1.15, headScale 1.05, tier 'hero', earsLow 0`, short legs (`legScale 0.7` if the
  rig supports it, else the HERO_MOTION crouch stride). HERO_HEIGHT 2.3; HERO_RING 2.1.
- Coat: `pattern 'points'` red-and-white Pembroke (`base 0xe08a3c, deep 0xb8642a, light 0xfbe9d2, cream 0xffffff`),
  with a white blaze, chest and socks.
- Head (own builder `corgiHead` in the module): a fox-like wedge skull, a white muzzle, two **huge upright
  triangular ears** (cone geometry on the ear bones, about 1.6× a cat ear, pink inner), round dark eyes with
  catchlights, and a tongue tip out.
- Tail: hidden. Add a **heart-shaped fluffy bum** (two fur spheres on the hips bone, cream), so the bum reads from
  behind: the corgi meme.
- Gear: team-coloured bandana (cape + mantle for the team read), a treat pouch on the hip (team-coloured flap),
  and a frisbee held in the mouth in idle (prop on the head bone, team-coloured, hidden in the Q clip).
- HERO_MOTION: idle `sit`, run `stand` with a fast short "zoomie" stride (`stride 1.4`), cast `cheer`, attack a
  bark recoil.
- HERO_COLOR_CSS `#e08a3c`.

**Moves and VFX:**
- Q: a spin-throw; the disc spins with a team-coloured rim and a tiny paw print.
- W: dust puffs plus a heart pop over both heroes.
- E **Sploot**: legs straight out behind, belly flat, a happy wiggle. Green heal sparkles in a 3.5 m ring.
- R: three ghost corgis run a lasso circle round the ring (render only), then the herded cats skid toward the
  point, with a whistle sound.
- `ultName` 'Herding Time!'.

**Viral moment:** the **Sploot**. A frame-perfect corgi sploot with a bum wiggle, which looks great as a
screenshot. The results screen win pose is also a sploot.

**Voice / emote:** sfx are zzfx defs (no recorded voice): `nuggetBork` (a short high double bark on Q and R),
`nuggetSplootSqueak` on E. Emote (T key, owned Starter): a butt wiggle facing away from the camera.

**Balance target:** 46–54% on the 2,000-seed gate. Watch out: the R herd onto a tower dive and the E heal stack with
Wing Wrap-style shields. Easy and Rookie bots should not chain R into a tower.

**Skins hook:** Treat Track coats `coat.nugget.tricolour` (black, tan and white), `coat.nugget.fluffy` (long-coat
cream), `coat.nugget.bread` (all toast brown: "the loaf"). `FREE_COATS` palettes recolour `base/deep/light`; the
bum, bandana and frisbee follow the team colour.

---

### 1.2 Marshmallow (`marshmallow`, index 13): cute mage

**Fantasy:** "A Samoyed puppy who is mostly fluff and smile. Everything she throws is snow, and too much snow
freezes you solid."

**HeroData** `src/data/heroes/marshmallow.ts`:
```ts
/** Marshmallow, Mage (sim v13, original dog): a Samoyed puppy whose snow stacks Chill until a cat freezes. */
import type { HeroData } from './types';

export const MARSHMALLOW: HeroData = Object.freeze<HeroData>({
  id: 'marshmallow',
  name: 'Marshmallow',
  side: 'dog',
  role: 'mage',
  pvp: { dmgBp: 10600, takenBp: 9200 },
  element: 'ICE',
  base: { hp: 470, hpPerLevel: 50, attack: 48, attackPerLevel: 5, attackEvery: 29, range: 5200, speed: 4800, armour: 16, armourPerLevel: 2 },
  /** Snowed In: her ability hits on a hero add 1 Chill (4 s); at 4 the hero is Frozen: rooted 1 s and takes 45 (+4/lvl); then 6 s immune. */
  passive: { stacks: 4, window: 120, root: 30, dmg: 45, dmgPerLevel: 4, lockout: 180 },
  abilities: {
    /** Snowball: 8 m shot, stops at the first unit, 70 (+7/lvl, +18 a rank), slow 20% for 1 s. */
    q: { cooldown: 180, range: 8000, width: 1000, speed: 15000, dmg: 70, dmgPerLevel: 7, slowBp: 2000, slow: 30 },
    /** Floof Shake: 0.3 s wind-up, 3.2 m ring, 55 (+5/lvl, +12 a rank), pushes enemies 1.2 m away. */
    w: { cooldown: 300, windup: 9, radius: 3200, dmg: 55, dmgPerLevel: 5, push: 1200 },
    /** Belly Slide: slide 4 m at 14 m/s; a 2.2 m frost patch stays where she started for 2.5 s, slowing enemies 30%. */
    e: { cooldown: 390, dash: 4000, speed: 14000, radius: 2200, ttl: 75, every: 15, slowBp: 3000, slow: 18 },
    /** SNOW DAY!: 0.6 s wind-up; a 4 m blizzard within 9 m for 4 s; every 0.67 s 28 (+3/lvl, +10 a rank) and a 25% slow (each pulse adds Chill). */
    r: { cooldown: 2000, windup: 18, range: 9000, radius: 4000, duration: 120, every: 20, dmg: 28, dmgPerLevel: 3, slowBp: 2500, slow: 21 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 10, cooldown: -100 } },
  talents: [
    [
      { id: 'packed-snow', name: 'Packed Snow', mods: { q: { dmg: 85 } } },
      { id: 'deep-freeze', name: 'Deep Freeze', mods: { passive: { root: 45 } } },
    ],
    [
      { id: 'extra-floof', name: 'Extra Floof', mods: { w: { radius: 4000 } } },
      { id: 'icy-slide', name: 'Icy Slide', mods: { e: { slowBp: 4500 } } },
    ],
    [
      { id: 'snow-week', name: 'Snow Week', mods: { r: { duration: 165 } } },
      { id: 'big-blizzard', name: 'Big Blizzard', mods: { r: { radius: 5000 } } },
    ],
  ],
});
```

**heroText:** title "Marshmallow", Mage, Dog. Blurb: "Pure fluff. Snow on everything until the cats freeze."
- Passive, Snowed In: "Her snow chills cats; enough Chill freezes them in place."
- Q, Snowball: "A snowball that slows the first thing it hits."
- W, Floof Shake: "Shake off the snow: hits and pushes nearby cats away."
- E, Belly Slide: "Slide away, leaving a slippery frost patch."
- R, SNOW DAY!: "A blizzard that chills and slows everything inside."
- Icons: `snowball`, `shake`, `slide`, `blizzard`.

**Sim kit** `src/sim/heroes/marshmallow.ts`. This is Duchess's kit shape (`duchess.ts`) with the payoff changed.
Kit arrays: none beyond the shared ones.
- `aim`: Q `Aim.Dir`. W `Aim.Self` with windup. E `Aim.Dir`, mobility. R `Aim.Point`, reach `r.range`, windup.
- **Passive.** `afterDeal(m, id, dst, dmg, kind)`: on `kind === 'ability'` against an enemy hero, call
  `addStack(w, dst, 1, stacks, window)` (`stack.ts:12`). When it returns true, call `consumeStack(w, dst, lockout)`,
  `root(w, dst, root)` and `dealDamage(…, 'ability')`. The Frozen hit does not re-stack, because the hero is in
  lockout. **The victim holds `mkStack`, and the array is shared with Duchess's Disdain.** That is safe because teams
  are species: Duchess only ever stacks dogs and Marshmallow only ever stacks cats, so no hero carries both.
- **Q.** `fireSkillshot` with stop-at-first, new `PROJECTILE_KIND.snowball` (15), `ON_HIT` slow.
- **W.** `collect` + `inRing` → `dealDamage`, then `knockback(m, e, x[id], y[id], push, facing)`.
- **E.** `spawnBurst(w, team, id, x0, y0, radius, 0, ttl, 0, 0, every, slowBp, slow)` at her start point, then
  `dash(m, id, angle, e.dash, e.speed)` (the v11 `speed` argument).
- **R.** `spawnBurst(…, aimX, aimY, radius, windup, duration, lvl(dmg), 0, every, slowBp, slow)`. The pulses go
  through `dealDamage(owner, 'ability')` (`zone.ts:96`), so each pulse adds Chill through `afterDeal`. A cat that
  stays inside freezes on the 4th pulse (2.7 s).
- No new primitive, no new World array, no new zone kind.

**Bot:** fight: Q on a foe in the line; W when a foe is within 3 m (peel) or 2+ foes are in it; E away when a melee
foe is within `BOT_AI.marshPeelRange (3000)` (escape, also used in a fight to kite); R on the 2+ foe cluster within
9 m, or on a foe with ≥ 2 Chill (`stacksOf`). Spacing like Duchess (`BOT_AI.duchessSpacing`; reuse the key as
`mageSpacing` or add `marshSpacing 4500`).

**Render** (`src/render/chars/heroes/marshmallow.ts`):
- RigSpec `width 1.3, bodyScale 1.2, headScale 1.15, tier 'kid'` (a puppy, not a grown hero; v11 used `kid` for
  Pixel). HERO_HEIGHT 2.35.
- Coat: solid white (`base 0xf8f6f2, deep 0xdcd6cc, light 0xffffff, cream 0xffffff`). Fluff: reuse the shared
  `fluffPuffs` builder (`gear.ts`, from Duchess) on the chest, neck ruff and cheeks, so she is a sphere.
- Head `samoyedHead`: a round skull, a short white muzzle, small upright rounded triangle ears, black rimmed eyes and
  a black nose, and the **Samoyed smile** (a black lip-line arc with upturned corners, plus a pink tongue).
- Tail: a big plume curled over the back (`tail.thick 1.6` plus a `tailCurve` up and forward, or a fur-cone plume
  on the last tail bones).
- Gear: team-coloured scarf (cape + mantle), a little bobble hat (team-coloured bobble), mittens on the front paws.
- HERO_MOTION: idle `sit` with a head tilt, run `stand` with a bouncy puppy hop, cast `cheer`, attack a two-paw
  toss.
- HERO_COLOR_CSS `#bfe6ff`. ICE accent.

**Moves and VFX:**
- Q: the snowball grows as it flies and bursts into a snow poof.
- W: a full-body shake with spray rings, and her fur goes 10% bigger for 0.3 s.
- E: a belly slide with an ice trail; the patch is a pale blue disc with a frosted edge.
- R: a snow globe dome rises, then falls as snow; she flops into it happily.
- Frozen: the victim is cased in an ice block (a render cue on `stacks` → root) with a "brr" shiver.
- `ultName` 'SNOW DAY!'.

**Viral moment:** **SNOW DAY!**: a blizzard falls, she flops into it with the smile, and Frozen cats pop out of
ice cubes. The Frozen ice-cube cat is the clip.

**Voice / emote:** `marshAwoo` (a tiny puppy "awoo" that cracks on the high note) on R; `marshPoof` on Q.
Emote: a head tilt, then a sneeze that makes her fluff puff out.

**Overhead:** Chill uses the existing `stacks` byte (snapshot offset 55). `disdainPips` (`src/ui/overhead.ts`)
draws crowns today. It should draw **snowflakes when the victim is a cat** (the stacks can only come from
Marshmallow) and crowns when the victim is a dog. Render only.

**Balance target:** 46–54%. Watch for the R + Frozen chain with Brutus's arena (a locked cat in a blizzard). If it
goes over 54%, cut `passive.root` 30 → 23 before touching damage.

**Skins hook:** `coat.marshmallow.cream` (biscuit cream), `coat.marshmallow.cocoa` (hot-cocoa brown with a
marshmallow-white ruff), `coat.marshmallow.snowcone` (pastel blue tips).

---

### 1.3 Bravo (`bravo`, index 14): viral tank

**Fantasy:** "A pug who could have been a star. Every hit is a tragedy, every fight a stage, and when he is about
to die he plays dead (and it works)."

**HeroData** `src/data/heroes/bravo.ts`:
```ts
/** Bravo, Tank (sim v13, original dog): a dramatic pug who taunts, holds the stage and fakes his own death. */
import type { HeroData } from './types';

export const BRAVO: HeroData = Object.freeze<HeroData>({
  id: 'bravo',
  name: 'Bravo',
  side: 'dog',
  role: 'tank',
  pvp: { dmgBp: 10200, takenBp: 9500 },
  element: 'STELLAR',
  base: { hp: 740, hpPerLevel: 78, attack: 46, attackPerLevel: 4, attackEvery: 35, range: 1600, speed: 4700, armour: 38, armourPerLevel: 3 },
  /** Dramatic Flop: a hit that drops him below 25% HP makes him play dead: 1 s untargetable and still, healing 12% max HP. 75 s lockout. */
  passive: { thresholdBp: 2500, duration: 30, healBp: 1200, cooldown: 2250 },
  abilities: {
    /** Crocodile Tears: 6.5 m tear that stops at the first unit, 60 (+5/lvl, +15 a rank); a hero hit is charmed to him for 0.75 s. */
    q: { cooldown: 270, range: 6500, width: 900, speed: 15000, dmg: 60, dmgPerLevel: 5, charm: 23, slowBp: 5000 },
    /** Center Stage: a 3 m spotlight at his feet for 3 s; while he stands in it he takes 35% less; enemies in it are slowed 25%. */
    w: { cooldown: 420, radius: 3000, duration: 90, reduceBp: 3500, every: 10, slowBp: 2500, slow: 12 },
    /** Stage Dive: hop up to 5 m; landing ring 2.2 m, 50 (+4/lvl, +12 a rank), knocks enemies 1.5 m away. */
    e: { cooldown: 390, dash: 5000, radius: 2200, dmg: 50, dmgPerLevel: 4, push: 1500 },
    /** ENCORE!: 0.6 s bow; enemy heroes within 5.5 m are charmed to him for 1.25 s and take 90 (+9/lvl, +40 a rank); he gains a shield of 12% max HP for 3 s. */
    r: { cooldown: 2250, windup: 18, radius: 5500, charm: 38, slowBp: 5000, dmg: 90, dmgPerLevel: 9, shieldBp: 1200, duration: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 40, cooldown: -100 } },
  talents: [
    [
      { id: 'ugly-crying', name: 'Ugly Crying', mods: { q: { charm: 32 } } },
      { id: 'method-actor', name: 'Method Actor', mods: { passive: { healBp: 1800 } } },
    ],
    [
      { id: 'big-spotlight', name: 'Big Spotlight', mods: { w: { radius: 4000 } } },
      { id: 'crowd-surf', name: 'Crowd Surf', mods: { e: { push: 2500 } } },
    ],
    [
      { id: 'standing-ovation', name: 'Standing Ovation', mods: { r: { charm: 48 } } },
      { id: 'second-encore', name: 'Second Encore', mods: { r: { radius: 7000 } } },
    ],
  ],
});
```

**heroText:** title "Bravo", Tank, Dog. Blurb: "A pug who lives for the drama. Taunts cats, owns the stage,
fakes his own death."
- Passive, Dramatic Flop: "About to fall? He plays dead, and nothing can touch him."
- Q, Crocodile Tears: "A tear so sad the cat it hits has to come over."
- W, Center Stage: "Drop a spotlight. On stage he is tougher; cats in it are slowed."
- E, Stage Dive: "Leap into the crowd and knock cats back."
- R, ENCORE!: "Take a bow: every cat nearby has to walk up to him."
- Icons: `tear`, `spotlight`, `stagedive`, `encore`.

**Sim kit** `src/sim/heroes/bravo.ts`. Kit arrays: `kHuntT` flop lockout, `kRT` flop ticks, `kFoe` the spotlight
zone index (−1 none).
- `aim`: Q `Aim.Dir`. W `Aim.Self`. E `Aim.Point`, reach `e.dash`, mobility. R `Aim.Self`, windup.
- **Passive.** Same shape as Meatball's Food Coma (`incoming()`). If `kHuntT === 0` and `hp − dmg < maxHp ×
  thresholdBp`, clamp the hit so he keeps at least 1 HP. Then set `w.untargT[id] = duration`
  (Clem's Tumble field, `clem.ts:95`), `stun(w, id, duration)` (he lies still: no inputs) and
  `healOverTime(w, id, maxHp × healBp, duration)`. Set `kRT = duration` and `kHuntT = cooldown`. `snapFx` Form
  while `kRT > 0` (the flop pose). Tower shots and in-flight bolts aimed at him miss, as Tumble's do. **Order
  against Nine Lives** (`bonus.ts:53 nineLives`): the flop runs first, inside the kit's `incoming`; Nine Lives then
  sees the clamped hit. Write it in the header comment.
- **Q.** `fireSkillshot` stop-at-first, new `PROJECTILE_KIND.tear` (16). On a hero hit (handled in `afterDeal`, kind
  'ability', when the source projectile is his Q, or with an `ON_HIT` charm if that table has one), call
  `charm(w, e, q.charm, id)` + `slow(w, e, q.slowBp, q.charm)`, the Gabė R pattern (`gabe.ts:104-105`).
- **W.** `spawnBurst(w, team, id, x, y, radius, 0, duration, 0, 0, every, slowBp, slow)` → `kFoe = z`.
  `incoming()` cuts by `reduceBp` while `zAlive[kFoe]` and he is within `zRadius` of `zX/zY`. The burst zone is
  visible to both teams, so the stage reads on screen with no new zone kind.
- **E.** Lambo's Belly Flop shape (`lambo.ts:53 land`): `dash` to the point, and on landing a ring with
  `dealDamage` + `knockback` from his position (instead of a stun).
- **R.** On resolve: every enemy hero within `radius` gets `charm` + `slow` + `dealDamage`. Then
  `addShield(w, id, maxHp × shieldBp, duration)`.
- No new primitive, no new World array.

**Bot:** fight: Q on the foe nearest an ally (pull a cat into the team); E onto a foe cluster or to follow up a Q
charm; W when 2+ foes are within 3 m or he is the dive target; R when 2+ foes are in 5.5 m and an ally is near
(`allyNear`), or 1 foe under 40% with an ally near. escape: E toward his tower; the flop is passive. clear: E on 3+
minions only after level 6. New BOT_AI keys: `bravoEncoreFoes 2`, `bravoStageFoes 2`.

**Render** (`src/render/chars/heroes/bravo.ts`):
- RigSpec `width 1.1, bodyScale 1.05, headScale 1.1, tier 'hero', earsLow 0.6`. He is smaller than Brutus
  (HERO_HEIGHT 2.45 against 2.8) and wears no armour.
- Head: reuse `pugHead` (`beast.ts`) with a darker black mask variant (`fur 0xe2c09a, dark 0xc49a6c`). Add big
  **wet eyes**: `dogEyes` with a second catchlight and a blue tear-drop mesh on the cheek, shown in Q and the flop.
- Gear: a long velvet **cape** in team colour (the team read) with a gold hem, a white Elizabethan **ruff** (a ring
  of flattened torus segments on the neck), a single red **rose** held in the mouth in idle, and a tiny gold
  crown-tiara (borrow Duchess's `tiara`, shrunk). Make sure the ruff does not read as Duchess's fluff from above:
  pure white with a ribbed edge.
- HERO_MOTION: idle `stand` with a chest-out pose, run a prancing high-knee stride, cast `cheer`, attack a cape
  swat.
- HERO_COLOR_CSS `#e2c09a`.

**Moves and VFX:**
- Passive **flop**: he clutches his chest, spins a quarter turn and falls on his back, legs up, tongue out. Stars
  and a soft "drama" sting play. A "…bravo?" whisper text pops at the end (overhead, own team and enemy alike).
- Q: an exaggerated sob, then a big blue tear arcs and splashes.
- W: a spotlight cone from above (additive cone mesh) and a ring of stage boards.
- E: a stage dive with arms out; the landing makes a crowd "wooo" puff.
- R: a deep bow; spotlights sweep in, roses rain down, and charmed cats walk in clapping (their charm walk clip,
  plus a clap overlay on any charmed hero).
- `ultName` 'ENCORE!'.

**Viral moment:** **the fake death.** The pug drops dead in a full theatrical faint, every cat walks off, and he
pops back up at 37% HP. It also fits a death-recap clip: "Bravo played dead 3 times".

**Voice / emote:** `bravoSob` (a falling three-note whimper) on Q, `bravoGasp` + a small fanfare on the flop,
`bravoBow` (a fanfare) on R. Emote: a bow, then he catches a thrown rose.

**Balance target:** 46–54%. The flop is the risk: 1 s untargetable on a 75 s lockout with a 12% heal. Measure "Bravo
survives at < 10% HP" in the probe. If he passes 54%, cut `healBp` before the duration. The duration is the joke.

**Skins hook:** `coat.bravo.black` (black pug, silver cape hem), `coat.bravo.opera` (cream with a phantom
half-mask, no copyrighted logo), `coat.bravo.understudy` (brindle, a paper crown).

---

### 1.4 Chili (`chili`, index 15): viral marksman

**Fantasy:** "Two kilograms of pure rage. Shakes, yaps and fires, and when he is angry enough he becomes very, very
big."

**HeroData** `src/data/heroes/chili.ts`:
```ts
/** Chili, Marksman (sim v13, original dog): a chihuahua whose Rage turns into attack speed, then into a giant. */
import type { HeroData } from './types';

export const CHILI: HeroData = Object.freeze<HeroData>({
  id: 'chili',
  name: 'Chili',
  side: 'dog',
  role: 'marksman',
  pvp: { dmgBp: 10400, takenBp: 9500 },
  element: 'ELECTRIC',
  base: { hp: 450, hpPerLevel: 47, attack: 50, attackPerLevel: 5, attackEvery: 27, range: 5500, speed: 5000, armour: 15, armourPerLevel: 2 },
  /** Small Dog Syndrome: each hit he takes from a hero, and each Yap that hits a hero, adds 1 Rage (max 5; all lost 4 s after the last gain). Each Rage: +8% attack speed. */
  passive: { max: 5, window: 120, attackSpeedBpPer: 800 },
  abilities: {
    /** Yap Yap Yap: three yaps 0.17 s apart, each 7 m, stops at the first unit, 32 (+3/lvl, +8 a rank). */
    q: { cooldown: 210, count: 3, gap: 5, range: 7000, width: 700, speed: 20000, dmg: 32, dmgPerLevel: 3 },
    /** Tiny Zoomies: dash 3 m; +30% speed for 1.5 s and +1 Rage. */
    w: { cooldown: 330, dash: 3000, hasteBp: 3000, haste: 45, rage: 1 },
    /** Purse Mode: hide in a handbag for 1 s: untargetable, rooted, heal 8% max HP; on the way out, enemy heroes within 2.2 m are feared 0.5 s. */
    e: { cooldown: 540, duration: 30, healBp: 800, radius: 2200, fear: 15 },
    /** BIG DOG ENERGY: 6 s, he grows huge: Rage locked full, basics splash 1.6 m for 60%, 0.5 s CC immune at cast, +10% damage. */
    r: { cooldown: 1950, duration: 180, splash: 1600, splashBp: 6000, immune: 15, bonusBp: 11000 },
  },
  ranks: { q: { dmg: 8 }, w: { cooldown: -15 }, e: { cooldown: -30 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'extra-yap', name: 'Extra Yap', mods: { q: { count: 4 } } },
      { id: 'short-fuse', name: 'Short Fuse', mods: { passive: { attackSpeedBpPer: 1000 } } },
    ],
    [
      { id: 'designer-bag', name: 'Designer Bag', mods: { e: { healBp: 1200 } } },
      { id: 'caffeinated', name: 'Caffeinated', mods: { w: { rage: 2 } } },
    ],
    [
      { id: 'even-bigger', name: 'Even Bigger', mods: { r: { splash: 2200 } } },
      { id: 'grudge', name: 'Grudge', mods: { r: { duration: 240 } } },
    ],
  ],
});
```

**heroText:** title "Chili", Marksman, Dog. Blurb: "Tiny. Shaking. Furious. Gets faster the angrier he gets."
- Passive, Small Dog Syndrome: "Getting hit, and yapping at cats, builds Rage: more Rage, faster attacks."
- Q, Yap Yap Yap: "Three quick yaps in a line."
- W, Tiny Zoomies: "Dart away at full speed, and get angrier."
- E, Purse Mode: "Hide in a handbag: untouchable for a moment, then pop out yapping."
- R, BIG DOG ENERGY: "Become a very big dog. Max Rage, and every shot splashes."
- Icons: `yap`, `zoomies` (exists: Stilts R), `purse`, `bigdog`.

**Sim kit** `src/sim/heroes/chili.ts`. Kit arrays: `kValor` Rage (0..5), `kHuntT` Rage decay timer, `kStage` yaps
left to fire, `kWindow` ticks to the next yap, `kRT` purse ticks, `kWT` R ticks.
- `aim`: Q `Aim.Dir`. W `Aim.Dir`, mobility. E `Aim.Self`. R `Aim.Self`.
- **Passive.** `rage(w, id, n)`: `kValor = min(max, kValor + n)`, `kHuntT = window`, then
  `attackSpeed(w, id, kValor × attackSpeedBpPer, window)` (`buff.ts:19`; the strongest buff wins, and more Rage is
  always stronger). Rage comes from `incoming()` when the source is an enemy hero (once per tick, so a burst counts
  once), and from Q hits on heroes (`afterDeal`, kind 'ability', the yap projectile kind). `stepKit` counts
  `kHuntT` down and clears `kValor` at 0. `resource()` = `kValor × 51` (a 5-pip bar on his own plate).
- **Q.** On cast: `kStage = count`, `kWindow = 0`. `stepKit` fires a yap when `kWindow` reaches 0, along the
  facing at cast (store the angle in `kFoe`), using `fireSkillshot` stop-at-first with new
  `PROJECTILE_KIND.yap` (17). Then `kWindow = gap`. Stilts's Swat-Swat uses the same gap pattern.
- **W.** `dash(m, id, angle, dash)` + `haste` + `rage(w, id, rage)`.
- **E.** `untargT = duration`, `root(w, id, duration)`, `healOverTime(w, id, maxHp × healBp, duration)`,
  `kRT = duration`. When `kRT` hits 0 in `stepKit`: `fear` every enemy hero within `radius`. `snapFx` Form
  while `kRT > 0` (the purse).
- **R.** `cleanse(w, id, immune)`, `kWT = duration`. While `kWT > 0`: Rage stays at max (refresh it each tick), and
  `outgoing()` multiplies hero damage by `bonusBp`. The splash on basics is a copy of Pixel's BOXBOT splash
  (`pixel.ts:156-165`, `afterDeal` on kind 'basic', splash damage as 'ability'). Because the splash counts as
  'ability', it does not add Rage: only Q's projectile kind does. `snapFx` Form while `kWT > 0` (the render scales
  him to 1.7).
- New: `PROJECTILE_KIND.yap` (17). No new primitive and no new World array.

**Bot:** fight: kite at `BOT_AI.chiliSpacing (4800)`; Q at a foe in the line; W to keep spacing when a melee foe is
within 2.5 m, else toward the foe to stay in range; E when a foe would burst him (below 35% with a foe within 3 m),
or to dodge a known ult windup (`windup` event aimed at him); R when Rage ≥ 3 and 2+ foes are within 6 m, or on a
foe below 50% in range. clear: Q on 3+ minions in a line. New BOT_AI keys: `chiliSpacing 4800`,
`chiliPurseHpBp 3500`, `chiliBigRage 3`.

**Render** (`src/render/chars/heroes/chili.ts`):
- RigSpec `width 0.75, bodyScale 0.8, headScale 1.35, tier 'kid'`. He is the smallest hero (HERO_HEIGHT 1.9) with
  the biggest head share. Check the upright test (v11: the neck must sit ≥ 0.25 H above the hips; Pixel needed
  `tier 'kid'`).
- Coat: smooth fawn (`base 0xd9a46a, deep 0xb07a44, light 0xf2d2a8, cream 0xf6e4c8`).
- Head `chihuahuaHead`: an apple-dome skull, a short pointed muzzle, **enormous bat ears** (about 2× a cat ear,
  thin, pink inside, splayed 30°), **bulging glossy eyes** (dogEyes, r 0.055, two catchlights), and a tiny
  underbite tooth.
- Gear: a team-coloured knit **sweater** (cape + mantle replaced by a jacket mesh in team colour; this is his team
  read), a pink collar with a bone tag, and a pink handbag prop (hidden except in E).
- Constant **tremble**: a 12 Hz, 0.6° root jitter in every clip except R. It is render only and does not affect
  the hitbox.
- R: the Form bit scales the whole character to 1.7 (as Pixel's BOXBOT scales 1.45). His bark pitch drops, and the
  eyes narrow (an eyelid morph on the eye bones).
- HERO_MOTION: idle `stand` + tremble, run a fast skittering stride (`stride 1.6`), cast `cheer`, attack a recoil
  bark (each basic is a yap bolt).
- HERO_COLOR_CSS `#d9a46a`. ELECTRIC accent (the yellow bolts read as "angry energy").

**Moves and VFX:**
- Rage pips: tiny red "anger" marks over his head (1 per Rage), render from `resource`; the own team sees the plate
  bar.
- Q: three white "YAP" sound-wave crescents.
- W: speed lines and a dust trail.
- E: he dives into a pink handbag that zips shut; then it unzips with a shock ring, a cartoon "!" and the fear.
- R: a growth spurt with a quick squash and stretch. The camera does a short zoom-out shake (local player only,
  respecting the reduced-motion setting). The basics turn into big bark shockwaves.
- `ultName` 'BIG DOG ENERGY'.

**Viral moment:** **BIG DOG ENERGY.** The tiny trembling dog grows into the biggest thing on the map, and his yap
drops into a deep bark. Purse Mode is the second clip.

**Voice / emote:** `chiliYap` (a high square-wave yap, pitch-randomised per shot by seeded playback rate),
`chiliBigBark` (the same def at 0.5× rate plus a low-pass filter) in R, `chiliGrowl` on Rage 5. Emote: furious
tremble, then a single tiny "yip".

**Balance target:** 46–54%. Risks: R splash + max Rage on a team fight; Purse Mode dodging Sage's Moonshot (fine:
that is a skill play). Tune `attackSpeedBpPer` first, then `splashBp`.

**Skins hook:** `coat.chili.black-tan`, `coat.chili.long-hair` (fluffy ears), `coat.chili.hot-sauce` (red with
a flame-pattern sweater). The sweater pattern is a cheap skin axis for later store items.

---

### 1.5 Boomer (`boomer`, index 16): viral fighter

**Fantasy:** "A husky who has an opinion about everything and says it at full volume. Every ability is a different
scream."

**HeroData** `src/data/heroes/boomer.ts`:
```ts
/** Boomer, Fighter (sim v13, original dog): a loud husky whose screams slow, fear and finally blow cats away. */
import type { HeroData } from './types';

export const BOOMER: HeroData = Object.freeze<HeroData>({
  id: 'boomer',
  name: 'Boomer',
  side: 'dog',
  role: 'fighter',
  pvp: { dmgBp: 10400, takenBp: 9400 },
  element: 'WIND',
  base: { hp: 640, hpPerLevel: 66, attack: 58, attackPerLevel: 6, attackEvery: 30, range: 1700, speed: 5000, armour: 30, armourPerLevel: 3 },
  /** Zoomie Brain: after any ability, his next basic within 3 s deals +35% and slows 25% for 1 s. */
  passive: { window: 90, bonusBp: 13500, slowBp: 2500, slow: 30 },
  abilities: {
    /** AWOO: cone 4 m, 75°, 70 (+6/lvl, +18 a rank), slow 25% for 1 s. */
    q: { cooldown: 210, range: 4000, arc: 853, dmg: 70, dmgPerLevel: 6, slowBp: 2500, slow: 30 },
    /** Derp Dash: dash 4.5 m through enemies, 50 (+5/lvl, +12 a rank) each; then +20% speed for 1 s. */
    w: { cooldown: 330, dash: 4500, width: 1100, dmg: 50, dmgPerLevel: 5, hasteBp: 2000, haste: 30 },
    /** Talk Back: 1 s of arguing: 40% less damage; each enemy hero that hits him in it is feared 0.6 s (once each). */
    e: { cooldown: 420, duration: 30, reduceBp: 4000, fear: 18 },
    /** THE SCREAM: 0.7 s inhale, then a cone 7 m, 90°: 150 (+15/lvl, +65 a rank), knocked back 2 m and feared 1 s. */
    r: { cooldown: 2100, windup: 21, range: 7000, arc: 1024, dmg: 150, dmgPerLevel: 15, push: 2000, fear: 30 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 65, cooldown: -100 } },
  talents: [
    [
      { id: 'louder', name: 'Louder', mods: { q: { range: 5000 } } },
      { id: 'no-thoughts', name: 'No Thoughts', mods: { passive: { bonusBp: 15500 } } },
    ],
    [
      { id: 'sled-dog', name: 'Sled Dog', mods: { w: { dash: 6000 } } },
      { id: 'last-word', name: 'Last Word', mods: { e: { fear: 30 } } },
    ],
    [
      { id: 'full-lungs', name: 'Full Lungs', mods: { r: { range: 9000 } } },
      { id: 'dramatic-pause', name: 'Dramatic Pause', mods: { r: { windup: 12 } } },
    ],
  ],
});
```

**heroText:** title "Boomer", Fighter, Dog. Blurb: "A husky with opinions. Every ability is a scream."
- Passive, Zoomie Brain: "After any ability, his next bite hits harder and slows."
- Q, AWOO: "Howl in a cone: hurts and slows cats."
- W, Derp Dash: "Charge through cats with zero plan."
- E, Talk Back: "Argue back: tougher, and cats who hit him run off."
- R, THE SCREAM: "A deep breath, then a scream that blows cats away."
- Icons: `howl`, `derpdash`, `talkback`, `scream`.

**Sim kit** `src/sim/heroes/boomer.ts`. Kit arrays: `kEmpower` Zoomie Brain ticks, `kRT` Talk Back ticks,
`kCount` Talk Back fear bitmask (bit = enemy hero id; heroes are ids < 32), `kStage` 1 = Derp Dash in flight.
- `aim`: Q `Aim.Dir`. W `Aim.Dir`, mobility. E `Aim.Self`. R `Aim.Dir`, windup `r.windup`.
- **Passive.** Every `cast()` sets `kEmpower = window`. The `basic(m, id, dst, dmg)` hook (melee: the kit lands the
  hit itself, as Stilts's pounce does): if `kEmpower > 0`, `dealDamage(…, applyBp(dmg, bonusBp), 'basic')` + `slow`,
  `kEmpower = 0`, return true; else return false. `stepKit` counts `kEmpower` down. `resource()` = 255 while
  armed (a glowing ring on his own plate).
- **Q.** `collect` + `inCone` (`cone.ts`) → `dealDamage` + `slow`. Cacklejaw's Gloat shape.
- **W.** `dash` + `onDashTick` hit mask; a copy of Cacklejaw's Jeer Slash (`cacklejaw.ts:126-145`) without the
  recast. When the dash ends (`fmKind === FM.None` with `kStage === 1`): `haste`, `kStage = 0`.
- **E.** `kRT = duration`, `kCount = 0`. `incoming(m, id, src, dmg)`: while `kRT > 0`, cut by `reduceBp`. If `src` is
  an enemy hero whose bit is clear, `fear(w, src, fear, x[id], y[id])` and set the bit.
- **R.** `collect` + `inCone` → `dealDamage`, `knockback(m, e, x[id], y[id], push, facing)`, then
  `fear(w, e, fear, x[id], y[id])`. Fear is applied after the knockback; check that `fear()`'s `interrupt` does not
  cancel the knockback's forced move (`FM`). If it does, start the fear in `stepKit` once the victim's
  `fmKind === FM.None`, or simply give `fear` the knockback's 6 extra ticks. Pin it in a unit test.
- No new primitive, no new World array.

**Bot:** fight: W to engage when a foe is within W + melee range and ≥ 1 ally is near, or when the foe is below 50%;
Q when the foe is within 4 m (aimed); then the empowered basic follows naturally through the brain's attack order.
E when 2+ foes are within 3 m, or he is below 60% and focused. R when 2+ foes are in the 7 m cone, or 1 foe below
45% within 5 m. escape: W along `awayFrom()`. clear: Q through 3+ minions. New BOT_AI keys: `boomerEngageHpBp 5000`,
`boomerScreamFoes 2`, `boomerScreamHpBp 4500`.

**Render** (`src/render/chars/heroes/boomer.ts`):
- RigSpec `width 1.0, bodyScale 1.05, headScale 1.0, tier 'hero', earsLow 0`. HERO_HEIGHT 2.85 (the tallest dog;
  check it against Stilts's 3.2 so the two do not share an outline: Boomer is broad-chested and Stilts is a stick).
- Coat: `pattern 'points'` husky grey and white (`base 0x8a8f99, deep 0x4a4f59, light 0xf2f4f7, cream 0xffffff`),
  with the white mask and the dark "eyebrow" dots.
- Head `huskyHead`: a wolfish wedge skull, medium upright ears, **ice-blue eyes** (one slightly bigger: the derp
  read, seeded per look), and a mouth that hangs half open with the tongue to one side. In every scream clip the jaw
  bone opens wide (the chibi rig has a jaw or mouth morph? if not, a separate mouth mesh on the head bone scaled in
  Y).
- Tail: a thick curled sickle tail (`tail.thick 1.4`, curl up).
- Gear: a team-coloured **sled harness** (chest straps + a back pad; this is the team read; mantle in team colour),
  booties on the front paws, and a little bell.
- HERO_MOTION: idle `stand` with a random head tilt, run a loping sled-dog stride, cast a chin-up howl pose, attack
  a lunge bite.
- HERO_COLOR_CSS `#8fb8e8`. WIND accent.

**Moves and VFX:**
- Q: chin up and a long "AWOO"; visible sound-wave arcs in a 4 m cone.
- W: a derp face (tongue out, eyes crossed), a dash with a snow spray.
- E: a "talking back" stance: paws planted, head bobbing, a speech bubble of "!?#!" glyphs (cartoon symbols only,
  no words), fear arrows on the feared cats.
- R **THE SCREAM**: a 0.7 s inhale (chest balloons to 1.3×, eyes widen), then the jaw opens and a huge cone
  shockwave runs out with distortion rings. Cats' fur and hats blow back. A screen shake for the local player
  (reduced-motion respected).
- `ultName` 'THE SCREAM'.

**Viral moment:** **the inhale.** The 0.7 s chest balloon before THE SCREAM is the comedy beat: everyone sees it
coming and it still lands. On the results screen his win pose is a howl and his loss pose is a dramatic
lie-down-and-grumble.

**Voice / emote:** `boomerAwoo` (a rising sine "awoo"), `boomerScream` (noise + saw with a pitch slide, about
0.9 s, ducked under the master limiter), `boomerArgue` (three short "woo-woo-wooo" grumbles) on E. Emote: a long
grumble, ending in a single offended "WOO".

**Balance target:** 46–54%. Risk: the R + Talk Back combo on a dive. Tune `r.fear` before `r.dmg`.

**Skins hook:** `coat.boomer.red` (copper husky), `coat.boomer.agouti` (wolf grey), `coat.boomer.pied` (white
with patches; the derp eye is kept).

---

## 2. The CATS / DOGS switch (pick screen)

**What the player sees.** A segmented toggle at the top of the hero grid, under "Choose your legend":
`[ (paw) CATS 10 ] [ (bone) DOGS 7 ]`. The glyphs are the existing `icon('paw')` and a new `icon('bone')`, not emoji. The
active side is filled in its species colour (the cat rose / the Woof blue from `TEAM[]`; this is not the ally/enemy
relation colour, which stays blue and red). Below the toggle sits one line that says what the choice means:
"You play the cats. Your enemies: the dogs." or "You play the dogs. Your enemies: the cats." Only the chosen side's
heroes show in the grid.

**Behaviour:**
1. **Filtering.** `screens.ts:306` renders only `HERO_IDS.filter(h => HEROES[h].side === side)`. The other side's
   `.heroes` box keeps its `data-side` but is `hidden`, so the portrait redraw (`faces`, `screens.ts:357`) still
   works.
2. **Choosing a side picks a hero of that side.** On a switch, `c.hero` becomes `profile.lastBySide[side]` if set,
   else the side's default (`clem` / `brutus`). Then `o.onHero(h)` runs, so the lobby turntable shows the new hero
   at once and Play is never "a dog side with a cat hero".
3. **The team species follows the hero.** Nothing new is needed in the sim: `fillPicks` already gives the human's
   allies the hero's side and the enemies the other one (`src/sim/index.ts:111`), and
   `matchSession.ts:470 setSpecies(HEROES[picks[0]].side === 'dog')` already re-dresses bases, minions and cloth
   (`palette.ts setTeam0Dogs`, `setSideSwap`). The switch is client only: **no sim change, no replay change.**
4. **Remembered.** `Profile` (`src/meta/profile.ts`) gains `side: HeroSide` and
   `lastBySide: Partial<Record<HeroSide, HeroId>>`, both normalised in `loadProfile`: `side` defaults to
   `HEROES[p.hero].side` and an unknown id falls back. `v` stays 1 because the new fields are additive. `onHero`
   writes `lastBySide[side]`; `startMatch` writes `side`. The switch opens on `profile.side`.
5. **Accessibility.** `role="radiogroup"` with two `role="radio"` buttons (`aria-checked`), left and right arrows
   move between them, a 44 px minimum target, and `data-a="side"` with `data-side="cat|dog"` for the click handler.
   `document.documentElement.dataset.pickSide` = `cat|dog` for e2e and CSS.
6. **Layout.** One side at a time means 10 or 7 tiles: `grid-template-columns: repeat(5, minmax(0, 1fr))`, 2 rows
   both ways. This brings back the larger tiles v11 had to shrink (`champions.css:1-6`: 12 tiles on 6 columns).
   844×390: the toggle is 28 px tall (it replaces the v11 two-row squeeze); check that the Paw Trick chips stay above
   the fold (`no-zoom`, `hud-compact`, `match-touch` specs).
7. **Cards and champions.** A card skin is a cat costume, and both dogs already wear one (`specs.ts:342-377`). The
   new dogs keep the same rule: `skinCoat` paints the body, and the dog head stays. The champion badges are cats
   only (unchanged).
8. **Dare links and rematch** keep the hero in the link, so they already imply the side. On a dare open, the switch
   shows the dare hero's side.
9. **Analytics** (`src/analytics`): add `side` to the existing pick and match-start events (consented players only,
   as today). This gives the cat/dog pick split, which is the success metric for this whole spec.

---

## 3. Bot team composition

`fillPicks` already takes each hero of a side once before it repeats one (`fresh` vs `kin`, `src/sim/index.ts:113`).
With 7 dogs and 3 slots, **a dog team never duplicates**, and nothing in the rule changes. What does change:
- The dog pool is 7 instead of 2, so every replay with a dog bot draws different heroes. That is the main reason for
  SIM_VERSION 13 (alongside the kits themselves).
- Role spread: `fillPicks` is uniform and role-blind. Default: keep it uniform. That matches the cats, and a
  role-aware draft is N9 (role lanes). Report the share of dog teams with no tank or support in the probe; if over
  40% of losses come from a "3 squishies" team, do a role pass in v14.
- Rookie and Easy: `scriptFrom`/`enemiesToHuman` and the human damage edge were tuned while cats were 10 of 12
  picks. Re-run `novice` and `fun1` for **a dog human against cat bots** and **a cat human against 7 possible dogs**
  separately (§6).

---

## 4. Shared changes (as v11, append only)

**HeroId and HERO_IDS.**
- `types.ts`: `HeroId` gains `'nugget' | 'marshmallow' | 'bravo' | 'chili' | 'boomer'` at the end.
- `HERO_IDS` becomes `[..., 'stilts', 'nugget', 'marshmallow', 'bravo', 'chili', 'boomer']`, giving indices 12–16.
- Append in the same order in: `HEROES`, `BRANCH_TALENT` (all `null`), `KITS` (`kit.ts:83`), `PawlegendsHeroId`
  (`tools/vendor-sim.mjs:181`), `PAWLEGENDS_HEROES` (`client/components/pawlegends/bridge.ts`), and the tool lists
  (`headless-match.mjs`, `grade-calibrate.mjs`, `lib/fuzz-entry.ts`, `anim/capture.mjs`).
- Hard caps: `w.sub` is a Uint8 and 16 < 0x80. No index constant above 16, so no `lint-sim: allow` is needed.

**Sim engine additions (small):**
1. `PROJECTILE_KIND` (`data/towers.ts:37`): append `frisbee: 14, snowball: 15, tear: 16, yap: 17`, and append
   `Kind.Hero` × 4 to `SRC_KIND` (`combat/projectile.ts`). All four count as ability damage (kind > hero).
2. **No new primitive, no new World array, no new zone kind.** Chill reuses `mkStack` (§1.2). Stages, rage and
   timers use the existing `k*` arrays. If an agent finds it needs a new array, it asks the integration agent, who
   adds it to `hashedArrays` (`world.test` enforces this).
3. Snapshot: no layout change. The new heroes use the existing `form` fx bit (Nugget sploot, Bravo flop, Chili purse
   and BIG DOG), `resource` (Nugget pouch, Chili Rage, Boomer Zoomie Brain) and `stacks` (Chill).
   `protocol.test` already covers the round trip.
4. Bots: explicit `case` lines for all five in `fightCast`, `clearCast` and `escapeCast` (`casts.ts`), each
   delegating to `src/sim/bots/heroes/<id>.ts`. The `default:` stays a no-op (v11). BOT_AI keys as listed per dog.

**Client tables** (each new entry imports from the hero's own module, as v11 did): `specs.ts` heroBase case,
`HERO_MOTION`, `HERO_HEIGHT`, `HERO_TOP`, `HERO_SPRINGS`, `HERO_SCALE`/`HERO_RING`, `HERO_COLOR_CSS`
(`palette.ts`), `ultName`/`heroAccentRaw`, `HERO_TEXT`, icons `P`, `heroAims`, `HERO_ANIM` (moves, skillfx), sfx
defs (`sfxDefs.js` gets the zzfx arrays; it is a PPK-lifted file, so mark each hand edit with `pawlegends:`).
`HERO_CACHE_MAX` 48 → 64 (`render/chars/index.ts:43`).

**Meta (none of the five are champions):**
- `quests.ts`: 5 `win_<id>` quests (pool 21 → 26; the rotation length follows).
- `treats.ts`: `NAME` entries; `TRACK_ORIGINALS` gains the 5 with 3 coats each, appended after the current last
  reward (+15). Each coat gets a `FREE_COATS` palette (`render/cosmetics.ts`). Loop coats (8 per original): count
  the new total against `UNLOCKS_MAX = 160` (`profile.ts:82`) and raise it in the same commit if needed (a profile
  clamp change, so test the migration).
- `grade.ts`: no new role; rerun `grade-calibrate --check` (support, mage, marksman and fighter fits shift).
- GAPS N4 → done. GDD hero table: add the five under "Isle of Woof", move Barkus/Pilfer to the next wave.

**heroText number keys.** `reachAndTimer`/`dmgOf` (`heroText.ts`) learn `count` ("×3") and `healBp`/`shieldBp`
(as a % of max HP). `push`, `charm`, `splash` and `radius` already exist since v11.

---

## 5. SIM_VERSION 13 plan (exactly as v11 → v12)

1. Check the frozen v12 copy: `git diff 5bf2a938bc520f7dc38eb03f068b3edeb6e53fc7 HEAD --
   ../backend/src/vendor/pawlegends-sim/v12` must be empty (it is at `c49733c2`; `ally-blue` was client-only).
2. `src/sim/version.ts`: `SIM_VERSION = 13`.
3. `tools/vendor-sim.mjs` FROZEN: add
   `{ simVersion: 12, commit: '5bf2a938bc520f7dc38eb03f068b3edeb6e53fc7', from: 'backend/src/vendor/pawlegends-sim/v12', bundle: '59426998be81a7439eba33c06b81635840f34a5ec26adc368e38210159e51531', extra: ['forfeit-replay.fixture.json'] }`.
   - Keep v10 and v11 frozen: v10's 30-day replay window runs to about Dec 1. The dispatcher then serves 10–13.
     Retire v10 in the first sim change after Dec 1.
   - Update the FROZEN header comment and `tools/vendor-sim.test.mjs` (v10, v11, v12 frozen; v13 live).
   - The facade type `PawlegendsHeroId` gains the 5 ids. That widens the type, so older versions still type-check.
4. Backend `pawlegends-live.spec.ts`: `[10,11,12,13]`, `toBe(13)`, a fake hash per version; "v12 labelled v13" and
   "v13 labelled v12" dispatch tests; a v12 replay still verifies after v13 is vendored; a v13 replay with a dog
   human (e.g. `chili`) verifies. Update the comments in `pawlegends-live.ts`, `pawlegends-replay.dto.ts` and
   `pawlegends-replay.worker.ts`. `CHAMPION_FIXTURE_HERO` stays `'gabe'`; the rookie, champion and forfeit fixtures
   are re-recorded.
5. Game tests that pin the version: `round2.test.ts`, `sim-v10.test.ts`, `sim-v11.test.ts`, `sim-v7.test.ts`,
   `sim-v12.test.ts`. Pin to `SIM_VERSION` or `>= 12`, as they do today.
6. **Order:** v13 stays live while tuning. Run `npm run vendor-sim && npm run vendor-sim:check` after the last
   tuning change, right before the sim commit (expect "v10 (frozen), v11 (frozen), v12 (frozen), v13"). Then
   `cd ../backend && npx jest src/pawlegends && npm run lint && npm run build`. **Deploy the backend before any
   client build that ships v13** (`vendor-sim:check-remote`).
7. **Collision risk:** branch `feat/pawlegends-mp` (party referee API, commits `e012f0ce`, `2c9b0b51`) also edits
   `vendor-sim.mjs` and the vendored facade, and adds a `SIM_HASH`. Whichever lands second rebases its vendor step
   and re-runs `vendor-sim`. Never hand-merge the generated bundle.
8. Scores still save only through `POST /user/catbassadors/live`. No new write path.

---

## 6. Tests and e2e to add

**New, per dog** (templates: `tests/unit/heroes/gabe.test.ts` + `kit-helpers`, `tests/unit/anim-gabe.test.ts`):
- `tests/unit/heroes/<id>.test.ts`, one per dog, pinning the kit's key behaviours:
  - nugget: the pouch heals the weakest ally; herd moves foes toward the point and never past it; the sploot roots
    and heals.
  - marshmallow: 4 Chill → Frozen root + damage, then a lockout; blizzard pulses add Chill; the shared `mkStack`
    stays correct when Duchess is on the other team.
  - bravo: the flop fires once below 25%, he survives the killing blow, 75 s lockout, untargetable (a tower bolt
    misses); the Q charm; the spotlight cut only while inside it.
  - chili: Rage gains (once per tick), decay, the attack-speed buff grows; 3 yaps 5 ticks apart; Purse untargetable
    + the exit fear; R splash does not add Rage.
  - boomer: the empowered basic after a cast; Talk Back fears each attacker once; the R knockback then fear (the
    order the kit pins).
- `tests/unit/anim-<id>.test.ts` × 5.
- `tests/unit/sim-v13.test.ts`: `SIM_VERSION === 13`; the new projectile kinds are > hero and have SRC_KIND
  `Kind.Hero`; `fillPicks` never duplicates within a dog team across 1,000 seeds; every dog appears on both sides of
  the draw.

**Update** (the v11 list plus the counts): `picks.test.ts` (dog list, the "seen" set, **no duplicate on either
side**); `bots.test.ts` (the 5 cast Q/W/E/R); `determinism.test.ts` + `fuzz-entry.ts` (`seed % HERO_IDS.length`, so
34 seeds cover all 17); `skins-chars.test.ts` and `tests/fixtures/skins/golden-looks.json` (new keys);
`anim/timing.contract.test.ts`; `combat-vfx.test.ts` (melee list + `bravo`, `boomer`); `grade.test.ts`;
`gaps-wave-a.test.ts` (reward count, quest pool, window); `card-art`/`card-name` (dogs keep the dog head under a
card skin); the profile test (`side` and `lastBySide` normalise; old profiles load).

**e2e** (`tests/e2e/`):
- New `side-switch.spec.ts`:
  - The pick screen opens on Cats for a new profile. Tapping DOGS shows exactly 7 tiles, all `data-side="dog"`, and
    `html[data-pick-side="dog"]`; the selected hero is a dog.
  - Play → `html[data-match="live"]`, then `html[data-sides="dogs"]` and `window.__plWorld` shows all 3 own-team
    picks are dogs, with no duplicate.
  - Reload: the switch still shows DOGS with the same dog selected. Switching back to CATS restores the last cat.
  - Keyboard: arrow keys move the radio.
- `champions.spec.ts`: still 4 champions, and no dog has a champion badge.
- `no-zoom`, `hud-compact`, `match-touch` at 844×390 with the toggle (the Paw Trick chips stay above the fold).
- `first-match.spec.ts` stays green (match 1 still opens on Cats/Clem).
- The `startFirstMatch` helper gains an optional `side` argument.

---

## 7. Implementation order and file ownership (as v11)

**Phase 0, integration agent alone, one commit:** append the ids everywhere (§4), stub every per-dog module so it
compiles (placeholder kit returning cooldown 0, `stubMoves`, `stubFx`), the projectile kinds, the BOT_AI keys, the
casts cases, `HERO_CACHE_MAX`, and the switch UI + Profile fields (client only, no sim). Exit: `tsc` and `lint:sim`
green.

**Phase 1, five dog agents in parallel.** Each owns only `src/data/heroes/<id>.ts`, `src/sim/heroes/<id>.ts`,
`src/sim/bots/heroes/<id>.ts`, `src/render/chars/heroes/<id>.ts` (its head builder and gear live here, so
`beast.ts`/`gear.ts` stay untouched), `src/render/moves/<id>.ts`, `src/render/skillfx/<id>.ts`,
`src/ui/heroText/<id>.ts`, `src/ui/icons/<id>.ts`, `src/input/aims/<id>.ts`, `tests/unit/heroes/<id>.test.ts` and
`tests/unit/anim-<id>.test.ts`. For a shared change they ask the integration agent.

**Phase 2, integration agent:** version 13 + vendor + backend specs and fixtures (§5), the pinned test lists,
golden looks, treats, quests, cosmetics, the bridge mirror, tool lists, the overhead snowflake pips, sfx defs, and
docs (POC.md v13 addendum next to v12, GDD hero table, GAPS N4, `docs/GAMES.md`, `docs/DEVELOPMENT.md` mirrors,
`pawlegends/README.md`, ANIM-SPEC §14 briefs).

**Phase 3, tuning** (dog agents adjust only their own data file; the integration agent owns `bots.ts` and the old
heroes' `pvp`).

**Phase 4, release:** build, budget, e2e, `npm run build:client`, and commit `client/public/pawlegends-game`
together with the backend vendor folder. Deploy the backend first.

**Bundle:** first-load JS is about 317 KB of 450 (FUN-PROGRESSION-V12 constraints). Five heroes at about 3–4 KB each
fit. Measure after Phase 1 anyway; if it grows more than 25 KB, move the heroText blurbs and talent lines into the
lazy hero chunk.

---

## 8. Gate list

Run from `pawlegends/` unless noted.

**Static:**
1. `npx tsc --noEmit`: exit 0.
2. `npm run lint:sim`: ok (integers only, no `/`, no floats).

**Tests:**
3. `npx vitest run --project unit`: green (call out any failure that already existed before this work).
4. `npm run determinism -- --seeds 1000`: 0 mismatches.
5. `npm run vendor-sim:check` shows v10, v11 and v12 frozen and v13 live. In `backend/`: `npx jest src/pawlegends`,
   `npm run lint` and `npm run build` are green.

**Balance** (`npm run match -- --seeds 200 … --balance --quiet` while iterating, then `npm run match -- --gate
balance`, 2,000 seeds):
6. Length median 6:00–8:00, p95 ≤ 8:30, no safety ends, ≥ 70% core kills before Sudden Death; side 45–55%; **every
   hero, all 17, at 46–54%**; species 47–53%; 2.5–3.5 takedowns a minute; a team trailing at 3:30 wins 20–40%; a
   team 10+ takedowns down wins under 5%; tricks 47–53%. Report each new dog on its own, and Brutus and Cacklejaw
   before and after their `pvp` retune.
7. `fun1`, `fun2`, `novice` (≥ 85% against Easy, 40–60% against Normal; **report the cat human and the dog human
   separately**: v11 measured a cat novice at about 25% and a dog novice at about 42%, and the target is that the
   gap shrinks), `idle` (≤ 50%), `parked`, `feeder`, `feedNormal`, `hard` (30–48%).
8. `node tools/grade-calibrate.mjs --seeds 400 --from 1001 --check`: every role within ±5.
9. `perf-sim.test.ts`: Normal match median ≤ 1.0 s; worst case at 11:00 ≤ 1.5 s.
10. Probe extras: the Bravo flop count and "survived under 10%"; the Chili R uptime; the Marshmallow Frozen count;
    the share of dog teams with no tank or support, and their win rate.

**Render and browser:**
11. `chars.test`: Med ≤ 6,000 triangles, Low < Med, one SkinnedMesh, 28 bones, upright (watch Chili's head share and
    Marshmallow's fluff). `team-read.test`: ≥ 15% team colour, the other team < 3% (Chili's sweater, Boomer's harness,
    Nugget's bandana, Bravo's cape, Marshmallow's scarf). `readability.test`: HERO_TOP within 4%. `combat-vfx.test`: no
    gold-family colour on enemy reads (Bravo's gold hem and tiara are own-cosmetic only; check them). `springs.test`.
12. `npm run build && npm run budget`: first-load JS ≤ 450 KB gzip; total output ≤ 10 MB.
13. `npx playwright test`, including `side-switch.spec.ts`, `champions.spec.ts`, `first-match.spec.ts` and the
    844×390 specs.

**Visual:**
14. Gallery screenshots for each new dog, both teams, Low and Med: idle, Q, W, E, R, death, results win and loss, and
    the alt states (Nugget sploot, Marshmallow Frozen cube + blizzard, Bravo flop + ENCORE, Chili purse + BIG DOG +
    Rage pips, Boomer inhale + scream). Use `tools/anim/capture.mjs` with the ids added, and check by eye. Also the
    pick screen on both sides at 1440×900, 1280×720, 390×844 and 844×390.

**Release:**
15. `npm run build:client`; commit `client/public/pawlegends-game` and the backend vendor folder; deploy the backend
    first.

---

## 9. Known gaps touched (not new findings)

- GAPS N4 (third dog): closed by this spec.
- CATS-V11 "Reported, not fixed": Nap teleports home without the kit `reset` hook. Chili's Q yap queue and Nugget's
  W landing must guard against it, as Stilts does: clear `kStage` when the hero is napping or teleported.
- CATS-V11 decision 3 (touch Attack button only treats Sage as ranged) is fixed already: the range comes from hero
  data (`touchControls.ts` header). Chili, Nugget and Marshmallow need no special case.
- The novice vs Normal gap between cat and dog humans (v11 Phase 3) is expected to move with this roster; it is
  measured in gate 7, not fixed here.
