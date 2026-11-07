# Pawlegends sim v15 build spec: three more dogs (10 cats, 10 dogs)

**The three:** Rocket (greyhound, marksman), Frankie (dachshund in a hot-dog costume, assassin) and Domino
(dalmatian, mage). With them the dogs go from 7 heroes to 10, the same as the cats, and **each side has the same
roles**: 1 fighter, 2 marksmen, 2 tanks, 2 assassins, 2 mages and 1 support. One of them is cute (Domino), and two are
the joke heroes in the style of the v14 wave: a racing dog who sprints flat out and then falls asleep on his back, and a
sausage dog who stretches to 9 m long.

They ship as **sim v15**. The released v14 (seven dogs, party play) is frozen in the backend vendor tree the same
way v13 was frozen when v14 shipped. The backend verifies 10 to 15. `PARTY_SINCE` stays 13. The landing switches to
20 heroes through the build stamp, in the release commit and never before it.

None of the three is a Pink Paw shelter champion: no catalogId, no row in `shelter.ts` and none in the backend
champions list. They are originals, like the v11 cats and the v14 dogs.

Written against `6c79f59a` (origin/main, sim v14 live), branch `feat/pawlegends-dogs-v15`. It follows the method of
`DOGS-V13.md`: lanes SIM, then RENDER ∥ PICKER, the balance gate, the vendor freeze and the landing stamp. Read
that file first. This spec repeats a rule from it only where v15 changes it. The shapes used below were checked
against: the HeroData shape (`src/data/heroes/types.ts`), the effect primitives (`src/sim/effects/index.ts`), the
HeroKit hooks (`src/sim/heroes/kit.ts:69-113`, including `busy`, `deterBasics` and `absorb(m, …)` from v14),
`PROJECTILE_KIND` (`src/data/towers.ts:40`, 0–15), `ON_HIT` / `PFLAG` (`src/sim/effects/projectile.ts`), `fear` / `charm`
(`src/sim/effects/fear.ts`), the zone damage path (`zone.ts:97`, kind `'ability'`), `fillPicks`
(`src/sim/index.ts:103`, 3 slots a team), `ClipKind` (`src/sim/api.ts:326`), `EntitySnap.stacks` (`api.ts:224`),
`HERO_BUILD` (`src/render/chars/heroSize.ts`), `HERO_COLOR_CSS` (`src/render/palette.ts:66`), `tools/vendor-sim.mjs`
FROZEN (`:59-100`) and the landing roster (`client/components/pawlegends/landing/roster.ts`).

**Decisions for the user.** Each has a default. The build goes ahead with the default unless the user says
otherwise.

1. **Which three roles.** Default: **assassin, mage and marksman.** The dogs today have 2 tanks and 1 of every other
   role. The cats have 1 fighter, 2 marksmen, 2 tanks, 2 assassins, 2 mages and 1 support. These three roles make
   the two sides match role for role, so matchmaking role preferences (`PARITY.md` M1b, the open matchmaking branch's
   `roles?` field) work the same on both sides. The audit's Golden Retriever "fetch" support would make 2 dog
   supports against 1 cat support. Default: the Retriever waits for the next wave (v16) with Lord Barkus (fighter)
   and Pilfer (support).
2. **No meme dogs.** CLAIMS R9 and DOGS-V13 decision 2 still apply: no "Doge", no Shiba in sunglasses (it reads as
   the Doge meme whatever its name), no famous internet pets. Bravo is already the pug, so there is no sneezing pug.
   Every joke is a generic dog behaviour: the greyhound "roach" nap, the long dog, a dalmatian's spots.
3. **Longfellow.** The GDD lists Longfellow as a dachshund marksman (P3). The dachshund is now **Frankie, an
   assassin**, because the dogs need a second assassin and a long low body reads well as one. Default: drop
   Longfellow from the GDD table. Rocket takes the marksman slot.
4. **Branches.** All three get `BRANCH_TALENT: null` ("Branch coming soon"), as the v11 cats and v14 dogs did.
5. **Ship count.** Three is the target, so that the sides are 10 v 10. If the art gate cuts one, two still ship (see
   the cut order in §7). The landing and the lede then say what actually shipped.
6. **Mixed-species party teams.** Unchanged: `validate` allows them (v14). Domino's Spots get their own World arrays
   (§4) so that a Duchess and a Domino on the same mixed team never share a stack counter.

## As built (lane SIM, 2026-11-07)

Status: **LANE SIM done** on `feat/pawlegends-dogs-v15` (committed locally, not pushed). RENDER and PICKER can start:
every client table keyed by `HeroId` has an entry. The three dogs draw as **placeholder bodies**
(`src/render/chars/heroes/<id>.ts` `BODY`: Rocket and Domino as Howler and Marshmallow, Frankie as Nugget), with stub
moves and skill FX, first-pass icons (`src/ui/icons/<id>.ts`) and first-pass Treat Track palettes
(`render/cosmetics.ts`). Never ship the placeholder art (§7 art gate). The aims (`src/input/aims/<id>.ts`) are final.

**Where the build differs from the spec above:**
- **Spots tick in `tickStatus`**, next to Duchess's stacks, not in Domino's `stepKit`: they count down for every hero
  each tick and clear in `clearStatus`, so they expire on time even while Domino is dead (his `reset` still clears the
  Spots he put on the enemy team). A dead Domino's Splatter still hits but adds no Spot: `afterDeal` runs for a dead
  source (`dealDamage` checks the source's kind, not that it is alive), so the kit checks `alive` itself. The same
  check guards Rocket's Lure Shot haste and Frankie's grab.
- **CONNECT THE DOTS! path**: each next link is the unvisited Spotted enemy hero nearest the *previous link point*
  (Domino first), every one within `r.range` of Domino; ties go to the lower id. `dotsPath()` exposes the last path for
  tests.
- **Rocket's basic multipliers** are applied in his `basic` hook when the bolt fires (he fires the bolt himself when any
  multiplier applies), not in `outgoing`: `outgoing` cannot tell a basic from other damage. Sighthound is measured
  centre to centre at that moment. Photo Finish's slow lands when the bolt is fired (`afterBasic`).
- **Frankie's guard** has two values: `COMBO` (the Combo hit makes no new half) and `POP` (the Dig pop is never taken as
  the FOOTLONG grab); the grab is an ability hit on an enemy hero while the R shot is in flight (`kWT > 0`) outside an
  `FM.Dash`. A miss sets the R cooldown to `cd × (10000 − missRefundBp) / 10000` (`idiv`) when that is lower than what
  is left. His Q icon is `weenieroll` (`roll` is Meatball's).
- **Escape taps** (Rocket W, Frankie E) use the shared `heading: true` rule (the full distance where the player is
  heading), as every other escape dash does, not "away from the nearest enemy": that is the founder's flash rule and
  the mobile pass owns any change to it. Bots dash away from the threat.
- **Kit numbers moved on the gate:** Rocket `r.clockedBp` 11500 → **11000** (the spec's first fix); Domino
  `r.rootPerDot` 8 → **5** and Tight Knot 12 → **8**; Frankie's FOOTLONG flies at **20 m/s** (30 before) and is **1 m**
  wide (1.2 before) so a cat can step out of it (the bots hit 89% of their FOOTLONGs at 30 m/s and 91% at 20 m/s: they
  fire it at low or stunned cats and never dodge it, so the 35–60% target is a human number, not a bot one).
- **Treat Track**: 66 chests (57 + 9 coats), the loop runs over 16 originals (128 palette coats); `UNLOCKS_MAX`
  200 → **240** (66 + 128 + the first-win coat fit with room). The spec's "about 233" counted 20 originals.
- **Rookie and Easy** (`DIFFICULTY_RULES`, where `pvp` is off): with ten dogs the naive player won fun2 84.5% (v14
  80.0%) and fun1 ended at a 4:47 median (v14 5:02). Easy's enemies now respawn × 0.85; Rookie's enemies respawn × 1.5
  (1.75 before) and its rally is +11.5% a takedown (13% before). Closing Rookie's cores until 5:00 also fixed fun1, but
  raised the idle win to 38%, so it was not kept.
- **party-identity golden** regenerated from the v15 sim (`tests/unit/golden/party-identity.json`, its own v15
  fixtures): v15 adds no party code, and the v14 golden already proved the hooks change nothing single-player.
- Unit tests whose seed only picked a scene moved: the protocol sample (seed 300 holds out past Sunset now) and the
  Rookie script test (seed 4: on seed 3 Domino's Normal wave front sits 0.2 m past the river).

**Final `pvp`** (dmgBp / takenBp, v14 → v15, gate run r8 on seeds 1..2,000):

| Hero | v14 | v15 | Win | | Hero | v14 | v15 | Win |
|---|---|---|---|---|---|---|---|---|
| Clem | 8850 / 9725 | 8100 / 9625 | 50.5% | | Sir Brutus | 9750 / 9575 | 8625 / 9725 | 49.6% |
| Sage | 10550 / 9325 | 9650 / 9375 | 48.7% | | Cacklejaw | 11250 / 8825 | 10400 / 8825 | 48.3% |
| Lambo | 9150 / 9125 | 8425 / 8925 | 52.4% | | Nugget | 9650 / 9425 | 8825 / 9325 | 49.8% |
| Avietė | 12750 / 7800 | 11650 / 7725 | 49.7% | | Marshmallow | 9000 / 9800 | 8475 / 9750 | 48.9% |
| Bengas | 10550 / 8700 | 9700 / 8725 | 52.1% | | Bravo | 11350 / 8250 | 10400 / 8225 | 47.2% |
| Gabė | 9050 / 9600 | 8075 / 9725 | 48.4% | | Chili | 9500 / 9425 | 8850 / 9250 | 51.2% |
| Meatball | 7900 / 9925 | 7200 / 10000 | 48.0% | | Howler | 9100 / 9650 | 8350 / 9575 | 51.9% |
| Pixel | 8750 / 9600 | 8000 / 9575 | 50.9% | | **Rocket** | (10200 / 9500) | 8925 / 9775 | 49.9% |
| Duchess | 11100 / 8550 | 10175 / 8525 | 51.9% | | **Frankie** | (11000 / 8800) | 9950 / 8825 | 50.0% |
| Stilts | 10900 / 8500 | 9975 / 8375 | 49.5% | | **Domino** | (10400 / 9200) | 8825 / 9775 | 51.2% |

Every `dmgBp` came down about 8%: with the three new dogs the pace was 3.69 takedowns a minute (gate ≤ 3.5). The
first untuned run had the dogs at 53.9% (Rocket 60.1%, Domino 60.2%). Chili, Cacklejaw and Marshmallow, which now
share their role on the dog side, went 52.0 → 51.2%, 48.1 → 48.3% and 50.3 → 48.9%. Run-to-run noise is large: a 1%
`pvp` change on a few heroes moved single heroes by up to ±5 points and the species by ±2, so r8 is one passing draw,
not a guarantee; retune from these numbers if a later change moves the gate.

**QA v15 fixes** (re-gated on seeds 1..2,000, no `pvp` change): Frankie's roll hit is guarded by `kEmpower`, a
mid-dash FOOTLONG hit gives no refund, Rocket's R is a mobility slot (a root refuses it), Rocket's bot sprint skips
any enemy structure reach (tanked or not) and Frankie's bot FOOTLONG skips a foe under an untanked tower. A first try
with `towerMargin` on the sprint check moved the dogs to 49.0% (Rocket 47.2, Bravo 45.2, Bengas and Lambo 54.0 / 54.1:
gate fail); with the plain structure reach the gate passes: Rocket 50.9, Frankie 50.2, Domino 50.8, species 50.0 /
50.0, every hero 47.0–53.1%, pace 3.48, 0 safety ends.

**Gates** (lane SIM exit):
- Balance (gate 6, 2,000 seeds): **all pass**. Every hero 47.2–52.4% (inside the task's 47–53), species cats 50.2 /
  dogs 49.8, side 49.6 / 50.4, length median 7:13, p95 8:30, 0 safety ends, core kill before Sudden Death 93.8%,
  pace 3.48 a minute, trailing at 3:30 won 30.0%, down 10+ won 1.8%, every trick 48.7–51.1%, both level-6 branches
  46.1% (Brutus) and 51.3% (Sage).
- fun1 (median 5:01, win 97.0%), fun2 (win 79.0%), novice vs Easy (88.8%), idle (23.0%, never loses before 6:00),
  parked, feeder (84.0%), feedNormal (0.7%): pass; each is as good as v14 or better (v14 on this machine: fun1 5:02,
  fun2 80.0%, idle 25.0%, novice 89.8%, feeder 84.0%). hard: win 37.0% and the deficit check 0.0% of 27 pass (it failed
  in v14). novice vs Normal: 41.5%, passes (35.0% in v14).
- Gate 10 probe (150 Normal matches, the human hero by seed): Rocket naps 4.1 a match and died in 1 of 214 naps;
  SQUIRREL! catches 1.1 heroes a throw; Frankie's Dig hits 1.2 heroes; Domino casts R on 2.35 Spots on average and
  makes 1.1 `dots` clips a match; 75% of dog teams have no support (Nugget) and 48% no tank (cats: Gabė, Lambo and
  Meatball); the dog side wins 49.8%, so the §3 role pass is not needed.
- Grade calibration (gate 8, `--seeds 400 --from 1001 --check`): **pass** with no change to `src/meta/grade.ts`
  (Rocket joined the marksmen, Frankie the assassins, Domino the mages); losses graded A or S 33.3%.
- Determinism (gate 4): `node tools/determinism.mjs --seeds 1000` all identical (all 20 heroes as the human);
  `sim-v15.test` plays Rocket and Frankie on both teams (6 seeds, 200 with `PAWLEGENDS_NIGHTLY=1`).
- `vendor-sim:check`: v10 to v14 frozen, v15 live (v14 at bb18ae2a, bundle `dba1ec16…`; v10 kept: this lands before
  Dec 1). Backend `npx jest src/pawlegends`, `npm run lint` and `npm run build` green.

**Reported, not fixed:**
- `tools/trailer/mg.test.mjs` and `tools/trailer/v3/timeline.test.mjs` fail in this worktree before and after the change
  (the repo-root `tools/copy-lint` import needs its own install).
- `perf-sim.test` "11:00 worst case ≤ 1.5 s": 1,533–1,555 ms CPU here at load average 75–110 (v14: 1,428 ms at the same
  load). It is the seed's new picks, not the kits: seed 32 now draws Domino and Sir Brutus, and the v14 picks for that
  seed cost the same on both builds (975 vs 940 ms). The Normal-match check passes (median 764–862 ms). Re-measure on
  an idle machine before the release; `net-rejoin` perf-ff passes when run alone.

## As built (lanes RENDER and PICKER, 2026-11-07)

Status: **LANES RENDER and PICKER done** on `feat/pawlegends-dogs-v15` (committed locally, not pushed). The placeholder
bodies are gone: each dog has its own chibi (`src/render/chars/heroes/<id>.ts`), move set (`src/render/moves/<id>.ts`)
and skill FX (`src/render/skillfx/<id>.ts`); ANIM-SPEC §14 has the briefs. Where the build differs from §1:
- **Frankie stands in a low crouch, not a level body.** A body pitched a quarter forward (the "lying in the bun" read)
  broke the shared poses, the lobby turntable and the portrait framing. He is the Nugget-style `weenieStand` crouch
  (body leaning well forward on bent short legs), the bun halves along his flanks and the team mustard squiggle down
  his back facing the iso camera. He is still the lowest hero drawn (top 2.12 m, Chili 2.16 m).
- **Dig hides the body with the existing form hold.** `MoveSet.formHold` (additive root scale 0.04) runs while the
  form bit is set *and* he is untargetable (`formHoldWhen`): the FOOTLONG flight sets the form bit too but is not
  untargetable, so he stays drawn while he stretches. The pop is skill FX on the untargetable falling edge
  (`onStatus`), not a new event. No new director hook.
- **FOOTLONG!'s stretch** is a row of opaque bun and sausage puffs redrawn each frame from where he stands to the
  flying `fluff` tip (drawn in his coat colour by projectileView `OWNER_SHOT`), not a tube mesh: no bone scales and
  nothing allocates per frame. Ribbons were tried first: they are additive, and a brown ribbon vanished on the grass.
- **Domino's coat spots do not hide one by one.** The 12 spots are flat discs in the one merged mesh (6,000-triangle
  Med budget kept); hiding them per Spot would need a per-vertex attribute in the shared character material. A spot
  flies off his coat to the cat on each ability hit, and flies home on the R. Coat skins tint the spots (Liver,
  Lemon); Firehouse keeps the team beret (a red helmet would remove the team read).
- **The dot-to-dot path is drawn from the hits on the R's cast tick**, nearest first from the previous link point
  with the lower id on a tie (the sim's rule), using drawn positions. Line-crossing heroes hit on the same tick are
  linked too (render only; it reads as the same constellation).
- **Rocket's "Zzz"** rides on his skill FX (`onClip` 'zzz', letters for the whole 18 t nap), not overhead.ts; the
  Spot pips are in overhead.ts (`spotPips`, `EntitySnap.dots`, both teams, under Duchess's crowns when both show).
- **Sizes** (`heroSize.ts` unchanged): Rocket top 3.15 m (over Howler 3.10, under Sir Brutus and Cacklejaw), Domino
  2.55 m, Frankie 2.12 m. Rocket's rose ears fold flat back with a dark (not pink) fold: pink round ears read as a rat.
- **Sounds:** 11 zzfx voices in `audio/sfx.ts` (`rocketWhoosh` … `dominoDraw`).
- **Gallery:** `src/gallery/scenarios.ts` plays each signature moment from the sim's own events (Rocket's untargetable
  sprint and `zzz` nap with the form bit, the feared dummy on SQUIRREL!; Frankie's dig to the dummy and the FOOTLONG
  grab and snap; Domino's R on three Spotted cats with root and `dots` pips).
- **Picker:** the dog grid has 10 tiles (5 + 5); the three carry a New tag while `SIM_VERSION` is 15
  (`screens.ts` `HERO_SINCE`, `isNewHero`). The landing roster has the three at `since: 15`: "Coming next: three new
  dogs" ("They join the dogs' side: ten cats, ten dogs.") until the v15 build stamp lands, then 20 heroes and
  "New: three dogs join the pack". Portraits and their `.w280` tile copies are in `client/public/pawlegends/landing/`
  (`tools/landing-portraits.mjs` now writes both and frames Frankie wider).

---

## 0. Roster after v15

| HERO_IDS index | id | Name | Breed | Role | Element | Vibe | Difficulty | HERO_COLOR_CSS |
|---|---|---|---|---|---|---|---|---|
| 2 | `brutus` | Sir Brutus | pug knight | tank | SAND | (exists) | easy | `#d6a36a` |
| 3 | `cacklejaw` | Cacklejaw | hyena | assassin | DARK | (exists) | medium | `#9a7ac2` |
| 12–16 | `nugget` … `howler` | (v14) | | support, mage, tank, marksman, fighter | | | | |
| **17** | `rocket` | Rocket | greyhound | **marksman** | GRASS | viral | medium | `#4caf6a` |
| **18** | `frankie` | Frankie | dachshund in a hot-dog costume | **assassin** | FIRE | viral | medium | `#d4a017` |
| **19** | `domino` | Domino | dalmatian puppy | **mage** | STELLAR | cute | medium | `#c23b5e` |

**Role count after v15:**

| Role | Cats | Dogs before | Dogs after |
|---|---|---|---|
| Fighter | Clem | Howler | Howler |
| Marksman | Sage, Pixel | Chili | Chili, **Rocket** |
| Tank | Lambo, Meatball | Brutus, Bravo | Brutus, Bravo |
| Assassin | Avietė, Stilts | Cacklejaw | Cacklejaw, **Frankie** |
| Mage | Bengas, Duchess | Marshmallow | Marshmallow, **Domino** |
| Support | Gabė | Nugget | Nugget |

**Elements.** GRASS and FIRE are the two elements no dog has yet. STELLAR fits Domino's dot-to-dot (a constellation)
and is also Bravo's and Lambo's. All three are in the `Element` union already, so `types.ts`, `ELEMENT_COLOR`,
`ELEMENT_TRAIL` and the backend `CatAbilityType` do not change.

**Colours.** Checked with the same CIE76 Delta-E as `readability.test` against all 17 current colours: Rocket
`#4caf6a` is 56 from Lambo, its nearest; Frankie `#d4a017` (mustard) is 25.5 from Avietė; Domino `#c23b5e` (the
dalmatian's red collar) is 42.6 from Chili. All three are ≥ 20 from each other too. Domino's card is not blue: the
relation colours own blue (audit item 9). If a value fails the test after a later palette change, RENDER moves it
and writes the new value here.

**Silhouettes at game-camera scale** (each must read at a glance among the 20):

| Hero | Shape | Read | HERO_BUILD (`h`, `w`, `ring`) |
|---|---|---|---|
| Rocket | the tallest, thinnest dog: long legs, a deep narrow chest, a whip tail, a team-coloured racing jacket with a big white number | "the stick dog in the jacket" (Stilts is the leggy *cat*; Rocket is longer in the body and has no hat) | `1.08, 0.85, 1.9` |
| Frankie | the lowest and longest hero: a dachshund lying inside a hot-dog bun, a mustard squiggle down his back, a little face at one end | "the hot dog" | `0.93, 1.2, 2.15` |
| Domino | a round white puppy with big black spots, floppy black ears, a team-coloured artist's beret and a fat crayon | "the spotty one with the beret" (Marshmallow is the plain white ball with a bobble hat) | `1.0, 1.0, 2.05` |

`HERO_BUILD` keeps the ranges in its header: `h` 0.93–1.08, `w` 0.85–1.25. Rocket uses the top of `h` and the
bottom of `w`. Frankie uses the bottom of `h`, and his length comes from the rig `width` and the bun mesh, not from
`w`, which scales X and Z together.

---

## 1. Per-dog specs

Units: mm, mm/s, ticks at 30 Hz, bp (10000 = 1.0), arcs in 1/4096 of a turn. Every gameplay number lives in
`src/data/heroes/<id>.ts`, and the kit reads it by name through `abil(w, id)`. Ranks: Q/W/E rank up at levels 2, 5
and 8; R ranks up at 7 and 10. The `pvp` values are starting points; Phase 3 tunes them on the 2,000-seed gate.

**Shared sim additions used below** (§4): three new `ClipKind` values (`zzz`, `footlong`, `dots`); two new hashed
World arrays for Domino's Spots (`dotN`, `dotT`) and an optional `EntitySnap.dots`. There is **no new projectile
kind**. All three heroes' skillshots reuse `PROJECTILE_KIND.fluff` (13), and render picks the look from the owner's
hero (`ProjectileSnap.owner`), as it does for Marshmallow's snowball and Bravo's tear. The sim never needs to tell
these shots apart by kind: each kit keys on its own stage flags (below). There is no new primitive and no new HeroKit
hook.

**In-kit damage guard (all three).** Rocket and Domino react in `afterDeal` to their *own* ability hits. A kit that
also deals ability damage from inside its own cast (Rocket's E and R, Domino's R) sets
`kEmpower[id] = RESOLVING` (a kit constant, 1) around those `dealDamage` calls and clears it after them. `afterDeal`
ignores hits while it is set. This is the pattern v14 used for Chili's splash, written down so that all three do the
same thing.

**Mobile, zero friction (founder rule).** Every slot is one tap that does the whole thing. There are no recasts,
no hold-to-charge and no unit-target aims (audit CF-07). The tap fallback for each aim is listed per hero and lives in
`src/input/aims/<id>.ts`. The rule is: a point or direction aim with no stick input goes to the nearest enemy hero in
reach, otherwise **full range** straight ahead (audit CF-03: a tap goes the full distance, as Flash does in Wild Rift).
An escape (Rocket W, Frankie E) with no stick input goes directly away from the nearest enemy hero. If the input lane
of the mobile pass changes the shared tap rules, these per-hero files follow it.

### 1.1 Rocket (`rocket`, index 17): viral marksman

**Fantasy:** "Built for one thing: going very fast, from very far away. Then a nap. A long nap."

The joke is the greyhound "roach": after a full sprint he flops onto his back, legs in the air, and snores. It is a
real greyhound habit, it is funny without words, and it reads from above.

**HeroData** `src/data/heroes/rocket.ts`:
```ts
/** Rocket, Marksman (sim v15, original dog): a greyhound who hits harder from far away and sprints, then naps. */
import type { HeroData } from './types';

export const ROCKET: HeroData = Object.freeze<HeroData>({
  id: 'rocket',
  name: 'Rocket',
  side: 'dog',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Starting point; tune on the 2,000-seed gate. */
  pvp: { dmgBp: 10200, takenBp: 9500 },
  element: 'GRASS',
  base: { hp: 450, hpPerLevel: 47, attack: 50, attackPerLevel: 5, attackEvery: 28, range: 6200, speed: 5100, armour: 14, armourPerLevel: 2 },
  /** Sighthound: his basics on an enemy hero 4.5 m or more away deal +20%. */
  passive: { range: 4500, bonusBp: 12000 },
  abilities: {
    /** Lure Shot: 9 m dart that passes minions (60% to them) and stops at the first hero: 70 (+7/lvl, +18 a rank), reveals it 2 s; on a hero hit he gets +25% speed for 1.5 s. */
    q: { cooldown: 210, range: 9000, width: 800, speed: 21000, dmg: 70, dmgPerLevel: 7, minionBp: 6000, reveal: 60, hasteBp: 2500, haste: 45 },
    /** Photo Finish: dash 3.5 m; his next basic within 3 s deals +40% and slows 25% for 1 s. */
    w: { cooldown: 300, dash: 3500, speed: 16000, window: 90, bonusBp: 14000, slowBp: 2500, slow: 30 },
    /** SQUIRREL!: throw a squeaky squirrel up to 7 m; after 0.5 s enemy heroes within 2.4 m take 40 (+4/lvl) and run at it for 0.7 s. */
    e: { cooldown: 480, range: 7000, windup: 15, radius: 2400, lure: 21, dmg: 40, dmgPerLevel: 4 },
    /** ZOOM… ZZZ: 0.3 s crouch, then sprint up to 11 m, untargetable; enemy heroes he passes take 130 (+13/lvl, +60 a rank) and take +15% from his basics for 4 s. Then he naps 0.6 s on his back (cannot act, takes 50% less). */
    r: { cooldown: 2100, windup: 9, dash: 11000, speed: 24000, width: 1200, dmg: 130, dmgPerLevel: 13, clockedBp: 11500, clocked: 120, nap: 18, napReduceBp: 5000, napHealBp: 0 },
  },
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -30 }, r: { dmg: 60, cooldown: -100 } },
  talents: [
    [
      { id: 'long-legs', name: 'Long Legs', mods: { q: { range: 10500 } } },
      { id: 'eagle-eye', name: 'Eagle Eye', mods: { passive: { range: 3500 } } },
    ],
    [
      { id: 'false-start', name: 'False Start', mods: { w: { dash: 4500 } } },
      { id: 'squeakier', name: 'Squeakier Toy', mods: { e: { radius: 3000 } } },
    ],
    [
      { id: 'power-nap', name: 'Power Nap', mods: { r: { napHealBp: 1200 } } },
      { id: 'clocked', name: 'Clocked', mods: { r: { clocked: 180 } } },
    ],
  ],
});
```

**heroText** (`src/ui/heroText/rocket.ts`): title "Rocket", Marksman, Dog. Blurb: "Fastest dog on the island.
Hits hardest from far away, then needs a nap."
- Passive, Sighthound: "His hits are stronger on cats far away."
- Q, Lure Shot: "A long dart that flies past minions and stops at the first cat."
- W, Photo Finish: "Dash, and your next hit is a big one."
- E, SQUIRREL!: "Throw a squeaky toy. Cats near it can't help chasing it."
- R, ZOOM… ZZZ: "Sprint through the cats, untouchable. Then flop over for a nap."
- New icons: `lure`, `photofinish`, `squirrel`, `sprint`. The `sprint` icon is not Stilts's `zoomies`.
- `heroText.ts` number keys: `clocked` and `nap` print as durations ("4 s", "0.6 s nap"). `lure` prints as "chase
  0.7 s". `napHealBp` uses the `healBp` wording when it is > 0.

**Sim kit** `src/sim/heroes/rocket.ts`. Kit arrays: `kWindow` Photo Finish ticks left, `kStage` 1 = sprinting
(R dash in flight), `kRT` nap ticks, `kCount` the bitmask of Clocked hero ids (heroes are ids < 32), `kWAge` Clocked
ticks left, `kHonour` / `kChain` the squirrel point, `kWT` squirrel wind-up ticks, `kEmpower` the in-kit guard.
- `aim`: Q `Aim.Dir`. W `Aim.Dir`, mobility (escape tap: away from the nearest enemy hero). E `Aim.Point`, reach
  `e.range`, tap = the nearest enemy hero in reach, else full range ahead. R `Aim.Dir`, windup `r.windup`, mobility (QA v15:
  it is an 11 m dash, so a root refuses it like every other dash), tap = toward the nearest enemy hero within
  `r.dash`, else facing.
- **Passive.** `outgoing(m, id, dst, raw)`: for a *basic* on an enemy hero, multiply by `bonusBp` if
  `dist(id, dst) >= range`. The basic pipeline tells a basic from other damage the way Howler's empowered basic does
  (`howler.ts:111`). It stacks multiplicatively with Photo Finish and Clocked. Order: Sighthound, then Photo Finish,
  then Clocked, with integer `applyBp` each time. Write the order in the header comment.
- **Q.** `fireSkillshot` with `PFLAG.HeroStop`, `PROJECTILE_KIND.fluff`, `minionBp`, `ON_HIT.Reveal` with
  `effA = reveal`. `afterDeal(m, id, dst, dmg, 'ability')` with `dst` an enemy hero and `kEmpower === 0` is the Q
  hit (his E and R damage run under the guard): `haste(w, id, hasteBp, haste)`.
- **W.** `dash(m, id, angle, dash, speed)`, then `kWindow = window`. `stepKit` counts it down. `afterBasic`: if
  `kWindow > 0`, `slow(dst)` and clear it; `outgoing` applies `bonusBp` while it is set. Clear it in `reset` and on nap.
- **E.** Cast: store the point in `kHonour` / `kChain`, `kWT = windup`, and spawn a **visual-only** burst
  `spawnBurst(w, team, id, Px, Py, radius, windup, windup + lure, 0, 0, 0, 0, 0)` (damage 0 and no slow), so render
  has a zone to draw the squirrel on for both teams. When `kWT` reaches 0, for each enemy hero within `radius` of P
  (`collect` + `inRing`), under the guard: `dealDamage`, then **`fear(w, e, lure, 2·ex − Px, 2·ey − Py)`**. Fleeing
  from the mirror point walks the cat *toward* the squirrel. It is the same trick as Nugget's herd knockback, and it
  needs no new primitive. A cat that reaches the squirrel early runs a little past it (at most about 1 m at 5 m/s).
  That is fine, and the test pins "ends closer to P than it started". CC immunity still wins (`fear` checks it).
- **R.** On resolve: `kStage = 1`, `w.untargT[id] = travelTicks(dist, speed)`, then `dash(m, id, angle, dash, speed)`.
  `onDashTick` while `kStage === 1`: hit each enemy hero within `width / 2` of him once per sprint, using the
  `fmHitLo` / `fmHitHi` mask exactly as `howler.ts:96-101` does. Under the guard: `dealDamage`, then set the
  hero's bit in `kCount`, and set `kWAge = clocked`. When the dash ends (`kStage === 1` and `fmKind === FM.None` in
  `stepKit`): `kStage = 0`, `kRT = nap`, `healOverTime(w, id, maxHp × napHealBp, nap)` when `napHealBp > 0`, and
  emit `clip` `zzz`. A sprint cut short by CC still ends in the nap: the joke always lands.
  - `busy()` returns `kRT > 0`, so he cannot move, basic or cast while he naps, even when CC-immune (the v14 hook).
  - `incoming()` multiplies by `10000 − napReduceBp` while `kRT > 0`.
  - `outgoing()` on a basic: if the target's bit is in `kCount` and `kWAge > 0`, multiply by `clockedBp`. `stepKit`
    clears `kCount` when `kWAge` reaches 0.
  - `snapFx`: `SNAP_FX.Form` while `kRT > 0` (the nap pose). `resource()`: 255 while Photo Finish is loaded (a
    stopwatch pip on his own plate).
- `reset`: clear `kWindow`, `kStage`, `kRT`, `kCount`, `kWAge`, `kWT`, `kEmpower`. Nap teleports home without
  `reset` (CATS-V11 known gap): clear `kStage` and `kWT` in `stepKit` when he is napping at the fountain, as Stilts does.
- No new World array.

**Bot** (`src/sim/bots/heroes/rocket.ts`):
- fight: Q on a foe in the 9 m line. He keeps the generic ranged hold (`holdRanged`; a `rocketSpacing` key was
  planned but never read, so QA v15 removed it). Use W to kite when a foe is within `BOT_AI.rocketPeelRange (3000)`:
  dash away, then basic. Use E when a foe is diving an ally or himself (a foe within 3 m), aimed at that foe. Use R
  when the sprint line from him passes 2+ foes (`BOT_AI.rocketSprintFoes 2`), or 1 foe under 35% HP, **and** the
  line's end point is not within reach of an enemy structure, tanked or not: he naps where he stops (QA v15: the
  untanked-only check let 15% of his naps start in tower range).
- clear: Q through a minion line toward a hero if one is in range, otherwise basics only.
- escape: W away from the threat; then E on the closest chaser.
- New BOT_AI keys: `rocketPeelRange 3000`, `rocketSquirrelRange 3000`, `rocketSprintFoes 2`, `rocketSprintHpBp 3500`.

**Signature moment:** **the sprint nap.** He blurs through three cats, then drops onto his back with his legs in the
air and a "Zzz". The cats he Clocked are hurt and slowed, and he is helpless for 0.6 s. The clip is the contrast, and
`clip` `zzz` marks it for the share tooling.

**Clip event:** `zzz` (once per R, when the nap starts).

**Art brief** (`src/render/chars/heroes/rocket.ts`, `moves/rocket.ts`, `skillfx/rocket.ts`):
- RigSpec `width 0.8, bodyScale 1.0, headScale 0.9, tier 'hero', earsLow 0.3`. `HERO_BUILD` `h 1.08, w 0.85, ring
  1.9`. He should be the tallest dog drawn (above Howler's 3.10 m top), with long thin legs from a `HERO_MOTION`
  stance that raises the hips (the rig has no `legScale`, so leg length comes from the stance, as Nugget's crouch did).
- Coat: smooth short brindle-grey (`base 0x8c8682, deep 0x5e5955, light 0xd8d2cc, cream 0xf2eee8`), a white chest
  blaze and white toes.
- Head (own builder `greyhoundHead` in the module): a long narrow wedge skull and a long thin muzzle. The **rose
  ears** fold back flat against the neck and flip up in the Q and R clips. Calm, sleepy half-lidded eyes in idle; wide
  eyes in the sprint.
- Tail: a thin whip tail, the last bones curled low.
- Gear: a **team-coloured racing jacket** (a blanket coat over the back and chest) with a big **white number 7**
  decal on each side. This is the team read, and from above it covers most of his back. Small racing goggles sit up
  on his forehead and come down over his eyes in the R crouch. No muzzle (a racing muzzle reads as a cage).
- HERO_MOTION: idle `stand` with the classic **lean** (weight shifted, head low), run a double-suspension gallop
  (both pairs of legs fully stretched, then fully gathered; `stride 1.6`), cast a crouch-and-point, attack a quick head
  flick that fires the dart.
- `HERO_COLOR_CSS` `#4caf6a` (turf green).

**Moves and VFX:**
- Q: a thin dart with a tiny plush-rabbit tail, plus a white speed line. On a hero hit, a stopwatch "click" pops over him.
- W: a short, low dash with a finish-line ribbon that snaps across his chest. The loaded basic has a camera-flash
  sparkle.
- E: a plush squirrel flies in an arc and lands squeaking (a ring telegraph in `squirrel` brown for 0.5 s). The
  chasing cats get a "!" over their heads and their charm-walk clip.
- R: the goggles drop, a 0.3 s crouch with dust, then a green-white blur trail along the path (no afterimage clones,
  to keep the triangle budget). The **roach nap** is the signature pose: he spins half a turn and lands on his back,
  legs straight up, tongue out, with "Zzz" letters rising. For the local player it gets a small camera punch. Off
  under reduced motion.
- `ultName` 'ZOOM… ZZZ'.

**Voice / emote:** zzfx defs `rocketWhoosh` (R sprint), `rocketSnore` (the nap: a falling two-note purr-snore),
`rocketSqueak` (E squirrel). Emote: the lean. He leans sideways on an invisible friend, slides slowly down, and
ends lying on the ground.

**Balance target:** 46–54%. Watch Sighthound with Lure Shot's reveal (long-range poke the cats cannot see coming)
and the E fear inside Bengas's or Duchess's zones in mixed parties. If he passes 54%, cut `r.clockedBp` 11500 → 11000
before the damage, and keep the nap at 0.6 s or longer. The nap is the joke.

**Skins hook:** `coat.rocket.fawn` (classic fawn with a black mask), `coat.rocket.blue` (slate-blue greyhound),
`coat.rocket.retired` (grey muzzle and a knitted jumper over the jacket: "retired racer").

---

### 1.2 Frankie (`frankie`, index 18): viral assassin

**Fantasy:** "A sausage dog in a hot-dog costume. Digs under the fight, pops up under a cat, and when he really wants
someone he stretches. Very, very far."

**HeroData** `src/data/heroes/frankie.ts`:
```ts
/** Frankie, Assassin (sim v15, original dog): a dachshund in a hot-dog costume who digs, rolls and stretches 9 m long. */
import type { HeroData } from './types';

export const FRANKIE: HeroData = Object.freeze<HeroData>({
  id: 'frankie',
  name: 'Frankie',
  side: 'dog',
  role: 'assassin',
  pvp: { dmgBp: 11000, takenBp: 8800 },
  element: 'FIRE',
  base: { hp: 510, hpPerLevel: 54, attack: 57, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5150, armour: 18, armourPerLevel: 2 },
  /** Ketchup and Mustard: an ability hit and a basic on the same enemy hero within 3 s (either order) add a Combo: +45 (+9/lvl). Then 4 s before the next Combo. */
  passive: { window: 90, dmg: 45, dmgPerLevel: 9, lockout: 120 },
  abilities: {
    /** Weenie Roll: roll 4.5 m; minions passed take 50%; the first enemy hero stops him: 70 (+6/lvl, +18 a rank), knocked back 1.5 m. */
    q: { cooldown: 210, dash: 4500, speed: 15000, width: 1000, dmg: 70, dmgPerLevel: 6, minionBp: 5000, push: 1500 },
    /** Dig: burrow to a point within 6.5 m, untargetable; pop up: 60 (+6/lvl, +15 a rank) within 1.8 m, enemy heroes stunned 0.5 s. */
    w: { cooldown: 420, range: 6500, speed: 9000, radius: 1800, dmg: 60, dmgPerLevel: 6, stun: 15 },
    /** Bun Hop: hop 3.5 m, shrug off slows, +20% speed for 1 s. */
    e: { cooldown: 390, dash: 3500, hasteBp: 2000, haste: 30 },
    /** FOOTLONG!: 0.27 s wind-up; he stretches up to 9 m (minions passed take 50%); the first enemy hero takes 150 (+15/lvl, +68 a rank), is stunned 0.75 s and he snaps to it. A miss refunds 40% of the cooldown. */
    r: { cooldown: 1950, windup: 8, range: 9000, width: 1200, speed: 30000, dmg: 150, dmgPerLevel: 15, minionBp: 5000, stun: 23, snapSpeed: 30000, missRefundBp: 4000 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 15 }, e: { cooldown: -15 }, r: { dmg: 68, cooldown: -100 } },
  talents: [
    [
      { id: 'extra-relish', name: 'Extra Relish', mods: { passive: { dmg: 65 } } },
      { id: 'buttered-bun', name: 'Buttered Bun', mods: { e: { hasteBp: 3500 } } },
    ],
    [
      { id: 'deep-dig', name: 'Deep Dig', mods: { w: { range: 8000 } } },
      { id: 'big-pop', name: 'Big Pop', mods: { w: { radius: 2400 } } },
    ],
    [
      { id: 'six-foot-sub', name: 'Six-Foot Sub', mods: { r: { range: 11000 } } },
      { id: 'mustard-everywhere', name: 'Extra Mustard', mods: { r: { stun: 30 } } },
    ],
  ],
});
```

**heroText:** title "Frankie", Assassin, Dog. Blurb: "A sausage dog dressed as a hot dog. Digs, rolls, and
stretches across half the map."
- Passive, Ketchup and Mustard: "Hit a cat with a skill and a bite in a row for extra damage."
- Q, Weenie Roll: "Roll into the first cat and knock it back."
- W, Dig: "Dig under the fight and pop up under the cats, stunning them."
- E, Bun Hop: "Hop away and shake off slows."
- R, FOOTLONG!: "Stretch super long. Grab the first cat you reach and snap to it."
- Icons: `roll`, `dig`, `bunhop`, `footlong`.

**Sim kit** `src/sim/heroes/frankie.ts`. Kit arrays: `kFoe` the last Combo victim, `kValor` what landed last on it
(1 ability, 2 basic), `kWindow` the Combo window, `kHuntT` the Combo lockout, `kStage` 1 = rolling, 2 = digging, 3 =
FOOTLONG in flight, 4 = snapping; `kWT` the flight ticks left, `kHuntVictim` the grabbed hero.
- `aim`: Q `Aim.Dir`, mobility. W `Aim.Point`, reach `w.range`, mobility; tap = onto the nearest enemy hero in reach,
  else full range ahead. E `Aim.Dir`, mobility; escape tap = away from the nearest enemy hero. R `Aim.Dir`, windup
  `r.windup`; tap = toward the nearest enemy hero within `r.range`, else facing.
- **Passive.** `afterDeal(m, id, dst, dmg, kind)` with `dst` an enemy hero and `kHuntT === 0`. Let `t` = 1 for
  `'ability'`, 2 for `'basic'`. If `kFoe === dst`, `kWindow > 0` and `kValor !== t`: deal the Combo,
  `dealDamage(m, id, team, Kind.Hero, dst, lvl(dmg), 'ability')`, under the guard so it does not chain. Then
  `kHuntT = lockout`, `kWindow = 0`. Otherwise set `kFoe = dst`, `kValor = t`, `kWindow = window`. `resource()`
  returns 255 while a half-Combo is open, and render shows a ketchup or mustard pip. A Combo pops a red-and-yellow splat.
- **Q.** `dash(m, id, angle, dash, speed)`, `kStage = 1`. `onDashTick`: minions within `width / 2` take
  `minionBp` (once each, `fmHit` mask). On the **first enemy hero** in reach: `dealDamage`, then
  `knockback(m, e, x, y, push, facing)`, and stop the dash. To stop it, set `fmT[id] = 0` and `fmKind[id] = FM.None`,
  as Lambo's Belly Flop lands early. Then `kStage = 0`.
- **W.** `kStage = 2`, `w.untargT[id] = travelTicks(dist, speed)`, `dash` to the clamped point (`clipTravel` cuts at
  walls, so he never ends inside one). He cannot attack during an `FM.Dash`. Landing (`kStage === 2` and
  `FM.None`): every enemy unit within `radius` takes `lvl(dmg)`; enemy heroes are also `stun`ned. One tap; there is no
  recast and no hold. Cleared in `reset` and on the nap teleport.
- **E.** At cast, clear his slow (`w.slowT[id] = 0; w.slowBp[id] = 0`; not `cleanse`, which grants nothing more
  he can use), then `dash(m, id, angle, dash)` and `haste`. `canCast` refuses every mobility slot while rooted
  (`kit.ts:171`), and E is no exception. So the hop clears **slows only**, and the heroText says "shake off slows".
- **R.** On resolve: `fireSkillshot` with `PFLAG.HeroStop`, `PROJECTILE_KIND.fluff`, `minionBp`, `dmg =
  lvl(dmg)`. Set `kStage = 3` and `kWT = travelTicks(range, speed) + 1`. In `afterDeal(…, 'ability')` with `dst` an
  enemy hero while `kWT > 0` and outside the guard, the hit is the grab. QA v15: the Q roll hit runs under the
  `kEmpower` guard (ROLLING), not an `fmKind` check, because `stepForced` clears `fmKind` before `onDashTick` on a
  dash's landing tick; an R hit while he is mid-dash (roll, dig, hop) zeroes `kWT` (a hit, so no refund) without a
  grab. The grab:
  `stun(w, dst, stun)`. Then `kStage = 4`, `kHuntVictim = dst`, and `startForced` him to the point `dist − radii`
  short of the victim at `snapSpeed` (FM.Dash). Emit `clip` `footlong`. The Combo passive also sees this hit (it is
  ability damage), so a bite right after the snap completes the Combo. If `kWT` reaches 0 while `kStage === 3`, he
  missed: set the R cooldown to `cd × (10000 − missRefundBp) / 10000` (integer `idiv`) and `kStage = 0`. The stun
  lands before the snap, so a 9 m snap (0.3 s) always arrives inside the 0.75 s stun.
  - `snapFx`: `SNAP_FX.Form` while `kStage` is 2 (underground: render hides the body and draws the dirt mound) or 3
    (stretched). Render tells the two apart from the snapshot: Form plus a live `fluff` projectile owned by him means
    stretched.
- No new World array.

**Bot** (`src/sim/bots/heroes/frankie.ts`):
- fight: W onto a foe under 60% HP (`BOT_AI.frankieDigHpBp 6000`), or onto 2+ foes clumped within 1.8 m, only when an
  ally is within 8 m or the foe is alone. Q into the foe after W (Combo). R when a foe within 9 m is under 45%
  (`BOT_AI.frankieFootlongHpBp 4500`) and the line to it is not blocked by a minion (FOOTLONG passes minions, so this
  only checks heroes in the way), or to finish a stunned foe. Never W under an enemy tower unless that foe would die.
- clear: Q through 3+ minions.
- escape: E away from the threat; W toward his own tower if E is down (untargetable travel).
- New BOT_AI keys: `frankieDigHpBp 6000`, `frankieFootlongHpBp 4500`, `frankieDiveAllyRange 8000`.

**Signature moment:** **the FOOTLONG.** The dachshund stretches 9 m across the screen, grabs a fleeing cat, and
snaps back up to it. "Longest dog ever" works as a clip with no words. The `footlong` clip event marks it.

**Clip event:** `footlong` (on the grab, not on a miss).

**Art brief:**
- RigSpec `width 1.35, bodyScale 1.05, headScale 1.0, tier 'hero', earsLow 0.8` (long floppy ears). `HERO_BUILD` `h
  0.93, w 1.2, ring 2.15`. He may be drawn lower than Chili (2.16 m top), which makes him the lowest hero. His height comes from a deep
  `HERO_MOTION` crouch on very short legs, as for Nugget.
- Coat: smooth red-brown (`base 0x9c4a1f, deep 0x6e3214, light 0xc87a46, cream 0xe0a070`).
- Head `dachshundHead`: a long tapered muzzle, a shiny black nose, long soft floppy ears, and round worried eyebrows
  (two tan dots), so he always looks a little concerned about the costume.
- **The costume:** two **bun halves** (lathe or squashed capsule, toasted `0xd99a4e` with a lighter top and a few
  sesame seeds as one instanced flat mesh) along both flanks from shoulder to hip. His back shows between them. A **thick
  squiggle down his back in team colour** (a tube along a sine curve, about 4 cm thick) is the "mustard" and the team
  read, plus the v14 `dogParts.shawl` at the neck. RENDER measures `team-read` (≥ 15%; target 30%+ like the other
  dogs). If it falls short, the squiggle widens before anything else changes. The bun is never team-coloured, because
  bread must read as bread.
- Tail: a short thin tail that pokes out of the back of the bun and wags fast.
- HERO_MOTION: idle `stand` with a slow tail wag, run a fast short-legged scurry (`stride 1.5`) with the body
  wiggling side to side, cast a bark, attack a quick lunge-nip.
- `HERO_COLOR_CSS` `#d4a017` (mustard).

**Moves and VFX:**
- Passive Combo: a ketchup splat and a mustard splat that overlap into a red-yellow star (additive, small).
- Q: he tucks into the bun and **rolls** like a hot dog on a grill. The body spins on its long axis, with grill
  marks on the dust trail.
- W: he dives nose first. While underground, the body is hidden and a dirt mound with a wagging tail tip travels to
  the point. He pops up like toast from a toaster with dirt clods, and the stunned cats get the stun stars.
- E: a little hop out of the bun. The bun stays one frame behind and snaps back on (a 2-frame lag on the bun meshes).
- R **FOOTLONG!** (signature): after the wind-up, the hero mesh's spine stays at the start. RENDER draws the
  stretch as an FX tube in his coat colour with the bun along it, from his start point to the projectile's position,
  with his head mesh at the tip, so no bone is scaled. On the grab the tube shortens toward the victim over the
  snap. On a miss it springs back with a wobble. The tube has a ≤ 300-triangle budget and caps the visual length at
  the projectile range.
- `ultName` 'FOOTLONG!'.

**Voice / emote:** zzfx `frankieYip` (Q), `frankieDig` (W pop: a cork pop), `frankieStretch` (R: a rising
slide-whistle), `frankieSnap` (R grab). Emote: the slow U-turn. He tries to turn round in place, his front end
walks a full circle, and the back end follows a beat later.

**Balance target:** 46–54%. Watch the two stuns (W 0.5 s, R 0.75 s) with Cacklejaw's Gloat fear in the same dog
team. If he passes 54%, cut `w.stun` 15 → 10 before damage. If he falls under 46% because R misses, raise
`missRefundBp` before damage.

**Skins hook:** `coat.frankie.chili` (chili-dog bun with a red squiggle), `coat.frankie.dapple` (silver dapple
dachshund), `coat.frankie.corndog` (a battered corn-dog costume on a stick).

---

### 1.3 Domino (`domino`, index 19): cute mage

**Fantasy:** "A dalmatian puppy who throws his own spots. Stick enough on the cats, then connect the dots."

The visual joke: he really is throwing his spots. His coat shows a fixed set of black spots, and render hides one
for every Spot currently stuck on a cat (his `resource`). He gets whiter the better he plays, and the spots pop back
onto him one by one when they expire or when he cashes them in.

**HeroData** `src/data/heroes/domino.ts`:
```ts
/** Domino, Mage (sim v15, original dog): a dalmatian who sticks his spots on cats and then connects the dots. */
import type { HeroData } from './types';

export const DOMINO: HeroData = Object.freeze<HeroData>({
  id: 'domino',
  name: 'Domino',
  side: 'dog',
  role: 'mage',
  pvp: { dmgBp: 10400, takenBp: 9200 },
  element: 'STELLAR',
  base: { hp: 470, hpPerLevel: 49, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5300, speed: 4850, armour: 15, armourPerLevel: 2 },
  /** Spot On: each of his ability hits on an enemy hero sticks a Spot (max 3, 6 s, refreshed). He deals +6% to a hero per Spot on it. */
  passive: { max: 3, ttl: 180, perDotBp: 600 },
  abilities: {
    /** Spot Shot: 8 m shot, stops at the first unit, 65 (+6/lvl, +16 a rank). */
    q: { cooldown: 180, range: 8000, width: 900, speed: 17000, dmg: 65, dmgPerLevel: 6 },
    /** Splatter: within 7.5 m, after 0.4 s a 2.4 m splash: 60 (+6/lvl, +15 a rank), slow 25% for 1 s. */
    w: { cooldown: 330, range: 7500, windup: 12, radius: 2400, dmg: 60, dmgPerLevel: 6, slowBp: 2500, slow: 30 },
    /** Big Shake: a full-body shake: enemies within 2.6 m take 40 (+4/lvl) and are knocked back 2 m; he shakes off slows. */
    e: { cooldown: 420, radius: 2600, push: 2000, dmg: 40, dmgPerLevel: 4 },
    /** CONNECT THE DOTS!: 0.5 s; links every Spotted enemy hero within 11 m, nearest first, with starry lines. Each Spotted hero takes 100 (+10/lvl, +45 a rank) + 35 a Spot and is rooted 0.5 s + 0.27 s a Spot; other enemy heroes on a line take 50% and are slowed 30% 1.5 s. Spots are used up. */
    r: { cooldown: 2000, windup: 15, range: 11000, width: 1000, dmg: 100, dmgPerLevel: 10, perDot: 35, lineBp: 5000, slowBp: 3000, slow: 45, root: 15, rootPerDot: 8 },
  },
  ranks: { q: { dmg: 16 }, w: { dmg: 15 }, e: { cooldown: -15 }, r: { dmg: 45, cooldown: -100 } },
  talents: [
    [
      { id: 'big-spots', name: 'Big Spots', mods: { q: { width: 1200 } } },
      { id: 'polka-dots', name: 'Polka Dots', mods: { passive: { max: 4 } } },
    ],
    [
      { id: 'splash-zone', name: 'Splash Zone', mods: { w: { radius: 3000 } } },
      { id: 'good-shake', name: 'Good Shake', mods: { e: { push: 2800 } } },
    ],
    [
      { id: 'dot-to-dot-pro', name: 'Dot-to-Dot Pro', mods: { r: { range: 13000 } } },
      { id: 'tight-knot', name: 'Tight Knot', mods: { r: { rootPerDot: 12 } } },
    ],
  ],
});
```

**heroText:** title "Domino", Mage, Dog. Blurb: "Throws his own spots at cats. Then connects the dots."
- Passive, Spot On: "Your skills stick spots on cats. Spotted cats take more from you."
- Q, Spot Shot: "Flick a spot at the first thing in line."
- W, Splatter: "Splash a patch of ink that slows cats."
- E, Big Shake: "Shake it all off: cats nearby are knocked away."
- R, CONNECT THE DOTS!: "Join every spotted cat with a starry line. More spots, bigger hit, longer hold."
- Icons: `spot`, `splatter`, `shake`, `dots`.
- `heroText.ts` number keys: `perDot` ("+35 a Spot"), `rootPerDot` ("+0.27 s a Spot"), `lineBp` ("50% on a line").

**Sim kit** `src/sim/heroes/domino.ts`. Spots live on the **victim** in the new World arrays `dotN[hero]` (0..max)
and `dotT[hero]` (ticks left), §4. Domino's own kit arrays: `kEmpower` the guard, `kWT` the Splatter wind-up,
`kHonour` / `kChain` the Splatter point.
- `aim`: Q `Aim.Dir`. W `Aim.Point`, reach `w.range`, tap = the nearest enemy hero in reach, else full range ahead.
  E `Aim.Self`. R `Aim.Self`, windup `r.windup`.
- **Passive.** `afterDeal(m, id, dst, dmg, 'ability')` with `dst` an enemy hero and `kEmpower === 0`: `dotN[dst] =
  min(max, dotN[dst] + 1)`, `dotT[dst] = ttl`. `outgoing(m, id, dst, raw)` on an enemy hero: `raw × (10000 +
  perDotBp × dotN[dst]) / 10000`. `stepKit` counts `dotT` down **for enemy heroes only** and clears `dotN` at 0 or
  when the hero dies. Only one Domino can hit a given team's heroes, because `fillPicks` and party picks never repeat a
  hero within a team, so two Dominos never tick the same victim. `resource()` = the sum of `dotN` over enemy heroes,
  capped at 255 (render hides that many coat spots). `reset` (his death) zeroes `dotN` / `dotT` on every enemy hero:
  his spots fall off when he goes down.
- **Q.** `fireSkillshot` stop-at-first, `PROJECTILE_KIND.fluff`. The Spot comes from `afterDeal`.
- **W.** `spawnBurst(w, team, id, Px, Py, radius, windup, windup + 1, lvl(dmg), 0, 0, slowBp, slow)`: one pulse
  after the wind-up (`every = 0`), which also gives render the telegraph ring. Zone damage arrives as `'ability'` from
  the owner (`zone.ts:97`), so it adds Spots with no extra code. If he has died before the pulse, the zone still
  hits (`zone.ts:96`) but `afterDeal` does not run for a dead source, so no Spot is added. The test pins this.
- **E.** For each enemy unit within `radius` (`collect` + `inRing`): `dealDamage` (heroes get a Spot through
  `afterDeal`), then `knockback(m, e, x, y, push, facing)`. Then on himself, `w.slowT[id] = 0; w.slowBp[id] = 0`
  (slows only: not `cleanse`, which would also drop stuns and fears and grant nothing he needs).
- **R.** On resolve, under the guard:
  1. Build the **path**: start at Domino. Repeatedly pick the nearest unvisited enemy hero within `range` of *Domino*
     with `dotN > 0` (ties by lower id; integer `dist2`). Teams have 3 heroes, so a path has at most 3 links.
  2. **No Spotted hero in range:** link to the nearest enemy hero within `range` as a 0-Spot target (so the cast is
     never wasted in a fight). **No enemy hero in range at all:** return −1 (fizzle, no cooldown). `canCast` reports
     "no target", and touch plays the deny cue (audit CF-07; the same path as Brutus R).
  3. For each target T on the path: `dealDamage(lvl(dmg) + perDot × dotN[T])`, then `root(w, T, root + rootPerDot ×
     dotN[T])`. CC immunity still wins.
  4. For each link segment (Domino→T1, T1→T2, T2→T3), every *other* enemy hero within `width / 2` of the segment
     (`inLine`) takes `lineBp` of the base damage and is `slow`ed, once per cast (a local bitmask).
  5. Zero `dotN` / `dotT` on every target. Emit `clip` `dots` when the path has 2 or more targets.
- No new primitive. Two new World arrays (§4).

**Bot** (`src/sim/bots/heroes/domino.ts`):
- fight: Q on a foe in the line. W on the foe cluster, or on a slowed or rooted foe. E when a melee foe is within
  `BOT_AI.dominoShakeRange (2600)`. R when 2+ Spotted foes are in 11 m (`BOT_AI.dominoDotsMin 2`), or one foe with 3
  Spots under 50%, or one Spotted foe that would die from the R damage. He keeps the generic ranged hold (the
  planned `dominoSpacing` key was never read; QA v15 removed it).
- clear: W on 3+ minions; Q otherwise.
- escape: E when anything is within 2.6 m, then walk.
- New BOT_AI keys: `dominoShakeRange 2600`, `dominoDotsMin 2`, `dominoDotsHpBp 5000`.

**Signature moment:** **the dot-to-dot.** Three cats get joined by glowing lines into a little constellation, all
three are rooted at once, and Domino, now completely white, does a happy spin as his spots fly home. The
`dots` clip event marks it.

**Clip event:** `dots` (on R with 2+ linked heroes).

**Art brief:**
- RigSpec `width 1.15, bodyScale 1.1, headScale 1.15, tier 'kid', earsLow 0.7` (a puppy, as Marshmallow is). `HERO_BUILD`
  `h 1.0, w 1.0, ring 2.05`.
- Coat: clean white (`base 0xf7f5f2, deep 0xdcd8d2, light 0xffffff, cream 0xffffff`), with **12 black spots** as
  flat discs on the body, head and legs (one merged mesh with per-spot visibility via a vertex attribute or 12 tiny
  meshes; RENDER picks whichever keeps `chars.test` at ≤ 6,000 triangles Med). The spots are black on every coat
  skin; the skins change the base.
- Head `dalmatianHead`: a round puppy skull, a short white muzzle, **black floppy ears**, big round eyes with
  catchlights, one black spot round one eye (the classic look), and a pink tongue.
- Tail: a thin tail with one black spot near the tip.
- Gear: a **team-coloured artist's beret** (a flattened sphere with a stalk) and a team-coloured neckerchief (v14
  `dogParts.shawl`): the team read. A **fat crayon** prop in his mouth in idle; it is his "wand" in casts.
- HERO_MOTION: idle `sit` with a head tilt, run a bouncy puppy trot, cast `cheer` waving the crayon, attack a
  head flick that throws a spot.
- `HERO_COLOR_CSS` `#c23b5e` (the red collar; the card tile is cream with his spots).

**Moves and VFX:**
- Passive: a black **spot decal** on each Spotted enemy hero (1–3 dots over the plate, both teams see them, from
  `EntitySnap.dots`). A spot flies off his coat to the cat on each hit.
- Q: a spinning black disc with a white rim.
- W: an ink splash in the team colour with a black dotted outline, then a soft ink puddle that fades in 1 s.
- E: the wet-dog shake, a full-body wobble from nose to tail (a fast sine on the spine bones), with droplets flying
  out in a ring.
- R **CONNECT THE DOTS!** (signature): a dotted pencil line draws from Domino to each target in path order (0.1 s a
  link), then the lines light up as a starry STELLAR beam, with a star burst on each target and the root shackles.
  The spots fly back onto his coat. The line drawing is render-only and follows the snapshot positions at the cast
  tick (from `clip` `dots` plus the hero positions), so it never needs sim state.
- `ultName` 'CONNECT THE DOTS!'.

**Voice / emote:** zzfx `dominoBoop` (Q), `dominoSplat` (W), `dominoShake` (E: a brr-rattle), `dominoDraw`
(R: a rising pencil scratch into a chime). Emote: he shakes, every spot flies off and circles him, and then they drop
back on in the wrong places (a skin-free gag: the spot positions are shuffled with a render-side hash, and reset at
the end of the emote).

**Balance target:** 46–54%. Watch the R root with Marshmallow's freeze in the same dog team (a frozen cat that is also
Spotted). If he passes 54%, cut `rootPerDot` 8 → 5 before damage.

**Skins hook:** `coat.domino.liver` (liver-brown spots), `coat.domino.lemon` (pale lemon spots), `coat.domino.firehouse`
(a red firefighter helmet instead of the beret: the classic firehouse dog, no real fire-service insignia).

---

## 2. Pick screen and lobby

The CATS / DOGS switch shipped in v14. v15 only grows the dog grid from 7 tiles to 10. The dog grid then has the
same 2 rows by 5 columns as the cat grid, so the switch no longer changes the grid's height, and Play stays put at
667×375 (DOGS-V13 §2 rule).

- The DOGS tab count reads 10. The "after your first match" lock for a new profile stays as it is.
- The three new tiles get a **New** tag for the release (the same rule as the landing: `since === SIM_VERSION`). The
  tag goes away in the next sim version.
- Role filters, if the open matchmaking branch adds a role picker: each side now has every role at the same count.
  No code depends on that here.
- Keep `screens.ts` edits to the grid count and the New tag. The open matchmaking branch (`feat/pawlegends-matchmaking`)
  edits the lobby's "Play online" area of the same file.

---

## 3. Bot team composition

`fillPicks` is unchanged: role-blind, no repeat within a team. With 10 dogs, a dog team of 3 now draws from the same
role mix as a cat team. Gate 10 reports the share of dog teams with no support and with no tank. With 10 dogs, about
70% of dog teams have no Nugget, the same as cat teams without Gabė. Gate 10 also reports the dog-team win rate. If
the win rate leaves 47–53%, the DOGS-V13 §3 role-pass fallback is still the named fix.

---

## 4. Shared changes (append only)

1. **`ClipKind`** (`api.ts:326`): `'flop' | 'bigdog' | 'scream' | 'frozen' | 'zzz' | 'footlong' | 'dots'`. These
   events are render and share tooling only, and they are not hashed.
2. **World arrays** (`world.ts`): `dotN: Int32Array(heroes)` and `dotT: Int32Array(heroes)`, both in `hashedArrays`
   (`world.test` enforces it). Zeroed in `clearStatus` on the victim's death as well as by Domino's kit, so a respawned
   cat never carries old Spots.
3. **Snapshot**: `EntitySnap.dots?: number` (heroes only, both teams, 0 = absent), next to `stacks`. Mirror it in
   `src/host/protocol.ts`, which already carries `stacks`, and extend the `protocol.test` round trip. This is an
   optional field, not a layout change for old readers. Party play exchanges inputs, not snapshots, so `PROTO` does
   not change. Check against the matchmaking branch's PROTO 2 when merging.
4. **No new HeroKit hook, no new projectile kind, no new zone kind, no new primitive.** If a lane finds it needs
   one, the SIM lane adds it and writes the reason here.
5. **Bots:** explicit `case` lines for all three in `fightCast`, `clearCast` and `escapeCast` (`casts.ts`), each
   delegating to `src/sim/bots/heroes/<id>.ts`. BOT_AI keys are listed per dog.
6. **Client tables:** `heroSize.ts` `HERO_BUILD`, `HERO_CACHE_MAX` (64 today, `render/chars/index.ts:43`; RENDER
   raises it to 80 if the gallery or a 20-hero skins page evicts), `HERO_COLOR_CSS`, `HERO_MOTION`, `HERO_HEIGHT`, `HERO_TOP`, `HERO_SPRINGS`,
   `HERO_RING`, `ultName` / `heroAccentRaw`, `HERO_TEXT`, icons `P`, `heroAims`, `HERO_ANIM` and sfx defs: one entry
   each, imported from the hero's own module (the v11 and v14 pattern).

**Meta (none are champions):**
- `quests.ts`: 3 `win_<id>` quests (the pool goes from 17 `win_` quests to 20; the rotation length follows).
- `treats.ts`: `NAME` entries; `TRACK_ORIGINALS` gains the 3 with 3 coats each, appended after the last reward
  (+9). The loop (`LOOP_REWARDS`) runs over all originals, so it adds 8 loop palettes each (+24). Recount against
  `UNLOCKS_MAX = 200` (`profile.ts:91`), raise it in the same commit (expected about 233 → 240), and test the
  migration of an old profile.
- `grade.ts`: no new role; rerun `grade-calibrate --check` (Rocket joins the marksmen, Frankie the assassins and
  Domino the mages).
- `data/toys.ts`: toys are chosen by role, so the three get marksman, assassin and mage toys with no change.
- GDD hero table: add the three under "Isle of Woof", drop Longfellow (decision 3), and keep Barkus, Pilfer and the
  Golden Retriever for v16. PARITY §6.1: the "End of 2027 parity" line becomes "v15: 10 / 10".

---

## 5. SIM_VERSION 15 plan (exactly as v13 → v14)

1. Check the released v14 copy: `git diff bb18ae2aa3eb822d2ac26104717f68eb457f5416 HEAD --
   backend/src/vendor/pawlegends-sim/v14` must be empty. It is empty at `6c79f59a`: `bb18ae2a` is the last commit on
   origin/main that touches it. The released game build (`client/public/pawlegends-game/build-releases.json`) has
   `simHash 1a6c719240e0e947`, the same as `v14/pawlegends-sim.sha256.json` `simSourceHash`. If main re-vendors v14
   before this lands, use that later commit instead and re-read the bundle sha.
2. `src/sim/version.ts`: `SIM_VERSION = 15`. `src/sim/party.ts` `PARTY_SINCE` stays **13**.
3. `tools/vendor-sim.mjs` FROZEN: append
   `{ simVersion: 14, commit: 'bb18ae2aa3eb822d2ac26104717f68eb457f5416', from: 'backend/src/vendor/pawlegends-sim/v14', bundle: 'dba1ec165fdb7734339016dfccd55b08d370ee65e98fd900cb36c42f98997c59', extra: ['forfeit-replay.fixture.json', 'dog-replay.fixture.json'] }`.
   Follow the v13 freeze step (commit `bb18ae2a`, "vendor sim v14 into the backend (v10 to v13 frozen)") line for line.
   - v10's 30-day replay window runs to about Dec 1. If this lands after Dec 1, retire v10 in this same change (drop
     its FROZEN entry and its folder; the backend then serves 11–15) and say so in the commit. Otherwise keep it, and
     the dispatcher serves 10–15.
   - Party skew: v14 party clients must keep working during the rollout. `PARTY_SIMS` / `partySimFor` must
     include the frozen v14 (version ≥ `PARTY_SINCE`). `tools/vendor-sim-party.test.mjs` pins it.
   - Update the FROZEN header comment and `tools/vendor-sim.test.mjs` (v10 to v14 frozen; v15 live).
   - The facade type `PawlegendsHeroId` gains the 3 ids. That only widens the type.
4. Backend `pawlegends-live.spec.ts`: `[10, 11, 12, 13, 14, 15]`, `toBe(15)`, `PAWLEGENDS_SIM_INFO` versions, a fake
   hash per version; "v14 labelled v15" and "v15 labelled v14" dispatch tests; the v14 `dog-replay` fixture still
   verifies on the frozen v14; a new v15 replay with a new-dog human verifies. Record it as
   `v15/new-dog-replay.fixture.json` (Frankie, seed 1515, Easy) and add it to the live dir's extras. Update the
   comments in `pawlegends-live.ts`, `pawlegends-replay.dto.ts` (accepted range 10–15) and
   `pawlegends-replay.worker.ts`. The rookie, champion and forfeit fixtures are re-recorded.
5. Game tests that pin the version (`round2`, `sim-v7`, `sim-v10`, `sim-v11`, `sim-v12`, `sim-v14`): pin them to
   `SIM_VERSION` or `>= 14`, as they do today. New `sim-v15.test.ts` (§6).
6. **Order:** v15 stays live while tuning. Run `npm run vendor-sim && npm run vendor-sim:check` after the last
   tuning change, right before the final sim commit (expect "v10 … v14 (frozen), v15"). Then `cd ../backend && npx jest
   src/pawlegends && npm run lint && npm run build`. **The backend deploys before any client build that ships v15**
   (`vendor-sim:check-remote`). The main session does the release; this branch never runs `build:client`.
7. **Collision risk:** `feat/pawlegends-matchmaking` (PROTO 2) and `feat/gcp-migration` (party ticket and IP) touch
   the backend party code and maybe the vendored facade. Whichever lands second rebases its vendor step and re-runs
   `vendor-sim`. Never hand-merge the generated bundle.
8. Scores are still saved only through `POST /user/catbassadors/live`. There is no new write path.

---

## 6. Tests and e2e to add

**New, per dog** (templates: `tests/unit/heroes/howler.test.ts`, `chili.test.ts` and `kit-helpers`):
- `rocket.test.ts`: Sighthound applies at ≥ 4.5 m only, and to basics only; the Q hit hastes him, but his E and R hits
  do not (the guard); Photo Finish loads, empowers and slows one basic, and expires; **SQUIRREL! leaves every
  caught hero closer to the squirrel than it started**, a CC-immune hero is not moved, and a hero outside the ring is
  not hit; the R sprint is untargetable (a tower bolt and an in-flight skillshot miss), each hero is hit once, Clocked
  only boosts *his* basics on *those* heroes for `clocked` ticks; **the nap always follows the sprint, even when the
  sprint is cut short by a stun**; **no move, basic or cast during the nap even when CC-immune**; the nap damage cut;
  Power Nap heals; one `zzz` clip per R.
- `frankie.test.ts`: Combo needs one ability hit and one basic on the same hero, in either order, inside 3 s; the
  lockout; Combo damage does not chain; the Q roll stops at the first hero and knocks it back; minions passed take 50%;
  **Dig is untargetable for the whole travel, stops at walls, and stuns only on landing**; the Bun Hop clears slows;
  **FOOTLONG stuns before the snap, he lands beside the victim before the stun ends, and a Q roll hit during the
  flight is not taken as the grab**; a miss refunds 40% of the cooldown exactly (integer); one `footlong` clip per grab
  and none on a miss.
- `domino.test.ts`: Spots stack to `max` and expire after `ttl`; a basic adds none; the Splatter pulse adds a Spot;
  **no Spot when Domino died before the pulse**; per-Spot damage bonus; Big Shake knocks back and clears his slow only;
  **R path order nearest first with id tie-break, at most 3 links**; R damage and root scale with Spots; a non-Spotted
  hero on a line takes 50% and is slowed, once; Spots are used up; **R with no Spotted hero links the nearest enemy
  hero; with no enemy in range it fizzles with no cooldown**; Domino's death clears his Spots; a Duchess on the same
  mixed party team keeps her own Disdain counter (`mkStack`) apart from `dotN`.
- `tests/unit/anim-{rocket,frankie,domino}.test.ts`.
- `tests/unit/sim-v15.test.ts`: `SIM_VERSION === 15`; `PARTY_SINCE === 13`; `HERO_IDS.length === 20` with 10 per
  side and **the same role counts per side**; `fillPicks` never repeats a hero within a team across 1,000 seeds; each
  new dog appears on both sides of the draw; a v14 replay with a dog human verifies on the frozen v14 bundle; the 3
  new clip kinds fire in bot matches; `dotN` / `dotT` are in `hashedArrays`.
- `render-no-sim-rng.test.ts` stays green (Domino's emote shuffle uses a render-side hash).
- `readability.test.ts`: the Delta-E ≥ 20 check across all 20 colours.

**Update:** `picks.test.ts` (10 dogs, the "seen" set), `bots.test.ts` (the 3 cast Q/W/E/R), `determinism.test.ts`
and `fuzz-entry.ts` (`seed % HERO_IDS.length` covers all 20 as the human), **200 extra determinism seeds with Rocket
and Frankie on both teams** (`PAWLEGENDS_NIGHTLY=1`; untargetable travel during projectile flight is order-sensitive),
`skins-chars.test.ts` and `tests/fixtures/skins/golden-looks.json`, `anim/timing.contract.test.ts`, `combat-vfx.test.ts`
(melee list + `frankie`), `grade.test.ts`, `gaps-wave-a.test.ts` (reward count, quest pool), `card-art` / `card-name`,
`protocol.test` (`dots`), `world.test` (2 arrays), `team-read.test`, `hero-size.test.ts`, `chars.test`.

**e2e:** `side-switch.spec.ts` (the DOGS tab shows **10** tiles, all `data-side="dog"`; at 667×375 and 844×390 the grid,
toggle and Play stay inside the viewport and Play does not move between CATS and DOGS). `champions.spec.ts` (still
4 champions). `first-match.spec.ts`, `no-zoom`, `hud-compact`, `match-touch`, `lol-hud`, `rail` and `progression`
at their pinned viewports. A new `new-dogs-touch.spec.ts`: on 844×390 touch, a **tap** on each of the three heroes'
Q/W/E/R casts at once (no drag, no confirm), and the point slots go the full range when no enemy is in reach.

**Client (landing):** `client/__test__/pawlegends/landing-roster.test.ts` stays green: it checks every hero with
`since <= SIM_VERSION` against the game's `HERO_IDS`, so a cut dog fails CI instead of being advertised.

---

## 7. Lanes, file ownership and order

As in DOGS-V13 §7: **SIM** runs first and alone. When SIM is committed, **RENDER** and **PICKER** run in parallel on
disjoint files. No lane edits a file another lane owns. SIM may touch a RENDER or PICKER file only to add a compile
stub before they start. Paths are relative to `pawlegends/` unless they start with `../`.

### LANE SIM (first, alone)

Scope: hero data, kits, bots, the shared sim additions (§4), SIM_VERSION 15, the v14 freeze, vendor, the backend
vendored copy, unit tests, headless balance, meta tables, and **compile stubs** for every client table keyed by
`HeroId`, so `tsc` is green before RENDER and PICKER start.

Owns (writes):
- `src/data/heroes/{rocket,frankie,domino}.ts`, `src/data/heroes/index.ts` (`HERO_IDS` 17–19, `HEROES`,
  `BRANCH_TALENT: null` ×3), `src/data/bots.ts` (BOT_AI keys)
- `src/sim/heroes/{3 ids}.ts`, `src/sim/heroes/kit.ts` (KITS)
- `src/sim/world.ts` (`dotN`, `dotT`, `hashedArrays`), `src/sim/effects/status.ts` (`clearStatus` zeroes them),
  `src/sim/api.ts` (`ClipKind`, `EntitySnap.dots`), `src/sim/index.ts` (snapshot `dots` only; the role-pass fallback
  only if gate 10 asks for it), `src/host/protocol.ts` (`dots`), `src/sim/version.ts`
- `src/sim/bots/casts.ts`, `src/sim/bots/heroes/{3 ids}.ts`
- `src/ui/heroText/{3 ids}.ts`, `src/ui/heroText.ts` (HERO_TEXT entries and the new number keys)
- `src/meta/quests.ts`, `src/meta/treats.ts`, `src/meta/profile.ts` (`UNLOCKS_MAX` only), `src/meta/grade.ts` (only
  if calibration moves)
- **Compile stubs only** (one entry per id pointing at a per-hero stub; RENDER and PICKER fill them later):
  `src/render/chars/specs.ts`, `src/render/chars/heroSize.ts` (`HERO_BUILD` with the §0 values, final), 
  `src/render/views/models.ts`, `src/render/anim/{common,registry,timing}.ts`, `src/render/palette.ts`
  (`HERO_COLOR_CSS` with the §0 values), `src/render/cosmetics.ts` (`FREE_COATS` placeholders),
  `src/render/chars/heroes/{3 ids}.ts` (placeholder bodies: Rocket and Domino as Howler and Marshmallow, Frankie as
  Nugget), `src/render/moves/{3 ids}.ts`, `src/render/skillfx/{3 ids}.ts`, `src/ui/icons.ts` +
  `src/ui/icons/{3 ids}.ts`, `src/input/abilities.ts` + `src/input/aims/{3 ids}.ts` (**final**, with the §1 tap
  fallbacks: the aims are gameplay, and the touch e2e needs them), `src/ui/collection.ts`, `src/embed/integrate.ts`,
  `src/app/app.ts` (only the `Record<HeroId>` entries)
- Tools: `tools/vendor-sim.mjs`, `tools/vendor-sim.test.mjs`, `tools/vendor-sim-party.test.mjs`,
  `tools/headless-match.mjs`, `tools/grade-calibrate.mjs`, `tools/lib/fuzz-entry.ts`
- Backend: `../backend/src/vendor/pawlegends-sim/**` (generated), `../backend/src/pawlegends/pawlegends-live.spec.ts`,
  `pawlegends-live.ts`, `pawlegends-replay.dto.ts`, `pawlegends-replay.worker.ts`, the re-recorded fixtures
- Client mirror: `../client/components/pawlegends/bridge.ts` (`PAWLEGENDS_HEROES`)
- Tests: `tests/unit/heroes/{3 ids}.test.ts`, `sim-v15.test.ts`, the version-pinning tests, `picks`, `bots`,
  `determinism`, `grade`, `gaps-wave-a`, `world`, `protocol`
- Docs: this file (an "As built (lane SIM)" section), `../docs/plans/moba/GDD.md` (hero table), `GAPS.md` (a line
  under N4: 10 v 10), `PARITY.md` §6.1, `POC.md` v15 addendum, `../docs/DEVELOPMENT.md` / `../docs/GAMES.md` mirrors

Exit: `tsc`, `lint:sim`, unit tests, `determinism --seeds 1000` plus the 200 Rocket/Frankie seeds, balance gates 6–10,
`vendor-sim:check` and the backend jest/lint/build all green; committed.

### LANE RENDER (after SIM, parallel with PICKER)

Scope: models, animations, VFX, portraits, sounds, cosmetics, overhead cues, clip-event consumers, gallery.

Owns (writes):
- `src/render/chars/heroes/{3 ids}.ts` (the head builders `greyhoundHead`, `dachshundHead` and `dalmatianHead`, the
  bun, the jacket and the beret live here; `dogParts.ts` may gain a shared helper, but `beast.ts`, `chibi.ts` and
  `gear.ts` stay untouched)
- `src/render/moves/{3 ids}.ts`, `src/render/skillfx/{3 ids}.ts` (the FOOTLONG tube, the dot-to-dot lines, the
  squirrel, the dirt mound)
- `src/render/chars/specs.ts`, `src/render/chars/index.ts` (`HERO_CACHE_MAX` if needed), `src/render/views/models.ts`,
  `src/render/views/projectileView.ts` (the dart, the stretch and the spot looks by owner),
  `src/render/anim/{common,registry,timing,director}.ts`, `src/render/fx/{combatVfx,lifecycle}.ts`,
  `src/render/effects.ts` and `src/render/feelEvents.ts` (the 3 clip kinds), `src/render/palette.ts` (only if Delta-E
  fails), `src/render/portraits.ts`, `src/render/cosmetics.ts` (`FREE_COATS` palettes)
- `src/ui/icons.ts` (hero glyphs) + `src/ui/icons/{3 ids}.ts`
- `src/ui/overhead.ts` (Spot pips from `dots`, both teams; the "Zzz" over a napping Rocket)
- `src/audio/sfxDefs.js` (mark each hand edit `pawlegends:`), `src/audio/sfx.ts`
- `src/gallery/{main,demo,scenarios}.ts`, `tools/anim/capture.mjs`, `tools/landing-portraits.mjs` (the three ids)
- Tests: `anim-{3 ids}.test.ts`, `readability.test.ts`, `chars.test`, `team-read.test`, `combat-vfx.test.ts`,
  `springs.test`, `hero-size.test.ts`, `skins-chars.test.ts`, `golden-looks.json`, `anim/timing.contract.test.ts`
- Docs: `pawlegends/docs/ANIM-SPEC.md` §15 briefs (the shared clip set plus the signature poses: roach nap,
  FOOTLONG stretch, dot-to-dot), and an "As built (lane RENDER)" section here

Exit: gates 11, 12 and 14 (the art gate) green; landing portraits rendered (webp files in
`../client/public/pawlegends/landing/`, hashes reported to PICKER).

### LANE PICKER (after SIM, parallel with RENDER)

Scope: the 10-tile dog grid, the New tags, every lobby, card, store or roster list that counts heroes, the landing
roster, and e2e.

Owns (writes):
- `src/ui/screens.ts` (grid count and the New tag only), `src/ui/champions.css` (only if the 10-tile dog grid needs
  it), `src/ui/cards/**`, `src/ui/cards.css`, `src/ui/store.ts`, `src/ui/slotTip.ts`, `src/ui/talents.ts`,
  `src/ui/scoreboard.ts`, `src/meta/roster.ts`, `src/meta/cardName.ts` (only where they list or count heroes by side)
- `../client/components/pawlegends/landing/roster.ts`: three entries with `since: 15` and `portrait: null` first. The
  portrait hashes go in after RENDER's art gate. Until a game build stamped v15 is committed, they show in the
  "Coming next: 3 new dogs" strip, and after it the grid shows 20 heroes, the New tags, "New: 3 dogs join the
  pack" and the lede "Ten cats, ten dogs." The build stamp (`build-releases.json`, `GAME_SIM_VERSION`) does the switch:
  never hand-edit it.
- Tests: `tests/e2e/side-switch.spec.ts`, `tests/e2e/new-dogs-touch.spec.ts` (new), `champions.spec.ts`,
  `first-match.spec.ts`, the pinned-viewport specs, `lobby.spec.ts`, `store.spec.ts`, `skins.spec.ts`,
  `treat-track.spec.ts` (only where counts change), `card-art.test.ts`, the `card-name` test,
  `../client/__test__/pawlegends/landing-roster.test.ts` and `landing.test.tsx` (counts)
- Docs: `pawlegends/README.md` (roster count)

Exit: gate 13 green; `cd ../client && npm test -- pawlegends` green.

### Order

1. **SIM**: data, kits, shared additions, bots, stubs and final aims, tests, the balance probe and tuning, then
   version 15, the v14 freeze, vendor and backend. The vendor commit is last.
2. **RENDER ∥ PICKER.**
3. **Art gate** (gate 14): a dog ships only if its gallery shots pass. Never ship stub art. **Cut order if the gate
   fails:** (1) Domino (the hidden-spot coat and the line FX are the most render work), (2) Frankie (the bun and the
   stretch tube). Rocket carries the "second marksman" slot and reuses the most existing parts. A cut reopens SIM:
   remove the id from the sim and every table, re-run the balance gate and the vendor step (the bundle changes), and
   update decision 5's count everywhere.
4. **Phase 3, tuning** (SIM lane data files and `bots.ts` only; all 20 heroes' `pvp`). Re-vendor after the last change.
5. **Release (main session):** merge origin/main, build, budget, e2e, deploy the backend first and confirm it serves
   v15, then `npm run build:client` and commit `client/public/pawlegends-game` with the landing portraits in the same
   commit. This branch never pushes, deploys or runs `build:client`.

**Bundle:** first-load JS has stayed under the 450 KB budget since v14. Three heroes at 3–4 KB each fit. Measure
after RENDER. If it grows by more than 15 KB, move the heroText blurbs and talent lines into the lazy hero chunk.

---

## 8. Gate list

The DOGS-V13 §8 gates apply with these changes:
- Gate 4: `determinism --seeds 1000` covers all **20** heroes as the human, plus 200 seeds with Rocket and Frankie on
  both teams.
- Gate 5: `vendor-sim:check` shows v10 (unless retired), v11, v12, v13 and **v14 frozen** and **v15 live**. The
  backend jest/lint/build are green.
- Gate 6 (2,000 seeds): every hero, **all 20**, at 46–54%; species 47–53%; the rest unchanged (length median
  6:00–8:00, p95 ≤ 8:30, 2.5–3.5 takedowns a minute, and so on). Report the three new dogs on their own, and report
  Chili, Cacklejaw and Marshmallow before and after, because each now shares its role on the dog side.
- Gate 10 probe extras: Rocket naps per match and the deaths during a nap; Rocket SQUIRREL! catches; Frankie FOOTLONG
  hit rate (target 35–60%) and Dig stuns; Domino average Spots per R and `dots` clips per match; the dog-team share
  without support or tank, and the win rates.
- Gate 11: `chars.test` Med ≤ 6,000 triangles, Low < Med, one SkinnedMesh, 28 bones, upright (watch Domino's 12
  spots and Frankie's bun); `team-read` ≥ 15% team colour (Rocket's jacket, Frankie's squiggle and shawl, Domino's
  beret and neckerchief); `readability` Delta-E over 20 colours; `combat-vfx` no gold-family colour on enemy reads
  (Frankie's mustard is his hero colour, never an effect colour on an enemy).
- Gate 13: the e2e list in §6, including the touch tap spec.
- Gate 14 (art): gallery shots for each new dog, both teams, Low and Med: idle, Q, W, E, R, death, results win and
  loss, and the signature poses (Rocket sprint + roach nap; Frankie dig mound + pop + FOOTLONG stretch and snap;
  Domino Spot pips + shake + dot-to-dot with 3 cats). The pick screen on both sides at 1440×900, 1280×720, 390×844,
  844×390 and 667×375.

---

## 9. Ideas considered and parked

| Idea (audit or request) | Verdict |
|---|---|
| Golden Retriever support who "fetches" allies back | Parked for v16 (decision 1): a second dog support would break role parity. The fetch idea (pull an ally to you) stays in the GDD with the Retriever. |
| "Doge" with shades | Not built: CLAIMS R9. Rocket's racing goggles are plain sports gear; there is no Shiba and no sunglasses gag. |
| Sneezing pug mage | Not built: Bravo is the pug. The AoE comedy moves to Domino's Big Shake. |
| Hot-dog-costume Dachshund | Built as Frankie (assassin). |
| Greyhound marksman, thin and tall | Built as Rocket. |
| Lord Barkus (fighter), Pilfer (support) | v16, with the Retriever. With 2 new cats in the same wave, sides go to 12 v 12 with roles matched again. |
| Longfellow (dachshund marksman) | Dropped (decision 3). |

## 10. Known gaps touched (not new findings)

- CATS-V11 "Reported, not fixed": Nap teleports home without the kit `reset` hook. Rocket's sprint stage, Frankie's
  dig and FOOTLONG stages, and Domino's Splatter wind-up guard against it, as Stilts does.
- Audit CF-07 (silent fail on a unit-target ult): none of the three uses a unit target. Domino's R fizzle uses the
  same deny path, and `new-dogs-touch.spec.ts` checks that the cue plays.
- Audit CF-03 (a tap does not go full range): the three heroes' aims follow the full-range tap rule from day one.
  The shared fix for the old heroes belongs to the mobile pass, not to this branch.
- GAPS N4 is closed. This wave makes the sides equal in size and in roles.
