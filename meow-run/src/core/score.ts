// Scoring API on top of G. FROZEN. Set pieces call these; the HUD and audio react to the events.
import * as THREE from 'three';
import { events } from './events';
import { callout, react } from './hud';
import { G } from './state';
import { BELL_POINTS, FISH_POINTS, multAfterPickup, NEAR_MISS_POINTS, pickupPoints } from './scoring';
import { BELLS } from './types';

const ZERO = new THREE.Vector3();

/** Add points (x multiplier unless raw). Returns the points added. */
export function addPoints(base: number, raw = false): number {
  const p = raw ? Math.round(base) : pickupPoints(base, G.mult);
  G.score += p;
  return p;
}

function bumpMult(): void {
  G.mult = multAfterPickup(G.mult);
  G.maxMult = Math.max(G.maxMult, G.mult);
  events.emit('mult', { value: G.mult });
}

/** A fish snack: base x mult, then mult + 1. `at` = world position for popups. */
export function collectFish(at: THREE.Vector3 = ZERO, base = FISH_POINTS): number {
  const p = addPoints(base);
  G.fish++;
  bumpMult();
  events.emit('pickup', { kind: 'fish', points: p, x: at.x, y: at.y, z: at.z });
  return p;
}

/** Any other pickup (yarn, treat, food): points x mult, optional meter fill, optional callout + portrait reaction. */
export function collectPickup(kind: string, at: THREE.Vector3 = ZERO, base = 0, meter = 0, text?: string): number {
  const p = base > 0 ? addPoints(base) : 0;
  if (meter > 0) addMeter(meter);
  events.emit('pickup', { kind, points: p, x: at.x, y: at.y, z: at.z });
  if (text) {
    callout(text);
    react('nom');
  }
  return p;
}

/** Golden bell `index` (0..6). Ignored if already collected. */
export function collectBell(index: number, at: THREE.Vector3 = ZERO): boolean {
  if (index < 0 || index >= BELLS || G.bells[index]) return false;
  G.bells[index] = true;
  const count = G.bells.filter(Boolean).length;
  const p = addPoints(BELL_POINTS);
  events.emit('pickup', { kind: 'bell', points: p, x: at.x, y: at.y, z: at.z });
  events.emit('bell', { index, count, total: BELLS });
  react('wow');
  if (count === BELLS) callout('ALL 7 BELLS!');
  return true;
}

export function addMeter(a: number): void {
  G.meter = Math.max(0, Math.min(1, G.meter + a));
  events.emit('meter', { value: G.meter });
}
/** Spend meter if there is enough. */
export function spendMeter(a: number): boolean {
  if (G.meter + 1e-6 < a) return false;
  G.meter = Math.max(0, G.meter - a);
  events.emit('meter', { value: G.meter });
  return true;
}

/** Near miss: points x mult, mult + 1, "CLOSE ONE!" (collision.ts calls it; chase pieces may too). */
export function nearMiss(label: string): void {
  const points = addPoints(NEAR_MISS_POINTS);
  bumpMult();
  events.emit('nearMiss', { label, points });
  callout('CLOSE ONE!');
}
