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
 * Fun layer (skill-feel pass, render only): High Leap leaves paw prints at take-off, splays prints round the landing and
 * says "POUNCE!" on the first hero it lands on; Ear Swivel pings radar arcs off both ears and pops a "!" over every
 * enemy hero in the reveal radius; each swat flashes a big paw; Zoomies says "ZOOM!", leaves paw-print stickers and a
 * dust puff on every footfall with speed lines; every pounce picks one of three claw-mark variants from funRand on
 * the hit tick (replays match).
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/stilts.ts): the nature and bongo layers play from
 * render/effects.ts on every cast and hit; this script adds what only it knows: the deep bongo thump and the mobility
 * landing on High Leap's touchdown with a big terracotta print stamped at the centre, a sonar ripple of paw prints
 * running out to the reveal radius on Ear Swivel, the second swat's right-hand drum and a print at the end of each swat
 * line, and a double bongo slap on a pounce (it replaces the stand-in slash / whooshS cue: the slash nature impact
 * already plays on every basic).
 *
 * Pooled: per-id state in typed arrays, scratch records reused; nothing allocates per frame.
 */
import { stubFx } from '../anim/common';
import { TICK_S, travelTicks } from '../anim/timing';
import type { FxCtx, MoveCtx, SkillFxSet, V3Out } from '../anim/types';
import { STILTS_STATE, STRIDE_MAX } from '../moves/stilts';
import { mixPriority, type MixRelation } from '../../audio/identityMix';
import { sfx } from '../../audio/sfx';
import { champSound, playSkillSfx, type SkillPhase } from '../../audio/skillSfx';
import { flying, funCount, funPop, funRand, funRank, funSfx, pawTrail, speedLines, sticker, stickerBurst } from '../fx/fun/funKit';
import { S3Once, s3HeadY } from '../fx/fun/skills3Kit';
import { MIX_REL } from './identityFx';

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
/** Fun stickers: the prints' cream, the "!" butter yellow (never red). */
const PRINT = 0xfff1de;
const BANG = 0xffe36a;
const relOf = (fx: FxCtx, id: number): MixRelation => MIX_REL[fx.relation(id)] ?? 'enemy';

/** A skill phase's nature + champion sound (audio/skillSfx.ts) for a moment only this script sees. */
function skillSound(fx: FxCtx, id: number, skill: 'q' | 'w' | 'e' | 'r', phase: SkillPhase, at: { x: number; z: number }, rate = 1): void {
  try {
    playSkillSfx('stilts', skill, phase, { at, relation: relOf(fx, id), src: id, rate });
  } catch {
    /* audio not unlocked yet */
  }
}

/** One of her own sounds (audio/champ/stilts.ts `sounds`) through the identity mix. */
function champCue(fx: FxCtx, id: number, name: string, at: { x: number; z: number }, rate = 1): void {
  const relation = relOf(fx, id);
  try {
    sfx.playLayer({ name: champSound('stilts', name), layer: 'motif', hero: 'stilts', priority: mixPriority({ relation }), relation, rate, at });
  } catch {
    /* audio not unlocked yet */
  }
}

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
/** Fun latches: High Leap's "POUNCE!" (once per leap) and the last cast slot / clock (an ability hit belongs to it). */
const pounceOnce = new S3Once(N);
const lastSlot = new Int8Array(N).fill(-1);
const lastCastAt = new Float64Array(N).fill(-9);
/** Zoomies' seed (cast tick) for the footfall variants, and the footfall counter. */
const zoomTick = new Int32Array(N);
const zoomStep = new Int32Array(N);

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

function castQ(e: { src: number; x: number; y: number; tick: number }, fx: FxCtx): void {
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
  // the fun layer: two scrabbling paw prints where she kicked off, a dust puff
  if (d > 0.01) pawTrail(fx, P.x - (ax / d) * 0.4, P.z - (az / d) * 0.4, P.x + (ax / d) * 0.5, P.z + (az / d) * 0.5, 0.12, 2, PRINT, 0.42, 0.9, funRand(e.tick, id, 0) < 0.5);
  stickerBurst(fx, P.x, 0.3, P.z, 'PUFF', DUST, 0.34, 0.45, 4, 1.6, 0.8, -1, 0.3);
  pounceOnce.arm(id, clock);
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
  // replay-safe crater spin (the old Math.random made replays differ)
  fx.linger.add('crater', P.x, P.z, touch * 0.55, funRand((clock * 30) | 0, id, 1) * TAU, RUST);
  if (rel === 'own') fx.cam.tier(1);
  // the fun layer: four paw prints splayed round the landing (the cat-shaped crater) and a dust burst
  const n = funCount(fx, 4);
  const k = funRank(fx, id, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.4;
    sticker(fx, P.x + Math.cos(a) * touch * 0.7, 0.14, P.z - Math.sin(a) * touch * 0.7, 'PAW', PRINT, 0.4 * k, 0.9, 0, 0, a);
  }
  stickerBurst(fx, P.x, 0.35, P.z, 'PUFF', DUST, 0.42, 0.5, 6, 2.6, 1, -1, 0.7);
  // her signature: one big terracotta paw print stamped on the landing spot, a deep bongo thump and the landing
  sticker(fx, P.x, 0.1, P.z, 'PAW', TERRA, 0.9 * k, 1.0, 0, 0, funRand((clock * 30) | 0, id, 2) * TAU);
  champCue(fx, id, 'land', P);
  skillSound(fx, id, 'q', 'impact', P);
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
  // the fun layer: radar rings pop off both ear tips, and a "!" over every enemy hero she hears (decoration only:
  // only heroes the viewer already draws, so it never reveals anything the sim does not)
  if (fx.bonePos(id, 'earL', Q)) sticker(fx, Q.x, Q.y + 0.2, Q.z, 'RING', CREAM, 0.5, 0.35, 1.2);
  if (fx.bonePos(id, 'earR', Q)) sticker(fx, Q.x, Q.y + 0.2, Q.z, 'RING', CREAM, 0.5, 0.35, 1.2);
  const mine = fx.relation(id);
  for (let o = 0; o < N; o++) {
    if (o === id || !isHero(fx, o) || !fx.heroPos(o, Q)) continue;
    const foe = mine === 'enemy' ? fx.relation(o) !== 'enemy' : fx.relation(o) === 'enemy';
    if (!foe || Math.hypot(Q.x - P.x, Q.z - P.z) > R) continue;
    sticker(fx, Q.x, s3HeadY(fx, o, 0.6), Q.z, 'EXCLAIM', BANG, 0.8, 0.8, 0.5);
  }
  // the sonar ripple of paw prints: prints running out from her to exactly the reveal radius in 0.6 s
  const n = funCount(fx, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const cx = Math.cos(a);
    const sz = -Math.sin(a);
    flying(fx, P.x + cx * 0.6, 0.15, P.z + sz * 0.6, (cx * (R - 0.6)) / 0.6, 0, (sz * (R - 0.6)) / 0.6, 'PAW', i & 1 ? CREAM : TERRA, 0.42, 0.6, a);
  }
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
  // the fun layer: a cartoon paw flashes over the swat, high and short of the target (readability QA: at body height it
  // covered the victim)
  sticker(fx, x + Math.cos(yaw) * L * 0.4, 2.5, z - Math.sin(yaw) * L * 0.4, 'PAW', side > 0 ? CREAM : PRINT, 0.6, 0.24, 0, 0, side * 0.5);
  // a paw print stamped at the end of the swat line, left paw terracotta then right paw cream
  sticker(fx, x + Math.cos(yaw) * L * 0.85, 0.1, z - Math.sin(yaw) * L * 0.85, 'PAW', side > 0 ? TERRA : CREAM, 0.5, 0.6, 0, 0, yaw + side * 0.3);
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
  // the fun layer: "ZOOM!", a dust burst, a chirp
  funPop(fx, id, 'ZOOM!', P.x, s3HeadY(fx, id, 0.6), P.z);
  stickerBurst(fx, P.x, 0.3, P.z, 'PUFF', DUST, 0.45, 0.5, 8, 3, 0.9, -1, 0.1);
  funSfx(fx, 'mew', P, 0.8);
}

/** A pounce landed on a hero: two crossed claw streaks on the victim, the slow ring, scratches on the ground. */
function pounceHit(src: number, dst: number, fx: FxCtx, tick = 0): void {
  if (!fx.heroPos(dst, Q)) return;
  const rel = fx.relation(src);
  const rim = fx.rim(src);
  const yaw = fx.heroPos(src, P) ? yawTo(P.x, P.z, Q.x, Q.z) : 0;
  // three seeded claw-mark variants (replays match): the crossed pair, a triple rake, a wide X with a paw stamp
  const v = (funRand(tick, src, 7) * 3) | 0;
  const spread = v === 2 ? 0.8 : 0.5;
  fx.mesh.spawn('crescent', { x: Q.x, z: Q.z, yaw: yaw + spread, sx: 1.2, life: 0.22, color: CREAM, rim, p0: 1.4, p1: 0.45, p2: 1, p3: 2.5, rel });
  fx.mesh.spawn('crescent', { x: Q.x, z: Q.z, yaw: yaw - spread, sx: 1.2, life: 0.22, color: TERRA, rim, p0: 1.4, p1: 0.45, p2: -1, p3: 2.5, rel, delay: 0.04 });
  // the triple rake: a third claw line on the ground (a glyph: the two streaks stay the readable hit)
  if (v === 1) fx.linger.add('scratches', Q.x, Q.z, 0.9, yaw - 0.35, RUST);
  fx.mesh.spawn('ring', { x: Q.x, z: Q.z, sx: 1.0, life: 0.35, color: TERRA, rim, p1: 0.3, rel });
  fx.linger.add('scratches', Q.x, Q.z, 0.7, yaw + (v - 1) * 0.35, RUST);
  const cy = s3HeadY(fx, dst, -0.5);
  // the paw stamp floats over the head, never on the body it hit (readability QA)
  if (v === 2) sticker(fx, Q.x, s3HeadY(fx, dst, 0.9), Q.z, 'PAW', CREAM, 0.6, 0.35, 0.4, 0, yaw);
  stickerBurst(fx, Q.x, cy, Q.z, 'STAR4', CREAM, 0.22, 0.3, 4, 2.4, 1.4, -4, funRand(tick, src, 8));
  // the pounce: her double bongo slap over the slash impact render/effects.ts plays on every basic
  champCue(fx, src, 'pounce', Q);
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
      // the clip's 'ping' sound has no cue alias: a radar chime
      funSfx(fx, 'chime', P, 0.6);
      return;
    }
    case 'tumble':
      // the death tumble (moves/stilts.ts death): the long legs land in a dust heap, a tuft of fur
      if (!fx.heroPos(id, P)) return;
      stickerBurst(fx, P.x, 0.3, P.z, 'PUFF', DUST, 0.42, 0.5, 6, 2.2, 0.8, -1, 0.5);
      stickerBurst(fx, P.x, 0.8, P.z, 'HAIRBALL', DUST, 0.2, 0.6, 3, 1.4, 1.6, -4, 0.2);
      return;
    case 'shake':
      // the respawn shake-off (moves/stilts.ts respawn): fluff and dust fly off her coat
      if (!fx.heroPos(id, P)) return;
      stickerBurst(fx, P.x, 1.1, P.z, 'HAIRBALL', DUST, 0.22, 0.55, 6, 2.6, 1.6, -5, 0.4);
      stickerBurst(fx, P.x, 0.3, P.z, 'PUFF', DUST, 0.36, 0.45, 4, 1.8, 0.7, -1, 0.9);
      return;
    case 'swat1':
      return;
    case 'swat2':
      if (!fx.heroPos(id, P)) return;
      swat(fx, id, P.x, P.z, facing[id], -1, 0);
      // the right paw: the slash and bongo again, a step higher (the left one played on the cast)
      skillSound(fx, id, 'e', 'cast', P, 1.33);
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
    const px = P.x - F.z * 0.2 * side - F.x * 0.45;
    const pz = P.z + F.x * 0.2 * side - F.z * 0.45;
    fx.mesh.spawn('glow', { x: px, z: pz, sx: PRINT_SIZE, life: PRINT_LIFE, color: RUST, rim, p3: 2, rel });
    // the fun layer: a paw-print sticker on the glow (it reads as a print, not a blob), a dust puff on every footfall,
    // speed lines streaming off her back; the print's tilt is seeded from the cast tick (replays match)
    const step = zoomStep[id]++;
    sticker(fx, px, 0.12, pz, 'PAW', PRINT, PRINT_SIZE * 0.95, PRINT_LIFE * 0.8, 0, 0, Math.atan2(F.z, F.x) + (funRand(zoomTick[id], id, step) - 0.5) * 0.6);
    if ((step & 1) === 0 || fx.tier === 'high') stickerBurst(fx, px, 0.2, pz, 'PUFF', DUST, 0.3, 0.35, 2, 1.1, 0.6, -1, funRand(zoomTick[id], id, step + 99));
    speedLines(fx, P.x - F.x * 0.5, 0.9, P.z - F.z * 0.5, F.x, F.z, 3, CREAM, 0.9, 6);
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
  pounceOnce.reset();
  lastSlot.fill(-1);
  lastCastAt.fill(-9);
  zoomTick.fill(0);
  zoomStep.fill(0);
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
    lastSlot[id] = e.slot;
    lastCastAt[id] = clock;
    if (e.slot === 3) {
      zoomTick[id] = e.tick;
      zoomStep[id] = 0;
    }
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
        pounceHit(id, e.dst, fx, e.tick);
      }
      return;
    }
    // an ability hit on a hero: a small dust puff on the victim
    if (isHero(fx, e.dst) && fx.heroPos(e.dst, Q)) {
      fx.mesh.spawn('glow', { x: Q.x, z: Q.z, sx: 0.8, life: 0.2, color: DUST, rim: fx.rim(id), rel: fx.relation(id) });
      const slot = clock - lastCastAt[id] < 2 ? lastSlot[id] : -1;
      // High Leap landed on a hero: "POUNCE!" once per leap
      if (slot === 0 && pounceOnce.take(id, clock, 1.6)) funPop(fx, id, 'POUNCE!', Q.x, s3HeadY(fx, e.dst, 0.6), Q.z);
      else if (slot === 2) stickerBurst(fx, Q.x, s3HeadY(fx, e.dst, -0.5), Q.z, 'STAR4', CREAM, 0.2, 0.28, 3, 2, 1.2, -4, funRand(e.tick, id, 9));
    }
  },
  onMarker: marker,
  update,
};
