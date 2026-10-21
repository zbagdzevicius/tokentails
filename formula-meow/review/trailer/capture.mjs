// Trailer capture entry point (STORYBOARD section 6). Each capture group keeps its own runner so the two can run in
// parallel on their own ports:
//   node review/trailer/capture.mjs A probe|record [shot ids] [--aspect 16x9,9x16]   -> capture-a.mjs (port 6211)
//   node review/trailer/capture.mjs B ...                                             -> capture-b.mjs
// Footage lands in review/trailer/build/footage/<group>/<shot>-<16x9|9x16>.mp4 (+ .json frame log), gitignored.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [group, ...args] = process.argv.slice(2);
const runner = path.join(HERE, `capture-${String(group ?? '').toLowerCase()}.mjs`);
if (!group || !fs.existsSync(runner)) {
  console.log('usage: capture.mjs <A|B> <probe|record|...> [shot ids] [--aspect 16x9,9x16]');
  process.exit(1);
}
const p = spawn(process.execPath, [runner, ...args], { stdio: 'inherit' });
p.on('close', (c) => process.exit(c ?? 1));
