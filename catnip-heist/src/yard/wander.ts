/**
 * Cat Yard wander AI (pure, no three.js). Cosmetic only: NOT part of the deterministic heist sim,
 * so it may use floats. Each agent is seeded, so the yard looks the same on every load.
 *
 * Behaviours: WALK to a target (sometimes a short RUN "zoomie"), then IDLE / SIT / GROOM / LOAF /
 * SLEEP / DIG for a while. Targets avoid circular obstacles (fountain, trees, benches...), agents
 * stay inside the plaza bounds and gently keep apart.
 */

export type YardBehaviour = 'WALK' | 'RUN' | 'IDLE' | 'SIT' | 'GROOM' | 'LOAF' | 'SLEEP' | 'DIG' | 'HOP' | 'POSE';

/** Sprite row each behaviour plays. */
export const BEHAVIOUR_ROW: Record<YardBehaviour, string> = {
  WALK: 'WALKING',
  RUN: 'RUNNING',
  IDLE: 'IDLE',
  SIT: 'SITTING',
  GROOM: 'GROOMING',
  LOAF: 'LOAF',
  SLEEP: 'SLEEP',
  DIG: 'DIGGING',
  HOP: 'JUMPING',
  POSE: 'SITTING',
};

/** Label for the name card. */
export const BEHAVIOUR_LABEL: Record<YardBehaviour, string> = {
  WALK: 'Strolling',
  RUN: 'Doing zoomies',
  IDLE: 'Looking around',
  SIT: 'Sitting pretty',
  GROOM: 'Grooming',
  LOAF: 'Loafing',
  SLEEP: 'Napping',
  DIG: 'Digging',
  HOP: 'Happy hop!',
  POSE: 'Saying hi',
};

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface YardWorld {
  bounds: Bounds;
  obstacles: Circle[];
  /** Points of interest cats like to walk to (bench fronts, fountain rim, tree shade...). */
  spots: { x: number; z: number }[];
}

export interface YardAgent {
  x: number;
  z: number;
  /** Velocity this frame (world units / s). */
  vx: number;
  vz: number;
  behaviour: YardBehaviour;
  /** Seconds left in the current behaviour (WALK ends on arrival or timeout). */
  timer: number;
  tx: number;
  tz: number;
  speed: number;
  rng: number;
  /** Held by the player (card open): stays put, faces the camera. */
  held: boolean;
  /** Personal taste: sleepy cats nap more, playful ones run more (0..1). */
  sleepy: number;
  playful: number;
}

/** mulberry32 step: returns [value in [0,1), next state]. */
export function rand(a: YardAgent): number {
  let t = (a.rng = (a.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Stable 32-bit hash of a string (FNV-1a), for per-cat seeds. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const AGENT_RADIUS = 0.36;
/** How far (world units) past an obstacle's rim a walking cat starts steering around it. */
const AVOID_REACH = 0.7;
const WALK_SPEED = 0.85;
const RUN_SPEED = 2.4;

export function insideObstacle(world: YardWorld, x: number, z: number, pad = AGENT_RADIUS): boolean {
  for (const o of world.obstacles) {
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz < (o.r + pad) * (o.r + pad)) return true;
  }
  return false;
}

/** Does the segment (ax,az)-(bx,bz) pass through any obstacle (inflated by pad)? */
export function segmentBlocked(world: YardWorld, ax: number, az: number, bx: number, bz: number, pad = AGENT_RADIUS): boolean {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-6;
  for (const o of world.obstacles) {
    let t = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - o.x, pz = az + dz * t - o.z;
    if (px * px + pz * pz < (o.r + pad) * (o.r + pad)) return true;
  }
  return false;
}

function randomPoint(a: YardAgent, world: YardWorld): { x: number; z: number } {
  const b = world.bounds;
  return { x: b.minX + rand(a) * (b.maxX - b.minX), z: b.minZ + rand(a) * (b.maxZ - b.minZ) };
}

/** Pick a free spawn point for a new agent. */
export function spawnPoint(a: YardAgent, world: YardWorld, others: readonly YardAgent[]): { x: number; z: number } {
  let best = randomPoint(a, world);
  for (let i = 0; i < 40; i++) {
    const p = randomPoint(a, world);
    if (insideObstacle(world, p.x, p.z, AGENT_RADIUS + 0.1)) continue;
    let ok = true;
    for (const o of others) {
      const dx = o.x - p.x, dz = o.z - p.z;
      if (dx * dx + dz * dz < 1.0) {
        ok = false;
        break;
      }
    }
    best = p;
    if (ok) break;
  }
  return best;
}

export function createAgent(id: string, world: YardWorld, others: readonly YardAgent[] = []): YardAgent {
  const a: YardAgent = {
    x: 0, z: 0, vx: 0, vz: 0, behaviour: 'IDLE', timer: 0, tx: 0, tz: 0, speed: WALK_SPEED,
    rng: seedOf(id) | 0, held: false, sleepy: 0, playful: 0,
  };
  a.sleepy = rand(a);
  a.playful = rand(a);
  const p = spawnPoint(a, world, others);
  a.x = a.tx = p.x;
  a.z = a.tz = p.z;
  // Start mid-activity so the yard looks alive on the first frame.
  const r = rand(a);
  if (r < 0.25) startRest(a, 'SLEEP');
  else if (r < 0.4) startRest(a, 'LOAF');
  else if (r < 0.55) startRest(a, 'GROOM');
  else if (r < 0.7) startRest(a, 'SIT');
  else a.timer = rand(a) * 2;
  a.timer *= 0.3 + rand(a) * 0.7;
  return a;
}

function startRest(a: YardAgent, b: YardBehaviour) {
  a.behaviour = b;
  a.vx = a.vz = 0;
  const base: Record<string, [number, number]> = {
    IDLE: [1.5, 4], SIT: [4, 9], GROOM: [3.5, 7], LOAF: [5, 11], SLEEP: [9, 20], DIG: [1.5, 3], HOP: [0.8, 0.8], POSE: [999, 999],
  };
  const [lo, hi] = base[b] ?? [2, 4];
  a.timer = lo + rand(a) * (hi - lo);
}

function startWalk(a: YardAgent, world: YardWorld): boolean {
  for (let i = 0; i < 10; i++) {
    let p: { x: number; z: number };
    if (world.spots.length && rand(a) < 0.35) {
      const s = world.spots[Math.floor(rand(a) * world.spots.length)];
      p = { x: s.x + (rand(a) - 0.5) * 1.2, z: s.z + (rand(a) - 0.5) * 1.2 };
    } else {
      // Mostly short hops around the current spot, sometimes across the yard.
      const far = rand(a) < 0.3;
      const reach = far ? 12 : 3.5;
      p = { x: a.x + (rand(a) * 2 - 1) * reach, z: a.z + (rand(a) * 2 - 1) * reach };
    }
    const b = world.bounds;
    p.x = Math.min(b.maxX, Math.max(b.minX, p.x));
    p.z = Math.min(b.maxZ, Math.max(b.minZ, p.z));
    const d2 = (p.x - a.x) ** 2 + (p.z - a.z) ** 2;
    if (d2 < 0.5) continue;
    if (insideObstacle(world, p.x, p.z) || segmentBlocked(world, a.x, a.z, p.x, p.z)) continue;
    a.tx = p.x;
    a.tz = p.z;
    const zoom = rand(a) < 0.12 + a.playful * 0.15;
    a.behaviour = zoom ? 'RUN' : 'WALK';
    a.speed = (zoom ? RUN_SPEED : WALK_SPEED) * (0.85 + rand(a) * 0.3);
    a.timer = Math.sqrt(d2) / a.speed + 2;
    return true;
  }
  return false;
}

function nextBehaviour(a: YardAgent, world: YardWorld) {
  const was = a.behaviour;
  if (was === 'WALK' || was === 'RUN' || was === 'HOP') {
    const r = rand(a);
    const sleepW = 0.1 + a.sleepy * 0.18;
    if (r < sleepW) startRest(a, 'SLEEP');
    else if (r < sleepW + 0.14) startRest(a, 'LOAF');
    else if (r < sleepW + 0.3) startRest(a, 'GROOM');
    else if (r < sleepW + 0.45) startRest(a, 'SIT');
    else if (r < sleepW + 0.5) startRest(a, 'DIG');
    else if (r < sleepW + 0.75) startRest(a, 'IDLE');
    else if (!startWalk(a, world)) startRest(a, 'IDLE');
    return;
  }
  if (was === 'SLEEP' && rand(a) < 0.3) {
    startRest(a, 'GROOM');
    return;
  }
  if (!startWalk(a, world)) startRest(a, 'IDLE');
}

/** Make an agent react to a tap: a happy hop, then it sits facing the camera while held. */
export function poke(a: YardAgent) {
  a.held = true;
  if (a.behaviour === 'SLEEP') return; // let sleeping cats lie
  a.behaviour = 'HOP';
  a.vx = a.vz = 0;
  a.timer = 0.75;
}

export function release(a: YardAgent) {
  a.held = false;
  if (a.behaviour === 'POSE') a.timer = 0.5 + rand(a);
}

/** Advance all agents by dt seconds (dt is clamped to 0.1 to survive tab switches). */
export function stepAgents(agents: YardAgent[], world: YardWorld, dtIn: number): void {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  for (const a of agents) {
    a.timer -= dt;
    if (a.behaviour === 'WALK' || a.behaviour === 'RUN') {
      if (a.held) {
        a.behaviour = 'POSE';
        a.timer = 999;
        a.vx = a.vz = 0;
        continue;
      }
      const dx = a.tx - a.x, dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08 || a.timer <= 0) {
        nextBehaviour(a, world);
        continue;
      }
      let vx = (dx / d) * a.speed, vz = (dz / d) * a.speed;
      // Separation from close neighbours, steering sideways rather than stopping.
      for (const o of agents) {
        if (o === a) continue;
        const ox = a.x - o.x, oz = a.z - o.z;
        const od2 = ox * ox + oz * oz;
        if (od2 < 0.5 && od2 > 1e-6) {
          const k = (0.5 - od2) * 2.2;
          vx += ox * k;
          vz += oz * k;
        }
      }
      // Obstacle avoidance along the path: near a prop and heading into it, trade the inward part
      // of the velocity for a slide along its rim (towards the side the target is on), so cats walk
      // around benches and trees instead of pressing into them and being pushed back.
      for (const o of world.obstacles) {
        const ox = a.x - o.x, oz = a.z - o.z;
        const od = Math.hypot(ox, oz);
        const gap = od - o.r - AGENT_RADIUS;
        if (gap > AVOID_REACH || od < 1e-6) continue;
        const nx = ox / od, nz = oz / od;
        const inward = -(vx * nx + vz * nz);
        if (inward <= 0) continue;
        let tx = -nz, tz = nx;
        if (tx * dx + tz * dz < 0) {
          tx = -tx;
          tz = -tz;
        }
        const k = Math.min(1, Math.max(0, 1 - gap / AVOID_REACH));
        vx += (nx + tx) * inward * k;
        vz += (nz + tz) * inward * k;
      }
      const nv = Math.hypot(vx, vz) || 1;
      const sp = Math.min(a.speed, nv);
      a.vx = (vx / nv) * sp;
      a.vz = (vz / nv) * sp;
      a.x += a.vx * dt;
      a.z += a.vz * dt;
    } else {
      a.vx = a.vz = 0;
      if (a.behaviour === 'HOP' && a.timer <= 0) {
        if (a.held) {
          a.behaviour = 'POSE';
          a.timer = 999;
        } else nextBehaviour(a, world);
      } else if (!a.held && a.timer <= 0) nextBehaviour(a, world);
    }
  }
  // Everyone (resting cats too) gently keeps apart so sprites do not stack.
  separate(agents);
  for (const a of agents) {
    // Keep inside the plaza and out of props.
    const b = world.bounds;
    a.x = Math.min(b.maxX, Math.max(b.minX, a.x));
    a.z = Math.min(b.maxZ, Math.max(b.minZ, a.z));
    for (const o of world.obstacles) {
      const ox = a.x - o.x, oz = a.z - o.z;
      const min = o.r + AGENT_RADIUS;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-3;
        a.x = o.x + (ox / d) * min;
        a.z = o.z + (oz / d) * min;
      }
    }
  }
}

/** Minimum centre distance between two cats before they are pushed apart (world units). */
export const SEPARATION = 0.6;

/** Push overlapping agents apart (half each; a held cat does not move). O(n^2), n <= ~60. */
function separate(agents: YardAgent[]): void {
  const min2 = SEPARATION * SEPARATION;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    for (let j = i + 1; j < agents.length; j++) {
      const o = agents[j];
      let dx = a.x - o.x, dz = a.z - o.z;
      let d2 = dx * dx + dz * dz;
      if (d2 >= min2) continue;
      if (d2 < 1e-8) {
        // Exactly stacked: split along a stable per-pair direction.
        dx = ((i * 7 + j * 3) % 5) - 2 || 1;
        dz = ((i * 3 + j * 5) % 5) - 2;
        d2 = dx * dx + dz * dz;
      }
      const d = Math.sqrt(d2);
      const push = (SEPARATION - Math.min(d, SEPARATION)) * 0.5;
      const ux = dx / d, uz = dz / d;
      const wa = a.held ? 0 : o.held ? 2 : 1;
      const wo = o.held ? 0 : a.held ? 2 : 1;
      a.x += ux * push * wa * 0.5;
      a.z += uz * push * wa * 0.5;
      o.x -= ux * push * wo * 0.5;
      o.z -= uz * push * wo * 0.5;
    }
  }
}
