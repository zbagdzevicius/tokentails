/**
 * Gabė skill FX (ANIM-SPEC §14, §7): pink hearts and pale wind, every gameplay shape at the sim's own numbers
 * (FxCtx.abil: talent-resolved radius, range, arc, durations).
 *
 * - Basic / passive Heart Breeze: a heart streak arcs from a hero she hits back to her heart float (the heal is sent).
 * - Q Heart Balloon: the balloon (a pink dome body, readable from the iso camera) lobs from her paw to the cast point on
 *   a 2.5 m parabola that lands on exactly the arm tick (15 t); its ground shadow slides from her to the landing spot,
 *   shrinking as the balloon rises; the pop is a ring + heart wave at exactly the burst radius.
 * - W Wing Wrap: a feather swirl flies to the wrapped hero (her pick, mirrored from the kit: the ally nearest the aim),
 *   two wing bands close round them in a cocoon, and a feather ribbon orbits them for the shield's duration.
 * - E Chase the Wind: touch-zone cards (radius = touch, with a rim ring at exactly the touch radius on Med / High)
 *   dropped along her real dash path (snapshot positions, not the aim); the wind ribbon is dressing on top (it tapers,
 *   so it never stands for the zone); a twister at take-off, a gust swirl on each ally the path touches.
 * - R Under Her Spell: a heart vortex during the windup, then the cone fill at the exact range and arc with a heart
 *   wavefront crossing it in 200 ms (every heart fits inside range and arc; no full-circle burst round her: §9 rule 5);
 *   each charmed enemy gets a pink leash to her and a vertical heart-pink flame over its head (a pillar stub, which the
 *   iso camera sees; a flat heart up there is edge-on) for the charm's duration (the sim's own cone test, Purrified
 *   skipped, dropped if the snapshot shows no charm).
 * - Basic: her heart bolt launches along her facing at the bolt speed with a vertical heart-pink head and a kiss trail
 *   (A kiss pink, B flick wind, C toss a bigger heart); it bends onto a hero only when the sim's hit on that hero
 *   arrives, so a bolt at a minion never homes onto a nearby hero.
 *
 * Re-spawned shapes (leash beams, head flames, shield glow) live at least twice their cadence, so the previous one is
 * still at full alpha when the next appears: no strobing.
 *
 * Colour: own / ally thin shapes take a rim 60% toward their own colour (pink stays pink, gold only at the edge);
 * enemy shapes keep the full danger rim, and enemy ribbons are tinted toward it (an enemy band never reads as yours).
 *
 * All state is in fixed pools allocated once at load; nothing allocates per frame or per event.
 */
import { CAPS, RADIUS } from '../../data/map';
import { PROJECTILE_KIND } from '../../data/towers';
import { BuffFlag } from '../../sim/api';
import { stubFx } from '../anim/common';
import { TICK_S } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxKind, MeshFxSpawn, SkillFxSet, V3Out } from '../anim/types';

const PINK = 0xff5c9e;
const HEART = 0xff2f7a;
const BLUSH = 0xff9cc6;
const WIND = 0x9ff2dc;
const FEATHER = 0xfff4fa;
/** Balloon apex above the straight line (m), §14. */
const LOB_APEX = 2.5;
const HAND_Y = 1.5;
/** Heart wavefront crossing time (s), §14. */
const WAVE_S = 0.2;
/** Feather swirl flight to the wrapped hero (s). */
const SWIRL_S = 0.18;
const ORBIT_R = 0.8;
const LEASH_EVERY = 0.09;
/** A leash beam lives a little over two cadences: the old beam is still at full alpha (the shader fades from 55% of
 * the life) when the next one spawns, also when 60 Hz frames round the cadence up, so the leash holds steady. */
const LEASH_LIFE = LEASH_EVERY * 2.2;
/** Charm flame over each charmed head: re-spawned at the head bone this often, living a little over two cadences. */
const HEAD_EVERY = 0.1;
const HEAD_LIFE = HEAD_EVERY * 2.2;
/** The head flame: base above the ear tips (m; the head bone is the neck pivot, inside the big chibi head), radius
 * and height (m). */
const HEAD_UP = 0.2;
const HEAD_R = 0.26;
const HEAD_H = 0.9;
/** A charm the snapshot has not confirmed (Feared bit) by this age is dropped (render guessed wrong). */
const CHARM_CONFIRM_S = 0.15;
/** Hero body radius (m): the sim cone's only slack (sim/effects/cone.ts inCone: range + radius, inside the body). */
const BODY_R = RADIUS.hero / 1000;
/** Balloon / heart-streak glow cadence (s): about two live glow cards per moving heart, whatever the frame rate. */
const GLOW_EVERY = 0.045;
/** Wing Wrap haste lines cadence (s). */
const HASTE_EVERY = 0.25;
/** Wing Wrap shield glow cadence (s). */
const SHIELD_EVERY = 0.1;
/** Shield glow life: 2.5 cadences, so the re-dropped glow never strobes. */
const SHIELD_LIFE = 0.25;
/** E: a touch-zone card dropped every this many metres of dash (every tier: the ribbon tapers, the cards do not). */
const E_CARD_EVERY = 1.2;
const E_CARD_LIFE = 0.45;
/** Q balloon body (dome) radius and height (m), and its ground shadow's radius at rest (m). */
const BALLOON_R = 0.42;
const BALLOON_H = 0.75;
const SHADOW_R = 0.55;
/** Basic bolt head: a small vertical pillar stub (m). */
const BOLT_HEAD_R = 0.14;
const BOLT_HEAD_H = 0.38;
/** Basic heart bolt (HERO_RULES.projectile, m/s) and her basic range (m, + a target radius). */
const BOLT_SPEED = 18;
const BOLT_REACH = 5.5;
/** A bolt whose hit never arrives (a miss, a lost event) ends here. */
const BOLT_MAX_S = 0.5;
const HEROES = CAPS.heroes;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ scratch (no allocation per call)

const _a: V3Out = { x: 0, y: 0, z: 0 };
const _b: V3Out = { x: 0, y: 0, z: 0 };
const _c: V3Out = { x: 0, y: 0, z: 0 };
const _d: V3Out = { x: 0, y: 0, z: 0 };
const _e: V3Out = { x: 0, y: 0, z: 0 };
const _st: HeroStatus = { buffs: 0, shield: 0 };
const _sp: MeshFxSpawn = { x: 0, z: 0, sx: 1, life: 1, color: 0, rim: 0, rel: 'own' };
const _shockPos = { x: 0, y: 0.1, z: 0 };
const _shockOpt: Record<string, unknown> = { r1: 2, dur: 0.35, color: '#ff5c9e', height: 0.45 };

/** Thin shapes whose rim would swamp the colour (gold over a 6 cm pink edge; the fresnel shells are nearly all rim). */
const THIN: Readonly<Partial<Record<MeshFxKind, true>>> = Object.freeze({ beam: true, arc: true, crescent: true, heart: true, ring: true, dome: true, pillar: true });

/** Per-channel lerp of two 0xRRGGBB colours. */
function mix(a: number, b: number, k: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return ((Math.round(r) & 255) << 16) | ((Math.round(g) & 255) << 8) | (Math.round(bl) & 255);
}

/** A ribbon's colour: her own palette, tinted half-way to the danger rim when she is an enemy. */
const ribColor = (fx: FxCtx, src: number, c: number): number => (fx.relation(src) === 'enemy' ? mix(c, fx.rim(src), 0.5) : c);

/** One mesh spawn through the shared scratch options. */
function spawn(fx: FxCtx, kind: Parameters<FxCtx['mesh']['spawn']>[0], x: number, y: number, z: number, yaw: number, sx: number, life: number, color: number, src: number, p0 = 0, p1 = 0, p2 = 0, sy = 1, sz = sx, delay = 0): number {
  const o = _sp as { -readonly [K in keyof MeshFxSpawn]: MeshFxSpawn[K] };
  o.x = x;
  o.y = y;
  o.z = z;
  o.yaw = yaw;
  o.sx = sx;
  o.sy = sy;
  o.sz = sz;
  o.life = life;
  o.color = color;
  const rel = fx.relation(src);
  const rim = fx.rim(src);
  // the danger rim stays whole on enemy shapes; own / ally thin shapes keep their identity colour
  o.rim = rel !== 'enemy' && THIN[kind] === true ? mix(rim, color, 0.6) : rim;
  o.rel = rel;
  o.p0 = p0;
  o.p1 = p1;
  o.p2 = p2;
  o.p3 = 1;
  o.delay = delay;
  return fx.mesh.spawn(kind, o);
}

/** Same team as `id` (relation is the viewer's; two heroes are allies when both are or both are not enemies). */
const sameTeam = (fx: FxCtx, a: number, b: number): boolean => (fx.relation(a) === 'enemy') === (fx.relation(b) === 'enemy');

// ------------------------------------------------------------------------------------------------ pools

/** Q balloons in flight. */
const NB = 4;
const bOn = new Uint8Array(NB);
const bSrc = new Int16Array(NB);
const bT = new Float32Array(NB);
const bLife = new Float32Array(NB);
const bX0 = new Float32Array(NB);
const bY0 = new Float32Array(NB);
const bZ0 = new Float32Array(NB);
const bX1 = new Float32Array(NB);
const bZ1 = new Float32Array(NB);
const bRad = new Float32Array(NB);
const bRib = new Int16Array(NB).fill(-1);
const bNext = new Float32Array(NB);
const bShadow = new Float32Array(NB);

/** Heart streaks (passive): from a hit hero back to Gabė. */
const NH = 4;
const hOn = new Uint8Array(NH);
const hSrc = new Int16Array(NH);
const hT = new Float32Array(NH);
const hX0 = new Float32Array(NH);
const hZ0 = new Float32Array(NH);
const hRib = new Int16Array(NH).fill(-1);
const hNext = new Float32Array(NH);
const H_FLY = 0.38;

/** W swirls: fly to the target, then orbit it for the shield. */
const NW = 3;
const wOn = new Uint8Array(NW);
const wSrc = new Int16Array(NW);
const wDst = new Int16Array(NW);
const wT = new Float32Array(NW);
const wDur = new Float32Array(NW);
const wX0 = new Float32Array(NW);
const wZ0 = new Float32Array(NW);
const wArrived = new Uint8Array(NW);
const wRib = new Int16Array(NW).fill(-1);
const wHaste = new Float32Array(NW);
const wNext = new Float32Array(NW);
const wGlow = new Float32Array(NW);
const wOrb = new Float32Array(NW);

/** E wind bands along the real dash path. */
const NE = 2;
const eOn = new Uint8Array(NE);
const eSrc = new Int16Array(NE);
const eT = new Float32Array(NE);
const eDur = new Float32Array(NE);
const eTouch = new Float32Array(NE);
const eMask = new Uint16Array(NE);
const eRib = new Int16Array(NE).fill(-1);
const eRibHi = new Int16Array(NE).fill(-1);
/** Low tier: where the last touch-zone card dropped. */
const eLX = new Float32Array(NE);
const eLZ = new Float32Array(NE);
const eCard = new Uint8Array(NE);

/** R leashes: one per charmed enemy. */
const NL = 6;
const lOn = new Uint8Array(NL);
const lSrc = new Int16Array(NL);
const lDst = new Int16Array(NL);
const lT = new Float32Array(NL);
const lDur = new Float32Array(NL);
const lNext = new Float32Array(NL);
const lHead = new Float32Array(NL);
/** 1 once the snapshot shows the charm (Feared bit); a charm never confirmed is dropped. */
const lOk = new Uint8Array(NL);

/** Basic heart bolts: launched along her facing; bent onto the hero the sim's hit names, when it arrives. */
const NK = 4;
const kOn = new Uint8Array(NK);
const kSrc = new Int16Array(NK);
const kT = new Float32Array(NK);
const kX = new Float32Array(NK);
const kY = new Float32Array(NK);
const kZ = new Float32Array(NK);
const kDX = new Float32Array(NK);
const kDZ = new Float32Array(NK);
const kVar = new Uint8Array(NK);
const kRib = new Int16Array(NK).fill(-1);
const kNext = new Float32Array(NK);
/** Travelled distance (m) along the facing; the head holds at BOLT_REACH until the hit (or BOLT_MAX_S). */
const kDist = new Float32Array(NK);
/** Her own basic count per hero id (A → B → C look of the bolt). */
const kCount = new Uint8Array(HEROES);

const free = (on: Uint8Array): number => {
  for (let i = 0; i < on.length; i++) if (on[i] === 0) return i;
  return -1;
};

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  if (!fx.heroPos(e.src, _a)) return;
  const a = fx.abil(e.src, 'q');
  const i = free(bOn);
  if (i < 0) return;
  const tx = e.x / 1000;
  const tz = -e.y / 1000;
  bOn[i] = 1;
  bSrc[i] = e.src;
  bT[i] = 0;
  bLife[i] = Math.max(0.1, (a.arm ?? 15) * TICK_S);
  bX0[i] = _a.x;
  bY0[i] = HAND_Y;
  bZ0[i] = _a.z;
  bX1[i] = tx;
  bZ1[i] = tz;
  bRad[i] = (a.radius ?? 2200) / 1000;
  bNext[i] = 0;
  bShadow[i] = 0;
  _b.x = _a.x;
  _b.y = HAND_Y;
  _b.z = _a.z;
  // the ribbon is only the tail; the body is the dome re-dropped along the parabola (update)
  bRib[i] = fx.ribbons.point(_b, ribColor(fx, e.src, PINK), 0.3, 0.3);
  // the landing spot: a soft glow that holds until the pop (the zone's own telegraph flashes on top)
  spawn(fx, 'glow', tx, 0.07, tz, 0, Math.min(1.2, bRad[i] * 0.45), bLife[i], BLUSH, e.src);
  spawn(fx, 'ring', _a.x, 0.06, _a.z, 0, 1.0, 0.3, PINK, e.src, 0, 0.3);
}

function popQ(i: number, fx: FxCtx): void {
  const src = bSrc[i];
  const x = bX1[i];
  const z = bZ1[i];
  const r = bRad[i];
  spawn(fx, 'ring', x, 0.08, z, 0, r, 0.45, PINK, src, 0, 0.12);
  spawn(fx, 'ring', x, 0.08, z, 0, r, 0.4, HEART, src, 0, 0.5, 0, 1, r, 0.08);
  spawn(fx, 'heart', x, 0.1, z, Math.PI / 2, r, 0.55, HEART, src);
  spawn(fx, 'glow', x, 0.09, z, 0, r * 0.9, 0.3, BLUSH, src);
  spawn(fx, 'pillar', x, 0, z, 0, 0.55, 0.35, PINK, src, 0, 0, 0, 2.6);
  _shockPos.x = x;
  _shockPos.z = z;
  _shockOpt.r1 = r;
  fx.shock.start(_shockPos, _shockOpt);
  fx.linger.add('petals', x, z, r * 0.75, 0, BLUSH);
  _b.x = x;
  _b.z = z;
  fx.sfx.cue('pop', _b);
  if (fx.relation(src) === 'own') fx.cam.tier(1);
  if (bRib[i] >= 0) fx.ribbons.end(bRib[i]);
  bRib[i] = -1;
  bOn[i] = 0;
}

/** Wing Wrap's target, mirrored from the kit (sim/heroes/gabe.ts wrapTarget): the allied hero (not her) nearest the
 * clamped aim within the pick radius and the range, else herself. Render positions, so it can differ by a hair. */
function wrapTarget(fx: FxCtx, src: number, ax: number, az: number, range: number, pick: number): number {
  if (!fx.heroPos(src, _a)) return src;
  let px = ax;
  let pz = az;
  const dx = ax - _a.x;
  const dz = az - _a.z;
  const d = Math.hypot(dx, dz);
  if (d > range) {
    px = _a.x + (dx * range) / d;
    pz = _a.z + (dz * range) / d;
  }
  let best = src;
  let bestD = 0;
  for (let h = 0; h < HEROES; h++) {
    if (h === src || !sameTeam(fx, h, src) || !fx.heroPos(h, _c)) continue;
    if (Math.hypot(_c.x - _a.x, _c.z - _a.z) > range) continue;
    const dd = Math.hypot(_c.x - px, _c.z - pz);
    if (dd > pick) continue;
    if (best === src || dd < bestD) {
      best = h;
      bestD = dd;
    }
  }
  return best;
}

function castW(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const a = fx.abil(e.src, 'w');
  const t = wrapTarget(fx, e.src, e.x / 1000, -e.y / 1000, (a.range ?? 6000) / 1000, (a.pickRadius ?? 2500) / 1000);
  if (!fx.heroPos(e.src, _a)) return;
  const i = free(wOn);
  if (i < 0) return;
  wOn[i] = 1;
  wSrc[i] = e.src;
  wDst[i] = t;
  wT[i] = 0;
  wDur[i] = Math.max(0.5, (a.duration ?? 90) * TICK_S);
  wX0[i] = _a.x;
  wZ0[i] = _a.z;
  wArrived[i] = 0;
  wHaste[i] = (a.haste ?? 45) * TICK_S;
  wNext[i] = SWIRL_S;
  wGlow[i] = SWIRL_S;
  wOrb[i] = SWIRL_S;
  _b.x = _a.x;
  _b.y = 1.2;
  _b.z = _a.z;
  wRib[i] = fx.ribbons.point(_b, ribColor(fx, e.src, FEATHER), 0.4, 0.4);
  spawn(fx, 'twister', _a.x, 0, _a.z, 0, 0.75, 0.4, FEATHER, e.src, 0, 0, 0, 1.8);
}

function arriveW(i: number, fx: FxCtx): void {
  const src = wSrc[i];
  if (!fx.heroPos(wDst[i], _c)) return;
  // the cocoon: a feather dome and two wing bands closing from both sides, a haste twister at the feet. Short (0.35 s):
  // the hasted ally runs out of a static cocoon fast; the glow that follows them carries the shield after it
  const yaw = Math.atan2(-(_c.z - wZ0[i]), _c.x - wX0[i]);
  const y = Number.isFinite(yaw) ? yaw : 0;
  spawn(fx, 'dome', _c.x, 0.02, _c.z, 0, 1.0, 0.35, FEATHER, src, 0, 0, 0, 1.55, 1.0);
  spawn(fx, 'wall', _c.x, 0, _c.z, y + Math.PI / 2, 1.05, 0.35, BLUSH, src, 2.5, 0, 0, 1.9, 1.05);
  spawn(fx, 'wall', _c.x, 0, _c.z, y - Math.PI / 2, 1.05, 0.35, BLUSH, src, 2.5, 0, 0, 1.9, 1.05);
  spawn(fx, 'glow', _c.x, 0.08, _c.z, 0, 1.4, 0.45, PINK, src);
  spawn(fx, 'twister', _c.x, 0, _c.z, 0, 0.6, 0.5, WIND, src, 0, 0, 0, 1.3);
  fx.sfx.cue('flutter', _c);
}

function castE(e: { src: number }, fx: FxCtx): void {
  if (!fx.heroPos(e.src, _a)) return;
  const a = fx.abil(e.src, 'e');
  const i = free(eOn);
  if (i < 0) return;
  const dash = (a.dash ?? 4000) / 1000;
  eOn[i] = 1;
  eSrc[i] = e.src;
  eT[i] = 0;
  // the dash's own travel time at 20 m/s (+ two ticks of slack: the sim never lands later)
  eDur[i] = (Math.ceil((dash * 1000 * 30) / 20000) + 2) * TICK_S;
  eTouch[i] = (a.touch ?? 1500) / 1000;
  eMask[i] = 0;
  _b.x = _a.x;
  _b.y = 0.09;
  _b.z = _a.z;
  // the wind band along the path she really travels (an enemy band takes the danger tint): 2 × touch at its head; the
  // cards below carry the zone's true width
  eRib[i] = fx.ribbons.point(_b, ribColor(fx, e.src, WIND), eTouch[i] * 2, 0.55);
  eRibHi[i] = -1;
  if (fx.tier === 'high') {
    _b.y = 1.3;
    eRibHi[i] = fx.ribbons.point(_b, ribColor(fx, e.src, FEATHER), 0.35, 0.3);
  }
  // the touch zone itself: cards along the path on every tier (the ribbon tapers to 30% at its tail, so it can't show
  // the zone at the take-off end, where allies are most often touched), the first one at the take-off
  eCard[i] = 1;
  eLX[i] = _a.x;
  eLZ[i] = _a.z;
  if (!eZone(fx, i, _a.x, _a.z)) eLX[i] = NaN;
  spawn(fx, 'twister', _a.x, 0, _a.z, 0, 0.85, 0.5, WIND, e.src, 0, 0, 0, 2.3);
  spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.6, 0.4, WIND, e.src, 0, 0.35);
}

function castR(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  if (!fx.heroPos(e.src, _a)) return;
  const a = fx.abil(e.src, 'r');
  const range = (a.range ?? 6000) / 1000;
  const arc = ((a.arc ?? 1024) / 4096) * TAU;
  let yaw = Math.atan2(e.y / 1000 + _a.z, e.x / 1000 - _a.x);
  if (!Number.isFinite(yaw)) yaw = 0;
  const cx = Math.cos(yaw);
  const cz = -Math.sin(yaw);
  // charmed first (the per-target markers are gameplay information, they get the pool slots before any dressing):
  // enemy heroes inside the sim's own cone (range + body radius, inside the body always), Purrified ones skipped
  const dur = (a.charm ?? 30) * TICK_S;
  for (let h = 0; h < HEROES; h++) {
    if (sameTeam(fx, h, e.src) || !fx.heroPos(h, _c)) continue;
    if (fx.status && fx.status(h, _st) && (_st.buffs & BuffFlag.Purrified) !== 0) continue;
    const dx = _c.x - _a.x;
    const dz = _c.z - _a.z;
    const d = Math.hypot(dx, dz);
    if (d > range + BODY_R) continue;
    if (d > BODY_R) {
      let da = Math.atan2(-dz, dx) - yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > arc / 2) continue;
    }
    const i = free(lOn);
    if (i < 0) break;
    lOn[i] = 1;
    lSrc[i] = e.src;
    lDst[i] = h;
    lT[i] = 0;
    lDur[i] = dur;
    lNext[i] = 0;
    lHead[i] = 0;
    lOk[i] = 0;
    // the wavefront reaching them: a heart ring at the feet (rings are plentiful; hearts are kept for the heads)
    spawn(fx, 'ring', _c.x, 0.08, _c.z, 0, 0.9, 0.45, HEART, e.src, 0, 0.45, 0, 1, 0.9, WAVE_S * Math.min(1, d / range));
    headHeart(fx, i);
  }
  // the cone at its exact range and arc (two fills: the energy is in the cone, not round her), two crescents sweeping
  // it from both sides, a heart wavefront crossing it in 200 ms. Nothing full-circle: the sim tests a cone (§9 rule 5)
  spawn(fx, 'arc', _a.x, 0.07, _a.z, yaw, range, 0.6, PINK, e.src, arc, 0.08);
  spawn(fx, 'arc', _a.x, 0.075, _a.z, yaw, range, 0.4, HEART, e.src, arc, 0.35);
  spawn(fx, 'crescent', _a.x, 0.08, _a.z, yaw, range, 0.35, HEART, e.src, arc, 0.55, 1);
  spawn(fx, 'crescent', _a.x, 0.085, _a.z, yaw, range, 0.4, PINK, e.src, arc, 0.3, -1, 1, range, 0.06);
  // 4 hearts on High, 3 on Med, 2 on Low (the heart caps; the head markers are pillars), each inside range and arc
  const n = fx.tier === 'high' ? 4 : fx.tier === 'med' ? 3 : 2;
  const half = Math.tan(Math.min(arc / 2, 1.4));
  for (let k = 0; k < n; k++) {
    const f = (k + 1) / n;
    const d = range * (0.2 + 0.55 * f);
    const sz = Math.max(0.6, Math.min(d * half, range - d));
    spawn(fx, 'heart', _a.x + cx * d, 0.12, _a.z + cz * d, yaw, sz, WAVE_S * 1.7, HEART, e.src, 0, 0, 0, 1, sz, (WAVE_S * k) / n);
  }
  // her own beat: a small ring and glow at her feet only (≤ 0.8 m)
  spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 0.8, 0.35, PINK, e.src, 0, 0.2);
  spawn(fx, 'glow', _a.x, 0.1, _a.z, 0, 0.7, 0.3, BLUSH, e.src);
}

/** E: one touch-zone card at (x, z): radius = touch (the sim's touch test), a rim ring at exactly that radius on Med /
 * High. False when the glow pool is full (the caller retries next frame). */
function eZone(fx: FxCtx, i: number, x: number, z: number): boolean {
  if (spawn(fx, 'glow', x, 0.08, z, 0, eTouch[i], E_CARD_LIFE, WIND, eSrc[i]) < 0) return false;
  if (fx.tier !== 'low') spawn(fx, 'ring', x, 0.075, z, 0, eTouch[i], E_CARD_LIFE, WIND, eSrc[i], 0, 0.92);
  return true;
}

/** The charm marker over leash i's target: a short heart-pink flame (a vertical pillar stub, which reads from the iso
 * camera) standing on the head bone, re-dropped so it follows the walk. */
function headHeart(fx: FxCtx, i: number): void {
  const h = lDst[i];
  if (fx.bonePos(h, 'head', _d)) _d.y = fx.bonePos(h, 'earL', _e) ? Math.max(_e.y, _d.y + 0.3) + HEAD_UP : _d.y + 0.7;
  else if (fx.heroPos(h, _d)) _d.y = 2.1;
  else return;
  const life = Math.min(HEAD_LIFE, lDur[i] - lT[i]);
  if (life <= 0) return;
  // a pillar while the tier's pool has room, else a pink glow card at the same height (never no marker)
  if (spawn(fx, 'pillar', _d.x, _d.y, _d.z, 0, HEAD_R, life, HEART, lSrc[i], 0, 0, 0, HEAD_H) < 0) spawn(fx, 'glow', _d.x, _d.y + 0.2, _d.z, 0, 0.5, life, HEART, lSrc[i]);
}

/** Bolt k's hit arrived: bend the trail onto the hero it names (a minion or tower: end where the head is), pop. */
function boltHit(k: number, dst: number, fx: FxCtx): void {
  const src = kSrc[k];
  const big = kVar[k] === 2;
  const col = kVar[k] === 1 ? WIND : HEART;
  if (dst >= 0 && dst < HEROES && fx.heroPos(dst, _c)) {
    kX[k] = _c.x;
    kY[k] = 1.0;
    kZ[k] = _c.z;
    if (kRib[k] >= 0) fx.ribbons.feed(kRib[k], kX[k], kY[k], kZ[k]);
  }
  spawn(fx, 'glow', kX[k], kY[k], kZ[k], 0, big ? 0.85 : 0.6, 0.18, col, src);
  if (fx.tier !== 'low') spawn(fx, 'pillar', kX[k], Math.max(0, kY[k] - 0.3), kZ[k], 0, big ? 0.3 : 0.22, 0.2, col, src, 0, 0, 0, big ? 0.8 : 0.6);
  if (kRib[k] >= 0) fx.ribbons.end(kRib[k]);
  kRib[k] = -1;
  kOn[k] = 0;
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('gabe'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, _a)) return;
    const s = e.ticks * TICK_S;
    // hearts gather round her (kept within 1 m of her body, never over the cone telegraph)
    spawn(fx, 'twister', _a.x, 0, _a.z, 0, 0.95, s, PINK, e.src, 0, 0, 0, 2.5);
    spawn(fx, 'glow', _a.x, 0.1, _a.z, 0, 1.3, s + 0.1, BLUSH, e.src);
    spawn(fx, 'pillar', _a.x, 0, _a.z, 0, 0.5, s, HEART, e.src, 0, 0, 0, 3.2);
  },

  onCast(e, fx) {
    switch (e.slot) {
      case 0:
        return castQ(e, fx);
      case 1:
        return castW(e, fx);
      case 2:
        return castE(e, fx);
      case 3:
        return castR(e, fx);
      default:
        return;
    }
  },

  onHit(e, fx) {
    if (e.kind !== 'basic') return;
    // her bolt lands: the oldest live bolt of hers ends on the hit (bent onto the hero it names)
    let k = -1;
    for (let j = 0; j < NK; j++) if (kOn[j] === 1 && kSrc[j] === e.src && (k < 0 || kT[j] > kT[k])) k = j;
    if (k >= 0) boltHit(k, e.dst, fx);
    // Heart Breeze: a basic hit on a hero sends a heal; the streak flies from the victim back to her heart float
    if (e.dst < 0 || e.dst >= HEROES || !fx.heroPos(e.dst, _c)) return;
    const i = free(hOn);
    if (i < 0) return;
    hOn[i] = 1;
    hSrc[i] = e.src;
    hT[i] = 0;
    hNext[i] = 0;
    hX0[i] = _c.x;
    hZ0[i] = _c.z;
    _b.x = _c.x;
    _b.y = 1.2;
    _b.z = _c.z;
    hRib[i] = fx.ribbons.point(_b, ribColor(fx, e.src, PINK), 0.24, 0.28);
    spawn(fx, 'glow', _c.x, 1.0, _c.z, 0, 0.6, 0.2, BLUSH, e.src);
  },

  onProjectile(owner, kind, _slot, fx) {
    // her basic heart bolt (the sim's homing hero bolt): launched along her facing; the hit event bends it onto its target
    if (kind !== PROJECTILE_KIND.hero || owner < 0 || owner >= HEROES || !fx.heroPos(owner, _a)) return;
    const v = kCount[owner] % 3;
    kCount[owner] = (v + 1) % 3;
    const i = free(kOn);
    if (i < 0) return;
    if (fx.bonePos(owner, 'pawR', _b)) {
      kX[i] = _b.x;
      kY[i] = _b.y;
      kZ[i] = _b.z;
    } else {
      kX[i] = _a.x;
      kY[i] = HAND_Y;
      kZ[i] = _a.z;
    }
    // her facing from the head to the mouth (the body faces the target on release); 0 when unknown
    let fdx = 0;
    let fdz = 0;
    if (fx.bonePos(owner, 'head', _b) && fx.bonePos(owner, 'mouth', _c)) {
      const l = Math.hypot(_c.x - _b.x, _c.z - _b.z);
      if (l > 1e-4) {
        fdx = (_c.x - _b.x) / l;
        fdz = (_c.z - _b.z) / l;
      }
    }
    kOn[i] = 1;
    kSrc[i] = owner;
    kT[i] = 0;
    kVar[i] = v;
    kNext[i] = 0;
    kDist[i] = 0;
    kDX[i] = fdx;
    kDZ[i] = fdz;
    _b.x = kX[i];
    _b.y = kY[i];
    _b.z = kZ[i];
    const col = v === 1 ? WIND : v === 2 ? HEART : PINK;
    kRib[i] = fx.ribbons.point(_b, ribColor(fx, owner, col), v === 2 ? 0.38 : 0.3, 0.22);
    spawn(fx, 'glow', kX[i], kY[i], kZ[i], 0, v === 2 ? 0.7 : 0.5, 0.16, col, owner);
  },

  onMarker(id, _clip, marker, fx) {
    if (!fx.heroPos(id, _a)) return;
    switch (marker) {
      case 'bFlick':
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.2, 0.28, WIND, id, 0, 0.45);
        return;
      case 'bToss':
        spawn(fx, 'glow', _a.x, 1.6, _a.z, 0, 0.7, 0.2, PINK, id);
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.0, 0.3, PINK, id, 0, 0.4);
        return;
      case 'wBloom':
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.8, 0.4, PINK, id, 0, 0.25);
        spawn(fx, 'glow', _a.x, 0.1, _a.z, 0, 1.2, 0.35, BLUSH, id);
        fx.linger.add('petals', _a.x, _a.z, 1.0, 0, FEATHER);
        return;
      case 'eLand':
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.3, 0.35, WIND, id, 0, 0.3);
        fx.linger.add('petals', _a.x, _a.z, 0.9, 0, FEATHER);
        return;
      case 'rGather':
        spawn(fx, 'glow', _a.x, 1.4, _a.z, 0, 0.9, 0.2, HEART, id);
        return;
      case 'feathers':
        fx.linger.add('petals', _a.x, _a.z, 1.3, 0, FEATHER);
        spawn(fx, 'glow', _a.x, 0.1, _a.z, 0, 1.2, 0.5, FEATHER, id);
        return;
      case 'respawnFx':
        spawn(fx, 'pillar', _a.x, 0, _a.z, 0, 0.75, 0.6, PINK, id, 0, 0, 0, 4.5);
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 1.8, 0.45, PINK, id, 0, 0.2);
        fx.linger.add('petals', _a.x, _a.z, 1.1, 0, BLUSH);
        return;
      case 'vBurst':
        spawn(fx, 'heart', _a.x, 0.1, _a.z, Math.PI / 2, 2.2, 0.7, HEART, id);
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 2.4, 0.5, PINK, id, 0, 0.2);
        return;
      case 'emoteKiss':
        spawn(fx, 'glow', _a.x, 1.6, _a.z, 0, 0.6, 0.25, PINK, id);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    // Q balloons: the parabola lands on the arm tick, then the pop
    for (let i = 0; i < NB; i++) {
      if (bOn[i] === 0) continue;
      bT[i] += dt;
      const s = Math.min(1, bT[i] / bLife[i]);
      const x = bX0[i] + (bX1[i] - bX0[i]) * s;
      const z = bZ0[i] + (bZ1[i] - bZ0[i]) * s;
      const y = bY0[i] * (1 - s) + 0.3 * s + 4 * LOB_APEX * s * (1 - s);
      if (bRib[i] >= 0) fx.ribbons.feed(bRib[i], x, y, z);
      if (bT[i] >= bNext[i] && s < 1) {
        // the balloon's body: a pink dome (vertical, so the iso camera sees it), else a glow card at the same point
        bNext[i] = bT[i] + GLOW_EVERY;
        if (spawn(fx, 'dome', x, y - BALLOON_H * 0.4, z, 0, BALLOON_R, GLOW_EVERY * 2.2, PINK, bSrc[i], 0, 0, 0, BALLOON_H, BALLOON_R) < 0) spawn(fx, 'glow', x, y, z, 0, 0.7, GLOW_EVERY * 2.5, HEART, bSrc[i]);
      }
      if (bT[i] >= bShadow[i] && s < 1) {
        // its shadow slides along the ground with the same s, shrinking as the balloon rises
        bShadow[i] = bT[i] + GLOW_EVERY;
        const h = Math.max(0, Math.min(1, y / (LOB_APEX + HAND_Y)));
        spawn(fx, 'glow', x, 0.06, z, 0, SHADOW_R * (1 - 0.55 * h), GLOW_EVERY * 2.2, BLUSH, bSrc[i]);
      }
      if (s >= 1) popQ(i, fx);
    }
    // passive heart streaks: an arc from the victim to her
    for (let i = 0; i < NH; i++) {
      if (hOn[i] === 0) continue;
      hT[i] += dt;
      const s = Math.min(1, hT[i] / H_FLY);
      if (!fx.heroPos(hSrc[i], _a)) {
        if (hRib[i] >= 0) fx.ribbons.end(hRib[i]);
        hOn[i] = 0;
        continue;
      }
      const x = hX0[i] + (_a.x - hX0[i]) * s;
      const z = hZ0[i] + (_a.z - hZ0[i]) * s;
      const y = 1.2 + 1.3 * s + 1.6 * s * (1 - s);
      if (hRib[i] >= 0) fx.ribbons.feed(hRib[i], x, y, z);
      else if (hT[i] >= hNext[i]) {
        // Low has no ribbons: a few glow cards carry the heart instead
        hNext[i] = hT[i] + GLOW_EVERY * 2;
        spawn(fx, 'glow', x, y, z, 0, 0.4, GLOW_EVERY * 3, HEART, hSrc[i]);
      }
      if (s >= 1) {
        spawn(fx, 'glow', _a.x, 2.4, _a.z, 0, 0.75, 0.3, HEART, hSrc[i]);
        spawn(fx, 'ring', _a.x, 0.07, _a.z, 0, 0.9, 0.3, BLUSH, hSrc[i], 0, 0.5);
        if (hRib[i] >= 0) fx.ribbons.end(hRib[i]);
        hRib[i] = -1;
        hOn[i] = 0;
      }
    }
    // W swirls: fly, close the cocoon, orbit for the shield
    for (let i = 0; i < NW; i++) {
      if (wOn[i] === 0) continue;
      wT[i] += dt;
      const t = wT[i];
      // the shield broke early: the swirl ends with it (after the arrival, so the snapshot has caught up)
      const broken = t > SWIRL_S + 0.1 && fx.status !== undefined && fx.status(wDst[i], _st) && ((_st.buffs & BuffFlag.Shielded) === 0 || _st.shield <= 0);
      if (!fx.heroPos(wDst[i], _c) || t >= wDur[i] || broken) {
        if (wRib[i] >= 0) fx.ribbons.end(wRib[i]);
        wRib[i] = -1;
        wOn[i] = 0;
        continue;
      }
      let x: number;
      let y: number;
      let z: number;
      if (t < SWIRL_S) {
        const s = t / SWIRL_S;
        x = wX0[i] + (_c.x - wX0[i]) * s;
        z = wZ0[i] + (_c.z - wZ0[i]) * s;
        y = 1.2 + 0.8 * s * (1 - s);
      } else {
        if (wArrived[i] === 0) {
          wArrived[i] = 1;
          arriveW(i, fx);
        }
        const k = t - SWIRL_S;
        if (t < wHaste[i] && t >= wNext[i]) {
          // haste lines: quick wind rings at the wrapped hero's feet for the haste's length
          wNext[i] = t + HASTE_EVERY;
          spawn(fx, 'ring', _c.x, 0.07, _c.z, 0, 1.0, Math.min(0.3, wHaste[i] - t), WIND, wSrc[i], 0, 0.55);
        }
        if (t >= wGlow[i]) {
          // the feather shield: a soft blush glow re-dropped on the wrapped hero (it follows them while the shield holds)
          const life = Math.min(SHIELD_LIFE, wDur[i] - t);
          if (spawn(fx, 'glow', _c.x, 0.9, _c.z, 0, 1.15, life, BLUSH, wSrc[i]) >= 0) wGlow[i] = t + SHIELD_EVERY;
        }
        const ang = k * 2.1 * TAU;
        // tightens on arrival, holds, and widens as the shield ends
        const rr = ORBIT_R * (1 + 0.35 * Math.max(0, 1 - k / 0.25));
        x = _c.x + Math.cos(ang) * rr;
        z = _c.z + Math.sin(ang) * rr;
        y = 1.05 + 0.4 * Math.sin(k * 5.5);
        if (wRib[i] < 0 && t >= wOrb[i]) {
          // no ribbon (Low): two small feather glows orbit instead
          wOrb[i] = t + SHIELD_EVERY;
          const life = Math.min(SHIELD_EVERY * 2, wDur[i] - t);
          spawn(fx, 'glow', x, y, z, 0, 0.32, life, FEATHER, wSrc[i]);
          spawn(fx, 'glow', 2 * _c.x - x, y, 2 * _c.z - z, 0, 0.32, life, FEATHER, wSrc[i]);
        }
      }
      if (wRib[i] >= 0) fx.ribbons.feed(wRib[i], x, y, z);
    }
    // E wind bands: fed from her interpolated position along the real path; gust swirls on touched allies
    for (let i = 0; i < NE; i++) {
      if (eOn[i] === 0) continue;
      eT[i] += dt;
      const src = eSrc[i];
      if (!fx.heroPos(src, _a) || eT[i] >= eDur[i]) {
        if (eRib[i] >= 0) fx.ribbons.end(eRib[i]);
        if (eRibHi[i] >= 0) fx.ribbons.end(eRibHi[i]);
        eRib[i] = eRibHi[i] = -1;
        eOn[i] = 0;
        continue;
      }
      if (eRib[i] >= 0) fx.ribbons.feed(eRib[i], _a.x, 0.09, _a.z);
      if (eCard[i] === 1 && !(Math.hypot(_a.x - eLX[i], _a.z - eLZ[i]) < E_CARD_EVERY)) {
        // the touch zone as cards along the path (a full pool retries next frame)
        if (eZone(fx, i, _a.x, _a.z)) {
          eLX[i] = _a.x;
          eLZ[i] = _a.z;
        }
      }
      if (eRibHi[i] >= 0) fx.ribbons.feed(eRibHi[i], _a.x, 1.3, _a.z);
      for (let h = 0; h < HEROES; h++) {
        if (h === src || (eMask[i] & (1 << h)) !== 0 || !sameTeam(fx, h, src) || !fx.heroPos(h, _c)) continue;
        if (Math.hypot(_c.x - _a.x, _c.z - _a.z) > eTouch[i]) continue;
        eMask[i] |= 1 << h;
        spawn(fx, 'twister', _c.x, 0, _c.z, 0, 0.55, 0.45, WIND, src, 0, 0, 0, 1.5);
        spawn(fx, 'ring', _c.x, 0.07, _c.z, 0, 1.0, 0.35, WIND, src, 0, 0.3);
      }
    }
    // R leashes: a pink beam from each charmed enemy to her and a heart over its head, refreshed while the charm lasts
    for (let i = 0; i < NL; i++) {
      if (lOn[i] === 0) continue;
      lT[i] += dt;
      if (lT[i] >= lDur[i] || !fx.heroPos(lSrc[i], _a) || !fx.heroPos(lDst[i], _c)) {
        lOn[i] = 0;
        continue;
      }
      // the render guessed the cone: keep only charms the snapshot confirms (the Feared bit the sim's charm sets)
      if (lOk[i] === 0 && fx.status && fx.status(lDst[i], _st)) {
        if ((_st.buffs & BuffFlag.Feared) !== 0) lOk[i] = 1;
        else if (lT[i] >= CHARM_CONFIRM_S) {
          lOn[i] = 0;
          continue;
        }
      }
      if (lT[i] >= lHead[i]) {
        lHead[i] = lT[i] + HEAD_EVERY;
        headHeart(fx, i);
      }
      if (lT[i] < lNext[i]) continue;
      const dx = _a.x - _c.x;
      const dz = _a.z - _c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) continue;
      const life = Math.min(LEASH_LIFE, lDur[i] - lT[i]);
      // one beam per leash; a full beam pool retries next frame instead of leaving a gap
      if (spawn(fx, 'beam', _c.x, 1.25, _c.z, Math.atan2(-dz, dx), d, life, HEART, lSrc[i], 0, 0, 0, 1, 0.32) >= 0) lNext[i] = lT[i] + LEASH_EVERY;
    }
    // basic heart bolts: along her facing at the bolt speed (holding at her reach) until the hit bends them onto the target
    for (let i = 0; i < NK; i++) {
      if (kOn[i] === 0) continue;
      kT[i] += dt;
      if (kDX[i] === 0 && kDZ[i] === 0) {
        // facing unknown: only the launch glow (onProjectile) shows; the hit still pops on the target
        if (kT[i] >= BOLT_MAX_S) {
          if (kRib[i] >= 0) fx.ribbons.end(kRib[i]);
          kRib[i] = -1;
          kOn[i] = 0;
        }
        continue;
      }
      const step = Math.min(BOLT_SPEED * dt, Math.max(0, BOLT_REACH - kDist[i]));
      kDist[i] += step;
      kX[i] += kDX[i] * step;
      kZ[i] += kDZ[i] * step;
      kY[i] += (1.0 - kY[i]) * Math.min(1, dt * 8);
      if (kRib[i] >= 0) fx.ribbons.feed(kRib[i], kX[i], kY[i], kZ[i]);
      if (kT[i] >= kNext[i]) {
        // the dart's head: a small vertical heart-pink stub (Med / High), a glow card on Low
        kNext[i] = kT[i] + GLOW_EVERY;
        const col = kVar[i] === 1 ? WIND : HEART;
        const big = kVar[i] === 2;
        if (fx.tier === 'low' || spawn(fx, 'pillar', kX[i], kY[i] - BOLT_HEAD_H * 0.5, kZ[i], 0, big ? BOLT_HEAD_R * 1.3 : BOLT_HEAD_R, GLOW_EVERY * 2, col, kSrc[i], 0, 0, 0, BOLT_HEAD_H) < 0)
          spawn(fx, 'glow', kX[i], kY[i], kZ[i], 0, big ? 0.55 : 0.4, GLOW_EVERY * 2, col, kSrc[i]);
      }
      if (kT[i] >= BOLT_MAX_S) {
        // the hit never came (a miss, a lost event): fade out where the head is
        if (kRib[i] >= 0) fx.ribbons.end(kRib[i]);
        kRib[i] = -1;
        kOn[i] = 0;
      }
    }
  },
};

/** Tests: drop every pooled effect (a new match). */
export function resetGabeFx(): void {
  bOn.fill(0);
  hOn.fill(0);
  wOn.fill(0);
  eOn.fill(0);
  lOn.fill(0);
  kOn.fill(0);
  kRib.fill(-1);
  kCount.fill(0);
  kDist.fill(0);
  bShadow.fill(0);
  bRib.fill(-1);
  bNext.fill(0);
  hNext.fill(0);
  hRib.fill(-1);
  wRib.fill(-1);
  eRib.fill(-1);
  eRibHi.fill(-1);
}

/** Tests: live pooled effects. */
export function gabeFxLive(): number {
  let n = 0;
  for (const on of [bOn, hOn, wOn, eOn, lOn, kOn]) for (let i = 0; i < on.length; i++) n += on[i];
  return n;
}

