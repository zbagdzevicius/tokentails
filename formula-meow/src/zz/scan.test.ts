import { it } from 'vitest';
import { buildTrack } from '../core/track/build';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { ROOFTOPS } from '../core/track/tracks/rooftops';
import { LAUNDRY } from '../core/track/tracks/laundry';
import type { TrackDef } from '../types';

const tracks: Record<string, TrackDef> = { kitchen: KITCHEN, rooftops: ROOFTOPS, laundry: LAUNDRY };
for (const which of (process.env.T ?? 'kitchen').split(','))
it('scan ' + which, () => {
  const def = tracks[which];
  const t = buildTrack(def, 0);
  const n = t.n;
  const start = def.features.find((f) => f.kind === 'start')!.s;
  const startI = Math.round((start / 256) * n);
  const lines: string[] = [`${def.id} n=${n} step=${t.step.toFixed(3)} len=${(n * t.step).toFixed(0)} m/unit=${((n * t.step) / 256).toFixed(2)} issues=${JSON.stringify(t.pieceIssues)}`];
  for (const pc of t.pieces) lines.push(`piece ${pc.kind} i0=${pc.i0} i1=${pc.i1} strip=${pc.strip} end=${pc.end} side=${pc.side} land=${pc.land0}-${pc.land1}`);
  for (let s = 0; s < 256; s++) {
    const i = (((Math.round((s / 256) * n) - startI) % n) + n) % n;
    const c = t.curv[i];
    const R = Math.abs(c) < 1e-4 ? 9999 : 1 / Math.abs(c);
    const j = (i + 3) % n;
    const grade = (t.py[j] - t.py[i]) / (3 * t.step);
    const tags: string[] = [];
    for (const f of def.features) if (Math.round(f.s) === s) tags.push(f.kind + (f.side ? f.side : ''));
    for (const h of def.hazards ?? []) if (Math.round(h.s) === s) tags.push('HZ:' + h.kind);
    for (const co of def.coins ?? []) if (Math.round(co.s) === s && co.branch === undefined) tags.push('coin');
    for (const sp of def.setPieces ?? []) if (sp.s === s) tags.push('SP:' + sp.kind);
    for (const b of def.branches ?? []) {
      if (b.from === s) tags.push('FORK');
      if (b.to === s) tags.push('MERGE');
    }
    lines.push(`s${s} i${i} R${R.toFixed(0)}${c > 0 ? 'L' : c < 0 ? 'R' : ''} g${(grade * 100).toFixed(0)}% hw${t.halfW[i].toFixed(1)} y${t.py[i].toFixed(1)} pa${t.pieceAt[i]} lane${(t.laneL[i] + t.laneR[i]).toFixed(1)} (${t.px[i].toFixed(0)},${t.pz[i].toFixed(0)}) ${tags.join(' ')}`);
  }
  console.log(lines.join('\n'));
});
