/** Test support (not shipped): seeded random doodle tracks through the editor's pipeline, and AI wall counts on them. */
import type { RaceClass, TrackDef } from '../types';
import { buildField, createSimPlugins } from '../items-ai';
import { SimWorld } from '../core/sim/world';
import { doodleToPoints, starterFeatures } from '../ugc/editor/doodle';
import { validateTrack } from '../ugc/editor/validate';

/** Seeded random doodle loops (a wobbly closed stroke through the editor's own pipeline), valid ones only. */
export function randomDoodles(count: number, seed = 1): TrackDef[] {
  const out: TrackDef[] = [];
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const R = 55 + rnd() * 45;
    const a1 = rnd() * 0.3;
    const a2 = rnd() * 0.2;
    const p1 = rnd() * 6.28;
    const p2 = rnd() * 6.28;
    const sx = 0.7 + rnd() * 0.6;
    const stroke = [];
    for (let k = 0; k <= 90; k++) {
      const th = (k / 90) * Math.PI * 2 * 0.985;
      const r = R * (1 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2));
      stroke.push({ x: Math.cos(th) * r * sx, z: Math.sin(th) * r });
    }
    const pts = doodleToPoints(stroke, (2 + (tries % 2)) as 2 | 3);
    if (!pts.ok) continue;
    const def = { ...starterFeatures(pts.points, 0), id: `doodle-${tries}`, name: `Doodle ${tries}` };
    if (!validateTrack(def).ok) continue;
    out.push(def);
  }
  return out;
}

/** AI-only races on `defs`: wall events per AI per lap (B15: fewer than 2). */
export function doodleWalls(defs: readonly TrackDef[], cls: RaceClass = 1): { worst: number; mean: number; worstId: string } {
  let worst = 0;
  let worstId = '';
  let sum = 0;
  for (const def of defs) {
    const racers = buildField({ seed: 7, cls, playerSlot: -1 });
    const w = new SimWorld({ track: def, seed: 7, cls, modifiers: 0, racers, humans: [], forgiving: false, tailTicks: 60 * 30 }, createSimPlugins());
    while (!w.done) w.step();
    const laps = Math.max(1, def.laps);
    const per = w.st.events.filter((e) => e.type === 'wall').length / racers.length / laps;
    sum += per;
    if (per > worst) {
      worst = per;
      worstId = def.id;
    }
  }
  return { worst, mean: sum / Math.max(1, defs.length), worstId };
}
