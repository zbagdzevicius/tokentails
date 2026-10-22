/**
 * Avietė's skill FX (ANIM-SPEC §14, §7, §9). Electric: pale-gold cores, lightning, relation rims. Render only.
 *
 * - Q Spark Swipe: the exact cone (talent-resolved range and arc) filled as the dominant layer: two arc spawns with
 *   opposite lead sides, so the whole sector reads evenly (one arc spawn is brightest at its lead edge and 3.5× dimmer
 *   at the far one), p3 2.8, alive 0.42 s with the shader's front-loaded fade (full strength for the first 0.23 s,
 *   ≥ 14 frames). Over it, faint slices following her claw (p3 ≤ 1.2), its rim band, an electric fence along the far
 *   edge, lightning chained along the edge and claw scratches.
 * - W Shiny Coat: on the cast only a ring and radial shed bolts (the wet-cat shake stays visible); a half-height light
 *   column and twister punctuate the chest-out pop on the `shine` marker; sparks off her coat for the 2 s haste.
 * - E Live Wire: lightning at both ends and along the snap, a scorched line, and the crackling wire between the
 *   origin and the landing for the 60 t return window (both teams see it: it says where she can come back to);
 *   the return closes it with a bolt back along it.
 * - R Short Circuit: a flash at the origin, a sky bolt that drops onto her airborne axe-kick (its light column stands
 *   from the heel, 2 m up, to the sky and lives 0.12 s: the heel and the victim below it stay visible), the dazzle ring at exactly the sim's 3 m (Blinding Shine
 *   burns whiter) with a thin, faint, short edge band (never a wall over the area: telegraphs inside stay readable),
 *   radial bolts, a shock ring, a static crack glyph. Low tier: no glow. The way back opens the same wire.
 * - Passive Shy, Then Shiny: the Charged hit on a hero throws a lightning arc paw → victim with a flash and a ring.
 *   `update` keeps the Charged flag honest against the snapshot (the 4 s decay outside brush, a charge spent
 *   elsewhere) and reads whether her basic's target is a hero (AVI_STATE.swingHero, for the flying knee pick).
 *
 * Gameplay shapes use the sim radii from `fx.abil`; the lingering glyphs are never red and never rings. Blink
 * endpoints come from a per-frame position track of Avietė's own ids (no allocation): a blink ≥ 3.5 m teleports one
 * tick before the cast fires, so the origin is the position before that jump.
 */
import { stubFx } from '../anim/common';
import type { FxCtx, MeshFxSpawn, MoveCtx, SkillFxSet, V3Out } from '../anim/types';
import { RADIUS } from '../../data/map';
import { AVI_HASTE_S, AVI_STATE, AVI_WIRE_S } from '../moves/aviete';

/** Pale-gold core, the volt yellow of her spark orbs, near-white arcs, and Blinding Shine's white. */
const CORE = 0xfff3a6;
const VOLT = 0xffe24d;
const ARC = 0xfff8d8;
const BLIND = 0xffffff;
const N = 16;
const TAU = Math.PI * 2;
/** Hero-to-hero gap (m) Short Circuit lands at (two hero radii, the kit's `gap`). */
const GAP = (RADIUS.hero * 2) / 1000;
/** A per-frame jump longer than this (m) is a blink (dash speed is 0.33 m a frame at 60 Hz). */
const JUMP = 0.55;

// position track (blink origins) and the open wire per id
const lastX = new Float32Array(N);
const lastZ = new Float32Array(N);
const have = new Uint8Array(N);
const segX = new Float32Array(N);
const segZ = new Float32Array(N);
const segAt = new Float64Array(N).fill(-9);
const coilX = new Float32Array(N);
const coilZ = new Float32Array(N);
const coilAt = new Float64Array(N).fill(-9);
const wireOn = new Uint8Array(N);
/** Wire anchor (where the return goes) and the far end (where she landed). */
const wAX = new Float32Array(N);
const wAZ = new Float32Array(N);
const wBX = new Float32Array(N);
const wBZ = new Float32Array(N);
const wireNext = new Float64Array(N);
const wireFix = new Uint8Array(N);
const wireCol = new Uint32Array(N);
const hasteUntil = new Float64Array(N);
const sparkNext = new Float64Array(N);

const P: V3Out = { x: 0, y: 0, z: 0 };
/** One reused spawn record for the per-frame wire (the mesh pool copies it; no allocation per frame). */
/** The wire refresh period (s); each beam lives one period plus 0.02 s, so one instance per wire is live (Low has 2). */
const WIRE_EVERY = 0.22;
const WIRE: MeshFxSpawn = { x: 0, y: 0.9, z: 0, yaw: 0, sx: 1, sz: 0.36, life: WIRE_EVERY + 0.02, color: VOLT, rim: 0, p3: 3, rel: 'own' };
const Q: V3Out = { x: 0, y: 0, z: 0 };

const by = (fx: FxCtx, low: number, med: number, high: number): number => (fx.tier === 'low' ? low : fx.tier === 'med' ? med : high);
const ok = (id: number): boolean => id >= 0 && id < N;
/** Heroes have ability numbers (every Q has a cooldown); minions, towers and monsters get none. */
const isHero = (fx: FxCtx, id: number): boolean => fx.abil(id, 'q').cooldown !== undefined;

/** The blink origin: the position before a jump seen in the last 0.15 s, else the coil marker's, else where she is. */
function origin(fx: FxCtx, id: number, out: V3Out): boolean {
  const now = AVI_STATE.clock;
  if (now - segAt[id] < 0.15) {
    out.x = segX[id];
    out.z = segZ[id];
    return true;
  }
  if (now - coilAt[id] < 0.3) {
    out.x = coilX[id];
    out.z = coilZ[id];
    return true;
  }
  return fx.heroPos(id, out);
}

/** A vertical strike: a bolt from y0 down to y1 at (x, z), and a light column standing from y1 up to y0 for `life` s. */
function strike(fx: FxCtx, x: number, z: number, y0: number, y1: number, color: number, rel: 'own' | 'ally' | 'enemy', rim: number, life = 0.18): void {
  fx.particles.lightning(x + 0.2, y0, z - 0.1, x, y1, z, color);
  if (fx.tier !== 'low') fx.particles.lightning(x - 0.25, y0 * 0.8, z + 0.15, x, y1, z, ARC);
  fx.mesh.spawn('pillar', { x, z, y: y1, sx: fx.tier === 'low' ? 0.3 : 0.42, sy: y0 - y1, life, color: VOLT, rim, p3: 3, rel });
}

/** Radial bolts from (x, y0, z) to a circle of radius r on the ground. */
function radial(fx: FxCtx, x: number, z: number, y0: number, r: number, n: number, color: number, phase: number): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i * TAU) / n;
    fx.particles.lightning(x, y0, z, x + Math.cos(a) * r, 0.15, z - Math.sin(a) * r, color);
  }
}

// ------------------------------------------------------------------------------------------------ slots

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, P)) return;
  const a = fx.abil(id, 'q');
  const R = (a.range ?? 2200) / 1000;
  const arc = ((a.arc ?? 1138) / 4096) * TAU;
  const tx = e.x / 1000;
  const tz = -e.y / 1000;
  let yaw = Math.atan2(-(tz - P.z), tx - P.x);
  if (!Number.isFinite(yaw)) yaw = 0;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  // the swipe: the exact cone filled as the dominant layer (the arc kind draws a true sector, ±p0/2 round the yaw,
  // but weights its lead edge: two spawns with opposite lead sides fill it evenly), its outline band, and faint
  // slices lighting up across it in the tornado's turn direction (every slice stays inside the sim cone)
  fx.mesh.spawn('arc', { x: P.x, z: P.z, yaw, sx: R, life: 0.42, color: VOLT, rim, p0: arc, p1: 0.1, p2: -1, p3: 2.8, rel });
  fx.mesh.spawn('arc', { x: P.x, z: P.z, yaw, sx: R, life: 0.42, color: VOLT, rim, p0: arc, p1: 0.1, p2: 1, p3: 2.8, rel });
  fx.mesh.spawn('arc', { x: P.x, z: P.z, yaw, sx: R, life: 0.42, color: ARC, rim, p0: arc, p1: 0.86, p2: -1, p3: 2, rel });
  const slices = by(fx, 1, 3, 4);
  const w = arc / slices;
  for (let i = 0; i < slices; i++) {
    // up to the centre (under her extended claw on the contact) at once, then on with her clockwise turn
    const delay = Math.max(0, i + 0.5 - slices / 2) * 0.03;
    fx.mesh.spawn('arc', { x: P.x, z: P.z, yaw: yaw + arc / 2 - w * (i + 0.5), sx: R, life: 0.2, color: CORE, rim, p0: w, p1: 0.3, p2: -1, p3: 1.2, rel, delay });
  }
  // a crackling electric fence stands up along the cone's far edge (the cone's floor hides under bodies up close)
  fx.mesh.spawn('wall', { x: P.x, z: P.z, yaw, sx: R, sy: 1.1, life: 0.32, color: VOLT, rim, p0: arc, p3: 1.6, rel });
  fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.5, life: 0.22, color: VOLT, rim, p3: 2, rel });
  // lightning chained along the cone's edge, and from her paw into the cone
  const n = by(fx, 2, 4, 5);
  const half = arc / 2;
  let px = P.x + Math.cos(yaw + half) * R;
  let pz = P.z - Math.sin(yaw + half) * R;
  for (let i = 1; i <= n; i++) {
    const ang = yaw + half - (arc * i) / n;
    const nx = P.x + Math.cos(ang) * R;
    const nz = P.z - Math.sin(ang) * R;
    fx.particles.lightning(px, 0.5, pz, nx, 0.5, nz, ARC);
    px = nx;
    pz = nz;
  }
  if (fx.bonePos(id, 'pawR', Q)) fx.particles.lightning(Q.x, Q.y, Q.z, P.x + Math.cos(yaw) * R * 0.9, 0.4, P.z - Math.sin(yaw) * R * 0.9, CORE);
  fx.linger.add('scratches', P.x + Math.cos(yaw) * R * 0.55, P.z - Math.sin(yaw) * R * 0.55, R * 0.42, yaw, VOLT);
}

function castW(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, P)) return;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  // the cast keeps her body clear (the shake is the show): a ground ring and the radial shed bolts only
  fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.8, life: 0.4, color: VOLT, rim, p1: 0.15, p3: 2.5, rel });
  radial(fx, P.x, P.z, 1.5, 1.5, by(fx, 3, 5, 7), ARC, Math.random() * TAU);
  hasteUntil[id] = AVI_STATE.clock + AVI_HASTE_S;
  sparkNext[id] = AVI_STATE.clock + 0.15;
}

/** Open (or move) the return wire: anchor = where the return goes, far = where she is now. */
function openWire(id: number, ax: number, az: number, bx: number, bz: number, color: number): void {
  wAX[id] = ax;
  wAZ[id] = az;
  wBX[id] = bx;
  wBZ[id] = bz;
  wireOn[id] = 1;
  wireNext[id] = AVI_STATE.clock;
  wireFix[id] = 3;
  wireCol[id] = color;
  AVI_STATE.wireUntil[id] = AVI_STATE.clock + AVI_WIRE_S;
}

function closeWire(id: number): void {
  wireOn[id] = 0;
  AVI_STATE.wireUntil[id] = 0;
}

function castE(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!origin(fx, id, P)) return;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  let tx: number;
  let tz: number;
  if (AVI_STATE.isReturn[id] === 1 && wireOn[id] === 1) {
    // the return: back along the wire to its anchor
    tx = wAX[id];
    tz = wAZ[id];
    closeWire(id);
  } else {
    // out: the aim clamped to the (talent-resolved) blink range
    const a = fx.abil(id, 'e');
    const max = (a.blink ?? 4500) / 1000;
    const ax = e.x / 1000 - P.x;
    const az = -e.y / 1000 - P.z;
    const d = Math.hypot(ax, az);
    const k = d > max ? max / d : 1;
    tx = P.x + ax * k;
    tz = P.z + az * k;
    openWire(id, P.x, P.z, tx, tz, VOLT);
  }
  strike(fx, P.x, P.z, 2.6, 0.1, ARC, rel, rim);
  strike(fx, tx, tz, 2.6, 0.1, ARC, rel, rim);
  fx.particles.lightning(P.x, 1.1, P.z, tx, 1.1, tz, CORE);
  fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.3, life: 0.3, color: VOLT, rim, p3: 2.5, rel });
  fx.mesh.spawn('glow', { x: tx, z: tz, sx: 1.4, life: 0.32, color: VOLT, rim, p3: 2.5, rel });
  fx.mesh.spawn('ring', { x: tx, z: tz, sx: 1.2, life: 0.3, color: VOLT, rim, p1: 0.2, p3: 2.5, rel });
  const len = Math.hypot(tx - P.x, tz - P.z);
  if (len > 0.5) fx.linger.add('crackLine', (P.x + tx) / 2, (P.z + tz) / 2, len / 2, Math.atan2(-(tz - P.z), tx - P.x), VOLT);
}

function castR(e: { src: number; target: number }, fx: FxCtx): void {
  const id = e.src;
  if (!origin(fx, id, P)) return;
  const a = fx.abil(id, 'r');
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  const color = (a.slowBp ?? 4000) > 4000 ? BLIND : VOLT;
  // her landing: beside the target, on the side she came from (the kit's gap), else where she stands
  let lx: number;
  let lz: number;
  if (e.target !== id && fx.heroPos(e.target, Q)) {
    const dx = P.x - Q.x;
    const dz = P.z - Q.z;
    const d = Math.hypot(dx, dz);
    lx = d > GAP ? Q.x + (dx / d) * GAP : P.x;
    lz = d > GAP ? Q.z + (dz / d) * GAP : P.z;
  } else {
    if (!fx.heroPos(id, Q)) return;
    lx = Q.x;
    lz = Q.z;
  }
  const r = (a.dazzleRadius ?? 3000) / 1000;
  // the origin flash and the path
  if (Math.hypot(lx - P.x, lz - P.z) > 0.5) {
    fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.6, life: 0.35, color: CORE, rim, rel });
    strike(fx, P.x, P.z, 2.4, 0.1, ARC, rel, rim);
    fx.particles.lightning(P.x, 1.2, P.z, lx, 2.4, lz, CORE);
  }
  // the sky bolt drops onto her airborne axe-kick (≈2 m up: 0.95 m root + the chopping heel); its column stands
  // from the heel upward and lives 0.12 s, so the heel and the victim below read by the contact + 2 frames
  strike(fx, lx, lz, 10, 2.0, BLIND, rel, rim, 0.12);
  // the dazzle: an expanding ring to exactly the sim radius, a thin faint edge band (never a wall over the area:
  // telegraphs inside it stay readable), radial bolts, a shock ring
  fx.mesh.spawn('ring', { x: lx, z: lz, sx: r, life: 0.5, color, rim, p1: 0.1, rel });
  fx.mesh.spawn('arc', { x: lx, z: lz, sx: r, life: 0.45, color, rim, p0: TAU, p1: 0.97, p2: 1, p3: 1, rel });
  if (fx.tier !== 'low') fx.mesh.spawn('glow', { x: lx, z: lz, sx: 1.6, life: 0.3, color: CORE, rim, rel });
  radial(fx, lx, lz, 1.6, r, by(fx, 3, 6, 8), ARC, Math.random() * TAU);
  fx.shock.start({ x: lx, y: 0, z: lz }, { r1: r, dur: 0.26, color, height: 0.5 });
  fx.particles.debris(lx, lz, 1);
  fx.linger.add('crackStar', lx, lz, 1.7, Math.random() * TAU, VOLT);
  // the way back opens like Live Wire's
  if (Math.hypot(lx - P.x, lz - P.z) > 0.5) openWire(id, P.x, P.z, lx, lz, color);
  else AVI_STATE.wireUntil[id] = AVI_STATE.clock + AVI_WIRE_S;
}

/** Shy, Then Shiny landed: a lightning arc paw → victim, a flash and a ring on the victim. */
function proc(src: number, dst: number, fx: FxCtx): void {
  if (!fx.heroPos(dst, Q)) return;
  const rel = fx.relation(src);
  const rim = fx.rim(src);
  if (fx.bonePos(src, 'pawR', P)) {
    fx.particles.lightning(P.x, P.y, P.z, Q.x, 1.3, Q.z, ARC);
    if (fx.tier !== 'low') fx.particles.lightning(P.x, P.y + 0.2, P.z, Q.x, 1.7, Q.z, CORE);
  }
  fx.mesh.spawn('glow', { x: Q.x, z: Q.z, sx: 1.4, life: 0.3, color: CORE, rim, rel });
  fx.mesh.spawn('ring', { x: Q.x, z: Q.z, sx: 1.1, life: 0.3, color: VOLT, rim, p1: 0.2, rel });
  strike(fx, Q.x, Q.z, 3.4, 1.4, ARC, rel, rim);
  fx.linger.add('crackStar', Q.x, Q.z, 0.8, Math.random() * TAU, VOLT);
  fx.sfx.cue('zap', Q);
  if (rel === 'own') fx.cam.tier(1);
}

// ------------------------------------------------------------------------------------------------ markers

function marker(id: number, clipId: string, m: string, fx: FxCtx): void {
  if (!ok(id)) return;
  AVI_STATE.seen[id] = 1;
  if (m === 'coil') {
    if ((clipId === 'aviete.e' || clipId === 'aviete.eBack' || clipId === 'aviete.r') && fx.heroPos(id, P)) {
      coilX[id] = P.x;
      coilZ[id] = P.z;
      coilAt[id] = AVI_STATE.clock;
    }
    return;
  }
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  switch (m) {
    case 'kickSpark':
      if (fx.bonePos(id, 'kneeR', P) && fx.bonePos(id, 'footR', Q)) {
        const dx = Q.x - P.x;
        const dy = Q.y - P.y;
        const dz = Q.z - P.z;
        fx.particles.lightning(Q.x, Q.y, Q.z, Q.x + dx * 2.2, Q.y + dy * 2.2, Q.z + dz * 2.2, ARC);
        fx.mesh.spawn('glow', { x: Q.x, z: Q.z, sx: 0.9, life: 0.18, color: CORE, rim, rel });
      }
      return;
    case 'chargedHit':
      if (fx.bonePos(id, 'kneeR', P)) fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.2, life: 0.22, color: CORE, rim, rel });
      return;
    case 'shed':
      if (fx.bonePos(id, 'chest', P)) radial(fx, P.x, P.z, P.y, 1.3, by(fx, 2, 3, 4), ARC, Math.random() * TAU);
      return;
    case 'shine':
      // the chest-out pop: a short half-height column and twister punctuate it (W shine; level-up reuses it)
      if (!fx.heroPos(id, P)) return;
      fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.4, life: 0.3, color: CORE, rim, p1: 0.3, rel });
      fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.4, life: 0.3, color: CORE, rim, rel });
      fx.mesh.spawn('pillar', { x: P.x, z: P.z, y: 0, sx: 0.6, sy: 1.6, life: 0.15, color: VOLT, rim, p3: 2.5, rel });
      fx.mesh.spawn('twister', { x: P.x, z: P.z, y: 0, sx: 0.8, sy: 1.6, life: 0.15, color: VOLT, rim, p3: 2, rel });
      return;
    case 'heel':
      if (fx.bonePos(id, 'footR', P)) {
        fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.3, life: 0.25, color: CORE, rim, p1: 0.25, rel });
        fx.particles.lightning(P.x, P.y, P.z, P.x, 0.1, P.z, ARC);
      }
      return;
    case 'deathZap':
      if (fx.bonePos(id, 'chest', P)) radial(fx, P.x, P.z, P.y, 0.9, by(fx, 1, 2, 3), ARC, Math.random() * TAU);
      return;
    case 'fizzle':
      if (!fx.heroPos(id, P)) return;
      fx.particles.lightning(P.x - 0.4, 0.4, P.z, P.x + 0.3, 0.2, P.z + 0.2, VOLT);
      fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 0.8, life: 0.4, color: VOLT, rim, rel });
      return;
    case 'respawnBolt':
      // the bolt's column stands from 1.4 m up and is gone by 0.08 s: the spinning ball shows on the way down
      if (fx.heroPos(id, P)) strike(fx, P.x, P.z, 10, 1.4, BLIND, rel, rim, 0.08);
      return;
    case 'respawnLand':
      if (!fx.heroPos(id, P)) return;
      fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.8, life: 0.4, color: VOLT, rim, p1: 0.15, rel });
      fx.linger.add('crackStar', P.x, P.z, 1.1, Math.random() * TAU, VOLT);
      radial(fx, P.x, P.z, 0.4, 1.6, by(fx, 2, 3, 4), ARC, Math.random() * TAU);
      return;
    case 'victorySpark':
      if (!fx.heroPos(id, P)) return;
      fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 2, life: 0.45, color: VOLT, rim, p1: 0.1, rel });
      fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.8, life: 0.45, color: CORE, rim, rel });
      radial(fx, P.x, P.z, 2.6, 1.8, by(fx, 3, 5, 6), ARC, Math.random() * TAU);
      return;
    case 'tailSpark':
      if (fx.bonePos(id, 'tail5', P)) fx.particles.lightning(P.x, P.y, P.z, P.x + 0.3, P.y + 0.4, P.z - 0.2, VOLT);
      return;
    default:
      return;
  }
}

// ------------------------------------------------------------------------------------------------ per frame

/** The fields of a frame entity (ViewEntity) this script reads. */
interface EntLite {
  id: number;
  kind: string;
  team: number;
  hp: number;
  fx: number;
  fy: number;
  yaw: number;
  charged?: boolean;
}
type EntMap = ReadonlyMap<number, EntLite>;
/** The runtime's frame entities (FxRuntime.ents, set by the director each frame); absent on test stubs. */
const entsOf = (fx: FxCtx): EntMap | null => (fx as unknown as { ents?: EntMap | null }).ents ?? null;
/** Her basic reach (mm): the data range plus a body radius each side and a little slack. */
const REACH = 1600 + RADIUS.hero * 2 + 400;
/** Uncharged in the snapshot this long (s) clears a stale Charged flag (a hit event fires a few ticks behind it). */
const STALE = 0.3;
const unchargedFor = new Float32Array(N);
// the swing-target scan (Map.forEach with a module callback: no closure, no iterator allocated per frame)
let scanSelf: EntLite | null = null;
let scanBest = 0;
let scanHero = 0;
function scanOne(o: EntLite): void {
  const me = scanSelf!;
  if (o.id === me.id || o.team === me.team || o.hp <= 0 || o.kind === 'fountain' || o.kind === 'pickup') return;
  const dx = o.fx - me.fx;
  const dy = o.fy - me.fy;
  const d = Math.hypot(dx, dy);
  if (d > REACH || d < 1) return;
  // nearest, weighted toward where she faces (the sim turns her to the target when the swing starts)
  const cos = (dx * Math.cos(me.yaw) + dy * Math.sin(me.yaw)) / d;
  const score = d * (1.6 - 0.6 * cos);
  if (score < scanBest) {
    scanBest = score;
    scanHero = o.kind === 'hero' ? 1 : 0;
  }
}

/** Per id: drop a stale Charged flag, and read whether the basic's target is an enemy hero. */
function chargeTrack(id: number, dt: number, ents: EntMap): void {
  const me = ents.get(id);
  if (!me) return;
  if (me.charged) unchargedFor[id] = 0;
  else if ((unchargedFor[id] += dt) > STALE) AVI_STATE.charged[id] = 0;
  if (!me.charged) {
    AVI_STATE.swingHero[id] = 0;
    return;
  }
  scanSelf = me;
  scanBest = Infinity;
  scanHero = 0;
  ents.forEach(scanOne);
  scanSelf = null;
  AVI_STATE.swingHero[id] = scanHero;
}

function update(dt: number, fx: FxCtx): void {
  const now = (AVI_STATE.clock += dt);
  const ents = entsOf(fx);
  for (let id = 0; id < N; id++) {
    if (!AVI_STATE.seen[id]) continue;
    if (ents) chargeTrack(id, dt, ents);
    if (!fx.heroPos(id, P)) continue;
    // the blink track: the first fast frame of a jump keeps where it started
    if (have[id]) {
      const d = Math.hypot(P.x - lastX[id], P.z - lastZ[id]);
      if (d > JUMP) {
        if (now - segAt[id] > 0.08) {
          segX[id] = lastX[id];
          segZ[id] = lastZ[id];
        }
        segAt[id] = now;
      }
    }
    lastX[id] = P.x;
    lastZ[id] = P.z;
    have[id] = 1;
    // the wire: refreshed beams (a pulse runs along each), crackle on Med / High
    if (wireOn[id]) {
      if (now > AVI_STATE.wireUntil[id]) {
        wireOn[id] = 0;
        fx.particles.lightning(wAX[id], 1.0, wAZ[id], wAX[id], 0.1, wAZ[id], VOLT);
      } else {
        if (wireFix[id] > 0 && --wireFix[id] === 0 && Math.hypot(P.x - wAX[id], P.z - wAZ[id]) > 0.5) {
          // the real landing (a wall can stop a blink short of the aim)
          wBX[id] = P.x;
          wBZ[id] = P.z;
        }
        if (now >= wireNext[id]) {
          const dx = wBX[id] - wAX[id];
          const dz = wBZ[id] - wAZ[id];
          const len = Math.hypot(dx, dz);
          if (len > 0.3) {
            WIRE.x = wAX[id];
            WIRE.z = wAZ[id];
            WIRE.yaw = Math.atan2(-dz, dx);
            WIRE.sx = len;
            WIRE.color = wireCol[id];
            WIRE.rim = fx.rim(id);
            WIRE.rel = fx.relation(id);
            // gameplay information (where she can come back to): a full beam pool falls back to a particle line
            if (fx.mesh.spawn('beam', WIRE) < 0) fx.particles.lightning(wAX[id], 0.9, wAZ[id], wBX[id], 0.9, wBZ[id], wireCol[id]);
            if (fx.tier !== 'low' && !fx.reduced) {
              const t = 0.2 + Math.random() * 0.6;
              fx.particles.lightning(wAX[id] + dx * (t - 0.15), 0.9, wAZ[id] + dz * (t - 0.15), wAX[id] + dx * t, 0.9, wAZ[id] + dz * t, ARC);
            }
          }
          wireNext[id] = now + WIRE_EVERY;
        }
      }
    }
    // Shiny Coat: sparks shed off the coat for the haste
    if (hasteUntil[id] > now && now >= sparkNext[id]) {
      const a = Math.random() * TAU;
      fx.particles.lightning(P.x + Math.cos(a) * 0.35, 1.0 + Math.random() * 0.9, P.z - Math.sin(a) * 0.35, P.x + Math.cos(a) * 0.95, 0.3, P.z - Math.sin(a) * 0.95, VOLT);
      sparkNext[id] = now + by(fx, 0.3, 0.14, 0.1);
    }
  }
}

/** Clear every per-id track and the shared render state (tests, gallery restarts). */
export function resetAvieteFx(): void {
  for (const a of [lastX, lastZ, segX, segZ, coilX, coilZ, wAX, wAZ, wBX, wBZ]) a.fill(0);
  for (const a of [have, wireOn, wireFix]) a.fill(0);
  segAt.fill(-9);
  coilAt.fill(-9);
  wireNext.fill(0);
  wireCol.fill(0);
  hasteUntil.fill(0);
  sparkNext.fill(0);
  AVI_STATE.clock = 0;
  AVI_STATE.wireUntil.fill(0);
  AVI_STATE.isReturn.fill(0);
  AVI_STATE.charged.fill(0);
  AVI_STATE.swingHero.fill(0);
  AVI_STATE.seen.fill(0);
  unchargedFor.fill(0);
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('aviete'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },
  onCast(e, fx, ctx: MoveCtx) {
    const id = e.src;
    if (!ok(id)) return;
    AVI_STATE.seen[id] = 1;
    // a Charged Q / R: the next damage to a hero is the proc
    if (e.slot === 0 || e.slot === 3) AVI_STATE.charged[id] = ctx.charged ? 1 : 0;
    if (e.slot === 0) castQ(e, fx);
    else if (e.slot === 1) castW(id, fx);
    else if (e.slot === 2) castE(e, fx);
    else if (e.slot === 3) castR(e, fx);
  },
  onHit(e, fx) {
    const id = e.src;
    if (!ok(id)) return;
    if (AVI_STATE.charged[id] && isHero(fx, e.dst)) {
      AVI_STATE.charged[id] = 0;
      proc(id, e.dst, fx);
      return;
    }
    // an ability hit on a hero: a bolt from her into the victim
    if (e.kind === 'ability' && isHero(fx, e.dst) && fx.heroPos(e.dst, Q) && fx.bonePos(id, 'chest', P)) fx.particles.lightning(P.x, P.y, P.z, Q.x, 1.2, Q.z, ARC);
  },
  onMarker: marker,
  update,
};
