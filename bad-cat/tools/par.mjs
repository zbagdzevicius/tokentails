#!/usr/bin/env node
/**
 * npm run par (GDD 4.5, 13.7): par paws per room from recorded dev runs, not a bot.
 *
 *   node tools/par.mjs                 read runs/<roomId>/*.ghost, re-simulate each ghost under its own rules
 *                                      (the simVersion in its header), write src/content/par.json
 *   node tools/par.mjs --dry           print the table, write nothing
 *   node tools/par.mjs --prune         drop par entries of rooms that have no runs left
 *   node tools/par.mjs add <link|payload> [...]   save dare/replay links (g= or rp=) as runs/<roomId>/<n>.ghost;
 *                                      the room is found from the ghost's room key, so any link format works
 *
 * bronze = median of the runs (5 expected), silver = best, gold = floor(best x 1.15). See tools/RECORDING.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { viteLoader, PKG_ROOT } from './lib/vite-load.mjs';
import { candidateRoomIds, playableFor } from './lib/rooms.mjs';
import { ghostFromLink, ghostPayloadOf, mergePar, parFrom } from './lib/par-math.mjs';
import { hasFlag, positionals } from './lib/args.mjs';

// Overridable for tests and dry experiments (never needed in the normal flow).
const RUNS = path.resolve(process.env.BADCAT_RUNS_DIR || path.join(PKG_ROOT, 'runs'));
const PAR_JSON = path.resolve(process.env.BADCAT_PAR_JSON || path.join(PKG_ROOT, 'src', 'content', 'par.json'));
const args = positionals();
const dry = hasFlag('--dry');
const prune = hasFlag('--prune');

const v = await viteLoader();
let exitCode = 0;
try {
  const content = await v.load('/src/content/index.ts');
  const sim = await v.load('/src/sim/index.ts');
  const codec = await v.load('/src/codec/index.ts');
  const types = await v.load('/src/types.ts');
  const cat = codec.decodeCatOrDefault('');

  if (args[0] === 'add') {
    const byKey = new Map(candidateRoomIds(content).map((id) => [codec.roomKey(id), id]));
    for (const raw of args.slice(1)) {
      if (/[?&#]m=f(&|$)/.test(raw)) {
        console.error('skip: an FTUE (first heist, m=f) run has different timing; record a normal run');
        exitCode = 1;
        continue;
      }
      const payload = ghostFromLink(raw);
      const ghost = payload ? await codec.decodeGhost(payload) : null;
      if (!ghost) {
        console.error(`skip: no decodable ghost in ${raw.slice(0, 60)}`);
        exitCode = 1;
        continue;
      }
      const roomId = byKey.get(ghost.roomHash);
      if (!roomId) {
        console.error(`skip: ghost room key ${ghost.roomHash} matches no daily, preview, variant or The Glass (player rooms have no par)`);
        exitCode = 1;
        continue;
      }
      const dir = path.join(RUNS, roomId);
      fs.mkdirSync(dir, { recursive: true });
      const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.ghost'));
      const dup = existing.find((f) => ghostPayloadOf(fs.readFileSync(path.join(dir, f), 'utf8')) === payload);
      if (dup) {
        console.log(`already saved: runs/${roomId}/${dup}`);
        continue;
      }
      let k = existing.length + 1;
      while (fs.existsSync(path.join(dir, `run-${k}.ghost`))) k++;
      const file = path.join(dir, `run-${k}.ghost`);
      const res = sim.runToEnd(playableFor(content, roomId), cat, ghost.inputs, { simVersion: ghost.simVersion });
      fs.writeFileSync(file, `# ${roomId} sim v${ghost.simVersion} score ${res.score} (${res.rank}) saved ${new Date().toISOString()}\n${payload}\n`);
      console.log(`saved runs/${roomId}/run-${k}.ghost  score ${res.score}  ${res.stamp}`);
    }
  } else {
    const rooms = fs.existsSync(RUNS) ? fs.readdirSync(RUNS).filter((d) => fs.statSync(path.join(RUNS, d)).isDirectory()).sort() : [];
    const computed = {};
    for (const roomId of rooms) {
      const play = playableFor(content, roomId);
      if (!play) {
        console.warn(`warning: runs/${roomId}: not a daily, preview, variant or The Glass; skipped`);
        continue;
      }
      const files = fs.readdirSync(path.join(RUNS, roomId)).filter((f) => f.endsWith('.ghost')).sort();
      const scores = [];
      for (const f of files) {
        const payload = ghostPayloadOf(fs.readFileSync(path.join(RUNS, roomId, f), 'utf8'));
        const ghost = payload ? await codec.decodeGhost(payload) : null;
        if (!ghost) {
          console.warn(`warning: runs/${roomId}/${f}: not a ghost payload; skipped`);
          continue;
        }
        if (ghost.roomHash !== codec.roomKey(roomId)) {
          console.warn(`warning: runs/${roomId}/${f}: recorded in another room; skipped`);
          continue;
        }
        if (ghost.simVersion < types.MIN_REPLAY_SIM_VERSION || ghost.simVersion > types.SIM_VERSION) {
          console.warn(`warning: runs/${roomId}/${f}: sim v${ghost.simVersion} cannot be replayed; skipped`);
          continue;
        }
        if (ghost.simVersion !== types.SIM_VERSION)
          console.warn(`note: runs/${roomId}/${f}: replayed under its own rules v${ghost.simVersion} (current ${types.SIM_VERSION}); re-record for current-rule par`);
        const res = sim.runToEnd(play, cat, ghost.inputs, { simVersion: ghost.simVersion });
        scores.push(res.score);
      }
      const par = parFrom(scores);
      if (!par) continue;
      if (scores.length !== 5) console.warn(`note: ${roomId} has ${scores.length} runs (5 expected)`);
      computed[roomId] = par;
      console.log(`${roomId.padEnd(12)} runs ${String(scores.length).padEnd(2)} [${scores.join(', ')}] -> bronze ${par.bronze}, silver ${par.silver}, gold ${par.gold}`);
    }
    const existing = fs.existsSync(PAR_JSON) ? JSON.parse(fs.readFileSync(PAR_JSON, 'utf8') || '{}') : {};
    const next = mergePar(existing, computed, { prune });
    const text = `${JSON.stringify(next, null, 2)}\n`;
    if (!rooms.length) console.log('no recorded runs in runs/ (see tools/RECORDING.md); par.json unchanged');
    else if (dry) console.log(`--dry: would write ${Object.keys(next).length} rooms`);
    else if (!fs.existsSync(PAR_JSON) || fs.readFileSync(PAR_JSON, 'utf8') !== text) {
      fs.writeFileSync(PAR_JSON, text);
      console.log(`wrote ${path.relative(PKG_ROOT, PAR_JSON)} (${Object.keys(next).length} rooms)`);
    } else console.log('par.json already up to date');
  }
} finally {
  await v.close();
}
process.exit(exitCode);
