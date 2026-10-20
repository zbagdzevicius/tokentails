import { it } from 'vitest';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { ROOFTOPS } from '../core/track/tracks/rooftops';
import { LAUNDRY } from '../core/track/tracks/laundry';
import type { TrackDef } from '../types';
import { raceConfig, world } from '../test/fixtures';
import { GO_TICK } from '../core/sim/world';
import { followLine } from '../core/sim/autopilot';
import { atan2L, clamp, wrapAngle } from '../core/sim/fixed';
import { STUNT } from '../tuning';

const tracks: Record<string, TrackDef> = { kitchen: KITCHEN, rooftops: ROOFTOPS, laundry: LAUNDRY };

function stretch(def: TrackDef, lane: boolean, cls: 0 | 1 | 2): [number, number, number] {
  const w = world(raceConfig(def, { humans: [0], solo: true, cls }));
  const t = w.track;
  const k = w.st.karts[0];
  const wall = t.pieces.find((p) => p.kind === 'wall');
  if (!wall) return [-1, -1, -1];
  const before = Math.round(20 / t.step);
  const after = Math.round(30 / t.step);
  let a = -1;
  let b = -1;
  let heads = 0;
  const t0 = w.tick;
  while (w.tick < GO_TICK) w.step([{ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false }]);
  while (b < 0 && w.tick < t0 + 60 * 90) {
    const o = { steer: 0, gas: true, brake: false, drift: false, item: false, itemBack: false };
    followLine(w.ctx, 0, o, 0);
    const into = (k.si - (wall.i0 - before) + t.n) % t.n;
    const span = (wall.i1 - (wall.i0 - before) + t.n) % t.n;
    if (lane && k.branch === -1 && into <= span) {
      const j = (k.si + Math.round(8 / t.step)) % t.n;
      const s = wall.side >= 0 ? 1 : -1;
      const lw = s > 0 ? t.laneR[j] : t.laneL[j];
      const d = s * (t.halfW[j] + Math.max(0, lw - STUNT.wall.lane / 2) + (lw > 0.5 ? 0 : -1));
      const want = atan2L(t.px[j] - t.tz[j] * d - k.x, t.pz[j] + t.tx[j] * d - k.z);
      o.steer = Math.round(clamp(-wrapAngle(want - k.heading) * 3, -1, 1) * 7);
    }
    const ne = w.st.events.length;
    w.step([o]);
    for (let e = ne; e < w.st.events.length; e++) if (w.st.events[e].type === 'wall' && w.st.events[e].a === 2) heads++;
    if (a < 0 && k.branch === -1 && into <= span) a = w.tick;
    const past = (k.si - wall.i1 + t.n) % t.n;
    if (a >= 0 && k.branch === -1 && past >= after && past < after + 40) b = w.tick;
  }
  return [(b - a) / 60, heads, 0];
}

it('wall candidates', () => {
  const which = process.env.T ?? 'kitchen';
  const cands = (process.env.C ?? '33:19').split(',').map((c) => c.split(':').map(Number));
  const out: string[] = [];
  for (const [s, len] of cands) {
    const base = tracks[which];
    const def: TrackDef = { ...base, setPieces: [...(base.setPieces ?? []).filter((p) => p.kind !== 'wall'), { kind: 'wall', s, len }] };
    const row: string[] = [];
    for (const cls of [0, 2] as const) {
      const [r] = stretch(def, false, cls);
      const [l, h] = stretch(def, true, cls);
      row.push(`c${cls} road ${r.toFixed(2)} lane ${l.toFixed(2)} Δ${(l - r).toFixed(2)} head${h}`);
    }
    out.push(`${which} wall s${s} len${len}: ${row.join(' | ')}`);
  }
  console.log(out.join('\n'));
});
