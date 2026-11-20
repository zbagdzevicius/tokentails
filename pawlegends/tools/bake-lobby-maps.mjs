#!/usr/bin/env node
/**
 * Home's map backdrops (render/lobby/mapViews.ts): bakes the 18 empty map spots of the lobby concepts (Nov 20, "Real
 * map backdrops") into the WebP pictures that pawlegends.app serves beside the skin art, outside the game bundle:
 * `pawlegends-web/public/pawlegends-art/lobby-maps/<id>-1920.webp` and `-1280.webp` (2.164:1, the 844x390 phone frame).
 *
 *   node tools/bake-lobby-maps.mjs [--only id,id] [--work DIR] [--ss 3] [--q 78] [--lock FILE]
 *
 * 1. tools/clips/stills-frame.mjs solves each shot's camera (tools/clips/lobby-maps.shots.json: the spot, the camera's
 *    azimuth, ground distance and height, the feet at (0.42, 0.8) of a 1266x585 frame).
 * 2. tools/clips/stills.mjs draws the live map there with the real renderer, the staged champion left out (`empty`).
 * 3. cwebp scales each PNG to 1920 and 1280 px wide.
 *
 * The champion is drawn live on Home with the same camera, in the champion-centred frame mapViews.ts keeps (MAP_VIEWS:
 * the camera at (0, h, gd), the target, the sun), so it stands on the spot. Change a shot here and there together.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from './lib/args.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(PKG, '../pawlegends-web/public/pawlegends-art/lobby-maps');
const SHOTS = join(PKG, 'tools/clips/lobby-maps.shots.json');
const work = argValue('--work') ? resolve(argValue('--work')) : mkdtempSync(join(tmpdir(), 'pl-lobby-maps-'));
const keepWork = !!argValue('--work');
const q = String(argValue('--q') ?? 78);
const ss = String(argValue('--ss') ?? 3);
const only = argValue('--only');
const lock = argValue('--lock');

const cleanup = () => {
  if (!keepWork) rmSync(work, { recursive: true, force: true });
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (cleanup(), process.exit(130)));

try {
  mkdirSync(join(work, 'png'), { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const stills = join(work, 'stills.json');
  execFileSync('node', [join(PKG, 'tools/clips/stills-frame.mjs'), SHOTS, stills], { stdio: 'inherit' });
  const args = [join(PKG, 'tools/clips/stills.mjs'), stills, '--out-dir', join(work, 'png'), '--ss', ss];
  if (only) args.push('--only', only);
  if (lock) args.push('--lock', lock);
  execFileSync('node', args, { stdio: 'inherit', cwd: PKG });
  for (const f of readdirSync(join(work, 'png')).filter((n) => n.endsWith('.png'))) {
    const id = f.slice(0, -4);
    for (const w of [1920, 1280]) {
      const out = join(OUT, `${id}-${w}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', q, '-m', '6', '-sharp_yuv', '-resize', String(w), '0', join(work, 'png', f), '-o', out]);
      console.log(`${id}-${w}.webp ${(statSync(out).size / 1024).toFixed(1)} KB`);
    }
  }
} finally {
  cleanup();
}
