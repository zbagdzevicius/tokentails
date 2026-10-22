/**
 * Sir Brutus skill FX (ANIM-SPEC §14 "Sir Brutus", §7, §9). Sand core, gold accents, the relation rim on every mesh
 * (an enemy Brutus reads danger red). Every gameplay shape uses the sim numbers from `fx.abil` (talent- and
 * branch-resolved) and ends with the sim state:
 *
 * - Q Shield Slam: a double sand ring at exactly the radius (Wide Slam 3.8 m), a dust dome, a crown of sand spikes
 *   just inside the edge, radial crack glyphs (doubled with Heavy Slam), a shockwave wall and debris.
 * - W Front Guard: a gold tower-shield wall (the 120° arc at the 1.8 m reach, 1.2 m tall) plus a solid gold band on
 *   the ground at the reach, re-drawn every ~50 ms at his position so it never trails or doubles, for exactly the
 *   duration (Bulwark 105 t). It faces the SIM facing (the aim on the cast, then his movement direction and his basic
 *   targets, as the sim updates `facing`), never the animated head, so the drawn arc is the arc that blocks. The last
 *   500 ms dim on alternate refreshes, never vanish. Guard Post (branch): a ground band at the dome radius from the cast
 *   tick for exactly the 60 t, the hex dome flash, the slam on the plant, shimmers to the last tick, the shatter.
 * - E Pug Charge: bull-horn ribbons from both shoulders, a launch crater, the dust streak along the path actually
 *   travelled (snapshot positions, not the aim), and the impact burst on the first hero. The sim always dashes the full
 *   5 m, so the wake runs for the full travel whatever the aim distance.
 * - R Champion's Challenge: a ground band on the 6 m edge for the whole duration on every tier (the boundary is
 *   gameplay), sand obelisks (1.4 m, each on a crater) erupting round it over 300 ms, a gold chain from Brutus to the
 *   challenged hero for exactly the duration (Arena of Honour 120 t), his own 2.5 m slam (R deals no area damage), the
 *   crumble at the end; Rally Howl adds the howl rings.
 * - Passive Honour: the spinning shield bash's gold shine sweep.
 *
 * Pooled and allocation-free per frame: fixed records, one reused spawn option object, scratch vectors. Render only.
 */
import { stubFx } from '../anim/common';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Relation3, SkillFxSet, V3Out } from '../anim/types';
import { DASH_SPEED, TICK_S, travelTicks } from '../anim/timing';

const SAND = 0xffd9a0;
const GOLD = 0xffd34d;
const DUST = 0xe8c48a;
const SHINE = 0xfff1b0;
const SAND_HEX = '#ffd9a0';
const GOLD_HEX = '#ffd34d';
const TAU = Math.PI * 2;

/** Record kinds. */
const enum K {
  None = 0,
  Wall = 1,
  Post = 2,
  Arena = 3,
  Charge = 4,
}

/** One sustained effect (a guard wall, a dome, an arena, a charge). Fixed pool, reused. */
class Rec {
  kind = K.None;
  src = -1;
  tgt = -1;
  t0 = 0;
  end = 0;
  next = 0;
  next2 = 0;
  cx = 0;
  cz = 0;
  /** Arena: obelisk angle offset (rad); Wall: the arc (rad). */
  ax = 0;
  /** Arena: the aim point (the chain's end when the target has no live position). */
  aimX = 0;
  az = 0;
  r = 0;
  n = 0;
  /** Refresh counter (alternates the ground band's bright end; the wall's last-500 ms dimming). */
  tog = 0;
  /** Wall: the sim facing it tracks (mesh yaw, rad) and the position it was last updated from. */
  yaw = 0;
  px = 0;
  pz = 0;
  /** Wall: render time of the last refresh (sizes the overlap at low frame rates). */
  last = 0;
  zone = -1;
  ribA = -1;
  ribB = -1;
}

const MAX = 6;
const recs: Rec[] = [];
for (let i = 0; i < MAX; i++) recs.push(new Rec());
/** Last cast slot per caster id (0..15), to route ability hits (Q victims vs the E impact). */
const lastSlot = new Int8Array(16).fill(-1);
const lastCastAt = new Float64Array(16);

let clock = 0;
let lastZone = -1;
let lastZoneAt = -9;

const _p: V3Out = { x: 0, y: 0, z: 0 };
const _q: V3Out = { x: 0, y: 0, z: 0 };
const _a: V3Out = { x: 0, y: 0, z: 0 };
const _b: V3Out = { x: 0, y: 0, z: 0 };
const S: MeshFxSpawn = { x: 0, z: 0, sx: 1, life: 1, color: 0, rim: 0, rel: 'own' };
const SHOCK = { r1: 3, dur: 0.3, color: SAND_HEX, height: 0.5, intensity: 1.2 };

/** Spawn one mesh effect through the reused option object (every optional field reset each call). */
function spawn(fx: FxCtx, kind: MeshFxKind, x: number, z: number, sx: number, life: number, color: number, rim: number, rel: Relation3, y = 0.06, yaw = 0, sy = 1, sz = sx, p0 = 0, p1 = 0, p2 = 0, p3 = 1, delay = 0): number {
  S.x = x;
  S.y = y;
  S.z = z;
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

function shock(fx: FxCtx, x: number, z: number, r1: number, dur: number, color: string, height: number): void {
  _q.x = x;
  _q.y = 0;
  _q.z = z;
  SHOCK.r1 = r1;
  SHOCK.dur = dur;
  SHOCK.color = color;
  SHOCK.height = height;
  fx.shock.start(_q, SHOCK);
}

/**
 * World yaw (the mesh FX convention: +x rotated by yaw → (cos, −sin)) Brutus faces: head → muzzle, as Clem's FX reads
 * it (the shoulder cross product pointed backwards on this rig). NaN if unknown.
 */
function facingYaw(fx: FxCtx, id: number): number {
  // the drawn sim facing (FxCtx.facing), which no clip twist or spin turns; head → muzzle without it (tests)
  if (fx.facing?.(id, _a)) return Math.atan2(-_a.z, _a.x);
  if (!fx.bonePos(id, 'head', _a) || !fx.bonePos(id, 'mouth', _b)) return NaN;
  const dx = _b.x - _a.x;
  const dz = _b.z - _a.z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-4) return NaN;
  return Math.atan2(-dz, dx);
}

const yawTo = (x0: number, z0: number, x1: number, z1: number): number => Math.atan2(-(z1 - z0), x1 - x0);

function take(): Rec | null {
  for (let i = 0; i < MAX; i++) if (recs[i].kind === K.None) return recs[i];
  // all busy: reuse the one ending first
  let best = recs[0];
  for (let i = 1; i < MAX; i++) if (recs[i].end < best.end) best = recs[i];
  return best;
}

/** End a record now, with its closing flourish. */
function finish(r: Rec, fx: FxCtx): void {
  const rel = fx.relation(r.src);
  const rim = fx.rim(r.src);
  switch (r.kind) {
    case K.Post: {
      // the dome shatters: a last bright shell, an outward ring, shards of debris round the rim
      spawn(fx, 'dome', r.cx, r.cz, r.r, 0.5, SHINE, rim, rel, 0, 0, r.r * 0.8, r.r, 0, 0, 0, 0.8);
      spawn(fx, 'ring', r.cx, r.cz, r.r, 0.45, GOLD, rim, rel, 0.07, 0, 1, r.r, 0, 0.85);
      for (let i = 0; i < 4; i++) fx.particles.debris(r.cx + Math.cos((i * TAU) / 4) * r.r * 0.7, r.cz + Math.sin((i * TAU) / 4) * r.r * 0.7, 0.5);
      fx.sfx.cue('pop', posOf(r.cx, r.cz));
      break;
    }
    case K.Arena: {
      // the obelisks crumble
      const n = r.n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r.ax;
        fx.particles.debris(r.cx + Math.cos(a) * r.r, r.cz - Math.sin(a) * r.r, 0.45);
      }
      fx.sfx.cue('pop', posOf(r.cx, r.cz));
      break;
    }
    case K.Charge:
      if (r.ribA >= 0) fx.ribbons.end(r.ribA);
      if (r.ribB >= 0) fx.ribbons.end(r.ribB);
      break;
    default:
      break;
  }
  r.kind = K.None;
  r.ribA = r.ribB = -1;
  r.zone = -1;
}

const _pos = { x: 0, z: 0 };
const posOf = (x: number, z: number): { x: number; z: number } => {
  _pos.x = x;
  _pos.z = z;
  return _pos;
};

/** Obelisk count per tier (eruption, sustain): the pillar caps are low 4, med 16, high 24 live. */
const OBELISKS = { low: [4, 2], med: [8, 7], high: [12, 10] } as const;

/** The arena obelisks: a ring of sand pillars just inside the sim radius (dressing never passes it). */
function obelisks(fx: FxCtx, r: Rec, n: number, life: number, height: number, stagger: number, p3: number): void {
  const rel = fx.relation(r.src);
  const rim = fx.rim(r.src);
  const w = 0.32;
  const R = r.r - w - 0.02;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.ax;
    spawn(fx, 'pillar', r.cx + Math.cos(a) * R, r.cz - Math.sin(a) * R, w, life, SAND, rim, rel, 0, 0, height, w, 0, 0, 0, p3, (stagger * i) / n);
  }
}

/**
 * A solid ground band at radius R (width `w` m) over the arc `arc` centred on `yaw`. The arc shader is brightest at one
 * end (p2 picks which), so refreshes alternate the end and overlap: both ends read lit.
 */
function band(fx: FxCtx, r: Rec, x: number, z: number, R: number, w: number, arc: number, yaw: number, life: number, color: number, p3: number): void {
  r.tog ^= 1;
  spawn(fx, 'arc', x, z, R, life, color, fx.rim(r.src), fx.relation(r.src), 0.065, yaw, 1, R, arc, Math.max(0, 1 - w / R), r.tog ? 1 : -1, p3);
}

/** Wall refresh spacing (s) and the minimum life of each copy (longer than the spacing: the copies overlap, never gap). */
const WALL_EVERY = 0.05;
const WALL_LIFE = 0.1;
/** Zone ground bands (Guard Post, the arena): refresh spacing and life (s). */
const ZONE_EVERY = 0.45;
const ZONE_LIFE = 0.9;

/** A crater glyph under each erupting obelisk (normal blending: a solid base that reads on any ground). */
function craters(fx: FxCtx, r: Rec, n: number): void {
  const R = r.r - 0.34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.ax;
    fx.linger.add('crater', r.cx + Math.cos(a) * R, r.cz - Math.sin(a) * R, 0.55, a, SAND);
  }
}

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'q');
  const R = (a.radius ?? 3000) / 1000;
  const heavy = (a.slowBp ?? 0) >= 4500;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  const x = _p.x;
  const z = _p.z;
  // the double sand ring at exactly the radius
  spawn(fx, 'ring', x, z, R, 0.42, SAND, rim, rel, 0.06, 0, 1, R, 0, 0.05);
  spawn(fx, 'ring', x, z, R, 0.5, GOLD, rim, rel, 0.07, 0, 1, R, 0, 0.35, 0, 0.7, 0.07);
  // dust dome kicked up by the shield, the impact glow
  spawn(fx, 'dome', x, z, 1.25, 0.38, DUST, rim, rel, 0, 0, 0.85, 1.25, 0, 0, 0, 0.7);
  spawn(fx, 'glow', x, z, 1.9, 0.25, GOLD, rim, rel);
  // a crown of sand spikes just inside the edge, erupting round the ring
  const n = fx.tier === 'low' ? 4 : fx.tier === 'med' ? 8 : 12;
  const w = 0.16;
  const Rs = R - w - 0.05;
  const off = (id % 7) * 0.37;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU + off;
    spawn(fx, 'pillar', x + Math.cos(t) * Rs, z - Math.sin(t) * Rs, w, 0.4, SAND, rim, rel, 0, 0, heavy ? 1.25 : 0.95, w, 0, 0, 0, 1, (0.09 * i) / n);
  }
  // radial cracks (Heavy Slam: doubled and longer), the crack star under the shield
  fx.linger.add('crackStar', x, z, heavy ? 1.5 : 1.15, off, SAND);
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * TAU + off + 0.26;
    const len = R * (heavy ? 0.42 : 0.36);
    const c = R * 0.18 + len;
    fx.linger.add('crackLine', x + Math.cos(t) * c, z - Math.sin(t) * c, len, t, SAND);
    if (heavy) fx.linger.add('crackLine', x + Math.cos(t + 0.12) * c * 0.8, z - Math.sin(t + 0.12) * c * 0.8, len * 0.7, t + 0.12, SAND);
  }
  shock(fx, x, z, R, 0.3, SAND_HEX, heavy ? 0.75 : 0.55);
  fx.particles.debris(x, z, heavy ? 1.5 : 1.15);
  fx.sfx.cue('bodyThud', posOf(x, z));
  fx.sfx.cue('clang', posOf(x, z), 0.7);
}

function castW(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'w');
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  const r = take();
  if (!r) return;
  r.src = id;
  r.t0 = clock;
  r.cx = _p.x;
  r.cz = _p.z;
  r.zone = -1;
  if ((a.post ?? 0) > 0) {
    // Guard Post: the dome at exactly the sim radius
    r.kind = K.Post;
    r.r = (a.postRadius ?? 3000) / 1000;
    r.end = clock + (a.postDuration ?? 60) * TICK_S;
    r.next = clock + ZONE_EVERY;
    r.next2 = clock + ZONE_EVERY;
    if (clock - lastZoneAt < 0.4) (r.zone = lastZone), (lastZone = -1);
    // the active zone reads from the cast tick (the sim dome blocks from here): the band at the radius, both ends lit
    const life = Math.min(ZONE_LIFE, r.end - clock);
    band(fx, r, r.cx, r.cz, r.r, 0.22, TAU, 0, life, GOLD, 2.2);
    band(fx, r, r.cx, r.cz, r.r, 0.22, TAU, 0, life, GOLD, 2.2);
    spawn(fx, 'dome', r.cx, r.cz, r.r, 0.55, GOLD, rim, rel, 0, 0, r.r * 0.8, r.r, 0, 0, 0, 1);
    fx.sfx.cue('fwoomp', posOf(r.cx, r.cz), 0.7);
    return;
  }
  // Front Guard: the wall band follows his facing for the duration
  r.kind = K.Wall;
  r.r = (a.radius ?? 1800) / 1000;
  r.ax = ((a.arc ?? 1365) / 4096) * TAU;
  r.end = clock + (a.duration ?? 75) * TICK_S;
  r.next = clock;
  r.last = clock;
  r.tog = 0;
  r.n = 0;
  // the sim turns him to the aim on the cast (an aim on his own spot keeps the facing he had)
  const aimed = Math.abs(e.x / 1000 - _p.x) + Math.abs(-e.y / 1000 - _p.z) > 0.05;
  const yaw0 = aimed ? yawTo(_p.x, _p.z, e.x / 1000, -e.y / 1000) : facingYaw(fx, id);
  r.yaw = yaw0 === yaw0 ? yaw0 : 0;
  r.px = _p.x;
  r.pz = _p.z;
  // the raise: a taller bright wall and a wide gold flash on the ground at the reach
  spawn(fx, 'wall', r.cx, r.cz, r.r, 0.35, SHINE, rim, rel, 0, r.yaw, 1.6, r.r, r.ax, 0, 0, 2.5);
  spawn(fx, 'arc', r.cx, r.cz, r.r, 0.4, GOLD, rim, rel, 0.06, r.yaw, 1, r.r, r.ax, 0.75, 1, 1.2);
  fx.sfx.cue('clang', posOf(r.cx, r.cz));
}

function castE(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'e');
  const r = take();
  if (!r) return;
  // the sim always dashes the full distance (only the aim's angle is used; walls clip it)
  const dist = a.dash ?? 5000;
  r.kind = K.Charge;
  r.src = id;
  r.t0 = clock;
  r.cx = _p.x;
  r.cz = _p.z;
  r.end = clock + travelTicks(dist, DASH_SPEED) * TICK_S + 0.12;
  r.next = clock;
  r.zone = -1;
  // bull-horn ribbons from both shoulders (none on Low: no ribbon slots)
  const col = SAND;
  r.ribA = fx.bonePos(id, 'shoulderL', _a) ? fx.ribbons.point(_a, col, 0.32, 0.28) : -1;
  r.ribB = fx.bonePos(id, 'shoulderR', _b) ? fx.ribbons.point(_b, col, 0.32, 0.28) : -1;
}

function castR(e: { src: number; x: number; y: number; target: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'r');
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  const r = take();
  if (!r) return;
  r.kind = K.Arena;
  r.src = id;
  r.tgt = e.target >= 0 && e.target < 255 && fx.heroPos(e.target, _q) ? e.target : -1;
  r.t0 = clock;
  r.cx = _p.x;
  r.cz = _p.z;
  // no live target position (the gallery): the chain holds the aim point
  r.az = -e.y / 1000;
  r.ax = yawTo(_p.x, _p.z, e.x / 1000, -e.y / 1000);
  r.aimX = e.x / 1000;
  r.r = (a.ringRadius ?? 6000) / 1000;
  r.end = clock + (a.duration ?? 90) * TICK_S;
  r.next = clock + 0.45;
  r.next2 = clock;
  r.last = clock + ZONE_EVERY;
  r.zone = -1;
  if (clock - lastZoneAt < 0.4) (r.zone = lastZone), (lastZone = -1);
  const tier = OBELISKS[fx.tier];
  r.n = tier[1];
  // the arena edge (gameplay) on every tier, from the cast tick: the band at the ring radius, both ends lit
  const life = Math.min(ZONE_LIFE, r.end - clock);
  band(fx, r, r.cx, r.cz, r.r, 0.25, TAU, 0, life, GOLD, 2.2);
  band(fx, r, r.cx, r.cz, r.r, 0.25, TAU, 0, life, GOLD, 2.2);
  // the eruption: obelisks round the edge staggered over 300 ms, each on its crater, a gold wave out to the edge
  obelisks(fx, r, tier[0], 0.9, 1.4, 0.3, rel === 'own' ? 1 : 0.55);
  craters(fx, r, tier[0]);
  spawn(fx, 'ring', r.cx, r.cz, r.r, 0.55, GOLD, rim, rel, 0.07, 0, 1, r.r, 0, 0.02);
  spawn(fx, 'glow', r.cx, r.cz, 2.4, 0.35, GOLD, rim, rel);
  shock(fx, r.cx, r.cz, r.r, 0.35, GOLD_HEX, 0.9);
  fx.sfx.cue('gong', posOf(r.cx, r.cz));
  fx.sfx.cue('chain', posOf(r.cx, r.cz));
}

// ------------------------------------------------------------------------------------------------ sustained

function wallTick(r: Rec, fx: FxCtx): void {
  if (!fx.heroPos(r.src, _p)) return;
  // the sim facing: it turns to his movement direction while he walks (basic targets turn it in onHit)
  const mx = _p.x - r.px;
  const mz = _p.z - r.pz;
  if (mx * mx + mz * mz > 0.0064) {
    r.yaw = yawTo(r.px, r.pz, _p.x, _p.z);
    r.px = _p.x;
    r.pz = _p.z;
  }
  if (clock < r.next) return;
  const left = r.end - clock;
  // each copy outlives the measured refresh gap (a slow frame stretches it), so the wall never gaps
  const gap = clock - r.last;
  r.last = clock;
  r.next = clock + WALL_EVERY;
  const life = Math.min(Math.max(WALL_LIFE, gap * 1.6), 0.3, left + 0.02);
  if (life <= 0.02) return;
  // the last 500 ms: alternate pairs of refreshes dim to 35% (a flicker that never leaves the guard undrawn)
  const dim = left < 0.5 && ((r.n++ >> 1) & 1) === 1 ? 0.35 : 1;
  const rim = fx.rim(r.src);
  const rel = fx.relation(r.src);
  // the standing shield wall (1.2 m) and its solid gold band on the ground at the reach (what reads from the game
  // camera; on Low, which has no wall slots, the band carries the guard alone)
  spawn(fx, 'wall', _p.x, _p.z, r.r, life, GOLD, rim, rel, 0, r.yaw, 1.2, r.r, r.ax, 0, 0, 2.6 * dim);
  band(fx, r, _p.x, _p.z, r.r, 0.24, r.ax, r.yaw, life, SHINE, 2.6 * dim);
}

function postTick(r: Rec, fx: FxCtx): void {
  const left = r.end - clock;
  if (left <= 0.03) return;
  // the ground band at the dome radius, its last copy ending on the dome's last tick
  if (clock >= r.next2) {
    r.next2 = clock + ZONE_EVERY;
    band(fx, r, r.cx, r.cz, r.r, 0.22, TAU, 0, Math.min(ZONE_LIFE, left), GOLD, 2.2);
  }
  // the hex shimmer, the same rule (its last copy fades out on the last tick)
  if (clock >= r.next) {
    r.next = clock + ZONE_EVERY;
    spawn(fx, 'dome', r.cx, r.cz, r.r, Math.min(ZONE_LIFE, left), SAND, fx.rim(r.src), fx.relation(r.src), 0, 0, r.r * 0.8, r.r, 0, 0, 0, 0.55);
  }
}

function arenaTick(r: Rec, fx: FxCtx): void {
  const rel = fx.relation(r.src);
  const rim = fx.rim(r.src);
  // the edge band, its last copy ending on the arena's last tick
  const left = r.end - clock;
  if (clock >= r.last && left > 0.03) {
    r.last = clock + ZONE_EVERY;
    band(fx, r, r.cx, r.cz, r.r, 0.25, TAU, 0, Math.min(ZONE_LIFE, left), GOLD, 2.2);
  }
  // sustained obelisks (a slow throb; faint on others' arenas so the telegraphs inside stay clear), the last refresh
  // fading out on the arena's last tick
  if (clock >= r.next && clock + 0.9 <= r.end) {
    r.next = clock + 0.5;
    obelisks(fx, r, r.n, 0.9, 1.2, 0, rel === 'own' ? 0.35 : 0.2);
  }
  // the chain: Brutus → the challenged hero, refreshed every 100 ms from the live positions
  if (clock >= r.next2) {
    r.next2 = clock + 0.1;
    if (!fx.heroPos(r.src, _p)) return;
    let tx = r.aimX;
    let tz = r.az;
    if (r.tgt >= 0 && fx.heroPos(r.tgt, _q)) {
      tx = _q.x;
      tz = _q.z;
    }
    const len = Math.hypot(tx - _p.x, tz - _p.z);
    if (len < 0.3) return;
    const life = Math.min(0.17, r.end - clock);
    if (life <= 0.02) return;
    const yaw = yawTo(_p.x, _p.z, tx, tz);
    // Low has no chain slots (Med 2): a thin gold beam carries the tether instead
    if (spawn(fx, 'chain', _p.x, _p.z, len, life, GOLD, rim, rel, 1.0, yaw, 1, 0.28, len / 0.32, 0, 0, 1) < 0) spawn(fx, 'beam', _p.x, _p.z, len, life, GOLD, rim, rel, 1.0, yaw, 1, 0.16);
  }
}

function chargeTick(r: Rec, fx: FxCtx): void {
  const id = r.src;
  if (r.ribA >= 0 && fx.bonePos(id, 'shoulderL', _a)) fx.ribbons.feed(r.ribA, _a.x, _a.y + 0.18, _a.z);
  if (r.ribB >= 0 && fx.bonePos(id, 'shoulderR', _b)) fx.ribbons.feed(r.ribB, _b.x, _b.y + 0.18, _b.z);
  // dust wake every 60 ms
  if (clock >= r.next && fx.heroPos(id, _p)) {
    r.next = clock + 0.06;
    fx.particles.debris(_p.x, _p.z, 0.22);
  }
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('brutus'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onCast(e, fx) {
    if (e.src >= 0 && e.src < 16) {
      lastSlot[e.src] = e.slot;
      lastCastAt[e.src] = clock;
    }
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

  onHit(e, fx, ctx: MoveCtx) {
    const id = e.src;
    if (!fx.heroPos(e.dst, _q)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    if (e.kind === 'basic') {
      // the sim turned him to this target for the swing: the guard wall turns with him
      const w = find(id, K.Wall);
      if (w && fx.heroPos(id, _p)) {
        w.yaw = yawTo(_p.x, _p.z, _q.x, _q.z);
        w.px = _p.x;
        w.pz = _p.z;
      }
      // a small sand burst on the victim; the Honour bash adds a gold one
      spawn(fx, 'ring', _q.x, _q.z, 0.9, 0.22, (ctx.buffs & SHIELDED) !== 0 ? SHINE : SAND, rim, rel, 0.07, 0, 1, 0.9, 0, 0.1, 0, 0.6);
      return;
    }
    const slot = id >= 0 && id < 16 && clock - lastCastAt[id] < 1.5 ? lastSlot[id] : -1;
    if (slot === 2) {
      // Pug Charge impact: the burst on the first hero
      fx.heroPos(id, _p);
      const mx = (_p.x + _q.x) * 0.5;
      const mz = (_p.z + _q.z) * 0.5;
      spawn(fx, 'ring', _q.x, _q.z, 2.2, 0.38, GOLD, rim, rel, 0.07, 0, 1, 2.2, 0, 0.08);
      spawn(fx, 'glow', mx, mz, 1.8, 0.25, SHINE, rim, rel);
      spawn(fx, 'crescent', _p.x, _p.z, 1.6, 0.25, SHINE, rim, rel, 0.08, yawTo(_p.x, _p.z, _q.x, _q.z), 1, 1.6, 2.2, 0.45, 1, 1);
      fx.linger.add('crackStar', mx, mz, 1.3, 0, SAND);
      shock(fx, _q.x, _q.z, 2.4, 0.25, GOLD_HEX, 0.8);
      fx.particles.debris(_q.x, _q.z, 1.2);
      fx.sfx.cue('clang', posOf(_q.x, _q.z));
      if (fx.relation(e.dst) === 'own') fx.cam.tier(2);
    } else if (slot === 0) {
      // Shield Slam victim: sand clings to the feet (the slow)
      spawn(fx, 'ring', _q.x, _q.z, 0.8, 0.5, DUST, rim, rel, 0.07, 0, 1, 0.8, 0, 0.55, 0, 0.6);
      fx.particles.debris(_q.x, _q.z, 0.35);
    }
  },

  onMarker(id, clipId, marker, fx) {
    switch (marker) {
      case 'honour': {
        if (!fx.heroPos(id, _p)) return;
        const yaw = facingYaw(fx, id);
        const rel = fx.relation(id);
        const rim = fx.rim(id);
        spawn(fx, 'crescent', _p.x, _p.z, 1.9, 0.3, SHINE, rim, rel, 0.1, yaw === yaw ? yaw : 0, 1, 1.9, TAU * 0.9, 0.5, 1, 1);
        spawn(fx, 'glow', _p.x, _p.z, 1.4, 0.22, GOLD, rim, rel);
        fx.sfx.cue('tingParry', _p);
        return;
      }
      case 'postPlant': {
        // the sword bites: the dome slams to the ground
        const r = find(id, K.Post);
        if (!r) return;
        const rel = fx.relation(id);
        const rim = fx.rim(id);
        spawn(fx, 'ring', r.cx, r.cz, r.r, 0.45, GOLD, rim, rel, 0.07, 0, 1, r.r, 0, 0.05);
        fx.linger.add('crackStar', r.cx, r.cz, 1.3, 0.4, SAND);
        shock(fx, r.cx, r.cz, r.r, 0.3, GOLD_HEX, 0.6);
        fx.particles.debris(r.cx, r.cz, 0.9);
        return;
      }
      case 'eGo':
        if (fx.heroPos(id, _p)) fx.linger.add('crackStar', _p.x, _p.z, 0.8, 0, SAND);
        return;
      case 'eSkid': {
        // the dust streak along the path actually travelled (start → where he stopped)
        const r = find(id, K.Charge);
        if (!r || !fx.heroPos(id, _p)) return;
        const len = Math.hypot(_p.x - r.cx, _p.z - r.cz);
        if (len > 0.4) {
          const yaw = yawTo(r.cx, r.cz, _p.x, _p.z);
          spawn(fx, 'meteor', r.cx, r.cz, len, 0.4, SAND, fx.rim(id), fx.relation(id), 0.07, yaw, 1, 1.0);
          fx.linger.add('scratches', _p.x, _p.z, 0.7, yaw, DUST);
        }
        return;
      }
      case 'rSlam': {
        const r = find(id, K.Arena);
        if (!fx.heroPos(id, _p)) return;
        const rel = fx.relation(id);
        const rim = fx.rim(id);
        // his own impact (R deals no area damage): 2.5 m round him, well inside the arena edge
        const R = Math.min(2.5, r ? r.r * 0.5 : 2.5);
        spawn(fx, 'ring', _p.x, _p.z, R, 0.45, SAND, rim, rel, 0.07, 0, 1, R, 0, 0.05);
        spawn(fx, 'glow', _p.x, _p.z, 2.0, 0.3, GOLD, rim, rel);
        fx.linger.add('crackStar', _p.x, _p.z, 1.6, 0.2, SAND);
        shock(fx, _p.x, _p.z, R, 0.3, SAND_HEX, 0.7);
        fx.particles.debris(_p.x, _p.z, 1.3);
        return;
      }
      case 'howl': {
        const r = find(id, K.Arena);
        if (!r) return;
        const rel = fx.relation(id);
        const rim = fx.rim(id);
        spawn(fx, 'ring', r.cx, r.cz, r.r, 0.6, SHINE, rim, rel, 0.08, 0, 1, r.r, 0, 0.2, 0, 0.8);
        spawn(fx, 'ring', r.cx, r.cz, r.r, 0.6, GOLD, rim, rel, 0.08, 0, 1, r.r, 0, 0.2, 0, 0.8, 0.18);
        return;
      }
      case 'deathThud':
        if (fx.heroPos(id, _p)) {
          fx.linger.add('crackStar', _p.x, _p.z, 0.9, 0, SAND);
          fx.particles.debris(_p.x, _p.z, 0.6);
        }
        return;
      case 'spawnSlam':
        if (fx.heroPos(id, _p)) {
          spawn(fx, 'ring', _p.x, _p.z, 1.8, 0.4, GOLD, fx.rim(id), fx.relation(id), 0.07, 0, 1, 1.8, 0, 0.1);
          fx.linger.add('crackStar', _p.x, _p.z, 1.1, 0, SAND);
          fx.particles.debris(_p.x, _p.z, 0.7);
        }
        return;
      case 'contact':
        // a death ends whatever he was holding up
        if (clipId === 'brutus.death') for (let i = 0; i < MAX; i++) if (recs[i].kind !== K.None && recs[i].src === id) finish(recs[i], fx);
        return;
      default:
        return;
    }
  },

  onZone(zoneIndex, phase, fx) {
    if (phase === 'spawn') {
      lastZone = zoneIndex;
      lastZoneAt = clock;
      for (let i = 0; i < MAX; i++) {
        const r = recs[i];
        if ((r.kind === K.Arena || r.kind === K.Post) && r.zone < 0 && clock - r.t0 < 0.4) {
          r.zone = zoneIndex;
          lastZone = -1;
          return;
        }
      }
    } else if (phase === 'end') {
      for (let i = 0; i < MAX; i++) if (recs[i].kind !== K.None && recs[i].zone === zoneIndex) finish(recs[i], fx);
    }
  },

  update(dt, fx) {
    clock += dt;
    for (let i = 0; i < MAX; i++) {
      const r = recs[i];
      if (r.kind === K.None) continue;
      if (clock >= r.end) {
        finish(r, fx);
        continue;
      }
      if (r.kind === K.Wall) wallTick(r, fx);
      else if (r.kind === K.Post) postTick(r, fx);
      else if (r.kind === K.Arena) arenaTick(r, fx);
      else chargeTick(r, fx);
    }
  },
};

const SHIELDED = 1 << 7; // BuffFlag.Shielded (sim/api), kept local so this chunk carries no sim import

function find(id: number, kind: K): Rec | null {
  for (let i = 0; i < MAX; i++) if (recs[i].kind === kind && recs[i].src === id) return recs[i];
  return null;
}

/** Tests: drop every record and the clock. */
export function resetBrutusFx(): void {
  for (let i = 0; i < MAX; i++) {
    recs[i].kind = K.None;
    recs[i].ribA = recs[i].ribB = recs[i].zone = -1;
  }
  lastSlot.fill(-1);
  clock = 0;
  lastZone = -1;
  lastZoneAt = -9;
}
