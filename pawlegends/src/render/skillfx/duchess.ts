/**
 * Duchess skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.3 "Moves and VFX"): shed fur, a royal purple
 * glare and a crown.
 *
 * - Basic: a small "hmph" puff of fur on the victim (the bolt itself is projectileView's look).
 * - Q Fluff Puff: a soft ground strip of the skillshot width riding the fluffball at the sim speed to its range (the
 *   dodge width from the iso camera; the ball pierces, so it never ends early), and a fur burst on every unit it hits.
 * - W Not Amused: a purple glint at her eyes for exactly the windup, then the glare wedge over the exact cone (range,
 *   arc) for a blink and a slower fading rim.
 * - E Cushion Glide: the fur cloud at the take-off point: a soft disc and rim at exactly the sim radius for exactly the
 *   cloud's life (ttl), with a little puff ring on each of its slow pulses (every), and a fur trail on the landing.
 * - R Royal Decree: a crown gathering over her head through the windup, then on the cast a crown wave: a ring at
 *   exactly the sim radius with five upright crown points round it and a purple sweep.
 * - Snub (Utter Disdain): a hero the snapshot shows newly Stunned shortly after one of her ability hits gets the
 *   "hmph" puff and a ring of stars over its head. The Disdain count pips (0–3 crowns over the enemy plate) are the
 *   overhead's job (EntitySnap.stacks); this set only marks the Snub.
 *
 * Colours: the shared additive shader brightens toward white, so the purple and fur bases are dark (ROYAL, GLARE, FUR)
 * with intensity (p3) 0.5–0.7. No gold: gold is "you" (the rim already carries it on her own casts).
 *
 * Shapes use the talent-resolved numbers (fx.abil). Enemy effects take the danger rim (fx.rim). Everything is pooled:
 * no allocation per event or per frame. Render only.
 */
import { stubFx } from '../anim/common';
import { TICK_S } from '../anim/timing';
import { CAPS } from '../../data/map';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Relation3, SkillFxSet } from '../anim/types';

const ROYAL = 0x4a1a8a;
const GLARE = 0x7a28d0;
const FUR = 0x8a8078;
const STAR = 0xb0a0e0;
/** Intensity (p3): low enough that the additive shader keeps the purple. */
const FI = 0.6;
/** BuffFlag.Stunned (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
const TAU = Math.PI * 2;
/** A Snub shows only on a stun this soon after one of her ability hits on that hero (s). */
const SNUB_WINDOW = 0.35;

// ------------------------------------------------------------------------------------------------ pooled scratch

const P = { x: 0, y: 0, z: 0 };
const V = { x: 0, y: 0, z: 0 };
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 1, color: 0, rim: 0, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };

/** Spawn one mesh effect from the shared options object (never a new literal). */
function mesh(fx: FxCtx, kind: MeshFxKind, x: number, z: number, sx: number, life: number, color: number, rim: number, rel: Relation3, yaw = 0, y = 0.06, sy = 1, p0 = 0, p1 = 0, p2 = 0, p3 = 1, delay = 0, sz = sx): number {
  S.x = x;
  S.z = z;
  S.y = y;
  S.yaw = yaw;
  S.sx = sx;
  S.sy = sy;
  S.sz = sz;
  S.life = life;
  S.color = color;
  S.rim = rim;
  S.rel = rel;
  S.p0 = p0;
  S.p1 = p1;
  S.p2 = p2;
  S.p3 = p3;
  S.delay = delay;
  return fx.mesh.spawn(kind, S);
}

/** Facing yaw (mesh convention: forward = (cos, −sin)) from (x, z) toward the event's aim (mm, sim y up). */
function aimYaw(x: number, z: number, ex: number, ey: number, fallback: number): number {
  const dx = ex / 1000 - x;
  const dz = -ey / 1000 - z;
  return Math.abs(dx) + Math.abs(dz) < 0.01 ? fallback : Math.atan2(-dz, dx);
}

/** A puff of shed fur at (x, z): a soft glow, a small ring, a few tufts. */
function furPuff(fx: FxCtx, x: number, z: number, k: number, rim: number, rel: Relation3, y = 0.9): void {
  mesh(fx, 'glow', x, z, 0.9 * k, 0.24, FUR, rim, rel, 0, y, 1, 0, 0, 0, FI);
  mesh(fx, 'ring', x, z, 0.8 * k, 0.28, FUR, rim, rel, 0, 0.07, 1, 0, 0.35, 0, 0.5);
  fx.particles.debris(x, z, 0.35 * k);
}

// ------------------------------------------------------------------------------------------------ Q fluffballs

class Puff {
  on = false;
  owner = -1;
  x0 = 0;
  z0 = 0;
  dx = 1;
  dz = 0;
  d = 0;
  max = 0;
  speed = 0;
  w = 1.4;
  nextStrip = 0;
  rel: Relation3 = 'own';
  rim = 0;
}
const PUFFS: Puff[] = [new Puff(), new Puff(), new Puff()];
/** Metres between the fluffball's ground strip segments. */
const STRIP_M = 1.0;

// ------------------------------------------------------------------------------------------------ E fur clouds

class Cloud {
  on = false;
  x = 0;
  z = 0;
  rad = 0;
  t = 0;
  life = 0;
  every = 0;
  next = 0;
  rel: Relation3 = 'own';
  rim = 0;
}
const CLOUDS: Cloud[] = [new Cloud(), new Cloud(), new Cloud()];

// ------------------------------------------------------------------------------------------------ Snub

/** Her recent ability hits on heroes: victim id and the module clock at the hit (−9 = none). */
const hitAt = new Float32Array(CAPS.heroes).fill(-9);
const hitRim = new Uint32Array(CAPS.heroes);
const hitRel: Relation3[] = new Array<Relation3>(CAPS.heroes).fill('own');
let clock = 0;
/** Snubs drawn (tests). */
let snubs = 0;

/** The Snub: a "hmph" puff and a ring of stars over the victim's head. */
function snub(fx: FxCtx, id: number): void {
  if (!fx.heroPos(id, V)) return;
  const rim = hitRim[id];
  const rel = hitRel[id];
  furPuff(fx, V.x, V.z, 1.2, rim, rel, 1.6);
  mesh(fx, 'ring', V.x, V.z, 0.7, 0.75, STAR, rim, rel, 0, 2.2, 1, 0, 0.55, 0, 1);
  mesh(fx, 'crescent', V.x, V.z, 0.6, 0.75, STAR, rim, rel, 0, 2.25, 1, TAU, 0.75, 1, 1, 0.05);
  snubs++;
}

// ------------------------------------------------------------------------------------------------ R crown

/** The crown wave: a ring at exactly `rad`, five upright crown points round it, a purple sweep. */
function crownWave(fx: FxCtx, x: number, z: number, rad: number, yaw: number, rim: number, rel: Relation3): void {
  mesh(fx, 'ring', x, z, rad, 0.5, ROYAL, rim, rel, yaw, 0.07, 1, 0, 0.1, 0, 0.7);
  mesh(fx, 'arc', x, z, rad, 0.7, GLARE, rim, rel, yaw, 0.05, 1, TAU, Math.max(0.8, 1 - 0.25 / rad), 1, FI);
  mesh(fx, 'crescent', x, z, rad * 0.9, 0.35, GLARE, rim, rel, yaw, 0.08, 1, TAU, 0.7, 1, FI);
  const n = fx.tier === 'low' ? 5 : 10;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i * TAU) / n;
    // every other point is a tall crown spike (Med / High), Low draws only the five tall ones
    const tall = fx.tier === 'low' || i % 2 === 0;
    mesh(fx, 'pillar', x + Math.cos(a) * rad * 0.97, z - Math.sin(a) * rad * 0.97, tall ? 0.24 : 0.14, 0.55, ROYAL, rim, rel, 0, 0.02, tall ? 1.6 : 0.8, 0, 0, 0, FI, 0.02);
  }
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('duchess'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const life = e.ticks * TICK_S;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.slot === 1) {
      // Not Amused: the glint at her eyes for exactly the windup
      const y = fx.bonePos(e.src, 'head', V) ? V.y + 0.2 : 2.0;
      mesh(fx, 'glow', P.x, P.z, 0.5, life, GLARE, rim, rel, 0, y, 1, 0, 0, 0, FI);
    } else if (e.slot === 3) {
      // Royal Decree: the crown gathers over her head through the windup
      mesh(fx, 'glow', P.x, P.z, 1.0, life + 0.05, ROYAL, rim, rel, 0, 3.0, 1, 0, 0, 0, FI);
      mesh(fx, 'ring', P.x, P.z, 0.55, life + 0.05, GLARE, rim, rel, 0, 3.0, 1, 0, 0.6, 0, 1);
      mesh(fx, 'arc', P.x, P.z, 1.2, life, ROYAL, rim, rel, 0, 0.05, 1, TAU, 0.85, 1, 0.5);
    }
  },

  onCast(e, fx, _ctx: MoveCtx) {
    if (!fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    const yaw = aimYaw(P.x, P.z, e.x, e.y, 0);
    const cx = Math.cos(yaw);
    const cz = -Math.sin(yaw);
    switch (e.slot) {
      case 0: {
        const a = fx.abil(e.src, 'q');
        mesh(fx, 'crescent', P.x, P.z, 1.6, 0.26, FUR, rim, rel, yaw, 0.08, 1, 1.6, 0.4, 1, FI);
        furPuff(fx, P.x + cx * 0.8, P.z + cz * 0.8, 0.8, rim, rel);
        let b: Puff | null = null;
        for (const c of PUFFS) if (!c.on) b = c;
        if (!b) b = PUFFS[0];
        b.on = true;
        b.owner = e.src;
        b.x0 = P.x;
        b.z0 = P.z;
        b.dx = cx;
        b.dz = cz;
        b.d = 0;
        b.max = (a.range ?? 7500) / 1000;
        b.speed = (a.speed ?? 9000) / 1000;
        b.w = (a.width ?? 1400) / 1000;
        b.nextStrip = 0;
        b.rel = rel;
        b.rim = rim;
        fx.sfx.cue('balloon', P);
        return;
      }
      case 1: {
        // the glare: the exact cone for a blink, then a slower purple rim
        const a = fx.abil(e.src, 'w');
        const range = (a.range ?? 5000) / 1000;
        const arc = ((a.arc ?? 910) / 4096) * TAU;
        mesh(fx, 'arc', P.x, P.z, range, 0.2, GLARE, rim, rel, yaw, 0.09, 1, arc, 0.1, 1, 0.95);
        mesh(fx, 'crescent', P.x, P.z, range, 0.4, GLARE, rim, rel, yaw, 0.1, 1, arc, 0.55, 1, 0.85);
        mesh(fx, 'arc', P.x, P.z, range, 0.45, ROYAL, rim, rel, yaw, 0.06, 1, arc, Math.max(0.85, 1 - 0.25 / range), 1, FI);
        if (rel === 'own') fx.cam.tier(1);
        return;
      }
      case 2: {
        // the fur cloud where she took off, at the sim radius for the cloud's life
        const a = fx.abil(e.src, 'e');
        let c: Cloud | null = null;
        for (const k of CLOUDS) if (!k.on) c = k;
        if (!c) c = CLOUDS[0];
        c.on = true;
        c.x = P.x;
        c.z = P.z;
        c.rad = (a.radius ?? 2200) / 1000;
        c.life = (a.ttl ?? 75) * TICK_S;
        c.every = Math.max(1, a.every ?? 15) * TICK_S;
        c.t = 0;
        c.next = 0;
        c.rel = rel;
        c.rim = rim;
        mesh(fx, 'glow', c.x, c.z, c.rad, c.life, FUR, rim, rel, 0, 0.06, 1, 0, 0, 0, 0.35);
        mesh(fx, 'arc', c.x, c.z, c.rad, c.life, FUR, rim, rel, yaw, 0.05, 1, TAU, Math.max(0.8, 1 - 0.2 / c.rad), 1, FI);
        furPuff(fx, c.x, c.z, 1.4, rim, rel, 0.5);
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        crownWave(fx, P.x, P.z, (a.radius ?? 6000) / 1000, yaw, rim, rel);
        mesh(fx, 'glow', P.x, P.z, 1.6, 0.3, GLARE, rim, rel, 0, 1.4, 1, 0, 0, 0, FI);
        if (rel === 'own') fx.cam.tier(2);
        fx.sfx.cue('gong', P);
        return;
      }
    }
  },

  onHit(e, fx, _ctx: MoveCtx) {
    if (!fx.heroPos(e.dst, V)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.kind === 'basic') {
      furPuff(fx, V.x, V.z, 0.6, rim, rel);
      return;
    }
    if (e.kind !== 'ability') return;
    if (e.dst >= 0 && e.dst < CAPS.heroes) {
      hitAt[e.dst] = clock;
      hitRim[e.dst] = rim;
      hitRel[e.dst] = rel;
    }
    // the fluffball's fur burst on whatever it rolls through (a live ball of hers near the victim)
    for (const b of PUFFS) {
      if (!b.on || b.owner !== e.src) continue;
      const bx = b.x0 + b.dx * b.d;
      const bz = b.z0 + b.dz * b.d;
      if (Math.hypot(V.x - bx, V.z - bz) > b.w + 1.2) continue;
      furPuff(fx, V.x, V.z, 1, rim, rel);
      return;
    }
  },

  onStatus(id, gained, _lost, fx) {
    if ((gained & STUNNED) === 0 || id < 0 || id >= CAPS.heroes) return;
    if (clock - hitAt[id] > SNUB_WINDOW) return;
    hitAt[id] = -9;
    snub(fx, id);
  },

  onMarker(id, _clip, marker, fx) {
    if (marker.charCodeAt(0) !== 100 || marker.charCodeAt(1) !== 58) return; // only the clips' 'd:' fx cues
    if (!fx.heroPos(id, P)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    switch (marker) {
      case 'd:puff':
        if (fx.bonePos(id, 'pawR', V)) mesh(fx, 'glow', V.x, V.z, 0.5, 0.2, FUR, rim, rel, 0, V.y, 1, 0, 0, 0, FI);
        return;
      case 'd:fur':
        furPuff(fx, P.x, P.z, 1, rim, rel, 0.4);
        return;
      case 'd:crown':
        mesh(fx, 'ring', P.x, P.z, 0.5, 0.4, GLARE, rim, rel, 0, 3.0, 1, 0, 0.6, 0, 1);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    clock += dt;
    for (const b of PUFFS) {
      if (!b.on) continue;
      b.d += b.speed * dt;
      if (b.d >= b.max) {
        b.on = false;
        continue;
      }
      // the ground strip of the skillshot width under the ball (the dodge width from the iso camera)
      while (b.nextStrip + STRIP_M <= b.d) {
        mesh(fx, 'beam', b.x0 + b.dx * b.nextStrip, b.z0 + b.dz * b.nextStrip, STRIP_M, fx.tier === 'low' ? 0.14 : 0.22, FUR, b.rim, b.rel, Math.atan2(-b.dz, b.dx), 0.06, 1, 0, 0, 0, 0.45, 0, b.w);
        b.nextStrip += STRIP_M;
      }
    }
    for (const c of CLOUDS) {
      if (!c.on) continue;
      c.t += dt;
      // the cloud's slow pulses from its own clock (the burst zone pulses every `every` from the cast)
      while (c.t >= c.next * c.every && c.next * c.every < c.life) {
        if (c.next > 0) mesh(fx, 'ring', c.x, c.z, c.rad * 0.85, 0.3, FUR, c.rim, c.rel, 0, 0.07, 1, 0, 0.5, 0, 0.45);
        c.next++;
      }
      if (c.t >= c.life) c.on = false;
    }
  },
};

/** Tests: how many fluffballs and fur clouds are live, and Snubs drawn so far. */
export function duchessFxLive(): { puffs: number; clouds: number; snubs: number } {
  let puffs = 0;
  let clouds = 0;
  for (const b of PUFFS) if (b.on) puffs++;
  for (const c of CLOUDS) if (c.on) clouds++;
  return { puffs, clouds, snubs };
}

/** Tests: drop every live fluffball and cloud (module state). */
export function resetDuchessFx(): void {
  for (const b of PUFFS) b.on = false;
  for (const c of CLOUDS) c.on = false;
  hitAt.fill(-9);
  clock = 0;
  snubs = 0;
}
