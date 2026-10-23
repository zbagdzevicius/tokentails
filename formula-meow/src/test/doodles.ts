/** Test support (not shipped): seeded random doodle tracks through the editor's pipeline, and AI wall counts on them. */
import type { RaceClass, TrackDef } from '../types';
import { buildField, createSimPlugins } from '../items-ai';
import { SimWorld } from '../core/sim/world';

/** Seeded random doodle loops (a wobbly closed stroke through the editor's pipeline), valid ones only: moved to the
 * editor's Surprise track generator (iteration 4, F10) and re-exported here. */
export { randomDoodles, randomStroke, surpriseTrack } from '../ugc/editor/surprise';

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
