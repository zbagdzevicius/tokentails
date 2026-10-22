/**
 * Wild Card mutators (ITERATION-4.md F11): the 72-race harness per mutator. The average-player bot from 6th on the
 * grid races 6 tracks × 12 seeds with each item mutator on: the whole field finishes, wall hits stay in the range of
 * plain races, and the podium rate says whether a mutator is too punishing for a class (Cucumbers Only at 50cc).
 *
 * The full run (5 × 72 races per class) takes minutes: `FM_MUTATORS=full npx vitest run src/modes/mutators.test.ts`
 * (prints the report). The default suite runs a 2-track × 3-seed smoke of the same checks.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Modifier, type RaceClass } from '../types';
import { TRACKS } from '../core/track/tracks';
import { raceConfig, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { MUTATORS, mutatorAllowed } from './mutators';

const FULL = typeof process !== 'undefined' && process.env.FM_MUTATORS === 'full';
const PLAYER = 5;

interface Row {
  races: number;
  podium: number;
  dnf: number;
  wallHits: number;
  hits: number;
}

function run(mods: number, cls: RaceClass, tracks = TRACKS, seeds = 12): Row {
  const r: Row = { races: 0, podium: 0, dnf: 0, wallHits: 0, hits: 0 };
  for (const def of tracks)
    for (let seed = 1; seed <= seeds; seed++) {
      const cfg = { ...raceConfig(def, { seed, cls, humans: [PLAYER] }), modifiers: mods, tailTicks: 60 * 60 };
      const w = world(cfg);
      while (!w.done) w.step([playerBot(w.ctx, PLAYER, 0.5)]);
      const res = w.result();
      r.races++;
      if (res.player.place <= 3) r.podium++;
      r.dnf += res.places.filter((p) => p.time == null).length;
      for (const e of w.st.events) {
        if (e.kart !== PLAYER) continue;
        if (e.type === 'wall') r.wallHits++;
        else if (e.type === 'hit') r.hits++;
      }
    }
  return r;
}

const fmtRow = (name: string, r: Row) =>
  `${name.padEnd(16)} podium ${((100 * r.podium) / r.races).toFixed(0).padStart(3)} %  dnf ${String(r.dnf).padStart(3)}  walls/race ${(r.wallHits / r.races).toFixed(1).padStart(5)}  hits taken/race ${(r.hits / r.races).toFixed(2)}`;

describe('Wild Card mutators: the 72-race harness', () => {
  it(FULL ? 'full: 72 races per mutator at 50cc and 100cc (report)' : 'smoke: every item mutator races to the flag with the whole field', { timeout: 3_600_000 }, () => {
    const tracks = FULL ? TRACKS : TRACKS.slice(0, 2);
    const seeds = FULL ? 12 : 2;
    const classes: RaceClass[] = FULL ? [0, 1] : [0];
    const lines: string[] = [];
    const rows: Array<{ cls: RaceClass; bit: number; r: Row; base: Row }> = [];
    for (const cls of classes) {
      const base = run(0, cls, tracks, seeds);
      lines.push(`--- class ${cls}`, fmtRow('(none)', base));
      for (const m of MUTATORS) {
        if (m.renderOnly) continue;
        const r = run(m.bit, cls, tracks, seeds);
        lines.push(fmtRow(m.id, r));
        rows.push({ cls, bit: m.bit, r, base });
      }
    }
    if (FULL || process.env.FM_MUTATORS_PRINT) console.log(lines.join('\n'));
    if (process.env.FM_MUTATORS_OUT) writeFileSync(process.env.FM_MUTATORS_OUT, lines.join('\n') + '\n');
    for (const { cls, bit, r, base } of rows) {
      // a 50cc field with a long tail finishes: no mutator strands a cat
      expect(r.dnf).toBe(0);
      // wall hits stay in the same range as a plain race (items shove karts, they never pin them)
      expect(r.wallHits / r.races).toBeLessThanOrEqual(Math.max(4, (base.wallHits / base.races) * 2));
      // Cucumbers Only is held back from a class only when the bot's podium rate there falls under half
      if (FULL && bit === Modifier.CucumbersOnly && !mutatorAllowed(bit, cls)) expect(r.podium / r.races).toBeLessThan(0.5);
    }
  });
});
