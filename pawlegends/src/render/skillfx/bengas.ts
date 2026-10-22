/**
 * Bengas skill FX (ANIM-SPEC §14 "Bengas"): fire, stage lights and camellia petals.
 *
 * - Basic: an ember flick off the baton tip, a hot spark on the victim; Hot Toast (a basic on a crowd-controlled hero)
 *   brands the victim with a scorch and a fire twirl ring.
 * - Q Burnt Toast: a fire swipe from the serve, an ember ribbon, a streak of fire glows at the skillshot width (one per
 *   0.35 m travelled, every tier) and a ground strip of the skillshot width under it, riding the toast (it ends on the
 *   toast's hit or its range: the sim's 18 m/s, 7 m), so the dodge width reads from the iso camera; a burst, ring and
 *   1 m scorch on the hit.
 * - W Striking Pose: a hollow spotlight for exactly the 9 t windup (a ground pool, a crisp floor rim and thin light
 *   shafts on its edge: no volume over his body, so his spin-in and facing, the stun's only tell, stay readable), then
 *   the camera-flash wedge over the exact cone (4 m, 70°) for 120–180 ms. The star halo goes only on heroes the
 *   snapshot shows Stunned (those facing him); a hero who was only slowed (facing away: the skill's counterplay) gets a
 *   small dim ground ring. The status is read from the frame (FxCtx.status); a target whose stun or slow is not in the
 *   frame yet is re-checked for a few frames from a pooled list.
 * - E Camellia Hop: petals at the take-off and the landing (the foot ribbon comes from the clip).
 * - R Curtains Up!: two flame curtains at exactly the sim radius (the far half 1.6 m, the half facing the camera 0.5 m,
 *   so whoever is inside stays visible during the escape window) that burn away over exactly the 18 t arm, a crisp fire
 *   edge on the stage rim for the zone's life, and per pulse (every 15 t, 8 or 12 of them) a flare ring and 4 small
 *   flame pillars inside the radius plus a drum. The stage clock is bound to the sim zone (onZone): 'spawn' binds the
 *   zone, 'arm' sets the clock to the arm exactly (the curtains' burn-off flare draws there), 'end' closes the
 *   curtains. Pulses draw from that clock when it reaches them, never before; the conducting downbeat only adds a
 *   baton accent and is never the timing source. A stage whose zone is never seen (out of the snapshot) ends on its
 *   own clock.
 *
 * Colours: the shared additive shader brightens toward white, so the fire and petal bases are dark (FIRE, EMBER, PETAL)
 * with intensity (p3) 0.5–0.7 and no hot / gold overlay layers on the fire: the result lands on orange and pink.
 *
 * Shapes use the talent-resolved numbers (fx.abil). Enemy effects take the danger rim (fx.rim). Everything is pooled:
 * no allocation per event or per frame. Render only.
 */
import { stubFx } from '../anim/common';
import { TICK_S } from '../anim/timing';
import { CAPS } from '../../data/map';
import { CAMERA_YAW } from '../coords';
import type { FxCtx, HeroStatus, MeshFxKind, MeshFxSpawn, MoveCtx, Relation3, SkillFxSet, V3Out } from '../anim/types';

const FIRE = 0xd02800;
const EMBER = 0xe05010;
const FLASH = 0xfff8e6;
const GOLD = 0xffd98a;
const PETAL = 0xd0306a;
const CRIMSON = 0xb01838;
/** Fire intensity (p3): low enough that the shader's brightening stays orange. */
const FI = 0.6;
/** BuffFlag.Stunned / Slowed (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
const SLOWED = 1 << 6;
const TAU = Math.PI * 2;
/** Mesh yaw (forward = (cos, −sin)) of the direction toward the camera (the iso camera sits at (sin yaw, cos yaw)). */
const TOWARD_CAM = Math.atan2(-Math.cos(CAMERA_YAW), Math.sin(CAMERA_YAW));

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

// ------------------------------------------------------------------------------------------------ Q toast ribbons

class Toast {
  on = false;
  owner = -1;
  x0 = 0;
  z0 = 0;
  dx = 1;
  dz = 0;
  d = 0;
  max = 0;
  speed = 0;
  slot = -1;
  /** Skillshot width (m): the streak's size. */
  w = 0.8;
  /** Distance (m) at which the next streak glow / ground strip segment draws. */
  nextGlow = 0;
  nextStrip = 0;
  rel: Relation3 = 'own';
  rim = 0;
  readonly src = { x: 0, y: 1.0, z: 0 };
}
const TOASTS: Toast[] = [new Toast(), new Toast(), new Toast(), new Toast()];

function endToast(fx: FxCtx, t: Toast): void {
  if (t.slot >= 0) fx.ribbons.end(t.slot);
  t.slot = -1;
  t.on = false;
}

/** Metres between the toast's streak glows (every tier) and between its ground strip segments. */
const TOAST_STREAK_M = 0.35;
const TOAST_STRIP_M = 1.0;
/** Streak glow life per tier (s): at 18 m/s and 0.35 m that keeps ≈ 3 / 6 / 8 live, under each tier's glow cap. */
const STREAK_LIFE = { low: 0.06, med: 0.12, high: 0.16 } as const;
/** How far (m) from the toast's render position a hit still counts as the toast's (frame lag + unit radii). */
const TOAST_HIT_SLACK = 1.6;

/** Burnt Toast's impact: a fire burst, a flare ring, four licks of flame, crumbs and a 1 m scorch glyph. */
function toastBurst(fx: FxCtx, x: number, z: number, yaw: number, rim: number, rel: Relation3): void {
  mesh(fx, 'crescent', x, z, 1.5, 0.3, FIRE, rim, rel, yaw, 0.08, 1, TAU, 0.2, 1, 0.7);
  mesh(fx, 'ring', x, z, 2.0, 0.36, FIRE, rim, rel, 0, 0.07, 1, 0, 0.12, 0, FI);
  mesh(fx, 'glow', x, z, 1.5, 0.26, FIRE, rim, rel, 0, 0.6, 1, 0, 0, 0, FI);
  for (let i = 0; i < 4; i++) {
    const a = yaw + Math.PI / 4 + (i * TAU) / 4;
    mesh(fx, 'pillar', x + Math.cos(a) * 0.55, z - Math.sin(a) * 0.55, 0.22, 0.32, EMBER, rim, rel, 0, 0.02, 1.1 + (i % 2) * 0.4, 0, 0, 0, FI, i * 0.03);
  }
  fx.linger.add('scorch', x, z, 1.0, yaw, EMBER);
  fx.particles.debris(x, z, 0.8);
  fx.sfx.cue('fwoomp', V);
}

/** One hero's dazzle mark, by the sim's status: the star halo on a stun, a dim ground ring on a slow. */
function dazzleMark(fx: FxCtx, id: number, buffs: number, rim: number, rel: Relation3): boolean {
  if (!fx.heroPos(id, V)) return true;
  if (buffs & STUNNED) {
    mesh(fx, 'glow', V.x, V.z, 1.3, 0.22, FLASH, rim, rel, 0, 1.7, 1, 0, 0, 0, 0.7);
    mesh(fx, 'ring', V.x, V.z, 0.75, 0.6, GOLD, rim, rel, 0, 2.1, 1, 0, 0.55, 0, 1, 0.05);
    mesh(fx, 'crescent', V.x, V.z, 0.6, 0.6, GOLD, rim, rel, 0, 2.15, 1, TAU, 0.75, 1, 1, 0.05);
    return true;
  }
  if (buffs & SLOWED) {
    mesh(fx, 'arc', V.x, V.z, 0.55, 0.5, GOLD, rim, rel, 0, 0.05, 1, TAU, 0.82, 1, 0.3);
    return true;
  }
  return false;
}

/** Heroes in the cone whose stun or slow the frame did not show yet: re-checked for DAZZLE_WAIT s (pooled). */
const DAZZLE_WAIT = 0.2;
const PEND_N = 10;
const pendId = new Int16Array(PEND_N).fill(-1);
const pendLeft = new Float32Array(PEND_N);
const pendRim = new Uint32Array(PEND_N);
const pendRel: Relation3[] = new Array<Relation3>(PEND_N).fill('own');
const ST: HeroStatus = { buffs: 0, shield: 0 };

function dazzleTry(fx: FxCtx, id: number, rim: number, rel: Relation3): boolean {
  return !!fx.status?.(id, ST) && dazzleMark(fx, id, ST.buffs, rim, rel);
}

/**
 * Striking Pose: every opposing hero inside the exact cone gets the mark the sim gave it (stun: star halo; slow: a dim
 * ground ring). One the frame does not show as stunned or slowed yet is deferred to the pooled pending list.
 */
function dazzle(fx: FxCtx, src: number, x: number, z: number, yaw: number, range: number, arc: number, rim: number, rel: Relation3): void {
  const foe = rel === 'enemy';
  for (let id = 0; id < CAPS.heroes; id++) {
    if (id === src || (fx.relation(id) === 'enemy') === foe || !fx.heroPos(id, V)) continue;
    const dx = V.x - x;
    const dz = V.z - z;
    const d = Math.hypot(dx, dz);
    if (d > range + 0.4) continue;
    let da = Math.atan2(-dz, dx) - yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (d > 0.3 && Math.abs(da) > arc / 2 + 0.12) continue;
    if (dazzleTry(fx, id, rim, rel)) continue;
    let k = -1;
    for (let i = 0; i < PEND_N; i++) if (pendId[i] < 0 || pendId[i] === id) k = i;
    if (k < 0) continue;
    pendId[k] = id;
    pendLeft[k] = DAZZLE_WAIT;
    pendRim[k] = rim;
    pendRel[k] = rel;
  }
}

/**
 * A hollow spotlight on (x, z): a low ground pool, a crisp floor rim and (Med / High) six thin light shafts on its
 * edge. Nothing additive covers the body, so his silhouette and facing read through it.
 */
function spotlight(fx: FxCtx, x: number, z: number, life: number, rim: number, rel: Relation3, bright: number): void {
  mesh(fx, 'glow', x, z, 1.0, life, GOLD, rim, rel, 0, 0.06, 1, 0, 0, 0, 0.15 * bright);
  mesh(fx, 'arc', x, z, 1.0, life, GOLD, rim, rel, 0, 0.05, 1, TAU, 0.88, 1, 0.5 * bright);
  if (fx.tier === 'low') return;
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.26;
    mesh(fx, 'pillar', x + Math.cos(a) * 0.95, z - Math.sin(a) * 0.95, 0.04, life, GOLD, rim, rel, 0, 0.02, 3.2, 0, 0, 0, 0.15 * bright);
  }
}

// ------------------------------------------------------------------------------------------------ R stages

class Stage {
  on = false;
  owner = -1;
  x = 0;
  z = 0;
  rad = 0;
  yaw = 0;
  /** Seconds since the cast on the stage's clock (set to the arm exactly by the zone's 'arm'). */
  t = 0;
  /** The sim zone bound by onZone('spawn'), or −1. */
  zone = -1;
  /** Module clock at the cast (binding window). */
  castAt = 0;
  arm = 0;
  every = 0;
  pulses = 0;
  next = 0;
  life = 0;
  rel: Relation3 = 'own';
  rim = 0;
}
const STAGES: Stage[] = [new Stage(), new Stage(), new Stage()];
/** Curtain heights (m): the far half, and the half facing the camera (lower, so the units inside stay visible). */
const CURTAIN_FAR = 1.6;
const CURTAIN_NEAR = 0.5;
/** A zone spawned within this long of an R cast is that cast's stage (either order). */
const BIND_S = 0.6;
let clock = 0;
let pendZone = -1;
let pendZoneAt = -9;

function curtains(fx: FxCtx, s: Stage, life: number): void {
  // two faint halves, the far one and the one facing the camera (lower); Low has no curtain pool: flame pillars stand in
  const a = mesh(fx, 'curtain', s.x, s.z, s.rad, life, FIRE, s.rim, s.rel, TOWARD_CAM + Math.PI, 0.02, CURTAIN_FAR, Math.PI * 0.98, 0, 0, 0);
  const b = mesh(fx, 'curtain', s.x, s.z, s.rad, life, FIRE, s.rim, s.rel, TOWARD_CAM, 0.02, CURTAIN_NEAR, Math.PI * 0.98, 0, 0, 0);
  if (a < 0 || b < 0) {
    // the far half's pillars stand taller (the parting curtain), the near ones low
    for (let i = 0; i < 6; i++) {
      const ang = s.yaw + (i * TAU) / 6;
      const px = s.x + Math.cos(ang) * s.rad * 0.9;
      const pz = s.z - Math.sin(ang) * s.rad * 0.9;
      const far = Math.cos(ang - TOWARD_CAM) < 0;
      mesh(fx, 'pillar', px, pz, 0.3, life, FIRE, s.rim, s.rel, 0, 0.02, far ? CURTAIN_FAR : CURTAIN_NEAR + 0.2, 0, 0, 0, 0.5);
    }
  }
}

/** The arm: the curtains burn off in a flare along the rim (the escape window is over). */
function curtainsPart(fx: FxCtx, s: Stage): void {
  mesh(fx, 'crescent', s.x, s.z, s.rad, 0.3, EMBER, s.rim, s.rel, s.yaw, 0.08, 1, TAU, 0.85, 1, FI);
  fx.particles.debris(s.x, s.z, 0.6);
}

function pulse(fx: FxCtx, s: Stage, k: number): void {
  mesh(fx, 'ring', s.x, s.z, s.rad, 0.4, FIRE, s.rim, s.rel, s.yaw, 0.07, 1, 0, 0.12, 0, 0.7);
  const spin = s.yaw + k * 0.45;
  for (let i = 0; i < 4; i++) {
    const ang = spin + (i * TAU) / 4;
    mesh(fx, 'pillar', s.x + Math.cos(ang) * s.rad * 0.72, s.z - Math.sin(ang) * s.rad * 0.72, 0.26, 0.36, EMBER, s.rim, s.rel, 0, 0.02, 1.3 + (k % 2) * 0.35, 0, 0, 0, 0.55);
  }
  if (k === 0) fx.linger.add('scorch', s.x, s.z, s.rad * 0.85, s.yaw, EMBER);
  fx.sfx.cue('drum', s, 1);
}

const pulseAt = (s: Stage, k: number): number => s.arm + k * s.every;

/**
 * A conducting downbeat from `owner` (cast clip arm, hold loop, end clip): a baton accent only. It draws a pulse only
 * when the stage clock has already reached it this frame (never before), and never moves the clock: the stage clock
 * is the timing source.
 */
function beat(fx: FxCtx, owner: number): void {
  if (fx.bonePos(owner, 'weaponTip', P)) mesh(fx, 'glow', P.x, P.z, 0.55, 0.16, EMBER, fx.rim(owner), fx.relation(owner), 0, P.y, 1, 0, 0, 0, FI);
  for (const s of STAGES) {
    if (!s.on || s.owner !== owner) continue;
    while (s.next < s.pulses && s.t >= pulseAt(s, s.next)) pulse(fx, s, s.next++);
  }
}

function endStage(fx: FxCtx, s: Stage): void {
  curtains(fx, s, 0.45);
  s.on = false;
  s.zone = -1;
}

// ------------------------------------------------------------------------------------------------ basic bolt embers

/** Live basic-bolt ember trails: projectile pool index and ribbon slot (−1 = free). */
const BOLT_N = 6;
const boltIdx = new Int32Array(BOLT_N).fill(-1);
const boltRib = new Int32Array(BOLT_N).fill(-1);
const BP: V3Out = { x: 0, y: 0, z: 0 };

function boltStart(fx: FxCtx, index: number): void {
  if (fx.tier === 'low' || !fx.projPos || !fx.projPos(index, BP)) return;
  let k = -1;
  for (let i = 0; i < BOLT_N; i++) if (boltIdx[i] < 0) k = i;
  if (k < 0) return;
  const r = fx.ribbons.point(BP, FIRE, 0.12, 0.16);
  if (r < 0) return;
  boltIdx[k] = index;
  boltRib[k] = r;
}

function boltsUpdate(fx: FxCtx): void {
  for (let i = 0; i < BOLT_N; i++) {
    if (boltIdx[i] < 0) continue;
    if (fx.projPos?.(boltIdx[i], BP)) fx.ribbons.feed(boltRib[i], BP.x, BP.y, BP.z);
    else {
      fx.ribbons.end(boltRib[i]);
      boltIdx[i] = boltRib[i] = -1;
    }
  }
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('bengas'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onWindup(e, fx) {
    // W: the spotlight comes on for exactly the windup, so the spin-in is lit
    if (e.slot !== 1 || !fx.heroPos(e.src, P)) return;
    const life = e.ticks * TICK_S;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    spotlight(fx, P.x, P.z, life + 0.1, rim, rel, 1);
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
        // the serve's fire swipe and a hot muzzle flare
        mesh(fx, 'crescent', P.x, P.z, 2.2, 0.26, FIRE, rim, rel, yaw, 0.08, 1, 1.9, 0.4, 1, 0.7);
        mesh(fx, 'glow', P.x + cx * 0.8, P.z + cz * 0.8, 1.1, 0.22, EMBER, rim, rel, 0, 0.9, 1, 0, 0, 0, FI);
        // an ember ribbon riding the toast at the sim speed, ended on its hit or at its range
        let t: Toast | null = null;
        for (const c of TOASTS) if (!c.on) t = c;
        if (!t) {
          t = TOASTS[0];
          endToast(fx, t);
        }
        t.on = true;
        t.owner = e.src;
        t.x0 = P.x;
        t.z0 = P.z;
        t.dx = cx;
        t.dz = cz;
        t.d = 0;
        t.max = (a.range ?? 7000) / 1000;
        t.speed = (a.speed ?? 18000) / 1000;
        t.nextGlow = 0;
        t.nextStrip = 0;
        t.w = (a.width ?? 800) / 1000;
        t.rel = rel;
        t.rim = rim;
        t.src.x = P.x;
        t.src.z = P.z;
        t.slot = fx.ribbons.point(t.src, FIRE, t.w, 0.45);
        fx.sfx.cue('sizzle', P);
        return;
      }
      case 1: {
        // the camera flash: the exact cone (range, arc) for a blink, then the spotlight snaps
        const a = fx.abil(e.src, 'w');
        const range = (a.range ?? 4000) / 1000;
        const arc = ((a.arc ?? 796) / 4096) * TAU;
        mesh(fx, 'arc', P.x, P.z, range, 0.12, FLASH, rim, rel, yaw, 0.09, 1, arc, 0.1, 1, 0.7);
        mesh(fx, 'crescent', P.x, P.z, range, 0.2, EMBER, rim, rel, yaw, 0.1, 1, arc, 0.55, 1, FI);
        spotlight(fx, P.x, P.z, 0.45, rim, rel, 2);
        mesh(fx, 'glow', P.x, P.z, 0.5, 0.4, FLASH, rim, rel, 0, 2.9, 1, 0, 0, 0, 0.7);
        dazzle(fx, e.src, P.x, P.z, yaw, range, arc, rim, rel);
        if (rel === 'own') fx.cam.tier(1);
        return;
      }
      case 2: {
        fx.linger.add('petals', P.x, P.z, 0.9, yaw, PETAL);
        mesh(fx, 'ring', P.x, P.z, 1.3, 0.3, PETAL, rim, rel, yaw, 0.06, 1, 0, 0.2, 0, FI);
        mesh(fx, 'crescent', P.x, P.z, 1.2, 0.3, CRIMSON, rim, rel, yaw + Math.PI, 0.07, 1, 2.4, 0.55, 1, FI);
        return;
      }
      default: {
        // Curtains Up!: the stage at the aim point (clamped to the cast range), the sim radius after talents
        const a = fx.abil(e.src, 'r');
        const range = (a.range ?? 9000) / 1000;
        let tx = e.x / 1000;
        let tz = -e.y / 1000;
        const dx = tx - P.x;
        const dz = tz - P.z;
        const dl = Math.hypot(dx, dz);
        if (dl > range) {
          tx = P.x + (dx / dl) * range;
          tz = P.z + (dz / dl) * range;
        }
        let s: Stage | null = null;
        for (const c of STAGES) if (!c.on) s = c;
        if (!s) s = STAGES[0];
        s.on = true;
        s.owner = e.src;
        s.x = tx;
        s.z = tz;
        s.rad = (a.radius ?? 3500) / 1000;
        s.yaw = dl > 0.05 ? Math.atan2(-dz, dx) : yaw;
        s.t = 0;
        s.arm = (a.windup ?? 18) * TICK_S;
        s.every = Math.max(1, a.every ?? 15) * TICK_S;
        s.pulses = Math.floor((a.duration ?? 120) / Math.max(1, a.every ?? 15));
        s.life = s.arm + (a.duration ?? 120) * TICK_S;
        s.next = 0;
        s.rel = rel;
        s.rim = rim;
        s.castAt = clock;
        s.zone = -1;
        // the zone's 'spawn' came first (same snapshot): bind it now
        if (pendZone >= 0 && clock - pendZoneAt < BIND_S) {
          s.zone = pendZone;
          pendZone = -1;
        }
        curtains(fx, s, s.arm);
        // the stage's fire edge for the zone's life (two half-bright arcs make an even rim), inside the radius
        const inner = Math.max(0.8, 1 - 0.2 / s.rad);
        mesh(fx, 'arc', s.x, s.z, s.rad, s.life, FIRE, rim, rel, s.yaw, 0.05, 1, TAU, inner, 1, FI);
        mesh(fx, 'arc', s.x, s.z, s.rad, s.life, FIRE, rim, rel, s.yaw + Math.PI, 0.05, 1, TAU, inner, -1, FI);
        fx.sfx.cue('curtain', s, 1);
        return;
      }
    }
  },

  onHit(e, fx, ctx: MoveCtx) {
    if (!fx.heroPos(e.dst, V)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.kind === 'basic') {
      mesh(fx, 'glow', V.x, V.z, 0.9, 0.18, EMBER, rim, rel, 0, 0.9, 1, 0, 0, 0, FI);
      mesh(fx, 'ring', V.x, V.z, 0.8, 0.22, FIRE, rim, rel, 0, 0.07, 1, 0, 0.35, 0, FI);
      if (ctx.targetCc) {
        // Hot Toast: the brand mark and a flame burst
        fx.linger.add('scorch', V.x, V.z, 0.4, 0, EMBER);
        mesh(fx, 'crescent', V.x, V.z, 1.1, 0.3, FIRE, rim, rel, 0, 0.08, 1, TAU, 0.55, 1, FI);
      }
      return;
    }
    if (e.kind !== 'ability') return;
    // the toast landing: a live toast of this owner that has reached the victim (an R pulse hit elsewhere is not it)
    for (const t of TOASTS) {
      if (!t.on || t.owner !== e.src) continue;
      if (Math.hypot(V.x - t.src.x, V.z - t.src.z) > TOAST_HIT_SLACK) continue;
      endToast(fx, t);
      toastBurst(fx, V.x, V.z, Math.atan2(-t.dz, t.dx), rim, rel);
      if (rel === 'own') fx.cam.tier(1);
      return;
    }
  },

  onMarker(id, _clip, marker, fx) {
    if (marker.charCodeAt(0) !== 98 || marker.charCodeAt(1) !== 58) return; // only the clips' 'b:' fx cues
    if (marker === 'b:beat') return beat(fx, id);
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    switch (marker) {
      case 'b:flick':
        if (fx.bonePos(id, 'pawR', P)) mesh(fx, 'glow', P.x, P.z, 0.7, 0.18, EMBER, rim, rel, 0, P.y, 1, 0, 0, 0, FI);
        return;
      case 'b:downbeat':
        if (!fx.heroPos(id, P)) return;
        mesh(fx, 'glow', P.x, P.z, 1.0, 0.2, EMBER, rim, rel, 0, 0.06, 1, 0, 0, 0, FI);
        mesh(fx, 'ring', P.x, P.z, 1.2, 0.25, EMBER, rim, rel, 0, 0.06, 1, 0, 0.3, 0, FI);
        return;
      case 'b:hot':
        if (!fx.heroPos(id, P)) return;
        mesh(fx, 'crescent', P.x, P.z, 1.4, 0.3, FIRE, rim, rel, 0, 0.1, 1, TAU, 0.6, 1, FI);
        return;
      case 'b:petals':
        if (!fx.heroPos(id, P)) return;
        fx.linger.add('petals', P.x, P.z, 1.4, 0, PETAL);
        mesh(fx, 'ring', P.x, P.z, 1.8, 0.34, PETAL, rim, rel, 0, 0.06, 1, 0, 0.25, 0, FI);
        mesh(fx, 'crescent', P.x, P.z, 1.4, 0.4, CRIMSON, rim, rel, 0, 0.07, 1, TAU, 0.5, 1, FI);
        mesh(fx, 'glow', P.x, P.z, 1.4, 0.3, PETAL, rim, rel, 0, 0.06, 1, 0, 0, 0, 0.5);
        return;
      case 'b:bow':
      case 'b:rose':
        if (fx.heroPos(id, P)) fx.linger.add('petals', P.x, P.z, marker === 'b:bow' ? 0.9 : 0.55, 0, PETAL);
        return;
      case 'b:spot':
        if (fx.heroPos(id, P)) spotlight(fx, P.x, P.z, 0.7, rim, rel, 1.5);
        return;
      case 'b:bouquet':
        if (!fx.heroPos(id, P)) return;
        fx.linger.add('petals', P.x, P.z, 1.6, 0, PETAL);
        mesh(fx, 'ring', P.x, P.z, 1.8, 0.4, PETAL, rim, rel, 0, 0.06, 1, 0, 0.2);
        return;
      case 'b:flash':
        if (fx.heroPos(id, P)) mesh(fx, 'glow', P.x, P.z, 1.8, 0.16, FLASH, rim, rel);
        return;
      case 'b:flame':
        if (fx.bonePos(id, 'pawL', P)) mesh(fx, 'glow', P.x, P.z, 0.3, 0.6, EMBER, rim, rel, 0, P.y, 1, 0, 0, 0, FI);
        return;
      default:
        return;
    }
  },

  onZone(zoneIndex, phase, fx) {
    if (phase === 'spawn') {
      // the newest live stage cast in the binding window without a zone yet is this one (else the cast comes next)
      let b: Stage | null = null;
      for (const s of STAGES) if (s.on && s.zone < 0 && clock - s.castAt < BIND_S && (!b || s.castAt > b.castAt)) b = s;
      if (b) b.zone = zoneIndex;
      else {
        pendZone = zoneIndex;
        pendZoneAt = clock;
      }
      return;
    }
    for (const s of STAGES) {
      if (!s.on || s.zone !== zoneIndex) continue;
      if (phase === 'arm') {
        // the sim armed the stage: the clock is the arm exactly, the curtains burn off (pulse 0 draws this frame)
        s.t = s.arm;
        curtainsPart(fx, s);
      } else if (phase === 'end') endStage(fx, s);
      return;
    }
  },

  onProjectile(_owner, _kind, slot, fx, index) {
    // a basic bolt (no slot): an ember trail that rides the bolt's drawn position until it lands
    if (slot < 0 && index !== undefined) boltStart(fx, index);
  },

  update(dt, fx) {
    clock += dt;
    boltsUpdate(fx);
    const life = STREAK_LIFE[fx.tier];
    for (const t of TOASTS) {
      if (!t.on) continue;
      const d0 = t.d;
      t.d += t.speed * dt;
      if (t.d >= t.max) {
        endToast(fx, t);
        continue;
      }
      t.src.x = t.x0 + t.dx * t.d;
      t.src.z = t.z0 + t.dz * t.d;
      if (t.slot >= 0) fx.ribbons.feed(t.slot, t.src.x, t.src.y, t.src.z);
      // the fire streak at the skillshot's width, one glow per 0.35 m travelled (every tier: no gaps at 18 m/s)
      while (t.nextGlow <= t.d) {
        const g = Math.max(t.nextGlow, d0);
        mesh(fx, 'glow', t.x0 + t.dx * g, t.z0 + t.dz * g, t.w, life, FIRE, t.rim, t.rel, 0, t.src.y, 1, 0, 0, 0, FI);
        t.nextGlow += TOAST_STREAK_M;
      }
      // the ground strip of the skillshot width under it (the dodge width from the iso camera)
      while (t.nextStrip + TOAST_STRIP_M <= t.d) {
        mesh(fx, 'beam', t.x0 + t.dx * t.nextStrip, t.z0 + t.dz * t.nextStrip, TOAST_STRIP_M, fx.tier === 'low' ? 0.1 : 0.16, FIRE, t.rim, t.rel, Math.atan2(-t.dz, t.dx), 0.06, 1, 0, 0, 0, 0.5, 0, t.w);
        t.nextStrip += TOAST_STRIP_M;
      }
    }
    for (let i = 0; i < PEND_N; i++) {
      if (pendId[i] < 0) continue;
      pendLeft[i] -= dt;
      if (dazzleTry(fx, pendId[i], pendRim[i], pendRel[i]) || pendLeft[i] <= 0) pendId[i] = -1;
    }
    for (const s of STAGES) {
      if (!s.on) continue;
      s.t += dt;
      // pulses draw from the stage clock when it reaches them (never early)
      while (s.next < s.pulses && s.t >= pulseAt(s, s.next)) pulse(fx, s, s.next++);
      // a stage whose zone never showed in the snapshot ends on its own clock; a bound one ends on onZone('end')
      if (s.zone < 0 && s.t >= s.life) endStage(fx, s);
    }
  },
};

/** Tests: drop every live toast and stage (module state). */
export function resetBengasFx(): void {
  for (const t of TOASTS) {
    t.on = false;
    t.slot = -1;
  }
  for (const s of STAGES) {
    s.on = false;
    s.zone = -1;
  }
  pendId.fill(-1);
  pendZone = -1;
  pendZoneAt = -9;
  clock = 0;
}
