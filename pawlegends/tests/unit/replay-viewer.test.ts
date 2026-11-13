/**
 * MATCH-MOMENTS.md §2: the replay viewer re-runs a stored record with the frozen sim. A re-run (and a re-run that
 * starts from a keyframe copy) reaches the saved end state hash; a record from another sim version or a party match
 * is refused; the loop plays at 1x/2x/4x and reports deaths for "jump to my deaths".
 */
import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, hash, replayRecord, result, step, SIM_VERSION, Op, type Command, type ReplayRecord } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from './helpers';
import { deepClone } from '../../src/replay/clone';
import { KEYFRAME_TICKS, ReplayCore, replayable } from '../../src/replay/core';
import { ReplayLoop, clampReplaySpeed, type ReplayHostMsg } from '../../src/replay/loop';
import { decodeSnap } from '../../src/host/protocol';

function playRandom(seed: number, ticks: number, map?: 'hearthwood') {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce', map);
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy', ...(map ? { map } : {}) });
  const r = new Rng(seed ^ 0x5eed);
  for (let t = 0; t < ticks && !result(m); t++) {
    const c = randomCommand(r);
    const list: Command[] = c ? [c] : [];
    step(m, list);
  }
  return m;
}

const fullRecord = (() => {
  let rec: ReplayRecord | null = null;
  return (): ReplayRecord => {
    if (!rec) {
      const m = playRandom(1, 30000);
      rec = replayRecord(m)!;
    }
    return rec;
  };
})();

const now = (): number => performance.now();

describe('deepClone (replay keyframes)', { timeout: 60_000 }, () => {
  it('a copied match steps exactly like the original (class prototypes kept)', () => {
    const m = playRandom(7, 900);
    const k = deepClone(m);
    const r = new Rng(99);
    for (let t = 0; t < 600; t++) {
      const c = randomCommand(r);
      step(m, c ? [c] : []);
      step(k, c ? [c] : []);
    }
    expect(hash(k)).toBe(hash(m));
  });
  it('keeps shared references and cycles', () => {
    const shared = { n: 1 };
    const o: { a: typeof shared; b: typeof shared; self?: unknown; arr: Int32Array; map: Map<string, number> } = { a: shared, b: shared, arr: new Int32Array([1, 2]), map: new Map([['x', 1]]) };
    o.self = o;
    const c = deepClone(o);
    expect(c.a).toBe(c.b);
    expect(c.a).not.toBe(shared);
    expect(c.self).toBe(c);
    expect(Array.from(c.arr)).toEqual([1, 2]);
    expect(c.arr).not.toBe(o.arr);
    expect(c.map.get('x')).toBe(1);
  });
});

describe('ReplayCore (determinism)', { timeout: 120_000 }, () => {
  it('a re-run reaches the saved end state hash, and so does a start from a keyframe', () => {
    const rec = fullRecord();
    const core = new ReplayCore();
    expect(core.load(rec)).toBeNull();
    while (!core.info.done) core.scoutFor(5000, 1e9, now);
    expect(core.info.ok).toBe(true);
    expect(core.info.scouted).toBe(rec.ticks);
    // a seek into the middle copies a keyframe and plays on: the same end
    const at = KEYFRAME_TICKS * 3 + 123;
    const msgs = core.start(at);
    expect(msgs[0].t).toBe('welcome');
    expect(core.tick).toBe(at);
    let end: ReplayHostMsg | undefined;
    for (let i = 0; i < 2000 && !core.ended; i++) end = core.advance(30).find((m) => m.t === 'end');
    expect(end && end.t === 'end' && end.result.finalHash).toBe(rec.finalHash);
    expect(end && end.t === 'end' && end.result.outcome).toBe(rec.outcome);
  });
  it('a 5v5 Hearthwood record re-runs to its hash from a keyframe', () => {
    const m = playRandom(3, 5500, 'hearthwood');
    // end the match early the way a player can: a forfeit from 3:00 (logged like any command)
    if (!result(m)) step(m, [{ op: Op.Forfeit }]);
    const rec = replayRecord(m)!;
    expect(rec).not.toBeNull();
    const core = new ReplayCore();
    expect(core.load(rec)).toBeNull();
    while (!core.info.done) core.scoutFor(5000, 1e9, now);
    expect(core.info.ok).toBe(true);
    core.start(Math.max(0, rec.ticks - KEYFRAME_TICKS - 10));
    let fh = '';
    for (let i = 0; i < 4000 && !core.ended; i++) for (const msg of core.advance(60)) if (msg.t === 'end') fh = msg.result.finalHash;
    expect(fh).toBe(rec.finalHash);
  });
  it('notes the player deaths in tick order', () => {
    const core = new ReplayCore();
    core.load(fullRecord());
    while (!core.info.done) core.scoutFor(5000, 1e9, now);
    const d = core.info.deaths;
    expect(d.slice().sort((a, b) => a - b)).toEqual(d);
    for (const t of d) expect(t).toBeLessThanOrEqual(core.info.total);
  });
  it('refuses a record from another sim version, a party record and a broken stream', () => {
    const rec = fullRecord();
    expect(replayable({ simVersion: SIM_VERSION - 1 })).toBe('version');
    expect(replayable({ simVersion: SIM_VERSION, party: { room: 'x' } })).toBe('party');
    expect(new ReplayCore().load({ ...rec, simVersion: SIM_VERSION + 1 })).toBe('version');
    expect(new ReplayCore().load({ ...rec, inputs: '!!!' })).toBe('decode');
  });
});

describe('ReplayLoop', { timeout: 120_000 }, () => {
  it('plays at the chosen speed, pauses, and posts welcome, snapshots, info and the end', () => {
    let t = 0;
    const timers: { fn: () => void; at: number }[] = [];
    const posted: ReplayHostMsg[] = [];
    const loop = new ReplayLoop({
      now: () => t,
      setTimer: (fn, ms) => {
        const h = { fn, at: t + ms };
        timers.push(h);
        return h;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
      post: (m) => posted.push(m),
    });
    const run = (ms: number): void => {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const h = timers[0];
        if (!h || h.at > end) break;
        timers.shift();
        t = Math.max(t, h.at);
        h.fn();
      }
      t = end;
    };
    const rec = fullRecord();
    loop.handle({ t: 'r:load', record: rec, speed: 4 });
    expect(posted[0].t).toBe('welcome');
    expect(posted[1].t).toBe('snap');
    expect(posted.some((m) => m.t === 'r:info')).toBe(true);
    // paused until the session's countdown ends: no new snapshots
    run(500);
    expect(posted.filter((m) => m.t === 'snap')).toHaveLength(1);
    loop.handle({ t: 'r:pause', paused: false });
    run(1000);
    const snaps = posted.filter((m): m is Extract<ReplayHostMsg, { t: 'snap' }> => m.t === 'snap');
    const tick = decodeSnap(snaps[snaps.length - 1].buf).clock.tick;
    // 4x: about 120 ticks a second
    expect(tick).toBeGreaterThan(100);
    expect(tick).toBeLessThan(140);
    loop.handle({ t: 'r:pause', paused: true });
    const n = posted.length;
    run(300);
    expect(posted.slice(n).some((m) => m.t === 'snap')).toBe(false);
    expect(clampReplaySpeed(3)).toBe(1);
    expect(clampReplaySpeed(2)).toBe(2);
  });
  it('a load for another sim version answers r:error', () => {
    const posted: ReplayHostMsg[] = [];
    const loop = new ReplayLoop({ now: () => 0, setTimer: () => 0, clearTimer: () => undefined, post: (m) => posted.push(m) });
    loop.handle({ t: 'r:load', record: { ...fullRecord(), simVersion: 1 } });
    expect(posted).toEqual([{ t: 'r:error', why: 'version' }]);
  });
});
