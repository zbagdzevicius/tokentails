/**
 * Run-length encoded input logs. The RLE is copied from catnip-heist/src/sim/replay.ts and adapted
 * to Bad Cat's TickInput: one run = [dir (0..8), speed (0..2), buttons (BTN_* mask), count].
 * The ghost codec (src/codec/ghost-codec.ts) bit-packs these runs (dir:4, speed:2, flags:4, count:8),
 * so runs longer than 255 ticks are split by the codec, not here.
 */
import type { Dir8, Speed, TickInput } from '../types';

export type InputRun = [dir: number, speed: number, buttons: number, count: number];

/** Run-length encode per-tick inputs. */
export function encodeInputs(inputs: readonly TickInput[]): InputRun[] {
  const runs: InputRun[] = [];
  for (const i of inputs) {
    const last = runs[runs.length - 1];
    if (last && last[0] === i.dir && last[1] === i.speed && last[2] === i.buttons) last[3]++;
    else runs.push([i.dir, i.speed, i.buttons, 1]);
  }
  return runs;
}

/** Expand runs into per-tick inputs. */
export function decodeInputs(runs: readonly InputRun[]): TickInput[] {
  const out: TickInput[] = [];
  for (const r of runs) {
    const i: TickInput = { dir: r[0] as Dir8, speed: r[1] as Speed, buttons: r[2] };
    for (let k = 0; k < r[3]; k++) out.push(i);
  }
  return out;
}
