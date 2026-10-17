#!/usr/bin/env node
/**
 * npm run validate (GDD 13.7): every daily 1..N (default 200), The Glass, the 7 Kitchen variants and one sample
 * room per shell go through content.validate (BFS reachability, first target <= 6 s, prop budget, occluders),
 * then one empty-input sim run under the current SIM_VERSION (the room loads and the sim ends). Prints a table;
 * exit 1 on any error.
 *
 *   node tools/validate.mjs [--days 200] [--quiet] [--bots]
 *
 * --bots also runs the QA round 3 feel rules with the planner bot (content.botProblems: a cat that never freezes is
 * caught before 30 s, waiting <= 40 %) on the daily rooms; slow (about 1 s a room).
 */
import { viteLoader } from './lib/vite-load.mjs';
import { playableFor } from './lib/rooms.mjs';
import { argValue, hasFlag } from './lib/args.mjs';

const days = Math.max(1, Number(argValue('--days') ?? 200) | 0);
const quiet = hasFlag('--quiet');
const bots = hasFlag('--bots');

const v = await viteLoader();
let failed = 0;
try {
  const content = await v.load('/src/content/index.ts');
  const sim = await v.load('/src/sim/index.ts');
  const codec = await v.load('/src/codec/index.ts');
  const types = await v.load('/src/types.ts');
  const cat = codec.decodeCatOrDefault('');

  /** @type {{ id: string; label: string; group: string }[]} */
  const rooms = [{ id: 'glass', label: 'The Glass', group: 'glass' }];
  for (const r of content.KITCHEN_VARIANTS) rooms.push({ id: r.id, label: r.title ?? r.id, group: 'variant' });
  const shellSample = new Map();
  for (let n = 1; n <= days; n++) {
    const id = `daily-${String(n).padStart(3, '0')}`;
    rooms.push({ id, label: content.roomLabel(n), group: 'daily' });
    const shell = content.dailyRoom(n).shell;
    if (!shellSample.has(shell)) shellSample.set(shell, n);
  }
  // A sample per shell beyond the range (a shell the first N days never use): the first day up to 2 years out.
  for (let n = days + 1; n <= 730 && shellSample.size < content.SHELLS.length; n++) {
    const shell = content.dailyRoom(n).shell;
    if (!shellSample.has(shell)) {
      shellSample.set(shell, n);
      rooms.push({ id: `daily-${String(n).padStart(3, '0')}`, label: `${content.roomLabel(n)} (shell sample)`, group: 'shell' });
    }
  }

  const rows = [];
  for (const r of rooms) {
    const errors = [];
    let ticks = -1;
    let props = 0;
    let shell = '';
    try {
      const play = playableFor(content, r.id);
      if (!play) throw new Error('unknown room id');
      props = play.room.props.length;
      shell = content.SHELLS[play.room.shell]?.name ?? String(play.room.shell);
      const rep = content.validate(play);
      ticks = rep.firstTargetTicks;
      errors.push(...rep.errors);
      const res = sim.runToEnd(play, cat, []);
      if (res.simVersion !== types.SIM_VERSION) errors.push(`sim stamped ${res.simVersion}, expected ${types.SIM_VERSION}`);
      if (!(res.ticks > 0)) errors.push('sim did not advance');
      if (bots && r.group === 'daily') {
        const vmod = await v.load('/src/content/validate.ts');
        errors.push(...vmod.botProblems(play));
      }
    } catch (err) {
      errors.push(`throws: ${err?.message ?? err}`);
    }
    if (errors.length) failed++;
    rows.push({ ...r, shell, props, ticks, errors });
  }

  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  const line = (a) => console.log(a.join('  '));
  line([pad('room', 12), pad('label', 34), pad('shell', 22), pad('props', 5), pad('1st', 4), 'result']);
  for (const r of rows) {
    if (quiet && !r.errors.length) continue;
    line([pad(r.id, 12), pad(r.label, 34), pad(r.shell, 22), pad(r.props, 5), pad(r.ticks, 4), r.errors.length ? `FAIL ${r.errors.join('; ')}` : 'ok']);
  }
  console.log(`\n${rows.length} rooms (dailies 1..${days}, The Glass, ${content.KITCHEN_VARIANTS.length} variants, ${shellSample.size}/${content.SHELLS.length} shells sampled), SIM_VERSION ${types.SIM_VERSION}: ${failed ? `${failed} FAILED` : 'all ok'}`);
  if (shellSample.size < content.SHELLS.length) {
    const missing = content.SHELLS.map((s, i) => i).filter((i) => !shellSample.has(i));
    console.log(`warning: shells never scheduled in 2 years: ${missing.join(', ')}`);
  }
} finally {
  await v.close();
}
process.exit(failed ? 1 : 0);
