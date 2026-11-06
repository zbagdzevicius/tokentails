# Pawlegends sim v13 build spec: five new dogs and the Cats / Dogs switch

**The five:** Nugget (corgi, support), Marshmallow (Samoyed puppy, mage), Bravo (pug, tank), Chili (chihuahua,
marksman) and Howler (husky, fighter). Nugget and Marshmallow are the cute ones. Bravo, Chili and Howler are the
funny ones: a pug who fakes his own death, a tiny dog who turns huge when angry, and a husky who screams. With them
the dogs go from 2 heroes to 7 (the cats have 10). Every dog role is covered, so a dog team never has to field the
same hero twice (GAPS N4). The pick screen gets a **CATS / DOGS** switch: the player picks a side, then a hero from
that side.

None of the five is a Pink Paw shelter champion: no catalogId, no row in `shelter.ts` or in the backend champions
list. Like the v11 cats, they are originals.

Written against `c49733c2` (branch `feat/pawlegends-dogs`), revised after review at `7543be8e`. Checked against the
HeroData shape (`src/data/heroes/types.ts`), the effect primitives (`src/sim/effects/*`), the HeroKit hooks
(`src/sim/heroes/kit.ts`), the damage pipeline (`src/sim/combat/damage.ts:95-110`: `incoming` → shield → `absorb` →
`nineLives`), the World `k*` arrays (`world.ts:276-289`), `PROJECTILE_KIND` / `SRC_KIND`, `ZONE_KIND`, `fillPicks`
and `validate` (`src/sim/index.ts`), the pick screen (`src/ui/screens.ts:300-410`, `champions.css`), side swap
(`src/render/palette.ts`, `gameView.ts:551`, `matchSession.ts:470`), `tools/vendor-sim.mjs` FROZEN, and the v11 and
v12 build docs (`CATS-V11.md`, `pawlegends/docs/FUN-PROGRESSION-V12.md`).

**Decisions for the user.** Each has a default; the build goes ahead with the default unless the user says otherwise.

1. **Lord Barkus.** The request asks for cute dogs and funny ones; five slots leave no room for Barkus, a serious
   boss character. Default: he waits for the next dog wave (v14), together with Pilfer and a sausage dog
   (Longfellow, GDD §heroes). Swap option: Barkus replaces Howler as the fighter, keeping the scream as a Barkus
   skin moment.
2. **Meme names.** No real meme names and no trademarked dogs: no "Doge" or "Cheems" (CLAIMS R9 and GDD Kibo) and
   no famous internet pets. Each joke is a generic behaviour (fake death, small-dog rage, husky screaming, the
   corgi sploot), never a copied clip. Default: the five names below.
3. **Species edge.** Brutus and Cacklejaw deal 111% and take 93.5% (`pvp`) because two kits carried the whole dog
   side. Default: the new dogs start at about 10500 / 9400 and Phase 3 re-tunes all 17 heroes. The edge on the two
   old dogs probably comes down.
4. **Switch for a first-time player.** Default: **Cats**, and the DOGS tab is **locked until the first match is
   complete** (it shows its count and "after your first match"). Match 1 stays the guided Clem match.
5. **Branches.** All five get `BRANCH_TALENT: null` ("Branch coming soon"), as the v11 cats did.
6. **The husky's name.** Default: **Howler** (id `howler`). "Boomer" also reads as the "OK boomer" put-down, which
   mocks older players instead of husky screaming. The user can still pick the name.
7. **Ship count.** Five is the target, four is enough: four new dogs already end the forced mirror (N4). See the art
   gate and the cut order in §7.

---

## Review notes (revision 2)

A review of revision 1 raised 24 points. All were checked against the code named above.

| # | Point | Verdict | What changed |
|---|---|---|---|
| 1 | Marshmallow copies Duchess | Accepted | Chill removed. She is now a zone mage: W snow patch, E belly slide with haste and a small shield (no cloud), and the R end freezes cats still inside (kit timer + `root`). No `fluffPuffs`. |
| 2 | Shared `mkStack` unsafe | Accepted via 1 | Chill is gone, so no hero shares `mkStack` with Duchess. `validate` stays as it is: v13 explicitly **allows** mixed-species teams (party picks), and `sim-v13.test` pins that. |
| 3 | Bravo out-charms Gabė | Accepted | Q is a fading slow with a W refund, no charm. R is the only charm: 1.0 s, 4.5 m, 60 damage, shield. E's knockback becomes a 25% slow. |
| 4 | Two fawn pugs | Accepted | Black is the default coat (`fur` ≈ 0x2a2628, silver hem); fawn is a skin. The cape covers his full outline. New colour (item 12). |
| 5 | Flop rules | Accepted | (a) The flop clamps every hit, true damage too: it runs in `absorb`, which also sees `pure` hits (`incoming` does not). (b) A new kit hook `busy` blocks move, basics and casts while `kRT > 0`, independent of `stun`. (c) Flop and Nine Lives lock each other out. (d) 90 s cooldown, 8% heal. |
| 6 | Stale spotlight zone index | Accepted | The spotlight centre and timer live in `kHonour`, `kChain` and `kWT`; no zone lookup. |
| 7 | Chili shoots from the handbag | Accepted | `busy` covers the purse too. |
| 8 | Chili has too many escapes | Accepted | No fear on the purse exit (a 30% slow in 2.2 m); E cooldown 600; R splash hits only heroes and minions, at most 2 per shot, checked on the `clear` probe. |
| 9 | R looks 1.7× but keeps the hitbox | Accepted, other option | `radiusOf` is one value per unit kind (`units/kinds.ts:15`) and feeds every hit test; a per-hero radius would touch the hottest path for one kit. The render scale is capped at **1.35** instead (Pixel's BOXBOT is 1.45). |
| 10 | Rage tick and render RNG | Accepted | Last Rage gain tick in `kWAge`. Chili's pitch and Howler's derp eye use a render-side hash; a new test fails on `w.rng` or the sim `rng` in `src/render`. |
| 11 | Howler CC from 7 m | Accepted | R: 6 m, 75°, fear 0.75 s. Full Lungs and Dramatic Pause replaced by Echo and Snow Spray. Bots stop basics into Talk Back (new kit hook `deterBasics`). Knockback-then-fear is settled: `interrupt()` leaves `FM.Knock` alone (`status.ts:47`) and `fearT` ticks during the knock, so the kit passes `fear + EFFECTS.knockbackTicks`. |
| 12 | Colours collide | Accepted | Proposed values adopted; a Delta-E ≥ 20 check in `readability.test`. If a proposed value fails the check, the RENDER lane moves it and notes the new value here. |
| 13 | Blue DOGS tab | Accepted | Cat rose against bone amber `#e8c27a`; a test asserts neither is a `RELATION_CSS` colour. |
| 14 | 667×375 not specified | Accepted | Explainer dropped under `max-height: 420px`, "vs" glyph in the toggle, fixed 2-row grid, 32 px toggle with a 44 px hit area, a 667×375 bounding-box e2e. |
| 15 | Match 1 vs the switch | Accepted | DOGS locked until match 1 is complete. |
| 16 | Art too much for one pass | Accepted | Hedges removed, methods named, props cut, tremble replaced by a 3 Hz bob. |
| 17 | Cut order | Accepted | Art gate after the RENDER lane; cut order Howler, then Marshmallow (reworked, so she is no longer first). Never ship stub art. |
| 18 | Clip-worthiness | Accepted | Sploot camera nudge, flop drops tower and bot locks, "…bravo?" for both teams, and a new `clip` sim event (`flop`, `bigdog`, `scream`, `frozen`). |
| 19 | Herd into tower | Accepted | 4.5 m / 2 m, the herd point is clamped out of his own tower range + 1 m, no tower rule for bots, Herding Pro 2500. |
| 20 | Role-blind draws | Accepted | Gate 10 reports the share; a named Phase 3 fallback (role pass in v13) if dog-team win rate leaves 47–53%. |
| 21 | Name "Boomer" | Accepted | Howler (decision 6). |
| 22 | Projectile kinds | Partly accepted | 2 new kinds, not 0: `frisbee` (pierce disc) and `yap` (Rage keys on it). The snowball and the tear reuse `fluff` (13); render picks the look by the owner's hero (`ProjectileSnap.owner`). |
| 23 | Determinism and versioning | Accepted | v12 dog-human replay on the v12 bundle; mixed-species input explicitly allowed; 1,000-seed fuzz over 17; 200 extra seeds with Bravo and Chili on both teams. |
| 24 | Missing tests | Accepted | Listed in §6. |

Nothing was rejected outright. Item 9 takes the second option the review offered, and item 22 keeps two kinds
because the sim itself needs to tell a yap from other skillshots.

---

## As built (lane SIM, 2026-11-06)

Status: **LANE SIM done** on `feat/pawlegends-dogs` (not pushed). RENDER and PICKER can start: every client table
keyed by `HeroId` has an entry, the five dogs draw as **placeholder bodies** (`src/render/chars/heroes/<id>.ts`
`BODY`: Bravo as Sir Brutus, the others as Cacklejaw; stub moves and skill FX; first-pass icons, aims and Treat
Track palettes) and the final `bone` icon is in `src/ui/icons.ts`. Never ship the placeholder art (§7 art gate).

**Where the build differs from the spec above:**
- **Nugget R** is `Aim.Point` with reach **0** (not `r.radius`): the aim is clamped onto his ring in the cast, so a
  far aim never walks him in. The tower clamp keeps the herd point `attackRange + radius + towerMargin` from each
  allied tower and core (`herdPoint`, exported for the test).
- **Marshmallow R**: the cast wind-up (`r.windup`, 0.6 s) is the only telegraph; the blizzard zone arms at once and
  the freeze lands when `kRT` (= `r.duration`) reaches 0. If she dies first, `reset` clears `kRT` and **no freeze
  fires** (the spec allowed either; the kit only steps while she is alive).
- **Bravo**: while flopped `absorb` soaks **every** hit (not only the clamped one), so a second hit in the flop's
  tick cannot kill him. The flop also drops his swing and cast. Nine Lives still softens the clamped hit when a
  second's loss passes its line, so "stops at 1 HP" holds only for a hit Nine Lives does not cut.
- **Chili Q** fires the first yap in the cast and the other two `gap` ticks apart. Rage from yaps keys on "ability
  damage that is not the BIG DOG splash" (his only other ability damage), which is exactly the `yap` kind.
- **Bravo Q** keys its fading slow and W refund the same way (ability damage outside Stage Dive and ENCORE!).
- **`deterBasics`**: a bot that would swing at Howler in Talk Back steps back `BOT_AI.deterStep` (1.5 m) instead.
- **Treat Track**: the loop (`LOOP_REWARDS`) now runs over all 13 originals, so the dogs get the 8 loop palettes too;
  `UNLOCKS_MAX` 160 → **200** (57 track rewards + 104 loop coats).
- **Balance tuning** (Phase 3, done in this lane): the new dogs' kit numbers are the spec's except Marshmallow
  (Q 62 / +6 / rank 16, W 12 / +1 / rank 4, R 20 / +2 / rank 10) and Bravo (HP 780 +80, armour 42, flop heal 15%);
  everything else is `pvp`. Final `pvp` (dmgBp / takenBp; before → after for the old heroes):

| Hero | v12 | v13 | Gate 22 win | | Hero | v13 | Gate 22 win |
|---|---|---|---|---|---|---|---|
| Clem | 8200 / 10100 | 8850 / 9725 | 51.2% | | Sir Brutus | 11100 / 9350 → 9750 / 9575 | 48.9% |
| Sage | 10800 / 9500 | 10550 / 9325 | 48.7% | | Cacklejaw | 11100 / 9350 → 11250 / 8825 | 48.1% |
| Lambo | 10500 / 8800 | 9150 / 9125 | 53.0% | | Nugget | 9650 / 9425 | 51.3% |
| Avietė | 12100 / 8400 | 12750 / 7800 | 50.4% | | Marshmallow | 9000 / 9800 | 50.3% |
| Bengas | 11200 / 8700 | 10550 / 8700 | 48.0% | | Bravo | 11350 / 8250 | 49.1% |
| Gabė | 9500 / 9700 | 9050 / 9600 | 49.7% | | Chili | 9500 / 9425 | 52.0% |
| Meatball | 9100 / 9600 | 7900 / 9925 | 48.9% | | Howler | 9100 / 9650 | 51.3% |
| Pixel | 9400 / 9600 | 8750 / 9600 | 48.8% | | | | |
| Duchess | 11400 / 8700 | 11100 / 8550 | 49.6% | | | | |
| Stilts | 10300 / 9000 | 10900 / 8500 | 50.2% | | | | |

  The species edge on the old dogs came down as decision 3 expected (Brutus now deals less than par). Every
  `dmgBp` also took a shared 4% then 3% cut along the way to bring the pace from 3.60 to 3.43 takedowns a minute.
- **Rookie** (`DIFFICULTY_RULES.rookie`): with seven dogs a cat human met more varied dog bots and a dog human won
  match 1 too fast (fun1: length 4:47, deaths p90 5). Rookie now has `structureHpBp` 12000, `coreHpBp` 13500,
  `humanDamageBp` 13000 (was 14000), `humanTakenBp` 8500 (was 10000) and `humanRespawnBp` 5000 (was 5500).
- **Vendor**: the live v13 dir also ships `dog-replay.fixture.json` (Chili, seed 1313, Easy); the backend spec
  verifies it, and the same record labelled v12 is refused. v12 is frozen at 5bf2a938; v10 and v11 stay frozen.

**Gates** (lane SIM exit):
- Balance (gate 6, 2,000 seeds): **all pass**. Length median 7:14, p95 8:32, 0 safety ends, core kill before
  Sudden Death 92%+; side 46.8 / 53.3; species cats 49.9 / dogs 50.1; every hero 48.0–53.0% (table above); pace
  3.43 a minute; trailing at 3:30 and the 10+ deficit inside their bands; every trick 47–53%; both level-6 branches
  45–55%. (Run-to-run noise on one hero is about ±3 points at 2,000 seeds, because every match is cats vs dogs.)
- fun1, fun2, novice (Easy), idle, parked, feeder, feedNormal: pass. hard: win 39.0% passes; its "down 10+
  takedowns wins < 5%" check fails at 6.3% of 16 matches (1 match), as it did before this work (11.8% of 17 at
  `c49733c2`). novice vs Normal: 35.0% (known failing; 32.3% at `c49733c2`, so not worse).
- Grade calibration (gate 8, `--seeds 400 --from 1001 --check`): pass after refitting tank, assassin and fighter in
  `src/meta/grade.ts` (Bravo joined the tanks, Howler the fighters); losses graded A or S 34.4%.
- Gate 10: on the 2,000 balance seeds 57.1% of dog teams have no support and 28.6% no tank; the dog side wins 50.1%,
  inside 47–53%, so the role-pass fallback (§3) is not needed. In bot matches the flop, BIG DOG, the scream and the
  freeze all fire (`sim-v13.test`).
- Determinism (gate 4): `node tools/determinism.mjs --seeds 1000` all identical (all 17 heroes as the human), and the
  200 Bravo-and-Chili-on-both-teams seeds (`PAWLEGENDS_NIGHTLY=1`, `sim-v13.test`) identical.
- `vendor-sim:check`: v10, v11, v12 frozen, v13 live. Backend `npx jest src/pawlegends` (115 tests), `npm run lint`
  and `npm run build` green.

## As built (lane RENDER, 2026-11-06)

Status: **LANE RENDER done** on `feat/pawlegends-dogs` (not pushed). The placeholder bodies are gone: each dog has its
own chibi (`src/render/chars/heroes/<id>.ts`, shared head parts in `dogParts.ts`), move set (`src/render/moves/<id>.ts`,
helpers in `dogKit.ts`) and skill FX (`src/render/skillfx/<id>.ts`, helpers in `dogFx.ts`); ANIM-SPEC §14 has the
briefs. Where the build differs from §1:
- **Team read:** the dogs wear a rounded team shawl (`dogParts.shawl`), not gear.ts `mantle`: on a dog with no
  pauldrons the flat saucer read as a plate held at the chest in the lobby. Every dog shows 34–43% team colour from
  above (team-read.test).
- **Lying poses** (Nugget's sploot, Marshmallow's belly slide and snow angel, Bravo's flop) are pose definitions that
  turn and lower the body bone, not root pitch: the runtime clamps a negative root `up`, so a pitched body floated.
- **Bravo's flop** plays from the sim `clip` event (`MoveSet.clips.flop`, new `AnimDirector.clipFired`, wired in
  effects.ts and gameView.ts). **Marshmallow's ice cube** comes from the same event (`SkillFxSet.onClip`, 'frozen'):
  a translucent ice pillar with a cap for the 30 t freeze.
- **Chili's BIG DOG** size is an additive loop the director holds while the snapshot form bit is set outside the bag
  (`MoveSet.formHold`, `formHoldWhen`): it survives his other casts and basics. His purse is a pink shell (mesh FX)
  round a squashed Chili, and the handbag prop is always on his hip (no prop toggling). Rage pips show over his head on
  each basic for his own team (the resource is own-team only), not in `overhead.ts`.
- **Props not toggled:** Nugget's frisbee rides on his back (not in his mouth), Bravo's tear is always on his cheek,
  Chili's angry brows are always on (no lid mesh).
- **Sizes** (`heroSize.ts`): Chili is the smallest drawn top (2.16 m), Howler the tallest dog (3.10 m), Bravo 2.40 m
  (Sir Brutus 3.70 m). Chili's rig is `width 0.78, bodyScale 1.1, headScale 1.25` so the neck clears the upright test.
- **Sounds:** 14 zzfx voices in `audio/sfx.ts` (`nuggetBork` … `howlerArgue`); every yap's pitch is a render-side hash.
- **No camera side-on nudge** for the sploot: the fight camera has no orbit hook, so the player's own sploot gets a
  small camera punch instead.

## 0. Roster after v13

| HERO_IDS index | id | Name | Breed | Role | Element | Vibe | Difficulty | HERO_COLOR_CSS |
|---|---|---|---|---|---|---|---|---|
| 2 | `brutus` | Sir Brutus | pug knight | tank | SAND | (exists) | easy | `#d6a36a` |
| 3 | `cacklejaw` | Cacklejaw | hyena | assassin | DARK | (exists) | medium | `#9a7ac2` |
| **12** | `nugget` | Nugget | Pembroke corgi | **support** | FAIRY | cute | easy | `#c96a2a` |
| **13** | `marshmallow` | Marshmallow | Samoyed puppy | **mage** | ICE | cute | medium | `#e8f4ff` + ICE outline |
| **14** | `bravo` | Bravo | black pug (theatre) | tank | STELLAR | viral | easy | `#6b3fa0` |
| **15** | `chili` | Chili | chihuahua | **marksman** | ELECTRIC | viral | medium | `#ff5a3c` |
| **16** | `howler` | Howler | Siberian husky | **fighter** | WIND | viral | medium | `#7a86a0` |

The dogs before v13 covered only tank and assassin; they now cover all six roles (tank × 2). Every element is one
the `Element` union already has, so `types.ts` gets no new element and `ELEMENT_COLOR`, `ELEMENT_TRAIL` and the
backend `CatAbilityType` stay as they are.

**Silhouettes at game-camera scale** (each must read in one glance among the 17):

| Hero | Shape | Read |
|---|---|---|
| Nugget | a long low loaf (crouched stance), huge upright ears, a heart-shaped fluffy bum | "the low one" |
| Marshmallow | a smooth white sphere, a bobble hat and the Samoyed smile, a plume tail | "the white ball with a hat" (Duchess is a cream fluffy Persian on a cushion) |
| Bravo | a small **black** pug in a velvet cape as wide as his outline and a white ruff | "the cape" (Brutus is a fawn pug in armour with a tower shield) |
| Chili | the smallest hero, enormous ears, bug eyes, a team-coloured knit sweater; in R he grows to 1.35× | "the tiny one" |
| Howler | tall and lean, grey and white mask, ice-blue eyes, mouth always half open | "the screamer" |

---

## 1. Per-dog specs

Units: mm, mm/s, ticks at 30 Hz, bp (10000 = 1.0), arcs in 1/4096 of a turn (1024 = 90°, 853 ≈ 75°).
Every gameplay number lives in `src/data/heroes/<id>.ts` and the kit reads it by name through `abil(w, id)`.
Primitive paths below are under `src/sim/effects/`. Ranks: Q/W/E rank up at levels 2, 5 and 8; R ranks up at 7
and 10 (`growth.ts`).

**Shared sim additions used below** (§4): two optional HeroKit hooks, `busy(w, id)` (true: the hero cannot move,
basic or cast, checked in `canCast`, the basic-attack step and the move step) and `deterBasics(w, id)` (true: bots do
not start basics on this hero); a `clip` SimEvent (`{ type: 'clip'; tick; id; what: 'flop' | 'bigdog' | 'scream' |
'frozen' }`, render only, not hashed); and `PROJECTILE_KIND` `frisbee: 14`, `yap: 15`.

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
    /** Herding Time: 0.5 s wind-up; enemy heroes within 4.5 m are herded up to 2 m toward the aim point (never into his own tower's range + 1 m), take 80 (+8/lvl, +35 a rank) and are slowed 30% for 1.5 s; allied heroes in the ring get +25% speed for 3 s. */
    r: { cooldown: 2100, windup: 15, radius: 4500, push: 2000, towerMargin: 1000, dmg: 80, dmgPerLevel: 8, slowBp: 3000, slow: 45, allyHasteBp: 2500, allyHaste: 90 },
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
      { id: 'border-collie-energy', name: 'Herding Pro', mods: { r: { push: 2500 } } },
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
- **Q.** `fireSkillshot` (`projectile.ts:48`) with `PFLAG.Pierce`, `PROJECTILE_KIND.frisbee` (14) and `ON_HIT`
  slow, the way Duchess's Fluff Puff does it.
- **W.** A copy of Meatball's Big Brother (`meatball.ts:49 bigBrother`, `:75 guardLand`): pick the ally with
  `wrapTarget` (`gabe.ts:48`), dash to `dist − radii − gap`, set `kStage = 1`, and on landing call `addShield` on the
  ally plus `haste` on both. With no ally, dash `soloDash` along the aim and shield himself for half. It never
  fizzles. Clear `kStage` in `reset` and when he naps (§9).
- **E.** `root(w, id, duration)`, `kRT = duration`; `incoming()` applies `reduceBp` while `kRT > 0`; and
  `healOverTime(w, a, heal, duration)` (`heal.ts:19`) on each allied hero within `radius` at cast. Snapshot
  `SNAP_FX.Form` while `kRT > 0` (the sploot pose).
- **R.** The herd point P is the aim clamped to the ring. **Tower clamp:** for each allied alive tower or core T,
  if `dist(P, T) < T.range + towerMargin`, move P out along T→P to exactly that distance (integer `isqrt`; if P sits
  on T, push along his facing). Then for each enemy hero within `radius` (`collect` + `inRing`):
  `knockback(m, e, 2·ex − Px, 2·ey − Py, min(push, dist(e, P)), facing)` (`knockback.ts:12`). Knocking back from the
  mirror point moves the hero toward P and stops it there. Then `dealDamage` and `slow`. Allies in the ring get
  `haste`.
- No new primitive and no new World array.

**Bot** (`src/sim/bots/heroes/nugget.ts`):
- fight: Q on a foe in the 8 m line (`aimed`); W toward `hurtAlly()` when a foe is within
  `BOT_AI.nuggetPeelRange (3000)` of that ally; E when 2+ allied heroes are within 3.5 m and one is under 70%, or
  when he is focused and below 50%; R when 2+ foes are in 4.5 m, aimed at the nearest allied hero (herd them into the
  team). No tower rule.
- clear: Q through 3+ minions.
- escape: W to the ally farthest from the threat, else E only if no foe is in melee.
- New BOT_AI keys: `nuggetPeelRange 3000`, `nuggetSplootHpBp 7000`, `nuggetHerdFoes 2`.

**Render** (`src/render/chars/heroes/nugget.ts`):
- RigSpec `width 1.25, bodyScale 1.15, headScale 1.05, tier 'hero', earsLow 0`. The rig has no `legScale`: short
  legs come from a **`HERO_MOTION` crouch** (lowered hips in every clip) and the length from `width 1.25` plus the
  bum spheres. HERO_HEIGHT 2.3; HERO_RING 2.1.
- Coat: `pattern 'points'` red-and-white Pembroke (`base 0xc96a2a, deep 0xa0521f, light 0xfbe9d2, cream 0xffffff`),
  with a white blaze, chest and socks.
- Head (own builder `corgiHead` in the module): a fox-like wedge skull, a white muzzle, two **huge upright
  triangular ears** (cone geometry on the ear bones, about 1.6× a cat ear, pink inner), round dark eyes with
  catchlights, and a tongue tip out.
- Tail: hidden. A **heart-shaped fluffy bum** (two fur spheres on the hips bone, cream), so the bum reads from
  behind: the corgi meme.
- Gear: team-coloured bandana (cape + mantle for the team read), a treat pouch on the hip (team-coloured flap),
  and a frisbee held in the mouth in idle (prop on the head bone, team-coloured, hidden in the Q clip).
- HERO_MOTION: idle `sit`, run `stand` + crouch with a fast short "zoomie" stride (`stride 1.4`), cast `cheer`,
  attack a bark recoil.
- HERO_COLOR_CSS `#c96a2a`.

**Moves and VFX:**
- Q: a spin-throw; the disc spins with a team-coloured rim and a tiny paw print.
- W: dust puffs plus a heart pop over both heroes.
- E **Sploot** (signature pose): legs straight out behind, belly flat, a happy wiggle. Green heal sparkles in a
  3.5 m ring. In-match it only needs to read as "flat, glowing heal ring". For the **local player** the camera
  nudges 0.5 s toward a side-on angle (off under reduced motion).
- R: a dust ring sweeps round the ring (no ghost corgis), then the herded cats skid toward the point, with a whistle.
- `ultName` 'Herding Time!'.

**Viral moment:** the **Sploot**: the side-on camera nudge, the results-screen win pose (a sploot) and the emote are
the 6-second clips.

**Voice / emote:** sfx are zzfx defs (no recorded voice): `nuggetBork` (a short high double bark on Q and R),
`nuggetSplootSqueak` on E. Emote (T key, owned Starter): a butt wiggle facing away from the camera.

**Balance target:** 46–54% on the 2,000-seed gate. Watch the E heal stacking with Wing Wrap-style shields.

**Skins hook:** Treat Track coats `coat.nugget.tricolour` (black, tan and white), `coat.nugget.fluffy` (long-coat
cream), `coat.nugget.bread` (all toast brown: "the loaf"). `FREE_COATS` palettes recolour `base/deep/light`; the
bum, bandana and frisbee follow the team colour.

---

### 1.2 Marshmallow (`marshmallow`, index 13): cute mage (zone mage)

**Fantasy:** "A Samoyed puppy who is mostly smile. She covers the ground in snow, and anyone still in her snow day
when it ends is frozen in an ice cube."

**HeroData** `src/data/heroes/marshmallow.ts`:
```ts
/** Marshmallow, Mage (sim v13, original dog): a Samoyed puppy who covers the ground in snow and freezes cats who stay. */
import type { HeroData } from './types';

export const MARSHMALLOW: HeroData = Object.freeze<HeroData>({
  id: 'marshmallow',
  name: 'Marshmallow',
  side: 'dog',
  role: 'mage',
  pvp: { dmgBp: 10600, takenBp: 9200 },
  element: 'ICE',
  base: { hp: 470, hpPerLevel: 50, attack: 48, attackPerLevel: 5, attackEvery: 29, range: 5200, speed: 4800, armour: 16, armourPerLevel: 2 },
  /** Fresh Snow: while she stands in her own snow (W patch or R blizzard) she has +15% speed and her basics slow 15% for 1 s. */
  passive: { hasteBp: 1500, slowBp: 1500, slow: 30 },
  abilities: {
    /** Snowball: 8 m shot, stops at the first unit, 70 (+7/lvl, +18 a rank), slow 20% for 1 s. */
    q: { cooldown: 180, range: 8000, width: 1000, speed: 15000, dmg: 70, dmgPerLevel: 7, slowBp: 2000, slow: 30 },
    /** Snow Patch: within 7 m, after 0.3 s a 2.8 m patch of snow for 4 s; every 0.5 s 18 (+2/lvl, +6 a rank) and a 30% slow. */
    w: { cooldown: 330, range: 7000, windup: 9, radius: 2800, ttl: 120, every: 15, dmg: 18, dmgPerLevel: 2, slowBp: 3000, slow: 18 },
    /** Belly Slide: slide 4 m at 13 m/s, then +25% speed for 1.5 s and a 50 (+10/lvl) shield for 2 s. */
    e: { cooldown: 390, dash: 4000, speed: 13000, hasteBp: 2500, haste: 45, shield: 50, shieldPerLevel: 10, duration: 60 },
    /** SNOW DAY!: 0.6 s wind-up; a 4 m blizzard within 9 m for 4 s; every 0.67 s 28 (+3/lvl, +10 a rank) and a 25% slow. Enemy heroes still inside when it ends are Frozen: rooted 1 s. */
    r: { cooldown: 2000, windup: 18, range: 9000, radius: 4000, duration: 120, every: 20, dmg: 28, dmgPerLevel: 3, slowBp: 2500, slow: 21, freeze: 30 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 6 }, e: { cooldown: -15 }, r: { dmg: 10, cooldown: -100 } },
  talents: [
    [
      { id: 'packed-snow', name: 'Packed Snow', mods: { q: { dmg: 85 } } },
      { id: 'fresh-powder', name: 'Fresh Powder', mods: { passive: { hasteBp: 2500 } } },
    ],
    [
      { id: 'big-patch', name: 'Big Patch', mods: { w: { radius: 3500 } } },
      { id: 'warm-belly', name: 'Warm Belly', mods: { e: { shield: 80 } } },
    ],
    [
      { id: 'snow-week', name: 'Snow Week', mods: { r: { duration: 165 } } },
      { id: 'deep-freeze', name: 'Deep Freeze', mods: { r: { freeze: 45 } } },
    ],
  ],
});
```

**heroText:** title "Marshmallow", Mage, Dog. Blurb: "Pure smile. Snow on the ground, and cats who stay get
frozen."
- Passive, Fresh Snow: "In her own snow she runs faster and her hits slow."
- Q, Snowball: "A snowball that slows the first thing it hits."
- W, Snow Patch: "Drop a patch of snow that hurts and slows cats."
- E, Belly Slide: "Slide away on your belly, faster and shielded."
- R, SNOW DAY!: "A blizzard. Cats still inside when it ends freeze solid."
- Icons: `snowball`, `snowpatch`, `slide`, `blizzard`.

**Sim kit** `src/sim/heroes/marshmallow.ts`. Kit arrays: `kValor` Fresh Snow active (0/1), `kStage` 1 = slide
landing pending, `kRT` SNOW DAY! ticks to the freeze, `kHonour` / `kChain` the blizzard centre (x, y).
- `aim`: Q `Aim.Dir`. W `Aim.Point`, reach `w.range`. E `Aim.Dir`, mobility. R `Aim.Point`, reach `r.range`,
  windup.
- **Passive.** `stepKit`: scan the zone pool for a zone with `zAlive`, `zOwner[z] === id`, `zKind[z] ===
  ZONE_KIND.burst` and her within `zRadius` (the owner and kind check makes a reused index safe, as `zone.ts:114`
  does). If found, `haste(w, id, hasteBp, 2)` (refreshed each tick) and `kValor = 1`, else `kValor = 0`.
  `afterBasic`: if `kValor`, `slow(dst)`. `resource()` = 255 while `kValor` (a snowflake ring on her plate).
- **Q.** `fireSkillshot` stop-at-first, **`PROJECTILE_KIND.fluff` (13)** with `ON_HIT` slow. Render picks the
  snowball look from the owner's hero.
- **W.** `spawnBurst(w, team, id, Px, Py, radius, windup, ttl, lvl(dmg), 0, every, slowBp, slow)`.
- **E.** `dash(m, id, angle, dash, speed)`, `kStage = 1`; on landing (`kStage` 1 and `FM.None`, as Nugget's W)
  `haste` and `addShield(w, id, lvl(shield), duration)`. No zone.
- **R.** `spawnBurst(…, Px, Py, radius, windup, duration, lvl(dmg), 0, every, slowBp, slow)`. Store `kHonour = Px`,
  `kChain = Py`, `kRT = windup + duration`. `stepKit` counts `kRT` down; on the tick it reaches 0 (the blizzard's
  last tick), every enemy hero within `radius` of the stored centre gets `root(w, e, freeze)` (CC immunity still
  wins) and one `clip` event `frozen` per rooted hero. `reset` clears `kRT`. If she dies, the freeze still fires
  (the snow is already down).
- No new primitive, no new World array, no new zone kind, no stacks.

**Bot:** fight: Q on a foe in the line; W on the foe cluster, or ahead of a slowed foe; E away when a melee foe is
within `BOT_AI.marshPeelRange (3000)`; R on a 2+ foe cluster within 9 m, or on a foe below 50% that is slowed. Keep
spacing `BOT_AI.marshSpacing 4500`, and prefer standing in her own patch. New BOT_AI keys: `marshPeelRange 3000`,
`marshSpacing 4500`, `marshSnowFoes 2`.

**Render** (`src/render/chars/heroes/marshmallow.ts`):
- RigSpec `width 1.3, bodyScale 1.2, headScale 1.15, tier 'kid'` (a puppy; v11 used `kid` for Pixel). HERO_HEIGHT
  2.35.
- Coat: solid white, **smooth** (`base 0xf8f6f2, deep 0xdcd6cc, light 0xffffff, cream 0xffffff`). **No
  `fluffPuffs`.** Her read is a smooth round body, the bobble hat and the smile.
- Head `samoyedHead`: a round skull, a short white muzzle, small upright rounded triangle ears, black rimmed eyes, a
  black nose, and the **Samoyed smile** (a black lip-line arc with upturned corners, plus a pink tongue).
- Tail: a fur-cone plume on the last tail bones, curled over the back.
- Gear: team-coloured scarf (cape + mantle), a bobble hat (team-coloured bobble). No mittens.
- HERO_MOTION: idle `sit` with a head tilt, run `stand` with a bouncy puppy hop, cast `cheer`, attack a two-paw
  toss.
- HERO_COLOR_CSS `#e8f4ff` with the ICE accent as its outline (the pale fill alone fails on light UI).

**Moves and VFX:**
- Q: the snowball grows as it flies and bursts into a snow poof.
- W: a pale blue disc with a frosted edge and slow falling flakes.
- E: a belly slide with a snow spray and a shield shimmer.
- R: snow falls over the ring (no dome); she flops into it happily. At the end, the **ice cube** (signature pose,
  on the victim): a translucent cube around each rooted cat, triggered by the `frozen` clip event and held while
  `root` lasts, with a "brr" shiver.
- `ultName` 'SNOW DAY!'.

**Viral moment:** the **ice cube**: a cat that stayed in SNOW DAY! too long pops into an ice cube.

**Voice / emote:** `marshAwoo` (a tiny puppy "awoo" that cracks on the high note) on R; `marshPoof` on Q.
Emote: a head tilt, then a sneeze that shakes snow off her hat.

**Overhead:** no change (no stacks).

**Balance target:** 46–54%. Watch the freeze with Brutus's arena (a locked cat in a blizzard). If she goes over 54%,
cut `r.freeze` 30 → 23 before touching damage.

**Skins hook:** `coat.marshmallow.cream` (biscuit cream), `coat.marshmallow.cocoa` (hot-cocoa brown with a white
scarf), `coat.marshmallow.snowcone` (pastel blue tips).

---

### 1.3 Bravo (`bravo`, index 14): viral tank

**Fantasy:** "A pug who could have been a star. Every hit is a tragedy, every fight a stage, and when he is about
to die he plays dead (and it works)."

**HeroData** `src/data/heroes/bravo.ts`:
```ts
/** Bravo, Tank (sim v13, original dog): a dramatic pug who slows, holds the stage, charms on R and fakes his own death. */
import type { HeroData } from './types';

export const BRAVO: HeroData = Object.freeze<HeroData>({
  id: 'bravo',
  name: 'Bravo',
  side: 'dog',
  role: 'tank',
  pvp: { dmgBp: 10200, takenBp: 9500 },
  element: 'STELLAR',
  base: { hp: 740, hpPerLevel: 78, attack: 46, attackPerLevel: 4, attackEvery: 35, range: 1600, speed: 4700, armour: 38, armourPerLevel: 3 },
  /** Dramatic Flop: a hit that would drop him below 25% HP (any hit, true damage too) makes him play dead: the hit stops at 1 HP, 1 s untargetable and still, healing 8% max HP. 90 s lockout, shared with Nine Lives. */
  passive: { thresholdBp: 2500, duration: 30, healBp: 800, cooldown: 2700 },
  abilities: {
    /** Crocodile Tears: 6.5 m tear that stops at the first unit, 60 (+5/lvl, +15 a rank); a hero hit is slowed 50%, fading to 25%, for 1.5 s, and W's cooldown drops 1 s. */
    q: { cooldown: 270, range: 6500, width: 900, speed: 15000, dmg: 60, dmgPerLevel: 5, slowBp: 5000, slow: 15, slowTailBp: 2500, slowTail: 30, refundW: 30 },
    /** Center Stage: a 3 m spotlight at his feet for 3 s; while he stands in it he takes 35% less; enemies in it are slowed 25%. */
    w: { cooldown: 420, radius: 3000, duration: 90, reduceBp: 3500, every: 10, slowBp: 2500, slow: 12 },
    /** Stage Dive: hop up to 5 m; landing ring 2.2 m, 50 (+4/lvl, +12 a rank), slows 25% for 1 s. */
    e: { cooldown: 390, dash: 5000, radius: 2200, dmg: 50, dmgPerLevel: 4, slowBp: 2500, slow: 30 },
    /** ENCORE!: 0.6 s bow; enemy heroes within 4.5 m are charmed to him for 1 s and take 60 (+6/lvl, +30 a rank); he gains a shield of 12% max HP for 3 s. */
    r: { cooldown: 2250, windup: 18, radius: 4500, charm: 30, slowBp: 5000, dmg: 60, dmgPerLevel: 6, shieldBp: 1200, duration: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 30, cooldown: -100 } },
  talents: [
    [
      { id: 'ugly-crying', name: 'Ugly Crying', mods: { q: { slowTail: 45 } } },
      { id: 'method-actor', name: 'Method Actor', mods: { passive: { healBp: 1200 } } },
    ],
    [
      { id: 'big-spotlight', name: 'Big Spotlight', mods: { w: { radius: 4000 } } },
      { id: 'crowd-surf', name: 'Crowd Surf', mods: { e: { radius: 2800 } } },
    ],
    [
      { id: 'standing-ovation', name: 'Standing Ovation', mods: { r: { charm: 38 } } },
      { id: 'second-encore', name: 'Second Encore', mods: { r: { radius: 5500 } } },
    ],
  ],
});
```

**heroText:** title "Bravo", Tank, Dog. Blurb: "A pug who lives for the drama. Slows cats, owns the stage, fakes
his own death."
- Passive, Dramatic Flop: "About to fall? He plays dead, and nothing can touch him."
- Q, Crocodile Tears: "A tear so sad the cat it hits can barely move."
- W, Center Stage: "Drop a spotlight. On stage he is tougher; cats in it are slowed."
- E, Stage Dive: "Leap into the crowd and slow the cats you land on."
- R, ENCORE!: "Take a bow: every cat nearby has to walk up to him."
- Icons: `tear`, `spotlight`, `stagedive`, `encore`.

**Sim kit** `src/sim/heroes/bravo.ts`. Kit arrays: `kHuntT` flop lockout, `kRT` flop ticks, `kWT` spotlight ticks,
`kHonour` / `kChain` spotlight centre, `kFoe` the Q victim for the slow tail, `kWindow` ticks until the tail.
- `aim`: Q `Aim.Dir`. W `Aim.Self`. E `Aim.Point`, reach `e.dash`, mobility. R `Aim.Self`, windup.
- **Passive (flop).** Runs in **`absorb(w, id, dmg)`**, which the damage pipeline calls after shields for every hit,
  `pure` (true damage, executes) included; `incoming` is skipped for `pure`, so it is the wrong hook. If
  `kHuntT === 0`, `w.nineReady[id] <= tick` and `hp − dmg < maxHp × thresholdBp`: absorb `max(0, dmg − (hp − 1))`
  so he keeps at least 1 HP; set `w.untargT[id] = duration`, `kRT = duration`, `kHuntT = cooldown`,
  `w.nineReady[id] = max(nineReady, tick + cooldown)` (Nine Lives cannot save him again inside the lockout);
  `healOverTime(w, id, maxHp × healBp, duration)`; clear `lockId`/`lockT` on every tower and core locked on him;
  emit `clip` `flop`. In reverse, if Nine Lives fired first (`nineReady > tick`), the flop cannot fire until it
  expires. Nine Lives runs after `absorb`, so it sees the clamped hit, which is never lethal. `absorb` has no
  `MatchHandle`: if the event push or the tick needs it, widen the hook to `absorb(m, id, dmg)` (one call site,
  `damage.ts:103`). Write the order in the header comment.
- **Inputs while flopped.** `busy()` returns `kRT > 0`. No `stun` call: `stun` does nothing on a CC-immune hero,
  `busy` does not depend on it. Bots drop him as a target through `targetable` (`kinds.ts:147` checks `untargT`).
  In-flight bolts and skillshots aimed at him miss (`projectile.ts:68`), as Tumble's do. `snapFx` Form while
  `kRT > 0`.
- **Q.** `fireSkillshot` stop-at-first, **`PROJECTILE_KIND.fluff` (13)** (render picks the tear by owner). On a hero
  hit (`afterDeal`, kind 'ability', `dst` an enemy hero, from the Q cast): `slow(w, e, slowBp, slow)`, `kFoe = e`,
  `kWindow = slow`; when `kWindow` hits 0, `slow(w, kFoe, slowTailBp, slowTail)` (the slow is one slot and the
  stronger wins, `slow.ts:5`, so the fade is staged by the kit). W cooldown `max(0, cd − refundW)`.
- **W.** `spawnBurst(w, team, id, x, y, radius, 0, duration, 0, 0, every, slowBp, slow)` for the visible stage and
  the slow. The damage cut reads only kit state: `kHonour = x`, `kChain = y`, `kWT = duration`; `incoming()` cuts by
  `reduceBp` while `kWT > 0` and he is within `radius` of the stored centre. No zone index is kept.
- **E.** Lambo's Belly Flop shape (`lambo.ts:53 land`): `dash` to the point, and on landing a ring with
  `dealDamage` + `slow`. No knockback.
- **R.** On resolve: every enemy hero within `radius` gets `charm` + `slow` + `dealDamage`. Then
  `addShield(w, id, maxHp × shieldBp, duration)`. It is the only charm in his kit.
- No new primitive, no new World array.

**Bot:** fight: Q on the foe nearest an ally; E onto a foe cluster or a slowed foe; W when 2+ foes are within 3 m
or he is the dive target; R when 2+ foes are in 4.5 m and an ally is near (`allyNear`), or 1 foe under 40% with an
ally near. escape: E toward his tower; the flop is passive. clear: E on 3+ minions only after level 6. New BOT_AI
keys: `bravoEncoreFoes 2`, `bravoStageFoes 2`.

**Render** (`src/render/chars/heroes/bravo.ts`):
- RigSpec `width 1.1, bodyScale 1.05, headScale 1.1, tier 'hero', earsLow 0.6`. He is smaller than Brutus
  (HERO_HEIGHT 2.45 against 2.8) and wears no armour.
- Head: `pugHead` (`beast.ts`) with the **black default coat** (`fur 0x2a2628`, `dark 0x141214`), and big **wet
  eyes**: `dogEyes` with a second catchlight and a blue tear-drop mesh on the cheek, shown in Q and the flop.
- Gear: a long velvet **cape** in team colour that covers the **full width of his outline** from above (the team
  read) with a **silver** hem, and a white Elizabethan **ruff** (a ring of flattened torus segments on the neck,
  ribbed edge, so it does not read as fluff). No rose, no tiara.
- HERO_MOTION: idle `stand` with a chest-out pose, run a prancing high-knee stride, cast `cheer`, attack a cape
  swat.
- HERO_COLOR_CSS `#6b3fa0` (velvet).

**Moves and VFX:**
- Passive **flop** (signature pose): he clutches his chest, spins a quarter turn and falls on his back, legs up,
  tongue out. Stars and a soft "drama" sting. A "…bravo?" text pops at the end, **shown to both teams**.
- Q: an exaggerated sob, then a big blue tear arcs and splashes.
- W: a spotlight cone from above (additive cone mesh) and a ring of stage boards.
- E: a stage dive with arms out; the landing makes a crowd "wooo" puff.
- R: a deep bow; spotlights sweep in, and charmed cats walk in clapping (their charm walk clip, plus a clap overlay
  on any charmed hero). No rose rain.
- `ultName` 'ENCORE!'.

**Viral moment:** **the fake death.** The pug drops in a full theatrical faint, towers and every cat lose him, and he
pops back up. It also fits a death-recap clip: "Bravo played dead 3 times".

**Voice / emote:** `bravoSob` (a falling three-note whimper) on Q, `bravoGasp` + a small fanfare on the flop,
`bravoBow` (a fanfare) on R. Emote: a deep bow.

**Balance target:** 46–54%. Measure "Bravo survives at < 10% HP" in the probe. If he passes 54%, cut `healBp` before
the duration. The duration is the joke.

**Skins hook:** `coat.bravo.fawn` (the classic fawn pug, cream hem), `coat.bravo.opera` (cream with a phantom
half-mask, no copyrighted logo), `coat.bravo.understudy` (brindle, a paper crown).

---

### 1.4 Chili (`chili`, index 15): viral marksman

**Fantasy:** "Two kilograms of pure rage. Shakes, yaps and fires, and when he is angry enough he becomes very big."

**HeroData** `src/data/heroes/chili.ts`:
```ts
/** Chili, Marksman (sim v13, original dog): a chihuahua whose Rage turns into attack speed, then into a big dog. */
import type { HeroData } from './types';

export const CHILI: HeroData = Object.freeze<HeroData>({
  id: 'chili',
  name: 'Chili',
  side: 'dog',
  role: 'marksman',
  pvp: { dmgBp: 10400, takenBp: 9500 },
  element: 'ELECTRIC',
  base: { hp: 450, hpPerLevel: 47, attack: 50, attackPerLevel: 5, attackEvery: 27, range: 5500, speed: 5000, armour: 15, armourPerLevel: 2 },
  /** Small Dog Syndrome: each tick he takes damage from an enemy hero, and each Yap that hits a hero, adds 1 Rage (max 5; all lost 4 s after the last gain). Each Rage: +8% attack speed. */
  passive: { max: 5, window: 120, attackSpeedBpPer: 800 },
  abilities: {
    /** Yap Yap Yap: three yaps 0.17 s apart, each 7 m, stops at the first unit, 32 (+3/lvl, +8 a rank). */
    q: { cooldown: 210, count: 3, gap: 5, range: 7000, width: 700, speed: 20000, dmg: 32, dmgPerLevel: 3 },
    /** Tiny Zoomies: dash 3 m; +30% speed for 1.5 s and +1 Rage. */
    w: { cooldown: 330, dash: 3000, hasteBp: 3000, haste: 45, rage: 1 },
    /** Purse Mode: hide in a handbag for 1 s: untargetable, cannot move, attack or cast, heal 8% max HP; on the way out, enemy heroes within 2.2 m are slowed 30% for 1 s. */
    e: { cooldown: 600, duration: 30, healBp: 800, radius: 2200, slowBp: 3000, slow: 30 },
    /** BIG DOG ENERGY: 6 s, he grows: Rage locked full, basics splash 1.6 m for 60% onto up to 2 heroes or minions, 0.5 s CC immune at cast, +10% damage. */
    r: { cooldown: 1950, duration: 180, splash: 1600, splashBp: 6000, splashMax: 2, immune: 15, bonusBp: 11000 },
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
- E, Purse Mode: "Hide in a handbag: untouchable for a moment, then pop out and slow cats nearby."
- R, BIG DOG ENERGY: "Become a big dog. Max Rage, and every shot splashes."
- Icons: `yap`, `zoomies` (exists: Stilts R), `purse`, `bigdog`.

**Sim kit** `src/sim/heroes/chili.ts`. Kit arrays: `kValor` Rage (0..5), `kHuntT` Rage decay timer, `kWAge` the
tick of the last hit-Rage gain, `kStage` yaps left to fire, `kWindow` ticks to the next yap, `kFoe` the yap angle,
`kRT` purse ticks, `kWT` R ticks.
- `aim`: Q `Aim.Dir`. W `Aim.Dir`, mobility. E `Aim.Self`. R `Aim.Self`.
- **Passive.** `rage(w, id, n)`: `kValor = min(max, kValor + n)`, `kHuntT = window`, then
  `attackSpeed(w, id, kValor × attackSpeedBpPer, window)` (`buff.ts:19`; the strongest buff wins, and more Rage is
  always stronger). Rage comes from `incoming()` when the source is an enemy hero **and `kWAge[id] !== tick`** (then
  `kWAge = tick`: a burst counts once), and from Q hits on heroes (`afterDeal`, the `yap` projectile kind).
  `stepKit` counts `kHuntT` down and clears `kValor` at 0. `resource()` = `kValor × 51` (a 5-pip bar).
- **Q.** On cast: `kStage = count`, `kWindow = 0`, `kFoe` = facing. `stepKit` fires a yap when `kWindow` reaches 0,
  using `fireSkillshot` stop-at-first with `PROJECTILE_KIND.yap` (15). Then `kWindow = gap`. Stilts's Swat-Swat uses
  the same gap pattern. Clear `kStage` in `reset` and when he naps (§9).
- **W.** `dash(m, id, angle, dash)` + `haste` + `rage(w, id, rage)`.
- **E.** `untargT = duration`, `healOverTime(w, id, maxHp × healBp, duration)`, `kRT = duration`. **`busy()` returns
  `kRT > 0`**: no move, no basics, no casts in the bag (the old `root` alone stopped only movement). When `kRT`
  hits 0: `slow` every enemy hero within `radius`. `snapFx` Form while `kRT > 0`.
- **R.** `cleanse(w, id, immune)`, `kWT = duration`, `clip` `bigdog`. While `kWT > 0`: Rage stays at max, and
  `outgoing()` multiplies hero damage by `bonusBp`. The splash on basics follows Pixel's BOXBOT splash
  (`pixel.ts:156-165`, `afterDeal` on kind 'basic', splash damage as 'ability') with two limits: only **heroes and
  minions** (no towers, cores, camps or the pudding), and at most **`splashMax` (2)** targets per shot, nearest first
  (ties by entity id). The splash is 'ability' but not the `yap` kind, so it adds no Rage. `snapFx` Form while
  `kWT > 0`. Purse and R both set Form; render tells them apart by the Untargetable buff bit.
- **Hitbox.** Unchanged in R (`radiusOf` is per unit kind). The render scale is capped at 1.35 to match.
- No new primitive and no new World array.

**Bot:** fight: kite at `BOT_AI.chiliSpacing (4800)`; Q at a foe in the line; W to keep spacing when a melee foe is
within 2.5 m, else toward the foe to stay in range; E when a foe would burst him (below 35% with a foe within 3 m),
or to dodge a known ult windup aimed at him; R when Rage ≥ 3 and 2+ foes are within 6 m, or on a foe below 50% in
range. clear: Q on 3+ minions in a line. New BOT_AI keys: `chiliSpacing 4800`, `chiliPurseHpBp 3500`,
`chiliBigRage 3`.

**Render** (`src/render/chars/heroes/chili.ts`):
- RigSpec `width 0.75, bodyScale 0.8, headScale 1.35, tier 'kid'`. The smallest hero (HERO_HEIGHT 1.9) with the
  biggest head share. Check the upright test (v11: the neck must sit ≥ 0.25 H above the hips).
- Coat: smooth fawn (`base 0xd9a46a, deep 0xb07a44, light 0xf2d2a8, cream 0xf6e4c8`).
- Head `chihuahuaHead`: an apple-dome skull, a short pointed muzzle, **enormous bat ears** (about 2× a cat ear,
  thin, pink inside, splayed 30°), **bulging glossy eyes** (dogEyes, r 0.055, two catchlights), a tiny underbite tooth,
  and a **lid mesh** over each eye, shown only under the Form bit in R (the narrowed angry eyes).
- Gear: a team-coloured knit **sweater** (a jacket mesh in team colour; his team read), a pink collar with a bone
  tag, and a pink handbag prop (hidden except in E).
- Idle **bob**: 3 Hz, small, in every clip except R; off under reduced motion (no 12 Hz tremble: it aliases at
  30 fps).
- R: the Form bit scales the whole character to **1.35** (cap). His bark pitch drops.
- HERO_MOTION: idle `stand` + bob, run a fast skittering stride (`stride 1.6`), cast `cheer`, attack a recoil bark.
- HERO_COLOR_CSS `#ff5a3c` (hot-sauce red). ELECTRIC accent.

**Moves and VFX:**
- Rage pips: red "anger" marks over his head (1 per Rage), from `resource`.
- Q: three white "YAP" sound-wave crescents, drawn large enough to read on a phone.
- W: speed lines and a dust trail.
- E **purse** (signature pose): he dives into a pink handbag that zips shut; then it unzips with a cartoon "!" pop
  and a slow ring.
- R: a growth spurt with a quick squash and stretch, a short zoom-out shake (local player only, reduced motion
  respected). The basics turn into big bark shockwaves.
- `ultName` 'BIG DOG ENERGY'.

**Viral moment:** **BIG DOG ENERGY**: the tiny dog grows and his yap drops into a deep bark. Purse Mode is the second
clip.

**Voice / emote:** `chiliYap` (a high square-wave yap; the per-shot pitch comes from a **render-side hash** of the
projectile index and tick, never `w.rng`), `chiliBigBark` (the same def at 0.5× rate plus a low-pass filter) in R,
`chiliGrowl` on Rage 5. Emote: a furious bob, then a single tiny "yip".

**Balance target:** 46–54%. Risks: R splash + max Rage on a team fight; check the `clear` probe so R does not wipe a
wave. Tune `attackSpeedBpPer` first, then `splashBp`.

**Skins hook:** `coat.chili.black-tan`, `coat.chili.long-hair` (fluffy ears), `coat.chili.hot-sauce` (red with
a flame-pattern sweater).

---

### 1.5 Howler (`howler`, index 16): viral fighter

**Fantasy:** "A husky who has an opinion about everything and says it at full volume. Every ability is a different
scream."

**HeroData** `src/data/heroes/howler.ts`:
```ts
/** Howler, Fighter (sim v13, original dog): a loud husky whose screams slow, fear and finally blow cats away. */
import type { HeroData } from './types';

export const HOWLER: HeroData = Object.freeze<HeroData>({
  id: 'howler',
  name: 'Howler',
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
    w: { cooldown: 330, dash: 4500, width: 1100, dmg: 50, dmgPerLevel: 5, hasteBp: 2000, haste: 30, slowBp: 0, slow: 0 },
    /** Talk Back: 1 s of arguing: 40% less damage; each enemy hero that hits him in it is feared 0.6 s (once each). */
    e: { cooldown: 420, duration: 30, reduceBp: 4000, fear: 18 },
    /** THE SCREAM: 0.7 s inhale, then a cone 6 m, 75°: 150 (+15/lvl, +65 a rank), knocked back 2 m and feared 0.75 s. */
    r: { cooldown: 2100, windup: 21, range: 6000, arc: 853, dmg: 150, dmgPerLevel: 15, push: 2000, fear: 23 },
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
      { id: 'echo', name: 'Echo', mods: { q: { cooldown: 180 } } },
      { id: 'snow-spray', name: 'Snow Spray', mods: { w: { slowBp: 2500, slow: 30 } } },
    ],
  ],
});
```

**heroText:** title "Howler", Fighter, Dog. Blurb: "A husky with opinions. Every ability is a scream."
- Passive, Zoomie Brain: "After any ability, his next bite hits harder and slows."
- Q, AWOO: "Howl in a cone: hurts and slows cats."
- W, Derp Dash: "Charge through cats with zero plan."
- E, Talk Back: "Argue back: tougher, and cats who hit him run off."
- R, THE SCREAM: "A deep breath, then a scream that blows cats away."
- Icons: `howl`, `derpdash`, `talkback`, `scream`.

**Sim kit** `src/sim/heroes/howler.ts`. Kit arrays: `kEmpower` Zoomie Brain ticks, `kRT` Talk Back ticks,
`kCount` Talk Back fear bitmask (bit = enemy hero id; heroes are ids < 32), `kStage` 1 = Derp Dash in flight.
- `aim`: Q `Aim.Dir`. W `Aim.Dir`, mobility. E `Aim.Self`. R `Aim.Dir`, windup `r.windup`.
- **Passive.** Every `cast()` sets `kEmpower = window`. The `basic(m, id, dst, dmg)` hook (melee: the kit lands the
  hit itself, as Stilts's pounce does): if `kEmpower > 0`, `dealDamage(…, applyBp(dmg, bonusBp), 'basic')` + `slow`,
  `kEmpower = 0`, return true; else return false. `stepKit` counts `kEmpower` down. `resource()` = 255 while
  armed.
- **Q.** `collect` + `inCone` (`cone.ts`) → `dealDamage` + `slow`. Cacklejaw's Gloat shape.
- **W.** `dash` + `onDashTick` hit mask; a copy of Cacklejaw's Jeer Slash (`cacklejaw.ts:126-145`) without the
  recast, plus `slow` on each hit when `slowBp > 0` (Snow Spray). When the dash ends (`fmKind === FM.None` with
  `kStage === 1`): `haste`, `kStage = 0`.
- **E.** `kRT = duration`, `kCount = 0`. `incoming(m, id, src, dmg)`: while `kRT > 0`, cut by `reduceBp`. If `src` is
  an enemy hero whose bit is clear, `fear(w, src, fear, x[id], y[id])` and set the bit. **`deterBasics()` returns
  `kRT > 0`**, and the bot brain does not start a basic on a hero whose kit says so (it still casts at him).
- **R.** `collect` + `inCone` → `dealDamage`, `knockback(m, e, x[id], y[id], push, facing)`, then
  `fear(w, e, fear + EFFECTS.knockbackTicks, x[id], y[id])`, and `clip` `scream`. **Settled order:** `fear` calls
  `interrupt(w, e, true)`, which leaves `FM.Knock` running (`status.ts:47`), so the knockback completes; `fearT`
  ticks down during the 6 knockback ticks (`disabled` covers both), so the kit adds `knockbackTicks` to give the full
  0.75 s of running. The unit test pins: the victim travels the full 2 m, then runs for 23 ticks.
- No new primitive, no new World array.

**Bot:** fight: W to engage when a foe is within W + melee range and ≥ 1 ally is near, or when the foe is below 50%;
Q when the foe is within 4 m (aimed); the empowered basic follows through the brain's attack order. E when 2+ foes
are within 3 m, or he is below 60% and focused. R when 2+ foes are in the 6 m cone, or 1 foe below 45% within 5 m.
escape: W along `awayFrom()`. clear: Q through 3+ minions. New BOT_AI keys: `howlerEngageHpBp 5000`,
`howlerScreamFoes 2`, `howlerScreamHpBp 4500`.

**Render** (`src/render/chars/heroes/howler.ts`):
- RigSpec `width 1.0, bodyScale 1.05, headScale 1.0, tier 'hero', earsLow 0`. HERO_HEIGHT 2.85 (the tallest dog;
  check it against Stilts's 3.2 so the two do not share an outline: Howler is broad-chested, Stilts is a stick).
- Coat: `pattern 'points'` husky grey and white (`base 0x8a8f99, deep 0x4a4f59, light 0xf2f4f7, cream 0xffffff`),
  with the white mask and the dark "eyebrow" dots.
- Head `huskyHead`: a wolfish wedge skull, medium upright ears, **ice-blue eyes** (one slightly bigger: the derp
  read, chosen by a **render-side hash** of the look key, never `w.rng`), and a mouth that hangs half open with the
  tongue to one side. The rig has no jaw: the scream mouth is a **separate mouth mesh on the head bone, scaled in
  Y** in every scream clip.
- Tail: a thick curled sickle tail (`tail.thick 1.4`, curl up).
- Gear: a team-coloured **sled harness** (chest straps + a back pad; the team read; mantle in team colour), booties
  on the front paws.
- HERO_MOTION: idle `stand` with a head tilt, run a loping sled-dog stride, cast a chin-up howl pose, attack a lunge
  bite.
- HERO_COLOR_CSS `#7a86a0` (slate). WIND accent.

**Moves and VFX:**
- Q: chin up and a long "AWOO"; visible sound-wave arcs in a 4 m cone.
- W: a derp face (tongue out, eyes crossed), a dash with a snow spray.
- E: a "talking back" stance: paws planted, head bobbing, a speech bubble of "!?#!" glyphs (cartoon symbols only),
  fear arrows on the feared cats.
- R **inhale** (signature pose) then THE SCREAM: a 0.7 s inhale (chest balloons to 1.3×, eyes widen), then the
  mouth mesh opens and a cone shockwave runs out with distortion rings. Cats' fur and hats blow back. A screen shake
  for the local player (reduced motion respected).
- `ultName` 'THE SCREAM'.

**Viral moment:** **the inhale.** The 0.7 s chest balloon before THE SCREAM is the comedy beat: everyone sees it
coming and it still lands (and it is the counterplay window). On the results screen his win pose is a howl and his
loss pose is a dramatic lie-down-and-grumble.

**Voice / emote:** `howlerAwoo` (a rising sine "awoo"), `howlerScream` (noise + saw with a pitch slide, about 0.9 s,
ducked under the master limiter), `howlerArgue` (three short "woo-woo-wooo" grumbles) on E. Emote: a long grumble,
ending in a single offended "WOO".

**Balance target:** 46–54%. Risk: the R + Talk Back combo on a dive. Tune `r.fear` before `r.dmg`.

**Skins hook:** `coat.howler.red` (copper husky), `coat.howler.agouti` (wolf grey), `coat.howler.pied` (white with
patches; the derp eye is kept).

---

## 2. The CATS / DOGS switch (pick screen)

**What the player sees.** A segmented toggle at the **top-left** of the hero grid, under "Choose your legend":
`[ (paw) CATS 10 ] [ (bone) DOGS 7 ]`. The glyphs are the existing `icon('paw')` and a new `icon('bone')`, not emoji.
The active side is filled in a **neutral species colour**: the cat rose against **bone amber `#e8c27a`** for the
dogs. Neither may be a `RELATION` / `RELATION_CSS` hue (ally blue `#4da0ff`, enemy red), so nobody reads "blue = my
team = dogs"; a unit test asserts it. Below the toggle, on tall screens only, one line says what the choice means:
"You play the cats. Your enemies: the dogs." (or the reverse). Only the chosen side's heroes show in the grid.

**Behaviour:**
1. **Filtering.** `screens.ts:306` renders only `HERO_IDS.filter(h => HEROES[h].side === side)`. The other side's
   `.heroes` box keeps its `data-side` but is `hidden`, so the portrait redraw (`faces`, `screens.ts:357`) still
   works.
2. **Choosing a side picks a hero of that side.** On a switch, `c.hero` becomes `profile.lastBySide[side]` if set,
   else the side's default (`clem` / `brutus`). Then `o.onHero(h)` runs, so the lobby turntable shows the new hero
   at once and Play is never "a dog side with a cat hero".
3. **The team species follows the hero.** Nothing new is needed in the sim: `fillPicks` already gives the human's
   allies the hero's side and the enemies the other one (`src/sim/index.ts:111`), and
   `matchSession.ts:470 setSpecies(HEROES[picks[0]].side === 'dog')` already re-dresses bases, minions and cloth.
   The switch is client only: **no sim change, no replay change.**
4. **Remembered.** `Profile` (`src/meta/profile.ts`) gains `side: HeroSide` and
   `lastBySide: Partial<Record<HeroSide, HeroId>>`, both normalised in `loadProfile`: `side` defaults to
   `HEROES[p.hero].side` and an unknown id falls back. `v` stays 1 because the new fields are additive. `onHero`
   writes `lastBySide[side]`; `startMatch` writes `side`. The switch opens on `profile.side`.
5. **Match 1 lock.** Until the first match is complete (the same flag `first-match.spec` and `firstSession.ts` use),
   the DOGS tab shows its count and a lock note "after your first match", has `aria-disabled="true"`, and does not
   switch. A dare link to a dog hero overrides the lock (the dare already chose the hero). `first-match.spec` stays
   valid.
6. **Accessibility.** `role="radiogroup"` with two `role="radio"` buttons (`aria-checked`), left and right arrows
   move between them, `data-a="side"` with `data-side="cat|dog"` for the click handler.
   `document.documentElement.dataset.pickSide` = `cat|dog` for e2e and CSS.
7. **Layout.** Grid `grid-template-columns: repeat(5, minmax(0, 1fr))` with a **fixed height of 2 rows** for both
   sides, so Play and the trick chips do not move on a switch. Cats: 5 + 5. Dogs: **4 + 3, centred**, inside the same
   2-row height. The toggle is **at least 32 px tall**, with padding that gives a **44 px hit area**, at the top-left
   within thumb reach.
8. **Short screens** (`@media (max-height: 420px)`, which covers 667×375 and 844×390): the explainer line is dropped,
   and the enemy side shows inside the toggle as a small "vs" glyph (`icon('paw')` or `icon('bone')`, never emoji).
9. **Cards and champions.** A card skin is a cat costume, and both dogs already wear one (`specs.ts:342-377`). The
   new dogs keep the same rule: `skinCoat` paints the body, and the dog head stays. The champion badges are cats
   only (unchanged).
10. **Dare links and rematch** keep the hero in the link, so they already imply the side. On a dare open, the switch
    shows the dare hero's side.
11. **Analytics** (`src/analytics`): add `side` to the existing pick and match-start events (consented players only,
    as today). This gives the cat/dog pick split, the success metric for this spec.

---

## 3. Bot team composition

`fillPicks` already takes each hero of a side once before it repeats one (`fresh` vs `kin`, `src/sim/index.ts:113`).
With 7 dogs and 3 slots, **a dog team never duplicates**, and nothing in the rule changes. `validate` keeps allowing
any team (party picks can mix species or repeat a hero); v13 states that explicitly and tests it. What does change:
- The dog pool is 7 instead of 2, so every replay with a dog bot draws different heroes. That is the main reason for
  SIM_VERSION 13 (alongside the kits themselves).
- **Role spread.** `fillPicks` is uniform and role-blind. With Nugget as the dog side's only support, about 57% of
  dog bot teams have no support. Gate 10 reports that share and the dog-team win rate. **Named Phase 3 fallback:** if
  the dog-team win rate falls outside 47–53%, do a role pass in v13 (draw at most one of each role until the roles
  run out, still deterministic on the seed). It is not deferred to v14.
- Rookie and Easy: `scriptFrom`/`enemiesToHuman` and the human damage edge were tuned while cats were 10 of 12
  picks. Re-run `novice` and `fun1` for **a dog human against cat bots** and **a cat human against 7 possible dogs**
  separately (§8).

---

## 4. Shared changes (as v11, append only)

**HeroId and HERO_IDS.**
- `types.ts`: `HeroId` gains `'nugget' | 'marshmallow' | 'bravo' | 'chili' | 'howler'` at the end.
- `HERO_IDS` becomes `[..., 'stilts', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler']`, giving indices 12–16.
- Append in the same order in: `HEROES`, `BRANCH_TALENT` (all `null`), `KITS` (`kit.ts:83`), `PawlegendsHeroId`
  (`tools/vendor-sim.mjs:181`), `PAWLEGENDS_HEROES` (`client/components/pawlegends/bridge.ts`), and the tool lists
  (`headless-match.mjs`, `grade-calibrate.mjs`, `lib/fuzz-entry.ts`, `anim/capture.mjs`).
- Hard caps: `w.sub` is a Uint8 and 16 < 0x80. No index constant above 16, so no `lint-sim: allow` is needed.

**Sim engine additions (small):**
1. `PROJECTILE_KIND` (`data/towers.ts:37`): append `frisbee: 14, yap: 15`, and append `Kind.Hero` × 2 to
   `SRC_KIND` (`combat/projectile.ts:28`). Both count as ability damage. The snowball and the tear reuse `fluff` (13);
   `projectileView.ts` picks their look by the owner's hero.
2. HeroKit hooks (`kit.ts`), both optional: `busy?(w, id): boolean`, checked in `canCast`, in the basic-attack step
   (`combat/attack.ts`) and in the hero move step (`units/hero.ts`); `deterBasics?(w, id): boolean`, checked in the
   bot brain (`bots/brain.ts`) before starting a basic. `absorb` may widen to take the `MatchHandle` (§1.3).
3. SimEvent `clip` (`api.ts`): `{ type: 'clip'; tick; id; what: 'flop' | 'bigdog' | 'scream' | 'frozen' }`. Render
   and share tooling only; events are not part of the state hash.
4. **No new primitive, no new World array, no new zone kind, no stacks.** Stages, rage and timers use the existing
   `k*` arrays (`kWAge` for Chili's last Rage tick; `kHonour`/`kChain` for stored centres). If an agent needs a new
   array, the SIM lane adds it to `hashedArrays` (`world.test` enforces this).
5. Snapshot: no layout change. The new heroes use the existing `form` fx bit (Nugget sploot, Bravo flop, Chili purse
   and BIG DOG) and `resource` (Nugget pouch, Marshmallow Fresh Snow, Chili Rage, Howler Zoomie Brain).
   `protocol.test` already covers the round trip.
6. Bots: explicit `case` lines for all five in `fightCast`, `clearCast` and `escapeCast` (`casts.ts`), each
   delegating to `src/sim/bots/heroes/<id>.ts`. The `default:` stays a no-op (v11). BOT_AI keys as listed per dog.

**Client tables** (each new entry imports from the hero's own module, as v11 did): `specs.ts` heroBase case,
`HERO_MOTION`, `HERO_HEIGHT`, `HERO_TOP`, `HERO_SPRINGS`, `HERO_SCALE`/`HERO_RING`, `HERO_COLOR_CSS`
(`palette.ts`), `ultName`/`heroAccentRaw`, `HERO_TEXT`, icons `P`, `heroAims`, `HERO_ANIM` (moves, skillfx), sfx
defs (`sfxDefs.js` gets the zzfx arrays; it is a PPK-lifted file, so mark each hand edit with `pawlegends:`).
`HERO_CACHE_MAX` 48 → 64 (`render/chars/index.ts:43`).

**Meta (none of the five are champions):**
- `quests.ts`: 5 `win_<id>` quests (pool 21 → 26; the rotation length follows).
- `treats.ts`: `NAME` entries; `TRACK_ORIGINALS` gains the 5 with 3 coats each, appended after the current last
  reward (+15). Each coat gets a `FREE_COATS` palette (`render/cosmetics.ts`). Count the new unlock total against
  `UNLOCKS_MAX = 160` (`profile.ts:82`) and raise it in the same commit if needed (test the migration).
- `grade.ts`: no new role; rerun `grade-calibrate --check`.
- GAPS N4 → done. GDD hero table: add the five under "Isle of Woof", move Barkus/Pilfer to the next wave.

**heroText number keys.** `reachAndTimer`/`dmgOf` (`heroText.ts`) learn `count` ("×3"), `healBp`/`shieldBp` (as a %
of max HP), `freeze`, `splashMax` and `slowTail`. `push`, `charm`, `splash` and `radius` already exist since v11.

---

## 5. SIM_VERSION 13 plan (exactly as v11 → v12)

1. Check the frozen v12 copy: `git diff 5bf2a938bc520f7dc38eb03f068b3edeb6e53fc7 HEAD --
   ../backend/src/vendor/pawlegends-sim/v12` must be empty (it is at `c49733c2`; `ally-blue` was client-only).
2. `src/sim/version.ts`: `SIM_VERSION = 13`.
3. `tools/vendor-sim.mjs` FROZEN: add
   `{ simVersion: 12, commit: '5bf2a938bc520f7dc38eb03f068b3edeb6e53fc7', from: 'backend/src/vendor/pawlegends-sim/v12', bundle: '59426998be81a7439eba33c06b81635840f34a5ec26adc368e38210159e51531', extra: ['forfeit-replay.fixture.json'] }`.
   Follow commit `58db7391` (the v12 vendor step) line for line.
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
   tuning change, right before the final sim commit (expect "v10 (frozen), v11 (frozen), v12 (frozen), v13"). Then
   `cd ../backend && npx jest src/pawlegends && npm run lint && npm run build`. **Deploy the backend before any
   client build that ships v13** (`vendor-sim:check-remote`).
7. **Collision risk:** branch `feat/pawlegends-mp` (party referee API, commits `e012f0ce`, `2c9b0b51`) also edits
   `vendor-sim.mjs` and the vendored facade, and adds a `SIM_HASH`. Whichever lands second rebases its vendor step
   and re-runs `vendor-sim`. Never hand-merge the generated bundle.
8. Scores still save only through `POST /user/catbassadors/live`. No new write path.

---

## 6. Tests and e2e to add

**New, per dog** (templates: `tests/unit/heroes/gabe.test.ts` + `kit-helpers`, `tests/unit/anim-gabe.test.ts`):
- `tests/unit/heroes/<id>.test.ts`, one per dog:
  - nugget: the pouch heals the weakest ally; herd moves foes toward the point and never past it; **the herd point
    is clamped out of his own tower range + 1 m**; the sploot roots and heals.
  - marshmallow: the snow patch slows and damages; Fresh Snow only in her own burst zone (a reused zone index of
    another owner does not count); **an enemy hero still inside at the blizzard's last tick is rooted `freeze`
    ticks**, one that left is not, a CC-immune one is not; one `frozen` clip event per rooted hero.
  - bravo: the flop fires once below 25%, he survives the killing blow **and a `pure` execute**, 90 s lockout,
    untargetable (a tower bolt misses, **a skillshot already in flight misses**, tower `lockId` is cleared);
    **no move, basic or cast while flopped even when CC-immune**; **Nine Lives plus the flop give only one survival
    inside the lockout, in both orders**; the Q fading slow and the W refund; the spotlight cut only inside the
    stored centre.
  - chili: Rage gains once per tick (`kWAge`), decay, the attack-speed buff grows; 3 yaps 5 ticks apart;
    **no basics, casts or movement in the purse**; the purse-exit slow (no fear); **the R splash hits at most 2,
    heroes and minions only, never a tower**; the splash adds no Rage.
  - howler: the empowered basic after a cast; Talk Back fears each attacker once; **bots stop starting basics on him
    during Talk Back**; the R knockback travels the full 2 m, then the fear runs 23 ticks.
- `tests/unit/anim-<id>.test.ts` × 5.
- `tests/unit/sim-v13.test.ts`: `SIM_VERSION === 13`; the 2 new projectile kinds are > hero and have SRC_KIND
  `Kind.Hero`; `fillPicks` never duplicates within a dog team across 1,000 seeds; every dog appears on both sides of
  the draw; **a v12 replay with a dog human (`brutus`) verifies on the v12 bundle**; **a v13 input with a
  mixed-species team passes `validate` and replays deterministically** (explicitly allowed).
- `tests/unit/render-no-sim-rng.test.ts`: fails if any file under `src/render` reads `w.rng` or imports
  `src/sim/rng`.
- `readability.test.ts`: a new **Delta-E (CIE76 on Lab) ≥ 20** check across all 17 `HERO_COLOR_CSS` entries.
- `side-colors.test.ts`: the toggle colours are not `RELATION_CSS.ally` / `.enemy`.

**Update** (the v11 list plus the counts): `picks.test.ts` (dog list, the "seen" set, **no duplicate on either
side**); `bots.test.ts` (the 5 cast Q/W/E/R); `determinism.test.ts` + `fuzz-entry.ts` (`seed % HERO_IDS.length`, so
`--seeds 1000` covers all 17 as the human); **200 extra determinism seeds with custom picks putting Bravo and Chili on
both teams** (untargetable during projectile flight is order-sensitive); `skins-chars.test.ts` and
`tests/fixtures/skins/golden-looks.json` (new keys); `anim/timing.contract.test.ts`; `combat-vfx.test.ts` (melee list
+ `bravo`, `howler`); `grade.test.ts`; `gaps-wave-a.test.ts` (reward count, quest pool, window); `card-art` /
`card-name` (dogs keep the dog head under a card skin); `skins-profile.test.ts` (`side` and `lastBySide` normalise;
old profiles load).

**e2e** (`tests/e2e/`):
- New `side-switch.spec.ts`:
  - A new profile opens on Cats with DOGS **locked** ("after your first match"); after a completed match DOGS unlocks.
  - Tapping DOGS shows exactly 7 tiles, all `data-side="dog"`, and `html[data-pick-side="dog"]`; the selected hero
    is a dog.
  - Play → `html[data-match="live"]`, then `html[data-sides="dogs"]` and `window.__plWorld` shows all 3 own-team
    picks are dogs, with no duplicate.
  - Reload: the switch still shows DOGS with the same dog selected. Switching back to CATS restores the last cat.
  - Keyboard: arrow keys move the radio.
  - At **667×375** and 844×390: the toggle, the grid, Play and the trick chips all have bounding boxes inside the
    viewport, and Play does not move between CATS and DOGS.
- `champions.spec.ts`: still 4 champions, and no dog has a champion badge.
- `no-zoom`, `hud-compact`, `match-touch`, `lol-hud`, `rail`, `progression` at their pinned viewports (844×390 and
  667×375) with the toggle.
- `first-match.spec.ts` stays green (match 1 opens on Cats/Clem, DOGS locked).
- The `startFirstMatch` helper gains an optional `side` argument (it seeds a profile with match 1 complete when
  `side` is `dog`).

---

## 7. Lanes, file ownership and order

The build runs as three lanes. **SIM** runs first and alone. When SIM is committed, **RENDER** and **PICKER** run in
parallel: their file sets are disjoint. A need that crosses RENDER and PICKER waits until both finish; no lane edits
a file another lane owns. SIM may touch a RENDER or PICKER file only to add a compile stub, before they start.

Paths are relative to `pawlegends/` unless they start with `../`.

### LANE SIM (first, alone)

Scope: hero data, kits, bots, engine hooks, SIM_VERSION 13, vendor, backend vendored copy, unit tests, headless
balance, meta data tables, and **compile stubs** for every client table keyed by `HeroId`, so `tsc` is green before
RENDER and PICKER start.

Owns (writes):
- `src/data/heroes/{nugget,marshmallow,bravo,chili,howler}.ts`, `src/data/heroes/index.ts`,
  `src/data/heroes/types.ts`
- `src/data/towers.ts` (`PROJECTILE_KIND`), `src/data/bots.ts` (BOT_AI keys)
- `src/sim/heroes/{5 ids}.ts`, `src/sim/heroes/kit.ts` (KITS, `busy`, `deterBasics`, `canCast`)
- `src/sim/combat/projectile.ts` (`SRC_KIND`), `src/sim/combat/attack.ts` (`busy` gate), `src/sim/combat/damage.ts`
  (only if `absorb` widens), `src/sim/units/hero.ts` (`busy` move gate), `src/sim/api.ts` (`clip` event),
  `src/sim/version.ts`, `src/sim/index.ts` (only for the Phase 3 role-pass fallback)
- `src/sim/bots/casts.ts`, `src/sim/bots/brain.ts` (`deterBasics`), `src/sim/bots/heroes/{5 ids}.ts`
- `src/ui/heroText/{5 ids}.ts`, `src/ui/heroText.ts` (HERO_TEXT entries and the new number keys)
- `src/meta/quests.ts` (5 `win_<id>`), `src/meta/treats.ts` (`NAME`, `TRACK_ORIGINALS` coat ids),
  `src/meta/profile.ts` (`UNLOCKS_MAX` only, if the count needs it), `src/meta/grade.ts` (only if calibration moves)
- **Compile stubs only** (one entry per id pointing at a per-hero stub; RENDER and PICKER fill them later):
  `src/render/chars/specs.ts`, `src/render/chars/heroSize.ts`, `src/render/chars/index.ts` (`HERO_CACHE_MAX`),
  `src/render/views/models.ts`, `src/render/anim/{common,registry,timing}.ts`, `src/render/palette.ts`
  (`HERO_COLOR_CSS` with the §0 values), `src/render/cosmetics.ts` (`FREE_COATS` placeholders),
  `src/render/chars/heroes/{5 ids}.ts`, `src/render/moves/{5 ids}.ts`, `src/render/skillfx/{5 ids}.ts`,
  `src/ui/icons.ts` + `src/ui/icons/{5 ids}.ts` (stub glyphs, **plus the final `bone` icon** that PICKER needs),
  `src/input/abilities.ts` + `src/input/aims/{5 ids}.ts`, `src/ui/collection.ts`, `src/embed/integrate.ts`,
  `src/app/app.ts` (only the `Record<HeroId>` entries)
- Tools: `tools/vendor-sim.mjs`, `tools/vendor-sim.test.mjs`, `tools/headless-match.mjs`,
  `tools/grade-calibrate.mjs`, `tools/lib/fuzz-entry.ts`
- Backend: `../backend/src/vendor/pawlegends-sim/**` (generated), `../backend/src/pawlegends/pawlegends-live.spec.ts`,
  `pawlegends-live.ts`, `pawlegends-replay.dto.ts`, `pawlegends-replay.worker.ts`, the re-recorded fixtures
- Client mirror: `../client/components/pawlegends/bridge.ts` (`PAWLEGENDS_HEROES`)
- Tests: `tests/unit/heroes/{5 ids}.test.ts`, `tests/unit/sim-v13.test.ts`, `sim-v12/v11/v10/v7.test.ts`,
  `round2.test.ts`, `picks.test.ts`, `bots.test.ts`, `determinism.test.ts`, `grade.test.ts`, `gaps-wave-a.test.ts`,
  `wave-c.test.ts`, `world.test.ts` (only if an array is added)
- Docs: this file (status), `../docs/plans/moba/GAPS.md` (N4), the GDD hero table, POC.md v13 addendum,
  `../docs/DEVELOPMENT.md` / `../docs/GAMES.md` mirrors

Exit: `tsc`, `lint:sim`, unit tests, `determinism --seeds 1000` + the 200 Bravo/Chili seeds, the balance gates 6–10,
`vendor-sim:check` and the backend jest/lint/build all green; committed.

### LANE RENDER (after SIM, parallel with PICKER)

Scope: models, animations, VFX, portraits, sounds, cosmetics, overhead cues, clip-event consumers, gallery.

Owns (writes):
- `src/render/chars/heroes/{5 ids}.ts` (head builders and gear live here; `beast.ts`, `chibi.ts` and `gear.ts` stay
  untouched)
- `src/render/moves/{5 ids}.ts`, `src/render/skillfx/{5 ids}.ts`
- `src/render/chars/specs.ts`, `src/render/chars/heroSize.ts`, `src/render/chars/index.ts`,
  `src/render/views/models.ts`, `src/render/views/projectileView.ts` (snowball and tear looks by owner; frisbee and
  yap looks), `src/render/anim/{common,registry,timing,director}.ts`, `src/render/fx/{combatVfx,lifecycle}.ts`,
  `src/render/effects.ts`, `src/render/feelEvents.ts` (the `clip` event), the camera module that holds the shake
  (sploot side-on nudge), `src/app/matchSession.ts` (only if the clip hook or camera nudge needs wiring)
- `src/render/palette.ts` (`HERO_COLOR_CSS` adjustments if Delta-E fails), `src/render/portraits.ts`,
  `src/render/cosmetics.ts` (`FREE_COATS` palettes)
- `src/ui/icons.ts` (hero glyphs only; the `bone` icon is final from SIM) + `src/ui/icons/{5 ids}.ts`
- `src/input/abilities.ts` + `src/input/aims/{5 ids}.ts`
- `src/ui/overhead.ts` (Rage pips, "…bravo?" for both teams)
- `src/audio/sfxDefs.js`, `src/audio/sfx.ts`
- `src/gallery/{main,demo,scenarios}.ts`, `tools/anim/capture.mjs`
- Tests: `tests/unit/anim-{5 ids}.test.ts`, `tests/unit/render-no-sim-rng.test.ts`, `readability.test.ts`
  (Delta-E), `chars.test`, `team-read.test`, `combat-vfx.test.ts`, `springs.test`, `hero-size.test.ts`,
  `skins-chars.test.ts`, `tests/fixtures/skins/golden-looks.json`, `anim/timing.contract.test.ts`,
  `desktop-controls.test.ts`
- Docs: `docs/ANIM-SPEC.md` §14 briefs (per dog: the shared clip set plus one signature pose: sploot, ice cube,
  flop, purse, inhale)

Exit: gates 11, 12 and 14 (the art gate) green.

### LANE PICKER (after SIM, parallel with RENDER)

Scope: the CATS/DOGS switch, side choice and memory, the match-1 lock, and every lobby, card, store or roster list
that enumerates heroes; e2e.

Owns (writes):
- `src/ui/screens.ts`, `src/ui/champions.css`, the pick-screen rules in `src/ui/ui.css` (no other rules there)
- `src/meta/profile.ts` (`side`, `lastBySide`, normalisation; `UNLOCKS_MAX` stays as SIM left it)
- `src/app/app.ts` (side wiring, match-1 lock, dare open), `src/app/firstSession.ts` (lock flag, if needed)
- `src/ui/cards/**`, `src/ui/cards.css`, `src/ui/collection.ts`, `src/ui/store.ts`, `src/ui/slotTip.ts`,
  `src/ui/talents.ts`, `src/ui/scoreboard.ts`, `src/meta/roster.ts`, `src/meta/cardName.ts`, `src/embed/integrate.ts`
  (only where they list or group heroes by side)
- `src/share/dare.ts`, `src/analytics/posthog.ts` (`side` on pick and match-start)
- Tests: `tests/unit/side-colors.test.ts`, `skins-profile.test.ts`, `card-art.test.ts`, the `card-name` test,
  `tests/e2e/side-switch.spec.ts` (new), `tests/e2e/helpers.ts` (`side` argument), `champions.spec.ts`,
  `first-match.spec.ts`, `no-zoom`, `hud-compact`, `match-touch`, `lol-hud`, `rail`, `progression`, `lobby.spec.ts`,
  `store.spec.ts`, `skins.spec.ts`, `treat-track.spec.ts` (only where hero counts change)
- Docs: `pawlegends/README.md` (the switch)

Exit: gate 13 green.

### Order

1. **SIM**: data, kits, hooks, bots, stubs, tests, balance probe and tuning, then version 13 + vendor + backend.
   One or more commits; the vendor commit is last.
2. **RENDER ∥ PICKER.**
3. **Art gate** (gate 14): a dog ships only if its gallery shots pass. Never ship stub art.
   **Cut order if the gate fails:** (1) Howler, (2) Marshmallow. Bravo and Chili carry the clips, and Nugget is the
   support the dog side lacks. Four dogs close N4. A cut reopens SIM: remove the id from the sim and every table,
   re-run the balance gate and the vendor step (the bundle changes).
4. **Phase 3, tuning** (SIM lane data files and `bots.ts` only; the old heroes' `pvp`), including the role-pass
   fallback (§3) if needed. Re-vendor after the last change.
5. **Release:** build, budget, e2e, `npm run build:client`, and commit `client/public/pawlegends-game` together with
   the backend vendor folder. Deploy the backend first.

**Bundle:** first-load JS is about 317 KB of 450 (FUN-PROGRESSION-V12 constraints). Five heroes at about 3–4 KB each
fit. Measure after RENDER; if it grows more than 25 KB, move the heroText blurbs and talent lines into the lazy hero
chunk.

---

## 8. Gate list

Run from `pawlegends/` unless noted.

**Static:**
1. `npx tsc --noEmit`: exit 0.
2. `npm run lint:sim`: ok (integers only, no `/`, no floats).

**Tests:**
3. `npx vitest run --project unit`: green (call out any failure that already existed before this work).
4. `npm run determinism -- --seeds 1000`: 0 mismatches (all 17 as the human), plus 200 seeds with Bravo and Chili on
   both teams.
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
10. Probe extras: the Bravo flop count and "survived under 10%"; the Chili R uptime and minions killed per R on the
    `clear` probe; the Marshmallow freeze count; **the share of dog teams with no support (expected about 57%) and
    with no tank, and their win rates**. If the dog-team win rate is outside 47–53%, run the role-pass fallback (§3).

**Render and browser:**
11. `chars.test`: Med ≤ 6,000 triangles, Low < Med, one SkinnedMesh, 28 bones, upright (watch Chili's head share).
    `team-read.test`: ≥ 15% team colour, the other team < 3% (Chili's sweater, Howler's harness, Nugget's bandana,
    Bravo's cape, Marshmallow's scarf). `readability.test`: HERO_TOP within 4% and the Delta-E ≥ 20 check.
    `combat-vfx.test`: no gold-family colour on enemy reads (Bravo's hem is silver now). `springs.test`.
    `render-no-sim-rng.test`.
12. `npm run build && npm run budget`: first-load JS ≤ 450 KB gzip; total output ≤ 10 MB.
13. `npx playwright test`, including `side-switch.spec.ts` (667×375 and 844×390), `champions.spec.ts`,
    `first-match.spec.ts` and the pinned-viewport specs.

**Visual (art gate):**
14. Gallery screenshots for each new dog, both teams, Low and Med: idle, Q, W, E, R, death, results win and loss, and
    the signature poses (Nugget sploot + camera nudge, Marshmallow ice cube + snowfall, Bravo flop, Chili purse + BIG
    DOG + Rage pips, Howler inhale + scream). Use `tools/anim/capture.mjs` with the ids added, and check by eye. Also
    the pick screen on both sides at 1440×900, 1280×720, 390×844, 844×390 and 667×375. A dog that fails is cut per
    §7.

**Release:**
15. `npm run build:client`; commit `client/public/pawlegends-game` and the backend vendor folder; deploy the backend
    first.

---

## 9. Known gaps touched (not new findings)

- GAPS N4 (third dog): closed by this spec.
- CATS-V11 "Reported, not fixed": Nap teleports home without the kit `reset` hook. Chili's Q yap queue, Nugget's W
  landing and Marshmallow's E landing must guard against it, as Stilts does: clear `kStage` when the hero is napping
  or teleported.
- CATS-V11 decision 3 (touch Attack button only treats Sage as ranged) is fixed already: the range comes from hero
  data (`touchControls.ts` header). Chili, Nugget and Marshmallow need no special case.
- The novice vs Normal gap between cat and dog humans (v11 Phase 3) is expected to move with this roster; it is
  measured in gate 7, not fixed here.

## 10. QA fixes (2026-11-06, before release)

- **Fake shield (P0).** Bravo and Marshmallow keep a spot's x-coordinate in `kHonour`, and the snapshot and
  `refreshFlags` added `kHonour` to every hero's shield (a 40,000+ point shield: bars looked empty). Now only Sir
  Brutus's Honour and Pixel's plate count (`kitShield`, `sim/map/brush.ts`). Bravo's spotlight and Chili's BIG DOG
  (both `kWT`) no longer set `Buff.Blocking`, which drew Clem's block pose over them.
- **Nap loop.** A retreating or defending bot napped whenever no enemy *hero* was near; minion hits broke the nap and
  it napped again (Bravo's flop kept him alive for up to 84 s of it). Bots now never nap while a non-hero enemy unit
  is aiming at them within `napSafeRange` (`underFire`, `sim/bots/casts.ts`); they walk home instead. Bravo's
  longest broken-nap chain in 300 Normal seeds dropped from 121 naps / 84 s to 7 naps / 4 s.
- **Bots.** Chili hides in the purse when focused below 60% HP (his E went unused in 38% of Easy slots); Nugget also
  herds one foe below 45% toward an ally.
- **Look.** Marshmallow's team colour is a trim (hat cuff, pompom, a slim scarf): she reads as the white ball in a
  match. Bravo's coat is a slate charcoal with a lilac sheen and his card is light lilac (a black pug on dark purple
  was a smudge). SNOW DAY! dumps opaque snow puffs (additive stars vanished on the grass). "BIG DOG ENERGY!" pops
  above his grown head and the overhead plate. The gallery sets Chili's form bit so the 1.35× swell shows there.
- **Words.** On the dog side Hiss is Growl and Purr-ify is Shake Off (same trick, same numbers); the squad panel says
  "pets". The dog grid starts at the left edge like the cat grid, so a switch does not move the first card.
