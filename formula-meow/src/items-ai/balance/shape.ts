/**
 * Race shape harness (feel lane, ITERATION-2.md "Race shape"): with the average-player bot (`playerBot`, skill 0.5)
 * in the 6th grid slot, how often it reaches the podium per class, and how spread out the field finishes (first to
 * last finish time). Targets: podium 70–90 % at 50cc and 25–50 % at 150cc; spread 8–15 s at 50cc and 5–8 s at 150cc.
 *
 * `FM_SHAPE_PRINT=1 npx vitest run src/items-ai/balance/shape.test.ts` prints the report.
 */
import type { RaceClass, TrackDef } from '../../types';
import { SimWorld } from '../../core/sim/world';
import { buildTrack, type BuiltTrack } from '../../core/track/build';
import { buildField, createSimPlugins } from '..';
import { playerBot } from './bots';

export interface ShapeRow {
  cls: RaceClass;
  races: number;
  /** share of races where the bot finished 1st–3rd */
  podium: number;
  /** share of races the bot won */
  wins: number;
  /** mean bot place */
  place: number;
  /** mean first-to-last finish spread, s */
  spread: number;
  /** mean finish gap between 1st and 2nd, s */
  margin: number;
  /** mean hits taken per kart per race */
  hits: number;
}

const PLAYER = 5;

export function runShape(tracks: readonly TrackDef[], classes: readonly RaceClass[], seeds: number, botSkill = 0.5): ShapeRow[] {
  const built = new Map<string, BuiltTrack>();
  const rows: ShapeRow[] = [];
  for (const cls of classes) {
    const row: ShapeRow = { cls, races: 0, podium: 0, wins: 0, place: 0, spread: 0, margin: 0, hits: 0 };
    for (const def of tracks) {
      if (!built.has(def.id)) built.set(def.id, buildTrack(def, 0));
      for (let seed = 1; seed <= seeds; seed++) {
        const s = seed * 7121 + cls * 3301 + def.id.length * 17;
        const racers = buildField({ seed: s, cls, playerSlot: PLAYER });
        const cfg = { track: def, seed: s, cls, modifiers: 0, racers, humans: [PLAYER], forgiving: false, tailTicks: 60 * 60 };
        const w = new SimWorld(cfg, createSimPlugins(cfg), built.get(def.id));
        while (!w.done) w.step([playerBot(w.ctx, PLAYER, botSkill)]);
        const r = w.result();
        const place = r.player.place;
        row.races++;
        if (place <= 3) row.podium++;
        if (place === 1) row.wins++;
        row.place += place;
        const t = r.places.map((p) => p.time ?? Infinity).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
        row.spread += t[t.length - 1] - t[0];
        row.margin += t[1] - t[0];
        row.hits += w.st.events.filter((e) => e.type === 'hit').length / racers.length;
      }
    }
    row.podium /= row.races;
    row.wins /= row.races;
    row.place /= row.races;
    row.spread /= row.races;
    row.margin /= row.races;
    row.hits /= row.races;
    rows.push(row);
  }
  return rows;
}

export function formatShape(rows: readonly ShapeRow[]): string {
  return rows
    .map(
      (r) =>
        `cls ${r.cls}: ${r.races} races, bot podium ${(100 * r.podium).toFixed(0)} %, wins ${(100 * r.wins).toFixed(0)} %, mean place ${r.place.toFixed(2)}, spread ${r.spread.toFixed(1)} s, margin ${r.margin.toFixed(2)} s, hits/kart ${r.hits.toFixed(2)}`,
    )
    .join('\n');
}
