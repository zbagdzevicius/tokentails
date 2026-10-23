// The runner controller. FROZEN.
// The kitten lives in track space: s along the track, x lateral, y above the surface (or above a ride/arc baseline).
// Set pieces drive the special moves through beginArc (tail vault), beginRide (puff cloud, leaf surf), boost, soak,
// hurt, teleport and onAbility (the E / tap context action).
import * as THREE from 'three';
import { events, EMPTY } from './events';
import { callout, react } from './hud';
import { kittenFactory } from './registry';
import { multAfterHit, speedAt } from './scoring';
import { G, game } from './state';
import { newFrame } from './track';
import { NO_FLOOR, type KittenRig, type PlayerView } from './types';
import { scene } from './engine';
import { steerAxis } from './input';

// ---- tuning (u, s) ----
export const TUNING = {
  gravity: 52,
  jumpV: 16.5, // ~2.6 u apex
  pounceV: 10,
  pounceBoost: 1.45, // speed multiplier while pouncing
  pounceTime: 0.35,
  pounceGravity: 0.45, // gravity scale during the pounce (hang)
  coyote: 0.11,
  buffer: 0.13,
  slideTime: 0.75,
  fastFallV: -30,
  latSpeed: 11,
  latAccel: 75,
  radius: 0.4,
  bodyH: 1.1,
  slideH: 0.5,
  fallLimit: -7, // below this (over a gap) counts as a fall
  invuln: 1.4,
  respawnInvuln: 2,
  hitSlow: 0.55, // speed x on hit, recovering over hitRecover
  hitRecover: 0.9,
  speedFollow: 6,
};

/** Full mutable player state (lanes read it as PlayerView; only core and the set-piece API functions write it). */
export interface PlayerState extends PlayerView {
  latVel: number;
  coyote: number;
  jumpBuf: number;
  slideBuf: boolean;
  pounceUsed: boolean;
  pounceT: number;
  boostMul: number;
  boostT: number;
  slowMul: number;
  slideT: number;
  base: number;
  arc: { s0: number; len: number; h: number };
  ride: { s0: number; until: number; h: number };
}

export const P: PlayerState = {
  s: 0,
  x: 0,
  y: 0,
  vy: 0,
  speed: 0,
  mode: 'run',
  surface: 'ground',
  grounded: true,
  sliding: false,
  slideT: 0,
  sinceLand: 99,
  sinceJump: 99,
  sincePounce: 99,
  sinceHit: 99,
  landImpact: 0,
  airTime: 0,
  lean: 0,
  latVel: 0,
  invuln: 0,
  wet: 0,
  ability: null,
  abilityT: 0,
  coyote: 0,
  jumpBuf: 0,
  slideBuf: false,
  pounceUsed: false,
  pounceT: 0,
  boostMul: 1,
  boostT: 0,
  slowMul: 1,
  /** ride/arc baseline height and the hop on top of it */
  base: 0,
  arc: { s0: 0, len: 1, h: 0 },
  ride: { s0: 0, until: 0, h: 0 },
  world: { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(-1, 0, 0) },
};

/** body height now (slide = low) */
export const bodyHeight = () => (P.sliding ? TUNING.slideH : TUNING.bodyH);

/** seconds of hit immunity without the invulnerability flash (dev.jump starts mid-stage) */
let spawnGrace = 0;
export function setSpawnGrace(seconds: number): void {
  spawnGrace = seconds;
}

let outOfHearts: () => void = () => {};
/** session registers what happens at 0 hearts */
export function setOutOfHearts(fn: () => void): void {
  outOfHearts = fn;
}

const abilityHandlers: (() => boolean)[] = [];
/**
 * Set pieces register a context action for E / tap. Handlers run newest first; return true to consume the press.
 * Returns an unsubscribe (call it in dispose).
 */
export function onAbility(fn: () => boolean): () => void {
  abilityHandlers.push(fn);
  return () => {
    const i = abilityHandlers.indexOf(fn);
    if (i >= 0) abilityHandlers.splice(i, 1);
  };
}

export function resetPlayer(s = 0, x = 0): void {
  Object.assign(P, {
    s,
    x,
    y: 0,
    vy: 0,
    mode: 'run',
    grounded: true,
    sliding: false,
    slideT: 0,
    sinceLand: 99,
    sinceJump: 99,
    sincePounce: 99,
    sinceHit: 99,
    landImpact: 0,
    airTime: 0,
    lean: 0,
    latVel: 0,
    invuln: 0,
    wet: 0,
    ability: null,
    abilityT: 0,
    coyote: 0,
    jumpBuf: 0,
    slideBuf: false,
    pounceUsed: false,
    pounceT: 0,
    boostMul: 1,
    boostT: 0,
    slowMul: 1,
    base: 0,
  });
  P.speed = game.stage ? speedAt(game.stage.speed, s) : 18;
  P.surface = game.track ? game.track.kindAt(s) : 'ground';
}

/** Put the kitten at (s, x) on the ground, ending any arc or ride. */
export function teleport(s: number, x = 0): void {
  if (P.ability) events.emit('abilityEnd', { id: P.ability });
  P.s = s;
  P.x = x;
  P.y = 0;
  P.vy = 0;
  P.base = 0;
  P.mode = 'run';
  P.ability = null;
  P.abilityT = 0;
  P.grounded = true;
  P.sliding = false;
  P.pounceUsed = false;
}

// ---- actions (from input) ----
export function jump(): void {
  if (P.mode === 'finish' || P.mode === 'arc') {
    P.jumpBuf = TUNING.buffer;
    return;
  }
  if (P.grounded || P.coyote > 0) doJump(!P.grounded);
  else if (!P.pounceUsed) doPounce();
  else P.jumpBuf = TUNING.buffer;
}
function doJump(air: boolean): void {
  P.vy = TUNING.jumpV;
  P.grounded = false;
  P.coyote = 0;
  P.jumpBuf = 0;
  P.sinceJump = 0;
  if (P.sliding) {
    P.sliding = false;
    events.emit('slide', { on: false });
  }
  events.emit('jump', { air });
}
function doPounce(): void {
  P.pounceUsed = true;
  P.vy = Math.max(P.vy, TUNING.pounceV);
  P.pounceT = TUNING.pounceTime;
  P.sincePounce = 0;
  events.emit('pounce', EMPTY);
}

export function slide(): void {
  if (P.mode === 'finish') return;
  if (P.grounded) startSlide();
  else {
    P.slideBuf = true;
    if (P.mode === 'run' && P.vy > TUNING.fastFallV) {
      P.vy = TUNING.fastFallV;
      events.emit('fastFall', EMPTY);
    }
  }
}
function startSlide(): void {
  P.slideBuf = false;
  P.slideT = TUNING.slideTime;
  if (!P.sliding) {
    P.sliding = true;
    events.emit('slide', { on: true });
  }
}

export function ability(): void {
  if (P.mode === 'finish') return;
  for (let i = abilityHandlers.length - 1; i >= 0; i--) {
    if (abilityHandlers[i]()) {
      events.emit('abilityPress', { consumed: true });
      return;
    }
  }
  events.emit('abilityPress', { consumed: false });
}

// ---- set-piece API ----
/** Tail vault: an authored parabola from here, `len` u long, `height` u high. Collisions stay on. */
export function beginArc(len: number, height: number, id = 'vault'): void {
  P.mode = 'arc';
  P.arc.s0 = P.s;
  P.arc.len = Math.max(1, len);
  P.arc.h = height;
  P.ability = id;
  P.abilityT = 0;
  P.vy = 0;
  P.grounded = false;
  P.sliding = false;
  events.emit('abilityStart', { id });
}
/** Ride at `height` above the track until s reaches `until` (puff cloud, leaf surf). Jumps hop on top. */
export function beginRide(id: string, until: number, height: number): void {
  P.mode = 'ride';
  P.ride.s0 = P.s;
  P.ride.until = until;
  P.ride.h = height;
  P.ability = id;
  P.abilityT = 0;
  P.pounceUsed = false;
  events.emit('abilityStart', { id });
}
/** End an arc or ride now (gravity takes over). */
export function endAbility(): void {
  if (!P.ability) return;
  const id = P.ability;
  P.y = P.base + Math.max(0, P.y - P.base);
  P.base = 0;
  P.mode = 'run';
  P.ability = null;
  P.abilityT = 0;
  P.grounded = false;
  events.emit('abilityEnd', { id });
}
/** Speed multiplier for `seconds` (FOV kick + speed lines via the boost event). */
export function boost(mul: number, seconds: number): void {
  P.boostMul = mul;
  P.boostT = seconds;
  events.emit('boost', { mul, seconds });
}
/** Puddle: slowed and wet for `seconds`. */
export function soak(seconds: number, slow = 0.75): void {
  P.wet = Math.max(P.wet, seconds);
  P.slowMul = slow;
  events.emit('wet', { seconds });
  react('scared');
}
/** Lose a heart (ignored while invulnerable / dev invincible / finishing). Returns true if it hurt. */
export function hurt(label: string): boolean {
  if (P.invuln > 0 || spawnGrace > 0 || G.invincible || P.mode === 'finish' || game.mode !== 'play') return false;
  G.hearts = Math.max(0, G.hearts - 1);
  G.hits++;
  G.mult = multAfterHit(G.mult);
  events.emit('mult', { value: G.mult });
  P.invuln = TUNING.invuln;
  P.sinceHit = 0;
  if (P.grounded && P.mode === 'run') {
    P.vy = 6;
    P.grounded = false;
  }
  events.emit('hit', { label, hearts: G.hearts });
  events.emit('bigHit', { strength: 0.6 });
  react('ouch');
  callout(G.hearts === 1 ? 'LAST LIFE!' : 'OUCH!', 'bad');
  if (G.hearts <= 0) outOfHearts();
  return true;
}

// ---- simulation (fixed step) ----
export function stepPlayer(dt: number): void {
  const track = game.track;
  const stage = game.stage;
  if (!track || !stage) return;
  const T = TUNING;
  P.sinceLand += dt;
  P.sinceJump += dt;
  P.sincePounce += dt;
  P.sinceHit += dt;
  if (P.invuln > 0) P.invuln = Math.max(0, P.invuln - dt);
  if (spawnGrace > 0) spawnGrace = Math.max(0, spawnGrace - dt);
  if (P.boostT > 0 && (P.boostT -= dt) <= 0) P.boostMul = 1;
  if (P.wet > 0 && (P.wet -= dt) <= 0) {
    P.wet = 0;
    P.slowMul = 1;
  }
  if (P.pounceT > 0) P.pounceT = Math.max(0, P.pounceT - dt);
  if (P.jumpBuf > 0) P.jumpBuf = Math.max(0, P.jumpBuf - dt);

  // ---- forward speed ----
  let target: number;
  if (P.mode === 'finish') target = 0;
  else {
    const hitRec = P.sinceHit < T.hitRecover ? T.hitSlow + (1 - T.hitSlow) * (P.sinceHit / T.hitRecover) : 1;
    target = speedAt(stage.speed, P.s) * P.boostMul * P.slowMul * hitRec * (P.pounceT > 0 ? T.pounceBoost : 1);
  }
  const k = P.mode === 'finish' ? 1.6 : P.pounceT > 0 ? 14 : T.speedFollow;
  P.speed += (target - P.speed) * Math.min(1, k * dt);
  P.s += P.speed * dt;

  // ---- lateral ----
  const half = Math.max(0.5, track.widthAt(P.s) / 2 - T.radius);
  const steer = P.mode === 'finish' ? Math.max(-1, Math.min(1, -P.x)) : steerAxis();
  const want = steer * T.latSpeed;
  const dv = want - P.latVel;
  const maxDv = T.latAccel * dt;
  P.latVel += Math.max(-maxDv, Math.min(maxDv, dv));
  P.x += P.latVel * dt;
  if (P.x > half) {
    P.x = half;
    P.latVel = Math.min(0, P.latVel);
  } else if (P.x < -half) {
    P.x = -half;
    P.latVel = Math.max(0, P.latVel);
  }
  P.lean = P.latVel / T.latSpeed;

  // ---- surface ----
  const kind = track.kindAt(P.s);
  if (kind !== P.surface) {
    const prev = P.surface;
    P.surface = kind;
    events.emit('surface', { kind, prev });
  }
  const floor = !NO_FLOOR.has(kind);

  // ---- vertical ----
  if (P.mode === 'arc') {
    const u = (P.s - P.arc.s0) / P.arc.len;
    P.abilityT = Math.min(1, u);
    P.y = 4 * P.arc.h * u * (1 - u);
    if (u >= 1) {
      // hand over to gravity: falling slightly so a landing registers
      const id = P.ability ?? 'vault';
      P.mode = 'run';
      P.ability = null;
      P.y = Math.max(0, P.y);
      P.vy = -4;
      P.grounded = false;
      events.emit('abilityEnd', { id });
    }
  } else {
    if (P.mode === 'ride') {
      P.base += (P.ride.h - P.base) * Math.min(1, 4 * dt);
      const span = Math.max(1, P.ride.until - P.ride.s0);
      P.abilityT = Math.min(1, Math.max(0, 1 - (P.ride.until - P.s) / span));
      if (P.s >= P.ride.until) endAbility();
    }
    const riding = P.mode === 'ride';
    const g = T.gravity * (P.pounceT > 0 ? T.pounceGravity : 1);
    P.vy -= g * dt;
    P.y += P.vy * dt;
    const ground = riding ? P.base : floor ? 0 : -Infinity;
    if (P.y <= ground && P.vy <= 0) {
      if (!P.grounded) {
        P.landImpact = -P.vy;
        P.sinceLand = 0;
        events.emit('land', { impact: P.landImpact });
      }
      P.y = ground;
      P.vy = 0;
      P.grounded = true;
      P.pounceUsed = false;
      P.pounceT = 0;
      if (P.slideBuf) startSlide();
    } else if (P.y > ground + 0.02) {
      P.grounded = false;
    }
    if (P.grounded) {
      P.coyote = T.coyote;
      P.airTime = 0;
      if (P.jumpBuf > 0) doJump(false);
    } else {
      P.coyote = Math.max(0, P.coyote - dt);
      P.airTime += dt;
    }
    // fell into a chasm: back on the far side
    if (!riding && !floor && P.y < T.fallLimit) {
      const seg = track.segmentAt(P.s);
      events.emit('fall', { s: P.s });
      const s1 = seg.s1;
      const respawns = G.respawns;
      hurt('fall');
      // (0 hearts already respawned us at the checkpoint)
      if (game.mode === 'play' && G.respawns === respawns) {
        teleport(s1 + 1.5, 0);
        P.invuln = Math.max(P.invuln, 1);
      }
    }
  }

  // ---- slide ----
  if (P.sliding && (P.slideT -= dt) <= 0) {
    P.sliding = false;
    events.emit('slide', { on: false });
  }
}

// ---- visuals (every frame) ----
let rig: KittenRig | null = null;
let fallback: THREE.Mesh | null = null;
const fr = newFrame();
const m4 = new THREE.Matrix4();
const xAxis = new THREE.Vector3();

/** core builds the kitten rig on stage start (registerKitten from cat-audio, or a capsule) */
export function spawnKittenRig(): void {
  disposeKittenRig();
  const f = kittenFactory();
  if (f) {
    rig = f();
    scene.add(rig.root);
  } else {
    fallback = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff9a3c }));
    fallback.position.y = 0.65;
    const g = new THREE.Group();
    g.add(fallback);
    scene.add(g);
  }
}
export function disposeKittenRig(): void {
  if (rig) {
    scene.remove(rig.root);
    rig.dispose?.();
    rig = null;
  }
  if (fallback) {
    scene.remove(fallback.parent!);
    fallback.geometry.dispose();
    (fallback.material as THREE.Material).dispose();
    fallback = null;
  }
}
export const kittenRig = () => rig;

/** Compute P.world and place the rig. Invulnerability flashes the rig (core toggles root.visible). */
export function updatePlayerVisual(dt: number, t: number): void {
  const track = game.track;
  if (!track) return;
  track.sample(P.s, fr);
  P.world.fwd.copy(fr.fwd);
  P.world.up.copy(fr.up);
  P.world.right.copy(fr.right);
  P.world.pos.copy(fr.pos).addScaledVector(fr.right, P.x).addScaledVector(fr.up, P.y);
  const root = rig ? rig.root : fallback?.parent;
  if (!root) return;
  // basis: local +x = left (-right), +y = up, +z = forward
  xAxis.copy(fr.right).negate();
  m4.makeBasis(xAxis, fr.up, fr.fwd);
  root.quaternion.setFromRotationMatrix(m4);
  root.position.copy(P.world.pos);
  root.visible = !(P.invuln > 0 && game.mode === 'play' && Math.floor(t * 12) % 2 === 0);
  if (rig) rig.animate(dt, t, P);
  else if (fallback) fallback.scale.y = P.sliding ? 0.5 : 1;
}
