/**
 * Incoming items (iteration 2, audio-ui lane): which projectiles are flying at the player and how soon they land.
 * Pure and allocation-free per frame (it fills a caller-owned array), read-only on the race state. It feeds the HUD
 * (edge arrows, mini-map markers, `HudModel.incoming`) and the race audio's beeper.
 *
 * It reads the items lane's plain-data slot (`RaceState.items.s`, items-ai/items/state.ts) without importing its
 * helpers, so a missing or reshaped slot just means "nothing incoming".
 */
import type { ItemId, RaceState } from '../../types';

/** Projectile kinds (items-ai ProjKind): 0 hairball, 1 homing yarn ball, 2 Laser Dot. */
export const PROJ_ITEM: readonly ItemId[] = ['hairball', 'yarn', 'laser'];

export interface Incoming {
  /** 0 hairball, 1 yarn, 2 laser */
  kind: number;
  item: ItemId;
  /** seconds until it reaches the player (estimate) */
  eta: number;
  /** world position (for the arrow direction and the mini-map) */
  x: number;
  z: number;
}

interface ProjLike {
  kind: number;
  owner: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  target: number;
}

/** Longest warning, seconds; anything further away is not shown. */
export const INCOMING_HORIZON = 2.6;

/**
 * Fill `out` with the items flying at kart `me`, nearest first. Homing items (yarn ball, Laser Dot) locked on the
 * player always count; a hairball counts when it is closing on the player and pointing at them.
 */
export function incomingItems(st: RaceState, me: number, out: Incoming[]): Incoming[] {
  out.length = 0;
  const slot = (st.items as { s?: { proj?: ProjLike[] } } | undefined)?.s;
  const proj = slot?.proj;
  const k = st.karts[me];
  if (!proj || !k || k.finished) return out;
  for (const p of proj) {
    if (p.owner === me) continue;
    const rx = k.x - p.x;
    const rz = k.z - p.z;
    const d = Math.sqrt(rx * rx + rz * rz);
    if (d < 0.5 || d > 70) continue;
    const ux = rx / d;
    const uz = rz / d;
    // closing speed: the projectile's speed towards me minus my speed away from it
    const pv = p.vx * ux + p.vz * uz;
    const kv = k.vx * ux + k.vz * uz;
    const homing = p.target === me && (p.kind === 1 || p.kind === 2);
    if (!homing) {
      const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      // a straight shot: it must point at me (within ~25°) and close in
      if (sp < 1 || pv / sp < 0.9) continue;
    }
    const closing = Math.max(homing ? 4 : 0.5, pv - kv);
    if (!homing && pv - kv <= 0.5) continue;
    const eta = d / closing;
    if (eta > INCOMING_HORIZON) continue;
    const kind = p.kind >= 0 && p.kind <= 2 ? p.kind : 0;
    out.push({ kind, item: PROJ_ITEM[kind], eta, x: p.x, z: p.z });
  }
  out.sort((a, b) => a.eta - b.eta);
  if (out.length > 3) out.length = 3;
  return out;
}

/**
 * Where the edge arrow for an item goes: the direction from the camera, flattened, as an angle (0 = straight ahead
 * at the top of the screen, π = right behind, at the bottom). `fx, fz` is the camera's forward direction.
 */
export function arrowAngle(camX: number, camZ: number, fx: number, fz: number, x: number, z: number): number {
  const dx = x - camX;
  const dz = z - camZ;
  // a kart facing (sin h, cos h) has its right at (−cos h, sin h) (engine.ts panning), i.e. right = (−fz, fx)
  const right = dx * -fz + dz * fx;
  const fwd = dx * fx + dz * fz;
  return Math.atan2(right, fwd);
}
