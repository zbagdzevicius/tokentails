/**
 * Lambo skill FX (ANIM-SPEC §14 "Lambo", §7, §9): starlight and fairy lights, warm gold / amber / white, never red
 * or blue in the core (red is the enemy rim, blue the enemy team). Every gameplay shape uses the sim numbers from
 * `fx.abil` (talents included): the Belly Flop ring at exactly its radius, the Tangled Lights spiral reaching
 * exactly its radius on the cast tick, the tuna flying at its real speed and range and stopping on its hit.
 *
 * - Q Tuna Toss: a throw crescent, a wet sparkle ribbon chasing the tuna (toasted orange with Extra Crispy), a
 *   splash ring, wet stain and bubbles on the hit;
 * - W Big Hug: a starry heart wave and a star-bubble shell on Lambo and, on the same cast tick (the sim shields both
 *   then), a shell and heart on the hugged ally (the nearest allied hero in the sim's 4 m) with a stellar ribbon
 *   arcing over as decoration; soft shield pulses under each while that hero's shield lasts (≤ 75 t, and they stop
 *   the moment the snapshot's shield hits 0: a broken shield never reads as up);
 * - E Belly Flop: a meteor ribbon from his chest through the hop; on the sim's landing (its ring tick, travelEnd + 1 t)
 *   a star shockwave ring and a crisp edge at exactly 2.2 m, star spikes round the edge, a crater and crack glyph,
 *   debris, T2 shake. Bound to the sim, never to the clip's time: the first slot-2 hit draws it on its own tick; with
 *   nobody in the ring, the predicted ring tick (cast + hop ticks + 1) plus one tick of grace for the hit draws it,
 *   unless Lambo is disabled then (a hop ended stunned, feared or knocked lands nothing: a belly skid);
 * - R Tangled Lights: over the windup a light twister round him and a spiral ring unwinding to the exact radius;
 *   on the cast a bright edge at the radius; per hero hit a strand of chasing bulbs (lightning in bulb colours)
 *   that follows the victim through the 6 t pull, then a light coil on its legs for the root;
 * - passive Brave With Friends: faint twinkling constellation lines to allied heroes within 4 m (own / ally view
 *   only) and a star ring on Lambo when the first friend comes into range.
 *
 * Reduce motion: no strobing (the pull bolts slow to one steady colour every 0.15 s), no camera shake or punch, half
 * the star spikes. Pooled: per-hero state in typed arrays, scratch vectors reused; nothing allocates per frame.
 */
import * as THREE from 'three';
import { BuffFlag } from '../../sim/api';
import { stubFx } from '../anim/common';
import { DASH_SPEED, FLOP_RING_DELAY, KNOCK_TICKS, TICK_S, abilNumbers, travelTicks } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxSpawn, SkillFxSet, V3Out } from '../anim/types';
import { LAMBO_STATE } from '../moves/lambo';

const STAR = 0xfff1a8;
const AMBER = 0xffb347;
const WHITE = 0xfffaf0;
const CORD = 0xc8f59a;
const WET = 0xd8f6ff;
const STAIN = 0xa8d8e8;
const TOAST = 0xffa65a;
const BULBS: readonly number[] = [STAR, AMBER, CORD, WHITE];

const N = 16;
/** Victims tracked through the Tangled Lights pull at once. */
const PULLS = 10;
const PULL_S = KNOCK_TICKS * TICK_S;
/** Brave With Friends: the ally range (m; no talent changes it). */
const BRAVE_RANGE = (abilNumbers('lambo', 'passive').allyRange ?? 4000) / 1000;

/** CombatVfx methods beyond FxCtx's CombatVfxLike (present on the runtime instance; optional so tests can stub). */
interface VfxExtra {
  trail(pos: THREE.Vector3, color: number, size: number, ember: boolean): void;
  pillar(x: number, z: number, color: number, k?: number): void;
}

const mix = (a: number, b: number, t: number): number => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const hex = new Map<number, string>();
const css = (c: number): string => {
  let s = hex.get(c);
  if (!s) hex.set(c, (s = '#' + c.toString(16).padStart(6, '0')));
  return s;
};

// ------------------------------------------------------------------------------------------------ state

let now = 0;
const lastSlot = new Int8Array(N).fill(-1);
const lastCastAt = new Float64Array(N).fill(-99);
// tuna
const tunaOn = new Uint8Array(N);
const tunaX = new Float64Array(N);
const tunaZ = new Float64Array(N);
const tunaDx = new Float64Array(N);
const tunaDz = new Float64Array(N);
const tunaV = new Float64Array(N);
const tunaRange = new Float64Array(N);
const tunaT = new Float64Array(N);
const tunaRib = new Int16Array(N).fill(-1);
const tunaCol = new Int32Array(N);
const tunaPuff = new Float64Array(N);
const tunaHalfW = new Float64Array(N);
// hug arc + shield pulses
const hugOn = new Uint8Array(N);
const hugAlly = new Int16Array(N).fill(-1);
const hugT = new Float64Array(N);
const hugRib = new Int16Array(N).fill(-1);
const shieldUntil = new Float64Array(N);
const shieldNext = new Float64Array(N);
/** Pulses still drawn under Lambo / the hugged ally (cleared when that hero's snapshot shield reaches 0). */
const selfShieldOn = new Uint8Array(N);
const allyShieldOn = new Uint8Array(N);
/** The shield is still up on `who` (snapshot); true when no status is available (tests, old hosts: time only). */
const shieldUp = (fx: FxCtx, who: number): boolean => !fx.status || !fx.status(who, _st) || _st.shield > 0;
// belly flop meteor
const flopOn = new Uint8Array(N);
const flopRib = new Int16Array(N).fill(-1);
const flopT = new Float64Array(N);
/** A hop waiting for its landing: the ring is still to draw (1) and the render time of its predicted ring tick. */
const flopPending = new Uint8Array(N);
const flopRingAt = new Float64Array(N);
const _st: HeroStatus = { buffs: 0, shield: 0 };
/** Disabled in the sim's sense (stunned, knocked: Stunned; feared): a hop ending so lands nothing. */
const DISABLED = BuffFlag.Stunned | BuffFlag.Feared;
// tangled lights pulls
const pullSrc = new Int16Array(PULLS).fill(-1);
const pullDst = new Int16Array(PULLS).fill(-1);
const pullT = new Float64Array(PULLS);
const pullRoot = new Float64Array(PULLS);
const pullBolt = new Float64Array(PULLS);
const pullBulb = new Uint8Array(PULLS);
// passive
const isLambo = new Uint8Array(N);
const braveOn = new Uint8Array(N);
let scanAt = -1;
let braveAt = 0;

const _a: V3Out = { x: 0, y: 0, z: 0 };
const _b: V3Out = { x: 0, y: 0, z: 0 };
const _c: V3Out = { x: 0, y: 0, z: 0 };
const _v = new THREE.Vector3();
const S: MeshFxSpawn = { x: 0, z: 0, sx: 1, life: 1, color: 0, rim: 0, rel: 'own' };
const shockOpts = { r1: 1, dur: 0.3, color: '#ffffff', height: 0.4 };

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

/** Nearest allied hero of `id` (not itself) within `range` m, or −1 (the sim's nearestAlly, render side). */
function nearestAlly(fx: FxCtx, id: number, range: number): number {
  if (!fx.heroPos(id, _a)) return -1;
  let best = -1;
  let bestD = range * range;
  for (let i = 0; i < N; i++) {
    if (i === id || !fx.heroPos(i, _b) || !isHero(fx, i) || !sameTeam(fx, id, i)) continue;
    const d = (_b.x - _a.x) ** 2 + (_b.z - _a.z) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function shock(fx: FxCtx, x: number, z: number, r: number, color: number, dur: number, height: number): void {
  _v.set(x, 0, z);
  shockOpts.r1 = r;
  shockOpts.dur = dur;
  shockOpts.color = css(color);
  shockOpts.height = height;
  fx.shock.start(_v, shockOpts);
}

/** Star spikes: small light columns round a circle (staggered), the "bouncing stars". */
function spikes(fx: FxCtx, id: number, x: number, z: number, r: number, n: number, color: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const s = spec(fx, id, x + Math.cos(a) * r, z + Math.sin(a) * r, 0.14, 0.32, color);
    s.sy = 0.9 + (i % 3) * 0.35;
    s.delay = (i % 4) * 0.04;
    s.p3 = 0.8;
    fx.mesh.spawn('pillar', s);
  }
}

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'q');
  const tx = e.x / 1000;
  const tz = -e.y / 1000;
  let dx = tx - _a.x;
  let dz = tz - _a.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) return;
  dx /= l;
  dz /= l;
  const yaw = Math.atan2(-dz, dx);
  // the throw: a crescent swept by the arm, a flash at the paw
  const s = spec(fx, id, _a.x, _a.z, 1.5, 0.28, STAR);
  s.yaw = yaw;
  s.p0 = 2.2;
  s.p1 = 0.45;
  s.p2 = -1;
  s.p3 = 0.9;
  fx.mesh.spawn('crescent', s);
  const g = spec(fx, id, _a.x + dx * 0.8, _a.z + dz * 0.8, 0.9, 0.2, WHITE);
  g.y = 0.9;
  fx.mesh.spawn('glow', g);
  // the tuna's flight (the sim skillshot: its speed and range), followed by a wet sparkle ribbon
  if (tunaOn[id] && tunaRib[id] >= 0) fx.ribbons.end(tunaRib[id]);
  tunaOn[id] = 1;
  tunaX[id] = _a.x;
  tunaZ[id] = _a.z;
  tunaDx[id] = dx;
  tunaDz[id] = dz;
  tunaV[id] = (a.speed ?? 16000) / 1000;
  tunaRange[id] = (a.range ?? 6000) / 1000;
  tunaHalfW[id] = (a.width ?? 900) / 2000;
  tunaT[id] = 0;
  tunaPuff[id] = 0;
  const crispy = (a.slowBp ?? 0) > 2500;
  tunaCol[id] = ribbonColor(fx, id, crispy ? TOAST : WET);
  _c.x = _a.x;
  _c.y = 1.0;
  _c.z = _a.z;
  tunaRib[id] = fx.ribbons.point(_c, tunaCol[id], 0.42, 0.22);
  fx.sfx.cue('whooshM', _a);
}

function castW(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const a = fx.abil(id, 'w');
  const dur = (a.duration ?? 75) * TICK_S;
  // starry heart pulse and a star-bubble shell popping up on Lambo
  const h = spec(fx, id, _a.x, _a.z, 2.4, 0.6, STAR);
  h.p3 = 1;
  fx.mesh.spawn('heart', h);
  const d = spec(fx, id, _a.x, _a.z, 1.25, 0.7, WHITE);
  d.sy = 2.3;
  d.p3 = 0.6;
  fx.mesh.spawn('dome', d);
  shieldUntil[id] = now + dur;
  shieldNext[id] = now + 0.3;
  // the hug's ribbon arcs to the nearest ally in range (the sim's pick)
  const ally = nearestAlly(fx, id, (a.range ?? 4000) / 1000);
  hugAlly[id] = ally;
  if (hugOn[id] && hugRib[id] >= 0) fx.ribbons.end(hugRib[id]);
  hugOn[id] = ally >= 0 ? 1 : 0;
  hugT[id] = 0;
  hugRib[id] = -1;
  if (ally >= 0) {
    _c.x = _a.x;
    _c.y = 1.4;
    _c.z = _a.z;
    hugRib[id] = fx.ribbons.point(_c, ribbonColor(fx, id, STAR), 0.3, 0.35);
    // the ally's shield exists from this tick (sim): its shell and heart now, the ribbon is only the flourish
    if (fx.heroPos(ally, _b)) {
      const sh = spec(fx, id, _b.x, _b.z, 1.0, 0.6, WHITE);
      sh.sy = 2.0;
      sh.p3 = 0.55;
      fx.mesh.spawn('dome', sh);
      fx.mesh.spawn('heart', spec(fx, id, _b.x, _b.z, 1.6, 0.45, STAR));
      fx.sfx.cue('kiss', _b, 0.6);
    }
  }
  allyShieldOn[id] = ally >= 0 ? 1 : 0;
  selfShieldOn[id] = 1;
}

function castE(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const g = spec(fx, id, _a.x, _a.z, 1.4, 0.25, STAR);
  fx.mesh.spawn('glow', g);
  fx.particles.debris(_a.x, _a.z, 0.6);
  if (flopOn[id] && flopRib[id] >= 0) fx.ribbons.end(flopRib[id]);
  flopOn[id] = 1;
  flopT[id] = 0;
  // the sim hop: min(aim, dash), the whole dash when aimed at his own spot; the ring resolves the tick after it ends
  const a = fx.abil(id, 'e');
  const dashMm = a.dash ?? 5000;
  const aim = Math.hypot(e.x / 1000 - _a.x, -e.y / 1000 - _a.z) * 1000;
  const hop = aim < 1 ? dashMm : Math.min(dashMm, aim);
  flopPending[id] = 1;
  flopRingAt[id] = now + (travelTicks(Math.max(1, hop), DASH_SPEED) + FLOP_RING_DELAY) * TICK_S;
  flopRib[id] = fx.bonePos(id, 'chest', _c) ? fx.ribbons.point(_c, ribbonColor(fx, id, STAR), 0.75, 0.3) : -1;
}

function castR(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _a)) return;
  const r = (fx.abil(id, 'r').radius ?? 4500) / 1000;
  // the lights snap out to the exact radius on the cast tick
  const edge = spec(fx, id, _a.x, _a.z, r, 0.45, STAR);
  edge.p0 = Math.PI * 2;
  edge.p1 = 0.95;
  edge.p3 = 1;
  fx.mesh.spawn('arc', edge);
  const w = spec(fx, id, _a.x, _a.z, r, 0.35, AMBER);
  w.p1 = 0.2;
  fx.mesh.spawn('ring', w);
  const g = spec(fx, id, _a.x, _a.z, 2.2, 0.35, WHITE);
  fx.mesh.spawn('glow', g);
  spikes(fx, id, _a.x, _a.z, r, (fx.tier === 'low' ? 6 : 12) >> (fx.reduced ? 1 : 0), STAR);
  fx.sfx.cue('chain', _a);
  fx.sfx.cue('lightsJingle', _a);
}

// ------------------------------------------------------------------------------------------------ hits

/** Is victim `dst` within the tuna's reach of its current render position (0.6 m slack + its half width)? */
function tunaNear(id: number, dst: number, fx: FxCtx): boolean {
  if (!fx.heroPos(dst, _b)) return false;
  const d = Math.min(tunaRange[id], tunaV[id] * tunaT[id]);
  const x = tunaX[id] + tunaDx[id] * d;
  const z = tunaZ[id] + tunaDz[id] * d;
  const slack = 0.6 + tunaHalfW[id];
  return (_b.x - x) ** 2 + (_b.z - z) ** 2 <= slack * slack;
}

function hitQ(dst: number, id: number, fx: FxCtx): void {
  if (tunaOn[id]) {
    tunaOn[id] = 0;
    if (tunaRib[id] >= 0) fx.ribbons.end(tunaRib[id]);
    tunaRib[id] = -1;
  }
  if (!fx.heroPos(dst, _b)) return;
  const s = spec(fx, id, _b.x, _b.z, 1.3, 0.35, WET);
  s.p1 = 0.15;
  fx.mesh.spawn('ring', s);
  const g = spec(fx, id, _b.x, _b.z, 1.0, 0.22, WHITE);
  g.y = 0.8;
  fx.mesh.spawn('glow', g);
  fx.linger.add('scorch', _b.x, _b.z, 0.75, now * 3, STAIN);
  // slow bubbles: small rings rising off the victim over the slow
  for (let i = 0; i < 3; i++) {
    const bsp = spec(fx, id, _b.x + (i - 1) * 0.3, _b.z + ((i * 7) % 3) * 0.12 - 0.12, 0.35, 0.4, WET);
    bsp.y = 0.4 + i * 0.45;
    bsp.p1 = 0.6;
    bsp.delay = 0.08 + i * 0.12;
    fx.mesh.spawn('ring', bsp);
  }
  fx.particles.debris(_b.x, _b.z, 0.4);
  fx.sfx.cue('pop', _b);
}

function hitR(dst: number, id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, _a) || !fx.heroPos(dst, _b)) return;
  let k = -1;
  for (let i = 0; i < PULLS; i++)
    if (pullSrc[i] < 0) {
      k = i;
      break;
    }
  if (k < 0) k = 0;
  pullSrc[k] = id;
  pullDst[k] = dst;
  pullT[k] = 0;
  pullBolt[k] = 0;
  pullBulb[k] = k % BULBS.length;
  pullRoot[k] = (fx.abil(id, 'r').root ?? 30) * TICK_S;
  // the strand snaps taut: a chain from Lambo to the victim and a first bolt of bulbs
  const dx = _b.x - _a.x;
  const dz = _b.z - _a.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.2) {
    const c = spec(fx, id, _a.x, _a.z, len, 0.22, AMBER);
    c.yaw = Math.atan2(-dz, dx);
    c.sz = 0.35;
    c.y = 0.7;
    c.p0 = Math.max(3, len * 2.5);
    fx.mesh.spawn('chain', c);
  }
  fx.particles.lightning(_a.x, 1.2, _a.z, _b.x, 1.0, _b.z, STAR);
  const g = spec(fx, id, _b.x, _b.z, 1.1, 0.2, STAR);
  g.y = 0.9;
  fx.mesh.spawn('glow', g);
}

// ------------------------------------------------------------------------------------------------ markers

/** The sim landed the flop (its slot-2 hit, or the ring tick with nobody in the ring): the ring at exactly its radius. */
function landRing(id: number, fx: FxCtx): void {
  flopPending[id] = 0;
  endFlopRibbon(id, fx);
  if (!fx.heroPos(id, _a)) return;
  const r = (fx.abil(id, 'e').radius ?? 2200) / 1000;
  // star shockwave to the exact ring radius, a second crisper wave, the edge held for a beat
  const w = spec(fx, id, _a.x, _a.z, r, 0.42, STAR);
  w.p1 = 0.12;
  w.p3 = 1;
  fx.mesh.spawn('ring', w);
  const w2 = spec(fx, id, _a.x, _a.z, r, 0.32, WHITE);
  w2.p1 = 0.55;
  w2.delay = 0.05;
  fx.mesh.spawn('ring', w2);
  const edge = spec(fx, id, _a.x, _a.z, r, 0.5, AMBER);
  edge.p0 = Math.PI * 2;
  edge.p1 = 0.93;
  fx.mesh.spawn('arc', edge);
  const g = spec(fx, id, _a.x, _a.z, 2.0, 0.3, WHITE);
  fx.mesh.spawn('glow', g);
  spikes(fx, id, _a.x, _a.z, r * 0.92, fx.reduced ? (fx.tier === 'low' ? 3 : 5) : fx.tier === 'low' ? 5 : 9, STAR);
  fx.linger.add('crater', _a.x, _a.z, 1.15, now * 2, 0xe8dcc0);
  fx.linger.add('crackStar', _a.x, _a.z, r * 0.8, now * 5, 0xfff4d0);
  shock(fx, _a.x, _a.z, r, fx.relation(id) === 'enemy' ? fx.rim(id) : STAR, 0.32, 0.55);
  fx.particles.debris(_a.x, _a.z, 1.3);
  if (own(fx, id) && !fx.reduced) {
    fx.cam.tier(2);
    fx.cam.punch(0.04);
  }
}

function endFlopRibbon(id: number, fx: FxCtx): void {
  if (flopOn[id]) {
    flopOn[id] = 0;
    if (flopRib[id] >= 0) fx.ribbons.end(flopRib[id]);
    flopRib[id] = -1;
  }
}

/** A flop that landed nothing: a dust skid and a scuff, no ring, no shake. */
function skid(id: number, fx: FxCtx): void {
  flopPending[id] = 0;
  endFlopRibbon(id, fx);
  if (!fx.heroPos(id, _a)) return;
  fx.particles.debris(_a.x, _a.z, 0.5);
  fx.linger.add('scratches', _a.x, _a.z, 0.7, now * 3, 0xe8dcc0);
}

function slamC(id: number, fx: FxCtx): void {
  if (!fx.bonePos(id, 'pawR', _a) || !fx.bonePos(id, 'pawL', _b)) return;
  const x = (_a.x + _b.x) / 2;
  const z = (_a.z + _b.z) / 2;
  const g = spec(fx, id, x, z, 1.0, 0.2, STAR);
  fx.mesh.spawn('glow', g);
  const s = spec(fx, id, x, z, 1.2, 0.28, STAR);
  s.p1 = 0.3;
  fx.mesh.spawn('ring', s);
  fx.linger.add('crackStar', x, z, 0.7, now * 7, 0xfff4d0);
}

function starBurst(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, _a)) return;
  const s = spec(fx, id, _a.x, _a.z, 2.2, 0.5, STAR);
  s.p1 = 0.2;
  fx.mesh.spawn('ring', s);
  fx.mesh.spawn('glow', spec(fx, id, _a.x, _a.z, 1.8, 0.35, WHITE));
  spikes(fx, id, _a.x, _a.z, 1.5, 7, STAR);
}

function deathStars(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, _a)) return;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const g = spec(fx, id, _a.x - 0.6 + Math.cos(a) * 0.45, _a.z + Math.sin(a) * 0.45, 0.32, 1.2, STAR);
    g.y = 0.9;
    g.delay = i * 0.15;
    fx.mesh.spawn('glow', g);
  }
}

// ------------------------------------------------------------------------------------------------ per frame

function updateTuna(fx: FxCtx, dt: number): void {
  for (let id = 0; id < N; id++) {
    if (!tunaOn[id]) continue;
    tunaT[id] += dt;
    const d = Math.min(tunaRange[id], tunaV[id] * tunaT[id]);
    const x = tunaX[id] + tunaDx[id] * d;
    const z = tunaZ[id] + tunaDz[id] * d;
    if (tunaRib[id] >= 0) fx.ribbons.feed(tunaRib[id], x, 1.0, z);
    // Low has no ribbons: wet puffs behind the tuna instead (paced, ≈ 30 Hz)
    tunaPuff[id] -= dt;
    if (tunaRib[id] < 0 && tunaPuff[id] <= 0) {
      tunaPuff[id] = 1 / 30;
      const v = fx.particles as Partial<VfxExtra>;
      _v.set(x, 1.0, z);
      v.trail?.(_v, tunaCol[id], 0.32, true);
    }
    if (d >= tunaRange[id]) {
      tunaOn[id] = 0;
      if (tunaRib[id] >= 0) fx.ribbons.end(tunaRib[id]);
      tunaRib[id] = -1;
    }
  }
}

function updateHug(fx: FxCtx, dt: number): void {
  for (let id = 0; id < N; id++) {
    if (hugOn[id]) {
      hugT[id] += dt;
      const ally = hugAlly[id];
      const u = Math.min(1, hugT[id] / 0.4);
      if (fx.heroPos(id, _a) && fx.heroPos(ally, _b)) {
        if (hugRib[id] >= 0) {
          const e = 1 - (1 - u) * (1 - u);
          fx.ribbons.feed(hugRib[id], _a.x + (_b.x - _a.x) * e, 1.4 + Math.sin(e * Math.PI) * 1.6, _a.z + (_b.z - _a.z) * e);
        }
        // the ribbon lands in a small sparkle (the shell itself appeared on the cast tick)
        if (u >= 1) {
          const g = spec(fx, id, _b.x, _b.z, 0.7, 0.25, STAR);
          g.y = 1.2;
          fx.mesh.spawn('glow', g);
        }
      }
      if (u >= 1) {
        hugOn[id] = 0;
        if (hugRib[id] >= 0) fx.ribbons.end(hugRib[id]);
        hugRib[id] = -1;
      }
    }
    // shield pulses under Lambo and the hugged ally while each shield lasts (≤ its duration; a broken one stops)
    if (shieldUntil[id] > now && now >= shieldNext[id]) {
      shieldNext[id] = now + 0.45;
      if (selfShieldOn[id] && !shieldUp(fx, id)) selfShieldOn[id] = 0;
      const ally = hugAlly[id];
      if (allyShieldOn[id] && (ally < 0 || !shieldUp(fx, ally))) allyShieldOn[id] = 0;
      if (!selfShieldOn[id] && !allyShieldOn[id]) shieldUntil[id] = 0;
      if (selfShieldOn[id] && fx.heroPos(id, _a)) {
        const s = spec(fx, id, _a.x, _a.z, 1.1, 0.42, STAR);
        s.p1 = 0.7;
        s.p3 = 0.45;
        fx.mesh.spawn('ring', s);
      }
      if (allyShieldOn[id] && fx.heroPos(ally, _b)) {
        const s = spec(fx, id, _b.x, _b.z, 0.95, 0.42, STAR);
        s.p1 = 0.7;
        s.p3 = 0.45;
        fx.mesh.spawn('ring', s);
      }
    }
  }
}

function updateFlop(fx: FxCtx, dt: number): void {
  for (let id = 0; id < N; id++) {
    // no slot-2 hit by the ring tick + 1 t: nobody was in the ring (the ring still lands) or the hop landed nothing
    if (flopPending[id] && now >= flopRingAt[id] + TICK_S) {
      if (fx.status && fx.status(id, _st) && (_st.buffs & DISABLED) !== 0) skid(id, fx);
      else landRing(id, fx);
    }
    if (!flopOn[id]) continue;
    flopT[id] += dt;
    if (flopRib[id] >= 0 && fx.bonePos(id, 'chest', _c)) fx.ribbons.feed(flopRib[id], _c.x, _c.y, _c.z);
    // a hop is never longer than its 10 t talent maximum plus the ring tick: a lost splat (stunned) ends here
    if (flopT[id] > 0.6) {
      flopOn[id] = 0;
      if (flopRib[id] >= 0) fx.ribbons.end(flopRib[id]);
      flopRib[id] = -1;
    }
  }
}

function updatePulls(fx: FxCtx, dt: number): void {
  for (let k = 0; k < PULLS; k++) {
    const id = pullSrc[k];
    if (id < 0) continue;
    const t0 = pullT[k];
    pullT[k] += dt;
    const dst = pullDst[k];
    if (!fx.heroPos(dst, _b)) {
      pullSrc[k] = -1;
      continue;
    }
    if (pullT[k] <= PULL_S + 0.05) {
      // chasing bulbs: a bolt in the next bulb colour every ≈ 50 ms while the victim slides in
      pullBolt[k] -= dt;
      if (pullBolt[k] <= 0 && fx.heroPos(id, _a)) {
        // reduce motion: no colour strobe, one steady bolt every 0.15 s
        pullBolt[k] = fx.reduced ? 0.15 : fx.tier === 'low' ? 0.1 : 0.05;
        if (!fx.reduced) pullBulb[k] = (pullBulb[k] + 1) % BULBS.length;
        const bulb = fx.reduced ? STAR : BULBS[pullBulb[k]];
        const c = fx.relation(id) === 'enemy' ? mix(bulb, fx.rim(id), 0.35) : bulb;
        fx.particles.lightning(_a.x, 1.2, _a.z, _b.x, 0.9, _b.z, c);
      }
    } else if (t0 <= PULL_S + 0.05) {
      // the light coil on the legs for the rest of the root (rooted: it stays where the victim stands)
      const rest = Math.max(0.2, pullRoot[k] - PULL_S);
      const s = spec(fx, id, _b.x, _b.z, 0.55, rest, STAR);
      s.sy = 0.7;
      s.p3 = 0.7;
      if (fx.mesh.spawn('twister', s) < 0) {
        const r = spec(fx, id, _b.x, _b.z, 0.7, Math.min(rest, 0.6), STAR);
        r.p1 = 0.6;
        fx.mesh.spawn('ring', r);
      }
      const g = spec(fx, id, _b.x, _b.z, 0.8, Math.min(rest, 0.5), AMBER);
      g.y = 0.3;
      fx.mesh.spawn('glow', g);
    }
    if (pullT[k] > PULL_S + 0.1) pullSrc[k] = -1;
  }
}

/** Brave With Friends: find the Lambos (once a second), twinkle lines to allies within 4 m for own / ally viewers. */
function updatePassive(fx: FxCtx): void {
  if (now >= scanAt) {
    scanAt = now + 1;
    // Lambo is the one hero whose W has both a self and an ally shield share
    for (let i = 0; i < N; i++) {
      const w = fx.abil(i, 'w');
      isLambo[i] = w.selfBp !== undefined && w.allyBp !== undefined ? 1 : 0;
    }
  }
  if (now < braveAt) return;
  braveAt = now + 0.5;
  for (let id = 0; id < N; id++) {
    if (!isLambo[id] || !fx.heroPos(id, _a)) continue;
    const range = BRAVE_RANGE;
    const friendly = fx.relation(id) !== 'enemy';
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (i === id || !fx.heroPos(i, _b) || !isHero(fx, i) || !sameTeam(fx, id, i)) continue;
      const dx = _b.x - _a.x;
      const dz = _b.z - _a.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      any = 1;
      if (!friendly || d < 0.4) continue;
      const s = spec(fx, id, _a.x, _a.z, d, 0.6, STAR);
      s.yaw = Math.atan2(-dz, dx);
      s.sz = 0.12;
      s.y = 0.12;
      s.p3 = 0.15;
      fx.mesh.spawn('beam', s);
      const g = spec(fx, id, _b.x, _b.z, 0.3, 0.6, STAR);
      g.y = 0.15;
      g.p3 = 0.4;
      fx.mesh.spawn('glow', g);
    }
    // the first friend in range: a star ring on Lambo (both teams: it changes how hard he is to kill)
    if (any && !braveOn[id]) {
      const s = spec(fx, id, _a.x, _a.z, 1.3, 0.45, STAR);
      s.p1 = 0.5;
      s.p3 = 0.7;
      fx.mesh.spawn('ring', s);
    }
    braveOn[id] = any;
  }
}

// ------------------------------------------------------------------------------------------------ the set

/** Clears the per-hero state (tests; a new match never needs it: every entry times out on its own). */
export function resetLamboFx(): void {
  now = 0;
  lastSlot.fill(-1);
  lastCastAt.fill(-99);
  tunaOn.fill(0);
  tunaRib.fill(-1);
  hugOn.fill(0);
  hugAlly.fill(-1);
  hugRib.fill(-1);
  shieldUntil.fill(0);
  shieldNext.fill(0);
  flopOn.fill(0);
  flopRib.fill(-1);
  flopPending.fill(0);
  selfShieldOn.fill(0);
  allyShieldOn.fill(0);
  pullSrc.fill(-1);
  pullDst.fill(-1);
  isLambo.fill(0);
  braveOn.fill(0);
  scanAt = -1;
  braveAt = 0;
}


export const SKILL_FX: SkillFxSet = {
  ...stubFx('lambo'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, _a)) return;
    const life = e.ticks * TICK_S;
    const r = (fx.abil(e.src, 'r').radius ?? 4500) / 1000;
    // the light spiral unwinds and reaches the exact radius on the cast tick (under the telegraph)
    const s = spec(fx, e.src, _a.x, _a.z, r, life, STAR);
    s.p1 = 0.06;
    s.p3 = 0.55;
    fx.mesh.spawn('ring', s);
    const s2 = spec(fx, e.src, _a.x, _a.z, r, life, AMBER);
    s2.p1 = 0.02;
    s2.p3 = 0.35;
    s2.delay = life * 0.25;
    s2.life = life * 0.75;
    fx.mesh.spawn('ring', s2);
    // the whirling light string round him
    const t = spec(fx, e.src, _a.x, _a.z, 1.35, life + 0.1, STAR);
    t.sy = 2.6;
    t.p3 = 0.75;
    fx.mesh.spawn('twister', t);
    const g = spec(fx, e.src, _a.x, _a.z, 1.6, life, AMBER);
    g.p3 = 0.5;
    fx.mesh.spawn('glow', g);
  },

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
    // a tuna still in flight owns a hit near it, whatever Lambo cast since (W / E / R during the 0.4 s flight)
    if (tunaOn[id] && tunaNear(id, e.dst, fx)) {
      hitQ(e.dst, id, fx);
      return;
    }
    const slot = lastSlot[id];
    // the first Belly Flop hit is the sim's landing tick: the ring draws now, at his landing spot
    if (slot === 2 && flopPending[id]) landRing(id, fx);
    if (slot === 0) hitQ(e.dst, id, fx);
    else if (slot === 3 && now - lastCastAt[id] < 0.4) hitR(e.dst, id, fx);
    else if (slot === 2 && fx.heroPos(e.dst, _b)) fx.linger.add('crackLine', _b.x, _b.z, 0.6, now * 11, 0xfff4d0);
  },

  onMarker(id, _clip, marker, fx) {
    if (!ok(id)) return;
    if (marker === 'slamC') slamC(id, fx);
    else if (marker === 'starBurst') starBurst(id, fx);
    else if (marker === 'deathStars') deathStars(id, fx);
  },

  update(dt, fx) {
    now += dt;
    LAMBO_STATE.clock += dt;
    updateTuna(fx, dt);
    updateHug(fx, dt);
    updateFlop(fx, dt);
    updatePulls(fx, dt);
    updatePassive(fx);
  },
};
