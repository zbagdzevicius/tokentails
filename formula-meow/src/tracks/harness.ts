/**
 * Track harness (tracks lane acceptance, ITERATION-2.md): headless races on one track with the scripted player bot in
 * the player slot and the AI field, measuring what makes a track fair and alive: DNFs, head-on wall hits, how often
 * the AI takes each alternative route, hazard hits, respawns, progress jumps and lap times. Pure, no DOM;
 * `tracks.test.ts` asserts the targets and `FM_TRACKS_PRINT=1` prints the report.
 */
import type { RaceClass, TrackDef } from '../types';
import { DT } from '../types';
import { buildField, createSimPlugins } from '../items-ai';
import { playerBot } from '../items-ai/balance/bots';
import { buildTrack } from '../core/track/build';
import { SimWorld } from '../core/sim/world';
import { speedOf } from '../core/sim/kart';
import { branchFoot, type Foot } from '../core/track/branch';

const foot: Foot = { j: 0, along: 0, d: 0 };

export interface TrackReport {
  track: string;
  races: number;
  dnf: number;
  headOnMax: number;
  headOnMean: number;
  /** per branch id: share of AI laps that used it */
  branchUse: number[];
  /** the player bot's laps on each branch (it never plans one; it only drifts in) */
  hazardHits: number;
  hazardHitsPerRace: number;
  respawnsPerRace: number;
  progressJumps: number;
  /** mean best lap of the winner, seconds */
  bestLap: number;
  /** mean finish spread first to last, seconds */
  spread: number;
  where: string[];
  /** hazard events by HAZARD_KINDS index, and hits (wobble, leap) hazards landed */
  byKind: number[];
  hazardKnocks: number;
}

const PLAYER = 5;

export function runTrackHarness(def: TrackDef, classes: readonly RaceClass[], seeds: number, opts: { bot?: boolean } = {}): TrackReport {
  const t = buildTrack(def, 0);
  const bot = opts.bot ?? true;
  const nb = t.branches.length;
  const r: TrackReport = { track: def.id, races: 0, dnf: 0, headOnMax: 0, headOnMean: 0, branchUse: new Array(nb).fill(0), hazardHits: 0, hazardHitsPerRace: 0, respawnsPerRace: 0, progressJumps: 0, bestLap: 0, spread: 0, where: [], byKind: [0, 0, 0, 0, 0, 0], hazardKnocks: 0 };
  let aiLaps = 0;
  const used = new Array<number>(nb).fill(0);
  for (const cls of classes)
    for (let seed = 1; seed <= seeds; seed++) {
      const s = seed * 7919 + cls * 104729 + def.id.length * 31 + 17;
      const racers = buildField({ seed: s, cls, playerSlot: bot ? PLAYER : -1 });
      const cfg = { track: def, seed: s, cls, modifiers: 0, racers, humans: bot ? [PLAYER] : [], forgiving: false, tailTicks: 60 * 60 };
      const w = new SimWorld(cfg, createSimPlugins(cfg), t);
      const n = racers.length;
      // per kart: the lap it is on and the branches it touched during it (bit mask)
      const lapOf = new Int32Array(n);
      const mask = new Int32Array(n);
      const prevDist = new Float64Array(n);
      const prevSpeed = new Float64Array(n);
      const respawnedAt = new Int32Array(n).fill(-999);
      let headOn = 0;
      while (!w.done) {
        for (let i = 0; i < n; i++) {
          prevDist[i] = w.st.karts[i].dist;
          prevSpeed[i] = speedOf(w.st.karts[i]);
        }
        const before = w.st.events.length;
        w.step(bot ? [playerBot(w.ctx, PLAYER)] : []);
        for (let e = before; e < w.st.events.length; e++) {
          const ev = w.st.events[e];
          if (ev.type === 'wall' && ev.a === 2) {
            headOn++;
            const k = w.st.karts[ev.kart];
            if (r.where.length < 30) r.where.push(`${def.id} c${cls} k${ev.kart} si${k.si} b${k.branch} (${k.x.toFixed(0)},${k.z.toFixed(0)}) d${k.d.toFixed(1)}`);
          } else if (ev.type === 'hazard') {
            r.hazardHits++;
            r.byKind[ev.a ?? 0]++;
          } else if (ev.type === 'hit' && ev.b === -1) r.hazardKnocks++;
          else if (ev.type === 'respawn') {
            r.respawnsPerRace++;
            respawnedAt[ev.kart] = ev.tick;
          }
        }
        for (let i = 0; i < n; i++) {
          const k = w.st.karts[i];
          if (k.lapMax !== lapOf[i]) {
            // a lap ended: count it for the AI and credit the branches it used
            if (lapOf[i] >= 1 && racers[i].ai) {
              aiLaps++;
              for (let b = 0; b < nb; b++) if (mask[i] & (1 << b)) used[b]++;
            }
            lapOf[i] = k.lapMax;
            mask[i] = 0;
          }
          if (k.branch >= 0) {
            // count a lap as "on the branch" only past the stretch where it still overlaps the main road
            const b = t.branches.findIndex((x) => x.id === k.branch);
            if (b >= 0 && branchFoot(t.branches[b], k.x, k.z, foot) && Math.abs(foot.j - t.branches[b].m / 2) < t.branches[b].m / 6) mask[i] |= 1 << b;
          }
          if (k.finished || k.respawnTicks > 0 || w.st.tick - respawnedAt[i] < 90) continue;
          const jump = Math.abs(k.dist - prevDist[i]) - Math.max(prevSpeed[i], speedOf(k)) * DT;
          if (jump > 0.55) r.progressJumps++;
        }
      }
      const res = w.result();
      r.dnf += w.st.karts.filter((k) => !k.finished).length;
      const times = res.places.map((p) => p.time).filter((x): x is number => x != null);
      if (times.length) r.spread += Math.max(...times) - Math.min(...times);
      r.bestLap += res.places[0].bestLap ?? 0;
      r.headOnMax = Math.max(r.headOnMax, headOn);
      r.headOnMean += headOn;
      r.races++;
    }
  r.headOnMean /= Math.max(1, r.races);
  r.hazardHitsPerRace = r.hazardHits / Math.max(1, r.races);
  r.respawnsPerRace /= Math.max(1, r.races);
  r.bestLap /= Math.max(1, r.races);
  r.spread /= Math.max(1, r.races);
  r.branchUse = used.map((u) => u / Math.max(1, aiLaps));
  return r;
}

export function formatTrackReport(r: TrackReport): string {
  return [
    `${r.track}: races ${r.races}, DNF ${r.dnf}, head-on max ${r.headOnMax} mean ${r.headOnMean.toFixed(2)}, respawns/race ${r.respawnsPerRace.toFixed(2)}, jumps ${r.progressJumps}`,
    `  branch use ${r.branchUse.map((u) => (u * 100).toFixed(0) + '%').join(' ')}, hazard events/race ${r.hazardHitsPerRace.toFixed(1)} [${r.byKind.join(' ')}], knocks/race ${(r.hazardKnocks / Math.max(1, r.races)).toFixed(1)}, best lap ${r.bestLap.toFixed(1)} s, spread ${r.spread.toFixed(1)} s`,
    ...r.where.slice(0, 8).map((w) => '  ' + w),
  ].join('\n');
}
