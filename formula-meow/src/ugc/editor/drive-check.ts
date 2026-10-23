/**
 * Drive check for doodled tracks with set pieces (SIM_VERSION 8, ai-ugc lane, SETPIECES.md section 10). One headless
 * lap of the phone bot (skill 0.2, auto-gas, one-thumb drift) at 50cc, alone, through the deterministic sim: a track
 * whose stunts make it respawn, fall into a jump's net or stall (under 3 m/s for over a second) fails, with the piece
 * it happened on painted red. About 2,000 ticks of one kart: a few milliseconds.
 *
 * The validator (validate.ts) runs it last, only when every other rule passes, so the share-code decoder also refuses
 * a hand-made code for a track the phone player could not clear first time.
 */
import type { TrackDef } from '../../types';
import { SimWorld, GO_TICK } from '../../core/sim/world';
import { speedOf } from '../../core/sim/kart';
import type { BuiltTrack } from '../../core/track/build';
import { pieceAtSample } from '../../core/track/stunt';
import { buildField, createSimPlugins } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import type { Issue } from './validate';

/** The bot's skill (the phone player), the stall rule, and a time cap per metre of lap. */
export const DRIVE_CHECK = { skill: 0.2, stallSpeed: 3, stallTicks: 60, capPerMetre: 0.25 } as const;

/** Why the drive check failed, and where (built sample), or null when the lap was clean. */
export interface DriveFailure {
  why: 'respawn' | 'net' | 'stall' | 'slow';
  i: number;
}

/** Run the drive check on `def` (built as `t`); null = a clean lap. */
export function driveLap(def: TrackDef): DriveFailure | null {
  const racers = buildField({ seed: 1, cls: 0, playerSlot: 0 }).slice(0, 1);
  const cfg = { track: def, seed: 1, cls: 0 as const, modifiers: 0, racers, humans: [0], forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins(cfg));
  const k = w.st.karts[0];
  const cap = GO_TICK + 600 + Math.round(w.track.length * DRIVE_CHECK.capPerMetre * 60);
  let still = 0;
  let read = 0;
  const startLap = k.lap;
  // (a world whose race is over no longer ticks: stop there too)
  while (w.tick < cap && !w.done) {
    const o = playerBot(w.ctx, 0, DRIVE_CHECK.skill);
    if (w.tick >= GO_TICK) o.gas = true;
    o.item = false;
    w.step([o]);
    const ev = w.st.events;
    for (; read < ev.length; read++) {
      const e = ev[read];
      if (e.kart !== 0) continue;
      if (e.type === 'respawn') return { why: 'respawn', i: k.si };
      if (e.type === 'netCatch') return { why: 'net', i: k.si };
    }
    if (w.tick > GO_TICK + 120 && k.netTicks === 0 && k.spinTicks === 0 && speedOf(k) < DRIVE_CHECK.stallSpeed) {
      if (++still > DRIVE_CHECK.stallTicks) return { why: 'stall', i: k.si };
    } else still = 0;
    if (k.lap > startLap + 1 || k.finished) return null;
  }
  return { why: 'slow', i: k.si };
}

/** The drive check as validator issues: [] for a clean lap, else one issue painting the piece (or the spot). */
export function driveCheck(def: TrackDef, t: BuiltTrack, run: (def: TrackDef) => DriveFailure | null = driveLap): Issue[] {
  let f: DriveFailure | null;
  try {
    f = run(def);
  } catch {
    return [{ code: 'drive', message: 'This track could not be test-driven. Try moving the stunts.' }];
  }
  if (!f) return [];
  const pc = pieceAtSample(t, f.i) ?? nearestPiece(t, f.i);
  const r = Math.round(12 / t.step);
  const from = pc ? pc.strip : (f.i - r + t.n) % t.n;
  const to = pc ? pc.end : (f.i + r) % t.n;
  const msg =
    f.why === 'net'
      ? 'The test kart fell into the jump net. Make the gap shorter or the run-up straighter.'
      : f.why === 'stall'
        ? 'The test kart got stuck here. Give the stunt more room.'
        : 'The test kart could not get round here. Move or remove this stunt.';
  return [{ code: 'drive', message: msg, from, to }];
}

/** The piece whose footprint is nearest behind sample i (a failure just after a piece belongs to it). */
function nearestPiece(t: BuiltTrack, i: number) {
  let best = null as BuiltTrack['pieces'][number] | null;
  let bestD = Math.round(30 / t.step);
  for (const pc of t.pieces) {
    const d = (i - pc.end + t.n) % t.n;
    if (d < bestD) {
      bestD = d;
      best = pc;
    }
  }
  return best;
}
