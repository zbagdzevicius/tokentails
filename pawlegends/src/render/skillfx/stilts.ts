/**
 * Stilts skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.4 "Moves and VFX"): every gameplay shape at the
 * sim's own numbers (FxCtx.abil, talents included). Savannah dust: terracotta cores (her cast accent; the SAND gold
 * would read as "you"), cream and dust tones, relation rims.
 *
 * - Q High Leap: on the cast, a thin ring at the landing spot (the aim clamped to her leap reach) at exactly the
 *   landing hit's `touch` radius for the air time (her shadow-to-be); on the clip's landing (warped onto the sim's
 *   travel end) a dust ring at that radius, a glow, debris and a small crater.
 * - Pounce (Long Stride at full, or any basic in Zoomies): claw streaks on the victim (two crossed slashes), a slow
 *   ring and scratches on the ground.
 * - W Ear Swivel: sonar rings out to exactly the reveal radius (Big Ears 11 m) and a faint edge band at it; a second
 *   ping on the clip's `ping` marker.
 * - E Swat-Swat: per swat the exact line (a beam `range` long, `width` wide) and a claw crescent along it; the second
 *   swat `gap` ticks after the first, re-anchored where she stands then (the sim's rule).
 * - R Zoomies: a dust burst, then for the duration a speed-line ribbon from her chest, short speed lines streaking
 *   in to her back and alternating paw-print afterimages behind her (both teams see Zoomies: the snapshot's `form`
 *   bit ends them early, at a death).
 * - Passive Long Stride: own view only (the snapshot's `resource` is the own team's): a ring flashes round her the
 *   moment Stride fills (the next basic on a hero is a pounce).
 *
 * Pooled: per-id state in typed arrays, scratch records reused; nothing allocates per frame.
 */
import { stubFx } from '../anim/common';
import { TICK_S, travelTicks } from '../anim/timing';
import type { FxCtx, MoveCtx, SkillFxSet, V3Out } from '../anim/types';
import { STILTS_STATE, STRIDE_MAX } from '../moves/stilts';

/** Terracotta (her accent), a pale dust, cream highlights and a rust for the prints. */
const TERRA = 0xd9734a;
const DUST = 0xe9d3a8;
const CREAM = 0xfff1de;
const RUST = 0x9c4a2a;
const N = 16;
const TAU = Math.PI * 2;
/** Paw-print and speed-line cadence (s) during Zoomies. */
const PRINT_EVERY = 0.09;
/**
 * Zoomies' readable sizes at the game camera (verification round 2: a 0.28 m print, a 0.2 m wide streak living 0.24 s
 * and a 0.22 m ribbon left one faint white line in the gallery and nothing in a match): the paw print's size (m) and
 * life (s), the speed streak's width (m: the beam's bright core is about 40% of it) and life (s), the chest ribbon's
 * width (m) and life (s). The Zoomies hold clip (moves/stilts.ts) adds her afterimages (ghost cues).
 */
export const PRINT_SIZE = 0.46;
const PRINT_LIFE = 0.9;
const STREAK_W = 0.56;
const STREAK_LIFE = 0.34;
const RIBBON_W = 0.48;
const RIBBON_LIFE = 0.55;

let clock = 0;
const zoomUntil = new Float64Array(N);
const printNext = new Float64Array(N);
const printSide = new Int8Array(N).fill(1);
const ribbon = new Int16Array(N).fill(-1);
/** Stride was full at the last frame (own view): the ring flashes on the rising edge. */
const full = new Uint8Array(N);
const seen = new Uint8Array(N);
/** Swat-Swat's aim (ground yaw) per id: the second swat goes the same way. */
const facing = new Float32Array(N);

const P: V3Out = { x: 0, y: 0, z: 0 };
const Q: V3Out = { x: 0, y: 0, z: 0 };
const F: V3Out = { x: 0, y: 0, z: 0 };
const SRC = { x: 0, y: 0, z: 0 };

const by = (fx: FxCtx, low: number, med: number, high: number): number => (fx.tier === 'low' ? low : fx.tier === 'med' ? med : high);
const ok = (id: number): boolean => id >= 0 && id < N;
/** Heroes have ability numbers (every Q has a cooldown); minions, towers and monsters get none. */
const isHero = (fx: FxCtx, id: number): boolean => fx.abil(id, 'q').cooldown !== undefined;
/** Ground yaw (rad) from (x0, z0) toward (x1, z1), in the mesh FX convention (sim +y is render −z). */
const yawTo = (x0: number, z0: number, x1: number, z1: number): number => {
  const a = Math.atan2(-(z1 - z0), x1 - x0);
  return Number.isFinite(a) ? a : 0;
};

// ------------------------------------------------------------------------------------------------ slots

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, P)) return;
  const a = fx.abil(id, 'q');
  const reach = (a.dash ?? 6000) / 1000;
  const touch = (a.touch ?? 1300) / 1000;
  const ax = e.x / 1000 - P.x;
  const az = -e.y / 1000 - P.z;
  const d = Math.hypot(ax, az);
  const k = d > reach ? reach / d : 1;
  const lx = d > 0.01 ? P.x + ax * k : P.x;
  const lz = d > 0.01 ? P.z + az * k : P.z;
  const air = travelTicks(Math.max(1, Math.min(d, reach) * 1000), a.speed ?? 15000) * TICK_S;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  // where she comes down: the landing hit's exact radius, held for the air time
  fx.mesh.spawn('arc', { x: lx, z: lz, sx: touch, life: air + 0.1, color: TERRA, rim, p0: TAU, p1: 0.9, p2: 1, p3: 1, rel });
  fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.1, life: 0.25, color: DUST, rim, rel });
  fx.particles.debris(P.x, P.z, 0.6);
}

/** High Leap landed (the clip's land marker, on the sim's travel end): a dust ring at exactly `touch`. */
function leapLand(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, P)) return;
  const touch = (fx.abil(id, 'q').touch ?? 1300) / 1000;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: touch, life: 0.4, color: DUST, rim, p1: 0.15, p3: 2, rel });
  fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: touch * 1.1, life: 0.3, color: TERRA, rim, rel });
  fx.shock.start({ x: P.x, y: 0, z: P.z }, { r1: touch, dur: 0.22, color: '#e9d3a8', height: 0.3 });
  fx.particles.debris(P.x, P.z, 1);
  fx.linger.add('crater', P.x, P.z, touch * 0.55, Math.random() * TAU, RUST);
  if (rel === 'own') fx.cam.tier(1);
}

function castW(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, P)) return;
  const R = (fx.abil(id, 'w').radius ?? 8000) / 1000;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  // sonar: rings rolling out to exactly the reveal radius, and a faint edge band that says where it stops
  fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: R, life: 0.7, color: CREAM, rim, p1: 0, p3: 1.5, rel });
  fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: R, life: 0.7, color: TERRA, rim, p1: 0, p3: 1.5, rel, delay: 0.18 });
  fx.mesh.spawn('arc', { x: P.x, z: P.z, sx: R, life: 0.6, color: TERRA, rim, p0: TAU, p1: 0.97, p2: 1, p3: 1, rel });
}

/** One Swat-Swat swipe from (x, z) along `yaw`: the exact line and a claw crescent along it. */
function swat(fx: FxCtx, id: number, x: number, z: number, yaw: number, side: number, delay: number): void {
  const a = fx.abil(id, 'e');
  const L = (a.range ?? 2800) / 1000;
  const W = (a.width ?? 1100) / 1000;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  fx.mesh.spawn('beam', { x, y: 0.15, z, yaw, sx: L, sz: W, life: 0.22, color: side > 0 ? TERRA : CREAM, rim, p3: 1.2, rel, delay });
  fx.mesh.spawn('crescent', { x, z, yaw, sx: L, life: 0.24, color: side > 0 ? CREAM : TERRA, rim, p0: 0.5, p1: 0.55, p2: side, p3: 2.2, rel, delay });
}

function castE(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, P)) return;
  swat(fx, id, P.x, P.z, yawTo(P.x, P.z, e.x / 1000, -e.y / 1000), 1, 0);
  // the second swat is drawn on the clip's `swat2` marker, from where she stands then (it is re-anchored in the sim)
  facing[id] = yawTo(P.x, P.z, e.x / 1000, -e.y / 1000);
}

function castR(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, P)) return;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  zoomUntil[id] = clock + (fx.abil(id, 'r').duration ?? 150) * TICK_S;
  printNext[id] = clock + 0.3;
  fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.8, life: 0.4, color: DUST, rim, p1: 0.1, p3: 2, rel });
  if (ribbon[id] >= 0) fx.ribbons.end(ribbon[id]);
  SRC.x = P.x;
  SRC.y = 0.9;
  SRC.z = P.z;
  ribbon[id] = fx.ribbons.point(SRC, TERRA, RIBBON_W, RIBBON_LIFE);
}

/** A pounce landed on a hero: two crossed claw streaks on the victim, the slow ring, scratches on the ground. */
function pounceHit(src: number, dst: number, fx: FxCtx): void {
  if (!fx.heroPos(dst, Q)) return;
  const rel = fx.relation(src);
  const rim = fx.rim(src);
  const yaw = fx.heroPos(src, P) ? yawTo(P.x, P.z, Q.x, Q.z) : 0;
  fx.mesh.spawn('crescent', { x: Q.x, z: Q.z, yaw: yaw + 0.5, sx: 1.2, life: 0.22, color: CREAM, rim, p0: 1.4, p1: 0.45, p2: 1, p3: 2.5, rel });
  fx.mesh.spawn('crescent', { x: Q.x, z: Q.z, yaw: yaw - 0.5, sx: 1.2, life: 0.22, color: TERRA, rim, p0: 1.4, p1: 0.45, p2: -1, p3: 2.5, rel, delay: 0.04 });
  fx.mesh.spawn('ring', { x: Q.x, z: Q.z, sx: 1.0, life: 0.35, color: TERRA, rim, p1: 0.3, rel });
  fx.linger.add('scratches', Q.x, Q.z, 0.7, yaw, RUST);
  fx.sfx.cue('slash', Q);
  if (rel === 'own') fx.cam.tier(1);
}

// ------------------------------------------------------------------------------------------------ markers

function marker(id: number, _clipId: string, m: string, fx: FxCtx): void {
  if (!ok(id)) return;
  seen[id] = 1;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  switch (m) {
    case 'leapLand':
      leapLand(id, fx);
      return;
    case 'ears':
      if (fx.bonePos(id, 'head', P)) fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 0.9, life: 0.25, color: CREAM, rim, rel });
      return;
    case 'ping': {
      if (!fx.heroPos(id, P)) return;
      const R = (fx.abil(id, 'w').radius ?? 8000) / 1000;
      fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: R, life: 0.6, color: CREAM, rim, p1: 0, p3: 1.2, rel });
      return;
    }
    case 'swat1':
      return;
    case 'swat2':
      if (fx.heroPos(id, P)) swat(fx, id, P.x, P.z, facing[id], -1, 0);
      return;
    case 'pounce':
      if (fx.bonePos(id, 'pawR', P)) fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 0.8, life: 0.18, color: CREAM, rim, rel });
      return;
    case 'burst':
      if (!fx.heroPos(id, P)) return;
      fx.mesh.spawn('glow', { x: P.x, z: P.z, sx: 1.4, life: 0.3, color: TERRA, rim, rel });
      fx.particles.debris(P.x, P.z, 1);
      return;
    default:
      return;
  }
}

// ------------------------------------------------------------------------------------------------ per frame

/** The fields of a frame entity (ViewEntity) this script reads. */
interface EntLite {
  hp: number;
  resource?: number;
  form?: boolean;
}
type EntMap = ReadonlyMap<number, EntLite>;
/** The runtime's frame entities (FxRuntime.ents, set by the director each frame); absent on test stubs. */
const entsOf = (fx: FxCtx): EntMap | null => (fx as unknown as { ents?: EntMap | null }).ents ?? null;

function endZoom(id: number, fx: FxCtx): void {
  zoomUntil[id] = 0;
  if (ribbon[id] >= 0) fx.ribbons.end(ribbon[id]);
  ribbon[id] = -1;
}

function update(dt: number, fx: FxCtx): void {
  const now = (clock += dt);
  const ents = entsOf(fx);
  for (let id = 0; id < N; id++) {
    if (!seen[id]) continue;
    const me = ents ? ents.get(id) : undefined;
    // Long Stride filled (own view: the snapshot carries the resource for the own team only)
    if (me && me.resource !== undefined) {
      const f = me.resource >= STRIDE_MAX ? 1 : 0;
      if (f === 1 && full[id] === 0 && me.hp > 0 && fx.heroPos(id, P)) fx.mesh.spawn('ring', { x: P.x, z: P.z, sx: 1.2, life: 0.35, color: TERRA, rim: fx.rim(id), p1: 0.55, p3: 2, rel: fx.relation(id) });
      full[id] = f;
    }
    if (zoomUntil[id] <= 0) continue;
    // Zoomies: over by the clock, or early when the snapshot drops the form bit (a death)
    if (now > zoomUntil[id] || (me !== undefined && (me.form === false || me.hp <= 0))) {
      endZoom(id, fx);
      continue;
    }
    if (!fx.heroPos(id, P)) continue;
    if (ribbon[id] >= 0) fx.ribbons.feed(ribbon[id], P.x, 0.9, P.z);
    if (now < printNext[id]) continue;
    printNext[id] = now + by(fx, PRINT_EVERY * 2, PRINT_EVERY * 1.4, PRINT_EVERY);
    // a paw print just behind her, alternating sides (her facing when known, else a fixed side offset)
    const side = printSide[id];
    const faced = fx.facing !== undefined && fx.facing(id, F);
    if (!faced) {
      F.x = 1;
      F.z = 0;
    }
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    fx.mesh.spawn('glow', { x: P.x - F.z * 0.2 * side - F.x * 0.45, z: P.z + F.x * 0.2 * side - F.z * 0.45, sx: PRINT_SIZE, life: PRINT_LIFE, color: RUST, rim, p3: 2, rel });
    // a speed line streaking in to her back at body height (Med and up: Low keeps its two beam slots for gameplay
    // lines); the ribbon only shows once she moves, the streaks read even while she stands
    if (fx.tier !== 'low') {
      const len = side > 0 ? 2.6 : 2.0;
      const lat = side * (0.22 + 0.1 * (printNext[id] % 1));
      fx.mesh.spawn('beam', {
        x: P.x - F.z * lat - F.x * (0.35 + len),
        y: side > 0 ? 1.15 : 0.7,
        z: P.z + F.x * lat - F.z * (0.35 + len),
        yaw: Math.atan2(-F.z, F.x),
        sx: len,
        sz: STREAK_W,
        life: STREAK_LIFE,
        color: side > 0 ? CREAM : TERRA,
        rim,
        p3: 2.2,
        rel,
      });
    }
    printSide[id] = (-side) as 1 | -1;
  }
}

/** Clear every per-id track (tests, gallery restarts). */
export function resetStiltsFx(): void {
  clock = 0;
  zoomUntil.fill(0);
  printNext.fill(0);
  printSide.fill(1);
  ribbon.fill(-1);
  full.fill(0);
  seen.fill(0);
  facing.fill(0);
  STILTS_STATE.pounce.fill(0);
}

/** Zoomies' FX end (s, render clock) for `id`; 0 when none (tests). */
export const zoomEndOf = (id: number): number => (ok(id) ? zoomUntil[id] : 0);

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('stilts'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },
  onCast(e, fx, _ctx: MoveCtx) {
    const id = e.src;
    if (!ok(id)) return;
    seen[id] = 1;
    if (e.slot === 0) castQ(e, fx);
    else if (e.slot === 1) castW(id, fx);
    else if (e.slot === 2) castE(e, fx);
    else if (e.slot === 3) castR(id, fx);
  },
  onHit(e, fx) {
    const id = e.src;
    if (!ok(id)) return;
    if (e.kind === 'basic') {
      // the pounce the move pick chose (the sim spends it on a hero only)
      if (STILTS_STATE.pounce[id] === 1 && isHero(fx, e.dst)) {
        STILTS_STATE.pounce[id] = 0;
        pounceHit(id, e.dst, fx);
      }
      return;
    }
    // an ability hit on a hero: a small dust puff on the victim
    if (isHero(fx, e.dst) && fx.heroPos(e.dst, Q)) fx.mesh.spawn('glow', { x: Q.x, z: Q.z, sx: 0.8, life: 0.2, color: DUST, rim: fx.rim(id), rel: fx.relation(id) });
  },
  onMarker: marker,
  update,
};
