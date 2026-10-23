// Ultra Cat trailer capture (STORYBOARD.md). Runs its own vite dev server on TRAILER_PORT (default 6231).
//   node tools/trailer/capture.mjs                     every shot, both aspects
//   node tools/trailer/capture.mjs hook combo          some shots
//   node tools/trailer/capture.mjs --aspect 9x16       one aspect
// Footage: tools/trailer/build/footage/<shot>-<aspect>.mp4 + .json (events per take frame). Stills: build/stills/.
import { SHOTS } from './shots.mjs';
import * as L from './lib.mjs';

const args = process.argv.slice(2);
let aspects = ['16x9', '9x16'];
const ai = args.indexOf('--aspect');
if (ai >= 0) {
  aspects = args[ai + 1].split(',');
  args.splice(ai, 2);
}
const want = args.length ? args : Object.keys(SHOTS);
await L.startServer();
let failed = 0;
try {
  for (const id of want) {
    const s = SHOTS[id];
    if (!s) {
      console.log('unknown shot', id, '; one of', Object.keys(SHOTS).join(' '));
      failed++;
      continue;
    }
    for (const aspect of s.aspects ?? ['16x9']) {
      if (!aspects.includes(aspect)) continue;
      const t0 = Date.now();
      const o = await L.openGame(aspect, { seed: s.seed ?? 1 });
      try {
        const r = await s.run(o, L);
        const last = r?.states?.at(-1);
        console.log(`${id} ${aspect}: ${((Date.now() - t0) / 1000).toFixed(0)} s, events ${r?.log?.length ?? 0}, end ${JSON.stringify(last ?? {})}${o.errors.length ? ' ERRORS ' + o.errors.slice(0, 3).join(' | ') : ''}`);
        if (o.errors.length) failed++;
      } catch (e) {
        console.log(`${id} ${aspect}: FAILED ${e.stack}`);
        failed++;
      } finally {
        await o.close();
      }
    }
  }
} finally {
  await L.closeBrowser();
  L.stopServer();
}
process.exit(failed ? 1 : 0);
