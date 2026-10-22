/**
 * Cacklejaw skill FX (ANIM-SPEC §14 "Cacklejaw"): Dark violet claw work, every gameplay shape at its sim size.
 *
 * - Basics: three standing claw strokes across the victim at chest height (ribbons in the camera-facing plane, the slant
 *   follows the rake; flat floor rakes vanish on grass and sand), a scratch glyph under him; C's spin a standing wall
 *   ring plus a shock ring. Low (no ribbons, no walls): the normal-blend scratch glyph in deep violet stands in. Pack
 *   Flank (an ally within the passive's ally range of the victim): a pink-violet streak, a triple scratch glyph and an
 *   eye glint.
 * - Q Jeer Slash: a violet ribbon exactly the dash width (q.width) along the path the hero really travelled (fed from
 *   his interpolated position, never the aim, D7), a beam of the same width and a crack line once the dash ends, an X
 *   cut on every unit it hits, slow goo under Cruel Jeer recast victims.
 * - W Gloat: the exact cone (range and arc after talents): a floor, a standing wall arc on its rim and a laugh wavefront
 *   inside it, posts standing along both straight edges (Low: the floor and the rim posts).
 * - E Bush Slink: a shadow twister and puff where he vanishes (Low: a glow and a ring), a scorch glyph.
 * - R Pack Hunt: the howl ring; a jaw sigil and a mark pillar over the hunted hero (seen by both teams), a shadow
 *   ribbon along the hunt, alive for the sim hunt's whole life (30 t); the maul on the R hit within that life: a
 *   standing claw X on the victim, a violet ring and shock kept small (2.2 m, ≤ 0.3 s, low on Med / Low; enemy casts
 *   in the danger rim colour), a crack star and scratches, shake T3 for the caster and for a hunted player.
 *
 * Enemy effects take the danger rim (fx.rim) and are never faded by the coverage budget; the shader dims anything over
 * an enemy windup. Lingering glyphs are never red and never rings. Pooled: module-level scratch objects and typed
 * arrays, nothing allocated per event or per frame.
 */
import { stubFx } from '../anim/common';
import { DASH_SPEED, TICK_S, abilNumbers, travelTicks } from '../anim/timing';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Relation3, SkillFxSet, V3Out } from '../anim/types';

const CORE = 0xb07cff;
const PALE = 0xd9c4ff;
const DEEP = 0x6a3cc0;
const SHADOW = 0x4a2a8a;
const FLANK = 0xff6fc1;
const TAU = Math.PI * 2;
const MAX_IDS = 16;

/** One reused spawn record: every field is reset on each spawn. */
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 0.3, color: CORE, rim: CORE, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };
function spawn(fx: FxCtx, kind: MeshFxKind, x: number, z: number, yaw: number, sx: number, life: number, color: number, src: number, p0 = 0, p1 = 0, p2 = 0, p3 = 1, delay = 0, y = 0.06, sy = 1, sz = sx): number {
  S.x = x;
  S.z = z;
  S.y = y;
  S.yaw = yaw;
  S.sx = sx;
  S.sy = sy;
  S.sz = sz;
  S.life = life;
  S.color = color;
  S.rim = fx.rim(src);
  S.rel = fx.relation(src);
  S.p0 = p0;
  S.p1 = p1;
  S.p2 = p2;
  S.p3 = p3;
  S.delay = delay;
  return fx.mesh.spawn(kind, S);
}

/** A beam of `len` × `width` centred on (x, z) along `yaw`. */
function beamAt(fx: FxCtx, x: number, z: number, yaw: number, len: number, width: number, life: number, color: number, src: number, delay = 0): void {
  spawn(fx, 'beam', x - Math.cos(yaw) * len * 0.5, z + Math.sin(yaw) * len * 0.5, yaw, len, life, color, src, 0, 0, 0, 1, delay, 0.08, 1, width);
}

const SH_POS = { x: 0, y: 0, z: 0 };
const SH_OPT = { r1: 2.5, dur: 0.3, color: CORE, height: 0.5, intensity: 1.4, dust: true };
/** A standing shock ring (Shockwaves): reads on any ground, unlike a dark additive floor. */
function shock(fx: FxCtx, x: number, z: number, r1: number, dur: number, color: number, height: number, dust = true): void {
  SH_POS.x = x;
  SH_POS.z = z;
  SH_OPT.r1 = r1;
  SH_OPT.dur = dur;
  SH_OPT.color = color;
  SH_OPT.height = height;
  SH_OPT.dust = dust;
  fx.shock.start(SH_POS, SH_OPT);
}

const SL = { x: 0, y: 0, z: 0 };
/**
 * One standing claw stroke in the camera-facing x–y plane, centred on (cx, cy, cz): from upper-left to lower-right
 * (`slant` −1 mirrors it), bowed by `bow`. A ribbon fed in one frame (the head bright, the tail tapered). Returns false
 * when the tier has no ribbon slot (Low), so the caller can fall back.
 */
function stroke(fx: FxCtx, cx: number, cy: number, cz: number, half: number, drop: number, slant: number, bow: number, color: number, width: number, life: number): boolean {
  SL.x = cx - half * slant;
  SL.y = cy + drop;
  SL.z = cz;
  const rib = fx.ribbons.point(SL, color, width, life);
  if (rib < 0) return false;
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const b = Math.sin(u * Math.PI) * bow;
    fx.ribbons.feed(rib, cx - half * slant + 2 * half * slant * u, cy + drop - 2 * drop * u + b, cz + b * 0.4);
  }
  fx.ribbons.end(rib);
  return true;
}

/** A claw X at chest height on (x, z): two crossed strokes. False on Low (no ribbons). */
function clawX(fx: FxCtx, x: number, z: number, size: number, life: number, a: number, b: number): boolean {
  const ok = stroke(fx, x, 0.75, z, size, size * 0.75, 1, 0.08, a, 0.1 + size * 0.06, life);
  stroke(fx, x, 0.75, z, size, size * 0.75, -1, 0.08, b, 0.1 + size * 0.06, life);
  return ok;
}

/**
 * A cone outline (W): edge, rim arc, edge as one ribbon at 0.3 m, fed in one frame. The ribbon's colour is the danger
 * rim for an enemy caster (the fear must read hostile). False when the tier has no ribbon slot (Low).
 */
function outline(fx: FxCtx, x: number, z: number, yaw: number, R: number, arc: number, src: number): boolean {
  const col = fx.relation(src) === 'enemy' ? fx.rim(src) : PALE;
  const a0 = yaw - arc * 0.5;
  SL.x = x;
  SL.y = 0.3;
  SL.z = z;
  const rib = fx.ribbons.point(SL, col, 0.14, 0.6);
  if (rib < 0) return false;
  for (let i = 1; i <= 3; i++) fx.ribbons.feed(rib, x + Math.cos(a0) * R * (i / 3), 0.3, z - Math.sin(a0) * R * (i / 3));
  for (let i = 1; i <= 8; i++) {
    const a = a0 + (arc * i) / 8;
    fx.ribbons.feed(rib, x + Math.cos(a) * R, 0.3, z - Math.sin(a) * R);
  }
  const a1 = yaw + arc * 0.5;
  for (let i = 2; i >= 0; i--) fx.ribbons.feed(rib, x + Math.cos(a1) * R * (i / 3), 0.3, z - Math.sin(a1) * R * (i / 3));
  fx.ribbons.end(rib);
  return true;
}

/** World yaw from a → b in the FX convention (x along +X, the −Z axis is +90°). */
const yawTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(-(bz - az), bx - ax);

const P: V3Out = { x: 0, y: 0, z: 0 };
const D: V3Out = { x: 0, y: 0, z: 0 };
const Q: V3Out = { x: 0, y: 0, z: 0 };
const RIB = { x: 0, y: 0.12, z: 0 };

// ------------------------------------------------------------------------------------------------ per-hero state

let clock = 0;
/** Last cast slot per caster (an ability hit belongs to it). */
const lastSlot = new Int8Array(MAX_IDS).fill(-1);
// Q dash
const dashOn = new Uint8Array(MAX_IDS);
const dashLeft = new Float32Array(MAX_IDS);
const dashX0 = new Float32Array(MAX_IDS);
const dashZ0 = new Float32Array(MAX_IDS);
const dashYaw = new Float32Array(MAX_IDS);
const dashW = new Float32Array(MAX_IDS);
const dashRib = new Int16Array(MAX_IDS).fill(-1);
const dashRecast = new Uint8Array(MAX_IDS);
// R hunt
const huntOn = new Uint8Array(MAX_IDS);
const huntLeft = new Float32Array(MAX_IDS);
const huntAge = new Float32Array(MAX_IDS);
const huntX0 = new Float32Array(MAX_IDS);
const huntZ0 = new Float32Array(MAX_IDS);
const huntRange = new Float32Array(MAX_IDS);
const huntVictim = new Int16Array(MAX_IDS).fill(-1);
const huntRib = new Int16Array(MAX_IDS).fill(-1);
const huntGlowT = new Float32Array(MAX_IDS);
/** Clock of the last R cast and whether its maul already drew (one maul per cast; Feeding Frenzy recasts reset it). */
const huntCastAt = new Float32Array(MAX_IDS).fill(-99);
const huntLife = new Float32Array(MAX_IDS);
const huntHit = new Uint8Array(MAX_IDS);
// basics: the rake marker and the hit meet whichever comes second (same frame ± one)
const rakeKind = new Int8Array(MAX_IDS).fill(-1);
const rakeAt = new Float32Array(MAX_IDS).fill(-9);
const hitVictim = new Int16Array(MAX_IDS).fill(-1);
const hitAt = new Float32Array(MAX_IDS).fill(-9);
const flankAt = new Float32Array(MAX_IDS).fill(-9);
const PAIR_S = 0.12;
/** Pack Flank's ally range (m), from the hero data. */
const ALLY_M = (abilNumbers('cacklejaw', 'passive').allyRange ?? 4000) / 1000;

const RAKE_L = 0;
const RAKE_R = 1;
const RAKE_SPIN = 2;
const RAKE_POUNCE = 3;

const isHero = (fx: FxCtx, id: number): boolean => fx.abil(id, 'q').cooldown !== undefined;
const sameSide = (fx: FxCtx, a: number, b: number): boolean => {
  const ra = fx.relation(a);
  const rb = fx.relation(b);
  return ra === 'enemy' ? rb === 'enemy' : rb !== 'enemy';
};

// ------------------------------------------------------------------------------------------------ basics

/**
 * The rake on the victim (or, on a whiff, 0.9 m out toward the striking paw): three standing claw strokes at chest
 * height (two on Med), slanted with the swing; the spin a standing wall ring and a shock ring; the pounce a claw X.
 * Low has no ribbons or walls: a deep-violet normal-blend scratch glyph (and a crescent for the spin) stands in.
 */
function drawRake(fx: FxCtx, src: number, kind: number, victim: number): void {
  if (!fx.heroPos(src, P)) return;
  let cx: number;
  let cz: number;
  let yaw: number;
  if (victim >= 0 && fx.heroPos(victim, D)) {
    cx = D.x;
    cz = D.z;
    yaw = yawTo(P.x, P.z, D.x, D.z);
  } else if (fx.bonePos(src, kind === RAKE_L ? 'pawL' : 'pawR', Q)) {
    yaw = yawTo(P.x, P.z, Q.x, Q.z);
    cx = P.x + Math.cos(yaw) * 0.9;
    cz = P.z - Math.sin(yaw) * 0.9;
  } else return;
  if (kind === RAKE_SPIN) {
    const ok = spawn(fx, 'wall', P.x, P.z, 0, 1.6, 0.28, CORE, src, TAU, 0, 0, 0.8, 0, 0.05, 0.5, 1.6) >= 0;
    shock(fx, P.x, P.z, 1.6, 0.26, CORE, fx.tier === 'high' ? 0.5 : 0.35, false);
    if (!ok) spawn(fx, 'crescent', P.x, P.z, 0, 1.6, 0.26, CORE, src, TAU, 0.88, 1, 1);
    if (victim >= 0) {
      stroke(fx, cx, 0.7, cz, 0.55, 0.12, 1, 0.1, PALE, 0.09, 0.24);
      fx.linger.add('scratches', cx, cz, 0.55, yaw, DEEP);
    }
    return;
  }
  if (kind === RAKE_POUNCE) {
    if (!clawX(fx, cx, cz, 0.55, 0.28, PALE, CORE)) spawn(fx, 'crescent', P.x, P.z, yaw, 1.3, 0.26, CORE, src, 1.0, 0.9, 1, 1);
    fx.linger.add('crackStar', cx, cz, 0.8, yaw, CORE);
    return;
  }
  // A rakes right-to-left, B left-to-right: the strokes slant with the swing
  const slant = kind === RAKE_L ? -1 : 1;
  const n = fx.tier === 'high' ? 3 : 2;
  let drew = false;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) * 0.5) * 0.17;
    const col = (n === 3 ? i === 1 : i === 0) ? PALE : CORE;
    drew = stroke(fx, cx + off, 0.75 + off * 0.3, cz, 0.42, 0.3, slant, 0.06, col, 0.07, 0.24) || drew;
  }
  fx.linger.add('scratches', cx, cz, 0.5, yaw + Math.PI * 0.5, drew ? CORE : DEEP);
}

/** Pack Flank: a pink-violet streak to the victim, a triple scratch glyph under it, an eye glint. Once per swing. */
function drawFlank(fx: FxCtx, src: number, victim: number): void {
  if (clock - flankAt[src] < 0.3) return;
  if (!fx.heroPos(src, P) || victim < 0 || !fx.heroPos(victim, D)) return;
  flankAt[src] = clock;
  const yaw = yawTo(P.x, P.z, D.x, D.z);
  const len = Math.hypot(D.x - P.x, D.z - P.z) + 0.8;
  spawn(fx, 'beam', P.x, P.z, yaw, len, 0.2, FLANK, src, 0, 0, 0, 1, 0, 0.5, 1, 0.22);
  fx.linger.add('scratches', D.x, D.z, 0.6, yaw + Math.PI * 0.5, FLANK);
  if (fx.bonePos(src, 'head', Q)) spawn(fx, 'glow', Q.x, Q.z, 0, 0.32, 0.2, FLANK, src, 0, 0, 0, 1, 0, Q.y + 0.1);
}

/** Pack Flank's ally half (the passive's ally range around the victim); the behind half needs MoveCtx.targetBehind. */
function allyNear(fx: FxCtx, src: number, victim: number): boolean {
  if (!fx.heroPos(victim, D)) return false;
  const reach = ALLY_M;
  for (let i = 0; i < MAX_IDS; i++) {
    if (i === src || i === victim || !isHero(fx, i) || !sameSide(fx, i, src) || !fx.heroPos(i, Q)) continue;
    if (Math.hypot(Q.x - D.x, Q.z - D.z) <= reach) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ R helpers

/** The hunted hero: the enemy the hunter is closing on (or, before he moves, the nearest one within range). */
function findVictim(fx: FxCtx, src: number): number {
  if (!fx.heroPos(src, P)) return -1;
  const mx = P.x - huntX0[src];
  const mz = P.z - huntZ0[src];
  const moved = Math.hypot(mx, mz);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < MAX_IDS; i++) {
    if (i === src || !isHero(fx, i) || sameSide(fx, i, src) || !fx.heroPos(i, Q)) continue;
    const dx = Q.x - huntX0[src];
    const dz = Q.z - huntZ0[src];
    const d = Math.hypot(dx, dz);
    if (d > huntRange[src] + 1) continue;
    // moving: the smallest angle off the hunt direction; standing: the nearest
    const score = moved > 0.2 ? 1 - (dx * mx + dz * mz) / Math.max(1e-3, d * moved) : d;
    if (score < bestScore) (bestScore = score), (best = i);
  }
  return best;
}

function drawSigil(fx: FxCtx, src: number, v: number, life: number): void {
  if (!fx.heroPos(v, D)) return;
  // the jaw: two crescents biting toward each other around the hunted hero, a mark pillar, a contracting glow
  spawn(fx, 'crescent', D.x, D.z, Math.PI * 0.5, 1.15, life, CORE, src, 2.3, 0.72, 1, 1);
  spawn(fx, 'crescent', D.x, D.z, -Math.PI * 0.5, 1.15, life, CORE, src, 2.3, 0.72, -1, 1);
  spawn(fx, 'pillar', D.x, D.z, 0, 0.42, life, DEEP, src, 0, 0, 0, 1, 0, 0, 3.4, 0.42);
  spawn(fx, 'ring', D.x, D.z, 0, 1.5, 0.35, PALE, src, 0, 0.2, 0, 0.8);
}

function endHunt(fx: FxCtx, id: number): void {
  huntOn[id] = 0;
  if (huntRib[id] >= 0) fx.ribbons.end(huntRib[id]);
  huntRib[id] = -1;
}

function endDash(fx: FxCtx, id: number): void {
  dashOn[id] = 0;
  if (dashRib[id] >= 0) fx.ribbons.end(dashRib[id]);
  dashRib[id] = -1;
  if (!fx.heroPos(id, P)) return;
  const len = Math.hypot(P.x - dashX0[id], P.z - dashZ0[id]);
  if (len < 0.3) return;
  const yaw = yawTo(dashX0[id], dashZ0[id], P.x, P.z);
  const mx = (P.x + dashX0[id]) * 0.5;
  const mz = (P.z + dashZ0[id]) * 0.5;
  // the travelled path at exactly the dash's hit width
  beamAt(fx, mx, mz, yaw, len, dashW[id], 0.32, dashRecast[id] ? PALE : CORE, id);
  fx.linger.add('crackLine', mx, mz, len * 0.5, yaw, CORE);
}

/** Clears every per-hero slot (tests; a new match reuses the module). */
export function resetCacklejawFx(): void {
  clock = 0;
  lastSlot.fill(-1);
  dashOn.fill(0);
  dashLeft.fill(0);
  dashRib.fill(-1);
  dashRecast.fill(0);
  huntOn.fill(0);
  huntLeft.fill(0);
  huntAge.fill(0);
  huntVictim.fill(-1);
  huntRib.fill(-1);
  huntGlowT.fill(0);
  huntCastAt.fill(-99);
  huntLife.fill(0);
  huntHit.fill(0);
  rakeKind.fill(-1);
  rakeAt.fill(-9);
  hitVictim.fill(-1);
  hitAt.fill(-9);
  flankAt.fill(-9);
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('cacklejaw'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onCast(e, fx: FxCtx, ctx: MoveCtx) {
    const id = e.src;
    if (id < 0 || id >= MAX_IDS || e.slot > 3) return;
    lastSlot[id] = e.slot;
    if (!fx.heroPos(id, P)) return;
    const tx = e.x / 1000;
    const tz = -e.y / 1000;
    const aimed = Math.abs(tx - P.x) + Math.abs(tz - P.z) > 0.05;
    const yaw = aimed ? yawTo(P.x, P.z, tx, tz) : 0;
    switch (e.slot) {
      case 0: {
        const a = fx.abil(id, 'q');
        const full = a.dash ?? 4000;
        const dist = Math.min(full, aimed ? Math.hypot(tx - P.x, tz - P.z) * 1000 : full);
        if (dashOn[id]) endDash(fx, id);
        dashOn[id] = 1;
        dashLeft[id] = (travelTicks(dist, DASH_SPEED) + 1) * TICK_S;
        dashX0[id] = P.x;
        dashZ0[id] = P.z;
        dashYaw[id] = yaw;
        dashW[id] = (a.width ?? 1000) / 1000;
        dashRecast[id] = ctx.recastIndex > 0 ? 1 : 0;
        RIB.x = P.x;
        RIB.z = P.z;
        dashRib[id] = fx.ribbons.point(RIB, dashRecast[id] ? PALE : CORE, dashW[id], 0.45);
        spawn(fx, 'glow', P.x, P.z, 0, 1.1, 0.22, CORE, id);
        if (dashRecast[id]) spawn(fx, 'ring', P.x, P.z, 0, 1.3, 0.25, PALE, id, 0, 0.3, 0, 0.8);
        return;
      }
      case 1: {
        const a = fx.abil(id, 'w');
        const R = (a.range ?? 3000) / 1000;
        const arc = ((a.arc ?? 796) / 4096) * TAU;
        // the exact cone: a floor, a standing wall on the rim at the exact range, one laugh wavefront rolling out to
        // it, and posts standing along both straight edges, so the fear shape reads on any ground. Low has no walls:
        // the floor is brighter and the posts at the rim corners carry the edges.
        const lowT = fx.tier === 'low';
        spawn(fx, 'arc', P.x, P.z, yaw, R, 0.6, CORE, id, arc, 0.05, 1, lowT ? 1 : 0.6);
        spawn(fx, 'wall', P.x, P.z, yaw, R, 0.7, CORE, id, arc, 0, 0, 1.5, 0, 0, 0.8, R);
        spawn(fx, 'wall', P.x, P.z, yaw, R * 0.55, 0.3, PALE, id, arc, 0, 0, 0.8, 0.04, 0, 0.5, R * 0.55);
        // the outline: both straight edges and the rim as ribbons lifted off the ground (crisp lines on any ground),
        // a dark normal-blend crack along each edge; Low (no ribbons): posts at the two rim corners
        const lined = outline(fx, P.x, P.z, yaw, R, arc, id);
        for (let sd = -1; sd <= 1; sd += 2) {
          const ey = yaw + sd * arc * 0.5;
          const cx = Math.cos(ey);
          const cz = -Math.sin(ey);
          if (!lined) spawn(fx, 'pillar', P.x + cx * R, P.z + cz * R, 0, 0.12, 0.6, CORE, id, 0, 0, 0, 1.5, 0, 0, 0.75, 0.12);
          fx.linger.add('crackLine', P.x + cx * R * 0.5, P.z + cz * R * 0.5, R * 0.5, ey, DEEP);
        }
        spawn(fx, 'crescent', P.x, P.z, yaw, R, 0.36, PALE, id, arc, 0.88, 1, 1, 0.18);
        fx.linger.add('scratches', P.x + Math.cos(yaw) * R * 0.55, P.z - Math.sin(yaw) * R * 0.55, R * 0.35, yaw + Math.PI * 0.5, DEEP);
        return;
      }
      case 2: {
        // the vanish: a violet smoke twister collapsing on him, an inward ring, a dark stain left on the grass
        if (spawn(fx, 'twister', P.x, P.z, 0, 0.8, 0.42, CORE, id, 0, 0, 0, 1, 0, 0, 2.0, 0.8) < 0) spawn(fx, 'glow', P.x, P.z, 0, 1.4, 0.35, CORE, id);
        spawn(fx, 'ring', P.x, P.z, 0, 1.5, 0.35, PALE, id, 0, 0.25, 0, 1);
        shock(fx, P.x, P.z, 1.4, 0.3, DEEP, 0.9, false);
        fx.linger.add('scorch', P.x, P.z, 0.9, 0, SHADOW);
        return;
      }
      default: {
        const a = fx.abil(id, 'r');
        if (huntOn[id]) endHunt(fx, id);
        huntOn[id] = 1;
        huntAge[id] = 0;
        // the hunt ends on the hit or at the end of its sim life: travelTicks(2 × range, speed) = 30 t (+2 t slack)
        huntLife[id] = (travelTicks((a.range ?? 12000) * 2, a.speed ?? 24000) + 2) * TICK_S;
        huntLeft[id] = huntLife[id];
        huntCastAt[id] = clock;
        huntHit[id] = 0;
        huntX0[id] = P.x;
        huntZ0[id] = P.z;
        huntRange[id] = (a.range ?? 12000) / 1000;
        huntVictim[id] = -1;
        huntGlowT[id] = 0;
        RIB.x = P.x;
        RIB.z = P.z;
        huntRib[id] = fx.ribbons.point(RIB, CORE, 0.9, 0.5);
        // the howl (violet, 2.2 m, low on Med / Low: never a white sheet over the fight)
        spawn(fx, 'ring', P.x, P.z, 0, 2.2, 0.3, CORE, id, 0, 0.15, 0, 1);
        shock(fx, P.x, P.z, 2.2, 0.3, fx.relation(id) === 'enemy' ? fx.rim(id) : CORE, fx.tier === 'high' ? 0.6 : 0.4);
        spawn(fx, 'glow', P.x, P.z, 0, 1.6, 0.3, CORE, id);
        return;
      }
    }
  },

  onHit(e, fx: FxCtx) {
    const src = e.src;
    if (src < 0 || src >= MAX_IDS) return;
    if (e.kind === 'basic') {
      hitVictim[src] = e.dst;
      hitAt[src] = clock;
      if (clock - rakeAt[src] <= PAIR_S && rakeKind[src] >= 0) {
        drawRake(fx, src, rakeKind[src], e.dst);
        rakeKind[src] = -1;
      }
      if (isHero(fx, e.dst) && allyNear(fx, src, e.dst)) drawFlank(fx, src, e.dst);
      return;
    }
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, D)) return;
    if (lastSlot[src] === 0) {
      // Jeer Slash: an X cut on each unit the dash passes
      const y = dashYaw[src];
      // a standing X cut at the victim's chest (Low: the ground beams)
      if (!clawX(fx, D.x, D.z, 0.45, 0.26, PALE, CORE)) {
        beamAt(fx, D.x, D.z, y + Math.PI * 0.25, 1.5, 0.16, 0.28, PALE, src);
        beamAt(fx, D.x, D.z, y - Math.PI * 0.25, 1.5, 0.16, 0.28, CORE, src, 0.03);
      }
      if (dashRecast[src] && (fx.abil(src, 'q').slowBp ?? 0) > 0) {
        fx.linger.add('scorch', D.x, D.z, 0.75, y, DEEP);
        spawn(fx, 'glow', D.x, D.z, 0, 0.9, 0.5, DEEP, src);
      }
      return;
    }
    // the maul: an R hit inside the hunt's sim life, once per cast (the hunt may outlast its ribbon on a long chase)
    if (lastSlot[src] === 3 && !huntHit[src] && clock - huntCastAt[src] <= huntLife[src]) {
      huntHit[src] = 1;
      endHunt(fx, src);
      const yaw = fx.heroPos(src, P) ? yawTo(P.x, P.z, D.x, D.z) : 0;
      const enemy = fx.relation(src) === 'enemy';
      const hot = enemy ? fx.rim(src) : CORE;
      const low = fx.tier !== 'high';
      // the claw X on the victim's body, big; Low: two ground beams
      if (!clawX(fx, D.x, D.z, 0.75, 0.32, PALE, CORE)) {
        beamAt(fx, D.x, D.z, yaw + 0.75, 2.2, 0.3, 0.3, CORE, src);
        beamAt(fx, D.x, D.z, yaw - 0.75, 2.2, 0.3, 0.3, DEEP, src, 0.05);
      }
      // kept small and short so enemy ground telegraphs under the fight stay readable
      spawn(fx, 'ring', D.x, D.z, 0, 2.2, 0.3, enemy ? DEEP : CORE, src, 0, 0.15, 0, 1);
      shock(fx, D.x, D.z, 2.2, 0.28, hot, low ? 0.4 : 0.6);
      spawn(fx, 'pillar', D.x, D.z, 0, 0.6, 0.25, CORE, src, 0, 0, 0, 1, 0, 0, 2.4, 0.6);
      fx.linger.add('crackStar', D.x, D.z, 1.2, yaw, CORE);
      fx.linger.add('scratches', D.x, D.z, 0.8, yaw + Math.PI * 0.5, DEEP);
      fx.particles.debris(D.x, D.z, 1);
      const me: Relation3 = 'own';
      if (fx.relation(src) === me || fx.relation(e.dst) === me) {
        fx.cam.tier(3);
        if (fx.relation(src) === me) fx.cam.punch(0.05);
      }
    }
  },

  onMarker(id, clipId, marker, fx: FxCtx) {
    if (id < 0 || id >= MAX_IDS) return;
    let kind = -1;
    switch (marker) {
      case 'contact':
        if (clipId === 'cacklejaw.basicA' || clipId === 'cacklejaw.flankA') kind = RAKE_L;
        else if (clipId === 'cacklejaw.basicB' || clipId === 'cacklejaw.flankB') kind = RAKE_R;
        else if (clipId === 'cacklejaw.basicC' || clipId === 'cacklejaw.flankC') kind = RAKE_SPIN;
        else if (clipId === 'cacklejaw.pounce') kind = RAKE_POUNCE;
        break;
      case 'flank':
        if (clock - hitAt[id] <= PAIR_S) drawFlank(fx, id, hitVictim[id]);
        return;
      case 'qLand':
        if (fx.heroPos(id, P)) {
          spawn(fx, 'ring', P.x, P.z, 0, 1.1, 0.25, CORE, id, 0, 0.35, 0, 0.7);
          fx.linger.add('scratches', P.x, P.z, 0.5, dashYaw[id] + Math.PI * 0.5, CORE);
        }
        return;
      case 'q2Land':
        if (fx.heroPos(id, P)) {
          const y = dashYaw[id];
          spawn(fx, 'crescent', P.x, P.z, y + 0.35, 1.5, 0.28, PALE, id, 1.3, 0.88, 1, 1);
          spawn(fx, 'crescent', P.x, P.z, y - 0.35, 1.5, 0.28, CORE, id, 1.3, 0.88, -1, 1, 0.03);
          spawn(fx, 'ring', P.x, P.z, 0, 1.4, 0.3, CORE, id, 0, 0.3, 0, 0.8);
        }
        return;
      case 'eDive':
        // he is stealthed by now: enemies never see where he went (§9 rule 7)
        if (fx.relation(id) !== 'enemy' && fx.heroPos(id, P)) spawn(fx, 'ring', P.x, P.z, 0, 0.9, 0.22, CORE, id, 0, 0.3, 0, 0.8);
        return;
      default:
        return;
    }
    if (kind < 0) return;
    if (clock - hitAt[id] <= PAIR_S) {
      drawRake(fx, id, kind, hitVictim[id]);
      hitAt[id] = -9;
    } else {
      rakeKind[id] = kind;
      rakeAt[id] = clock;
    }
  },

  update(dt: number, fx: FxCtx) {
    clock += dt;
    for (let id = 0; id < MAX_IDS; id++) {
      // a rake marker whose hit never came (a feint, a whiff): draw it toward the striking paw
      if (rakeKind[id] >= 0 && clock - rakeAt[id] > PAIR_S) {
        drawRake(fx, id, rakeKind[id], -1);
        rakeKind[id] = -1;
      }
      if (dashOn[id]) {
        dashLeft[id] -= dt;
        if (dashRib[id] >= 0 && fx.heroPos(id, P)) fx.ribbons.feed(dashRib[id], P.x, 0.12, P.z);
        if (dashLeft[id] <= 0) endDash(fx, id);
      }
      if (huntOn[id]) {
        huntLeft[id] -= dt;
        huntAge[id] += dt;
        if (huntRib[id] >= 0 && fx.heroPos(id, P)) fx.ribbons.feed(huntRib[id], P.x, 0.15, P.z);
        if (huntVictim[id] < 0 && huntAge[id] >= 2 * TICK_S) {
          huntVictim[id] = findVictim(fx, id);
          if (huntVictim[id] >= 0) drawSigil(fx, id, huntVictim[id], Math.max(0.2, huntLeft[id]));
        }
        // the mark follows the hunted hero: a soft glow re-laid under it every 80 ms
        huntGlowT[id] -= dt;
        if (huntVictim[id] >= 0 && huntGlowT[id] <= 0 && fx.heroPos(huntVictim[id], D)) {
          huntGlowT[id] = 0.08;
          spawn(fx, 'glow', D.x, D.z, 0, 1.0, 0.16, DEEP, id);
        }
        if (huntLeft[id] <= 0) endHunt(fx, id);
      }
    }
  },
};
