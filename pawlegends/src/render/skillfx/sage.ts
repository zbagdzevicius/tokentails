/**
 * Sage's skill FX (ANIM-SPEC §14 "Sage", §7, §9). Wind core (mint), moonlight for the ult, the relation rim on every
 * mesh. Every gameplay shape uses the sim numbers from `fx.abil` (talents and the level-6 branch resolved):
 *
 * - Q Volley: a release fan exactly the volley's arc at the bow, one wind ribbon per arrow flying at the arrow's own
 *   speed along its own sim angle and range (Med: the centre and both edge arrows, High: all), ended where an arrow
 *   hits; Sticky Arrows: green goo on the victim.
 *   Piercing Shot (branch): a wind spear ribbon at the lance's speed and width, a short muzzle flash, a beam that grows
 *   with the lance's head (never ahead of the real shot), the ground wind-slash glyph along the 9 m line once the lance
 *   reaches it, T1 shake.
 * - W Sun Snare: placement OWN TEAM ONLY (rule 7: an unsprung trap is never drawn for enemies): a lob ribbon to the
 *   trap point, a sun flower whose petals unfold from the lob's landing to the arm, a closing flash and a petal glyph
 *   on the zone's real arm (onZone 'arm'). A SPRUNG trap is public crowd control: the vine-light root coil and its
 *   0.3 s flash are drawn for every viewer on the victim's rendered root edge (relation-tinted rim), from the zone
 *   ending early (own team), a routed 'zone' hit, or, for viewers who never see the trap, the root edge itself.
 * - E Hop Back: a gust twister and ring at take-off, a wind ribbon fed from the real snapshot path (never the aim, D7),
 *   claw-skid glyph on landing.
 * - R Moonshot: short wind pieces re-emitted only while the windup is live (a stun, fear or death stops them at once):
 *   a knee-high twister, wisps converging on the bow paw (never over the line telegraph), the moon forming at
 *   `charge1` / `charge2` over her head, a short muzzle flash and a beam growing with the shot's head up to 9 m, a moonlight ribbon at the shot's 60 m/s along its 40 m line
 *   (ended on the first HERO it hits; minions it passes through get a small ring), moon shards and the Moon Mark sigil.
 * - Steady Paw: wind rings at the bow on the pierce bolt (the bolt's own trail is the projectile renderer's), T1 shake;
 *   every own bolt keeps moves/sage.ts STEADY in sync, so the knee-drop pose predicts the pierce.
 *
 * Hits are classified by the live flight tracks (which shot's head is at the target), never by the last cast slot, so
 * an E or Q cast while the Moonshot flies does not misroute its hit. Tracks exist on every tier; only the ribbon is
 * tier-gated. Pooled: fixed tables, no allocation per frame or per event.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { CAPS } from '../../data/map';
import { STEADY } from '../moves/sage';
import { HEROES } from '../../data/heroes';
import { DASH_SPEED, TICK_HZ, TICK_S, travelTicks } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxSpawn, MoveCtx, SkillFxSet, V3Out } from '../anim/types';

/** Wind core, wind edge, moonlight, sun (trap), goo. */
const WIND = 0xbfffe8;
const WIND_DEEP = 0x5fe6c0;
const MOON = 0xe8f0ff;
const MOON_DEEP = 0x9fb8ff;
const SUN = 0xffd77a;
const GOO = 0x9dff6a;
const EVERY_NTH = HEROES.sage.passive.everyNth ?? 4;
const TAU = Math.PI * 2;
/** Arrow height above the ground (m), roughly the bow at full draw. */
const ARROW_Y = 1.05;
/** The Moonshot charge moon's height (m): over her head line, so the kneel and the draw under it stay readable. */
const MOON_Y = 1.75;
/** Hero entity ids are 0 … CAPS.heroes − 1 (sim RANGE.heroes = 0): anything above is a minion, tower or monster. */
const HERO_N = CAPS.heroes;
/** BuffFlag bits (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
const ROOTED = 1 << 4;
const FEARED = 1 << 5;
/** The lob lands at this share of the arm; the flower unfolds from there to the arm. */
const LOB = 0.4;

const enum K {
  Arrow = 0,
  Lance = 1,
  Moon = 2,
  Lob = 3,
  Dash = 4,
}

/** Simulated flight tracks (arrows, lance, moonshot, lob) and the dash path; a ribbon is attached when the tier has
 *  one (slot ≥ 0). A track outlives its ribbon by GRACE so a hit on the range's last frame still classifies. */
const N = 24;
const GRACE = 0.12;
const tOn = new Uint8Array(N);
const tKind = new Uint8Array(N);
const tOwner = new Int16Array(N);
const tSlot = new Int16Array(N);
const tX = new Float32Array(N);
const tZ = new Float32Array(N);
const tDX = new Float32Array(N);
const tDZ = new Float32Array(N);
const tSpeed = new Float32Array(N);
const tRange = new Float32Array(N);
const tW = new Float32Array(N);
const tAge = new Float32Array(N);
const tLife = new Float32Array(N);
/** A shot beam that grows with the head (lance, Moonshot): max length (m, 0 = none) and the next emission (track age).
 *  Each emission is a short-lived beam from the muzzle to the head, so the beam never claims line the shot has not
 *  reached yet. Med / High only (Low keeps the ribbon). */
const tBeam = new Float32Array(N);
const tBeamNext = new Float32Array(N);
const BEAM_STEP = 0.05;
const BEAM_LIFE = 0.1;
/** The muzzle flash beam (m): short, at the bow; the shot's own line is drawn by the growing beam and the ribbon. */
const MUZZLE = 1.5;

/** Own-team Sun Snare traps (enemies never see them): position, radius, the zone index once the snapshot shows it,
 *  cast time, expiry, and the render time the zone ended early (sprung, waiting for the victim's rendered root). */
const TR = 12;
const trOn = new Uint8Array(TR);
const trOwner = new Int16Array(TR);
const trZone = new Int16Array(TR).fill(-1);
const trX = new Float32Array(TR);
const trZ = new Float32Array(TR);
const trR = new Float32Array(TR);
const trCast = new Float64Array(TR);
const trUntil = new Float64Array(TR);
const trSprung = new Float64Array(TR);
/** A sprung trap waits this long for the victim's rendered root edge, then draws on the nearest enemy in reach. */
const SPRUNG_WAIT = 0.35;

/** Per hero id: seen as a Sage, rooted last frame, last coil time, a deferred root check (a Lambo might be the root). */
const ID_N = 16;
const sageSeen = new Uint8Array(ID_N);
const rootPrev = new Uint8Array(ID_N);
const coilAt = new Float64Array(ID_N).fill(-9);
const rootCheckAt = new Float64Array(ID_N).fill(-1);
const rootCheckOwner = new Int16Array(ID_N);
const rootX = new Float32Array(ID_N);
const rootZ = new Float32Array(ID_N);

/** Moonshot windup per caster: live until (render s), aim yaw, next emission, rings emitted (bits). */
const wUntil = new Float64Array(ID_N);
const wStart = new Float64Array(ID_N);
const wYaw = new Float32Array(ID_N);
const wNext = new Float64Array(ID_N);
const wRings = new Uint8Array(ID_N);
/** Windup pieces live this long and are re-emitted every WIND_STEP while the windup is live. */
const WIND_PIECE = 0.15;
const WIND_STEP = 0.1;

let clock = 0;

const _p: V3Out = { x: 0, y: 0, z: 0 };
const _q: V3Out = { x: 0, y: 0, z: 0 };
const _r: V3Out = { x: 0, y: 0, z: 0 };
const _src: V3Out = { x: 0, y: 0, z: 0 };
const ST: HeroStatus = { buffs: 0, shield: 0 };
/** One reused spawn record (mesh.spawn copies what it needs). */
const S: MeshFxSpawn = { x: 0, z: 0, sx: 1, life: 0.3, color: WIND, rim: 0, rel: 'own' };
const SHOCK = { r1: 2, dur: 0.3, color: '#bfffe8', height: 0.5, intensity: 1 };
const SHOCK_POS = { x: 0, y: 0, z: 0 };
const AT = { x: 0, z: 0 };

function spawn(fx: FxCtx, kind: Parameters<FxCtx['mesh']['spawn']>[0], id: number, x: number, z: number, sx: number, life: number, color: number, o?: { y?: number; yaw?: number; sy?: number; sz?: number; p0?: number; p1?: number; p2?: number; p3?: number; delay?: number }): void {
  S.x = x;
  S.z = z;
  S.sx = sx;
  S.life = life;
  S.color = color;
  S.rim = fx.rim(id);
  S.rel = fx.relation(id);
  S.y = o?.y;
  S.yaw = o?.yaw;
  S.sy = o?.sy;
  S.sz = o?.sz;
  S.p0 = o?.p0;
  S.p1 = o?.p1;
  S.p2 = o?.p2;
  S.p3 = o?.p3;
  S.delay = o?.delay;
  fx.mesh.spawn(kind, S);
}

function shock(fx: FxCtx, x: number, z: number, r1: number, dur: number, color: string, height: number): void {
  SHOCK_POS.x = x;
  SHOCK_POS.z = z;
  SHOCK.r1 = r1;
  SHOCK.dur = dur;
  SHOCK.color = color;
  SHOCK.height = height;
  fx.shock.start(SHOCK_POS, SHOCK);
}

/** 1 when the id is on the viewer's enemy side, else 0 (own and ally are one side). */
const side = (fx: FxCtx, id: number): number => (fx.relation(id) === 'enemy' ? 1 : 0);

/** The hero kind behind an id, when the runtime exposes its lookup (FxRuntime does; test stubs may not). */
type WithLookup = { lookup?: { heroOf?(id: number): string | null } };
const heroOf = (fx: FxCtx, id: number): string | null => (fx as unknown as WithLookup).lookup?.heroOf?.(id) ?? null;
const isSage = (fx: FxCtx, id: number): boolean => (id >= 0 && id < ID_N && sageSeen[id] === 1) || heroOf(fx, id) === 'sage';
const seen = (id: number): void => {
  if (id >= 0 && id < ID_N) sageSeen[id] = 1;
};

/** Start a flight track (always, on every tier: hits are classified by it); `ribbon` attaches a ribbon if the pool
 *  has one. Returns the track index or −1 when the table is full. */
function track(fx: FxCtx, kind: K, owner: number, x: number, z: number, yaw: number, speed: number, range: number, color: number, width: number, life: number, y = ARROW_Y, ribbon = true): number {
  let i = -1;
  for (let k = 0; k < N; k++)
    if (!tOn[k]) {
      i = k;
      break;
    }
  if (i < 0) return -1;
  _src.x = x;
  _src.y = y;
  _src.z = z;
  tOn[i] = 1;
  tKind[i] = kind;
  tOwner[i] = owner;
  tSlot[i] = ribbon ? fx.ribbons.point(_src, color, width, life) : -1;
  tX[i] = x;
  tZ[i] = z;
  tDX[i] = Math.cos(yaw);
  tDZ[i] = -Math.sin(yaw);
  tSpeed[i] = speed;
  tRange[i] = range;
  tW[i] = width;
  tAge[i] = 0;
  tLife[i] = speed > 0 ? range / speed : range;
  tBeam[i] = 0;
  tBeamNext[i] = 0;
  return i;
}

/** End a track's ribbon; the track itself stays (for GRACE past its flight) so a late hit still classifies. */
function endRibbon(fx: FxCtx, i: number): void {
  if (tSlot[i] >= 0) fx.ribbons.end(tSlot[i]);
  tSlot[i] = -1;
}

function endTrack(fx: FxCtx, i: number): void {
  if (!tOn[i]) return;
  endRibbon(fx, i);
  tOn[i] = 0;
}

/**
 * The live shot of `owner` whose head is at (qx, qz): the along-line distance within a tick and a half of travel
 * (≥ 1.5 m) of the head, the lateral distance inside the shot's half width + 1 m. Kinds by bit (1 << K). −1: none.
 */
function shotAt(owner: number, qx: number, qz: number, kinds: number): number {
  let best = -1;
  let bs = Infinity;
  for (let i = 0; i < N; i++) {
    if (!tOn[i] || tOwner[i] !== owner || !(kinds & (1 << tKind[i]))) continue;
    const head = Math.min(tRange[i], tSpeed[i] * tAge[i]);
    const px = qx - tX[i];
    const pz = qz - tZ[i];
    const along = px * tDX[i] + pz * tDZ[i];
    const lat = Math.abs(px * tDZ[i] - pz * tDX[i]);
    const da = Math.abs(along - head);
    if (da > Math.max(1.5, tSpeed[i] * TICK_S * 1.5) || lat > tW[i] * 0.5 + 1) continue;
    const s = da + lat;
    if (s < bs) (bs = s), (best = i);
  }
  return best;
}

/** World yaw from the hero at p to the cast point (sim mm). */
const aimYaw = (p: V3Out, ex: number, ey: number): number => Math.atan2(ey / 1000 + p.z, ex / 1000 - p.x);

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: { src: number; x: number; y: number }, fx: FxCtx, ctx: MoveCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'q');
  const yaw = aimYaw(_p, e.x, e.y);
  const range = (a.range ?? 7000) / 1000;
  const speed = (a.speed ?? 20000) / 1000;
  const sticky = (a.slowBp ?? 0) > 0;
  const own = fx.relation(id) === 'own';
  if ((a.lance ?? 0) > 0 || ctx.branch) {
    // Piercing Shot: muzzle beam the lance's width, the spear ribbon at its speed, a ground slash along the exact line
    const w = (a.width ?? 600) / 1000;
    // a short muzzle flash only: the line itself grows with the lance's head (update), never ahead of it
    spawn(fx, 'beam', id, _p.x, _p.z, MUZZLE, 0.16, WIND, { y: ARROW_Y, yaw, sz: w, p3: 1 });
    spawn(fx, 'beam', id, _p.x, _p.z, MUZZLE, 0.1, 0xffffff, { y: ARROW_Y, yaw, sz: w * 0.35, p3: 1 });
    if (fx.tier !== 'low') spawn(fx, 'twister', id, _p.x + Math.cos(yaw) * 0.5, _p.z - Math.sin(yaw) * 0.5, 0.5, 0.28, WIND, { sy: 1.2, sz: 0.5, p3: 0.9 });
    spawn(fx, 'glow', id, _p.x + Math.cos(yaw) * 0.6, _p.z - Math.sin(yaw) * 0.6, 1.1, 0.25, WIND, { y: ARROW_Y });
    spawn(fx, 'ring', id, _p.x, _p.z, 1.6, 0.3, WIND, { p1: 0.2 });
    const li = track(fx, K.Lance, id, _p.x, _p.z, yaw, speed, range, sticky ? GOO : WIND, w, 0.28);
    // the ground slash is laid when the lance reaches its range (update), not along the whole line on the cast
    if (li >= 0) tBeam[li] = range;
    if (own) fx.cam.tier(1);
    fx.sfx.cue('whooshL', _p);
    return;
  }
  // Volley: the release fan is exactly the volley arc, short (it is the bow's flash, not a cone hitbox)
  const n = Math.max(1, a.arrows ?? 5);
  const arc = ((a.arc ?? 569) / 4096) * TAU;
  spawn(fx, 'crescent', id, _p.x, _p.z, 2.8, 0.3, sticky ? GOO : WIND, { y: 0.9, yaw, p0: arc, p1: 0.35, p2: 1 });
  if (fx.tier !== 'low') spawn(fx, 'crescent', id, _p.x, _p.z, 2.1, 0.26, WIND_DEEP, { y: 0.7, yaw, p0: arc, p1: 0.25, p2: -1, delay: 0.05 });
  spawn(fx, 'glow', id, _p.x + Math.cos(yaw) * 0.5, _p.z - Math.sin(yaw) * 0.5, 1.2, 0.22, WIND, { y: ARROW_Y });
  spawn(fx, 'ring', id, _p.x, _p.z, 1.3, 0.25, WIND, { p1: 0.15 });
  // a track per arrow (hit classification); a ribbon on every arrow on High, the centre and both edges on Med
  const all = fx.tier === 'high';
  for (let i = 0; i < n; i++) {
    const ribbon = all || i === 0 || i === n - 1 || i === n >> 1;
    const ay = n > 1 ? yaw - arc / 2 + (arc * i) / (n - 1) : yaw;
    track(fx, K.Arrow, id, _p.x, _p.z, ay, speed, range, sticky ? GOO : WIND, 0.22, 0.16, ARROW_Y, ribbon);
  }
  fx.sfx.cue('whooshM', _p);
}

function castW(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  // rule 7: an unsprung trap is never drawn for enemies (not even the toss)
  if (fx.relation(id) === 'enemy') return;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'w');
  const tx = e.x / 1000;
  const tz = -e.y / 1000;
  const r = (a.radius ?? 1000) / 1000;
  const arm = (a.arm ?? 15) * TICK_S;
  const lob = arm * LOB;
  // the lob: a ribbon on a parabola from her paw to the trap point over the first 40% of the arm
  const li = track(fx, K.Lob, id, _p.x, _p.z, Math.atan2(-(tz - _p.z), tx - _p.x), 0, Math.max(0.05, lob), SUN, 0.24, 0.26, 0.9);
  if (li >= 0) {
    tDX[li] = tx;
    tDZ[li] = tz;
  }
  // the sun flower: petals unfold from the lob's landing to exactly the arm, the sun core and bud under them
  const petals = fx.tier === 'low' ? 3 : 6;
  for (let k = 0; k < petals; k++) {
    const yaw = (k / petals) * TAU;
    spawn(fx, 'crescent', id, tx, tz, r, arm - lob, SUN, { y: 0.05, yaw, p0: TAU / petals - 0.12, p1: 0.25, p2: k % 2 ? 1 : -1, p3: 0.8, delay: lob });
  }
  spawn(fx, 'glow', id, tx, tz, r * 0.7, arm - lob, SUN, { y: 0.05, delay: lob });
  // a small sun bud floating over the trap while it arms (vertical shapes read on bright ground; inside the radius)
  spawn(fx, 'glow', id, tx, tz, r * 0.55, arm - lob, SUN, { y: 0.9, delay: lob });
  // the sim drops the owner's oldest trap past maxTraps: forget it here too, so its zone end never reads as sprung
  const max = a.maxTraps ?? 2;
  let count = 0;
  let oldest = -1;
  for (let i = 0; i < TR; i++) {
    if (!trOn[i] || trOwner[i] !== id) continue;
    if (clock >= trUntil[i]) {
      trOn[i] = 0;
      continue;
    }
    count++;
    if (oldest < 0 || trCast[i] < trCast[oldest]) oldest = i;
  }
  if (count >= max && oldest >= 0) trOn[oldest] = 0;
  // remember the trap (a free slot, else the oldest)
  let k = 0;
  for (let i = 0; i < TR; i++) {
    if (!trOn[i]) {
      k = i;
      break;
    }
    if (trCast[i] < trCast[k]) k = i;
  }
  trOn[k] = 1;
  trOwner[k] = id;
  trZone[k] = -1;
  trX[k] = tx;
  trZ[k] = tz;
  trR[k] = r;
  trCast[k] = clock;
  // the zone's ttl counts from the cast (arm included)
  trUntil[k] = clock + (a.duration ?? 900) * TICK_S;
  trSprung[k] = -1;
}

/** The trap's arm (the zone's real arm from the snapshot): petals close into the sun, a flash, the petal glyph. */
function armFlash(k: number, fx: FxCtx): void {
  const id = trOwner[k];
  spawn(fx, 'glow', id, trX[k], trZ[k], 1.2, 0.3, SUN, { y: 0.06 });
  spawn(fx, 'ring', id, trX[k], trZ[k], 1.0, 0.25, SUN, { p1: 0.6 });
  spawn(fx, 'pillar', id, trX[k], trZ[k], 0.5, 0.45, SUN, { sy: 3.5, sz: 0.5 });
  // the additive meshes wash out on sand: a solid shockwave ring at exactly the trap radius marks the arm
  shock(fx, trX[k], trZ[k], trR[k], 0.35, '#ffc23d', 0.35);
  fx.linger.add('petals', trX[k], trZ[k], 0.8, 0, SUN);
  if (fx.relation(id) === 'own') {
    AT.x = trX[k];
    AT.z = trZ[k];
    fx.sfx.cue('pop', AT, 0.6);
  }
}

/**
 * A Sun Snare rooted `victim` (owned by Sage `owner`): the vine-light coil for the root time and the 0.3 s flash, for
 * EVERY viewer (sprung crowd control is public; the relation rim tints it). Only the camera is own-only. Once per
 * victim per root.
 */
function coil(owner: number, victim: number, r: number, fx: FxCtx): void {
  if (victim >= 0 && victim < ID_N) {
    if (clock - coilAt[victim] < 0.5) return;
    coilAt[victim] = clock;
    rootCheckAt[victim] = -1;
  }
  if (!fx.heroPos(victim, _q)) return;
  const root = (fx.abil(owner, 'w').root ?? 30) * TICK_S;
  spawn(fx, 'twister', owner, _q.x, _q.z, 0.55, root, SUN, { sy: 1.3, sz: 0.55, p3: 0.5 });
  spawn(fx, 'glow', owner, _q.x, _q.z, 0.9, root, SUN, { y: 0.05 });
  spawn(fx, 'pillar', owner, _q.x, _q.z, 0.45, 0.3, SUN, { sy: 3, sz: 0.45 });
  spawn(fx, 'ring', owner, _q.x, _q.z, r, 0.3, SUN, { p1: 0.5 });
  shock(fx, _q.x, _q.z, r, 0.3, '#ffc23d', 0.6);
  if (fx.relation(owner) === 'own') fx.cam.tier(1);
}

/** The own sprung trap a root on `victim` (at _r) belongs to, or −1. */
function sprungFor(victim: number, fx: FxCtx): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < TR; i++) {
    if (!trOn[i] || side(fx, trOwner[i]) === side(fx, victim)) continue;
    const d = Math.hypot(_r.x - trX[i], _r.z - trZ[i]);
    if (d > trR[i] + 1.0) continue;
    // a pending sprung trap first; an armed live one (a routed hit or a root before the zone end shows) next
    const s = d + (trSprung[i] >= 0 ? 0 : 100);
    if (s < bd) (bd = s), (best = i);
  }
  return best;
}

/** A visible enemy Sage of `victim`'s side whose traps this viewer cannot see, and whether a Lambo stands with her
 *  (his ult also roots: the root then has to hold still for a moment to read as a trap). Returns the Sage id or −1. */
let lamboNear = false;
function hiddenTrapper(victim: number, fx: FxCtx): number {
  const vs = side(fx, victim);
  let sage = -1;
  lamboNear = false;
  for (let id = 0; id < HERO_N; id++) {
    if (side(fx, id) === vs || side(fx, id) === 0) continue;
    if (isSage(fx, id)) sage = id;
    else if (heroOf(fx, id) === 'lambo') lamboNear = true;
  }
  return sage;
}

function castE(e: { src: number }, fx: FxCtx): void {
  const id = e.src;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'e');
  // the dash path ribbon, fed from the hero's real (snapshot) position for the travel ticks
  const life = travelTicks(a.dash ?? 3000, DASH_SPEED) * TICK_S + 0.12;
  const i = track(fx, K.Dash, id, _p.x, _p.z, 0, 0, life, WIND, 0.5, 0.3, 1.0);
  if (i >= 0) tLife[i] = life;
}

function castR(e: { src: number; x: number; y: number }, fx: FxCtx): void {
  const id = e.src;
  if (id >= 0 && id < ID_N) wUntil[id] = 0;
  if (!fx.heroPos(id, _p)) return;
  const a = fx.abil(id, 'r');
  const yaw = aimYaw(_p, e.x, e.y);
  const w = (a.width ?? 1200) / 1000;
  const speed = (a.speed ?? 60000) / 1000;
  const range = (a.range ?? 40000) / 1000;
  // muzzle: a short flash the shot's width (the line grows with the shot's head in update, up to 9 m), the moon
  // flash at the bow, a small low ring under her (ground telegraphs around her stay readable)
  spawn(fx, 'beam', id, _p.x, _p.z, Math.min(range, MUZZLE), 0.2, MOON, { y: ARROW_Y, yaw, sz: w, p3: 1 });
  spawn(fx, 'beam', id, _p.x, _p.z, Math.min(range, MUZZLE), 0.14, 0xffffff, { y: ARROW_Y, yaw, sz: w * 0.4, p3: 1 });
  spawn(fx, 'crescent', id, _p.x + Math.cos(yaw) * 0.7, _p.z - Math.sin(yaw) * 0.7, 1.1, 0.45, MOON, { y: 1.5, yaw: yaw + Math.PI * 0.5, p0: 4.2, p1: 0.62, p2: 1 });
  spawn(fx, 'glow', id, _p.x + Math.cos(yaw) * 0.7, _p.z - Math.sin(yaw) * 0.7, 1.6, 0.35, MOON, { y: ARROW_Y });
  shock(fx, _p.x, _p.z, 1.6, 0.3, '#cfe0ff', 0.3);
  const mi = track(fx, K.Moon, id, _p.x, _p.z, yaw, speed, range, MOON, w, 0.42);
  if (mi >= 0) tBeam[mi] = Math.min(range, 9);
  fx.sfx.cue('fwoomp', _p);
}

/**
 * One batch of Moonshot windup pieces (each WIND_PIECE long, so an interrupted windup clears within that): a faint
 * ankle-high twister at her feet on Med / High only (sy 0.25: the kneel, plant, draw and back lean stay readable), a
 * dim moon-blue ground glow, and wisps converging on the bow paw from outside the aim side (never over the line
 * telegraph's start). Two ground rings. The brightest piece is the moon forming over her head (charge1 / charge2).
 */
function windPieces(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, _p)) return;
  const span = Math.max(1e-3, wUntil[id] - wStart[id]);
  const prog = Math.min(1, (clock - wStart[id]) / span);
  spawn(fx, 'glow', id, _p.x, _p.z, 1.3, WIND_PIECE, MOON_DEEP, { y: 0.05, p3: 0.6 });
  if (fx.tier !== 'low') {
    spawn(fx, 'twister', id, _p.x, _p.z, 1.0, WIND_PIECE, WIND, { sy: 0.25, sz: 1.0, p3: 0.2 });
    const paw = fx.bonePos(id, 'pawL', _q);
    const py = paw ? _q.y : 1.0;
    const px = paw ? _q.x : _p.x;
    const pz = paw ? _q.z : _p.z;
    const R = 1.2 - 0.45 * prog;
    const wisps = fx.tier === 'high' ? 3 : 2;
    for (let k = 0; k < wisps; k++) {
      // spread over the back three quarters of the circle, rotating with the charge; the aim side ±0.7 rad stays clear
      const a = wYaw[id] + 0.7 + ((k + prog * 2.3) / wisps) * (TAU - 1.4);
      const sx = _p.x + Math.cos(a) * R;
      const sz = _p.z - Math.sin(a) * R;
      const yaw = Math.atan2(-(pz - sz), px - sx);
      const len = Math.min(0.8, Math.hypot(px - sx, pz - sz) * 0.85);
      spawn(fx, 'beam', id, sx, sz, len, WIND_PIECE, k % 2 ? MOON : WIND, { y: py, yaw, sz: 0.07, p3: 1 });
    }
  }
  if (!(wRings[id] & 1)) {
    wRings[id] |= 1;
    spawn(fx, 'ring', id, _p.x, _p.z, 1.5, 0.25, WIND, { p1: 0.9 });
  }
  if (prog >= 0.45 && !(wRings[id] & 2)) {
    wRings[id] |= 2;
    spawn(fx, 'ring', id, _p.x, _p.z, 1.5, 0.25, WIND, { p1: 0.9 });
  }
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  hero: 'sage',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    seen(e.src);
    if (e.slot !== 3) return;
    const id = e.src;
    if (id < 0 || id >= ID_N || !fx.heroPos(id, _p)) return;
    wStart[id] = clock;
    wUntil[id] = clock + e.ticks / TICK_HZ;
    wYaw[id] = aimYaw(_p, e.x, e.y);
    wRings[id] = 0;
    wNext[id] = clock + WIND_STEP;
    windPieces(id, fx);
  },

  onCast(e, fx, ctx) {
    seen(e.src);
    if (e.slot === 0) castQ(e, fx, ctx);
    else if (e.slot === 1) castW(e, fx);
    else if (e.slot === 2) castE(e, fx);
    else if (e.slot === 3) castR(e, fx);
  },

  onHit(e, fx) {
    const id = e.src;
    if (id < 0 || id >= ID_N) return;
    if (!fx.heroPos(e.dst, _q)) return;
    if (e.kind === 'zone') {
      // a sprung Sun Snare (her only zone; a 0-damage 'zone' hit): public crowd control, drawn for every viewer
      _r.x = _q.x;
      _r.z = _q.z;
      const k = sprungFor(e.dst, fx);
      if (k >= 0) trOn[k] = 0;
      coil(id, e.dst, k >= 0 ? trR[k] : (fx.abil(id, 'w').radius ?? 1000) / 1000, fx);
      return;
    }
    if (e.kind !== 'ability') return;
    const qx = _q.x;
    const qz = _q.z;
    // which live shot is at the target: the Moonshot first (the bigger, longer one), then an arrow or the lance
    const moon = shotAt(id, qx, qz, 1 << K.Moon);
    if (moon >= 0) {
      if (e.dst < 0 || e.dst >= HERO_N) {
        // it passes through minions (half damage): a small ring, the moonlight keeps flying
        spawn(fx, 'ring', id, qx, qz, 0.6, 0.2, MOON, { p1: 0.2 });
        return;
      }
      // it stops on the first hero: moon shards, a ring, the Moon Mark sigil
      endTrack(fx, moon);
      for (let k = 0; k < 3; k++) spawn(fx, 'crescent', id, qx, qz, 1.4 + k * 0.35, 0.35, k === 1 ? MOON_DEEP : MOON, { y: 1.0, yaw: k * 2.1, p0: 2.2, p1: 0.55, p2: k % 2 ? 1 : -1 });
      spawn(fx, 'glow', id, qx, qz, 1.8, 0.4, MOON, { y: 0.8 });
      shock(fx, qx, qz, 2.2, 0.3, '#e8f0ff', 0.5);
      const a = fx.abil(id, 'r');
      if ((a.reveal ?? 0) > 0) spawn(fx, 'arc', id, qx, qz, 0.9, Math.min(4, a.reveal * TICK_S), MOON_DEEP, { y: 0.06, p0: TAU, p1: 0.82 });
      if (fx.relation(id) === 'own') fx.cam.tier(3);
      return;
    }
    const shot = shotAt(id, qx, qz, (1 << K.Arrow) | (1 << K.Lance));
    if (shot < 0) return;
    // an arrow stops on its first unit (end its ribbon there); the lance pierces on
    if (tKind[shot] === K.Arrow) endTrack(fx, shot);
    const a = fx.abil(id, 'q');
    if ((a.slowBp ?? 0) > 0) spawn(fx, 'glow', id, qx, qz, 0.9, 0.5, GOO, { y: 0.3 });
    spawn(fx, 'ring', id, qx, qz, 0.8, 0.22, WIND, { p1: 0.1 });
  },

  onZone(zoneIndex, phase, fx) {
    if (phase === 'spawn') {
      // the newest own trap cast in the last 0.6 s without a zone yet is this one
      let k = -1;
      for (let i = 0; i < TR; i++) if (trOn[i] && trZone[i] < 0 && clock - trCast[i] < 0.6 && (k < 0 || trCast[i] > trCast[k])) k = i;
      if (k >= 0) trZone[k] = zoneIndex;
      return;
    }
    let k = -1;
    for (let i = 0; i < TR; i++) if (trOn[i] && trZone[i] === zoneIndex) k = i;
    if (k < 0) return;
    if (phase === 'arm') armFlash(k, fx);
    else if (phase === 'end') {
      trZone[k] = -1;
      // ended before its ttl: it sprang (the drop past maxTraps forgot it in castW); the coil waits for the root
      if (clock < trUntil[k] - 0.15) trSprung[k] = clock;
      else trOn[k] = 0;
    }
  },

  onMarker(id, _clip, marker, fx) {
    seen(id);
    switch (marker) {
      case 'loose': {
        // basic release: a small wind puff at the bow (kept tiny: basics are frequent)
        if (fx.tier === 'low' || !fx.bonePos(id, 'pawL', _p) || !fx.heroPos(id, _q)) return;
        const yaw = Math.atan2(-(_p.z - _q.z), _p.x - _q.x);
        spawn(fx, 'glow', id, _p.x, _p.z, 0.4, 0.12, WIND, { y: _p.y });
        spawn(fx, 'beam', id, _p.x, _p.z, 1.4, 0.12, WIND, { y: _p.y, yaw, sz: 0.12, p3: 1 });
        return;
      }
      case 'steady':
        return;
      case 'gust': {
        if (!fx.heroPos(id, _p)) return;
        spawn(fx, 'twister', id, _p.x, _p.z, 0.75, 0.32, WIND, { sy: 1.4, sz: 0.75, p3: 0.8 });
        spawn(fx, 'ring', id, _p.x, _p.z, 1.6, 0.32, WIND, { p1: 0.15 });
        return;
      }
      case 'skid': {
        if (!fx.heroPos(id, _p)) return;
        // the claw skid along the hop direction (the dash track remembers where it started)
        let yaw = 0;
        for (let i = 0; i < N; i++) if (tKind[i] === K.Dash && tOwner[i] === id) yaw = Math.atan2(-(_p.z - tZ[i]), _p.x - tX[i]);
        fx.linger.add('scratches', _p.x, _p.z, 0.7, yaw + Math.PI * 0.5, WIND_DEEP);
        spawn(fx, 'ring', id, _p.x, _p.z, 1.1, 0.25, WIND, { p1: 0.2 });
        return;
      }
      case 'charge1': {
        // the moon forming at the bow paw, raised over her head line: the brightest piece of the windup
        if (!fx.bonePos(id, 'pawL', _p)) return;
        const y = Math.max(_p.y + 0.35, MOON_Y);
        spawn(fx, 'glow', id, _p.x, _p.z, 1.6, 0.42, MOON, { y, p3: 1.6 });
        spawn(fx, 'crescent', id, _p.x, _p.z, 1.2, 0.42, MOON, { y: y + 0.1, p0: 4.0, p1: 0.6, p2: 1, p3: 1.5 });
        return;
      }
      case 'charge2': {
        if (!fx.bonePos(id, 'pawL', _p)) return;
        const y = Math.max(_p.y + 0.35, MOON_Y);
        spawn(fx, 'glow', id, _p.x, _p.z, 1.9, 0.16, MOON, { y, p3: 1.8 });
        spawn(fx, 'crescent', id, _p.x, _p.z, 1.45, 0.18, MOON, { y: y + 0.1, p0: 4.4, p1: 0.62, p2: -1, p3: 1.6 });
        if (fx.heroPos(id, _q)) spawn(fx, 'ring', id, _q.x, _q.z, 1.5, 0.14, MOON, { p1: 0.95 });
        return;
      }
      case 'reset':
        // death: the step counter and any live windup die with her
        if (id >= 0 && id < STEADY.length) STEADY[id] = 0;
        if (id >= 0 && id < ID_N) wUntil[id] = 0;
        return;
      case 'respawn': {
        if (id >= 0 && id < STEADY.length) STEADY[id] = 0;
        if (!fx.heroPos(id, _p)) return;
        spawn(fx, 'pillar', id, _p.x, _p.z, 0.55, 0.5, WIND, { sy: 4, sz: 0.55 });
        spawn(fx, 'ring', id, _p.x, _p.z, 2.0, 0.4, WIND, { p1: 0.1 });
        return;
      }
      case 'skyArrow': {
        if (!fx.heroPos(id, _p)) return;
        spawn(fx, 'pillar', id, _p.x, _p.z, 0.08, 0.35, WIND, { sy: 7, sz: 0.08 });
        return;
      }
      default:
        return;
    }
  },

  onProjectile(owner, kind, _slot, fx) {
    if (owner < 0 || owner >= STEADY.length) return;
    seen(owner);
    if (kind === PROJECTILE_KIND.hero) {
      STEADY[owner] = (STEADY[owner] + 1) % (EVERY_NTH * 64);
      return;
    }
    if (kind !== PROJECTILE_KIND.pierce) return;
    // Steady Paw: the real pierce bolt (resync the knee-drop prediction) and wind rings at the bow
    STEADY[owner] = 0;
    if (!fx.heroPos(owner, _p)) return;
    spawn(fx, 'ring', owner, _p.x, _p.z, 1.4, 0.26, WIND, { p1: 0.25 });
    spawn(fx, 'ring', owner, _p.x, _p.z, 2.2, 0.36, WIND_DEEP, { p1: 0.5, delay: 0.06 });
    if (fx.bonePos(owner, 'pawL', _q)) spawn(fx, 'glow', owner, _q.x, _q.z, 0.9, 0.2, WIND, { y: _q.y });
    if (fx.tier !== 'low') spawn(fx, 'twister', owner, _p.x, _p.z, 0.6, 0.25, WIND, { sy: 1.2, sz: 0.6, p3: 0.6 });
    if (fx.relation(owner) === 'own') fx.cam.tier(1);
  },

  update(dt, fx) {
    clock += dt;
    // flight tracks
    for (let i = 0; i < N; i++) {
      if (!tOn[i]) continue;
      tAge[i] += dt;
      const k = tKind[i];
      if (k === K.Dash) {
        if (tSlot[i] >= 0 && fx.heroPos(tOwner[i], _p)) fx.ribbons.feed(tSlot[i], _p.x, 1.0, _p.z);
        if (tAge[i] >= tLife[i]) endTrack(fx, i);
        continue;
      }
      if (k === K.Lob) {
        const s = Math.min(1, tAge[i] / tRange[i]);
        const x = tX[i] + (tDX[i] - tX[i]) * s;
        const z = tZ[i] + (tDZ[i] - tZ[i]) * s;
        if (tSlot[i] >= 0) fx.ribbons.feed(tSlot[i], x, 0.9 * (1 - s) + 1.6 * 4 * s * (1 - s) + 0.05, z);
        if (s >= 1) endTrack(fx, i);
        continue;
      }
      const d = Math.min(tRange[i], tSpeed[i] * tAge[i]);
      if (tBeam[i] > 0 && tAge[i] >= tBeamNext[i]) {
        // the beam grows with the head: muzzle → head, re-emitted every BEAM_STEP until it reaches its max length
        tBeamNext[i] += BEAM_STEP;
        const len = Math.min(d, tBeam[i]);
        if (fx.tier !== 'low' && len > MUZZLE * 0.5)
          spawn(fx, 'beam', tOwner[i], tX[i], tZ[i], len, BEAM_LIFE, k === K.Moon ? MOON : WIND, { y: ARROW_Y, yaw: Math.atan2(-tDZ[i], tDX[i]), sz: tW[i] * 0.5, p3: 1 });
        if (d >= tBeam[i]) tBeam[i] = 0;
      }
      if (k === K.Lance && tAge[i] - dt < tLife[i] && tAge[i] >= tLife[i]) {
        // the lance reached its range: the ground slash along the line it really flew
        const r = tRange[i];
        fx.linger.add('crackLine', tX[i] + tDX[i] * r * 0.5, tZ[i] + tDZ[i] * r * 0.5, r * 0.5, Math.atan2(-tDZ[i], tDX[i]), WIND_DEEP);
      }
      if (tSlot[i] >= 0) {
        fx.ribbons.feed(tSlot[i], tX[i] + tDX[i] * d, ARROW_Y, tZ[i] + tDZ[i] * d);
        if (d >= tRange[i]) endRibbon(fx, i);
      }
      if (tAge[i] >= tLife[i] + GRACE) endTrack(fx, i);
    }
    // Moonshot windups: re-emit while live; a stun or fear (the sim cancels the cast) or a death ends them
    for (let id = 0; id < ID_N; id++) {
      if (wUntil[id] <= clock) continue;
      if (fx.status?.(id, ST) && ST.buffs & (STUNNED | FEARED)) {
        wUntil[id] = 0;
        continue;
      }
      if (clock >= wNext[id]) {
        wNext[id] += WIND_STEP;
        windPieces(id, fx);
      }
    }
    // Sun Snare roots: the victim's rendered root edge draws the coil, for every viewer
    if (fx.status) {
      for (let v = 0; v < HERO_N && v < ID_N; v++) {
        const rooted = fx.status(v, ST) && (ST.buffs & ROOTED) !== 0 ? 1 : 0;
        const edge = rooted === 1 && rootPrev[v] === 0;
        rootPrev[v] = rooted;
        if (!edge || clock - coilAt[v] < 0.5 || !fx.heroPos(v, _r)) continue;
        // 1) an own trap: its zone ended early (the snapshot runs ahead of the render clock, so that is seen first), or
        //    an armed one that never got its zone index (a missed spawn) under the victim
        const k = sprungFor(v, fx);
        if (k >= 0 && (trSprung[k] >= 0 || (trZone[k] < 0 && clock >= trCast[k] + (fx.abil(trOwner[k], 'w').arm ?? 15) * TICK_S - 0.05))) {
          trOn[k] = 0;
          coil(trOwner[k], v, trR[k], fx);
          continue;
        }
        // 2) a trap this viewer never sees (an enemy Sage's): the root edge is the only signal
        const s = hiddenTrapper(v, fx);
        if (s < 0) continue;
        if (!lamboNear) coil(s, v, (fx.abil(s, 'w').radius ?? 1000) / 1000, fx);
        else {
          // Lambo's ult roots too, with a pull: a trap root holds still, a pull moves
          rootCheckAt[v] = clock + 0.1;
          rootCheckOwner[v] = s;
          rootX[v] = _r.x;
          rootZ[v] = _r.z;
        }
      }
      for (let v = 0; v < HERO_N && v < ID_N; v++) {
        if (rootCheckAt[v] < 0 || clock < rootCheckAt[v]) continue;
        rootCheckAt[v] = -1;
        if (!fx.heroPos(v, _r) || Math.hypot(_r.x - rootX[v], _r.z - rootZ[v]) > 0.15) continue;
        coil(rootCheckOwner[v], v, (fx.abil(rootCheckOwner[v], 'w').radius ?? 1000) / 1000, fx);
      }
    }
    // a sprung own trap whose victim never showed a rendered root (hidden in brush, no status): the nearest enemy
    // hero in reach, else nothing (never a coil on empty ground)
    for (let k = 0; k < TR; k++) {
      if (!trOn[k] || trSprung[k] < 0 || clock - trSprung[k] < SPRUNG_WAIT) continue;
      trOn[k] = 0;
      const os = side(fx, trOwner[k]);
      let best = -1;
      let bd = trR[k] + 0.8;
      for (let v = 0; v < HERO_N; v++) {
        if (side(fx, v) === os || !fx.heroPos(v, _r)) continue;
        const d = Math.hypot(_r.x - trX[k], _r.z - trZ[k]);
        if (d < bd) (bd = d), (best = v);
      }
      if (best >= 0) coil(trOwner[k], best, trR[k], fx);
    }
  },
};

/** Tests: forget every track, trap, windup and root edge (module state is shared across a test file). */
export function resetSageFx(): void {
  tOn.fill(0);
  trOn.fill(0);
  trZone.fill(-1);
  sageSeen.fill(0);
  rootPrev.fill(0);
  coilAt.fill(-9);
  rootCheckAt.fill(-1);
  wUntil.fill(0);
  clock = 0;
}
