/**
 * Stabilise harness (iteration 2 acceptance, ITERATION-2.md 1.8): headless races with the scripted player bot in the
 * player slot, measuring the bugs the audits found. Pure, no DOM; `harness.test.ts` asserts the targets and
 * `FM_HARNESS_PRINT=1` prints the report.
 *
 * - laser multi-hits: a kart made to chase the same Laser Dot twice (B17)
 * - bump spam: two `bump` events of one pair closer than PHYS.bumpCooldownTicks (B8)
 * - overtake spam: two `overtake` events of one ordered pair closer than RACE.overtakeCooldownTicks (B3)
 * - finish mismatches: a `finish` event whose place differs from the results table (B2)
 * - DNFs: karts that never finish with a long tail (50cc must have none)
 * - head-on wall hits per race (B13, B15)
 * - progress jumps: a kart's `dist` changing by more than speed × DT + 0.5 m in one tick (B4; the speed is the larger
 *   of the kart's speed before and after the tick)
 */
import type { RaceClass, TrackDef } from '../../types';
import { DT } from '../../types';
import { PHYS, RACE } from '../../tuning';
import { buildField, createSimPlugins } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import { ProjKind, itemsOf } from '../../items-ai/items/state';
import { buildTrack, type BuiltTrack } from '../track/build';
import { SimWorld } from './world';
import { speedOf } from './kart';

export interface HarnessReport {
  races: number;
  laserMultiHits: number;
  bumpSpam: number;
  overtakeSpam: number;
  finishMismatches: number;
  /** karts that did not finish, by class */
  dnf: [number, number, number];
  /** head-on wall hits per race, worst race and mean */
  headOnMax: number;
  headOnMean: number;
  /** worst race's track / class / seed for head-ons, and where they happened */
  headOnWorst: string;
  headOnWhere: string[];
  progressJumps: number;
  /** largest dist change beyond speed × DT in one tick, m */
  worstJump: number;
  respawnsMean: number;
}

const PLAYER = 5;

export function runHarness(tracks: readonly TrackDef[], classes: readonly RaceClass[], seeds: number, opts: { bot?: boolean } = {}): HarnessReport {
  const r: HarnessReport = {
    races: 0,
    laserMultiHits: 0,
    bumpSpam: 0,
    overtakeSpam: 0,
    finishMismatches: 0,
    dnf: [0, 0, 0],
    headOnMax: 0,
    headOnMean: 0,
    headOnWorst: '',
    headOnWhere: [],
    progressJumps: 0,
    worstJump: 0,
    respawnsMean: 0,
  };
  const built = new Map<string, BuiltTrack>();
  const bot = opts.bot ?? true;
  for (const def of tracks) {
    if (!built.has(def.id)) built.set(def.id, buildTrack(def, 0));
    for (const cls of classes)
      for (let seed = 1; seed <= seeds; seed++) {
        const s = seed * 7919 + cls * 104729 + def.id.length * 31;
        const racers = buildField({ seed: s, cls, playerSlot: bot ? PLAYER : -1 });
        const cfg = { track: def, seed: s, cls, modifiers: 0, racers, humans: bot ? [PLAYER] : [], forgiving: false, tailTicks: 60 * 60 };
        const w = new SimWorld(cfg, createSimPlugins(cfg), built.get(def.id));
        const n = racers.length;
        const lastBump = new Map<number, number>();
        const lastOvertake = new Map<number, number>();
        const laserVictims = new Map<number, Set<number>>();
        const prevDist = new Float64Array(n);
        const prevSpeed = new Float64Array(n);
        const respawnedAt = new Int32Array(n).fill(-999);
        let headOn = 0;
        const where: string[] = [];
        while (!w.done) {
          for (let i = 0; i < n; i++) {
            prevDist[i] = w.st.karts[i].dist;
            prevSpeed[i] = speedOf(w.st.karts[i]);
          }
          const before = w.st.events.length;
          w.step(bot ? [playerBot(w.ctx, PLAYER)] : []);
          const laser = itemsOf(w.st).proj.find((p) => p.kind === ProjKind.Laser);
          for (let e = before; e < w.st.events.length; e++) {
            const ev = w.st.events[e];
            if (ev.type === 'bump') {
              const key = ev.kart * n + (ev.b ?? 0);
              const last = lastBump.get(key);
              if (last != null && ev.tick - last < PHYS.bumpCooldownTicks) r.bumpSpam++;
              lastBump.set(key, ev.tick);
            } else if (ev.type === 'overtake') {
              const key = ev.kart * n + (ev.b ?? 0);
              const last = lastOvertake.get(key);
              if (last != null && ev.tick - last < RACE.overtakeCooldownTicks) r.overtakeSpam++;
              lastOvertake.set(key, ev.tick);
            } else if (ev.type === 'hit' && ev.a === 3) {
              // a chase hit comes only from the Laser Dot; key it by the dot alive this tick (or the last one)
              const id = laser?.id ?? -1;
              const set = laserVictims.get(id) ?? new Set<number>();
              if (set.has(ev.kart)) r.laserMultiHits++;
              set.add(ev.kart);
              laserVictims.set(id, set);
            } else if (ev.type === 'wall' && ev.a === 2) {
              headOn++;
              const k = w.st.karts[ev.kart];
              if (where.length < 40) where.push(`${ev.kart}@si${k.si}(${k.x.toFixed(0)},${k.z.toFixed(0)}) d${k.d.toFixed(1)}`);
            }
            else if (ev.type === 'respawn') respawnedAt[ev.kart] = ev.tick;
          }
          for (let i = 0; i < n; i++) {
            const k = w.st.karts[i];
            if (k.finished || k.respawnTicks > 0 || w.st.tick - respawnedAt[i] < 90) continue;
            const jump = Math.abs(k.dist - prevDist[i]) - Math.max(prevSpeed[i], speedOf(k)) * DT;
            if (jump > 0.55) r.progressJumps++; // 0.05: speed can change within the tick (contacts after the move)
            if (jump > r.worstJump) r.worstJump = jump;
          }
        }
        const res = w.result();
        for (const ev of w.st.events) {
          if (ev.type !== 'finish') continue;
          const row = res.places.find((p) => p.kart === ev.kart);
          if (!row || row.place !== ev.a) r.finishMismatches++;
        }
        r.dnf[cls] += w.st.karts.filter((k) => !k.finished).length;
        if (headOn > r.headOnMax) {
          r.headOnMax = headOn;
          r.headOnWorst = `${def.id} cls ${cls} seed ${s}`;
          r.headOnWhere = where.slice();
        }
        r.headOnMean += headOn;
        r.respawnsMean += w.st.events.filter((e) => e.type === 'respawn').length;
        r.races++;
      }
  }
  r.headOnMean /= Math.max(1, r.races);
  r.respawnsMean /= Math.max(1, r.races);
  return r;
}

export function formatHarness(r: HarnessReport): string {
  return [
    `races ${r.races}`,
    `laser multi-hits ${r.laserMultiHits}, bump spam ${r.bumpSpam}, overtake spam ${r.overtakeSpam}, finish mismatches ${r.finishMismatches}`,
    `DNF by class ${r.dnf.join(' / ')}`,
    `head-on wall hits per race: max ${r.headOnMax} (${r.headOnWorst}), mean ${r.headOnMean.toFixed(2)}`,
    `progress jumps ${r.progressJumps} (worst ${r.worstJump.toFixed(2)} m), respawns per race ${r.respawnsMean.toFixed(2)}`,
  ].join('\n');
}
