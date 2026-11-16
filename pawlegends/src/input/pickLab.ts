/**
 * Pick lab (`?e2e=1` only, loaded on demand; TARGETING.md §8): measures how often a tap or click on a drawn enemy body
 * picks that unit, with the old pick (one projected point near the feet, a fixed radius, a 10 px hero bias:
 * `pickNearest`) and the new one (`pickBody`, the drawn selection cylinder), on the same synthetic taps. The taps are
 * spread over each enemy's drawn body, modelled as a box from its feet to its model height (TAP_BODY widths), so the
 * new pick's own cylinders are not what generates them. tests/e2e/targeting-measure.spec.ts drives it.
 */
import type * as THREE from 'three';
import { project } from './screen';
import { isEnemy, pickNearest, type Unit } from './targeting';
import { PICK, pickBody, screenBodies, type DrawnLookup } from './unitPick';

/** The tap model: half width (m) and height (m) of the drawn body (heroes use the view's model height). */
const TAP_BODY: Readonly<Record<string, { w: number; h: number }>> = Object.freeze({
  hero: { w: 0.45, h: 2.6 },
  minion: { w: 0.4, h: 1.6 },
  tower: { w: 1.4, h: 6.2 },
  core: { w: 2.5, h: 5 },
});

export type Outcome = 'hit' | 'other' | 'none';

export interface PickSample {
  kind: string;
  crowd: number;
  old: Outcome;
  neu: Outcome;
}

export interface PickLabHost {
  camera: THREE.Camera;
  canvas: HTMLElement;
  drawn: DrawnLookup;
  units: () => readonly Unit[];
  myTeam: () => number;
}

const at = (h: PickLabHost, u: Unit): { x: number; z: number } => h.drawn.at(u.id, u.kind) ?? { x: u.x / 1000, z: -u.y / 1000 };

/** One measurement of what is on screen now: `touch` = the field tap that locks a hero (heroes only). */
export function measure(h: PickLabHost, touch: boolean, per = 20): PickSample[] {
  const team = h.myTeam();
  const all = h.units().filter((u) => u.state !== 'dead' && u.kind !== 'fountain' && u.kind !== 'pickup');
  const foes = all.filter((u) => isEnemy(u, team) && TAP_BODY[u.kind]);
  const cands = touch ? foes.filter((u) => u.kind === 'hero') : foes;
  const rect = h.canvas.getBoundingClientRect();
  const lift = (u: Unit): number => (u.kind === 'tower' || u.kind === 'core' ? 2.5 : u.kind === 'pudding' ? 1.5 : 0.6);
  const oldPick = (x: number, y: number): Unit | null =>
    pickNearest(cands, (u) => project(h.camera, h.canvas, u.x / 1000, lift(u), -u.y / 1000), x, y, touch ? 48 : 44);
  const bodies = screenBodies(h.camera, h.canvas, h.drawn);
  const newPick = (x: number, y: number): Unit | null => pickBody(cands, bodies, x, y, { padScale: touch ? PICK.touchPad : 1 });
  const out: PickSample[] = [];
  for (const t of cands) {
    const p = at(h, t);
    const tb = TAP_BODY[t.kind];
    const height = (t.kind === 'hero' ? h.drawn.height?.(t.id, t.kind) : undefined) ?? tb.h;
    const feet = project(h.camera, h.canvas, p.x, 0, p.z);
    const head = project(h.camera, h.canvas, p.x, height, p.z);
    const side = project(h.camera, h.canvas, p.x + tb.w, height / 2, p.z);
    const mid = project(h.camera, h.canvas, p.x, height / 2, p.z);
    if (!feet.on || !head.on) continue;
    const halfW = Math.abs(side.x - mid.x);
    // the whole body on screen, away from the edges (the HUD sits there)
    if (Math.min(feet.x, head.x) - halfW < rect.left + 40 || Math.max(feet.x, head.x) + halfW > rect.right - 40) continue;
    if (head.y < rect.top + 40 || feet.y > rect.bottom - 40) continue;
    const crowd = all.filter((o) => o.id !== t.id && Math.hypot(at(h, o).x - p.x, at(h, o).z - p.z) <= 2).length;
    // a 4 x 5 grid over the box (feet to head, side to side), slightly inside its edges
    const rows = 5;
    const cols = Math.max(1, Math.round(per / rows));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const k = (i + 0.5) / rows;
        const s = ((j + 0.5) / cols) * 2 - 1;
        const x = feet.x + (head.x - feet.x) * k + s * halfW * 0.9;
        const y = feet.y + (head.y - feet.y) * k;
        const o = oldPick(x, y);
        const n = newPick(x, y);
        out.push({ kind: t.kind, crowd, old: !o ? 'none' : o.id === t.id ? 'hit' : 'other', neu: !n ? 'none' : n.id === t.id ? 'hit' : 'other' });
      }
    }
  }
  return out;
}

/** The busiest enemy hero right now (most units drawn within 2 m), as a camera point (m), or null. */
export function busiest(h: PickLabHost): { x: number; z: number; crowd: number } | null {
  const team = h.myTeam();
  const all = h.units().filter((u) => u.state !== 'dead' && u.kind !== 'fountain' && u.kind !== 'pickup');
  let best: { x: number; z: number; crowd: number } | null = null;
  for (const u of all) {
    if (u.kind !== 'hero' || !isEnemy(u, team)) continue;
    const p = at(h, u);
    const crowd = all.filter((o) => o.id !== u.id && Math.hypot(at(h, o).x - p.x, at(h, o).z - p.z) <= 2).length;
    if (!best || crowd > best.crowd) best = { x: p.x, z: p.z, crowd };
  }
  return best;
}

/** Enemy heroes' drawn chests on screen (client px, 70% of the model height), for a real hover or tap. */
export function chests(h: PickLabHost): { id: number; x: number; y: number }[] {
  const team = h.myTeam();
  const rect = h.canvas.getBoundingClientRect();
  const out: { id: number; x: number; y: number }[] = [];
  for (const u of h.units()) {
    if (u.kind !== 'hero' || u.state === 'dead' || !isEnemy(u, team)) continue;
    const p = at(h, u);
    const c = project(h.camera, h.canvas, p.x, (h.drawn.height?.(u.id, u.kind) ?? 2.6) * 0.7, p.z);
    if (c.on && c.x > rect.left + 60 && c.x < rect.right - 60 && c.y > rect.top + 60 && c.y < rect.bottom - 60) out.push({ id: u.id, x: c.x, y: c.y });
  }
  return out;
}
