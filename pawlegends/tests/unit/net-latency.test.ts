// @vitest-environment happy-dom
/**
 * Party play latency pass (MULTIPLAYER.md §4.2, §4.3): the NetHost measures click-to-applied input latency from the
 * TURN acks and leads the own hero per render frame on the interpolated view (never the snapshot).
 */
import { describe, expect, it } from 'vitest';
import { NetHost, PREDICT_MAX_MS } from '../../src/net/net-host';
import { Op } from '../../src/sim/api';
import type { MatchMsg } from '../../src/net/proto';
import { mergeAcks, type CoreOut } from '../../src/net/net-core';
import type { ViewEntity, ViewFrame } from '../../src/render/interp';

const match = { t: 'match', room: 'r', config: { seed: 5, picks: ['clem', 'sage', 'lambo', 'gabe', 'pixel', 'stilts'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: ['A', 'B', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 13 } as unknown as MatchMsg;

function setup() {
  let now = 1000;
  let seq = 0;
  let fromCore: ((m: CoreOut) => void) | null = null;
  const socket = { listen: () => undefined, sendCmd: () => ++seq, sendJson: () => undefined, sendHash: () => undefined, beatNow: () => undefined, rttMs: 60, lastTurn: 0 };
  const h = new NetHost(socket as never, match, {
    visibility: false,
    now: () => now,
    planner: (_sx, _sy, tx, ty) => [{ x: tx, y: ty }],
    makeWorker: (onMsg) => {
      fromCore = onMsg as (m: CoreOut) => void;
      return { post: () => undefined, close: () => undefined };
    },
  });
  h.join();
  const turn = (lastTurn: number, ack: number) => fromCore!({ t: 'turn', lastTurn, modeMask: 0, acks: [undefined, ack], B: 1, waiting: false, holds: 0 });
  return { h, turn, tick: (ms: number) => (now += ms), get now() { return now; } };
}

const frame = (x: number, y: number, speed = 0): ViewFrame => {
  const me = { id: 1, kind: 'hero', team: 0, slot: 1, hero: 'sage', x, y, fx: x, fy: y, yaw: 0, speed, hp: 1, maxHp: 1, shield: 0, state: 'idle', facing: 0, buffs: 0 } as unknown as ViewEntity;
  return { tick: 1000, latest: {} as never, entities: [me], byId: new Map([[1, me]]), projectiles: [], zones: [] };
};

describe('NetHost latency (§4.2, §4.3)', () => {
  it('measures input latency from the acking TURN; before any sample it is RTT + 2 turns', () => {
    const t = setup();
    const first = t.h.inputLatencyMs();
    expect(first).toBeGreaterThan(60 + 2 * 66);
    expect(first).toBeLessThan(220);
    t.h.send({ op: Op.Move, x: 20_000, y: 20_000 });
    t.tick(180);
    t.turn(10, 1);
    expect(t.h.inputLatencyMs()).toBeGreaterThan(180);
    expect(t.h.inputLatencyMs()).toBeLessThan(200);
    expect(t.h.net().inputMs).toBe(Math.round(t.h.inputLatencyMs()));
    expect(t.h.inputLatencyMs()).toBeLessThanOrEqual(PREDICT_MAX_MS);
    t.h.dispose();
  });

  it('a Move leads the drawn hero on the next frame and turns it to the target; the snapshot is untouched', () => {
    const t = setup();
    t.h.send({ op: Op.Move, x: 30_000, y: 20_000 });
    const f0 = frame(20_000, 20_000);
    t.h.present(f0);
    let f = f0;
    for (let i = 0; i < 6; i++) {
      t.tick(16);
      f = frame(20_000, 20_000);
      t.h.present(f);
    }
    const me = f.byId.get(1)!;
    expect(me.fx).toBeGreaterThan(20_000 + 100);
    expect(me.fy).toBeCloseTo(20_000, 0);
    expect(me.yaw).toBeCloseTo(0, 3);
    expect(me.x).toBe(20_000);
    t.h.dispose();
  });

  it('while the lead runs ahead of a still snapshot, the drawn hero walks (speed), and its facing eases instead of snapping', () => {
    const t = setup();
    // the target is straight +y: a 90° turn from yaw 0
    t.h.send({ op: Op.Move, x: 20_000, y: 30_000 });
    t.h.present(frame(20_000, 20_000));
    t.tick(16);
    const f1 = frame(20_000, 20_000);
    t.h.present(f1);
    const y1 = f1.byId.get(1)!.yaw;
    expect(y1).toBeGreaterThan(0.05);
    expect(y1).toBeLessThan(Math.PI / 2 - 0.05);
    let f = f1;
    for (let i = 0; i < 10; i++) {
      t.tick(16);
      f = frame(20_000, 20_000);
      t.h.present(f);
    }
    const me = f.byId.get(1)!;
    expect(me.fy).toBeGreaterThan(20_000 + 100);
    expect(me.yaw).toBeCloseTo(Math.PI / 2, 1);
    // the walk cycle runs (heroView: speed × 30 / 1000 > 0.35 is 'moving')
    expect((me.speed * 30) / 1000).toBeGreaterThan(0.35);
    t.h.dispose();
  });

  it('the drawn hero faces the way its walker goes; once it stands for the latency, the interpolated yaw passes through', () => {
    const t = setup();
    t.h.send({ op: Op.Move, x: 20_500, y: 20_000 });
    for (let i = 0; i < 20; i++) {
      t.tick(16);
      const f = frame(20_000 + i * 20, 20_000, 160);
      f.byId.get(1)!.yaw = 1.2;
      t.h.present(f);
      if (i === 12) expect(f.byId.get(1)!.yaw).toBeCloseTo(0, 1);
    }
    // the walker arrived and held; the authoritative hero stands at the goal for the latency
    let f = frame(20_500, 20_000);
    for (let i = 0; i < 40; i++) {
      t.tick(16);
      f = frame(20_500, 20_000);
      f.byId.get(1)!.yaw = 1.2;
      t.h.present(f);
    }
    expect(f.byId.get(1)!.yaw).toBeCloseTo(1.2, 3);
    expect(f.byId.get(1)!.fx).toBeCloseTo(20_500, 0);
    t.h.dispose();
  });

  it('releasing the stick (Stop) holds the drawn hero instead of pulling it back', () => {
    const t = setup();
    t.h.send({ op: Op.Move, x: 40_000, y: 20_000 });
    let ax = 20_000;
    let drawn = 0;
    const frames: number[] = [];
    for (let i = 0; i < 90; i++) {
      t.tick(16);
      if (i === 40) t.h.send({ op: Op.Stop });
      // the authoritative hero starts ~200 ms after the click and stops ~200 ms after the release
      if (i >= 12 && i < 52) ax += 80;
      const f = frame(ax, 20_000, i >= 12 && i < 52 ? 160 : 0);
      t.h.present(f);
      drawn = f.byId.get(1)!.fx;
      frames.push(drawn);
    }
    let back = 0;
    for (let i = 1; i < frames.length; i++) back = Math.max(back, frames[i - 1] - frames[i]);
    expect(back).toBeLessThan(20);
    expect(Math.abs(drawn - ax)).toBeLessThan(5);
    t.h.dispose();
  });
});

describe('mergeAcks (§4.3)', () => {
  it('keeps the newest ack per slot across the turns of one pace call', () => {
    expect(mergeAcks([{ acks: [undefined, 4] }, { acks: [2, undefined] }, { acks: [undefined, undefined, 7] }])).toEqual([2, 4, 7]);
    expect(mergeAcks([{ acks: [undefined, 4] }, { acks: [undefined, 6] }])).toEqual([undefined, 6]);
  });

  it('an ack on an earlier turn of a 2-turn step still makes a clean latency sample', () => {
    const t = setup();
    t.h.send({ op: Op.Move, x: 20_000, y: 20_000 });
    t.tick(200);
    t.turn(5, 1);
    const clean = t.h.inputLatencyMs();
    t.tick(1500);
    t.h.send({ op: Op.Move, x: 25_000, y: 20_000 });
    t.tick(200);
    // the core merged [ack 2, no ack] into one status
    t.turn(9, mergeAcks([{ acks: [undefined, 2] }, { acks: [undefined, undefined] }])[1]!);
    expect(Math.abs(t.h.inputLatencyMs() - clean)).toBeLessThan(10);
    t.h.dispose();
  });
});
