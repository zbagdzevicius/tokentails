# Pawlegends animation spec (ANIM-SPEC)

Build spec for authored, sim-synced character animation and skill effects. It merges designs 0, 1 and 2.
Everything here is render-only. Nothing under `src/sim` changes: `git diff HEAD -- pawlegends/src/sim` stays
empty and `npm run determinism` stays identical to HEAD.

Sources of truth for every number below: `src/data/heroes/*.ts`, `src/data/effects.ts` (`dashSpeed` 20000,
`knockbackTicks` 6), `src/data/xp.ts` (`attackWindup` 8) and the kit code in `src/sim/heroes/`. 1 tick = 33.3 ms
(30 Hz). Distances in data are millimetres; angles are 4096 steps per turn.

---

## HOW-TO for hero agents (read this first)

The framework (P1) is built: `src/render/anim/`, wired into the Animator, HeroView, Effects and GameView. Every hero
starts as a stub and keeps today's look (legacy swing / cast, generic skill shapes) until its two files are filled.

**Your files, and only these:** `src/render/moves/<hero>.ts` (exports `MOVES: MoveSet`) and
`src/render/skillfx/<hero>.ts` (exports `SKILL_FX: SkillFxSet`). Never edit `src/render/anim/` or anything under
`src/sim/`. A missing helper or pose goes in your PR notes for the framework owner.

### Add a clip

```ts
// src/render/moves/clem.ts
import { stubMoves, swing, flip, slam, BASIC_CONTACT, COMMON } from '../anim/common';
import { Prio, type MoveSet, type ClipDef } from '../anim/types';

const basicA = swing({ id: 'clem.basicA', side: 1, cues: [['coil', 'trailOn', 'weapon'], ['contact', 'smear'], ['end', 'trailOff']] });
const e: ClipDef = flip({ id: 'clem.e', dir: 1, apex: 0.18, turns: 1 }); // takeoff → 'cast', land → 'travelEnd'

export const MOVES: MoveSet = {
  ...stubMoves('clem'),
  stub: false,                       // the director now plays your clips (false = legacy fallback)
  basic: [basicA /*, basicB, basicC */],
  slots: { q: { cast: /* Q1 */ basicA, recasts: [/* Q2, Q3 */] }, w: { cast: /* … */ basicA }, e: { cast: e }, r: { cast: /* … */ basicA } },
};
```

- A clip is data (`ClipDef`, §3): `keys` (time, a PPK / `POSES_PL` pose or `null` = the previous pose, per-bone Euler
  deltas, ease), optional `root` channels (`fwd side up` m, `yaw pitch roll` turns, `sx sy`), `markers` (named times)
  and `warp` (marker → sim anchor pairs). Templates in `anim/common.ts` return plain `ClipDef`s you can spread and edit:
  `swing thrust spinSlash flip roll leap slam throwOverhand kneelShot taunt pose`.
- **Every attack / ability clip has a `contact` marker.** Bind it:
  basics → `['contact', 'contact']` (melee) or `['contact', 'release']` (ranged), at `BASIC_CONTACT` (8 t);
  instant casts → `'cast'` (they resolve on the cast tick, so put the weight in the follow-through, §4.2 rule 7);
  dashes → take-off `'cast'`, landing `'travelEnd'` (progress-driven: the flip ends on the dash's last tick);
  Cacklejaw R → `'homingEnd'`; windup ults (Sage R, Lambo R, Gabė R, Bengas W) → coil `'windupStart'`, contact
  `'cast'`; zones → `'zoneArm'`, `'pulse'`; sustained states → `SlotMoves.hold` (loops) and `end` (on `'stateEnd'`).
- Numbers come from `anim/timing.ts` (`SIM_TIMING`, `abilNumbers`, `travelTicks`), never literals: the timing contract
  test fails on a desync after a balance change.
- Joint conventions: thigh x < 0 swings the leg forward, knee x > 0 bends it, shoulder x < 0 raises the arm, chest y
  twists, chest x > 0 leans forward, head x < 0 lifts the chin. Root: pitch + is a front flip; caps |fwd|, |side| ≤
  0.30 m (ending at 0), 0 ≤ up ≤ 1.2 m (Lambo E 1.75 m). Spins over 0.25 turn get `calm` 0 under reduce motion
  automatically; give `calm` explicitly to keep a smaller turn.
- `prio` (Basic 4, Ability 6, Ult 7), `cancel` ('afterContact' keeps a recast from cutting the strike), `mask`
  ('upper' keeps the walking legs). Cues (`[marker | time, kind, arg]`): `trailOn <socket>` / `trailOff`, `ghost`,
  `dust`, `dustRing`, `whoosh S|M|L`, `land`, `freeze <ms>`, `shake <tier 0..4>` (own only), `punch <k>` (own only),
  `smear`, `earsBack`, `mouthOpen <ms>`, `fx <id>` (→ your `SkillFxSet.onMarker`), `sfx <cue name>` (`anim/fxctx.ts`
  `CUE_SFX`). `basicPick` / `SlotMoves.pick` (must not allocate) choose empowered or nth basics; `branch` the level-6
  shape branch.

### Add skill FX

```ts
// src/render/skillfx/clem.ts
import { stubFx } from '../anim/common';
import type { SkillFxSet } from '../anim/types';

export const SKILL_FX: SkillFxSet = {
  ...stubFx('clem'),
  stub: false,
  owns: { q: true, w: false, e: false, r: false, basic: false, passive: false }, // owned slots skip the generic shape
  onCast(e, fx, ctx) {
    const a = fx.abil(e.src, 'q');                    // talent- and branch-resolved: the REAL range / arc
    const p = { x: 0, y: 0, z: 0 };
    if (!fx.heroPos(e.src, p)) return;
    const yaw = Math.atan2(e.y / 1000 + p.z, e.x / 1000 - p.x);
    fx.mesh.spawn('crescent', { x: p.x, z: p.z, yaw, sx: a.range / 1000, life: 0.3, color: 0xffe9a8, rim: fx.rim(e.src),
      p0: (a.arc / 4096) * Math.PI * 2, p1: 0.35, p2: ctx.comboIndex % 2 ? -1 : 1, rel: fx.relation(e.src) });
    fx.linger.add('crackStar', p.x, p.z, 0.8, yaw, 0xfff1c4);
  },
};
```

Use only `FxCtx` (pooled; never `new` per event in a hot loop): `mesh.spawn(kind, …)` (crescent, arc, ring, dome, wall,
beam, pillar, twister, curtain, heart, chain, meteor, glow), `linger.add` (never red, never a ring), `ribbons`,
`particles` (CombatVfx), `shock`, `cam.tier` / `cam.punch`, `sfx.cue`. Shapes use the sim radii from `fx.abil`;
zone dressing never passes the sim radius; enemy effects take `fx.rim()` (danger red). Telegraphs stay on top and any
mesh FX over an enemy windup dims to 35% automatically.

### See it, capture it

- Gallery (dev only, not in the build): `npm run dev`, then
  `http://127.0.0.1:5176/gallery.html?hero=clem&set=hero` (your file; `set=demo` shows the template demo set).
  Scenarios: `basic` (3-hit combo), `q w e r`, `q-recast`, reactions, `knock`, `death`, `respawn`, a mock `fight`,
  and every shared clip. A synthetic sim stream goes through the real SnapBuffer, GameView and director; the ruler
  under the viewport shows the sim anchors (red / gold), the events as they fire (red ticks, a red flash) and your
  clip's markers (green) as they pass. `&tier=low|med|high`, `&reduced=1`, `&cam=game` (the match camera).
- Capture: `node tools/anim/capture.mjs --hero clem --set hero [--scenario basic,e] --out <scratchpad>/anim`
  writes `<out>/<hero>/<scenario>.jpg` (12-frame contact sheet with the ruler), `.mp4` (60 fps) and `.json`, and prints
  `{ hero, scenario, clip, contactTick, eventTick, deltaFrames, maxUp, maxFwd }`. **deltaFrames must be 0 or 1.** It
  starts its own Vite server (port 5191; `--port`, or `--url` for a running one) and one browser page.

### Test it

`npx tsc --noEmit`, `npx vitest run tests/unit/anim` (timing contract, root caps / NaN on all 8 rigs, registry shape,
warp, springs, allocation scan), `npm run build && npm run budget` (≤ 450 KB first load; your files are lazy chunks),
`npm run determinism`, and `git diff HEAD -- src/sim` must be empty. No full Playwright suite on the shared machine.

### Built vs this spec (P1 notes)

- The gallery is `gallery.html` + `src/gallery/` and the capture `tools/anim/capture.mjs` (in place of
  `tools/animlab/`); `src/gallery/demo.ts` is a template demo set, never used in a match.
- Move-cue sounds are variants of the existing synth set mapped in `anim/fxctx.ts` (`CUE_SFX`, ≤ 3 per 100 ms);
  `audio/sfx.ts` is unchanged. The BasicClock lives in `anim/basicClock.ts`, the FxCtx implementation in
  `anim/fxctx.ts`.
- The ally rim is the team rose (`RELATION.ally`), not blue: blue is the enemy in this game's one relation encoding.
- P4 items not built yet: `lockFeet` pinning (the flag is accepted), phase-2 cape / prop bones, fidget scheduling,
  Low's 30 Hz / off-screen clip sampling for other heroes, and feeding the FightCam flag into `tierFx.teamFight`
  (the director's team-fight caps read either flag). The turn-in-place shuffle and start / stop leans are in
  `anim/feet.ts` (off on Low).
- First-load JS grew 396.2 → 423.9 KB gzip with the framework (spec estimate ≈ +11 KB); the hero files are lazy.
- `Juice.slowmo` is capped at 110 ms (§6); the match end (core falls, result) passes `long` to keep its 1.2 s.

---

## 0. Why it reads as "stickmen" today (the defects this work replaces)

Found by all three designs in the code and the baseline captures. They are fixed as part of this work, not silently
on the side; each fix has a test in §12.

| # | Defect | Where |
|---|---|---|
| D1 | The basic swing starts on the `hit` event. Melee strikes land 185–270 ms after the damage; ranged heroes draw the bow when the bolt lands (≈330 ms late at 6 m). | `effects.ts` `hit()` → `onSwing` |
| D2 | Every ability plays one generic 0.5 s chest hop. | `Animator.cast()` |
| D3 | Lambo borrows Brutus's motion, Avietė Cacklejaw's, Bengas and Gabė Sage's bow (they draw an invisible bow). | `chars/specs.ts` `HERO_MOTION` |
| D4 | No root channels: no height, flips, spins, rolls, squash along an axis. Only `object.position` and `rotation.y`. | `views/heroView.ts` |
| D5 | Clip time ignores hitstop, so impact poses never hold. Long global slow-mo is followed by a `SnapBuffer` catch-up rush. | `heroes.update(frame, dt)`, `juice.slowmo` |
| D6 | Hot-path allocations: `Animator.setTarget` clones 28 quaternions + 28 vectors per pose change; `HeroView.update` builds a `new Set()` every frame. | `motion.ts`, `heroView.ts` |
| D7 | Skill effects are one generic look per aim shape; the dash trail always draws the full `range` along the aim. | `effects.ts` `cast()` |
| D8 | Flinches have no direction; tails and ears are sine waves that ignore acceleration and flips. | `motion.ts` |

**Readability fact that drives the whole design.** On an 844×390 Low screen a hero is ≈45 px tall (1 m ≈ 18 px,
an arm ≈ 8 px), seen from a high pitch. Wrist detail is invisible. What reads: root motion (height shown by the
shadow separating, yaw spins, flips with ≥0.8 m apex plus a landing squash), torso arcs, silhouette changes
(tuck, split, belly-flat, kneel) and big ground shapes. **Silhouette first** is the authoring rule.

---

## 1. Decision: clip format and runtime

**Chosen: code-authored keyframe clips (TypeScript data), evaluated by our own zero-allocation sampler into a
layer stack on top of the existing procedural Animator.** Keys name a PPK/`POSES_PL` pose (IK-solved once by
`Rig.snapshot`) plus per-bone Euler deltas; root motion is a set of scalar channels on a new `mover` group; markers
bind clip time to sim anchors with a piecewise time-warp.

| Option | Cost | Verdict and reason |
|---|---|---|
| **A. Code-authored clips + own sampler** (design 0 core, design 1 templates, design 2 segment retime) | runtime ≈3–4 KB gz first-load; clip data ≈1.5–2.5 KB gz per hero, lazy | **Chosen.** Reuses the pose library and arm/sword IK. Layers cleanly over gait, idle and lean; masks and additive are trivial. Scalar root channels make a 2π spin one key (a slerp would collapse it to 0). Markers give event binding. Diffable in review, zero licence risk. |
| B. three `AnimationMixer` with clips built in code | +4.7 KB gz (measured, design 0) | Rejected as runtime: it writes bones directly and fights the procedural layers that run after it, has no event markers, needs split tracks for masks. Kept only as a dev-only `toThreeClip()` export for the gallery. |
| C. glTF clips (Blender/Mixamo) | GLTFLoader ≈15–20 KB gz + 20–60 KB per hero | Rejected now: needs an exact export of the 27-bone PPK rest; third-party packs have unclear licences and adult proportions. A later build-time converter may turn glTF into format A. |
| D. Procedural pose graph (today) | 0 | **Kept** as the base layer: gait, breath, lean, look-at, recoil springs. Poor for art-directed timing, so it no longer owns attacks or casts. |
| E. Binary int16 quaternion clips | smallest at scale | Reserved bake target if clips pass ≈400; premature at ≈180 clips. |

Authoring helpers (design 1) keep the data small: `swing()`, `thrust()`, `spinSlash()`, `flip()`, `roll()`,
`leap()`, `slam()`, `throwOverhand()`, `kneelShot()`, `taunt()`, `pose()`. They return plain `ClipDef`s.

---

## 2. File layout

All new code is under `src/render/`. Nothing under `src/sim/`.

```
src/render/anim/                     framework (first-load)
  types.ts        ClipDef, Key, ScalarKey, Ease, Mask, RootChannel, Anchor, Cue, MoveSet, SkillFxSet, MoveCtx, FxCtx
  ease.ts         EASE table (lin, in, out, inOut, back, backBig, expoIn, expoOut, elastic, step, hold)
  compile.ts      compileClip(def, rig): ClipBin  (pose keys → q/p via rig.snapshot, sparse Float32Arrays; once per rig layout, lazy)
  sampler.ts      sampleClip(bin, t, outQ, outP, mask, w, mode)  zero-alloc, cached segment cursor
  masks.ts        FULL, UPPER, LEGS, ARM_R, ARM_L, HEAD, TAIL : Float32Array(28)
  warp.ts         TimeWarp: marker→anchor piecewise map, time/progress drivers, clamp, freeze debt
  player.ts       ClipPlayer (pooled): slot, t, rate, weight, blend in/out, marker cursor
  layers.ts       LayerStack: base → gait → override → additive ×2 → root → springs → squash/blink
  root.ts         RootChannels → mover group (fwd, side, up, yaw, pitch, roll, sx, sy), caps
  springs.ts      SpringChain: tail0–5, earL/R (+ props, capes on High in phase 2)
  feet.ts         two-bone foot pinning for lockFeet clips + turn-in-place shuffle
  reactions.ts    directional flinch, heavy, knock tumble, pull stumble, stun, root, charm, fear, slow
  director.ts     AnimDirector: sim events + frame edges → clips; BasicClock; recast counters; dash progress
  timing.ts       SIM_TIMING derived from data/heroes, data/effects, data/xp (no literals)
  trails.ts       pooled ribbons (weapon tip, paws, feet, tail5, point paths); one draw
  ghosts.ts       afterimage pool (SkinnedMesh on shared geometry + frozen bone texture)
  fxkit/
    fxMaterial.ts one instanced ShaderMaterial for all mesh FX, compiled at match load
    meshFx.ts     InstancedMesh pools: crescent, arc, dome, wall, beam, pillar, twister, curtain, heart, chain, meteor
    linger.ts     lingering ground glyph decals (crack star, crack line, scorch, scratches, crater, petals)
    readability.ts telegraph-overlap dimming uniforms, coverage budget, relation rims
  cam.ts          FightCam (fight meter → IsoRig extra), shake tiers, zoom punch
  ultMoment.ts    own / ally / enemy ult moment (banner, local freeze, punch, sting)
  common.ts       shared clips: reacts, generic death, respawn drop, recall curl, zoomies gallop, level flex
  registry.ts     HERO_ANIM: the one registry, all 8 heroes, lazy loaders
src/render/moves/<hero>.ts           one MoveSet per hero (lazy chunk)
src/render/skillfx/<hero>.ts         one SkillFxSet per hero (lazy chunk)
tools/animlab/index.html, animlab.ts, capture.mjs   dev-only gallery and capture (not in the build)
tests/unit/anim/*.test.ts            unit tests (own files only)
```

`<hero>` ∈ `clem, sage, brutus, cacklejaw, lambo, aviete, bengas, gabe` (the `HeroId` union in
`src/data/heroes/types.ts`).

Edits to existing render files (only these):

| File | Change |
|---|---|
| `chars/index.ts` | insert a `mover` group: `object` (sim x/z, yaw) → `mover` → `inner` |
| `chars/motion.ts` | `Animator` hosts `LayerStack`; `setTarget` copies into two preallocated buffers (D6); `swing()`/`cast()` remain as fallbacks |
| `chars/specs.ts` | own `HERO_MOTION` profiles for Lambo, Avietė, Bengas, Gabė (D3) |
| `chars/skeleton.ts` | phase 2 only: append `capeA, capeB, prop0, prop1` after `weapon` (indices 0–27 unchanged) |
| `views/heroView.ts` | owns director hooks, feeds velocity/acceleration, drives `mover`, drops the per-frame `Set` (D6) |
| `effects.ts` | `cast/hit/windup/death` route to `AnimDirector` and the hero `SkillFxSet`; the old shape switch stays as fallback (lobby, tests, modules not loaded) |
| `gameView.ts` | creates the director, FxKit, FightCam, UltMoment; passes `juice.timeScale` to clip clocks |
| `interp.ts` | add `SnapBuffer.peekEvents(horizonTicks, out)` (read-only, reused array) |
| `juice.ts` | global hitstop restricted (§6); `slowmo` capped at 110 ms |
| `audio/sfx.ts` | cue variants (§8) |

---

## 3. Framework API (exact interfaces)

```ts
// src/render/anim/types.ts
import type { HeroId } from '../../data/heroes/types';
import type { BoneName } from '../chars/skeleton';
import type { SimEvent } from '../../sim/api';          // type-only import; no sim code runs in render

export type Ease = 'lin' | 'in' | 'out' | 'inOut' | 'back' | 'backBig' | 'expoIn' | 'expoOut' | 'elastic' | 'step' | 'hold';
export type Mask = 'full' | 'upper' | 'legs' | 'armR' | 'armL' | 'head' | 'tail';
export type RootChannel = 'fwd' | 'side' | 'up' | 'yaw' | 'pitch' | 'roll' | 'sx' | 'sy';
export type Slot = 'q' | 'w' | 'e' | 'r';

/** Priorities: higher interrupts lower; equal cross-fades. */
export const enum Prio { Idle = 1, Emote = 3, Basic = 4, Ability = 6, Ult = 7, HardCC = 8, Death = 9 }

/** Euler delta in radians (x, y, z), applied on top of the key pose. */
export type BoneDelta = readonly [x: number, y: number, z: number];
/** [time s, pose name | null (= previous pose), bone deltas | null, ease into this key]. */
export type Key = readonly [t: number, pose: string | null, deltas: Partial<Record<BoneName, BoneDelta>> | null, ease?: Ease];
/** [time s, value, ease into this key]. Values: m (fwd/side/up), turns (yaw/pitch/roll), factor (sx/sy). */
export type ScalarKey = readonly [t: number, v: number, ease?: Ease];

/** Sim anchors a marker can bind to (§4). */
export type Anchor =
  | 'windupStart' | 'cast' | 'contact' | 'release' | 'travelEnd' | 'homingEnd'
  | 'zoneArm' | 'pulse' | 'stateEnd' | 'swingStart';

export type CueKind =
  | 'trailOn' | 'trailOff' | 'ghost' | 'dust' | 'dustRing' | 'whoosh' | 'land' | 'footstep'
  | 'freeze' | 'shake' | 'punch' | 'smear' | 'earsBack' | 'mouthOpen' | 'blink' | 'fx' | 'sfx';
/** [marker name or time s, cue, arg]. arg: trail socket, fx id, sfx id, shake tier, freeze ms… */
export type Cue = readonly [at: string | number, kind: CueKind, arg?: string | number];

export interface ClipDef {
  id: string;                        // 'clem.q3'
  len: number;                       // nominal length, s
  mask: Mask;                        // 'upper' keeps the gait legs while moving
  mode: 'override' | 'additive';
  prio: Prio;
  blendIn?: number;                  // s, default 0.05
  blendOut?: number;                 // s, default 0.12
  keys: readonly Key[];
  root?: Partial<Record<RootChannel, readonly ScalarKey[]>>;
  /** Named times (s, nominal). Every attack/ability clip MUST have `contact`. */
  markers: Readonly<Record<string, number>> & { contact?: number };
  /** Marker → anchor pairs; consecutive pairs define warp segments (§4.2). */
  warp: readonly (readonly [marker: string, anchor: Anchor])[];
  cues?: readonly Cue[];
  /** Reduce-motion scale per root channel (default: yaw/pitch/roll beyond ±0.25 turn → 0, up × 0.5). */
  calm?: Partial<Record<RootChannel, number>>;
  lockFeet?: boolean;                // feet.ts pins the stance
  cancel?: 'any' | 'afterContact' | 'none';
}

export interface GaitProfile {
  stride: number; bounce: number; lean: number; hipSway: number; headBob: number;
  arms: 'pump' | 'trail' | 'hold' | 'flap' | 'out';
  variants: Partial<Record<'sneak' | 'trudge' | 'gallop' | 'charm' | 'cower' | 'haste', Partial<GaitProfile>>>;
}

export interface SpringTuning {
  tail: { k: number; c: number; lag: number };
  ears: { k: number; c: number; lag: number };
  props?: { k: number; c: number; lag: number };    // phase 2
}

/** Context the director passes when choosing a clip. Read-only views of the snapshot; no allocation. */
export interface MoveCtx {
  hero: HeroId; id: number; branch: boolean; talents: readonly string[];
  comboIndex: number; recastIndex: number;         // 0-based
  basicCount: number;                               // own confirmed basics (for everyNth)
  charged: boolean; resource: number; buffs: number; stealthed: boolean;
  ultActive: boolean;                               // e.g. Golden Hour running
  targetBehind: boolean; targetCc: boolean;         // render-side derivations for passives
}

export interface SlotMoves {
  cast: ClipDef;                                    // default cast clip
  recasts?: readonly ClipDef[];                     // Clem Q2/Q3, Cacklejaw Q2, Avietė E return
  branch?: ClipDef;                                 // level-6 shape branch (Sage lance, Brutus post)
  hold?: ClipDef;                                   // looping/sustained layer while a state lasts
  end?: ClipDef;                                    // plays on stateEnd
  onHit?: ClipDef;                                  // own ability-hit follow-up (Brutus E impact, Cacklejaw R maul)
  pick?: (ctx: MoveCtx) => ClipDef | null;          // optional override; must not allocate
}

export interface MoveSet {
  hero: HeroId;
  stub: boolean;                                    // true: director falls back to legacy swing()/cast()
  gait: GaitProfile;
  springs: SpringTuning;
  basic: readonly ClipDef[];                        // combo cycle A, B, C…
  basicPick?: (ctx: MoveCtx) => ClipDef | null;     // empowered/nth/charged replacements
  slots: Readonly<Record<Slot, SlotMoves>>;
  idle: ClipDef; fidgets: readonly (readonly [ClipDef, number])[];
  victory: ClipDef; emote: ClipDef; death: ClipDef;
  respawn?: ClipDef; levelUp?: ClipDef;
}

/** What a hero's skill FX script may use. Everything is pooled; methods never allocate. */
export interface FxCtx {
  readonly tier: 'low' | 'med' | 'high';
  readonly reduced: boolean;
  readonly mesh: MeshFx;  readonly ribbons: Ribbons;  readonly linger: Linger;
  readonly particles: CombatVfxLike;  readonly shock: ShockwavesLike;
  readonly cam: FightCamLike;  readonly juice: JuiceLike;  readonly sfx: SfxLike;
  relation(id: number): 'own' | 'ally' | 'enemy';
  rim(id: number): number;                          // relation rim colour (gold / blue / RELATION.danger)
  /** Talent- and branch-resolved ability numbers (range, arc, radius, dash, windup, durations). */
  abil(id: number, slot: Slot): Readonly<Record<string, number>>;
  heroPos(id: number, out: { x: number; y: number; z: number }): boolean;
  bonePos(id: number, bone: BoneName | 'weaponTip', out: { x: number; y: number; z: number }): boolean;
}

export interface SkillFxSet {
  hero: HeroId;
  stub: boolean;                                    // true: effects.ts generic shape switch draws instead
  owns: Readonly<Record<Slot | 'basic' | 'passive', boolean>>;
  onWindup?(e: Extract<SimEvent, { type: 'windup' }>, fx: FxCtx): void;
  onCast?(e: Extract<SimEvent, { type: 'cast' }>, fx: FxCtx, ctx: MoveCtx): void;
  onHit?(e: Extract<SimEvent, { type: 'hit' }>, fx: FxCtx, ctx: MoveCtx): void;
  onMarker?(id: number, clipId: string, marker: string, fx: FxCtx): void;
  onProjectile?(owner: number, kind: number, slot: number, fx: FxCtx): void;   // new owned projectile seen
  onZone?(zoneIndex: number, phase: 'spawn' | 'arm' | 'pulse' | 'end', fx: FxCtx): void;
  update?(dt: number, fx: FxCtx): void;             // sustained effects (tethers, curtains, wires)
}
```

```ts
// src/render/anim/registry.ts : the ONE registry. Created in phase 1 with all 8 entries pointing at stubs.
import type { HeroId } from '../../data/heroes/types';
import type { MoveSet, SkillFxSet } from './types';

export interface HeroAnimEntry {
  moves: () => Promise<{ MOVES: MoveSet }>;
  fx: () => Promise<{ SKILL_FX: SkillFxSet }>;
}

export const HERO_ANIM: Readonly<Record<HeroId, HeroAnimEntry>> = Object.freeze({
  clem:      { moves: () => import('../moves/clem'),      fx: () => import('../skillfx/clem') },
  sage:      { moves: () => import('../moves/sage'),      fx: () => import('../skillfx/sage') },
  brutus:    { moves: () => import('../moves/brutus'),    fx: () => import('../skillfx/brutus') },
  cacklejaw: { moves: () => import('../moves/cacklejaw'), fx: () => import('../skillfx/cacklejaw') },
  lambo:     { moves: () => import('../moves/lambo'),     fx: () => import('../skillfx/lambo') },
  aviete:    { moves: () => import('../moves/aviete'),    fx: () => import('../skillfx/aviete') },
  bengas:    { moves: () => import('../moves/bengas'),    fx: () => import('../skillfx/bengas') },
  gabe:      { moves: () => import('../moves/gabe'),      fx: () => import('../skillfx/gabe') },
});

/** Loads the heroes in a match (called during match load, before the first frame). Missing → stub. */
export function loadHeroAnim(ids: readonly HeroId[]): Promise<void>;
export function movesFor(h: HeroId): MoveSet;      // stub MoveSet until loaded
export function skillFxFor(h: HeroId): SkillFxSet; // stub SkillFxSet until loaded
```

A stub file is:

```ts
// src/render/moves/<hero>.ts
import { stubMoves } from '../anim/common';
export const MOVES = stubMoves('<hero>');
// src/render/skillfx/<hero>.ts
import { stubFx } from '../anim/common';
export const SKILL_FX = stubFx('<hero>');
```

Per-hero work replaces only these two files. A per-hero agent never edits `anim/` except to add a helper
template or a named pose (in its own PR section, reviewed by the framework owner).

Character-side API (on `Character.anim`, implemented by `LayerStack`):

```ts
interface AnimHandle {
  play(clip: ClipDef, o: { anchors: AnchorTimes; rate?: number; mirror?: boolean; dir?: number }): boolean; // false if refused by prio
  stop(clipId: string, blendOut?: number): void;
  react(kind: 'light' | 'heavy' | 'knock' | 'pull' | 'stun' | 'root' | 'charm' | 'fear' | 'slow',
        dirX: number, dirZ: number, ticks?: number): void;
  freeze(ms: number): void;                          // local hit-stop with debt (§6)
  setGait(variant: 'run' | 'sneak' | 'trudge' | 'gallop' | 'charm' | 'cower' | 'haste'): void;
  onMarker: (heroId: number, clipId: string, marker: string) => void;
}
/** Preallocated per player: render-time seconds for each anchor, NaN = unknown. */
type AnchorTimes = Float64Array;                    // indexed by Anchor ordinal
```

---

## 4. Event binding and time-warp

### 4.1 Anchor sources

All anchors are in render seconds on the render clock that `SnapBuffer.takeEvents` already uses (events fire at
`tick ≤ renderTick`). `peekEvents(1.6, out)` exposes events in the newest snapshot ≈53 ms before they fire
(`INTERP_LAG` 1.6 ticks).

| Anchor | Source |
|---|---|
| `windupStart` | `windup` event (`ticks` given): basics are not windup events; used for Sage R 30, Lambo R 15, Gabė R 15, Bengas W 9, Bengas R arm |
| `cast` | `cast` event tick |
| `contact` | instant casts: = `cast`. Contact-on-touch dashes: the `hit` (kind `ability`) from the same `src` (Brutus E, Cacklejaw R). Basics melee: the `hit` (kind `basic`) |
| `release` | ranged basics and skillshots: a new projectile with `owner === id` in the newest snapshot (≈1.6 ticks lookahead); skillshots also equal `cast` |
| `travelEnd` | predicted `cast + travelTicks(min(aimDist, dashData), 20 m/s)`; corrected when planar speed in the newest snapshot drops below 25% of dash speed (wall clip, stun). Never later than predicted + 2 ticks |
| `homingEnd` | Cacklejaw R: progress `s = travelled / (travelled + remaining distance to the victim)`; ends on the `hit` |
| `zoneArm` / `pulse` | the zone snapshot's `arm` and `ttl` (Gabė Q pop +15, Sage W arm +15, Bengas R arm +18 then every 15) |
| `stateEnd` | cast + data duration (W blocks, Guard Post, Golden Hour, tether), confirmed by the state/buff edge |
| `swingStart` | BasicClock (§4.3) |

`travelTicks(d, v) = ceil(d × 30 / v)` with d, v in mm and mm/s, mirroring the sim. Lambo E and every dash use
`min(|aim|, data dash)`. Avietė's blinks are instant snaps (`TELEPORT_MM`), so they have no travel segment.

### 4.2 Time-warp rules

1. A clip's `warp` list maps markers to anchors. The player builds a piecewise map: between two anchored markers the
   clip plays at `rate = nominalSpan / simSpan`.
2. **Time-driven segments** clamp rate to 0.5–2.5×. **Progress-driven segments** (end anchor `travelEnd`,
   `homingEnd`, `zoneArm`) set clip time from progress `s ∈ [0,1]` (travelled / predicted distance, or zone
   arm fraction), so a flip finishes on the exact tick the dash ends. If the dash stops early, `s` snaps to 1 and
   the landing plays.
3. **Pre-contact (anticipation)** uses the real lead `L` (windup ticks, peek lookahead, or BasicClock lead):
   - `L ≥ contact / 2.5`: play pre-contact at `contact / L` (clamped at 0.5; if more lead than needed, delay the start).
   - `L < contact / 2.5`: start at `t = contact − 2.5·L` at 2.5× ("snap coil"). The contact pose is never skipped.
4. **Contact lands on the anchor's render time to within one display frame.** This is the core contract
   ("what you see is what hits").
5. **Post-contact** plays at 1× for abilities; for basics at `clamp(authoredPeriod / measuredPeriod, 1, 1.8)` so
   Golden Hour (+40%) and Frenzy speed the follow-through.
6. **Freeze debt** (§6): frozen time is repaid by playing post-contact at 1.5× until paid, so the next contact still
   lands on its tick.
7. **Instant casts are impact-led.** Most Q/W/E resolve on the cast tick, so they get only the ≈53 ms peek coil
   (2–3 frames). Weight goes into the follow-through (flips and spins happen after the hit, as LoL front-loads
   instant casts). Full anticipation only where the sim has a windup: basics 8, Sage R 30, Lambo R 15, Gabė R 15,
   Bengas W 9.
8. **Local-player intent start** (optional): one extra tick of coil from the input intent; blends out in 80 ms if the
   sim refuses the cast.
9. **Interrupts.** Hard CC on the caster cuts the cast clip with a 60 ms blend, matching the sim cancelling the cast.
   A missed prediction (cadence or peek) unwinds as a feint over 60–80 ms.
10. **Markers drive cosmetic extras only** (trail on/off, dust, whoosh, ghosts, own camera punch). Every gameplay
    shape (cones, rings, lines, projectiles, zones) stays anchored to sim events and sim radii.

### 4.3 BasicClock (fixes D1)

- Rising edge to `attacking` in the newest snapshot → swing starts at the edge tick; contact or release at
  edge + 8 ticks.
- While still `attacking`, next swing predicted at `lastContact + P − 8` ticks; P = measured gap between the last two
  contacts, falling back to `HEROES[h].base.attackEvery` (Clem 30, Sage 27, Brutus 36, Cacklejaw 29, Lambo 30,
  Avietė 28, Bengas 30, Gabė 28).
- Confirmation: melee `hit` kind `basic` from `src`; ranged a new owned projectile. No confirmation within 2 ticks of
  the predicted contact (4 for the first) → feint blend-out over 80 ms.
- A `hit`/`release` with no swing running plays an impact-led short version (never late).
- `comboIndex` advances per confirmed swing; resets after 1.5 s without one. `basicCount` drives `everyNth` passives.

### 4.4 Layers, masks, blending (fixes D4, D6, D8)

`LayerStack.evaluate(dt)` writes into preallocated q/p buffers, in this order:

1. **Base**: held snapshot blend (as today, without clones).
2. **Gait**: procedural, per-hero `GaitProfile` and variants (`sneak`, `trudge` when slowed, `gallop` for
   Zoomies/Frenzy, `charm` tiptoe, `cower` when feared, `haste`).
3. **Override**: one active plus one fading: `q = slerp(q, clip, w·mask[b])`. `upper` clips keep gait legs.
4. **Additive** (≤2): `q = q · slerp(I, Δclip, w)` for reacts, the conductor beat, charged twitch, Valor flourish.
5. **Root**: summed root channels → `mover`.
6. **Springs** (§5).
7. **Squash spring and blink lids** (existing).

Weights `w = smooth(blendIn) × (1 − smooth(blendOut))`; blendIn 40–80 ms. Lower-priority clips are refused.
One override plus a separate reaction slot per hero, so a hit does not cancel a cast's follow-through.

### 4.5 Root motion

- `mover` pivots at the centre of mass: `mover.position = (fwd, comY + up, side)`, `inner.position.y = −comY`,
  `comY = 0.45 × height`. Flips and rolls turn about the belly. Rotation order yaw → pitch → roll; values in turns.
- Object space: the hero faces +X. Pitch is about Z (front flip +), roll about X (cartwheel / barrel roll), yaw about Y.
- Caps (runtime clamp + unit test): `|fwd|, |side| ≤ 0.30 m` and decay to 0 by clip end (dead heroes may be flung
  0.6 m); `0 ≤ up ≤ 1.75 m` (Lambo E apex), others ≤ 1.2 m; root never translates along a dash (the sim already
  moves the hero).
- **Stay at the sim position**: relation ring, self ring, auras, HP bar anchor (`HERO_TOP`), telegraphs,
  selection, pick hitbox. The shadow follows the mesh so height reads.
- Dash/blink stretch: `sx/sy` up to 1.2 × 0.88 along motion from interpolated speed. Landing squash 0.7 × 1.2 with a
  spring overshoot; hit received 0.88 along the hit direction (volume preserving).
- **Smear**: the weapon bone (or striking paw) stretches up to 1.8× along its axis for 1–2 frames when tip angular
  speed passes a threshold.

---

## 5. Secondary motion

- `SpringChain` per joint: `θ'' = −k(θ − θrest − lag·θparent) − cθ' − α·a_local − β·ω_yaw − γ·ω_body`. Inputs:
  mover/root acceleration and yaw rate from interpolated positions, plus body rotation speed, so flips whip the tail.
  Fixed 120 Hz substeps, max 4 per frame (Med/High); Low 60 Hz, 1 step, tail + ears only.
- Per-hero tuning in `MoveSet.springs`: Lambo tail heavy/slow (k 60, c 9); Avietė whippy (k 220); Brutus short
  stiff curl (k 300); Cacklejaw low swish, floppy ears; Gabė perky upright ears; others k 140, c 12.
- Ears: pinned back on dashes (`earsBack` cue), perked on Valor/charged.
- **Phase 2 (High only)**: append `capeA, capeB, prop0, prop1` bones (indices 0–27 untouched): capes stream back with
  speed (≤1.1 rad) and flare on spins; `prop0` = Brutus plume / Sage hood tip / Gabė heart float orbit / Avietė spark
  orbs (jitter when charged); Lambo's light string uses `prop0` + `prop1`.
- **Feet** (`feet.ts`, Med on-screen, High all): `lockFeet` clips pin the feet with `solveTwoBone` while hips lunge
  or crouch; idle turns > 35° at < 0.35 m/s play a 0.25 s two-step shuffle; starts get a push-off lean, hard stops a
  braking lean with overshoot.
- **Idle personality**: fidgets after 2 s idle and 4 s without combat, every 4–10 s, weighted per hero. Mood: HP < 30%
  heavy breathing + ears back; hasted/Zoomies/Frenzy sprint variant with dust.

---

## 6. Hit-stop

Local hit-stop per character replaces most of the global one (fixes D5 and avoids the snapshot catch-up rush).

| Hit | Attacker freeze | Victim freeze + shake | Global |
|---|---|---|---|
| Minion hit | 20 ms | – | none |
| Basic hit on a hero | 45 ms | 60 ms, 0.03 m | none |
| Empowered basic (Valor, charged, Steady Paw pierce, Golden Hour wave) | 60 ms | 70 ms | none |
| Ability hit | 70 ms | 80 ms | none |
| Heavy finisher (Clem Q3, Brutus E hero hit, Shield Slam on a hero, Lambo E landing, Cacklejaw R, Avietė R, `isBigHit`) | 100 ms | 110 ms | own only: existing `juice.hitstop` ≤ 55 ms |
| Killing blow | 140 ms | death fling | own only: ≤ 70 ms |
| Own ult contact | 90 ms | 110 ms | `juice.slowmo(110, 0.6)` (≈44 ms debt < 1.6 ticks, so no visible catch-up) |

- Freeze holds the clip clock and the springs' target; root XY still follows interpolation (never visually displaced
  from the hitbox). Freeze adds debt repaid at 1.5× (§4.2).
- Clip clocks also run on `dt × juice.timeScale`, so global hitstop holds poses too.
- Reduce motion: freezes halved, victim shake off. Victim shake × the shake setting (Full / Low / Off).

---

## 7. Trails, afterimages, skill-effect kit

- **Ribbons** (`trails.ts`): one `BufferGeometry`, up to 12 slots × 16 samples (High 24) × 2 verts, one draw, updated in
  place from sockets (weapon tip/base, `pawL/R`, `footL/R`, `tail5`) or a point path (dash path from snapshots, not
  the aim: fixes D7). Width tapers, UV scrolls. Colour = element core + relation rim; card tier may change tint only.
- **Afterimages** (`ghosts.ts`): ghost `SkinnedMesh` on shared geometry with a frozen bone texture (copy
  `skeleton.boneMatrices`, `update()` no-op) and the source `matrixWorld`. One unlit additive fresnel program,
  alpha 0.35 → 0 over 180 ms, no outline, drawn below telegraphs. Enemy ghosts use a low-saturation relation tint.
- **Mesh FX** (`fxkit/`): one instanced `ShaderMaterial` (attributes `aKind, aT, aColor, aRim, aSeed, aParams`),
  `depthWrite:false`, additive or alpha per pool, compiled at match load with `renderer.compile` (never a mid-match
  compile). Kinds: crescent slash (arc mesh, UV sweep, noise edge), beam, dome/shell (fresnel + hex/star), wall band
  (120°/180°), twister, curtain (flame mask), heart wave, chain links (catenary on CPU), pillar, meteor.
- **Lingering decals**: one `DecalLayer` atlas of 6 glyphs; desaturated after 200 ms; never red, never ring-shaped,
  so they never read as a zone.
- **Light flashes**: Med uses an additive ground glow card; High two pooled `PointLight`s always present at
  intensity 0 (no recompile).
- **Hitbox-true shapes**: slash arcs use the ability's real `range`/`arc` after talents and branch (`FxCtx.abil`);
  zone dressing is drawn at exactly the sim radius and ends on the zone's last tick.
- Existing systems stay in use: `CombatVfx` particles (`VFX_TIERS`), `Shockwaves`, `GroundDecals`, `DamageNumbers`.

---

## 8. Camera, shake, ult moments, sound

- **FightCam** (`anim/cam.ts`): fight meter = heroes within 10 m of the player whose team took or dealt hero damage in
  the last 2 s. At ≥4: IsoRig `extra` +2.0 m (portrait +1.5), ease in 0.8 s, hold 1.5 s after the drop, ease out
  1.2 s, inside the existing `rng[1] + combat.zoomOut` clamp. The same flag feeds `tierFx.teamFight`.
- **Shake tiers** through `Juice.kick` (setting and reduce-motion caps apply); only the strongest per 100 ms counts:
  T0 0 (ally basics, minions, off-screen); T1 0.06 (own empowered basic, own light ability hit, ally ult within 8 m);
  T2 0.14 (own heavy contact, enemy ability hitting me); T3 0.28 (own ult contact, enemy ult hitting me, tower falls);
  T4 0.45 (core down, existing).
- **Ult moment** (`ultMoment.ts`):
  - Own ult: zoom punch −5% over 100 ms, back over 400 ms; `slowmo(110, 0.6)`; DOM banner (diagonal slash in element
    colour, `portraits.ts` portrait, ult name) for 900 ms replacing `juice.callout` for ults; sting + hero bark;
    screen flash ≤ 0.15 alpha (none under reduce motion). Sage R: camera leads 0.6 m along the shot during the windup.
  - Enemy ult aimed at or near me (existing `onWindupAtMe` test): red edge vignette 300 ms + red name chip; no slow-mo.
  - Ally ult: sting at 60% volume only.
- **Sound cues** map to synth variants in `audio/sfx.ts`: `whooshS/M/L, flip, land, bodyThud, clang, tingParry,
  crackle, zap, sizzle, fwoomp, pop, balloon, chain, lightsJingle, flutter, kiss, drum, curtain, gong`. Max 3 move cues
  per 100 ms; distance attenuation through the existing `at`.

---

## 9. Readability rules (never broken)

1. Telegraphs on top: ground spectacle at renderOrder ≤ 2, telegraphs 3 (own 10, `TELEGRAPH_OVER` 8 unchanged), hero
   rings 9; vertical meshes 4–6, trails and ghosts below telegraph order, no depth write.
2. Fragment shader dims mesh FX to 35% where it overlaps an active enemy windup (`uTele[4]` from `Effects.windups`).
3. Team tint: core = element colour; outer 15% rim = relation colour. An enemy effect never reads as friendly.
4. Coverage budget: projected area of additive mesh FX above 30% of the viewport (Med/High) or 20% (Low) fades own and
   ally effects toward 0.5 alpha, oldest first. Enemy damage effects and enemy telegraphs are never dimmed.
5. Zones keep their authoritative look; dressing never extends past the sim radius.
6. Head stays above 45% of height except knock, Lambo E, death. A single spin lasts ≤ 0.3 s unless it is a windup spin
   locked to a sim windup.
7. No clip FX on stealthed or hidden heroes for viewers who cannot see them; Sage traps are never drawn for enemies.
8. Overhead bars anchored to `HERO_TOP`, not the mesh.
9. Lobby and portraits: director is null, the generic Animator stays.

---

## 10. Quality tiers, reduce motion, budgets

| | Low | Med | High |
|---|---|---|---|
| Clips, root motion, all acrobatics, reacts, squash/smear, local freeze | on | on | on |
| Clip sampling for non-player heroes | 30 Hz; off-screen skip (time advances) | 60 Hz | 60 Hz |
| Springs | tail + ears, 60 Hz 1 step | + props, 120 Hz | + capes (phase 2) |
| Foot IK | off | on-screen heroes | all |
| Ribbons | 0 (existing slash decal stays) | 6 × 16 | 10 × 24 |
| Afterimages | 0 | pool 4 (dashes, ults) | pool 8 |
| Mesh FX pools (max instances) | crescent 6, ring/dome 4, beam 2; no twister/curtain/chain (particles stand in) | crescent 12, dome 4, wall 3, beam 4, twister 3, curtain 2, chain 2, pillar 16, meteor 2 | Med × 1.5 |
| Lingering decals | 6, 0.5 s | 16, 1.2 s | 24, 1.5 s |
| Point lights | 0 | 0 (glow cards) | 2 |
| Footfall dust | off | sprint | sprint + heavy steps |
| Fidgets | self + 2 nearest | all | all |
| Extra draw calls | ≤ +2 | ≤ +7 | ≤ +9 |
| Extra CPU per frame (6 heroes) | ≈0.08 ms | ≈0.15 ms | ≈0.2 ms |

- **Team-fight cap** (`tierFx.teamFight`): afterimages only for the player and any ult being cast; ribbons only on
  ability swings.
- **Reduce motion** (`reducedMotion()`): `calm` scales apply (root yaw/pitch/roll beyond ±0.25 turn → 0, so flips
  become a hop with a lean and spins become ≤ 90° turns; `up` × 0.5); no afterimages; ribbons halved, no flicker; no
  camera punch, no slow-mo, no screen flash; curtain and twister motion still; victim shake off; freezes halved;
  particle counts × `REDUCED_COUNT`; shake capped by `shakeScaleFor`. Knock tumbles become a slide with a lean.
- **Allocations**: none per frame. Preallocated Float32Arrays, cached segment cursors, scratch quaternions, pooled
  players, ghosts, ribbons and instances; `AnimDirector` reuses one event scratch array. A unit test scans
  `sampler.ts`, `layers.ts`, `warp.ts`, `springs.ts` per-frame functions for `new`, `[]`, `{}` literals and closures.
- **Bundle** (first-load gzip, budget 450 KB, measured 396.2 KB → 53.8 KB headroom): framework ≈ 4 KB anim runtime +
  ≈ 5 KB fx kit and shader + ≈ 1.5 KB camera/ult. Per-hero `moves/` and `skillfx/` (≈ 2–4 KB gz each) are lazy
  chunks loaded during match load via the registry, so first load grows by ≈ 11 KB. Hard gate:
  `npm run build && npm run budget` after every phase.
- **Memory**: compiled clips are sparse (≈170 KB RAM per rig layout), compiled lazily only for heroes in the match.

---

## 11. Gallery and capture tool (animlab)

Dev-only, outside the build input (like `tools/trailer/harness.html`).

- `tools/animlab/index.html` + `animlab.ts`: loads one hero (`?hero=clem&tier=high&reduced=0`) next to a training
  dummy on a flat tile with the real renderer, rig, FX kit and telegraphs. It drives the real `AnimDirector` with a
  **synthetic event stream** built from `timing.ts` (windup, cast, hit, owned projectile, dash snapshots moving at
  20 m/s for `travelTicks`, zone arm/pulses), so it exercises the same binding code as a match without running the sim.
- UI: clip list (every `ClipDef` in the `MoveSet` plus common clips), play / step one 60 Hz frame / step one tick,
  rate 0.25×, a **sim-tick ruler** under the viewport with anchor ticks (windupStart, cast, contact, travelEnd…)
  and the clip's markers; a red flash on the frame the sim event fires. Toggle tiers, reduce motion, shake, enemy
  relation, mirror.
- `node tools/animlab/capture.mjs --hero <id> [--clip <id>] [--tier low|med|high] [--out <dir>]` (Playwright,
  one browser, runs only its own page): writes one PNG per tick for each clip plus a contact sheet per hero
  (`<out>/<hero>/<clip>.png`, `<out>/<hero>-sheet.png`) with the ruler burned in. Default `--out` is the caller's
  scratchpad. It also prints a JSON line per clip: `{ clip, contactTick, eventTick, deltaFrames, maxUp, maxFwd }` so
  reviewers and tests can check sync numerically.
- Real-match check: `tools/trailer/capture.mjs --only S06,S07,S08,S13 --every 8` on the seeded takes, compared with
  design 0's baseline sheets.

---

## 12. Tests and gates

Own vitest files under `tests/unit/anim/`:

- `timing.contract.test.ts`: every anchored span in every `MoveSet` equals the value from `timing.ts`, derived from
  `data/heroes` after talents and branches (windups, `travelTicks`, 15 t balloon/trap arm, 18 t curtain arm, 15 t
  pulses, 8 t basic windup), within one 60 Hz frame. A balance retune breaks the test instead of desyncing.
- `warp.test.ts`: contact lands on the anchor within one frame for windup, peek and cadence leads; clamp and
  snap-coil rules; freeze debt repaid before the next contact; progress segments reach s = 1 on the dash end tick
  (4 m/6 t, 3 m/5 t, 5 m/8 t, interrupted dash).
- `basicClock.test.ts`: synthetic stream; contact equals the hit tick at periods 30 and 21; feint on a missed hit.
- `root.test.ts`: horizontal channels end at 0; caps hold; no NaN quaternions compiling every clip against all 8 layouts.
- `springs.test.ts`: stable and NaN-free at dt 1/30, 1/60, 1/144.
- `alloc.test.ts`: pool sizes constant over 1,000 frames; source scan of hot-path functions.
- `registry.test.ts`: all 8 `HeroId`s present; each loader resolves; stub flags fall back.
- `readability.test.ts`: a fragment over an enemy windup dims; enemy effects get the danger rim.

Gates per phase: `npx tsc --noEmit`; own vitest files; `npm run determinism` identical to HEAD;
`git diff HEAD -- pawlegends/src/sim` empty; `npm run build && npm run budget` < 450 KB; animlab capture of the
changed hero. No full Playwright suite, no balance gates (shared machine).

---

## 13. Build order

1. **P1 framework** (one owner): `anim/` runtime, `mover`, LayerStack, warp, BasicClock, `peekEvents`, local freeze,
   reaction slot, D1/D2/D5/D6 fixes, `registry.ts` with 8 stub entries, stub `moves/*.ts` and `skillfx/*.ts`,
   `common.ts` reacts/death/respawn/gaits, fx kit, ribbons, ghosts, animlab. Tests above.
2. **P2 heroes** (parallel, one file pair each): fill `moves/<hero>.ts` and `skillfx/<hero>.ts` from §14. Clem first
   end to end as the reference.
3. **P3 feel**: FightCam, shake tiers, ult moments, sound cues.
4. **P4 polish**: springs/props phase 2 bones, feet, fidgets, tiers, reduce motion, seeded captures.
5. Trailer re-shoot from real gameplay of every hero afterwards (not a Gabė showcase).

---

## 14. Per-hero moveset briefs

Conventions: **C** = contact frame, pinned to the anchor in brackets. Times in ms from the anchor tick unless noted.
"peek" = the ≈53 ms lookahead coil. All basics: swing starts at `swingStart`, C at +267 ms (8 t) on the melee
`hit` or the ranged projectile spawn, follow-through to the period; combo A → B → C, reset after 1.5 s. Ranged
basic bolt speed comes from the kit constant via `timing.ts` (18 m/s per the designs' reading; a 6 m bolt flies
10 t). Every slot also has a `SkillFxSet` entry; FX listed per move.

Shared victim reactions (`common.ts`): light flinch (additive, directional, 0.2 s); heavy stagger (0.12 m recoil,
head snap, 60 ms freeze); **knock** (backward tumble warped onto 6 t, 0.4 m hop, 180° roll, land squash; reduce
motion: slide + lean); **pull** (forward stumble over 6 t); stun (dizzy circles + bent knees + star halo); root
(legs masked to held pose, upper body tugs); slow (trudge gait); fear (cower run + sweat drops); charm (tiptoe
love-struck gait, heart eyes). Respawn: team-colour light column, drop from 1.2–2.5 m over 0.35 s, landing squash,
hero flourish. Recall: 0.3 s curl into a ball, nap for 120 t, poof. Zoomies/Frenzy: gallop gait (pitch 0.9, arms as
forelegs, 1.6× cadence). Level-up 4/7/10: hero flourish through the existing `levelSpike` hook.

### Clem: Fighter, Fairy, sword and cape (reference hero)

| Move | Sim timing | Body (anchors) | Skill FX |
|---|---|---|---|
| Basic A/B/C | period 30 t; ≈21 t under R | A: R→L flat slash, hip twist 0.6 rad, right foot steps and plants (`lockFeet`). B: rising backhand, chest counter-rotate 90°, step-in fwd +0.15 m. C: overhead chop with 0.25 m hop, land squash 0.8 on C. Coil 0–170, strike 170–267, overshoot outBack to 500 | blade ribbon (Med+), smear every swing, crack glyph on C |
| Q Paw Combo | instant; cone 2.4 m 90° (Long Swipe 3.0 m); recasts 2 within 90 t; Q3 knock 1.5 m / 6 t | Q1: lunging thrust, peek coil, C = cast, fwd +0.25 m and back. Q2: spinning backhand, yaw −1 turn over 220 ms, blade crosses the front on the cast tick, 1 ghost. Q3: launcher uppercut C = cast, then **front somersault** (pitch +1 turn over 330 ms, apex 0.8 m) into guard; victim plays knock (Pounce Finish: stun) | crescent sweeping exactly the 90° cone each stage; Q3 large crescent, 1.5 m crack along knock dir, petal burst, T2 shake, 100 ms freeze. Valor 100: white-gold double crescent, +20% arc size, extra ghost |
| W The Stand | 23 t block (Steady Stand 38), parry 9 t, front 180° | wide planted guard (up −0.08, `lockFeet`), blade horizontal, cape/tail flared; reflect → 90° "ting" deflect twirl additive + 70 ms freeze; blocked hits push 0.1 m (decays); `stateEnd` sword-twirl release | 180° shimmer wall r 1.4 m, rim bright for the first 9 t; reflected bolt gets a gold streak; spark spray on blocks |
| E Tumble | 4 m in 6 t; untargetable 6 t | crouch (peek), **forward roll** pitch +1 turn driven by progress cast→travelEnd, tuck pose, up 0.18 m, land crouch outBack 120 ms, blade flourish 200 ms | stretch at take-off, ghosts ×3 over 200 ms (shows untargetable), dust at launch and land |
| R Golden Hour | instant; 180 t (Golden Afternoon 240); +40% AS; every 3rd basic: wave 5 m at 25 m/s (6 t), 1.2 m wide | sun-raise: hop 0.35 m with yaw 1 turn over 300 ms, blade to the sky (`oath` pose) at apex, plant-slam at 450 ms with squash; then golden stance layer (chin up) for the duration. Every 3rd basic → **360° sun-cleave spin slash**, C at +267 on the wave spawn | 6 m gold pillar 400 ms, petal spiral, sun halo underfoot for the duration, glowing blade ribbon; wave = crescent mesh 1.2 m × 5 m over 200 ms + gold scratch glyph 0.6 s; Sunlit Mend green motes; ult moment |
| Passive Valor | resource 0–100 | at 100 (own team): idle overhead sword twirl, ears perk | blade glow scales with resource; pink-gold flame ribbon at 100; "VALOR" burst ring on spend |
| Gait / idle | | proud knight jog, lean 0.12, bounce 0.03, blade trailing low, cape streaming; idle blade on shoulder, twirl-and-catch fidget every 6–9 s, cape flick | |
| Victory / emote / death | | victory: sword spin, plant, kneel, rise blade raised; emote: twirl + salute; death: stagger 2 steps, sword drops spinning, knees, faints back | |

### Sage: Marksman, Wind, bow and hood

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 27 t; release at 8 t on projectile spawn | draw 0–220, hold 45, C = release with string snap and bow recoil, follow-through to 500. A standing, B quick-draw side step ±0.12 m with tail flick, C low crouch shot | wind streak on the arrow |
| Passive Steady Paw | every 4th basic: pierce 7 m at 20 m/s (10.5 t), 0.6 m wide | **knee-drop shot** (up −0.2), back-foot slide, recoil fwd −0.2 m, ears pinned; counted by own bolts, confirmed by projectile kind | wind rings spiralling round the arrow, long streak trail, 60 ms freeze on hit |
| Q Volley | instant; 5 arrows (Wide Volley 7), 50°, 7 m at 20 m/s | bow rolled flat 90°, chest yaw sweeps 50° across the fan in 80–120 ms after C = cast, then recoil **hop-back** 0.2–0.4 m | 5 thin wind ribbons following the arrows; Sticky Arrows green goo puff |
| Q branch Piercing Shot | lance 9 m, 0.6 m wide, 24 m/s (11.3 t) | drops to one knee (up −0.15) on peek, bow vertical, C = cast, recoil skid fwd −0.3 m returning over 300–400 ms, cape snap | beam-core wind spear + spiral ribbon; 9 m wind-slash ground glyph 0.5 s (relation rim); T1 shake |
| W Sun Snare | instant place ≤ 6 m; arms +15 t; root 30 t | kneeling underhand toss C = cast, then yaw 1 turn over 300 ms | own team only: lob arc 200 ms; sun flower unfolds over exactly the 15 t arm (`zoneArm`), petals close when armed; vine-light coils on rooted victim 1 s. Never drawn for enemies |
| E Hop Back | 3 m in 5 t | **backflip**: pitch −1 turn, first 0.8 turn driven by progress over the dash, last 0.2 in a 100–150 ms landing; apex 1.1 m (shadow separates); bow-up air pose at apex; crouched landing skid | gust puff at take-off, 1 ghost, landing squash and dust |
| R Moonshot | windup 30 t; 40 m at 60 m/s (20 t), 1.2 m wide | windupStart→cast: 0–300 kneel and plant (sink 0.08), 300–900 full draw, 25° back lean, ears/tail/hood blown back by spring wind, 900–1000 dead-still hold. C = cast: recoil slide −0.4 m returning in 200–400 ms, cape and ears whip, bow arm overshoots | bow grows 1.6× (weapon scale), crescent moon orb forms, wind converges, all within 1.5 m of her (never over the line telegraph); markers `charge1` 500, `charge2` 900; release: moon billboard + 1.2 m beam core, beam trail 400 ms; moon-shard burst on hero hit; Moon Mark sigil; camera leads 0.6 m (own); ult moment |
| Gait / idle / end | | light bounding lope, bow low, stride 1.1; idle checks string, sniffs wind (ears swivel independently), spins an arrow; victory: arrow straight up during a backflip, catches it; death: bow spins away, half-turn, falls back | |

### Sir Brutus: Tank, Sand, tower shield, short sword, plume

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 36 t | lean back 0–180, C at 267 with body squash 0.12. A shield shove fwd +0.15; B sword chop from behind the shield; C shoulder check + stomp (`lockFeet`) | dust on C, clang sfx |
| Passive Honour | shield value rising | brace twitch additive | sand-gold rim scaling with shield share; clink + shine sweep at cap |
| Q Shield Slam | instant ring 3 m (Wide 3.8 m), slow 45 t | crouch coil + 53 ms pre-hop on peek, C = cast: shield edge into the ground (up −0.15, sy 0.75), rebound hop 0.3 m over 250 ms, plume whip | sand ring mesh at exactly the radius, 6 radial crack glyphs 1.2 s (thicker with Heavy Slam), dust dome, debris; T2 shake; 100 ms freeze on a hero |
| W Front Guard | 75 t (Bulwark 105), 120°, reach 1.8 m | upper-mask turtle (shield forward, head tucked) over the walking gait, front leg braced; each blocked projectile kicks the shield bone and pushes 0.05 m | gold tower-shield wall band 120°, r 1.8 m, 1.2 m tall; ripple + sparks on blocks; flicker in the last 500 ms |
| W branch Guard Post | dome 3 m for 60 t; cannot move | C = cast: jump, stab sword into the ground, kneel behind the shield (`vigil`/`kneel` poses), roar; legs masked planted; `stateEnd` (cast + 60): yank shield free | sand-hex fresnel dome rises 200 ms with overshoot, ripple rings on blocks, shatters into shards over 600 ms at end |
| E Pug Charge | 5 m in 8 t; first hero: knock 2 m / 6 t, stun 15 t | shoulder charge, pitch +25°, shield leading, gait cadence ×3–4 locked to 20 m/s; `onHit` (ability hit from Brutus mid-dash) impact pose + squash; travelEnd: 180–200 ms heel skid with back-lean overshoot | bull-horn ribbons from both shoulders, dust wake, 2 ghosts; on hero hit: ring burst, T2 shake, 100 ms freeze on both; victim knock (0.5 m hop, 180° roll) then stun stars |
| R Champion's Challenge | tether ≤ 5 m; 6 m ring for 90 t (Arena 120) | points the sword (150 ms), two chest thumps, roar on C = cast (mouth open, chest puff 1.1), shield-slam hop; duel stance: upper-body twist ≤ 0.6 rad toward the foe (sim facing untouched); Rally Howl adds head-up howl | 12 sand obelisks erupt around the 6 m edge, staggered over 300 ms (rim red for enemies, gold for allies); gold catenary chain Brutus→target for exactly the duration; pillars crumble 400 ms at `stateEnd`; Rally Howl speed lines; ult moment |
| Gait / idle / end | | stocky waddle, hip roll 0.18, footfall squash, shield bobbing, dust (Med+); idle snort puffs, helmet adjust, shield-rim tap; victory: shield overhead, hop with full spin; death: topples forward like a tree onto the shield (pitch +0.25 turn over 500 ms, bounce), plume flops | |

### Cacklejaw: Assassin, Dark, claw gauntlets

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 29 t | A left rake, B right rake, C **360° spin double rake** (spin starts at swingStart, C at the 270° point at 267 ms) | purple paw ribbons |
| Passive Pack Flank | render-side: target facing ≥ 120° away, or ally ≤ 4 m | rake gets 0.1 s overshoot + cackling head tilt; freeze one step heavier | red/violet streak, triple claw-scratch glyph, eye glint when behind |
| Q Jeer Slash | dash 4 m in 6 t (Long Jeer 5.5 m in 9 t), 1 m wide; recast 1 within 90 t on hero hit | Q1: low corkscrew sprint, pitch +1.1 rad, roll 1 turn driven by progress, claws trailing. Recast: aerial **cartwheel / front somersault** back along the new dash (roll −1 turn, up 0.4 m) with a cackle head-throw | violet line ribbon exactly 1 m wide along the snapshot path; X-cut mark per target; Cruel Jeer slow goo |
| W Gloat | instant cone 3 m, 70° (Wide Gloat ≈105°); fear 24 t | leans back, head thrown back, arms wide, shoulders/chest pump 3× (laughter, 8 Hz shake 600 ms), point at C = cast; mouth chatter | 3 violet sound arcs pulse inside the exact cone, "HA" glyphs; feared victims: cower gait + sweat drops |
| E Bush Slink | stealth 90 t (45 t after leaving brush) | yaw 1 turn over 250 ms diving into a crouch, then sneak gait (up −0.15/−0.2, long low strides, body pitched 30°); **Ambush**: first attack out of stealth is a pounce (crouch, 0.4–0.6 m leap landing on C) | shadow puff on entry; allies see the existing 0.42 opacity; nothing for viewers who cannot see him |
| R Pack Hunt | homing 24 m/s to lowest-HP hero ≤ 12 m (≤ 15 t); reset window 90 t, resets 1 (Feeding Frenzy 2) | 100 ms howl at C = cast, then all-fours bounding (chest pitch 1.2–1.3 rad, arms as forelegs, bounds following travelled distance, `homingEnd` progress); last 150 ms a leap (apex 0.8 m) into a **front flip** claw-down; `onHit` spinning maul (roll 1 turn over 200 ms); reset/kill: **backflip** off the victim (pitch −1 turn, 300 ms) + cackle | violet jaw sigil over the victim from cast (both teams see it), shadow ribbon + ghosts, 100 ms freeze, T2/T3; ult moment |
| Gait / idle / end | | hunched skulking lope, lean 20°, long stride; idle knuckle crack, snicker shoulder bobs, ear scratch with foot; victory: rolls on back laughing, legs kicking; death: stagger, full spin, flat on back, claws up | |

### Lambo: Tank, Stellar, pot-lid shield, tuna, fairy lights (own profile, D3)

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 30 t | A pot-lid bonk; B belly bump fwd +0.18, sx 1.15; C two-paw smash / hip check with small hop and yaw twist | star sparkle on C |
| Passive Brave With Friends | ally ≤ 4 m | brave stance (chest up, tail high) vs timid alone (ears back, tail low); idle wave to a nearby ally | faint constellation lines to allies ≤ 4 m (ally view only) |
| Q Tuna Toss | instant skillshot 6 m at 16 m/s (11.3 t; Long Toss 7.5 m), stops on first unit | sidearm/overhand hurl, arm cocked on peek, whole-body twist (hips 40°, chest 70°), C = cast, follow-through half-spin (yaw 0.5 turn) + leg lift + wobble | tuna tumbles 720°/s with a wet sparkle trail; splash, fish-bone stars, slow bubbles on hit; Extra Crispy toasted tint |
| W Big Hug | instant; shields 75 t | self-hug squeeze (sx 1.2, sy 0.85) then arms open toward the shielded ally (upper-body yaw); hugged ally plays an upper-mask happy hop | starry heart pulse, stellar ribbon arcs to the ally over 0.4 s, star-bubble shell on both for exactly 75 t |
| E Belly Flop | hop min(|aim|, 5 m) in ≤ 8 t (Flop Further 6.5 m, 10 t); ring 2.2 m at travelEnd + 1 t; stun 15 t | squash take-off at cast; parabolic arc apex 0.35 × distance (≤ 1.75 m) driven by progress; pitch +0.25 turn to **belly-down spread-eagle** in the first half; C = the ring hit (travelEnd + 1 t): pancake squash sy 0.55–0.6, sx 1.3, rebound 0.2 m | meteor streak trail; star shockwave ring at exactly 2.2 m on C; crater glyph 1.5 s; bouncing stars; T2 shake; 100 ms freeze |
| R Tangled Lights | windup 15 t; radius 4.5 m (Wide Tangle 5.5 m); pull ≤ 2 m over 6 t; root 30 t (Finale 45) | windupStart→cast: spins in place 2 turns, accelerating, ending on the cast tick, light string whirling; C = cast: leans back 30°, **hauls with both arms** ≈6 t while victims slide in, then plants | light spiral unwinds and reaches the exact radius at 500 ms, drawn under the telegraph; strands snap taut to each enemy hit and drag over 6 t with chasing bulbs; light coils on victims' legs for the root; ult moment |
| Gait / idle / end | | jolly heavy waddle, bounce 0.05, double hip sway with side roll, belly jiggle squash each footfall, arms out; idle belly rub, big yawn; victory: belly drum then a belly-flop on the spot; death: deflates then rolls onto his back, paws up, stars circling | |

### Avietė: Assassin, Electric, claws and spark orbs (own profile, D3)

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 28 t | A left jab, B right cross, C **spinning back-kick / roundhouse** (yaw 1 turn ending on C at 267), tail whip | foot ribbon on C |
| Passive Shy Then Shiny | `charged` flag | coiled crouch layer with ear-spark twitches (both teams see it, matching the sim's counterplay glow); charged hit replaces the basic with a **flying knee / flip kick** (0.3 m leap landing on C) | lightning arc paw→victim, 60–100 ms freeze, stun stars; orbs orbit faster with jitter; in brush hides face behind paws |
| Q Spark Swipe | instant cone 2.2 m, 100° (Wide 120°) | **tornado swipe**: yaw 1 turn over 180–220 ms, spin starts on the peek so the lead leg crosses the front on the cast tick, 0.3 m hop | electric crescent with crackling edge sweeping the exact cone |
| W Shiny Coat | instant; haste 60 t | wet-cat shake (roll oscillation 12 Hz decaying over 300–400 ms), fur puff 1.08, upper mask while running, then haste gait | sheds sparks, rim glow 2 s |
| E Live Wire | instant blink ≤ 4.5 m (Long Wire 5.5 m); return recast within 60 t | 2 frames of crouch-squash before the snap (peek), collapses to a line (0.2 wide × 1.4 high); arrives stretched, snaps back with overshoot, spin-landing crouch; return recast arrives with a **backflip** | `vfx.lightning` at both ends, ghost left at the origin (High), crackling wire ribbon origin↔landing for the 60 t window, visible to **both teams** |
| R Short Circuit | blink beside an enemy hero ≤ 6 m, damage on the cast tick; dazzle 3 m slow 45 t | arrival = C = cast: appears at up 0.6–1.0 m in an **axe-kick heel-down** contact pose on the target; then rebound **backflip** away (pitch −1 turn, 300–400 ms, root returns to 0) | flash at origin, sky bolt ending at her contact pose (the bolt drops, not her body), electric ring at exactly 3 m + static glyph 1.5 s; Blinding Shine stronger tint only; 100 ms freeze; ult moment |
| Gait / idle / end | | light springy ninja sprint, arms swept back, footfall sparks while charged; idle long cat stretch, tail sparks, shy fidget; victory: double backflip into a pose with sparks; death: electrocuted shake (300 ms, 12 Hz), stiff fall, fizzling spark | |

### Bengas: Mage, Fire, baton and flower crown, theatre cat (own profile, D3)

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 30 t; release on projectile spawn | A baton forehand flick, B backhand / twirl-flick, C two-handed conductor's downbeat (or 360° baton twirl then point) | ember bolt trail |
| Passive Hot Toast | basic on a stunned/rooted/feared/slowed hero (buff flags) | extra fire twirl on the follow-through | ember brand mark + flame burst |
| Q Burnt Toast | instant skillshot 7 m at 18 m/s (11.7 t; Extra Crispy 1.1 m wide), stops on first unit | tennis-forehand serve, whip arm, C = cast/release, follow-through pirouette (yaw 1 turn over 200 ms) | spinning flaming toast with smoke trail; crumbs, ember burst, 1 m scorch glyph 1 s |
| W Striking Pose | windup 9 t; cone 4 m, 70°; stun 23 t (Showstopper 30) | **spin-in**: yaw exactly 1 turn over windupStart→cast (300 ms), freezing in a vogue pose on C (one paw up, hip popped), held 400 ms. The stillness is the effect | camera-flash wedge mesh over the exact cone for 120 ms, spotlight beam on him, flash-bulb marker; dazzled victims star halo |
| E Camellia Hop | 3.5 m in 6 t (Long Hop 4.5 m, 7 t); haste 30 t | **grand jeté** driven by progress: thighs split (+1.4/−1.2 rad), apex 0.6–0.9 m, arms up; lands in a plié squash / curtsy, 180° twirl into the haste run | red petal ribbon, landing petals |
| R Curtains Up! | disc ≤ 9 m, 3.5 m (Wide Stage 4.5 m); arms +18 t; 8 pulses every 15 t (Encore 12) | C = cast: theatrical bow (250 ms), baton sweeps up "raising the curtain" cast→zoneArm (600 ms); then **conducts one downbeat per pulse** (additive upper, `pulse` anchors), continues over the gait if he walks; bow at zone end | two flame-curtain meshes part over exactly the 18 t arm; stage-board glyph with fire edge at exactly the sim radius; each pulse: flare ring + 4 small flame pillars + `drum`; curtains close at end; inner flames ≤ 45% alpha, enemy rim red; ult moment |
| Gait / idle / end | | prancing stage trot, high knees, chest up, cape flowing; idle practises poses, straightens crown, fingertip flame, bows to the audience; victory: deep bow, baton sweep, thrown flowers / confetti; death: paw to forehead, spins 1.5 turns, collapses, a rose drops | |

### Gabė: Support, Wind, wings and heart float (own profile, D3)

| Move | Sim timing | Body | Skill FX |
|---|---|---|---|
| Basic | period 28 t; release on projectile spawn | A blown kiss, B wing flick, C twirl toss | heart dart trail |
| Passive Heart Breeze | basic hit on a hero heals an ally | 200 ms happy wing flutter additive; healed ally small bounce | heart ribbon arcs victim→healed ally over 400 ms |
| Q Heart Balloon | point ≤ 7 m; pops +15 t; radius 2.2 m (Big Balloon 2.8 m) | underhand lob with a wing-flap hop, C = cast; head tracks the balloon; clap on `zoneArm` | balloon parabola apex 2.5 m landing in exactly 15 t (progress = arm fraction), shadow tracks landing point; pop: confetti + ring at the exact radius; allies green-plus hearts, enemy rim red |
| W Wing Wrap | instant; ally nearest the aim ≤ 6 m (pick 2.5 m) else self; shield 90 t, haste 45 t | wings sweep forward in an embrace toward the ally (upper-body yaw), sparkle on C; on self: 400 ms wing cocoon then flutter open | feather swirl flies to target, two wing meshes close round the ally like a cocoon, feather-shield glow for 90 t, haste lines 45 t |
| E Chase the Wind | 4 m in 6 t; allies within 1.5 m of the path hasted 60 t | gliding leap, wings spread, up 0.5–0.7 m, **barrel roll** (roll 1 turn driven by progress), 2 flap markers, tiptoe landing | wind band ribbon 3 m wide (the touch zone) along the snapshot path, small twister at take-off, gust swirl per touched ally |
| R Under Her Spell | windup 15 t; cone 6 m, 90° (Long Glance 7.5 m); charm 30 t (Smitten 38) | windupStart→cast: one-turn **twirl** over 400 ms, hearts gather; C = cast: lean forward, wink (eye scale), blown kiss, wings snap wide | heart-shaped wavefront crosses the cone to its exact range in 200 ms; charmed enemies: heart eyes + pink leash ribbon to Gabė for the charm duration; victims play the charm gait; ult moment |
| Gait / idle / end | | skipping hop-run (0.12 m hop every second step), wings bobbing; idle hover bob 0.05 m, wing flutter, hugs heart float, tosses a little heart that pops; victory: heart burst, spinning wing-spread, blown kisses; death: swoon, wings fold over her, feathers drift | |

---

## 15. Sim timing reference (from data; `timing.ts` derives all of these)

| Item | Value |
|---|---|
| Basic windup | 8 t (267 ms), every hero |
| Basic period | Clem 30, Sage 27, Brutus 36, Cacklejaw 29, Lambo 30, Avietė 28, Bengas 30, Gabė 28 |
| Dashes at 20 m/s | Clem E 4 m 6 t; Sage E 3 m 5 t; Brutus E 5 m 8 t; Cacklejaw Q 4 m 6 t (5.5 m 9 t); Lambo E ≤ 5 m ≤ 8 t (6.5 m 10 t), ring +1 t; Bengas E 3.5 m 6 t (4.5 m 7 t); Gabė E 4 m 6 t |
| Homing | Cacklejaw R 24 m/s, ≤ 12 m, ≤ 15 t |
| Blinks | Avietė E 4.5 m (5.5), R ≤ 6 m: instant |
| Knockback / pull | 6 t (Clem Q3 1.5 m, Brutus E 2 m + stun 15, Lambo R pull 2 m) |
| Projectiles | Sage Q 7 m @ 20 (10.5 t); lance 9 m @ 24 (11.3 t); Moonshot 40 m @ 60 (20 t); passive pierce 7 m @ 20; Lambo Q 6 m @ 16 (11.3 t); Bengas Q 7 m @ 18 (11.7 t); Clem R wave 5 m @ 25 (6 t) |
| Windups | Sage R 30, Lambo R 15, Gabė R 15, Bengas W 9 |
| Zones | Sage W arm 15, root 30; Gabė Q arm 15; Bengas R arm 18 then every 15 for 120 t (Encore 180) |
| Durations | Clem W 23 (38), parry 9, R 180 (240); Brutus W 75 (105), Guard Post 60, R 90 (120); Cacklejaw E 90, Q recast 90, R reset 90; Lambo W 75, R root 30 (45); Avietė W haste 60, E return 60, R slow 45; Bengas W stun 23 (30), E haste 30; Gabė W shield 90, haste 45, E haste 60, R charm 30 (38); recall/nap 120 |
