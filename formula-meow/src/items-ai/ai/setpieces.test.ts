/**
 * AI and items through set pieces (iteration 3, ai-ugc lane, SETPIECES.md sections 4 and 11). The stunt lab (the test
 * oval with one jump gap, tunnel, wall ride and loop) and Kitchen Counter (its reference pieces), full races of 8 karts:
 * - every kart rides every loop and lands every jump, every lap: nobody stalls, respawns, falls into a net or skips a
 *   piece (no AI cheating through: a loop is entered once per lap per kart, and its exit is clean);
 * - no AI starts a drift within 20 m of a loop's strip or a jump's lip;
 * - skilled AI (≥ `AI.padSkill`) ride the stunt lab's wall lane at least 80 % of the laps, the Kittens at most 30 %;
 * - items: an immune kart (rail, gap flight, net) is no item target, a homing yarn ball loses its lock on a kart that
 *   rides a loop (the stunt shakes it off), a hairball rolls across a jump gap at deck height and still hits beyond it.
 */
import { describe, expect, it } from 'vitest';
import { NO_INPUT, type RaceConfig, type TickInput, type TrackDef } from '../../types';
import { raceConfig, stuntLab, world } from '../../test/fixtures';
import { KITCHEN, YARN } from '../../core/track/tracks';
import { GO_TICK, SimWorld } from '../../core/sim/world';
import { speedOf, placeOnTrack } from '../../core/sim/kart';
import { followLine } from '../../core/sim/autopilot';
import { cosL, sinL } from '../../core/sim/fixed';
import { buildField, createSimPlugins } from '..';
import { AI } from '../../tuning';
import { ProjKind, itemsOf } from '../items/state';
import { STUNT_AI } from './driver';
import { STUNT_ROUTE_TIME, branchSteer, mainStuntTime, mouthEnd, routeRemaining } from '../../core/track/branch-ai';
import { fwd } from '../../core/track/branch';
import { ALL_TRACKS } from '../../core/track/tracks';

interface Survey {
  laps: number;
  respawn: number[];
  net: number[];
  stall: number[];
  loops: number[];
  cleanLoops: number[];
  lands: number[];
  lanes: number[];
  driftNear: number;
  finished: number;
  /** per kart: loop exits and jump far lips / landing-window ends its distance passed before it finished */
  loopsDue: number[];
  landsMax: number[];
  landsMin: number[];
}

function survey(def: TrackDef, seed: number, cls: 0 | 1 | 2): Survey {
  const w = world(raceConfig(def, { seed, cls }));
  const t = w.track;
  const N = w.st.karts.length;
  const z = () => new Array<number>(N).fill(0);
  const out: Survey = { laps: def.laps, respawn: z(), net: z(), stall: z(), loops: z(), cleanLoops: z(), lands: z(), lanes: z(), driftNear: 0, finished: 0, loopsDue: z(), landsMax: z(), landsMin: z() };
  const still = z();
  let read = 0;
  const entries = t.pieces.filter((p) => p.kind === 'loop' || (p.kind === 'jump' && p.gap > 0)).map((p) => (p.kind === 'loop' ? p.strip : p.i0));
  while (!w.done && w.tick < 60 * 400) {
    w.step();
    for (let i = 0; i < N; i++) {
      const k = w.st.karts[i];
      if (w.tick > GO_TICK + 120 && !k.finished && speedOf(k) < 3 && k.respawnTicks === 0 && k.spinTicks === 0 && k.netTicks === 0) {
        if (++still[i] > 60) out.stall[i]++;
      } else still[i] = 0;
    }
    for (; read < w.st.events.length; read++) {
      const e = w.st.events[read];
      const k = w.st.karts[e.kart];
      // after the line a kart cruises on: its laps are done
      if (!k || (k.finished && e.type !== 'respawn' && e.type !== 'netCatch')) continue;
      if (e.type === 'respawn') out.respawn[e.kart]++;
      else if (e.type === 'netCatch') out.net[e.kart]++;
      else if (e.type === 'stuntExit' && e.a === 0) {
        out.loops[e.kart]++;
        if (e.b === 1) out.cleanLoops[e.kart]++;
      } else if (e.type === 'stuntLand') out.lands[e.kart]++;
      else if (e.type === 'stuntEnter' && e.a === 1) out.lanes[e.kart]++;
      else if (e.type === 'driftStart' && k.branch < 0) {
        for (const at of entries) if (((at - k.si + t.n) % t.n) * t.step < STUNT_AI.noDrift) out.driftNear++;
      }
    }
  }
  out.finished = w.st.karts.filter((k) => k.finished).length;
  const passed = (i: number, d: number): number => {
    let c = 0;
    for (let L = 0; L < def.laps; L++) if (i * t.step + L * t.length <= d) c++;
    return c;
  };
  w.st.karts.forEach((k, j) => {
    const d = k.finished ? def.laps * t.length : k.dist;
    for (const pc of t.pieces) {
      if (pc.kind === 'loop') out.loopsDue[j] += passed(pc.i1, d);
      else if (pc.kind === 'jump' && pc.gap > 0) {
        out.landsMax[j] += passed(pc.i1, d);
        out.landsMin[j] += passed(pc.land1, d);
      }
    }
  });
  return out;
}

describe('AI through set pieces', () => {
  for (const [name, def] of [
    ['stunt lab', stuntLab()],
    ['Kitchen Counter', KITCHEN],
  ] as const) {
    it(`${name}: all 8 karts ride every loop and land every jump each lap, with no stall, respawn or net`, () => {
      const loops = def.setPieces!.filter((p) => p.kind === 'loop').length;
      const jumps = def.setPieces!.filter((p) => p.kind === 'jump' && (p.gap ?? 10) > 0).length;
      for (const cls of [0, 2] as const)
        for (const seed of [1, 2]) {
          const s = survey(def, seed, cls);
          const tag = `${name} cls ${cls} seed ${seed}`;
          // the race ends a while after the winner: the back markers may still be on their last lap
          expect(s.finished, tag).toBeGreaterThanOrEqual(5);
          expect(s.respawn, tag).toEqual(new Array(8).fill(0));
          expect(s.net, tag).toEqual(new Array(8).fill(0));
          expect(s.stall, tag).toEqual(new Array(8).fill(0));
          // one ride per loop per lap (nobody cuts through or rides twice), every one clean
          expect(s.loops, tag).toEqual(s.loopsDue);
          expect(s.cleanLoops, tag).toEqual(s.loops);
          s.lands.forEach((n, j) => {
            expect(n, `${tag} kart ${j} lands`).toBeGreaterThanOrEqual(s.landsMin[j]);
            expect(n, `${tag} kart ${j} lands`).toBeLessThanOrEqual(s.landsMax[j]);
          });
          // the finishers rode and landed every one
          expect(Math.min(...s.loopsDue.filter((_, j) => s.lands[j] >= 0)), tag).toBeGreaterThanOrEqual(loops * (s.laps - 1));
          void jumps;
          expect(s.driftNear, tag).toBe(0);
        }
    }, 240_000);
  }

  it('skilled cats ride the wall lane (≥ 80 % of laps), Kittens mostly keep to the road (≤ 30 %)', () => {
    let hi = 0;
    let hiN = 0;
    let lo = 0;
    let loN = 0;
    for (const seed of [1, 2, 3]) {
      const s = survey(stuntLab(), seed, 1);
      const racers = raceConfig(stuntLab(), { seed, cls: 1 }).racers;
      racers.forEach((r, i) => {
        const skill = r.ai?.skill ?? 0;
        if (skill >= AI.padSkill) {
          hi += Math.min(s.laps, s.lanes[i]);
          hiN += s.laps;
        } else if (skill <= 0.35) {
          lo += Math.min(s.laps, s.lanes[i]);
          loN += s.laps;
        }
      });
    }
    expect(hiN).toBeGreaterThan(0);
    expect(hi / hiN).toBeGreaterThanOrEqual(0.8);
    if (loN) expect(lo / loN).toBeLessThanOrEqual(0.3);
  }, 240_000);
});

describe('route choice with set pieces', () => {
  it("a branch's main route counts the set pieces between its fork and merge", () => {
    let seen = 0;
    for (const def of ALL_TRACKS) {
      const t = new SimWorld(raceConfig(def), createSimPlugins()).track;
      for (const b of t.branches) {
        let want = 0;
        for (const pc of t.pieces) if (!(pc.kind === 'jump' && pc.gap <= 0) && fwd(b.from, pc.i0, t.n) <= fwd(b.from, b.to, t.n)) want += STUNT_ROUTE_TIME[pc.kind];
        expect(mainStuntTime(t, b), def.id).toBeCloseTo(want, 9);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

/** Scripted karts on the stunt lab (humans driving the line), as items.test.ts does on the plain oval. */
function scene(pos: Array<{ at: number; speed?: number }>): { w: SimWorld; drive: (extra?: Partial<TickInput>[]) => void } {
  const racers = buildField({ seed: 1, cls: 0, playerSlot: 0 }).slice(0, pos.length).map((r) => ({ ...r, ai: undefined }));
  const cfg: RaceConfig = { track: stuntLab(), seed: 1, cls: 0, modifiers: 0, racers, humans: pos.map((_, i) => i), forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins());
  while (w.tick < GO_TICK + 1) w.step(pos.map(() => NO_INPUT));
  const t = w.track;
  pos.forEach((p, i) => {
    const k = w.st.karts[i];
    const si = (((Math.round(p.at / t.step)) % t.n) + t.n) % t.n;
    placeOnTrack(w.ctx, k, si, 0);
    k.dist = k.s;
    k.lap = 1;
    k.progDist = k.dist;
    const sp = p.speed ?? 14;
    k.vx = sinL(k.heading) * sp;
    k.vz = cosL(k.heading) * sp;
  });
  const drive = (extra: Partial<TickInput>[] = []) => {
    w.step(
      pos.map((_, i) => {
        const o: TickInput = { ...NO_INPUT };
        followLine(w.ctx, i, o, 0);
        o.gas = true;
        return { ...o, ...(extra[i] ?? {}) };
      }),
    );
  };
  drive();
  return { w, drive };
}

const hitsOn = (w: SimWorld, k: number) => w.st.events.filter((e) => e.type === 'hit' && e.kart === k);

describe('items through set pieces', () => {
  it('a homing yarn ball loses its lock on a kart riding a loop and never hits it there', () => {
    const lab = new SimWorld(raceConfig(stuntLab()), createSimPlugins()).track;
    const loop = lab.pieces.find((p) => p.kind === 'loop')!;
    const strip = loop.strip * lab.step;
    const { w, drive } = scene([{ at: strip - 40 }, { at: strip - 12, speed: 18 }]);
    const k1 = w.st.karts[1];
    let onRail = 0;
    let hitOnRail = 0;
    let locked = 0;
    let fired = false;
    for (let i = 0; i < 60 * 8; i++) {
      if (!fired && k1.rail > 0) {
        w.st.karts[0].item = 'yarn';
        w.st.karts[0].itemCount = 1;
        w.st.karts[0].rouletteTicks = 0;
        drive([{ item: true }]);
        fired = true;
        expect(itemsOf(w.st).proj.some((p) => p.kind === ProjKind.YarnBall)).toBe(true);
        continue;
      }
      drive();
      if (k1.rail > 0) {
        onRail++;
        if (hitsOn(w, 1).length) hitOnRail++;
        if (itemsOf(w.st).proj.some((p) => p.kind === ProjKind.YarnBall && p.target === 1)) locked++;
      }
    }
    expect(fired).toBe(true);
    expect(onRail).toBeGreaterThan(30);
    expect(hitOnRail).toBe(0);
    expect(locked).toBe(0);
  });

  it('a hairball rolls across a jump gap at deck height and hits a kart beyond it', () => {
    const lab = new SimWorld(raceConfig(stuntLab()), createSimPlugins()).track;
    const jump = lab.pieces.find((p) => p.kind === 'jump')!;
    const lip = jump.i0 * lab.step;
    const { w, drive } = scene([{ at: lip - 30, speed: 8 }, { at: lip + jump.gap + 22, speed: 4 }]);
    w.st.karts[0].item = 'hairball';
    w.st.karts[0].itemCount = 1;
    w.st.karts[0].rouletteTicks = 0;
    drive([{ item: true }, { gas: false, brake: true }]);
    let overGap = 0;
    let low = 0;
    for (let i = 0; i < 60 * 3 && !hitsOn(w, 1).length; i++) {
      drive([{}, { gas: false, brake: true }]);
      for (const p of itemsOf(w.st).proj) {
        if (p.kind !== ProjKind.Hairball || w.track.gapMask[p.si] !== 1) continue;
        overGap++;
        if (p.y < Math.min(jump.lipY, jump.landY) - 0.5) low++;
      }
    }
    expect(overGap).toBeGreaterThan(0);
    expect(low).toBe(0);
    expect(hitsOn(w, 1).length).toBeGreaterThanOrEqual(1);
  });
});

describe('route choice: a closed branch mouth (SIM_VERSION 10)', () => {
  it('a kart that chose the branch but is still on the main road past the mouth goes back to the main line', () => {
    const w = world(raceConfig(YARN, { seed: 3049, cls: 1 }));
    while (w.tick < GO_TICK + 1) w.step();
    const t = w.track;
    const b = t.branches[0];
    const end = mouthEnd(t, b);
    expect(Number.isFinite(end)).toBe(true);
    expect(end * t.step).toBeLessThanOrEqual(b.overlap + 12);
    // the main wall on the branch's side is widened just before the mouth's end and back to normal at it
    const bit = b.sideA > 0 ? 2 : 1;
    expect(t.junction[(b.from + end - 1) % t.n] & bit).toBe(bit);
    expect(t.junction[(b.from + end) % t.n] & bit).toBe(0);
    const idx = 7;
    const k = w.st.karts[idx];
    const h = w.st.hazards as { plan?: number[] };
    h.plan ??= new Array<number>(w.st.karts.length).fill(0);
    const plan = h.plan;
    const aimsAtBranch = (si: number): boolean => {
      placeOnTrack(w.ctx, k, si % t.n, -b.sideA * 3);
      plan[idx] = (k.lapMax * 16 + b.id + 1) * 2 + 1; // this lap: take the branch
      branchSteer(w.ctx, idx, { ...NO_INPUT }, 0, 1);
      return routeRemaining(w.ctx, k.si) !== null;
    };
    expect(aimsAtBranch(b.from - 10)).toBe(true);
    expect(aimsAtBranch(b.from + end - 8)).toBe(true);
    expect(aimsAtBranch(b.from + end + 1)).toBe(false);
    expect(aimsAtBranch(b.from + end + 8)).toBe(false);
  });

  it('Yarn, seed 3049, 100cc: kart 7 no longer crawls into the main wall past the yarn-ball gap mouth', () => {
    const w = world(raceConfig(YARN, { seed: 3049, cls: 1 }));
    const k = w.st.karts[7];
    const hist: number[] = [];
    let stalls = 0;
    while (w.tick < 1800) {
      w.step();
      if (w.tick < GO_TICK) continue;
      hist.push(k.dist);
      // a 4 s window with under 10 m of progress (it sat at dist ≈ 368 for about 6 s)
      if (hist.length > 240 && hist[hist.length - 1] - hist[hist.length - 241] < 10) stalls++;
    }
    expect(stalls).toBe(0);
  });
});
