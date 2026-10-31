/**
 * Meatball skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.1 "Moves and VFX"): every gameplay shape at the
 * sim's own numbers (FxCtx.abil). Grass, leaf and sleepy-cream colours (his GRASS element), never gold: red is the
 * enemy rim, blue the enemy team.
 *
 * - Q Bowling Roll: a green grass skid ribbon along the path for the 9 t roll (exactly the roll's touch zone wide),
 *   skid scratches left on the ground, a leafy puff on each unit knocked aside;
 * - W Loaf Mode: a sleepy "Zzz" glow ring at exactly the charm radius on the cast, soft pulses at the same radius and
 *   rising Zzz bubbles over him while the loaf lasts (the sim's 60 t, Long Loaf 75 t);
 * - E Big Brother: on the predicted landing (the dash ticks to the ally the sim picks, render side: the allied hero
 *   nearest the aim within the pick radius and the range) a shield bubble on the friend and a push ring at exactly the
 *   push radius round it; alone, a small bubble on himself; shield pulses while that shield is up;
 * - R Unstoppable Chonk: a green swell burst on the cast, leaf puffs under the ball while it rolls (≤ the state), a
 *   leafy ground wave on each bump (his slot-3 hits);
 * - passive Food Coma: a Zzz bubble over him while the big shield holds (seen render side: his shield jumps by about
 *   the passive's share of his max HP while he is low).
 *
 * Reduce motion: no camera shake or punch, half the leaf puffs. Pooled: per-hero state in typed arrays, scratch
 * vectors reused; nothing allocates per frame.
 */
import { stubFx } from '../anim/common';
import { DASH_SPEED, TICK_S, abilNumbers, travelTicks } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxSpawn, SkillFxSet, V3Out } from '../anim/types';

const GRASS = 0x7ccf5a;
const LEAF = 0xa8e070;
const MOSS = 0x4f9a3a;
const SLEEP = 0xd8ecff;
const CREAM = 0xfff6e0;

const N = 16;
/** Food Coma: the passive's numbers (no talent changes them). */
const COMA = abilNumbers('meatball', 'passive');

const mix = (a: number, b: number, t: number): number => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

// ------------------------------------------------------------------------------------------------ state

let now = 0;
const lastSlot = new Int8Array(N).fill(-1);
const lastCastAt = new Float64Array(N).fill(-99);
// Q roll
const rollOn = new Uint8Array(N);
const rollUntil = new Float64Array(N);
const rollRib = new Int16Array(N).fill(-1);
const rollScuff = new Float64Array(N);
const rollYaw = new Float64Array(N);
// W loaf
const loafUntil = new Float64Array(N);
const loafNext = new Float64Array(N);
const loafR = new Float64Array(N);
// E guard
const guardPending = new Uint8Array(N);
const guardAt = new Float64Array(N);
const guardAlly = new Int16Array(N).fill(-1);
const guardShieldUntil = new Float64Array(N);
const guardNext = new Float64Array(N);
// R chonk
const chonkUntil = new Float64Array(N);
const chonkNext = new Float64Array(N);
// passive
const isMeatball = new Uint8Array(N);
const lastShield = new Float64Array(N);
const comaUntil = new Float64Array(N);
const comaNext = new Float64Array(N);
let scanAt = -1;

const _a: V3Out = { x: 0, y: 0, z: 0 };
const _b: V3Out = { x: 0, y: 0, z: 0 };
const _c: V3Out = { x: 0, y: 0, z: 0 };
const _st: HeroStatus = { buffs: 0, shield: 0, hp: 0, maxHp: 0 };
const S: MeshFxSpawn = { x: 0, z: 0, sx: 1, life: 1, color: 0, rim: 0, rel: 'own' };

const ok = (id: number): boolean => id >= 0 && id < N;

/** Reset the spawn scratch and fill the common fields. */
function spec(fx: FxCtx, id: number, x: number, z: number, sx: number, life: number, color: number): MeshFxSpawn {
  S.x = x;
  S.z = z;
  S.y = undefined;
  S.yaw = 0;
  S.sx = sx;
  S.sy = undefined;
  S.sz = undefined;
  S.life = life;
  S.color = color;
  S.rim = fx.rim(id);
  S.p0 = undefined;
  S.p1 = undefined;
  S.p2 = undefined;
  S.p3 = undefined;
  S.rel = fx.relation(id);
  S.delay = undefined;
  return S;
}

/** Relation-safe ribbon colour: an enemy's trail leans toward its danger rim. */
const ribbonColor = (fx: FxCtx, id: number, c: number): number => (fx.relation(id) === 'enemy' ? mix(c, fx.rim(id), 0.45) : c);
const own = (fx: FxCtx, id: number): boolean => fx.relation(id) === 'own';
const isHero = (fx: FxCtx, id: number): boolean => fx.abil(id, 'q').cooldown !== undefined;
const sameTeam = (fx: FxCtx, a: number, b: number): boolean => (fx.relation(a) === 'enemy') === (fx.relation(b) === 'enemy');

/** Big Brother's ally, render side (the sim's pick): the allied hero (not him) nearest (px, pz) within `pick` of it and `range` of him. */
function guardTarget(fx: FxCtx, id: number, px: number, pz: number, range: number, pick: number): number {
  if (!fx.heroPos(id, _a)) return -1;
  let best = -1;
  let bestD = pick * pick;
  for (let i = 0; i < N; i++) {
    if (i === id || !fx.heroPos(i, _b) || !isHero(fx, i) || !sameTeam(fx, id, i)) continue;
    if ((_b.x - _a.x) ** 2 + (_b.z - _a.z) ** 2 > range * range) continue;
    const d = (_b.x - px) ** 2 + (_b.z - pz) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Rising Zzz: three small sleepy glows stacked above `who` (the second and third a beat later). */
function zzz(fx: FxCtx, id: number, x: number, z: number, life: number): void {
  for (let i = 0; i < 3; i++) {
    const g = spec(fx, id, x + 0.25 + i * 0.18, z - 0.1 * i, 0.22 + i * 0.08, life, SLEEP);
    g.y = 2.7 + i * 0.35;
    g.delay = i * 0.12;
    g.p3 = 0.8;
    fx.mesh.spawn('glow', g);
  }
}

/** Leafy puff: a small green ring and a glow, plus a few debris leaves (half on reduce motion). */
function leafPuff(fx: FxCtx, id: number, x: number, z: number, r: number): void {
  const s = spec(fx, id, x, z, r, 0.32, LEAF);
  s.p1 = 0.35;
  fx.mesh.spawn('ring', s);
  if (fx.tier !== 'low') fx.mesh.spawn('glow', spec(fx, id, x, z, r * 0.8, 0.22, GRASS));
  fx.particles.debris(x, z, fx.reduced ? 0.25 : 0.5);
}

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'q');
  const air = travelTicks(a.dash ?? 6000, DASH_SPEED) * TICK_S;
  if (rollOn[id] && rollRib[id] >= 0) fx.ribbons.end(rollRib[id]);
  rollOn[id] = 1;
  rollUntil[id] = now + air + TICK_S;
  rollScuff[id] = 0;
  rollYaw[id] = Math.atan2(-(-e.y / 1000 - _a.z), e.x / 1000 - _a.x);
  _c.x = _a.x;
  _c.y = 0.06;
  _c.z = _a.z;
  // the grass skid: exactly the roll's touch zone wide (both sides of the path)
  rollRib[id] = fx.ribbons.point(_c, ribbonColor(fx, id, GRASS), (2 * (a.touch ?? 1200)) / 1000, 0.5);
  leafPuff(fx, id, _a.x, _a.z, 0.9);
  fx.sfx.cue('whooshL', _a);
}

function castW(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'w');
  const r = (a.radius ?? 3000) / 1000;
  loafR[id] = r;
  loafUntil[id] = now + (a.duration ?? 60) * TICK_S;
  loafNext[id] = now + 0.5;
  // the charm reach: a sleepy glow ring at exactly the radius, its crisp edge, a soft glow on him
  const s = spec(fx, id, _a.x, _a.z, r, 0.5, SLEEP);
  s.p1 = 0.15;
  s.p3 = 0.9;
  fx.mesh.spawn('ring', s);
  const edge = spec(fx, id, _a.x, _a.z, r, 0.55, GRASS);
  edge.p0 = Math.PI * 2;
  edge.p1 = 0.94;
  fx.mesh.spawn('arc', edge);
  fx.mesh.spawn('glow', spec(fx, id, _a.x, _a.z, 1.4, 0.4, CREAM));
  zzz(fx, id, _a.x, _a.z, 0.7);
  fx.sfx.cue('yawn', _a, 0.7);
}

function castE(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'e');
  const range = (a.range ?? 6000) / 1000;
  // the aim point, clamped to the range (the sim's pick)
  let px = e.x / 1000;
  let pz = -e.y / 1000;
  const dx = px - _a.x;
  const dz = pz - _a.z;
  const l = Math.hypot(dx, dz);
  if (l > range) {
    px = _a.x + (dx * range) / l;
    pz = _a.z + (dz * range) / l;
  }
  const ally = guardTarget(fx, id, px, pz, range, (a.pickRadius ?? 2500) / 1000);
  let hop = (a.soloDash ?? 4000) / 1000;
  if (ally >= 0 && fx.heroPos(ally, _b)) hop = Math.max(0, Math.hypot(_b.x - _a.x, _b.z - _a.z) - 1.0 - (a.gap ?? 300) / 1000);
  guardPending[id] = 1;
  guardAlly[id] = ally;
  // the sim lands on the dash's last tick and shields in the next kit step
  guardAt[id] = now + (hop > 0 ? travelTicks(hop * 1000, DASH_SPEED) + 1 : 1) * TICK_S;
  fx.particles.debris(_a.x, _a.z, 0.5);
}

function castR(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'r');
  chonkUntil[id] = now + (a.duration ?? 120) * TICK_S;
  chonkNext[id] = now + 0.2;
  const reach = (a.touch ?? 1300) / 1000 + 0.5;
  const s = spec(fx, id, _a.x, _a.z, reach * 1.6, 0.45, GRASS);
  s.p1 = 0.2;
  s.p3 = 1;
  fx.mesh.spawn('ring', s);
  const s2 = spec(fx, id, _a.x, _a.z, reach, 0.35, LEAF);
  s2.p1 = 0.55;
  s2.delay = 0.06;
  fx.mesh.spawn('ring', s2);
  fx.mesh.spawn('glow', spec(fx, id, _a.x, _a.z, 2.0, 0.35, LEAF));
  fx.linger.add('petals', _a.x, _a.z, 1.4, now * 3, MOSS);
  fx.sfx.cue('bodyThud', _a);
  if (own(fx, id) && !fx.reduced) {
    fx.cam.tier(2);
    fx.cam.punch(0.04);
  }
}

// ------------------------------------------------------------------------------------------------ hits

function hitQ(dst: number, id: number, fx: FxCtx): void {
  if (!fx.heroPos(dst, _b)) return;
  leafPuff(fx, id, _b.x, _b.z, 0.9);
  fx.linger.add('scratches', _b.x, _b.z, 0.6, now * 7, MOSS);
  fx.sfx.cue('bodyThud', _b, 0.7);
}

/** A Chonk bump: a leafy ground wave rolling out from the victim, debris and a T1 shake for the owner. */
function hitR(dst: number, id: number, fx: FxCtx): void {
  if (!fx.heroPos(dst, _b)) return;
  const w = spec(fx, id, _b.x, _b.z, 1.6, 0.4, GRASS);
  w.p1 = 0.12;
  w.p3 = 1;
  fx.mesh.spawn('ring', w);
  const w2 = spec(fx, id, _b.x, _b.z, 1.1, 0.3, LEAF);
  w2.p1 = 0.5;
  w2.delay = 0.05;
  fx.mesh.spawn('ring', w2);
  fx.linger.add('petals', _b.x, _b.z, 0.9, now * 5, MOSS);
  fx.particles.debris(_b.x, _b.z, fx.reduced ? 0.6 : 1.1);
  fx.sfx.cue('bodyThud', _b);
  if (own(fx, id) && !fx.reduced) fx.cam.tier(1);
}

// ------------------------------------------------------------------------------------------------ markers / per frame

/** Big Brother landed (predicted tick): the shield bubble and push ring on the friend, or a small bubble on himself. */
function guardLand(id: number, fx: FxCtx): void {
  guardPending[id] = 0;
  const a = fx.abil(id, 'e');
  const ally = guardAlly[id];
  const who = ally >= 0 ? ally : id;
  if (!fx.heroPos(who, _b)) return;
  const dome = spec(fx, id, _b.x, _b.z, ally >= 0 ? 1.15 : 0.95, 0.6, CREAM);
  dome.sy = 2.2;
  dome.p3 = 0.55;
  fx.mesh.spawn('dome', dome);
  guardShieldUntil[id] = now + (a.duration ?? 75) * TICK_S;
  guardNext[id] = now + 0.45;
  if (ally < 0) return;
  // the push: exactly the radius round the friend
  const r = (a.radius ?? 2200) / 1000;
  const s = spec(fx, id, _b.x, _b.z, r, 0.4, GRASS);
  s.p1 = 0.15;
  s.p3 = 1;
  fx.mesh.spawn('ring', s);
  const edge = spec(fx, id, _b.x, _b.z, r, 0.45, LEAF);
  edge.p0 = Math.PI * 2;
  edge.p1 = 0.93;
  fx.mesh.spawn('arc', edge);
  fx.particles.debris(_b.x, _b.z, 0.8);
  fx.sfx.cue('bodyThud', _b);
  if (own(fx, id) && !fx.reduced) fx.cam.tier(1);
}

function updateRoll(fx: FxCtx, dt: number): void {
  for (let id = 0; id < N; id++) {
    if (!rollOn[id]) continue;
    if (fx.heroPos(id, _a)) {
      if (rollRib[id] >= 0) fx.ribbons.feed(rollRib[id], _a.x, 0.06, _a.z);
      // skid scratches every ≈ 0.1 s along the path (Low has no ribbon: these carry the trail there)
      rollScuff[id] -= dt;
      if (rollScuff[id] <= 0) {
        rollScuff[id] = 0.1;
        fx.linger.add('scratches', _a.x, _a.z, 0.7, rollYaw[id], MOSS);
      }
    }
    if (now >= rollUntil[id]) {
      rollOn[id] = 0;
      if (rollRib[id] >= 0) fx.ribbons.end(rollRib[id]);
      rollRib[id] = -1;
    }
  }
}

function updateLoaf(fx: FxCtx): void {
  for (let id = 0; id < N; id++) {
    if (loafUntil[id] <= now || now < loafNext[id]) continue;
    loafNext[id] = now + 0.5;
    if (!fx.heroPos(id, _a)) continue;
    const life = Math.min(0.5, loafUntil[id] - now);
    const s = spec(fx, id, _a.x, _a.z, loafR[id], life, SLEEP);
    s.p1 = 0.85;
    s.p3 = 0.4;
    fx.mesh.spawn('ring', s);
    zzz(fx, id, _a.x, _a.z, life);
  }
}

function updateGuard(fx: FxCtx): void {
  for (let id = 0; id < N; id++) {
    if (guardPending[id] && now >= guardAt[id]) guardLand(id, fx);
    if (guardShieldUntil[id] <= now || now < guardNext[id]) continue;
    guardNext[id] = now + 0.45;
    const who = guardAlly[id] >= 0 ? guardAlly[id] : id;
    // a broken shield never reads as up
    if (fx.status && fx.status(who, _st) && _st.shield <= 0) {
      guardShieldUntil[id] = 0;
      continue;
    }
    if (!fx.heroPos(who, _b)) continue;
    const s = spec(fx, id, _b.x, _b.z, 1.0, Math.min(0.42, guardShieldUntil[id] - now), CREAM);
    s.p1 = 0.7;
    s.p3 = 0.45;
    fx.mesh.spawn('ring', s);
  }
}

function updateChonk(fx: FxCtx): void {
  for (let id = 0; id < N; id++) {
    if (chonkUntil[id] <= now || now < chonkNext[id]) continue;
    chonkNext[id] = now + (fx.reduced ? 0.3 : 0.15);
    if (!fx.heroPos(id, _a)) continue;
    const g = spec(fx, id, _a.x, _a.z, 1.2, Math.min(0.3, chonkUntil[id] - now), GRASS);
    g.p3 = 0.5;
    fx.mesh.spawn('glow', g);
    if (fx.tier !== 'low') fx.particles.debris(_a.x, _a.z, 0.25);
  }
}

/** Food Coma: find the Meatballs (once a second); a shield jump of ≈ the passive share while low is the nap. */
function updateComa(fx: FxCtx): void {
  if (now >= scanAt) {
    scanAt = now + 1;
    // Meatball is the one hero whose Chonk has a re-bump window
    for (let i = 0; i < N; i++) isMeatball[i] = fx.abil(i, 'r').rehit !== undefined ? 1 : 0;
  }
  if (!fx.status) return;
  for (let id = 0; id < N; id++) {
    if (!isMeatball[id] || !fx.status(id, _st)) continue;
    const max = _st.maxHp ?? 0;
    const jump = _st.shield - lastShield[id];
    lastShield[id] = _st.shield;
    if (max > 0 && jump >= (max * (COMA.shieldBp ?? 1500)) / 10000 * 0.8 && (_st.hp ?? max) * 10000 < max * ((COMA.thresholdBp ?? 3000) + 1000)) {
      comaUntil[id] = now + (COMA.duration ?? 90) * TICK_S;
      comaNext[id] = now;
    }
    if (comaUntil[id] <= now) continue;
    if (_st.shield <= 0) {
      comaUntil[id] = 0;
      continue;
    }
    if (now < comaNext[id] || !fx.heroPos(id, _a)) continue;
    comaNext[id] = now + 0.6;
    const bubble = spec(fx, id, _a.x + 0.3, _a.z, 0.5, Math.min(0.7, comaUntil[id] - now), SLEEP);
    bubble.y = 2.9;
    bubble.sy = 0.5;
    bubble.p3 = 0.5;
    fx.mesh.spawn('dome', bubble);
    zzz(fx, id, _a.x, _a.z, Math.min(0.7, comaUntil[id] - now));
  }
}

/** Marker beats from the move set. */
function marker(id: number, m: string, fx: FxCtx): void {
  if (!fx.heroPos(id, _a)) return;
  if (m === 'deathZzz') zzz(fx, id, _a.x - 0.4, _a.z, 1.0);
  else if (m === 'chonkSwell') fx.mesh.spawn('glow', spec(fx, id, _a.x, _a.z, 1.6, 0.3, CREAM));
}

// ------------------------------------------------------------------------------------------------ the set

/** Live per-hero FX entries (tests: everything times out). */
export function meatballFxLive(): number {
  let n = 0;
  for (let id = 0; id < N; id++) {
    n += rollOn[id] + guardPending[id];
    if (loafUntil[id] > now) n++;
    if (guardShieldUntil[id] > now) n++;
    if (chonkUntil[id] > now) n++;
    if (comaUntil[id] > now) n++;
  }
  return n;
}

/** Clears the per-hero state (tests; a new match never needs it: every entry times out on its own). */
export function resetMeatballFx(): void {
  now = 0;
  lastSlot.fill(-1);
  lastCastAt.fill(-99);
  rollOn.fill(0);
  rollRib.fill(-1);
  loafUntil.fill(0);
  guardPending.fill(0);
  guardAlly.fill(-1);
  guardShieldUntil.fill(0);
  chonkUntil.fill(0);
  isMeatball.fill(0);
  lastShield.fill(0);
  comaUntil.fill(0);
  scanAt = -1;
}

export const SKILL_FX: SkillFxSet = {
  ...stubFx('meatball'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onCast(e, fx) {
    if (!ok(e.src)) return;
    lastSlot[e.src] = e.slot;
    lastCastAt[e.src] = now;
    switch (e.slot) {
      case 0:
        castQ(e, fx);
        return;
      case 1:
        castW(e, fx);
        return;
      case 2:
        castE(e, fx);
        return;
      case 3:
        castR(e, fx);
        return;
      default:
        return;
    }
  },

  onHit(e, fx) {
    const id = e.src;
    if (!ok(id) || e.kind !== 'ability') return;
    if (rollOn[id]) hitQ(e.dst, id, fx);
    else if (chonkUntil[id] > now) hitR(e.dst, id, fx);
  },

  onMarker(id, _clip, m, fx) {
    if (ok(id)) marker(id, m, fx);
  },

  update(dt, fx) {
    now += dt;
    updateRoll(fx, dt);
    updateLoaf(fx);
    updateGuard(fx);
    updateChonk(fx);
    updateComa(fx);
  },
};
