import { it } from 'vitest';
import type { TrackDef } from '../../types';
import { raceConfig, stuntLab, world } from '../../test/fixtures';
import { playerBot } from '../balance/bots';
import { GO_TICK } from '../../core/sim/world';
import { KITCHEN } from '../../core/track/tracks/kitchen';
import { speedOf } from '../../core/sim/kart';

function survey(def: TrackDef, seed: number, cls: 0 | 1 | 2) {
  const w = world(raceConfig(def, { seed, cls, humans: [5] }));
  const t = w.track;
  const stall = new Array(8).fill(0);
  const stallMax = new Array(8).fill(0);
  const pieceWall = new Array(8).fill(0);
  let driftNear = 0;
  let lastEv = 0;
  while (!w.done && w.tick < 60 * 260) {
    const o = playerBot(w.ctx, 5, 0.2);
    if (w.tick >= GO_TICK) o.gas = true;
    w.step([o]);
    for (let i = 0; i < 8; i++) {
      const k = w.st.karts[i];
      if (w.tick > GO_TICK + 120 && !k.finished && speedOf(k) < 3 && k.respawnTicks === 0 && k.spinTicks === 0 && k.netTicks === 0) {
        stall[i]++;
        stallMax[i] = Math.max(stallMax[i], stall[i]);
      } else stall[i] = 0;
    }
    for (; lastEv < w.st.events.length; lastEv++) {
      const e = w.st.events[lastEv];
      const k = w.st.karts[e.kart];
      if (e.type === 'wall' && t.pieceAt[k.si] > 0) pieceWall[e.kart]++;
      if (e.type === 'driftStart') {
        for (const pc of t.pieces) {
          if (pc.kind !== 'loop' && pc.kind !== 'jump') continue;
          const at = pc.kind === 'loop' ? pc.strip : pc.i0;
          const ahead = ((at - k.si + t.n) % t.n) * t.step;
          if (ahead < 20) driftNear++;
        }
      }
    }
  }
  const ev = w.st.events;
  const c = (type: string, kart: number, f: (e: (typeof ev)[number]) => boolean = () => true) => ev.filter((e) => e.type === type && e.kart === kart && f(e)).length;
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(`${i}${i === 5 ? 'P' : ' '} fin=${w.st.karts[i].finished} resp=${c('respawn', i)} net=${c('netCatch', i)} loops=${c('stuntExit', i, (e) => e.a === 0)} land=${c('stuntLand', i)} lane=${c('stuntEnter', i, (e) => e.a === 1)} head=${c('wall', i, (e) => e.a === 2)} pw=${pieceWall[i]} stall=${stallMax[i]}`);
  require('fs').appendFileSync('/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/dbba0c29-a00d-4fad-8c19-ea74ac8d17c3/scratchpad/survey.txt', '\n' + `${def.id} seed ${seed} cls ${cls} tick ${w.tick} driftNear=${driftNear}\n` + rows.join('\n'));
}

it('survey', () => {
  for (const def of [stuntLab(), KITCHEN]) for (const cls of [0, 2] as const) for (const seed of [1, 2]) survey(def, seed, cls);
}, 120000);
